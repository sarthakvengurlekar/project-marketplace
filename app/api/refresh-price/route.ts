import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const EXCHANGE_STALE_MS = 24 * 60 * 60 * 1000
const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

// ─── Exchange rates ───────────────────────────────────────────────────────────

interface ExchangeRow {
  currency_pair: string
  rate: number
  last_fetched: string
}

async function getExchangeRates(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{ USD_INR: number; USD_AED: number }> {
  const pairs = ['USD_INR', 'USD_AED'] as const
  const now = Date.now()

  const { data: rows } = await supabase
    .from('exchange_rates')
    .select('currency_pair, rate, last_fetched')
    .in('currency_pair', pairs)

  const cached: Partial<Record<string, ExchangeRow>> = {}
  for (const row of rows ?? []) cached[row.currency_pair] = row

  const apiKey = process.env.EXCHANGE_RATE_API_KEY?.trim()
  const stale = pairs.filter(p => {
    const row = cached[p]
    if (!row) return true
    return now - new Date(row.last_fetched).getTime() > EXCHANGE_STALE_MS
  })

  if (stale.length > 0 && apiKey) {
    await Promise.allSettled(
      stale.map(async (pair) => {
        const [, target] = pair.split('_')
        try {
          const res = await fetch(
            `https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/${target}`,
            { next: { revalidate: 0 } }
          )
          if (!res.ok) return
          const json = await res.json()
          const rate: number = json.conversion_rate
          if (!rate) return
          const upsertRow = { currency_pair: pair, rate, last_fetched: new Date().toISOString() }
          await supabase.from('exchange_rates').upsert(upsertRow, { onConflict: 'currency_pair' })
          cached[pair] = upsertRow
        } catch {
          // leave cached value in place
        }
      })
    )
  }

  return {
    USD_INR: cached['USD_INR']?.rate ?? 83.5,
    USD_AED: cached['USD_AED']?.rate ?? 3.67,
  }
}

// ─── TCG API fallback price extraction ───────────────────────────────────────

function extractTcgPrice(tcgplayer: Record<string, unknown> | undefined): number | null {
  if (!tcgplayer) return null
  const prices = tcgplayer.prices as Record<string, Record<string, number>> | undefined
  if (!prices) return null
  const priority = ['normal', 'holofoil', 'reverseHolofoil', 'unlimited'] as const
  for (const tier of priority) {
    const market = prices[tier]?.market
    if (typeof market === 'number' && market > 0) return market
  }
  return null
}

// ─── PPT blocked-state key in exchange_rates ─────────────────────────────────
const PPT_BLOCK_KEY = 'PPT_BLOCKED_UNTIL'

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get('card_id')
  if (!cardId) {
    return NextResponse.json({ error: 'card_id required' }, { status: 400 })
  }

  const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()

  const supabase = await createSupabaseServerClient()
  const lastFetched = new Date().toISOString()

  // ── Step 1: try PokemonPriceTracker (skip if currently blocked) ──────────────
  let usdPrice: number | null = null

  if (pptKey) {
    // Check persistent PPT block stored in exchange_rates
    const { data: blockRow } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('currency_pair', PPT_BLOCK_KEY)
      .maybeSingle()

    const pptBlockedUntil = blockRow?.rate ?? 0
    const pptBlocked = Date.now() < pptBlockedUntil

    if (pptBlocked) {
      const remainMins = Math.ceil((pptBlockedUntil - Date.now()) / 60_000)
      console.log(`[refresh-price] PPT still blocked for ~${remainMins} min — skipping`)
    } else {
      const pptUrl = `${PPT_BASE}/cards?tcgPlayerId=${encodeURIComponent(cardId)}`
      try {
        const pptRes = await fetch(pptUrl, {
          headers: { Authorization: `Bearer ${pptKey}` },
          cache: 'no-store',
        })
        if (pptRes.ok) {
          const pptJson = await pptRes.json()
          const market = pptJson?.data?.prices?.market
          if (typeof market === 'number' && market > 0) usdPrice = market
        } else if (pptRes.status === 403 || pptRes.status === 429) {
          // Parse retryAfter (PPT returns it in seconds)
          let bodyText = ''
          try { bodyText = await pptRes.text() } catch { /* ignore */ }
          let retryAfterSec = 3600 // default: 1 hour
          try {
            const body = JSON.parse(bodyText)
            if (typeof body?.retryAfter === 'number' && body.retryAfter > 0) {
              retryAfterSec = body.retryAfter
            }
          } catch { /* ignore */ }
          // Enforce a minimum 10-minute cooldown so we don't thrash on short blocks
          const cooldownMs = Math.max(retryAfterSec * 1000, 10 * 60 * 1000)
          const blockedUntil = Date.now() + cooldownMs
          await supabase.from('exchange_rates').upsert(
            { currency_pair: PPT_BLOCK_KEY, rate: blockedUntil, last_fetched: new Date().toISOString() },
            { onConflict: 'currency_pair' }
          )
          console.warn(`[refresh-price] PPT blocked (${pptRes.status}) — stored cooldown for ${Math.round(cooldownMs / 60_000)} min`)
        }
      } catch (err) {
        console.warn('[refresh-price] PPT fetch error:', err)
      }
    }
  }

  // ── Step 2: fall back to Pokemon TCG API if PPT had no price ─────────────────
  if (usdPrice === null) {
    const tcgKey = process.env.NEXT_PUBLIC_POKEMON_TCG_API_KEY?.trim()
    const headers: Record<string, string> = tcgKey ? { 'X-Api-Key': tcgKey } : {}

    // For numeric IDs (TCGPlayer IDs), the TCG API needs a name-based search.
    // Look up card metadata from DB first.
    const isNumericId = /^\d+$/.test(cardId)

    if (!isNumericId) {
      // Alphanumeric ID — direct lookup works
      try {
        const res = await fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardId)}`, { headers, next: { revalidate: 0 } })
        if (res.ok) {
          const { data: card } = await res.json()
          usdPrice = extractTcgPrice(card?.tcgplayer)
        }
      } catch { /* ignore */ }
    }

    // Numeric ID or direct lookup missed — search by name + number
    if (usdPrice === null) {
      try {
        const { data: meta } = await supabase
          .from('cards')
          .select('name, card_number')
          .eq('id', cardId)
          .maybeSingle()

        if (meta?.name) {
          // Strip the "/total" from card number (e.g. "037/217" → "037")
          const num = meta.card_number?.split('/')?.[0]?.replace(/^0+/, '') ?? ''
          const q = num
            ? `name:"${meta.name}" number:${num}`
            : `name:"${meta.name}"`

          const res = await fetch(
            `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=8&orderBy=-set.releaseDate`,
            { headers, next: { revalidate: 0 } }
          )
          if (res.ok) {
            const { data: cards } = await res.json()
            for (const card of (cards ?? [])) {
              const p = extractTcgPrice(card?.tcgplayer)
              if (p != null) { usdPrice = p; break }
            }
          }
        }
      } catch { /* ignore */ }
    }
  }

  // ── Step 3: fall back to existing DB price rather than wiping it with null ────
  const rates = await getExchangeRates(supabase)

  if (usdPrice === null) {
    // Both APIs failed — return whatever is already stored; bump last_fetched so
    // we don't spam the APIs again for 24 h, but only if a price exists.
    const { data: existing } = await supabase
      .from('card_prices')
      .select('usd_price, inr_price, aed_price')
      .eq('card_id', cardId)
      .maybeSingle()

    if (existing?.usd_price != null) {
      // Bump timestamp to suppress re-attempts for 24 h; keep existing values.
      await supabase.from('card_prices').upsert(
        { card_id: cardId, usd_price: existing.usd_price, inr_price: existing.inr_price, aed_price: existing.aed_price, last_fetched: lastFetched },
        { onConflict: 'card_id' }
      )
      return NextResponse.json({ card_id: cardId, usd_price: existing.usd_price, inr_price: existing.inr_price, aed_price: existing.aed_price, last_fetched: lastFetched })
    }

    // No existing price either — store null so we stop retrying for 24 h.
    await supabase.from('card_prices').upsert(
      { card_id: cardId, usd_price: null, inr_price: null, aed_price: null, last_fetched: lastFetched },
      { onConflict: 'card_id' }
    )
    return NextResponse.json({ card_id: cardId, usd_price: null, inr_price: null, aed_price: null, last_fetched: lastFetched })
  }

  // ── Step 4: we have a fresh price — compute local and upsert ─────────────────
  const inrPrice = Math.round(usdPrice * rates.USD_INR)
  const aedPrice = Math.round(usdPrice * rates.USD_AED * 100) / 100

  const { error: upsertError } = await supabase.from('card_prices').upsert(
    { card_id: cardId, usd_price: usdPrice, inr_price: inrPrice, aed_price: aedPrice, last_fetched: lastFetched },
    { onConflict: 'card_id' }
  )
  if (upsertError) {
    console.error('[refresh-price] card_prices upsert error:', upsertError)
  }

  // Phase 3: write one row per day into card_price_daily (upsert — safe to call repeatedly)
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('card_price_daily').upsert(
    { card_id: cardId, price_date: today, usd_price: usdPrice },
    { onConflict: 'card_id,price_date' }
  )

  return NextResponse.json({ card_id: cardId, usd_price: usdPrice, inr_price: inrPrice, aed_price: aedPrice, last_fetched: lastFetched })
}

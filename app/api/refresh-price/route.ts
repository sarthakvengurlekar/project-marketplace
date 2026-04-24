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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get('card_id')
  if (!cardId) {
    return NextResponse.json({ error: 'card_id required' }, { status: 400 })
  }

  const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
  if (!pptKey) {
    console.warn('[refresh-price] POKEMON_PRICE_TRACKER_API_KEY is not set — falling back to TCG API only')
  }

  const supabase = await createSupabaseServerClient()
  const lastFetched = new Date().toISOString()

  // ── Step 1: try PokemonPriceTracker ──────────────────────────────────────────
  let usdPrice: number | null = null

  if (pptKey) {
    const pptUrl = `${PPT_BASE}/cards?tcgPlayerId=${encodeURIComponent(cardId)}`
    console.log('[refresh-price] PPT URL:', pptUrl)
    try {
      const pptRes = await fetch(pptUrl, {
        headers: { Authorization: `Bearer ${pptKey}` },
        cache: 'no-store',
      })
      console.log('[refresh-price] PPT status:', pptRes.status)
      if (pptRes.ok) {
        const pptJson = await pptRes.json()
        console.log('[refresh-price] PPT raw response:', JSON.stringify(pptJson, null, 2))
        // API returns data as a single object, not an array
        const market = pptJson?.data?.prices?.market
        console.log('[refresh-price] PPT market price:', market)
        if (typeof market === 'number' && market > 0) {
          usdPrice = market
        }
      } else {
        const errBody = await pptRes.text().catch(() => '')
        console.warn(`[refresh-price] PPT API returned ${pptRes.status}:`, errBody)
      }
    } catch (err) {
      console.warn('[refresh-price] PPT fetch error:', err)
    }
  }

  // ── Step 2: fall back to Pokemon TCG API if PPT had no price ─────────────────
  if (usdPrice === null) {
    const tcgKey = process.env.NEXT_PUBLIC_POKEMON_TCG_API_KEY?.trim()
    try {
      const tcgRes = await fetch(
        `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardId)}`,
        {
          headers: tcgKey ? { 'X-Api-Key': tcgKey } : {},
          next: { revalidate: 0 },
        }
      )
      if (tcgRes.ok) {
        const { data: card } = await tcgRes.json()
        usdPrice = extractTcgPrice(card?.tcgplayer)
      } else {
        console.warn(`[refresh-price] TCG API returned ${tcgRes.status} for ${cardId}`)
      }
    } catch (err) {
      console.warn('[refresh-price] TCG fetch error:', err)
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

  return NextResponse.json({ card_id: cardId, usd_price: usdPrice, inr_price: inrPrice, aed_price: aedPrice, last_fetched: lastFetched })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const EXCHANGE_STALE_MS = 24 * 60 * 60 * 1000
const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'
const PPT_BLOCK_KEY = 'PPT_BLOCKED_UNTIL'
const PPT_MIN_COOLDOWN_MS = 10 * 60 * 1000

type PriceSource = 'ppt' | 'tcg_direct' | 'tcg_search' | 'existing_cache' | 'daily_cache' | 'unavailable'

async function createPriceCacheClient(): Promise<SupabaseClient> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }

  return await createSupabaseServerClient() as unknown as SupabaseClient
}

// ─── Exchange rates ───────────────────────────────────────────────────────────

interface ExchangeRow {
  currency_pair: string
  rate: number
  last_fetched: string
}

async function getExchangeRates(
  supabase: SupabaseClient
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

function extractPptMarketPrice(json: unknown): number | null {
  const root = json as { data?: unknown; cards?: unknown; prices?: { market?: unknown } }
  const candidates = Array.isArray(json)
    ? json
    : Array.isArray(root.data)
      ? root.data
      : root.data
        ? [root.data]
        : Array.isArray(root.cards)
          ? root.cards
          : [root]

  for (const candidate of candidates) {
    const market = (candidate as { prices?: { market?: unknown } })?.prices?.market
    if (typeof market === 'number' && market > 0) return market
  }

  return null
}

async function getPptBlockedUntil(supabase: SupabaseClient): Promise<number> {
  const { data: blockRow } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('currency_pair', PPT_BLOCK_KEY)
    .maybeSingle()

  return blockRow?.rate ?? 0
}

async function storePptCooldown(supabase: SupabaseClient, response: Response): Promise<void> {
  let retryAfterSec = 3600
  try {
    const body = await response.json()
    if (typeof body?.retryAfter === 'number' && body.retryAfter > 0) retryAfterSec = body.retryAfter
  } catch {
    const retryAfter = Number(response.headers.get('retry-after'))
    if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterSec = retryAfter
  }

  const cooldownMs = Math.max(retryAfterSec * 1000, PPT_MIN_COOLDOWN_MS)
  await supabase.from('exchange_rates').upsert(
    { currency_pair: PPT_BLOCK_KEY, rate: Date.now() + cooldownMs, last_fetched: new Date().toISOString() },
    { onConflict: 'currency_pair' }
  )
  console.warn(`[refresh-price] PPT blocked (${response.status}) - cooldown stored for ${Math.round(cooldownMs / 60_000)} min`)
}

async function resolvePptCardId(
  cardId: string,
  supabase: SupabaseClient,
  pptKey: string,
): Promise<string> {
  if (/^\d+$/.test(cardId)) return cardId

  const { data: row } = await supabase
    .from('cards')
    .select('tcgplayer_id, name, set_name')
    .eq('id', cardId)
    .maybeSingle()

  if (row?.tcgplayer_id) return String(row.tcgplayer_id)
  if (!row?.name) return cardId

  const searchUrl = `${PPT_BASE}/cards?search=${encodeURIComponent(row.name)}&limit=10`
  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${pptKey}` },
    cache: 'no-store',
  }).catch(() => null)

  if (!res?.ok) {
    if (res && (res.status === 403 || res.status === 429)) await storePptCooldown(supabase, res)
    return cardId
  }

  const json = await res.json().catch(() => null)
  const results = (Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : []) as Array<{
    tcgPlayerId?: string | number
    name?: string
    setName?: string
  }>

  const nameLower = row.name.toLowerCase()
  const setLower = (row.set_name ?? '').toLowerCase()
  let best: (typeof results)[number] | null = null

  for (const item of results) {
    if ((item.name ?? '').toLowerCase() !== nameLower) continue
    if (!best) {
      best = item
      continue
    }

    const itemSet = (item.setName ?? '').toLowerCase()
    const bestSet = (best.setName ?? '').toLowerCase()
    const itemMatchesSet = itemSet.includes(setLower) || setLower.includes(itemSet)
    const bestMatchesSet = bestSet.includes(setLower) || setLower.includes(bestSet)
    if (itemMatchesSet && !bestMatchesSet) best = item
  }

  if (!best?.tcgPlayerId) return cardId

  const tcgPlayerId = String(best.tcgPlayerId)
  await supabase
    .from('cards')
    .update({ tcgplayer_id: tcgPlayerId })
    .eq('id', cardId)

  return tcgPlayerId
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get('card_id')
  if (!cardId) {
    return NextResponse.json({ error: 'card_id required' }, { status: 400 })
  }

  const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()

  const supabase = await createPriceCacheClient()
  const lastFetched = new Date().toISOString()
  const today = lastFetched.slice(0, 10)

  // ── Step 1: try PokemonPriceTracker live, matching the card-detail page ──────
  let usdPrice: number | null = null
  let source: PriceSource = 'unavailable'
  let reason = 'no provider price found'
  let providerCardId = cardId

  if (pptKey) {
    const pptBlockedUntil = await getPptBlockedUntil(supabase)
    if (Date.now() < pptBlockedUntil) {
      const remainMins = Math.ceil((pptBlockedUntil - Date.now()) / 60_000)
      reason = `ppt blocked for ~${remainMins} min`
      console.warn(`[refresh-price] card_id=${cardId} skipped PPT: ${reason}`)
    } else {
      const pptCardId = await resolvePptCardId(cardId, supabase, pptKey)
      providerCardId = pptCardId
      const pptUrl = `${PPT_BASE}/cards?tcgPlayerId=${encodeURIComponent(pptCardId)}`
      try {
        const pptRes = await fetch(pptUrl, {
          headers: { Authorization: `Bearer ${pptKey}` },
          cache: 'no-store',
        })
        if (pptRes.ok) {
          const pptJson = await pptRes.json()
          usdPrice = extractPptMarketPrice(pptJson)
          if (usdPrice === null) {
            reason = 'ppt returned no market price'
            console.warn(`[refresh-price] card_id=${cardId} ppt_id=${pptCardId}: ${reason}`)
          } else {
            source = 'ppt'
            reason = 'fresh PPT market price'
          }
        } else if (pptRes.status === 403 || pptRes.status === 429) {
          reason = `ppt rate-limited ${pptRes.status}`
          await storePptCooldown(supabase, pptRes)
        } else {
          reason = `ppt request failed ${pptRes.status}`
          console.warn(`[refresh-price] card_id=${cardId} ppt_id=${pptCardId}: ${reason}`)
        }
      } catch (err) {
        reason = 'ppt fetch threw'
        console.warn('[refresh-price] PPT fetch error:', err)
      }
    }
  } else {
    reason = 'PPT API key missing'
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
          if (usdPrice != null) {
            source = 'tcg_direct'
            reason = 'fresh Pokemon TCG direct price'
          }
        }
      } catch {
        if (source === 'unavailable') reason = 'pokemon tcg direct fetch threw'
      }
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
              if (p != null) {
                usdPrice = p
                source = 'tcg_search'
                reason = 'fresh Pokemon TCG search price'
                break
              }
            }
          }
        } else if (source === 'unavailable') {
          reason = 'card metadata missing for TCG search'
        }
      } catch {
        if (source === 'unavailable') reason = 'pokemon tcg search fetch threw'
      }
    }
  }

  // ── Step 3: fall back to existing DB price rather than wiping it with null ────
  const rates = await getExchangeRates(supabase)

  if (usdPrice === null) {
    // Both APIs failed — return whatever is already stored, but do not mark stale
    // fallback data as freshly fetched. That was hiding cards that needed a real
    // live refresh on the next binder open.
    const { data: existing } = await supabase
      .from('card_prices')
      .select('usd_price, inr_price, aed_price, last_fetched')
      .eq('card_id', cardId)
      .maybeSingle()

    if (existing?.usd_price != null) {
      console.warn(`[refresh-price] card_id=${cardId} source=existing_cache usd=${existing.usd_price} reason="${reason}"`)
      return NextResponse.json({
        card_id: cardId,
        provider_card_id: providerCardId,
        usd_price: existing.usd_price,
        inr_price: existing.inr_price,
        aed_price: existing.aed_price,
        last_fetched: existing.last_fetched,
        source: 'existing_cache' satisfies PriceSource,
        reason,
      })
    }

    const { data: dailyPrice } = await supabase
      .from('card_price_daily')
      .select('usd_price, price_date')
      .eq('card_id', cardId)
      .not('usd_price', 'is', null)
      .order('price_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (dailyPrice?.usd_price != null) {
      const inrPrice = Math.round(dailyPrice.usd_price * rates.USD_INR)
      const aedPrice = Math.round(dailyPrice.usd_price * rates.USD_AED * 100) / 100

      await supabase.from('card_prices').upsert(
        { card_id: cardId, usd_price: dailyPrice.usd_price, inr_price: inrPrice, aed_price: aedPrice, last_fetched: lastFetched },
        { onConflict: 'card_id' }
      )

      console.warn(`[refresh-price] card_id=${cardId} source=daily_cache usd=${dailyPrice.usd_price} date=${dailyPrice.price_date} reason="${reason}"`)
      return NextResponse.json({
        card_id: cardId,
        provider_card_id: providerCardId,
        usd_price: dailyPrice.usd_price,
        inr_price: inrPrice,
        aed_price: aedPrice,
        last_fetched: lastFetched,
        source: 'daily_cache' satisfies PriceSource,
        reason,
      })
    }

    console.warn(`[refresh-price] card_id=${cardId} source=unavailable reason="${reason}"`)
    return NextResponse.json({
      card_id: cardId,
      provider_card_id: providerCardId,
      usd_price: null,
      inr_price: null,
      aed_price: null,
      last_fetched: null,
      source: 'unavailable' satisfies PriceSource,
      reason,
    })
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
    return NextResponse.json(
      { error: 'card_prices upsert failed', detail: upsertError.message, card_id: cardId, provider_card_id: providerCardId, source, reason },
      { status: 500 },
    )
  }

  // Phase 3: write one row per day into card_price_daily (upsert — safe to call repeatedly)
  const { error: dailyError } = await supabase.from('card_price_daily').upsert(
    { card_id: cardId, price_date: today, usd_price: usdPrice },
    { onConflict: 'card_id,price_date' }
  )
  if (dailyError) {
    console.warn('[refresh-price] card_price_daily upsert error:', dailyError.message)
  }

  console.log(`[refresh-price] card_id=${cardId} provider_id=${providerCardId} source=${source} usd=${usdPrice}`)
  return NextResponse.json({
    card_id: cardId,
    provider_card_id: providerCardId,
    usd_price: usdPrice,
    inr_price: inrPrice,
    aed_price: aedPrice,
    last_fetched: lastFetched,
    source,
    reason,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const EXCHANGE_STALE_MS = 24 * 60 * 60 * 1000

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

  // Load whatever is cached
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

  // Fetch fresh rates for stale/missing pairs
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

          const upsertRow = {
            currency_pair: pair,
            rate,
            last_fetched: new Date().toISOString(),
          }
          await supabase
            .from('exchange_rates')
            .upsert(upsertRow, { onConflict: 'currency_pair' })

          cached[pair] = upsertRow
        } catch {
          // leave cached value in place if fetch fails
        }
      })
    )
  }

  // Fall back to hardcoded approximate rates if still missing
  return {
    USD_INR: cached['USD_INR']?.rate ?? 83.5,
    USD_AED: cached['USD_AED']?.rate ?? 3.67,
  }
}

// ─── Card price extraction ────────────────────────────────────────────────────

function extractUsdPrice(tcgplayer: Record<string, unknown> | undefined): number | null {
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

  const supabase = await createSupabaseServerClient()
  const lastFetched = new Date().toISOString()

  // Run exchange-rate refresh and TCG fetch concurrently
  const [rates, tcgRes] = await Promise.all([
    getExchangeRates(supabase),
    fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardId)}`, {
      headers: process.env.POKEMON_TCG_API_KEY?.trim()
        ? { 'X-Api-Key': process.env.POKEMON_TCG_API_KEY.trim() }
        : {},
      next: { revalidate: 0 },
    }),
  ])

  // TCG fetch failed — upsert null prices so the row exists and the app doesn't crash
  if (!tcgRes.ok) {
    console.error(`[refresh-price] TCG API returned ${tcgRes.status} for card ${cardId}`)
    await supabase.from('card_prices').upsert(
      { card_id: cardId, usd_price: null, inr_price: null, aed_price: null, last_fetched: lastFetched },
      { onConflict: 'card_id' }
    )
    return NextResponse.json({ card_id: cardId, usd_price: null, inr_price: null, aed_price: null, last_fetched: lastFetched })
  }

  const { data: card } = await tcgRes.json()
  const usdPrice = extractUsdPrice(card?.tcgplayer)

  const inrPrice = usdPrice != null ? Math.round(usdPrice * rates.USD_INR) : null
  const aedPrice = usdPrice != null ? Math.round(usdPrice * rates.USD_AED * 100) / 100 : null

  const { error: upsertError } = await supabase.from('card_prices').upsert(
    {
      card_id: cardId,
      usd_price: usdPrice,
      inr_price: inrPrice,
      aed_price: aedPrice,
      last_fetched: lastFetched,
    },
    { onConflict: 'card_id' }
  )

  if (upsertError) {
    console.error('[refresh-price] card_prices upsert error:', upsertError)
    // Still return the prices even if DB write failed
  }

  return NextResponse.json({ card_id: cardId, usd_price: usdPrice, inr_price: inrPrice, aed_price: aedPrice, last_fetched: lastFetched })
}

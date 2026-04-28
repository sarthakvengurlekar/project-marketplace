import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Run this in Supabase SQL Editor if not already done:
// ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS tcgplayer_id text;

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

// ─── Exported types ────────────────────────────────────────────────────────────

export interface HistoryPoint {
  date: string
  price: number   // USD market price
  volume: number
}

export interface ConditionPrice {
  condition: string  // e.g. "Near Mint Holofoil"
  usd: number
}

export interface GradeEntry {
  grade: string        // key e.g. "psa10"
  label: string        // display e.g. "PSA 10"
  smartPrice: number
  avgPrice: number
  count: number
  avg7Day: number | null
}

export interface PriceInfo {
  market: number | null
  low: number | null
  inr: number | null
  aed: number | null
  lastFetched: string
}

export interface CardDetailResponse {
  price: PriceInfo | null
  history: HistoryPoint[]
  conditions: ConditionPrice[]
  grades: GradeEntry[]
  rates: { USD_INR: number; USD_AED: number }
}

// ─── Grade config ─────────────────────────────────────────────────────────────

const GRADE_CONFIG = [
  { key: 'psa10',    label: 'PSA 10' },
  { key: 'psa9',     label: 'PSA 9' },
  { key: 'bgs10',    label: 'BGS 10' },
  { key: 'cgc10',    label: 'CGC 10' },
  { key: 'ungraded', label: 'Ungraded eBay' },
] as const

// ─── Resolve tcgPlayerId from a potentially non-numeric card ID ───────────────

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function resolveTcgPlayerId(
  cardId: string,
  sb: SupabaseClient,
  pptKey: string,
): Promise<string | null> {
  // Numeric IDs are already tcgPlayerId
  if (/^\d+$/.test(cardId)) return cardId

  // Check Supabase cache
  const { data: row } = await sb
    .from('cards')
    .select('tcgplayer_id, name, set_name')
    .eq('id', cardId)
    .maybeSingle()

  if (row?.tcgplayer_id) {
    console.log('[card-detail] resolved tcgPlayerId from cache:', row.tcgplayer_id)
    return String(row.tcgplayer_id)
  }

  if (!row?.name) {
    console.warn('[card-detail] card not found in Supabase for id:', cardId)
    return null
  }

  // Search PPT by card name
  const searchUrl = `${PPT_BASE}/cards?search=${encodeURIComponent(row.name)}&limit=10`
  console.log('[card-detail] searching PPT for tcgPlayerId:', searchUrl)

  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${pptKey}` },
    cache: 'no-store',
  }).catch(() => null)

  if (!res?.ok) {
    console.warn('[card-detail] PPT search failed:', res?.status)
    return null
  }

  const json = await res.json().catch(() => null)
  console.log('[card-detail] PPT search response:', JSON.stringify(json, null, 2))

  // PPT search returns an array in data
  const results: { tcgPlayerId?: string; name?: string; setName?: string }[] =
    Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : []

  const nameLower = row.name.toLowerCase()
  const setLower  = (row.set_name ?? '').toLowerCase()

  // Find best match: exact name first, then prefer set match
  let best: (typeof results)[number] | null = null
  for (const item of results) {
    if ((item.name ?? '').toLowerCase() === nameLower) {
      const itemSet = (item.setName ?? '').toLowerCase()
      if (!best) { best = item; continue }
      // Prefer if set name also matches
      const prevSet = (best.setName ?? '').toLowerCase()
      const newMatchesSet  = itemSet.includes(setLower) || setLower.includes(itemSet)
      const prevMatchesSet = prevSet.includes(setLower) || setLower.includes(prevSet)
      if (newMatchesSet && !prevMatchesSet) best = item
    }
  }

  if (!best?.tcgPlayerId) {
    console.warn('[card-detail] no PPT match found for:', row.name)
    return null
  }

  const tcgId = String(best.tcgPlayerId)
  console.log('[card-detail] resolved tcgPlayerId via search:', tcgId, 'matched:', best.name, best.setName)

  // Cache back into cards table (best-effort — column may not exist yet)
  const { error: cacheErr } = await sb
    .from('cards')
    .update({ tcgplayer_id: tcgId })
    .eq('id', cardId)
  if (cacheErr) {
    console.warn('[card-detail] could not cache tcgplayer_id (run ALTER TABLE if column is missing):', cacheErr.message)
  }

  return tcgId
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get('card_id')
  if (!cardId) return NextResponse.json({ error: 'card_id required' }, { status: 400 })

  const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
  if (!pptKey) {
    return NextResponse.json({ error: 'PPT API key not configured' }, { status: 500 })
  }

  const sb = await createSupabaseServerClient()

  // Resolve to a numeric tcgPlayerId before making PPT calls
  const ratesQuery = sb.from('exchange_rates')
    .select('currency_pair, rate')
    .in('currency_pair', ['USD_INR', 'USD_AED'])

  const [tcgPlayerId, ratesRes] = await Promise.all([
    resolveTcgPlayerId(cardId, sb, pptKey),
    ratesQuery,
  ])
  const ratesResult: { currency_pair: string; rate: number }[] = ratesRes.data ?? []

  const USD_INR = ratesResult.find(r => r.currency_pair === 'USD_INR')?.rate ?? 83.5
  const USD_AED = ratesResult.find(r => r.currency_pair === 'USD_AED')?.rate ?? 3.67

  // If we couldn't resolve a tcgPlayerId, return empty shell
  if (!tcgPlayerId) {
    console.warn('[card-detail] could not resolve tcgPlayerId for:', cardId)
    return NextResponse.json({
      price: null, history: [], conditions: [], grades: [],
      rates: { USD_INR, USD_AED },
    } satisfies CardDetailResponse)
  }

  const auth = { Authorization: `Bearer ${pptKey}` }
  const base = `${PPT_BASE}/cards?tcgPlayerId=${encodeURIComponent(tcgPlayerId)}`

  const [priceRes, histRes, psaRes] = await Promise.all([
    fetch(base, { headers: auth, cache: 'no-store' }).catch(() => null),
    fetch(`${base}&includeHistory=true&days=30`, { headers: auth, cache: 'no-store' }).catch(() => null),
    fetch(`${base}&includeEbay=true`, { headers: auth, cache: 'no-store' }).catch(() => null),
  ])

  // ── Call 1: basic price + variants ──────────────────────────────────────────
  let price: PriceInfo | null = null
  const conditions: ConditionPrice[] = []

  if (priceRes?.ok) {
    const json = await priceRes.json().catch(() => null)
    console.log('[card-detail] CALL 1:', JSON.stringify(json, null, 2))
    const d = json?.data
    const market = typeof d?.prices?.market === 'number' ? (d.prices.market as number) : null
    if (market != null) {
      const fetchedAt = new Date().toISOString()
      price = {
        market,
        low: typeof d.prices.low === 'number' ? d.prices.low : null,
        inr: Math.round(market * USD_INR),
        aed: Math.round(market * USD_AED * 100) / 100,
        lastFetched: fetchedAt,
      }
      await Promise.allSettled([
        sb.from('card_prices').upsert(
          {
            card_id: cardId,
            usd_price: market,
            inr_price: price.inr,
            aed_price: price.aed,
            last_fetched: fetchedAt,
          },
          { onConflict: 'card_id' },
        ),
        sb.from('card_price_daily').upsert(
          { card_id: cardId, price_date: fetchedAt.slice(0, 10), usd_price: market },
          { onConflict: 'card_id,price_date' },
        ),
      ])
    }
    const variants = d?.prices?.variants as Record<string, Record<string, { price?: number }>> | undefined
    if (variants) {
      for (const [variantName, condMap] of Object.entries(variants)) {
        for (const [condName, condData] of Object.entries(condMap)) {
          const p = typeof condData?.price === 'number' ? condData.price : null
          if (p != null && p > 0) conditions.push({ condition: `${condName} ${variantName}`, usd: p })
        }
      }
      conditions.sort((a, b) => b.usd - a.usd)
    }
    console.log('[card-detail] price:', price, '| condition variants:', conditions.length)
  } else {
    console.error('[card-detail] CALL 1 failed:', priceRes?.status)
  }

  // ── Call 2: price history (Near Mint) ────────────────────────────────────────
  let history: HistoryPoint[] = []

  if (histRes?.ok) {
    const json = await histRes.json().catch(() => null)
    console.log('[card-detail] CALL 2:', JSON.stringify(json, null, 2))
    const condMap = json?.data?.priceHistory?.conditions as
      Record<string, { history?: { date?: string; market?: number; volume?: number }[] }> | undefined
    const rawHistory = condMap?.['Near Mint']?.history ?? []
    history = rawHistory
      .map(h => ({ date: String(h.date ?? ''), price: Number(h.market ?? 0), volume: Number(h.volume ?? 0) }))
      .filter(h => h.date && h.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
    console.log('[card-detail] history points:', history.length)
  } else {
    console.error('[card-detail] CALL 2 failed:', histRes?.status)
  }

  // ── Call 3: graded prices ─────────────────────────────────────────────────────
  const grades: GradeEntry[] = []

  if (psaRes?.ok) {
    const json = await psaRes.json().catch(() => null)
    console.log('[card-detail] CALL 3:', JSON.stringify(json, null, 2))
    const salesByGrade = json?.data?.ebay?.salesByGrade as Record<string, {
      smartMarketPrice?: { price?: number }
      averagePrice?: number
      count?: number
      marketPrice7Day?: number
    }> | undefined

    if (salesByGrade) {
      for (const { key, label } of GRADE_CONFIG) {
        const g = salesByGrade[key]
        if (!g) continue
        const smartPrice = typeof g.smartMarketPrice?.price === 'number' ? g.smartMarketPrice.price : null
        const count = Number(g.count ?? 0)
        if (count === 0 || smartPrice == null) continue
        grades.push({
          grade: key, label, smartPrice,
          avgPrice: typeof g.averagePrice    === 'number' ? g.averagePrice    : smartPrice,
          count,
          avg7Day:  typeof g.marketPrice7Day === 'number' ? g.marketPrice7Day : null,
        })
      }
    }
    console.log('[card-detail] grade entries:', grades.length)
  } else {
    console.error('[card-detail] CALL 3 failed:', psaRes?.status)
  }

  return NextResponse.json({ price, history, conditions, grades, rates: { USD_INR, USD_AED } } satisfies CardDetailResponse)
}

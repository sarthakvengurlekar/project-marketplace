import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const PPT_BLOCK_KEY = 'PPT_BLOCKED_UNTIL'

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'
const MIN_CACHE_THRESHOLD = 10
const FALLBACK_RATES = { USD_INR: 83.5, USD_AED: 3.67 }

interface PptCard {
  tcgPlayerId?: string | number
  externalCatalogId?: string
  name?: string
  setName?: string
  setId?: string | number
  number?: string
  cardNumber?: string
  rarity?: string
  imageCdnUrl200?: string
  imageCdnUrl400?: string
  imageCdnUrl800?: string
  prices?: { market?: number | null; low?: number | null; high?: number | null; primaryPrinting?: string | null }
  hp?: string | number
  stage?: string
  cardType?: string
  pokemonType?: string
  energyType?: string[]
  weakness?: string
  resistance?: string
  retreatCost?: string | number
  attacks?: Array<{ name: string; damage?: string; text?: string; cost?: string[] }>
  flavorText?: string
  artist?: string
  tcgPlayerUrl?: string
  printingsAvailable?: string[]
  dataCompleteness?: string
  lastScrapedAt?: string
}

interface DbCardRow {
  id: string; name: string; set_name: string | null; set_code: string | null
  card_number: string | null; rarity: string | null
  image_url: string | null; image_url_hires: string | null; tcgplayer_id: string | null
  hp: string | null; stage: string | null; card_type: string | null
  pokemon_type: string | null; energy_type: string[] | null
  weakness: string | null; resistance: string | null; retreat_cost: string | null
  attacks: Array<{ name: string; damage?: string; text?: string; cost?: string[] }> | null
  flavor_text: string | null; artist: string | null; tcgplayer_url: string | null
  external_catalog_id: string | null; printings_available: string[] | null
  primary_printing: string | null; data_completeness: string | null; last_scraped_at: string | null
  usd_price?: number | null
}

function mapDbCard(row: DbCardRow): PptCard {
  return {
    tcgPlayerId:        row.tcgplayer_id ?? row.id,
    externalCatalogId:  row.external_catalog_id ?? undefined,
    name:               row.name,
    setName:            row.set_name ?? undefined,
    cardNumber:         row.card_number ?? undefined,
    rarity:             row.rarity ?? undefined,
    imageCdnUrl200:     row.image_url ?? undefined,
    imageCdnUrl400:     row.image_url ?? undefined,
    imageCdnUrl800:     row.image_url_hires ?? undefined,
    hp:                 row.hp ?? undefined,
    stage:              row.stage ?? undefined,
    cardType:           row.card_type ?? undefined,
    pokemonType:        row.pokemon_type ?? undefined,
    energyType:         row.energy_type ?? undefined,
    weakness:           row.weakness ?? undefined,
    resistance:         row.resistance ?? undefined,
    retreatCost:        row.retreat_cost ?? undefined,
    attacks:            row.attacks ?? undefined,
    flavorText:         row.flavor_text ?? undefined,
    artist:             row.artist ?? undefined,
    tcgPlayerUrl:       row.tcgplayer_url ?? undefined,
    printingsAvailable: row.printings_available ?? undefined,
    dataCompleteness:   row.data_completeness ?? undefined,
    lastScrapedAt:      row.last_scraped_at ?? undefined,
    prices: { market: row.usd_price ?? null, primaryPrinting: row.primary_printing ?? null },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchFromPPT(
  params: Record<string, string>,
  apiKey: string,
  limit: number,
  offset: number = 0,
): Promise<{ cards: PptCard[]; rateLimited: boolean }> {
  const RETRY_DELAYS = [0, 2000, 8000, 30000]
  const allParams: Record<string, string> = { ...params, lightweight: 'true', limit: String(limit) }
  if (offset > 0) allParams.offset = String(offset)
  const qs = new URLSearchParams(allParams).toString()

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) await sleep(RETRY_DELAYS[attempt])
    try {
      const res = await fetch(`${PPT_BASE}/cards?${qs}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 0 },
      })
      if (res.status === 429 || res.status === 403) {
        if (attempt < RETRY_DELAYS.length - 1) continue
        return { cards: [], rateLimited: true }
      }
      if (!res.ok) return { cards: [], rateLimited: false }
      const data = await res.json()
      const arr = Array.isArray(data) ? data : (data.data ?? data.cards ?? [])
      return { cards: arr as PptCard[], rateLimited: false }
    } catch {
      if (attempt < RETRY_DELAYS.length - 1) continue
      return { cards: [], rateLimited: false }
    }
  }
  return { cards: [], rateLimited: false }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertToCache(admin: any, cards: PptCard[], rates: typeof FALLBACK_RATES): Promise<void> {
  const rows = cards.filter(c => c.tcgPlayerId).map(c => ({
    id:                  String(c.tcgPlayerId),
    name:                c.name ?? '',
    set_name:            c.setName ?? null,
    set_code:            c.externalCatalogId ? c.externalCatalogId.split('-')[0] : null,
    card_number:         c.cardNumber ?? c.number ?? null,
    rarity:              c.rarity ?? null,
    image_url:           c.imageCdnUrl200 ?? c.imageCdnUrl400 ?? null,
    image_url_hires:     c.imageCdnUrl800 ?? null,
    tcgplayer_id:        String(c.tcgPlayerId),
    hp:                  c.hp != null ? String(c.hp) : null,
    stage:               c.stage ?? null,
    card_type:           c.cardType ?? null,
    pokemon_type:        c.pokemonType ?? null,
    energy_type:         c.energyType ?? null,
    weakness:            c.weakness ?? null,
    resistance:          c.resistance ?? null,
    retreat_cost:        c.retreatCost != null ? String(c.retreatCost) : null,
    attacks:             c.attacks ?? null,
    flavor_text:         c.flavorText ?? null,
    artist:              c.artist ?? null,
    tcgplayer_url:       c.tcgPlayerUrl ?? null,
    external_catalog_id: c.externalCatalogId ?? null,
    printings_available: c.printingsAvailable ?? null,
    primary_printing:    c.prices?.primaryPrinting ?? null,
    data_completeness:   c.dataCompleteness ?? null,
    last_scraped_at:     c.lastScrapedAt ?? null,
  }))
  if (rows.length === 0) return
  await admin.from('cards').upsert(rows, { onConflict: 'id' })

  const priceRows = cards
    .filter(c => c.tcgPlayerId && c.prices?.market != null)
    .map(c => ({
      card_id:      String(c.tcgPlayerId),
      usd_price:    c.prices!.market!,
      inr_price:    Math.round(c.prices!.market! * rates.USD_INR),
      aed_price:    Math.round(c.prices!.market! * rates.USD_AED * 100) / 100,
      last_fetched: new Date().toISOString(),
    }))
  if (priceRows.length > 0) {
    await admin.from('card_prices').upsert(priceRows, { onConflict: 'card_id' })
  }
}

// PPT stores sets with abbreviated names (e.g. "ME03: Perfect Order") while our
// chips display full names ("Mega Evolution—Perfect Order"). Strip everything up
// to and including the em-dash so both the DB ilike and PPT setName match.
function resolveSetTerm(name: string): string {
  const idx = name.lastIndexOf('—')
  return idx !== -1 ? name.slice(idx + 1).trim() : name
}

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const q      = (params.get('search') ?? params.get('q') ?? '').trim()
  const set    = (params.get('set') ?? '').trim()
  const offset = Math.max(0, parseInt(params.get('offset') ?? '0'))
  const limit  = Math.min(40, Math.max(1, parseInt(params.get('limit') ?? '20')))

  // Resolve the searchable part of the set name for DB + PPT matching
  const setTerm = set ? resolveSetTerm(set) : ''

  if (!q && !set) {
    return NextResponse.json({ error: 'search or set query required' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch live exchange rates
  const rates = { ...FALLBACK_RATES }
  const { data: rateRows } = await admin
    .from('exchange_rates')
    .select('currency_pair, rate')
    .in('currency_pair', ['USD_INR', 'USD_AED'])
  for (const r of rateRows ?? []) rates[r.currency_pair as keyof typeof rates] = r.rate

  // ── Layer 1: DB cache ─────────────────────────────────────────────────────
  // For set search: match set_name exactly (ILIKE for partial)
  // For name search: match name OR set_name
  let dbQuery = admin
    .from('cards')
    .select(
      'id, name, set_name, set_code, card_number, rarity, image_url, image_url_hires, tcgplayer_id, ' +
      'hp, stage, card_type, pokemon_type, energy_type, weakness, resistance, retreat_cost, attacks, ' +
      'flavor_text, artist, tcgplayer_url, external_catalog_id, printings_available, primary_printing, ' +
      'data_completeness, last_scraped_at',
    )

  if (set) {
    dbQuery = dbQuery.ilike('set_name', `%${setTerm}%`)
  } else {
    // Name search: match name OR set_name
    dbQuery = dbQuery.or(`name.ilike.%${q}%,set_name.ilike.%${q}%`)
  }

  const { data: dbRows } = await dbQuery.range(offset, offset + limit - 1)
  const dbCount = dbRows?.length ?? 0

  const SET_CACHE_THRESHOLD = set ? 20 : MIN_CACHE_THRESHOLD

  if (dbCount >= SET_CACHE_THRESHOLD) {
    const ids = (dbRows as DbCardRow[]).map(r => r.id)
    const { data: priceRows } = await admin
      .from('card_prices')
      .select('card_id, usd_price')
      .in('card_id', ids)

    const priceMap: Record<string, number> = {}
    for (const p of (priceRows ?? []) as Array<{ card_id: string; usd_price: number }>) {
      priceMap[p.card_id] = p.usd_price
    }

    const cards = (dbRows as DbCardRow[]).map(r =>
      mapDbCard({ ...r, usd_price: priceMap[r.id] ?? null }),
    )
    return NextResponse.json({ cards, hasMore: dbCount >= limit, fromCache: true, rateLimited: false })
  }

  // ── Layer 2: PPT API (skip if blocked) ───────────────────────────────────
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
  if (!apiKey) {
    const cachedCards = (dbRows as DbCardRow[] ?? []).map(r => mapDbCard(r))
    return NextResponse.json({ cards: cachedCards, hasMore: false, fromCache: true, rateLimited: false })
  }

  const { data: blockRow } = await admin
    .from('exchange_rates')
    .select('rate')
    .eq('currency_pair', PPT_BLOCK_KEY)
    .maybeSingle()
  const pptBlocked = Date.now() < (blockRow?.rate ?? 0)

  if (pptBlocked) {
    const cachedCards = (dbRows as DbCardRow[] ?? []).map(r => mapDbCard(r))
    return NextResponse.json({ cards: cachedCards, hasMore: false, fromCache: true, rateLimited: true })
  }

  const pptParams: Record<string, string> = set
    ? { setName: setTerm, ...(q.trim() ? { search: q.trim() } : {}) }
    : { search: q }

  const { cards: pptCards, rateLimited } = await fetchFromPPT(pptParams, apiKey, limit, offset)

  // If rate limited, store the block
  if (rateLimited) {
    const blockedUntil = Date.now() + 60 * 60 * 1000 // 1 hour default
    await admin.from('exchange_rates').upsert(
      { currency_pair: PPT_BLOCK_KEY, rate: blockedUntil, last_fetched: new Date().toISOString() },
      { onConflict: 'currency_pair' }
    ).catch(() => {})
  }
  const filteredCards = pptCards

  // ── Layer 3: Background upsert ────────────────────────────────────────────
  if (filteredCards.length > 0) {
    upsertToCache(admin, filteredCards, rates).catch(() => {})
  }

  // Merge: PPT results take priority; fill gaps with cached DB cards
  const pptIds = new Set(filteredCards.map(c => String(c.tcgPlayerId ?? '')))
  const dbMerge = (dbRows as DbCardRow[] ?? [])
    .filter(r => !pptIds.has(r.id))
    .map(r => mapDbCard(r))
  const merged = [...filteredCards, ...dbMerge]

  return NextResponse.json({
    cards:       merged,
    hasMore:     merged.length >= limit,
    fromCache:   false,
    rateLimited,
  })
}

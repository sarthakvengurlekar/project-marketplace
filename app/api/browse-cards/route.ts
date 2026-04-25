import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const PPT_BLOCK_KEY = 'PPT_BLOCKED_UNTIL'

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'
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

interface DbCard {
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
}

function mapDbCard(r: DbCard, usdPrice: number | null): PptCard {
  return {
    tcgPlayerId:        r.tcgplayer_id ?? r.id,
    externalCatalogId:  r.external_catalog_id ?? undefined,
    name:               r.name,
    setName:            r.set_name ?? undefined,
    cardNumber:         r.card_number ?? undefined,
    rarity:             r.rarity ?? undefined,
    imageCdnUrl200:     r.image_url ?? undefined,
    imageCdnUrl400:     r.image_url ?? undefined,
    imageCdnUrl800:     r.image_url_hires ?? undefined,
    hp:                 r.hp ?? undefined,
    stage:              r.stage ?? undefined,
    cardType:           r.card_type ?? undefined,
    pokemonType:        r.pokemon_type ?? undefined,
    energyType:         r.energy_type ?? undefined,
    weakness:           r.weakness ?? undefined,
    resistance:         r.resistance ?? undefined,
    retreatCost:        r.retreat_cost ?? undefined,
    attacks:            r.attacks ?? undefined,
    flavorText:         r.flavor_text ?? undefined,
    artist:             r.artist ?? undefined,
    tcgPlayerUrl:       r.tcgplayer_url ?? undefined,
    printingsAvailable: r.printings_available ?? undefined,
    dataCompleteness:   r.data_completeness ?? undefined,
    lastScrapedAt:      r.last_scraped_at ?? undefined,
    prices: { market: usdPrice, primaryPrinting: r.primary_printing ?? null },
  }
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

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get('offset') ?? '0'))
  const limit  = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '60')))

  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fetch live exchange rates (fall back to hardcoded)
  const rates = { ...FALLBACK_RATES }
  const { data: rateRows } = await admin
    .from('exchange_rates')
    .select('currency_pair, rate')
    .in('currency_pair', ['USD_INR', 'USD_AED'])
  for (const r of rateRows ?? []) rates[r.currency_pair as keyof typeof rates] = r.rate

  // ── Try PPT price-sorted browse (skip if blocked) ─────────────────────────
  if (apiKey) {
    const { data: blockRow } = await admin
      .from('exchange_rates')
      .select('rate')
      .eq('currency_pair', PPT_BLOCK_KEY)
      .maybeSingle()
    const pptBlocked = Date.now() < (blockRow?.rate ?? 0)

    if (!pptBlocked) {
      try {
        const pptUrl = `${PPT_BASE}/cards?sortBy=price&sortOrder=desc&lightweight=true&limit=${limit}`
          + (offset > 0 ? `&offset=${offset}` : '')
        const res = await fetch(pptUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          next: { revalidate: 0 },
        })
        if (res.ok) {
          const data = await res.json()
          const arr: PptCard[] = Array.isArray(data) ? data : (data.data ?? data.cards ?? [])
          if (arr.length > 0) {
            upsertToCache(admin, arr, rates).catch(() => {})
            return NextResponse.json({ cards: arr, hasMore: arr.length >= limit, source: 'ppt' })
          }
        } else if (res.status === 403 || res.status === 429) {
          let retryAfterSec = 3600
          try {
            const body = await res.json()
            if (typeof body?.retryAfter === 'number' && body.retryAfter > 0) retryAfterSec = body.retryAfter
          } catch { /* ignore */ }
          const blockedUntil = Date.now() + Math.max(retryAfterSec * 1000, 10 * 60 * 1000)
          await admin.from('exchange_rates').upsert(
            { currency_pair: PPT_BLOCK_KEY, rate: blockedUntil, last_fetched: new Date().toISOString() },
            { onConflict: 'currency_pair' }
          )
          console.warn(`[browse-cards] PPT blocked (${res.status}) — stored cooldown for ${Math.round((blockedUntil - Date.now()) / 60_000)} min`)
        }
      } catch { /* fall through to DB */ }
    }
  }

  // ── Fallback: local DB sorted by price ────────────────────────────────────
  const { data: priceRows } = await admin
    .from('card_prices')
    .select('card_id, usd_price, inr_price, aed_price')
    .not('usd_price', 'is', null)
    .order('usd_price', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!priceRows?.length) {
    return NextResponse.json({ cards: [], hasMore: false, source: 'db' })
  }

  const priceList = priceRows as Array<{ card_id: string; usd_price: number }>
  const priceMap: Record<string, number> = {}
  for (const p of priceList) priceMap[p.card_id] = p.usd_price
  const cardIds = priceList.map(p => p.card_id)

  const { data: cardRows } = await admin
    .from('cards')
    .select(
      'id, name, set_name, set_code, card_number, rarity, image_url, image_url_hires, tcgplayer_id, ' +
      'hp, stage, card_type, pokemon_type, energy_type, weakness, resistance, retreat_cost, attacks, ' +
      'flavor_text, artist, tcgplayer_url, external_catalog_id, printings_available, primary_printing, ' +
      'data_completeness, last_scraped_at',
    )
    .in('id', cardIds)

  const cards = ((cardRows ?? []) as DbCard[])
    .map(r => mapDbCard(r, priceMap[r.id] ?? null))
    .sort((a, b) => (b.prices?.market ?? 0) - (a.prices?.market ?? 0))

  return NextResponse.json({ cards, hasMore: cards.length >= limit, source: 'db' })
}

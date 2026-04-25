import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = user.id

  // User's country for default filter
  const { data: myProfile } = await adminSupabase
    .from('profiles')
    .select('country_code')
    .eq('id', currentUserId)
    .maybeSingle()
  const defaultFilter = myProfile?.country_code?.toUpperCase() ?? 'IN'

  // All HAVE card user_ids (excluding self)
  const { data: userCards } = await adminSupabase
    .from('user_cards')
    .select('user_id')
    .eq('list_type', 'HAVE')
    .neq('user_id', currentUserId)

  const uniqueSellerIds = Array.from(new Set((userCards ?? []).map(r => r.user_id as string)))

  if (uniqueSellerIds.length === 0) {
    return NextResponse.json({ sellers: [], currentUserId, defaultFilter })
  }

  // Already-swiped ids
  const { data: swipesData } = await adminSupabase
    .from('swipes')
    .select('target_user_id')
    .eq('swiper_user_id', currentUserId)
  const swipedSet = new Set((swipesData ?? []).map(r => r.target_user_id as string))

  // Unswiped seller ids
  const unseenIds = uniqueSellerIds.filter(id => !swipedSet.has(id))
  if (unseenIds.length === 0) {
    return NextResponse.json({ sellers: [], currentUserId, defaultFilter })
  }

  // Profiles + preview cards in two queries (no N+1 loop)
  const [profilesRes, cardsRes] = await Promise.all([
    adminSupabase
      .from('profiles')
      .select('id, username, avatar_url, city, country_code, trade_rating')
      .in('id', unseenIds),
    adminSupabase
      .from('user_cards')
      .select('user_id, id, condition, is_foil, cards(id, name, image_url)')
      .in('user_id', unseenIds)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false }),
  ])

  // Bulk-fetch prices for all preview card IDs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCardIds = (cardsRes.data ?? []).map(c => (c.cards as any)?.id).filter(Boolean) as string[]
  const { data: pricesData } = allCardIds.length > 0
    ? await adminSupabase.from('card_prices').select('card_id, usd_price').in('card_id', allCardIds)
    : { data: [] as Array<{ card_id: string; usd_price: number }> }

  const priceMap: Record<string, number> = {}
  for (const p of pricesData ?? []) priceMap[p.card_id] = p.usd_price

  // Group cards by seller
  const cardsByUser: Record<string, typeof cardsRes.data> = {}
  for (const card of cardsRes.data ?? []) {
    const uid = card.user_id as string
    if (!cardsByUser[uid]) cardsByUser[uid] = []
    cardsByUser[uid]!.push(card)
  }

  // Card count by seller (from original userCards list)
  const countByUser: Record<string, number> = {}
  for (const row of userCards ?? []) {
    countByUser[row.user_id as string] = (countByUser[row.user_id as string] ?? 0) + 1
  }

  const sellers = (profilesRes.data ?? []).map(profile => ({
    id:           profile.id,
    username:     profile.username,
    avatar_url:   profile.avatar_url  ?? null,
    city:         profile.city        ?? null,
    country_code: profile.country_code,
    trade_rating: profile.trade_rating ?? null,
    card_count:   countByUser[profile.id] ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preview_cards: (cardsByUser[profile.id] ?? []).slice(0, 8).map(c => ({
      id:        c.id,
      condition: c.condition ?? null,
      is_foil:   c.is_foil ?? false,
      cards:     c.cards ?? null,
      usd_price: (c.cards as any)?.id ? (priceMap[(c.cards as any).id] ?? null) : null,
    })),
  }))

  return NextResponse.json({ sellers, currentUserId, defaultFilter })
}

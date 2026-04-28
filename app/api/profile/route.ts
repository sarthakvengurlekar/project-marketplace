import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const username = request.nextUrl.searchParams.get('username')?.trim()
  const requestedUserId = request.nextUrl.searchParams.get('user_id')?.trim()

  let profileQuery = admin
    .from('profiles')
    .select('id, username, avatar_url, city, country_code, bio, roles, trade_rating, created_at')

  if (username) profileQuery = profileQuery.eq('username', username)
  else if (requestedUserId) profileQuery = profileQuery.eq('id', requestedUserId)
  else profileQuery = profileQuery.eq('id', user.id)

  const { data: profile } = await profileQuery.maybeSingle()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  const uid = profile.id
  const isOwner = uid === user.id

  const [userCardsRes, userMatchesRes, previewCardsRes] = await Promise.all([
    admin
      .from('user_cards')
      .select(`
        id, card_id, is_foil, added_via, grading_company, grade,
        cards ( id, set_name )
      `, { count: 'exact', head: false })
      .eq('user_id', uid)
      .eq('list_type', 'HAVE'),
    admin
      .from('matches')
      .select('id, status')
      .or(`user_1_id.eq.${uid},user_2_id.eq.${uid}`),
    admin
      .from('user_cards')
      .select('id, condition, is_foil, cards(id, name, image_url)')
      .eq('user_id', uid)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  type UserCardMetricRow = {
    id: string
    card_id: string
    is_foil: boolean | null
    added_via: string | null
    grading_company: string | null
    grade: number | null
    cards: { id: string; set_name: string | null } | null
  }

  type UserMatchMetricRow = {
    id: string
    status: string | null
  }

  const userCards = (userCardsRes.data ?? []) as unknown as UserCardMetricRow[]
  const userMatches = (userMatchesRes.data ?? []) as UserMatchMetricRow[]
  const matchIds = userMatches.map(match => match.id)
  let tradeCount = 0

  if (matchIds.length > 0) {
    const { data: acceptedOfferMessages } = await admin
      .from('messages')
      .select('match_id')
      .in('match_id', matchIds)
      .like('content', '✓ Offer accepted%')

    const acceptedOfferCountByMatch = new Map<string, number>()
    for (const message of acceptedOfferMessages ?? []) {
      const matchId = (message as { match_id?: string | null }).match_id
      if (!matchId) continue
      acceptedOfferCountByMatch.set(matchId, (acceptedOfferCountByMatch.get(matchId) ?? 0) + 1)
    }

    const acceptedOfferCount = Array.from(acceptedOfferCountByMatch.values())
      .reduce((sum, count) => sum + count, 0)
    const completedMatchesWithoutAcceptedOffers = userMatches.filter(match =>
      match.status === 'COMPLETED' && !acceptedOfferCountByMatch.has(match.id)
    ).length

    tradeCount = acceptedOfferCount + completedMatchesWithoutAcceptedOffers
  }

  const cardIds = userCards.map(c => c.card_id)
  let collectionValueLocal = 0
  let maxCardValueLocal = 0
  let rareCardCount = 0

  if (cardIds.length > 0) {
    const priceCol = profile.country_code === 'UAE' ? 'aed_price' : 'inr_price'
    const { data: prices } = await admin
      .from('card_prices')
      .select(`card_id, usd_price, inr_price, aed_price`)
      .in('card_id', cardIds)
    const USD_TO: Record<string, number> = { IN: 83.5, UAE: 3.67 }
    const rate = USD_TO[profile.country_code] ?? 83.5
    const priceMap = new Map<string, number>()
    ;(prices ?? []).forEach((p: { card_id?: string; usd_price: number | null; inr_price: number | null; aed_price: number | null }) => {
      if (!p.card_id) return
      const local = priceCol === 'aed_price' ? p.aed_price : p.inr_price
      priceMap.set(p.card_id, local ?? Math.round((p.usd_price ?? 0) * rate))
    })

    for (const card of userCards) {
      const value = priceMap.get(card.card_id) ?? 0
      collectionValueLocal += value
      if (value > maxCardValueLocal) maxCardValueLocal = value
      if (value >= 10_000) rareCardCount += 1
    }
  }

  const setCounts: Record<string, number> = {}
  for (const card of userCards) {
    const setName = card.cards?.set_name
    if (!setName) continue
    setCounts[setName] = (setCounts[setName] ?? 0) + 1
  }

  const foilCount = userCards.filter(card => card.is_foil).length
  const scannedCount = userCards.filter(card => card.added_via === 'scan').length
  const gradedCount = userCards.filter(card =>
    card.grading_company && card.grading_company !== 'RAW' && card.grade != null
  ).length
  const psa10Count = userCards.filter(card =>
    card.grading_company === 'PSA' && card.grade === 10
  ).length
  const setsWith10Count = Object.values(setCounts).filter(count => count >= 10).length

  return NextResponse.json({
    profile,
    is_owner: isOwner,
    stats: {
      card_count:            userCardsRes.count ?? 0,
      collection_value_local: collectionValueLocal,
      trade_count:           tradeCount,
      avg_rating:            profile.trade_rating ?? null,
      badge_metrics: {
        foil_count:            foilCount,
        graded_count:          gradedCount,
        psa10_count:           psa10Count,
        scanned_count:         scannedCount,
        max_card_value_local:  maxCardValueLocal,
        rare_card_count:       rareCardCount,
        sets_with_10_count:    setsWith10Count,
      },
    },
    preview_cards: previewCardsRes.data ?? [],
  })
}

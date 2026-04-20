import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  // Step 1: get current user from cookie session
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  console.log('[feed-sellers] user:', user?.id ?? 'null')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = user.id

  // Step 2: get user's country for default filter
  const { data: myProfile } = await adminSupabase
    .from('profiles')
    .select('country_code')
    .eq('id', currentUserId)
    .maybeSingle()
  console.log('[feed-sellers] myProfile:', myProfile)
  const defaultFilter = myProfile?.country_code?.toUpperCase() ?? 'IN'

  // Step 3: get all HAVE card user_ids (excluding self)
  const { data: userCards, error: userCardsError } = await adminSupabase
    .from('user_cards')
    .select('user_id')
    .eq('list_type', 'HAVE')
    .neq('user_id', currentUserId)
  console.log('[feed-sellers] user_cards result:', userCards, userCardsError)

  const uniqueSellerIds = Array.from(new Set((userCards ?? []).map(r => r.user_id as string)))
  console.log('[feed-sellers] uniqueSellerIds:', uniqueSellerIds)

  if (uniqueSellerIds.length === 0) {
    return NextResponse.json({
      sellers: [],
      currentUserId,
      defaultFilter,
      debug: { userCardsCount: 0, profilesCount: 0 },
    })
  }

  // Step 4: get profiles for those seller ids
  const { data: profiles, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, username, avatar_url, city, country_code')
    .in('id', uniqueSellerIds)
  console.log('[feed-sellers] profiles result:', profiles, profileError)

  // Step 5: get already-swiped ids
  const { data: swipesData, error: swipesError } = await adminSupabase
    .from('swipes')
    .select('target_user_id')
    .eq('swiper_user_id', currentUserId)
  console.log('[feed-sellers] swipes result:', swipesData, swipesError)
  const swipedSet = new Set((swipesData ?? []).map(r => r.target_user_id as string))

  // Step 6: for each profile, fetch their top 8 HAVE cards with card images
  const sellers = []
  for (const profile of profiles ?? []) {
    if (swipedSet.has(profile.id)) continue

    const { data: cards, error: cardsError } = await adminSupabase
      .from('user_cards')
      .select('*, cards(*)')
      .eq('user_id', profile.id)
      .eq('list_type', 'HAVE')
      .limit(8)
    console.log(`[feed-sellers] cards for ${profile.username}:`, cards?.length ?? 0, cardsError)

    sellers.push({
      id:           profile.id,
      username:     profile.username,
      avatar_url:   profile.avatar_url  ?? null,
      city:         profile.city        ?? null,
      country_code: profile.country_code,
      trade_rating: null,
      card_count:   uniqueSellerIds.includes(profile.id)
        ? (userCards ?? []).filter(r => r.user_id === profile.id).length
        : 0,
      preview_cards: (cards ?? []).map(c => ({
        id:        c.id,
        condition: c.condition ?? null,
        is_foil:   c.is_foil ?? false,
        cards:     c.cards ?? null,
      })),
    })
  }

  console.log('[feed-sellers] final sellers count:', sellers.length)

  return NextResponse.json({
    sellers,
    currentUserId,
    defaultFilter,
    debug: {
      userCardsCount:  userCards?.length  ?? 0,
      profilesCount:   profiles?.length   ?? 0,
      sellersReturned: sellers.length,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Temporary debug endpoint — remove before production
// Uses service role to bypass RLS and show true DB state

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id')
  const sb = serviceClient()

  const [
    userCardsCount,
    profilesCount,
    allProfiles,
    allUserCards,
    haveCards,
    userProfile,
    swipesAsSwiper,
    swipesAsSwiped,
  ] = await Promise.all([
    // Step 1: total user_cards rows
    sb.from('user_cards').select('*', { count: 'exact', head: true }),

    // Step 2: total profiles rows
    sb.from('profiles').select('*', { count: 'exact', head: true }),

    // Step 3: all profiles with country_code
    sb.from('profiles').select('id, username, country_code, city, created_at'),

    // Step 4: all user_cards rows (id, user_id, list_type)
    sb.from('user_cards').select('id, user_id, list_type, created_at').order('created_at', { ascending: false }),

    // Extra: only HAVE cards
    sb.from('user_cards').select('user_id, list_type').eq('list_type', 'HAVE'),

    // If user_id provided: their profile
    userId
      ? sb.from('profiles').select('*').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Swipes where this user is the swiper (both column name variants)
    userId
      ? sb.from('swipes').select('*').eq('swiper_id', userId)
      : Promise.resolve({ data: null, error: null }),

    userId
      ? sb.from('swipes').select('*').eq('swiper_user_id', userId)
      : Promise.resolve({ data: null, error: null }),
  ])

  // Cross-check: how many HAVE-card users have a matching profile
  const haveUserIds = Array.from(new Set((haveCards.data ?? []).map(r => r.user_id as string)))
  const profileIds  = new Set((allProfiles.data ?? []).map(p => p.id as string))
  const haveUsersWithProfile    = haveUserIds.filter(id => profileIds.has(id))
  const haveUsersWithoutProfile = haveUserIds.filter(id => !profileIds.has(id))

  return NextResponse.json({
    summary: {
      total_user_cards:       userCardsCount.count,
      total_profiles:         profilesCount.count,
      have_cards_rows:        haveCards.data?.length ?? 0,
      unique_users_with_have: haveUserIds.length,
      have_users_with_profile:    haveUsersWithProfile.length,
      have_users_without_profile: haveUsersWithoutProfile.length,
    },
    profiles: allProfiles.data,
    user_cards: allUserCards.data,
    have_cards_by_user: haveUserIds.map(uid => ({
      user_id:     uid,
      card_count:  (haveCards.data ?? []).filter(r => r.user_id === uid).length,
      has_profile: profileIds.has(uid),
    })),
    ...(userId ? {
      queried_user_id:    userId,
      my_profile:         userProfile.data,
      swipes_swiper_id:   { data: swipesAsSwiper.data, error: swipesAsSwiper.error?.message },
      swipes_swiper_user_id: { data: swipesAsSwiped.data, error: swipesAsSwiped.error?.message },
    } : {}),
    errors: {
      user_cards:  userCardsCount.error?.message,
      profiles:    profilesCount.error?.message,
      have_cards:  haveCards.error?.message,
    },
  })
}

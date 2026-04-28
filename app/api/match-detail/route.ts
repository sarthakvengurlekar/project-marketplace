import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: NextRequest) {
  // Auth
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  console.log('[match-detail] user:', user?.id ?? 'null')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const matchId = request.nextUrl.searchParams.get('match_id')
  if (!matchId) return NextResponse.json({ error: 'match_id required' }, { status: 400 })
  console.log('[match-detail] matchId:', matchId)

  // Step 1: fetch the match
  const { data: match, error: matchError } = await adminSupabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()
  console.log('[match-detail] match:', match, '| error:', matchError?.message ?? 'none')

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  // Verify caller is part of this match
  if (match.user_1_id !== user.id && match.user_2_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const currentUserId = user.id
  const otherId  = match.user_1_id === currentUserId ? match.user_2_id : match.user_1_id
  // seller = whoever is NOT the buyer (initiated_by = buyer)
  const sellerId = match.user_1_id === match.initiated_by ? match.user_2_id : match.user_1_id
  const role     = match.initiated_by === currentUserId ? 'BUYER' : 'SELLER'
  console.log('[match-detail] currentUserId:', currentUserId, '| otherId:', otherId, '| sellerId:', sellerId, '| role:', role)

  // Step 2: fetch other user profile
  const { data: otherUser, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, username, avatar_url, city, country_code, trade_rating')
    .eq('id', otherId)
    .maybeSingle()
  console.log('[match-detail] looking up profile id:', otherId)
  console.log('[match-detail] otherUser result:', JSON.stringify(otherUser), '| error:', profileError?.message ?? 'none')

  // Step 3: fetch seller's HAVE cards (top 8)
  const { data: sellerCards, error: cardsError } = await adminSupabase
    .from('user_cards')
    .select('id, condition, is_foil, cards(id, name, image_url)')
    .eq('user_id', sellerId)
    .eq('list_type', 'HAVE')
    .order('created_at', { ascending: false })
    .limit(8)
  console.log('[match-detail] sellerCards:', sellerCards?.length ?? 0, '| error:', cardsError?.message ?? 'none')

  // Step 4: fetch all messages
  const { data: messages, error: messagesError } = await adminSupabase
    .from('messages')
    .select('id, match_id, sender_id, content, created_at, read_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })
  console.log('[match-detail] messages:', messages?.length ?? 0, '| error:', messagesError?.message ?? 'none')

  const { data: myRating } = await adminSupabase
    .from('ratings')
    .select('id, score, overall_score, good_bargain, quick_response, trade_reliability')
    .eq('match_id', matchId)
    .eq('rater_id', currentUserId)
    .maybeSingle()

  // Mark inbound messages as read
  const unreadIds = (messages ?? [])
    .filter(m => m.sender_id !== currentUserId && !m.read_at)
    .map(m => m.id)
  if (unreadIds.length > 0) {
    await adminSupabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
  }

  return NextResponse.json({
    match,
    otherUser:    otherUser ?? null,
    sellerCards:  sellerCards ?? [],
    messages:     messages ?? [],
    myRating:     myRating ?? null,
    currentUserId,
    role,
  })
}

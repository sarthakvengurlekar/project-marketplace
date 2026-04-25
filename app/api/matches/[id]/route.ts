import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const uid = user.id

  const { data: match } = await admin
    .from('matches')
    .select('id, user_1_id, user_2_id, initiated_by, status, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (match.user_1_id !== uid && match.user_2_id !== uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const otherId    = match.user_1_id === uid ? match.user_2_id : match.user_1_id
  // seller = whoever is NOT the buyer (initiated_by = buyer)
  const sellerId   = match.user_1_id === match.initiated_by ? match.user_2_id : match.user_1_id

  const [otherUserRes, sellerCardsRes, messagesRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, username, avatar_url, city, country_code')
      .eq('id', otherId)
      .maybeSingle(),
    admin
      .from('user_cards')
      .select('id, condition, is_foil, cards(id, name, image_url)')
      .eq('user_id', sellerId)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false }),
    admin
      .from('messages')
      .select('id, match_id, sender_id, content, created_at, read_at')
      .eq('match_id', id)
      .order('created_at', { ascending: true }),
  ])

  // Mark inbound messages as read
  const unreadIds = (messagesRes.data ?? [])
    .filter(m => m.sender_id !== uid && !m.read_at)
    .map(m => m.id)
  if (unreadIds.length > 0) {
    await admin
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
  }

  return NextResponse.json({
    match,
    otherUser:    otherUserRes.data ?? null,
    sellerCards:  sellerCardsRes.data ?? [],
    messages:     messagesRes.data ?? [],
    currentUserId: uid,
    role:         match.initiated_by === uid ? 'BUYER' : 'SELLER',
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const { status } = await request.json() as { status: 'ACTIVE' | 'DECLINED' }

  const { data: match } = await admin
    .from('matches')
    .select('user_1_id, user_2_id, initiated_by')
    .eq('id', id)
    .maybeSingle()

  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only seller can accept/decline
  const sellerId = match.user_1_id === match.initiated_by ? match.user_2_id : match.user_1_id
  if (user.id !== sellerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error: updateError } = await admin.from('matches').update({ status }).eq('id', id)
  if (updateError) {
    console.error('[matches PATCH] update error:', updateError.code, updateError.message)
    return NextResponse.json({ error: 'Failed to update match' }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}

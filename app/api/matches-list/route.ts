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

  // All matches for this user
  const { data: matches, error: matchError } = await adminSupabase
    .from('matches')
    .select('*')
    .or(`user_1_id.eq.${currentUserId},user_2_id.eq.${currentUserId}`)
    .order('created_at', { ascending: false })

  if (matchError) console.error('[matches-list] match error:', matchError.message)

  if (!matches?.length) {
    return NextResponse.json({ matches: [], hasUnread: false, hasPendingAction: false, currentUserId })
  }

  // Batch-fetch other users' profiles
  const otherUserIds = Array.from(new Set(
    matches.map(m => m.user_1_id === currentUserId ? m.user_2_id : m.user_1_id)
  ))
  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, username, avatar_url, city, country_code, trade_rating')
    .in('id', otherUserIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // Last message per match (with created_at for sorting)
  const matchIds = matches.map(m => m.id)
  const { data: allMessages } = await adminSupabase
    .from('messages')
    .select('match_id, sender_id, content, created_at, read_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false })

  const lastMsgMap: Record<string, { content: string; created_at: string; isUnread: boolean }> = {}
  let hasUnread = false
  const seen = new Set<string>()
  for (const msg of allMessages ?? []) {
    if (seen.has(msg.match_id)) continue
    seen.add(msg.match_id)
    const isUnread = msg.sender_id !== currentUserId && !msg.read_at
    if (isUnread) hasUnread = true
    lastMsgMap[msg.match_id] = { content: msg.content, created_at: msg.created_at, isUnread }
  }

  // Assemble unified list
  const enriched = matches.map(m => {
    const otherUserId = m.user_1_id === currentUserId ? m.user_2_id : m.user_1_id
    const role = m.initiated_by === currentUserId ? 'BUYER' : 'SELLER'
    return {
      id:           m.id,
      status:       m.status as string,
      role,
      initiated_by: m.initiated_by,
      created_at:   m.created_at,
      otherUser:    profileMap[otherUserId] ?? null,
      lastMessage:  lastMsgMap[m.id] ?? null,
    }
  })

  // hasPendingAction = seller has PENDING matches waiting on them
  const hasPendingAction = enriched.some(m => m.status === 'PENDING' && m.role === 'SELLER')

  return NextResponse.json({ matches: enriched, hasUnread, hasPendingAction, currentUserId })
}

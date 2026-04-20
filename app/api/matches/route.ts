import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = user.id

  const { data: matches } = await admin
    .from('matches')
    .select('id, user_1_id, user_2_id, initiated_by, status, created_at')
    .or(`user_1_id.eq.${uid},user_2_id.eq.${uid}`)
    .order('created_at', { ascending: false })

  if (!matches?.length) {
    return NextResponse.json({ buying: [], selling: [], hasUnread: false })
  }

  const otherUserIds = Array.from(new Set(
    matches.map(m => m.user_1_id === uid ? m.user_2_id : m.user_1_id)
  ))
  const matchIds = matches.map(m => m.id)

  const [profilesRes, messagesRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, username, avatar_url, city, country_code')
      .in('id', otherUserIds),
    admin
      .from('messages')
      .select('id, match_id, sender_id, content, created_at, read_at')
      .in('match_id', matchIds)
      .order('created_at', { ascending: false }),
  ])

  const profileMap = Object.fromEntries(
    (profilesRes.data ?? []).map(p => [p.id, p])
  )

  // Build last-message-per-match map
  const lastMsgMap: Record<string, { content: string; created_at: string; isUnread: boolean }> = {}
  let hasUnread = false
  const seen = new Set<string>()
  for (const msg of messagesRes.data ?? []) {
    if (seen.has(msg.match_id)) continue
    seen.add(msg.match_id)
    const isUnread = msg.sender_id !== uid && !msg.read_at
    if (isUnread) hasUnread = true
    lastMsgMap[msg.match_id] = { content: msg.content, created_at: msg.created_at, isUnread }
  }

  const enriched = matches.map(m => ({
    id:          m.id,
    status:      m.status as string,
    initiated_by: m.initiated_by,
    created_at:  m.created_at,
    role:        m.initiated_by === uid ? 'BUYER' : 'SELLER',
    otherUser:   profileMap[m.user_1_id === uid ? m.user_2_id : m.user_1_id] ?? null,
    lastMessage: lastMsgMap[m.id] ?? null,
  }))

  return NextResponse.json({
    buying:    enriched.filter(m => m.role === 'BUYER'),
    selling:   enriched.filter(m => m.role === 'SELLER'),
    hasUnread,
  })
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  // Auth
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  console.log('[matches-list] user:', user?.id ?? 'null')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = user.id

  // Step 1: fetch matches
  const { data: matches, error: matchError } = await adminSupabase
    .from('matches')
    .select('*')
    .or(`user_1_id.eq.${currentUserId},user_2_id.eq.${currentUserId}`)
    .order('created_at', { ascending: false })
  console.log('[matches-list] matches:', matches?.length ?? 0, '| error:', matchError?.message ?? 'none')

  if (!matches?.length) {
    return NextResponse.json({ buying: [], selling: [], currentUserId, hasUnread: false })
  }

  // Step 2: collect all other-user IDs, then batch-fetch their profiles
  const otherUserIds = Array.from(new Set(
    matches.map(m => m.user_1_id === currentUserId ? m.user_2_id : m.user_1_id)
  ))
  console.log('[matches-list] currentUserId:', currentUserId)
  console.log('[matches-list] otherUserIds to look up:', otherUserIds)

  // Diagnostic: fetch ALL profiles so we can see what IDs exist
  const { data: allProfiles } = await adminSupabase
    .from('profiles')
    .select('id, username')
  console.log('[matches-list] ALL profiles in DB:', allProfiles)

  const { data: profiles, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, username, avatar_url, city, country_code')
    .in('id', otherUserIds)
  console.log('[matches-list] profiles fetched for otherUserIds:', profiles?.length ?? 0, '| error:', profileError?.message ?? 'none')
  console.log('[matches-list] profiles result:', JSON.stringify(profiles))

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // Step 3: last message per match
  const matchIds = matches.map(m => m.id)
  const { data: allMessages } = await adminSupabase
    .from('messages')
    .select('match_id, sender_id, content, created_at, read_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false })

  const lastMsgMap: Record<string, { content: string; isUnread: boolean }> = {}
  let hasUnread = false
  const seen = new Set<string>()
  for (const msg of allMessages ?? []) {
    if (seen.has(msg.match_id)) continue
    seen.add(msg.match_id)
    const isUnread = msg.sender_id !== currentUserId && !msg.read_at
    if (isUnread) hasUnread = true
    lastMsgMap[msg.match_id] = { content: msg.content, isUnread }
  }

  // Step 4: assemble
  const enriched = matches.map(m => {
    const otherUserId = m.user_1_id === currentUserId ? m.user_2_id : m.user_1_id
    const otherUser   = profileMap[otherUserId] ?? null
    console.log(`[matches-list] match ${m.id}: otherUserId=${otherUserId} found=${!!otherUser}`)
    return {
      id:           m.id,
      status:       m.status as string,
      initiated_by: m.initiated_by,
      created_at:   m.created_at,
      role:         m.initiated_by === currentUserId ? 'BUYER' : 'SELLER',
      otherUser,
      lastMessage:  lastMsgMap[m.id] ?? null,
    }
  })

  console.log('[matches-list] enriched buying:', enriched.filter(m => m.role === 'BUYER').length)
  console.log('[matches-list] enriched selling:', enriched.filter(m => m.role === 'SELLER').length)

  return NextResponse.json({
    buying:       enriched.filter(m => m.role === 'BUYER'),
    selling:      enriched.filter(m => m.role === 'SELLER'),
    hasUnread,
    currentUserId,
    debug: { matchCount: matches.length, profilesFound: profiles?.length ?? 0, otherUserIds },
  })
}

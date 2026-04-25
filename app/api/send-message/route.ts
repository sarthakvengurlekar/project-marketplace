import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { match_id?: string; content?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { match_id, content } = body
  if (!match_id || !content?.trim()) {
    return NextResponse.json({ error: 'match_id and content are required' }, { status: 400 })
  }

  // Verify caller is in this match and match is open
  const { data: match } = await adminSupabase
    .from('matches')
    .select('user_1_id, user_2_id, initiated_by, status')
    .eq('id', match_id)
    .single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (match.user_1_id !== user.id && match.user_2_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (match.status === 'DECLINED' || match.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Chat is closed' }, { status: 409 })
  }
  const sellerId = match.user_1_id === match.initiated_by ? match.user_2_id : match.user_1_id
  if (user.id === sellerId && match.status === 'PENDING') {
    return NextResponse.json({ error: 'Accept the request to start chatting' }, { status: 403 })
  }

  const { data: message, error } = await adminSupabase
    .from('messages')
    .insert({ match_id, sender_id: user.id, content: content.trim() })
    .select('id, match_id, sender_id, content, created_at, read_at')
    .single()

  if (error) {
    console.error('[send-message] insert error:', error.code, error.message)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  return NextResponse.json({ message }, { status: 201 })
}

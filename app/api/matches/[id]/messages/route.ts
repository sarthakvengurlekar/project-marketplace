import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  const { content } = await request.json() as { content: string }
  if (!content?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  const { data: match } = await admin
    .from('matches')
    .select('user_1_id, user_2_id, initiated_by, status')
    .eq('id', id)
    .maybeSingle()

  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (match.user_1_id !== user.id && match.user_2_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (match.status === 'DECLINED' || match.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Chat is closed' }, { status: 403 })
  }

  // Seller can't send until they accept
  const sellerId = match.user_1_id === match.initiated_by ? match.user_2_id : match.user_1_id
  if (user.id === sellerId && match.status === 'PENDING') {
    return NextResponse.json({ error: 'Accept the request to start chatting' }, { status: 403 })
  }

  const { data: message, error } = await admin
    .from('messages')
    .insert({ match_id: id, sender_id: user.id, content: content.trim() })
    .select('id, match_id, sender_id, content, created_at, read_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { swiped_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { swiped_id } = body
  if (!swiped_id || typeof swiped_id !== 'string') {
    return NextResponse.json({ error: 'swiped_id is required' }, { status: 400 })
  }
  if (swiped_id === user.id) {
    return NextResponse.json({ error: 'Cannot swipe yourself' }, { status: 400 })
  }

  // Insert swipe — auth client so auth.uid() = swiper for RLS
  const { error: swipeError } = await supabase
    .from('swipes')
    .insert({ swiper_id: user.id, swiped_id, direction: 'LIKE' })

  if (swipeError) {
    // Unique constraint violation = already swiped
    if (swipeError.code === '23505') {
      return NextResponse.json({ error: 'Already swiped this user' }, { status: 409 })
    }
    console.error('[swipe] insert error:', swipeError.code, swipeError.message)
    return NextResponse.json({ error: 'Failed to record swipe' }, { status: 500 })
  }

  // Check for existing match
  const user1 = user.id < swiped_id ? user.id : swiped_id
  const user2 = user.id < swiped_id ? swiped_id : user.id

  const { data: existingMatch } = await admin
    .from('matches')
    .select('id')
    .eq('user_1_id', user1)
    .eq('user_2_id', user2)
    .maybeSingle()

  let matchId: string | null = existingMatch?.id ?? null

  if (!matchId) {
    const { data: newMatch, error: matchError } = await admin
      .from('matches')
      .insert({ user_1_id: user1, user_2_id: user2, initiated_by: user.id, status: 'PENDING' })
      .select('id')
      .maybeSingle()
    if (matchError) {
      console.error('[swipe] match create error:', matchError.code, matchError.message)
    }
    matchId = newMatch?.id ?? null
  }

  return NextResponse.json({ success: true, matchId }, { status: 201 })
}

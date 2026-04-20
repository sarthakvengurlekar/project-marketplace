import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  // ── Auth: get current user from cookie session ─────────────────────────────
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('[swipe] auth user:', user?.id ?? 'null', '| authError:', authError?.message ?? 'none')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { swiped_id: string }
  const { swiped_id } = body
  console.log('[swipe] swiper_id:', user.id, '| swiped_id:', swiped_id)

  // ── Step 1: insert swipe (auth client so auth.uid() = swiper_id for RLS) ───
  const { data: swipeData, error: swipeError } = await supabase
    .from('swipes')
    .insert({ swiper_id: user.id, swiped_id, direction: 'LIKE' })
    .select()
    .maybeSingle()
  console.log('[swipe] insert result:', swipeData, '| error:', swipeError?.message ?? 'none')

  if (swipeError) {
    return NextResponse.json({ error: swipeError.message }, { status: 500 })
  }

  // ── Step 2: check if a match already exists (trigger may have created it) ──
  const user1 = user.id < swiped_id ? user.id : swiped_id
  const user2 = user.id < swiped_id ? swiped_id : user.id

  const { data: existingMatch, error: existingErr } = await admin
    .from('matches')
    .select('id')
    .eq('user_1_id', user1)
    .eq('user_2_id', user2)
    .maybeSingle()
  console.log('[swipe] existing match:', existingMatch, '| error:', existingErr?.message ?? 'none')

  let matchId: string | null = existingMatch?.id ?? null

  // ── Step 3: no match yet → create one manually ─────────────────────────────
  if (!matchId) {
    const { data: newMatch, error: matchError } = await admin
      .from('matches')
      .insert({ user_1_id: user1, user_2_id: user2, initiated_by: user.id, status: 'PENDING' })
      .select('id')
      .maybeSingle()
    console.log('[swipe] created match:', newMatch, '| error:', matchError?.message ?? 'none')
    matchId = newMatch?.id ?? null
  }

  console.log('[swipe] final matchId:', matchId)
  return NextResponse.json({ success: true, matchId })
}

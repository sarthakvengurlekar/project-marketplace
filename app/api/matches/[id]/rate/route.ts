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
  const { stars, comment } = await request.json() as { stars: number; comment?: string }
  if (!stars || stars < 1 || stars > 5) {
    return NextResponse.json({ error: 'Stars must be 1–5' }, { status: 400 })
  }

  const { data: match } = await admin
    .from('matches')
    .select('user_1_id, user_2_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (match.user_1_id !== user.id && match.user_2_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ratedId = match.user_1_id === user.id ? match.user_2_id : match.user_1_id

  const { error: ratingError } = await admin
    .from('ratings')
    .insert({ match_id: id, rater_id: user.id, rated_id: ratedId, stars, comment: comment ?? null })

  if (ratingError) return NextResponse.json({ error: ratingError.message }, { status: 500 })

  // Recompute average trade_rating for the rated user
  const { data: allRatings } = await admin
    .from('ratings')
    .select('stars')
    .eq('rated_id', ratedId)

  if (allRatings?.length) {
    const avg = allRatings.reduce((s, r) => s + r.stars, 0) / allRatings.length
    await admin
      .from('profiles')
      .update({ trade_rating: Math.round(avg * 10) / 10 })
      .eq('id', ratedId)
  }

  await admin.from('matches').update({ status: 'COMPLETED' }).eq('id', id)
  return NextResponse.json({ success: true })
}

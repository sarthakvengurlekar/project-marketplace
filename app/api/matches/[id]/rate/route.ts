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
  const body = await request.json() as {
    good_bargain?: number
    quick_response?: number
    trade_reliability?: number
    comment?: string
  }
  const goodBargain = body.good_bargain
  const quickResponse = body.quick_response
  const tradeReliability = body.trade_reliability
  const scores = [goodBargain, quickResponse, tradeReliability]

  if (scores.some(score => typeof score !== 'number' || score < 1 || score > 5)) {
    return NextResponse.json({ error: 'All rating scores must be 1–5' }, { status: 400 })
  }
  const ratingScores = scores as [number, number, number]
  const overallScore = Math.round((ratingScores.reduce((sum, score) => sum + score, 0) / ratingScores.length) * 10) / 10
  const legacyScore = Math.round(overallScore)

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
    .upsert({
      match_id: id,
      rater_id: user.id,
      rated_id: ratedId,
      good_bargain: goodBargain,
      quick_response: quickResponse,
      trade_reliability: tradeReliability,
      overall_score: overallScore,
      score: legacyScore,
      comment: body.comment ?? null,
    }, { onConflict: 'match_id,rater_id' })

  if (ratingError) {
    console.error('[rate] insert error:', ratingError.code, ratingError.message)
    return NextResponse.json({ error: 'Failed to submit rating' }, { status: 500 })
  }

  // Recompute average trade_rating for the rated user
  const { data: allRatings } = await admin
    .from('ratings')
    .select('overall_score, score')
    .eq('rated_id', ratedId)

  if (allRatings?.length) {
    const avg = allRatings.reduce((s, r) => {
      const score = (r as { overall_score?: number | null; score?: number | null }).overall_score
        ?? (r as { score?: number | null }).score
        ?? 0
      return s + score
    }, 0) / allRatings.length
    await admin
      .from('profiles')
      .update({ trade_rating: Math.round(avg * 10) / 10 })
      .eq('id', ratedId)
  }

  await admin.from('matches').update({ status: 'COMPLETED' }).eq('id', id)
  return NextResponse.json({ success: true })
}

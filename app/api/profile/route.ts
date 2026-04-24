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

  const { data: profile } = await admin
    .from('profiles')
    .select('id, username, avatar_url, city, country_code, bio, roles, trade_rating, created_at')
    .eq('id', uid)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const [userCardsRes, completedTradesRes, previewCardsRes] = await Promise.all([
    admin
      .from('user_cards')
      .select('id, card_id', { count: 'exact', head: false })
      .eq('user_id', uid)
      .eq('list_type', 'HAVE'),
    admin
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .or(`user_1_id.eq.${uid},user_2_id.eq.${uid}`)
      .eq('status', 'COMPLETED'),
    admin
      .from('user_cards')
      .select('id, condition, is_foil, cards(id, name, image_url)')
      .eq('user_id', uid)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const cardIds = (userCardsRes.data ?? []).map((c: { card_id: string }) => c.card_id)

  let collectionValueLocal = 0
  if (cardIds.length > 0) {
    const priceCol = profile.country_code === 'UAE' ? 'aed_price' : 'inr_price'
    const { data: prices } = await admin
      .from('card_prices')
      .select(`usd_price, inr_price, aed_price`)
      .in('card_id', cardIds)
    const USD_TO: Record<string, number> = { IN: 83.5, UAE: 3.67 }
    const rate = USD_TO[profile.country_code] ?? 83.5
    collectionValueLocal = (prices ?? []).reduce(
      (sum: number, p: { usd_price: number | null; inr_price: number | null; aed_price: number | null }) => {
        const local = priceCol === 'aed_price' ? p.aed_price : p.inr_price
        if (local != null) return sum + local
        return sum + Math.round((p.usd_price ?? 0) * rate)
      },
      0
    )
  }

  return NextResponse.json({
    profile,
    stats: {
      card_count:            userCardsRes.count ?? 0,
      collection_value_local: collectionValueLocal,
      trade_count:           completedTradesRes.count ?? 0,
      avg_rating:            profile.trade_rating ?? null,
    },
    preview_cards: previewCardsRes.data ?? [],
  })
}

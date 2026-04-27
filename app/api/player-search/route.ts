import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface UserCardRow {
  user_id: string
  id: string
  cards: { id: string; name: string | null; image_url: string | null } | null
}

export async function GET(request: NextRequest) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = user.id
  const rawQuery = request.nextUrl.searchParams.get('q') ?? ''
  const query = rawQuery.trim().replace(/[%,]/g, '').slice(0, 40)

  if (query.length < 2) {
    return NextResponse.json({ players: [] })
  }

  const { data: matches } = await adminSupabase
    .from('matches')
    .select('user_1_id, user_2_id')
    .or(`user_1_id.eq.${currentUserId},user_2_id.eq.${currentUserId}`)

  const excludedIds = new Set<string>([currentUserId])
  for (const match of matches ?? []) {
    excludedIds.add(match.user_1_id)
    excludedIds.add(match.user_2_id)
  }

  const { data: profiles, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id, username, avatar_url, city, country_code, trade_rating')
    .or(`username.ilike.%${query}%,city.ilike.%${query}%`)
    .limit(20)

  if (profileError) {
    console.error('[player-search] profile error:', profileError.message)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  const candidates = (profiles ?? []).filter(p => !excludedIds.has(p.id))
  const candidateIds = candidates.map(p => p.id)

  if (candidateIds.length === 0) {
    return NextResponse.json({ players: [] })
  }

  const { data: cardsData } = await adminSupabase
    .from('user_cards')
    .select('user_id, id, cards(id, name, image_url)')
    .in('user_id', candidateIds)
    .eq('list_type', 'HAVE')
    .order('created_at', { ascending: false })

  const cards = (cardsData ?? []) as unknown as UserCardRow[]
  const cardsByUser: Record<string, UserCardRow[]> = {}
  for (const card of cards) {
    if (!cardsByUser[card.user_id]) cardsByUser[card.user_id] = []
    cardsByUser[card.user_id]!.push(card)
  }

  const players = candidates.map(profile => {
    const userCards = cardsByUser[profile.id] ?? []
    return {
      id:           profile.id,
      username:     profile.username,
      avatar_url:   profile.avatar_url ?? null,
      city:         profile.city ?? null,
      country_code: profile.country_code,
      trade_rating: profile.trade_rating ?? null,
      card_count:   userCards.length,
      preview_cards: userCards.slice(0, 4).map(card => ({
        id: card.id,
        cards: card.cards,
      })),
    }
  })

  return NextResponse.json({ players })
}

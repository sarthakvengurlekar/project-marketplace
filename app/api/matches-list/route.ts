import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface OfferPayload {
  userCardId?: string
  cardId?: string
  cardName?: string
  imageUrl?: string | null
  setName?: string | null
  condition?: string | null
  isFoil?: boolean
  marketUsd?: number | null
  marketLocal?: number | null
  currency?: string
  offerAmount?: number
}

interface CompletedOffer {
  acceptedAt: string
  acceptedBy: string
  cardName: string
  imageUrl: string | null
  setName: string | null
  condition: string | null
  isFoil: boolean
  marketLocal: number | null
  currency: string
  offerAmount: number | null
  summary: string
}

function parseOffer(content: string): OfferPayload | null {
  if (!content.startsWith('[OFFER]:')) return null
  try {
    return JSON.parse(content.slice('[OFFER]:'.length)) as OfferPayload
  } catch {
    return null
  }
}

function fallbackAcceptedOffer(content: string, createdAt: string, senderId: string): CompletedOffer {
  const match = content.match(/^✓ Offer accepted — (.+?)(?: for (.+))?$/)
  const amount = match?.[2]?.replace(/[^\d.]/g, '')
  const currency = match?.[2]?.includes('AED') ? 'AED' : 'INR'
  return {
    acceptedAt: createdAt,
    acceptedBy: senderId,
    cardName: match?.[1] ?? 'Accepted offer',
    imageUrl: null,
    setName: null,
    condition: null,
    isFoil: false,
    marketLocal: null,
    currency,
    offerAmount: amount ? Number(amount) : null,
    summary: content,
  }
}

export async function GET() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUserId = user.id

  // All matches for this user
  const { data: matches, error: matchError } = await adminSupabase
    .from('matches')
    .select('*')
    .or(`user_1_id.eq.${currentUserId},user_2_id.eq.${currentUserId}`)
    .order('created_at', { ascending: false })

  if (matchError) console.error('[matches-list] match error:', matchError.message)

  if (!matches?.length) {
    return NextResponse.json({ matches: [], hasUnread: false, hasPendingAction: false, currentUserId })
  }

  // Batch-fetch other users' profiles
  const otherUserIds = Array.from(new Set(
    matches.map(m => m.user_1_id === currentUserId ? m.user_2_id : m.user_1_id)
  ))
  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, username, avatar_url, city, country_code, trade_rating')
    .in('id', otherUserIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // Last message per match (with created_at for sorting)
  const matchIds = matches.map(m => m.id)
  const { data: allMessages } = await adminSupabase
    .from('messages')
    .select('match_id, sender_id, content, created_at, read_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false })

  const lastMsgMap: Record<string, { content: string; created_at: string; isUnread: boolean }> = {}
  let hasUnread = false
  const seen = new Set<string>()
  for (const msg of allMessages ?? []) {
    if (seen.has(msg.match_id)) continue
    seen.add(msg.match_id)
    const isUnread = msg.sender_id !== currentUserId && !msg.read_at
    if (isUnread) hasUnread = true
    lastMsgMap[msg.match_id] = { content: msg.content, created_at: msg.created_at, isUnread }
  }

  const completedOfferMap: Record<string, CompletedOffer[]> = {}
  const pendingOfferMap: Record<string, OfferPayload[]> = {}
  const chronologicalMessages = [...(allMessages ?? [])].reverse()

  for (const msg of chronologicalMessages) {
    const offer = parseOffer(msg.content)
    if (offer) {
      pendingOfferMap[msg.match_id] = [...(pendingOfferMap[msg.match_id] ?? []), offer]
      continue
    }

    if (!msg.content.startsWith('✓ Offer accepted')) continue

    const previousOffers = pendingOfferMap[msg.match_id] ?? []
    const matchedOffer = previousOffers.at(-1)
    const completedOffer: CompletedOffer = matchedOffer ? {
      acceptedAt: msg.created_at,
      acceptedBy: msg.sender_id,
      cardName: matchedOffer.cardName ?? 'Accepted offer',
      imageUrl: matchedOffer.imageUrl ?? null,
      setName: matchedOffer.setName ?? null,
      condition: matchedOffer.condition ?? null,
      isFoil: Boolean(matchedOffer.isFoil),
      marketLocal: matchedOffer.marketLocal ?? null,
      currency: matchedOffer.currency ?? 'INR',
      offerAmount: typeof matchedOffer.offerAmount === 'number' ? matchedOffer.offerAmount : null,
      summary: msg.content,
    } : fallbackAcceptedOffer(msg.content, msg.created_at, msg.sender_id)

    completedOfferMap[msg.match_id] = [...(completedOfferMap[msg.match_id] ?? []), completedOffer]
  }

  // Assemble unified list
  const enriched = matches.map(m => {
    const otherUserId = m.user_1_id === currentUserId ? m.user_2_id : m.user_1_id
    const role = m.initiated_by === currentUserId ? 'BUYER' : 'SELLER'
    return {
      id:           m.id,
      status:       m.status as string,
      role,
      initiated_by: m.initiated_by,
      created_at:   m.created_at,
      otherUser:    profileMap[otherUserId] ?? null,
      lastMessage:  lastMsgMap[m.id] ?? null,
      completedOffers: completedOfferMap[m.id] ?? [],
    }
  })

  // hasPendingAction = seller has PENDING matches waiting on them
  const hasPendingAction = enriched.some(m => m.status === 'PENDING' && m.role === 'SELLER')

  return NextResponse.json({ matches: enriched, hasUnread, hasPendingAction, currentUserId })
}

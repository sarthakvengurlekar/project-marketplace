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

interface PendingOffer {
  sentAt: string
  sentBy: string
  needsAction: boolean
  cardName: string
  imageUrl: string | null
  setName: string | null
  condition: string | null
  isFoil: boolean
  marketLocal: number | null
  currency: string
  offerAmount: number | null
}

function parseOffer(content: string): OfferPayload | null {
  if (!content.startsWith('[OFFER]:')) return null
  try {
    return JSON.parse(content.slice('[OFFER]:'.length)) as OfferPayload
  } catch {
    return null
  }
}

function parseOfferDecision(content: string): { accepted: boolean; cardName: string } | null {
  const accepted = content.match(/^✓ Offer accepted — (.+?)(?: for .*)?$/)
  if (accepted?.[1]) return { accepted: true, cardName: accepted[1] }

  const declined = content.match(/^✗ Offer declined — (.+)$/)
  if (declined?.[1]) return { accepted: false, cardName: declined[1] }

  return null
}

function normalizedCardName(name: string) {
  return name.trim().toLowerCase()
}

function findPendingOfferIndex(offers: PendingOffer[], cardName: string) {
  const target = normalizedCardName(cardName)
  for (let i = offers.length - 1; i >= 0; i -= 1) {
    if (normalizedCardName(offers[i].cardName) === target) return i
  }
  return offers.length - 1
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
  const pendingOfferMap: Record<string, PendingOffer[]> = {}
  const chronologicalMessages = [...(allMessages ?? [])].reverse()

  for (const msg of chronologicalMessages) {
    const offer = parseOffer(msg.content)
    if (offer) {
      pendingOfferMap[msg.match_id] = [
        ...(pendingOfferMap[msg.match_id] ?? []),
        {
          sentAt: msg.created_at,
          sentBy: msg.sender_id,
          needsAction: msg.sender_id !== currentUserId,
          cardName: offer.cardName ?? 'Pending offer',
          imageUrl: offer.imageUrl ?? null,
          setName: offer.setName ?? null,
          condition: offer.condition ?? null,
          isFoil: Boolean(offer.isFoil),
          marketLocal: offer.marketLocal ?? null,
          currency: offer.currency ?? 'INR',
          offerAmount: typeof offer.offerAmount === 'number' ? offer.offerAmount : null,
        },
      ]
      continue
    }

    const decision = parseOfferDecision(msg.content)
    if (decision && !decision.accepted) {
      const previousOffers = pendingOfferMap[msg.match_id] ?? []
      const matchedIndex = findPendingOfferIndex(previousOffers, decision.cardName)
      pendingOfferMap[msg.match_id] = matchedIndex >= 0
        ? previousOffers.filter((_, index) => index !== matchedIndex)
        : previousOffers
      continue
    }

    if (!decision?.accepted) continue

    const previousOffers = pendingOfferMap[msg.match_id] ?? []
    const matchedIndex = findPendingOfferIndex(previousOffers, decision.cardName)
    const matchedOffer = matchedIndex >= 0 ? previousOffers[matchedIndex] : undefined
    const completedOffer: CompletedOffer = matchedOffer ? {
      acceptedAt: msg.created_at,
      acceptedBy: msg.sender_id,
      cardName: matchedOffer.cardName,
      imageUrl: matchedOffer.imageUrl,
      setName: matchedOffer.setName,
      condition: matchedOffer.condition,
      isFoil: matchedOffer.isFoil,
      marketLocal: matchedOffer.marketLocal,
      currency: matchedOffer.currency,
      offerAmount: matchedOffer.offerAmount,
      summary: msg.content,
    } : fallbackAcceptedOffer(msg.content, msg.created_at, msg.sender_id)

    completedOfferMap[msg.match_id] = [...(completedOfferMap[msg.match_id] ?? []), completedOffer]
    pendingOfferMap[msg.match_id] = matchedIndex >= 0
      ? previousOffers.filter((_, index) => index !== matchedIndex)
      : previousOffers
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
      pendingOffers: pendingOfferMap[m.id] ?? [],
    }
  })

  // hasPendingAction = seller has PENDING matches waiting on them
  const hasPendingAction = enriched.some(m =>
    (m.status === 'PENDING' && m.role === 'SELLER')
    || m.pendingOffers.some(offer => offer.needsAction)
  )

  return NextResponse.json({ matches: enriched, hasUnread, hasPendingAction, currentUserId })
}

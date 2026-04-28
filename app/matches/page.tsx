'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'COMPLETED'
type TabFilter = 'CHATBOX' | 'PENDING' | 'DONE'

interface OtherUser {
  id: string
  username: string
  avatar_url: string | null
  city: string | null
  country_code: string
  trade_rating: number | null
}

interface MatchRow {
  id: string
  status: MatchStatus
  role: 'BUYER' | 'SELLER'
  initiated_by: string
  created_at: string
  otherUser: OtherUser | null
  lastMessage: { content: string; created_at: string; isUnread: boolean } | null
  completedOffers: CompletedOffer[]
  pendingOffers: PendingOffer[]
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

interface PlayerResult extends OtherUser {
  card_count: number
  preview_cards: Array<{
    id: string
    cards: { id: string; name: string | null; image_url: string | null } | null
  }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function sortMatches(list: MatchRow[]): MatchRow[] {
  function tier(m: MatchRow): number {
    if (m.status === 'ACTIVE' && m.lastMessage?.isUnread) return 0
    if (m.status === 'ACTIVE') return 1
    if (m.status === 'PENDING') return 2
    return 3
  }
  return [...list].sort((a, b) => {
    const td = tier(a) - tier(b)
    if (td !== 0) return td
    const at = a.lastMessage?.created_at ?? a.created_at
    const bt = b.lastMessage?.created_at ?? b.created_at
    return new Date(bt).getTime() - new Date(at).getTime()
  })
}

function money(amount: number | null, currency: string) {
  if (amount == null) return 'Price unavailable'
  return `${currency === 'AED' ? 'AED ' : '₹'}${amount.toLocaleString('en-IN')}`
}

function tabLabel(tab: TabFilter) {
  if (tab === 'CHATBOX') return 'CHATBOX'
  return tab
}

function tabToQuery(tab: TabFilter) {
  return tab.toLowerCase()
}

function queryToTab(tab: string | null): TabFilter {
  if (tab === 'pending') return 'PENDING'
  if (tab === 'done') return 'DONE'
  return 'CHATBOX'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user }: { user: OtherUser }) {
  const initials = user.username[0]?.toUpperCase() ?? '?'
  return (
    <div
      style={{
        position:   'relative',
        width:       44,
        height:      44,
        flexShrink: 0,
        border:     '2px solid #0A0A0A',
        boxShadow:  '2px 2px 0 #0A0A0A',
        overflow:   'hidden',
      }}
    >
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt={user.username} fill className="object-cover" unoptimized />
      ) : (
        <div
          style={{
            width:           '100%',
            height:          '100%',
            background:      '#F4D03F',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}
        >
          <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16 }}>{initials}</span>
        </div>
      )}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MatchStatus }) {
  const styles: Record<MatchStatus, { bg: string; color: string; border: string; label: string }> = {
    ACTIVE:    { bg: '#F4D03F', color: '#0A0A0A', border: '1.5px solid #0A0A0A', label: 'ACTIVE'    },
    PENDING:   { bg: '#FAF6EC', color: '#0A0A0A', border: '1.5px solid #0A0A0A', label: 'PENDING'   },
    DECLINED:  { bg: '#FAF6EC', color: '#8B7866', border: '1.5px solid #8B7866', label: 'DECLINED'  },
    COMPLETED: { bg: '#FAF6EC', color: '#8B7866', border: '1.5px solid #8B7866', label: 'COMPLETED' },
  }
  const s = styles[status]
  return (
    <span style={{
      background:    s.bg,
      color:         s.color,
      border:        s.border,
      fontSize:      9,
      fontWeight:    900,
      padding:       '2px 6px',
      letterSpacing: '0.05em',
      display:       'inline-block',
    }}>
      {s.label}
    </span>
  )
}

function CompletedOfferCard({ offer }: { offer: CompletedOffer }) {
  return (
    <div style={{
      marginTop: 12,
      border: '2px solid #0A0A0A',
      background: '#FAF6EC',
      boxShadow: '3px 3px 0 #E8233B',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', gap: 10, padding: 10, alignItems: 'center' }}>
        <div style={{
          position: 'relative',
          width: 46,
          height: 64,
          flexShrink: 0,
          background: '#f0ece2',
          border: '2px solid #0A0A0A',
          overflow: 'hidden',
        }}>
          {offer.imageUrl ? (
            <Image src={offer.imageUrl} alt={offer.cardName} fill sizes="46px" className="object-contain" unoptimized />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B7866', fontWeight: 900 }}>TCG</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {offer.cardName}
          </p>
          {offer.setName && (
            <p style={{ color: '#8B7866', fontSize: 10, margin: '2px 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {offer.setName}
            </p>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {offer.condition && <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>{offer.condition}</span>}
            {offer.isFoil && <span style={{ background: '#F4D03F', color: '#0A0A0A', border: '1px solid #0A0A0A', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>FOIL</span>}
            <span style={{ background: '#E8233B', color: '#FAF6EC', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>ACCEPTED</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: offer.marketLocal != null ? '1fr 1fr' : '1fr', borderTop: '2px solid #0A0A0A' }}>
        {offer.marketLocal != null && (
          <div style={{ padding: '8px 10px', borderRight: '2px solid #0A0A0A' }}>
            <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 900, margin: '0 0 2px' }}>MARKET</p>
            <p style={{ color: '#0A0A0A', fontSize: 13, fontWeight: 900, margin: 0 }}>{money(offer.marketLocal, offer.currency)}</p>
          </div>
        )}
        <div style={{ padding: '8px 10px', background: '#E8233B' }}>
          <p style={{ color: 'rgba(250,246,236,0.75)', fontSize: 9, fontWeight: 900, margin: '0 0 2px' }}>OFFER</p>
          <p style={{ color: '#FAF6EC', fontSize: 13, fontWeight: 900, margin: 0 }}>{money(offer.offerAmount, offer.currency)}</p>
        </div>
      </div>
    </div>
  )
}

function PendingOfferCard({ offer }: { offer: PendingOffer }) {
  return (
    <div style={{
      marginTop: 12,
      border: '2px solid #0A0A0A',
      background: '#FAF6EC',
      boxShadow: offer.needsAction ? '3px 3px 0 #E8233B' : '3px 3px 0 #F4D03F',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', gap: 10, padding: 10, alignItems: 'center' }}>
        <div style={{
          position: 'relative',
          width: 46,
          height: 64,
          flexShrink: 0,
          background: '#f0ece2',
          border: '2px solid #0A0A0A',
          overflow: 'hidden',
        }}>
          {offer.imageUrl ? (
            <Image src={offer.imageUrl} alt={offer.cardName} fill sizes="46px" className="object-contain" unoptimized />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B7866', fontWeight: 900 }}>TCG</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {offer.cardName}
          </p>
          {offer.setName && (
            <p style={{ color: '#8B7866', fontSize: 10, margin: '2px 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {offer.setName}
            </p>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {offer.condition && <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>{offer.condition}</span>}
            {offer.isFoil && <span style={{ background: '#F4D03F', color: '#0A0A0A', border: '1px solid #0A0A0A', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>FOIL</span>}
            <span style={{ background: offer.needsAction ? '#E8233B' : '#F4D03F', color: offer.needsAction ? '#FAF6EC' : '#0A0A0A', border: offer.needsAction ? 'none' : '1px solid #0A0A0A', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>
              {offer.needsAction ? 'DECISION NEEDED' : 'AWAITING REPLY'}
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: offer.marketLocal != null ? '1fr 1fr' : '1fr', borderTop: '2px solid #0A0A0A' }}>
        {offer.marketLocal != null && (
          <div style={{ padding: '8px 10px', borderRight: '2px solid #0A0A0A' }}>
            <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 900, margin: '0 0 2px' }}>MARKET</p>
            <p style={{ color: '#0A0A0A', fontSize: 13, fontWeight: 900, margin: 0 }}>{money(offer.marketLocal, offer.currency)}</p>
          </div>
        )}
        <div style={{ padding: '8px 10px', background: offer.needsAction ? '#E8233B' : '#F4D03F' }}>
          <p style={{ color: offer.needsAction ? 'rgba(250,246,236,0.75)' : '#8B7866', fontSize: 9, fontWeight: 900, margin: '0 0 2px' }}>OFFER</p>
          <p style={{ color: offer.needsAction ? '#FAF6EC' : '#0A0A0A', fontSize: 13, fontWeight: 900, margin: 0 }}>{money(offer.offerAmount, offer.currency)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchItem({
  match,
  onAccept,
  onDecline,
  acting,
  showCompletedOffers,
  showPendingOffers,
  sourceTab,
}: {
  match: MatchRow
  onAccept: (id: string) => void
  onDecline: (id: string) => void
  acting: boolean
  showCompletedOffers: boolean
  showPendingOffers: boolean
  sourceTab: TabFilter
}) {
  const other = match.otherUser
  const isPendingSeller = match.role === 'SELLER' && match.status === 'PENDING'
  const timestamp = match.lastMessage?.created_at ?? match.created_at
  const isUnread = match.lastMessage?.isUnread
  const isPending = match.status === 'PENDING'
  const completedOffers = match.completedOffers ?? []
  const pendingOffers = match.pendingOffers ?? []

  return (
    <Link
      data-testid="match-list-item"
      href={`/matches/${match.id}?from=${tabToQuery(sourceTab)}`}
      style={{
        display:     'block',
        background:  '#FAF6EC',
        border:      '2px solid #0A0A0A',
        boxShadow:   isUnread ? '4px 4px 0 #E8233B' : isPending ? '4px 4px 0 #F4D03F' : '3px 3px 0 #0A0A0A',
        marginBottom: 12,
        textDecoration: 'none',
      }}
    >
      <div style={{ padding: '14px 14px 12px' }}>
        {/* Top row: avatar + name/status + timestamp */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {other ? (
            <Avatar user={other} />
          ) : (
            <div style={{ width: 44, height: 44, background: '#e8e2d4', border: '2px solid #0A0A0A', flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>
                @{other?.username ?? '—'}
              </span>
              <StatusBadge status={match.status} />
              {isPending && (
                <span style={{ background: isPendingSeller ? '#E8233B' : '#F4D03F', color: isPendingSeller ? '#FAF6EC' : '#0A0A0A', border: '1.5px solid #0A0A0A', fontSize: 9, fontWeight: 900, padding: '2px 6px' }}>
                  {isPendingSeller ? 'ACTION NEEDED' : 'WAITING'}
                </span>
              )}
            </div>

            {other && (other.city || other.country_code) && (
              <p style={{ color: '#8B7866', fontSize: 11, margin: '3px 0 0' }}>
                {FLAGS[other.country_code] ?? ''}{other.city ? ` ${other.city}` : ''}{other.trade_rating != null ? ` · New trader` : ''}
              </p>
            )}
          </div>

          <span style={{ color: '#8B7866', fontSize: 10, fontWeight: 600, flexShrink: 0, marginTop: 2 }}>
            {timeAgo(timestamp)}
          </span>
        </div>

        {/* Last message */}
        {match.lastMessage ? (
          <p style={{
            color:      isUnread ? '#0A0A0A' : '#8B7866',
            fontWeight: isUnread ? 700 : 500,
            fontSize:   12,
            margin:     '10px 0 0',
            overflow:   'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            &ldquo;{match.lastMessage.content.startsWith('[OFFER]:') ? '⚡ Price offer' : match.lastMessage.content}&rdquo;
          </p>
        ) : (
          <p style={{ color: '#8B7866', fontSize: 12, margin: '10px 0 0', fontStyle: 'italic' }}>
            No messages yet
          </p>
        )}

        {showCompletedOffers && completedOffers.length > 0 && (
          <div>
            <p style={{ color: '#E8233B', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', margin: '12px 0 0', textTransform: 'uppercase' }}>
              {completedOffers.length} completed offer{completedOffers.length === 1 ? '' : 's'}
            </p>
            {completedOffers.map((offer, index) => (
              <CompletedOfferCard key={`${offer.acceptedAt}-${index}`} offer={offer} />
            ))}
          </div>
        )}

        {showPendingOffers && pendingOffers.length > 0 && (
          <div>
            <p style={{ color: '#E8233B', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', margin: '12px 0 0', textTransform: 'uppercase' }}>
              {pendingOffers.length} pending offer{pendingOffers.length === 1 ? '' : 's'}
            </p>
            {pendingOffers.map((offer, index) => (
              <PendingOfferCard key={`${offer.sentAt}-${index}`} offer={offer} />
            ))}
          </div>
        )}

        {/* Accept / Decline — seller only on PENDING */}
        {isPendingSeller && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.preventDefault()}>
            <button
              onClick={e => { e.preventDefault(); onAccept(match.id) }}
              disabled={acting}
              style={{
                background:  '#E8233B',
                border:      '2px solid #0A0A0A',
                boxShadow:   acting ? 'none' : '2px 2px 0 #0A0A0A',
                color:       '#FAF6EC',
                fontWeight:  900,
                fontSize:    12,
                padding:     '6px 14px',
                cursor:      acting ? 'not-allowed' : 'pointer',
                opacity:     acting ? 0.5 : 1,
              }}
            >
              Accept
            </button>
            <button
              onClick={e => { e.preventDefault(); onDecline(match.id) }}
              disabled={acting}
              style={{
                background:  '#FAF6EC',
                border:      '2px solid #0A0A0A',
                color:       '#0A0A0A',
                fontWeight:  900,
                fontSize:    12,
                padding:     '6px 14px',
                cursor:      acting ? 'not-allowed' : 'pointer',
                opacity:     acting ? 0.5 : 1,
              }}
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Player search ───────────────────────────────────────────────────────────

function PlayerResultItem({
  player,
  acting,
  onStartTrade,
}: {
  player: PlayerResult
  acting: boolean
  onStartTrade: (player: PlayerResult) => void
}) {
  return (
    <div style={{ border: '2px solid #0A0A0A', background: '#FAF6EC', boxShadow: '3px 3px 0 #0A0A0A', padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar user={player} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 14, margin: 0 }}>@{player.username}</p>
            <span style={{ fontSize: 13 }}>{FLAGS[player.country_code] ?? ''}</span>
          </div>
          <p style={{ color: '#8B7866', fontSize: 11, margin: '3px 0 8px' }}>
            {[player.city, `${player.card_count} cards`].filter(Boolean).join(' · ')}
          </p>
          {player.preview_cards.length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {player.preview_cards.map(card => (
                <div key={card.id} style={{ position: 'relative', width: 32, height: 45, border: '1.5px solid #0A0A0A', background: '#f0ece2', overflow: 'hidden', flexShrink: 0 }}>
                  {card.cards?.image_url && (
                    <Image src={card.cards.image_url} alt={card.cards.name ?? ''} fill sizes="32px" className="object-contain" unoptimized />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <Link
          href={`/binder/${player.username}`}
          style={{ textAlign: 'center', textDecoration: 'none', background: '#FAF6EC', color: '#0A0A0A', border: '2px solid #0A0A0A', fontWeight: 900, fontSize: 12, padding: '8px 0' }}
        >
          View Binder
        </Link>
        <button
          onClick={() => onStartTrade(player)}
          disabled={acting}
          style={{ background: '#E8233B', color: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: acting ? 'none' : '2px 2px 0 #0A0A0A', fontWeight: 900, fontSize: 12, padding: '8px 0', cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.55 : 1 }}
        >
          Start Trade
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function MatchesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [matches,   setMatches]   = useState<MatchRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [actingId,  setActingId]  = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabFilter>(() => queryToTab(searchParams.get('tab')))
  const [searchOpen, setSearchOpen] = useState(false)
  const [playerQuery, setPlayerQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([])
  const [playerLoading, setPlayerLoading] = useState(false)
  const [startingPlayerId, setStartingPlayerId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/matches-list', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login'); return }
    const data = await res.json()
    const all: MatchRow[] = data.matches ?? [
      ...(data.buying  ?? []),
      ...(data.selling ?? []),
    ]
    setMatches(sortMatches(all))
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setActiveTab(queryToTab(searchParams.get('tab')))
  }, [searchParams])

  useEffect(() => {
    function refreshOnReturn() {
      load()
    }

    function refreshOnVisible() {
      if (document.visibilityState === 'visible') load()
    }

    window.addEventListener('focus', refreshOnReturn)
    document.addEventListener('visibilitychange', refreshOnVisible)
    return () => {
      window.removeEventListener('focus', refreshOnReturn)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [load])

  useEffect(() => {
    const q = playerQuery.trim()
    if (!searchOpen || q.length < 2) {
      setPlayerResults([])
      setPlayerLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setPlayerLoading(true)
      try {
        const res = await fetch(`/api/player-search?q=${encodeURIComponent(q)}`, { signal: controller.signal, cache: 'no-store' })
        if (res.status === 401) { router.push('/login'); return }
        if (!res.ok) return
        const data = await res.json() as { players?: PlayerResult[] }
        setPlayerResults(data.players ?? [])
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') setPlayerResults([])
      } finally {
        setPlayerLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [playerQuery, router, searchOpen])

  async function handleAccept(matchId: string) {
    setActingId(matchId)
    await fetch(`/api/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
    router.push(`/matches/${matchId}?from=pending`)
  }

  async function handleDecline(matchId: string) {
    setActingId(matchId)
    await fetch(`/api/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DECLINED' }),
    })
    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, status: 'DECLINED' as MatchStatus } : m)
    )
    setActingId(null)
  }

  async function handleStartTrade(player: PlayerResult) {
    if (startingPlayerId) return
    setStartingPlayerId(player.id)
    try {
      const res = await fetch('/api/swipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swiped_id: player.id }),
      })
      const data = await res.json() as { matchId?: string | null; error?: string }
      if (res.ok && data.matchId) {
        router.push(`/matches/${data.matchId}?from=chatbox`)
      }
    } finally {
      setStartingPlayerId(null)
    }
  }

  const sorted = sortMatches(matches)

  const tabMatches: Record<TabFilter, MatchRow[]> = {
    CHATBOX: sorted.filter(m => m.status === 'ACTIVE'),
    PENDING: sorted.filter(m => m.status === 'PENDING' || (m.pendingOffers?.length ?? 0) > 0),
    DONE:    sorted.filter(m => (m.completedOffers?.length ?? 0) > 0 || m.status === 'COMPLETED'),
  }

  const activeBadgeCount = tabMatches.CHATBOX.filter(m => m.lastMessage?.isUnread).length
  const pendingActionCount = tabMatches.PENDING.reduce((sum, match) => {
    const pendingMatchAction = match.status === 'PENDING' && match.role === 'SELLER' ? 1 : 0
    const offerActions = (match.pendingOffers ?? []).filter(offer => offer.needsAction).length
    return sum + pendingMatchAction + offerActions
  }, 0)
  const pendingCount = tabMatches.PENDING.reduce((sum, match) => {
    const pendingMatchCount = match.status === 'PENDING' ? 1 : 0
    return sum + pendingMatchCount + (match.pendingOffers?.length ?? 0)
  }, 0)
  const doneCount        = tabMatches.DONE.reduce((sum, match) => sum + Math.max(match.completedOffers?.length ?? 0, match.status === 'COMPLETED' ? 1 : 0), 0)

  const visibleMatches = tabMatches[activeTab]

  const activeCount = sorted.filter(m => m.status === 'ACTIVE').length
  const unreadCount = sorted.filter(m => m.lastMessage?.isUnread).length

  function selectTab(tab: TabFilter) {
    setActiveTab(tab)
    router.replace(`/matches?tab=${tabToQuery(tab)}`, { scroll: false })
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: '#FAF6EC' }}>

      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 px-4 py-3"
        style={{ background: '#FAF6EC', borderBottom: '2px solid #0A0A0A' }}
      >
        <div className="max-w-lg mx-auto space-y-3">

          {/* Title row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-black text-xl leading-none" style={{ color: '#0A0A0A' }}>Trades</h1>
              {!loading && (
                <p className="text-xs mt-0.5" style={{ color: '#8B7866' }}>
                  {activeCount} chat{activeCount === 1 ? '' : 's'}{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => setSearchOpen(prev => !prev)}
              style={{
                width:          36,
                height:         36,
                background:     searchOpen ? '#E8233B' : '#F4D03F',
                border:         '2px solid #0A0A0A',
                boxShadow:      '3px 3px 0 #0A0A0A',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       16,
                cursor:         'pointer',
              }}
              aria-label="Search players"
            >
              🔍
            </button>
          </div>

          {searchOpen && (
            <div data-testid="player-search-panel" style={{ border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', background: '#FAF6EC', overflow: 'hidden' }}>
              <div style={{ position: 'relative', borderBottom: '2px solid #0A0A0A' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8B7866', fontSize: 13 }}>🔍</span>
                <input
                  type="text"
                  value={playerQuery}
                  onChange={e => setPlayerQuery(e.target.value)}
                  placeholder="Search players…"
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', background: '#FAF6EC', border: 'none', outline: 'none', color: '#0A0A0A', fontSize: 14, padding: '11px 40px 11px 36px' }}
                />
                {playerQuery && (
                  <button
                    onClick={() => setPlayerQuery('')}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#0A0A0A', fontWeight: 900, cursor: 'pointer' }}
                    aria-label="Clear player search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{ padding: 12 }}>
                {playerQuery.trim().length < 2 ? (
                  <p style={{ color: '#8B7866', fontSize: 12, margin: 0 }}>Type at least 2 letters.</p>
                ) : playerLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', display: 'block', animation: 'tradeSearchSpin 0.8s linear infinite' }} />
                    <p style={{ color: '#8B7866', fontSize: 12, margin: 0 }}>Searching…</p>
                  </div>
                ) : playerResults.length === 0 ? (
                  <p style={{ color: '#8B7866', fontSize: 12, margin: 0 }}>No unmatched players found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {playerResults.map(player => (
                      <PlayerResultItem
                        key={player.id}
                        player={player}
                        acting={startingPlayerId === player.id}
                        onStartTrade={handleStartTrade}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tabs: Chatbox / Pending / Done */}
          <div
            className="grid grid-cols-3 overflow-hidden"
            style={{ border: '2px solid #0A0A0A' }}
          >
            {(['CHATBOX', 'PENDING', 'DONE'] as TabFilter[]).map((tab, i, arr) => (
              <button
                key={tab}
                data-testid={`matches-tab-${tab.toLowerCase()}`}
                aria-pressed={activeTab === tab}
                onClick={() => selectTab(tab)}
                className="py-2 text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                style={{
                  background:  activeTab === tab
                    ? '#F4D03F'
                    : tab === 'PENDING' && pendingActionCount > 0
                      ? 'rgba(232,35,59,0.08)'
                      : '#FAF6EC',
                  color:       '#0A0A0A',
                  borderRight: i < arr.length - 1 ? '2px solid #0A0A0A' : 'none',
                }}
              >
                {tabLabel(tab)}
                {tab === 'CHATBOX' && activeBadgeCount > 0 && (
                  <span style={{
                    background: '#E8233B', color: '#FAF6EC',
                    fontSize: 9, fontWeight: 900,
                    padding: '1px 5px',
                    minWidth: 16, textAlign: 'center',
                  }}>
                    {activeBadgeCount}
                  </span>
                )}
                {tab === 'PENDING' && pendingCount > 0 && (
                  <span style={{
                    background: pendingActionCount > 0 ? '#E8233B' : '#0A0A0A',
                    color: '#FAF6EC',
                    border: pendingActionCount > 0 ? '1px solid #0A0A0A' : 'none',
                    boxShadow: pendingActionCount > 0 ? '1px 1px 0 #0A0A0A' : 'none',
                    fontSize: 9, fontWeight: 900,
                    padding: '1px 5px',
                    minWidth: 16, textAlign: 'center',
                  }}>
                    {pendingCount}
                  </span>
                )}
                {tab === 'DONE' && doneCount > 0 && (
                  <span style={{
                    background: '#E8233B', color: '#FAF6EC',
                    fontSize: 9, fontWeight: 900,
                    padding: '1px 5px',
                    minWidth: 16, textAlign: 'center',
                  }}>
                    {doneCount}
                  </span>
                )}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading ? (
          // Skeleton
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="animate-pulse p-4"
                style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A' }}
              >
                <div className="flex gap-3 items-start">
                  <div style={{ width: 44, height: 44, background: '#e8e2d4', border: '2px solid #0A0A0A', flexShrink: 0 }} />
                  <div className="flex-1 space-y-2 pt-1">
                    <div style={{ background: '#e8e2d4', height: 12, width: '60%', borderRadius: 2 }} />
                    <div style={{ background: '#e8e2d4', height: 10, width: '40%', borderRadius: 2 }} />
                    <div style={{ background: '#e8e2d4', height: 10, width: '80%', borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : visibleMatches.length === 0 ? (
          // Empty state
          <div
            data-testid="matches-empty-state"
            className="rounded-xl p-10 text-center mt-4"
            style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
          >
            <span className="text-5xl mb-4 block">
              {activeTab === 'CHATBOX' ? '💬' : activeTab === 'PENDING' ? '⏳' : '✓'}
            </span>
            <h2 className="font-black text-lg mb-2" style={{ color: '#0A0A0A' }}>
              {activeTab === 'CHATBOX' ? 'No active chats' : activeTab === 'PENDING' ? 'No pending trades' : 'No completed offers'}
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: '#8B7866' }}>
              {activeTab === 'CHATBOX'
                ? 'Browse the feed to find traders and open a chatbox.'
                : activeTab === 'PENDING'
                ? 'Trade requests waiting for a response show up here.'
                : 'Accepted offers show up here with card and price details.'}
            </p>
            {activeTab === 'CHATBOX' && (
              <Link
                href="/feed"
                className="inline-block text-sm font-black px-5 py-2.5"
                style={{ background: '#E8233B', color: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A' }}
              >
                Browse Feed →
              </Link>
            )}
          </div>
        ) : (
          visibleMatches.map(match => (
            <MatchItem
              key={match.id}
              match={match}
              onAccept={handleAccept}
              onDecline={handleDecline}
              acting={actingId === match.id}
              showCompletedOffers={activeTab === 'DONE'}
              showPendingOffers={activeTab === 'PENDING'}
              sourceTab={activeTab}
            />
          ))
        )}
      </div>
      <style>{`@keyframes tradeSearchSpin { to { transform: rotate(360deg); } }`}</style>
    </main>
  )
}

function MatchesPageFallback() {
  return (
    <main className="min-h-screen pb-28" style={{ background: '#FAF6EC' }}>
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="animate-pulse p-4"
              style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A' }}
            >
              <div className="flex gap-3 items-start">
                <div style={{ width: 44, height: 44, background: '#e8e2d4', border: '2px solid #0A0A0A', flexShrink: 0 }} />
                <div className="flex-1 space-y-2 pt-1">
                  <div style={{ background: '#e8e2d4', height: 12, width: '60%', borderRadius: 2 }} />
                  <div style={{ background: '#e8e2d4', height: 10, width: '40%', borderRadius: 2 }} />
                  <div style={{ background: '#e8e2d4', height: 10, width: '80%', borderRadius: 2 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export default function MatchesPage() {
  return (
    <Suspense fallback={<MatchesPageFallback />}>
      <MatchesPageContent />
    </Suspense>
  )
}

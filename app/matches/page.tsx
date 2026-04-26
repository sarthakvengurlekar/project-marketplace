'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'COMPLETED'
type TabFilter = 'ACTIVE' | 'PENDING' | 'DONE'

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

// ─── Match row ────────────────────────────────────────────────────────────────

function MatchItem({
  match,
  onAccept,
  onDecline,
  acting,
}: {
  match: MatchRow
  onAccept: (id: string) => void
  onDecline: (id: string) => void
  acting: boolean
}) {
  const other = match.otherUser
  const isPendingSeller = match.role === 'SELLER' && match.status === 'PENDING'
  const timestamp = match.lastMessage?.created_at ?? match.created_at
  const isUnread = match.lastMessage?.isUnread

  return (
    <Link
      href={`/matches/${match.id}`}
      style={{
        display:     'block',
        background:  '#FAF6EC',
        border:      '2px solid #0A0A0A',
        boxShadow:   isUnread ? '4px 4px 0 #E8233B' : '3px 3px 0 #0A0A0A',
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const router = useRouter()
  const [matches,   setMatches]   = useState<MatchRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [actingId,  setActingId]  = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabFilter>('ACTIVE')

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

  async function handleAccept(matchId: string) {
    setActingId(matchId)
    await fetch(`/api/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
    router.push(`/matches/${matchId}`)
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

  const sorted = sortMatches(matches)

  const tabMatches: Record<TabFilter, MatchRow[]> = {
    ACTIVE:  sorted.filter(m => m.status === 'ACTIVE'),
    PENDING: sorted.filter(m => m.status === 'PENDING'),
    DONE:    sorted.filter(m => m.status === 'DECLINED' || m.status === 'COMPLETED'),
  }

  const activeBadgeCount = tabMatches.ACTIVE.filter(m => m.lastMessage?.isUnread).length
  const pendingCount     = tabMatches.PENDING.length

  const visibleMatches = tabMatches[activeTab]

  const activeCount = sorted.filter(m => m.status === 'ACTIVE').length
  const unreadCount = sorted.filter(m => m.lastMessage?.isUnread).length

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
                  {activeCount} active{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
                </p>
              )}
            </div>
            <div
              style={{
                width:          36,
                height:         36,
                background:     '#F4D03F',
                border:         '2px solid #0A0A0A',
                boxShadow:      '3px 3px 0 #0A0A0A',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       16,
              }}
            >
              🔍
            </div>
          </div>

          {/* Tabs: Active / Pending / Done */}
          <div
            className="grid grid-cols-3 overflow-hidden"
            style={{ border: '2px solid #0A0A0A' }}
          >
            {(['ACTIVE', 'PENDING', 'DONE'] as TabFilter[]).map((tab, i, arr) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="py-2 text-xs font-black uppercase tracking-wide transition-all flex items-center justify-center gap-1.5"
                style={{
                  background:  activeTab === tab ? '#F4D03F' : '#FAF6EC',
                  color:       '#0A0A0A',
                  borderRight: i < arr.length - 1 ? '2px solid #0A0A0A' : 'none',
                }}
              >
                {tab}
                {tab === 'ACTIVE' && activeBadgeCount > 0 && (
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
                    background: '#0A0A0A', color: '#FAF6EC',
                    fontSize: 9, fontWeight: 900,
                    padding: '1px 5px',
                    minWidth: 16, textAlign: 'center',
                  }}>
                    {pendingCount}
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
            className="rounded-xl p-10 text-center mt-4"
            style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
          >
            <span className="text-5xl mb-4 block">
              {activeTab === 'ACTIVE' ? '💬' : activeTab === 'PENDING' ? '⏳' : '✓'}
            </span>
            <h2 className="font-black text-lg mb-2" style={{ color: '#0A0A0A' }}>
              {activeTab === 'ACTIVE' ? 'No active trades' : activeTab === 'PENDING' ? 'No pending trades' : 'No completed trades'}
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: '#8B7866' }}>
              {activeTab === 'ACTIVE'
                ? 'Browse the feed to find sellers and start trading!'
                : activeTab === 'PENDING'
                ? 'Trade requests you send will appear here.'
                : 'Completed and declined trades show up here.'}
            </p>
            {activeTab === 'ACTIVE' && (
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
            />
          ))
        )}
      </div>
    </main>
  )
}

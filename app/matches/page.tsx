'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'COMPLETED'

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

// Sort: ACTIVE+unread → ACTIVE → PENDING → DECLINED/COMPLETED
// Within each group: most recent activity first
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
  return (
    <div className="relative w-11 h-11 flex-shrink-0">
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt={user.username} fill className="rounded-full object-cover" unoptimized />
      ) : (
        <div className="w-11 h-11 rounded-full bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
          <span className="text-yellow-400 font-black text-sm uppercase">{user.username[0]}</span>
        </div>
      )}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<MatchStatus, { label: string; icon: string; cls: string; glow?: string }> = {
  PENDING:   { label: 'PENDING',   icon: '⚡', cls: 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30', glow: 'badge-pending'  },
  ACTIVE:    { label: 'ACTIVE',    icon: '✨', cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', glow: 'badge-active' },
  DECLINED:  { label: 'DECLINED',  icon: '💔', cls: 'bg-zinc-700/30 text-zinc-500 border border-zinc-700/30' },
  COMPLETED: { label: 'COMPLETED', icon: '✓',  cls: 'bg-zinc-700/30 text-zinc-500 border border-zinc-700/30' },
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full ${m.cls} ${m.glow ?? ''}`}>
      <span>{m.icon}</span>{m.label}
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

  return (
    <div className="relative" style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
      <Link
        href={`/matches/${match.id}`}
        className="flex items-start gap-3 px-4 py-3.5 transition-colors"
        style={{ ':hover': { background: 'rgba(42,31,58,0.5)' } } as React.CSSProperties}
        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(42,31,58,0.5)'}
        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'}
      >
        {/* Avatar */}
        {other ? (
          <Avatar user={other} />
        ) : (
          <div className="w-11 h-11 rounded-full bg-zinc-800 flex-shrink-0" />
        )}

        {/* Body */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1.5 flex-wrap pr-1">
            <span className="text-white font-bold text-sm leading-tight">
              {other ? `@${other.username}` : '—'}
            </span>
            <StatusBadge status={match.status} />
            {match.lastMessage?.isUnread && (
              <span
                className="text-[11px] flex-shrink-0"
                style={{ animation: 'navBadgePulse 1.5s ease-in-out infinite', display: 'inline-block' }}
              >⚡</span>
            )}
          </div>

          {/* Location */}
          {other && (other.city || other.country_code) && (
            <p className="text-zinc-500 text-xs mt-0.5 leading-tight">
              {FLAGS[other.country_code] ?? ''}{other.city ? ` ${other.city}` : ''}
            </p>
          )}

          {/* Last message */}
          {match.lastMessage ? (
            <p className={`text-xs mt-1 line-clamp-1 leading-snug ${
              match.lastMessage.isUnread ? 'text-white font-semibold' : 'text-zinc-500'
            }`}>
              {match.lastMessage.content}
            </p>
          ) : (
            <p className="text-zinc-600 text-xs mt-1 italic leading-snug">No messages yet</p>
          )}

          {/* Accept / Decline — seller only on PENDING */}
          {isPendingSeller && (
            <div className="flex gap-2 mt-2.5" onClick={e => e.preventDefault()}>
              <button
                onClick={e => { e.preventDefault(); onAccept(match.id) }}
                disabled={acting}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black rounded-xl transition-colors disabled:opacity-40"
              >
                Accept
              </button>
              <button
                onClick={e => { e.preventDefault(); onDecline(match.id) }}
                disabled={acting}
                className="px-4 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-black rounded-xl transition-colors disabled:opacity-40"
              >
                Decline
              </button>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[10px] text-zinc-600 flex-shrink-0 mt-0.5">{timeAgo(timestamp)}</span>
      </Link>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const router = useRouter()
  const [matches,  setMatches]  = useState<MatchRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/matches-list', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login'); return }
    const data = await res.json()
    // Support both old shape (buying/selling) and new shape (matches)
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

  return (
    <main className="min-h-screen pb-28" style={{ background: 'radial-gradient(ellipse at 50% -10%, #2d1060 0%, #1a0830 40%, #0a0514 100%)' }}>

      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 backdrop-blur-sm px-4 py-3.5"
        style={{ background: 'rgba(10,5,20,0.96)', borderBottom: '1px solid rgba(139,92,246,0.18)' }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="text-white font-black text-base tracking-tight">Trades</h1>
          <div className="flex items-center gap-4">
            <Link href="/feed" className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest">
              Feed
            </Link>
            <Link href="/binder" className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest">
              Binder
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {loading ? (
          // Skeleton
          <div className="pt-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 animate-pulse" style={{ borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
                <div className="w-11 h-11 rounded-full flex-shrink-0" style={{ background: '#2a1f3a' }} />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="flex gap-2">
                    <div className="w-24 h-3 rounded" style={{ background: '#2a1f3a' }} />
                    <div className="w-14 h-3 rounded" style={{ background: '#2a1f3a' }} />
                  </div>
                  <div className="w-16 h-2.5 rounded" style={{ background: '#2a1f3a' }} />
                  <div className="w-48 h-2.5 rounded" style={{ background: '#2a1f3a' }} />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          // Empty state
          <div className="text-center py-20 px-8">
            <span className="text-5xl mb-5 block">💬</span>
            <h2 className="text-white font-black text-lg mb-2">No trades yet</h2>
            <p className="text-zinc-500 text-sm leading-relaxed mb-6">
              Browse the feed to find sellers and send your first trade request!
            </p>
            <Link
              href="/feed"
              className="inline-block bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl px-6 py-3 text-sm transition-colors"
            >
              Browse Feed →
            </Link>
          </div>
        ) : (
          // Match list
          <div className="pt-1">
            {sorted.map(match => (
              <MatchItem
                key={match.id}
                match={match}
                onAccept={handleAccept}
                onDecline={handleDecline}
                acting={actingId === match.id}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

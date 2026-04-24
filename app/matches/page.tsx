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

function StatusBadge({ status }: { status: MatchStatus }) {
  const styles: Record<MatchStatus, string> = {
    PENDING:   'bg-yellow-400/15 text-yellow-400',
    ACTIVE:    'bg-emerald-500/15 text-emerald-400',
    DECLINED:  'bg-zinc-500/20 text-zinc-500',
    COMPLETED: 'bg-zinc-500/20 text-zinc-500',
  }
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${styles[status]}`}>
      {status}
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
    <div className="relative border-b border-zinc-800/40 last:border-0">
      <Link
        href={`/matches/${match.id}`}
        className="flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-900/50 active:bg-zinc-900 transition-colors"
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
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
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
    <main className="min-h-screen bg-zinc-950 pb-28">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3.5">
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
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 border-b border-zinc-800/40 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-zinc-800 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="flex gap-2">
                    <div className="w-24 h-3 bg-zinc-800 rounded" />
                    <div className="w-14 h-3 bg-zinc-800 rounded" />
                  </div>
                  <div className="w-16 h-2.5 bg-zinc-800 rounded" />
                  <div className="w-48 h-2.5 bg-zinc-800 rounded" />
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

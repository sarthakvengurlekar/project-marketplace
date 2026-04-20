'use client'

import { useState, useEffect } from 'react'
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

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ user, size = 10 }: { user: OtherUser; size?: number }) {
  const cls = `w-${size} h-${size}`
  return (
    <div className={`relative ${cls} flex-shrink-0`}>
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt={user.username} fill className="rounded-full object-cover" unoptimized />
      ) : (
        <div className={`${cls} rounded-full bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center`}>
          <span className="text-yellow-400 font-black text-sm uppercase">{user.username[0]}</span>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: MatchStatus }) {
  const map: Record<MatchStatus, string> = {
    PENDING:   'bg-yellow-400/15 text-yellow-400',
    ACTIVE:    'bg-emerald-500/15 text-emerald-400',
    DECLINED:  'bg-red-500/15 text-red-400',
    COMPLETED: 'bg-zinc-500/20 text-zinc-500',
  }
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  )
}

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
  const isPendingSelling = match.role === 'SELLER' && match.status === 'PENDING'

  return (
    <div className="relative">
      <Link
        href={`/matches/${match.id}`}
        className="flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-900/60 active:bg-zinc-900 transition-colors"
      >
        {other ? (
          <Avatar user={other} size={11} />
        ) : (
          <div className="w-11 h-11 rounded-full bg-zinc-800 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white font-bold text-sm">
              {other ? `@${other.username}` : `user:${match.initiated_by.slice(0, 8)}`}
            </span>
            {other && <span className="text-base leading-none">{FLAGS[other.country_code] ?? ''}</span>}
            <StatusBadge status={match.status} />
            {match.lastMessage?.isUnread && (
              <span className="ml-auto w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            )}
          </div>
          {other?.city && (
            <p className="text-zinc-500 text-xs mt-0.5">{other.city}</p>
          )}
          {match.lastMessage ? (
            <p className={`text-xs mt-1 line-clamp-1 ${match.lastMessage.isUnread ? 'text-white font-semibold' : 'text-zinc-500'}`}>
              {match.lastMessage.content}
            </p>
          ) : (
            <p className="text-zinc-600 text-xs mt-1 italic">No messages yet</p>
          )}
          {isPendingSelling && (
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
        <span className="text-[10px] text-zinc-600 flex-shrink-0 pt-0.5">{timeAgo(match.created_at)}</span>
      </Link>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const router = useRouter()
  const [tab, setTab]       = useState<'buying' | 'selling'>('buying')
  const [buying, setBuying]   = useState<MatchRow[]>([])
  const [selling, setSelling] = useState<MatchRow[]>([])
  const [hasUnread, setHasUnread] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/matches-list')
    if (res.status === 401) { router.push('/login'); return }
    const data = await res.json()
    console.log('[matches-page] raw response:', JSON.stringify(data, null, 2))
    console.log('[matches-page] buying count:', data.buying?.length, 'selling count:', data.selling?.length)
    data.buying?.forEach((m: MatchRow, i: number) =>
      console.log(`[matches-page] buying[${i}]:`, m.id, 'otherUser:', m.otherUser)
    )
    data.selling?.forEach((m: MatchRow, i: number) =>
      console.log(`[matches-page] selling[${i}]:`, m.id, 'otherUser:', m.otherUser)
    )
    setBuying(data.buying ?? [])
    setSelling(data.selling ?? [])
    setHasUnread(data.hasUnread ?? false)
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

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
    setSelling(prev => prev.map(m =>
      m.id === matchId ? { ...m, status: 'DECLINED' as MatchStatus } : m
    ))
    setActingId(null)
  }

  const currentList  = tab === 'buying' ? buying : selling
  const buyingUnread  = buying.some(m => m.lastMessage?.isUnread)
  const sellingUnread = selling.some(m => m.lastMessage?.isUnread)

  return (
    <main className="min-h-screen bg-zinc-950 pb-16">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-black text-base tracking-tight">Matches</h1>
            <div className="flex items-center gap-4">
              <Link href="/feed" className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest">
                Feed
              </Link>
              <Link href="/binder" className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest">
                Binder
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-900 rounded-xl p-1">
            {(['buying', 'selling'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-black transition-all relative ${
                  tab === t
                    ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t === 'buying' ? 'Buying' : 'Selling'}
                {((t === 'buying' && buyingUnread) || (t === 'selling' && sellingUnread)) && (
                  <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-red-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="space-y-px pt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-zinc-800 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="w-28 h-3 bg-zinc-800 rounded" />
                  <div className="w-44 h-2.5 bg-zinc-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : currentList.length === 0 ? (
          <div className="text-center py-20 px-6">
            <span className="text-5xl mb-4 block">{tab === 'buying' ? '🛒' : '🏪'}</span>
            <h2 className="text-white font-black text-lg mb-2">
              {tab === 'buying' ? 'No requests sent yet' : 'No requests received yet'}
            </h2>
            <p className="text-zinc-500 text-sm leading-relaxed mb-6">
              {tab === 'buying'
                ? 'Tap Interested on sellers in the feed to start a trade.'
                : 'When someone is interested in your cards they\'ll appear here.'}
            </p>
            {tab === 'buying' && (
              <Link
                href="/feed"
                className="inline-block bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl px-6 py-3 text-sm transition-colors"
              >
                Browse Traders →
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40 pt-1">
            {currentList.map(match => (
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

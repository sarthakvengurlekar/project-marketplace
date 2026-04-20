'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────���───

type MatchStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'COMPLETED'
type Role = 'BUYER' | 'SELLER'

interface MatchData {
  id: string
  user_1_id: string
  user_2_id: string
  initiated_by: string
  status: MatchStatus
  created_at: string
}

interface OtherUser {
  id: string
  username: string
  avatar_url: string | null
  city: string | null
  country_code: string
  trade_rating: number | null
}

interface SellerCard {
  id: string
  condition: string | null
  is_foil: boolean
  cards: { id: string; name: string; image_url: string } | null
}

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
}

// ─── Constants ─────────────────────���────────────────────────────────���─────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }
const CONDITION_COLOURS: Record<string, string> = {
  NM: 'text-emerald-400', LP: 'text-lime-400', MP: 'text-yellow-400', HP: 'text-red-400',
}

// ─── Stars ───────────────────────��────────────────────────────────────────────

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-zinc-500 text-xs">New trader</span>
  const filled = Math.min(5, Math.max(0, Math.round(rating)))
  return (
    <span>
      <span className="text-yellow-400 text-xs">{'★'.repeat(filled)}{'☆'.repeat(5 - filled)}</span>
      <span className="text-zinc-400 text-xs ml-1">{rating.toFixed(1)}</span>
    </span>
  )
}

// ─── Rating modal ───────────────────────────────���──────────────────────────��──

function RatingModal({
  otherUsername,
  onSubmit,
  onClose,
}: {
  otherUsername: string
  onSubmit: (stars: number, comment: string) => Promise<void>
  onClose: () => void
}) {
  const [stars, setStars]         = useState(5)
  const [comment, setComment]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    await onSubmit(stars, comment)
    setDone(true)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 w-full max-w-sm">
        {done ? (
          <div className="text-center py-4">
            <span className="text-4xl mb-3 block">🎉</span>
            <p className="text-white font-black text-lg">Trade complete!</p>
            <p className="text-zinc-400 text-sm mt-2">Thanks for trading on projecttrading.</p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-white font-black text-lg mb-1">Rate this trade</h2>
            <p className="text-zinc-400 text-sm mb-5">How was your experience with @{otherUsername}?</p>
            <div className="flex justify-center gap-3 mb-5">
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setStars(s)}
                  className={`text-3xl transition-transform hover:scale-110 ${s <= stars ? 'text-yellow-400' : 'text-zinc-700'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Optional comment…"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-yellow-400 resize-none mb-4 transition-all"
            />
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 text-zinc-400 hover:text-white text-sm font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-black rounded-xl text-sm transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────��─────────────────────────────────���───────

export default function ChatPage() {
  const params  = useParams<{ match_id: string }>()
  const matchId = params.match_id
  const router  = useRouter()

  const [match, setMatch]               = useState<MatchData | null>(null)
  const [otherUser, setOtherUser]       = useState<OtherUser | null>(null)
  const [sellerCards, setSellerCards]   = useState<SellerCard[]>([])
  const [messages, setMessages]         = useState<Message[]>([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [role, setRole]                 = useState<Role>('BUYER')
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [acting, setActing]     = useState(false)
  const [showRating, setShowRating] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  async function loadData() {
    const res = await fetch(`/api/match-detail?match_id=${matchId}`)
    console.log('[chat] match-detail status:', res.status)
    if (res.status === 401) { router.push('/login'); return }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(err.error ?? 'Match not found')
      setLoading(false)
      return
    }
    const data = await res.json()
    console.log('[chat] match-detail response:', data)
    setMatch(data.match)
    setOtherUser(data.otherUser)
    setSellerCards(data.sellerCards ?? [])
    setMessages(data.messages ?? [])
    setCurrentUserId(data.currentUserId)
    setRole(data.role)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [matchId]) // eslint-disable-line

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Realtime subscription
  useEffect(() => {
    if (!matchId) return
    const channel = supabase
      .channel(`chat-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        payload => {
          const msg = payload.new as Message
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [matchId])

  async function handleSend() {
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)

    // Optimistic bubble
    const optimisticId = `opt-${Date.now()}`
    setMessages(prev => [...prev, {
      id: optimisticId, sender_id: currentUserId,
      content, created_at: new Date().toISOString(), read_at: null,
    }])

    const res = await fetch('/api/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: matchId, content }),
    })
    const data = await res.json()
    if (res.ok && data.message) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? data.message : m))
    } else {
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setInput(content)
      console.error('[chat] send error:', data.error)
    }
    setSending(false)
  }

  async function handleAccept() {
    setActing(true)
    await fetch(`/api/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
    setMatch(prev => prev ? { ...prev, status: 'ACTIVE' } : prev)
    setActing(false)
  }

  async function handleDecline() {
    setActing(true)
    await fetch(`/api/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DECLINED' }),
    })
    setMatch(prev => prev ? { ...prev, status: 'DECLINED' } : prev)
    setActing(false)
  }

  async function handleRate(stars: number, comment: string) {
    await fetch(`/api/matches/${matchId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars, comment }),
    })
    setMatch(prev => prev ? { ...prev, status: 'COMPLETED' } : prev)
  }

  function formatTime(iso: string) {
    const d    = new Date(iso)
    const diffH = (Date.now() - d.getTime()) / 3600000
    if (diffH < 20) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const canType = !!match
    && match.status !== 'DECLINED'
    && match.status !== 'COMPLETED'
    && !(role === 'SELLER' && match.status === 'PENDING')

  // ── Loading ────────────────────────────────────���─────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col">
        <div className="sticky top-0 z-20 bg-zinc-950 border-b border-zinc-900 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
            <div className="w-32 h-4 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  if (error || !match) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-4xl mb-4">⚠️</span>
        <p className="text-white font-bold mb-2">{error ?? 'Match not found'}</p>
        <p className="text-zinc-500 text-sm mb-6">Match ID: {matchId}</p>
        <Link href="/matches" className="text-yellow-400 text-sm font-bold">← Back to Matches</Link>
      </main>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3 flex-shrink-0">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link
            href="/matches"
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm flex-shrink-0"
          >
            ←
          </Link>

          <div className="relative w-9 h-9 flex-shrink-0">
            {otherUser?.avatar_url ? (
              <Image src={otherUser.avatar_url} alt={otherUser.username} fill className="rounded-full object-cover" unoptimized />
            ) : (
              <div className="w-9 h-9 rounded-full bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
                <span className="text-yellow-400 font-black text-sm uppercase">
                  {otherUser?.username?.[0] ?? '?'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-black text-sm">
                {otherUser
                  ? `@${otherUser.username}`
                  : `user:${(match.user_1_id === currentUserId ? match.user_2_id : match.user_1_id).slice(0, 8)}`}
              </span>
              {otherUser && <span className="text-sm leading-none">{FLAGS[otherUser.country_code] ?? ''}</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {otherUser?.city && <span className="text-zinc-500 text-[11px]">{otherUser.city} ·</span>}
              <Stars rating={otherUser?.trade_rating ?? null} />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {otherUser && (
              <Link
                href={`/binder/${otherUser.username}`}
                className="text-[11px] font-bold text-yellow-400 hover:text-yellow-300 transition-colors"
              >
                Binder →
              </Link>
            )}
            {match.status === 'ACTIVE' && (
              <button
                onClick={() => setShowRating(true)}
                className="text-[11px] font-black text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1.5 rounded-xl transition-all"
              >
                ✓ Complete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Status banners ───────────────────────────��─────────────────────── */}
      {match.status === 'PENDING' && role === 'SELLER' && (
        <div className="flex-shrink-0 bg-yellow-400/10 border-b border-yellow-400/20 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <p className="text-yellow-300 text-sm font-semibold leading-snug">
              {otherUser ? `@${otherUser.username}` : 'Someone'} is interested in your collection
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleAccept}
                disabled={acting}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-black rounded-xl disabled:opacity-50 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={handleDecline}
                disabled={acting}
                className="px-4 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-black rounded-xl disabled:opacity-50 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {match.status === 'PENDING' && role === 'BUYER' && (
        <div className="flex-shrink-0 bg-blue-500/10 border-b border-blue-500/20 px-4 py-3">
          <p className="max-w-lg mx-auto text-blue-300 text-sm font-semibold">
            ⏳ Waiting for {otherUser ? `@${otherUser.username}` : 'the seller'} to accept your request
          </p>
        </div>
      )}

      {match.status === 'DECLINED' && (
        <div className="flex-shrink-0 bg-zinc-800/50 border-b border-zinc-700 px-4 py-3">
          <p className="max-w-lg mx-auto text-zinc-400 text-sm font-semibold">This request was declined</p>
        </div>
      )}

      {match.status === 'COMPLETED' && (
        <div className="flex-shrink-0 bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-3">
          <p className="max-w-lg mx-auto text-emerald-400 text-sm font-semibold">✓ Trade completed</p>
        </div>
      )}

      {/* ── Seller cards strip ───────────────────────���──────────────────────── */}
      {sellerCards.length > 0 && (
        <div className="flex-shrink-0 bg-zinc-900/50 border-b border-zinc-800 px-4 py-3">
          <div className="max-w-lg mx-auto">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Available for trade</p>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {sellerCards.map(item => (
                <div key={item.id} className="flex-shrink-0 w-[54px]" style={{ scrollSnapAlign: 'start' }}>
                  <div className="relative w-[54px] h-[76px] rounded-lg overflow-hidden bg-zinc-800">
                    {item.cards?.image_url && (
                      <Image src={item.cards.image_url} alt={item.cards.name ?? ''} fill sizes="54px" className="object-contain" unoptimized />
                    )}
                    {item.is_foil && (
                      <span className="absolute top-0.5 right-0.5 text-[7px] font-black bg-yellow-400/80 text-black px-0.5 rounded leading-3">✦</span>
                    )}
                  </div>
                  {item.condition && (
                    <p className={`text-[8px] font-bold text-center mt-0.5 ${CONDITION_COLOURS[item.condition] ?? 'text-zinc-500'}`}>
                      {item.condition}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-2">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">👋</span>
              </div>
              <p className="text-white font-bold text-sm mb-1">
                {role === 'BUYER' ? 'Say hi to kick things off!' : 'Accept to start chatting.'}
              </p>
              {role === 'BUYER' && otherUser && (
                <p className="text-zinc-500 text-sm">
                  Tell @{otherUser.username} what you&apos;re looking to trade.
                </p>
              )}
            </div>
          )}

          {messages.map(msg => {
            const isMe = msg.sender_id === currentUserId
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                      isMe
                        ? 'bg-yellow-400 text-black font-medium rounded-br-sm'
                        : 'bg-zinc-800 text-white rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-zinc-600 px-1">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input bar ──────────────────────────────────────────────��───────── */}
      <div className="sticky bottom-0 flex-shrink-0 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-900 px-4 py-3">
        <div className="max-w-lg mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            disabled={!canType}
            placeholder={
              match.status === 'DECLINED'  ? 'This request was declined' :
              match.status === 'COMPLETED' ? 'Trade completed' :
              role === 'SELLER' && match.status === 'PENDING' ? 'Accept the request to chat…' :
              'Type a message…'
            }
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/30 disabled:opacity-40 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!canType || !input.trim() || sending}
            className="w-11 h-11 rounded-xl bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:opacity-30 flex items-center justify-center transition-all text-black font-black text-base flex-shrink-0"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              : '↑'
            }
          </button>
        </div>
      </div>

      {/* ── Rating modal ──────────��────────────────────────────────────────── */}
      {showRating && otherUser && (
        <RatingModal
          otherUsername={otherUser.username}
          onSubmit={handleRate}
          onClose={() => setShowRating(false)}
        />
      )}
    </main>
  )
}

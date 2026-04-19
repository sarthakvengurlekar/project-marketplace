'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchRow {
  id: string
  user1_id: string
  user2_id: string
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

interface PreviewCard {
  id: string
  is_foil: boolean
  cards: { id: string; name: string; image_url: string }
}

interface Message {
  id: string
  sender_id: string
  content: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchDetailPage() {
  const params = useParams()
  const matchId = params.match_id as string
  const router = useRouter()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null)
  const [theirCards, setTheirCards] = useState<PreviewCard[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msgError, setMsgError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setCurrentUserId(user.id)

      // Fetch match row
      const { data: matchRow, error: matchErr } = await supabase
        .from('matches')
        .select('id, user1_id, user2_id, created_at')
        .eq('id', matchId)
        .maybeSingle()

      if (matchErr || !matchRow) {
        console.error('[match-detail] match not found:', matchErr)
        router.replace('/matches')
        return
      }

      const row = matchRow as MatchRow
      const otherId = row.user1_id === user.id ? row.user2_id : row.user1_id

      // Fetch other user's profile in parallel with their cards
      const [profileRes, cardsRes, messagesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, avatar_url, city, country_code, trade_rating')
          .eq('id', otherId)
          .maybeSingle(),
        supabase
          .from('user_cards')
          .select('id, is_foil, cards(id, name, image_url)')
          .eq('user_id', otherId)
          .eq('list_type', 'HAVE')
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('messages')
          .select('id, sender_id, content, created_at')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true }),
      ])

      if (profileRes.data) setOtherUser(profileRes.data as OtherUser)
      if (cardsRes.data) setTheirCards(cardsRes.data as unknown as PreviewCard[])
      if (!messagesRes.error && messagesRes.data) setMessages(messagesRes.data as Message[])
      if (messagesRes.error) setMsgError(true)

      setLoading(false)
    }
    load()
  }, [matchId, router])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Realtime subscription for new messages
  useEffect(() => {
    if (msgError) return
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new as Message]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [matchId, msgError])

  async function handleSend() {
    if (!msgText.trim() || !currentUserId || sending) return
    const content = msgText.trim()
    setMsgText('')
    setSending(true)

    const optimisticId = `opt-${Date.now()}`
    const optimistic: Message = {
      id: optimisticId,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])

    const { data, error } = await supabase
      .from('messages')
      .insert({ match_id: matchId, sender_id: currentUserId, content })
      .select('id, sender_id, content, created_at')
      .single()

    if (error) {
      console.error('[match-detail] send error:', error)
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
      setMsgText(content)
      setMsgError(true)
    } else if (data) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? data as Message : m))
    }

    setSending(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col">
        <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
            <div className="h-4 bg-zinc-800 rounded w-32 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    )
  }

  if (!otherUser) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-4xl mb-4">⚠️</span>
        <p className="text-white font-bold mb-4">Match not found.</p>
        <Link href="/matches" className="text-yellow-400 text-sm font-bold">← Back to Matches</Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3 flex-shrink-0">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link
            href="/matches"
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm flex-shrink-0"
          >
            ←
          </Link>

          <div className="relative w-9 h-9 flex-shrink-0">
            {otherUser.avatar_url ? (
              <Image
                src={otherUser.avatar_url}
                alt={otherUser.username}
                fill
                className="rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
                <span className="text-yellow-400 font-black text-sm uppercase">{otherUser.username[0]}</span>
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-white font-black text-sm">@{otherUser.username}</span>
              <span className="text-sm">{FLAGS[otherUser.country_code] ?? ''}</span>
            </div>
            <p className="text-zinc-500 text-[11px] truncate">
              {otherUser.city ?? 'Trader'} · <Stars rating={otherUser.trade_rating} />
            </p>
          </div>

          <Link
            href={`/binder/${otherUser.username}`}
            className="flex-shrink-0 text-[11px] font-bold text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            Binder →
          </Link>
        </div>
      </div>

      {/* Their cards strip */}
      {theirCards.length > 0 && (
        <div className="flex-shrink-0 bg-zinc-900/60 border-b border-zinc-800 px-4 py-3">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">
            {otherUser.username}&apos;s cards for trade
          </p>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollSnapType: 'x mandatory' } as React.CSSProperties}
          >
            {theirCards.map(item => (
              <div
                key={item.id}
                className="flex-shrink-0 w-[56px]"
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="relative w-[56px] h-[78px] rounded-lg overflow-hidden bg-zinc-800">
                  <Image
                    src={item.cards.image_url}
                    alt={item.cards.name}
                    fill
                    sizes="56px"
                    className="object-contain"
                    unoptimized
                  />
                  {item.is_foil && (
                    <span className="absolute top-0.5 right-0.5 text-[7px] font-black bg-yellow-400/80 text-black px-0.5 rounded leading-3">
                      ✦
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">
        {msgError ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">
              Messaging not set up yet. Contact your match via their binder profile.
            </p>
            <Link
              href={`/binder/${otherUser.username}`}
              className="mt-3 inline-block text-yellow-400 text-sm font-bold hover:text-yellow-300"
            >
              View @{otherUser.username}&apos;s Binder →
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">👋</span>
            </div>
            <p className="text-white font-bold text-sm mb-1">It&apos;s a match!</p>
            <p className="text-zinc-500 text-sm">
              You and @{otherUser.username} both want to trade.<br />Say hi to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map(msg => {
              const isMe = msg.sender_id === currentUserId
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                    <div
                      className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                        isMe
                          ? 'bg-yellow-400 text-black font-medium rounded-br-sm'
                          : 'bg-zinc-800 text-white rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-zinc-600 px-1">{timeAgo(msg.created_at)}</span>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input */}
      {!msgError && (
        <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3 max-w-lg mx-auto w-full">
          <div className="flex gap-2">
            <input
              type="text"
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Say something…"
              className="flex-1 bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!msgText.trim() || sending}
              className="w-11 h-11 rounded-xl bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:opacity-40 flex items-center justify-center transition-all text-black font-black text-base flex-shrink-0"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : '↑'}
            </button>
          </div>
        </div>
      )}

    </main>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { COUNTRIES } from '@/lib/currency'
import { useCountry } from '@/lib/context/CountryContext'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface MyCard {
  id: string
  condition: string | null
  is_foil: boolean
  cards: { id: string; name: string; image_url: string | null; set_name: string | null } | null
}

interface OfferPayload {
  userCardId: string
  cardId: string
  cardName: string
  imageUrl: string | null
  setName: string | null
  condition: string | null
  isFoil: boolean
  marketUsd: number | null
  marketLocal: number | null
  currency: string
  offerAmount: number
  historyPoints: { date: string; price: number }[]
}

interface CardPriceData {
  price: { market: number | null; inr: number | null; aed: number | null } | null
  history: { date: string; price: number; volume: number }[]
}

// ─── Price sparkline ──────────────────────────────────────────────────────────

function PriceSparkline({ history }: { history: { date: string; price: number }[] }) {
  const pts = history.slice(-14)
  if (pts.length < 2) return null
  const min = Math.min(...pts.map(p => p.price))
  const max = Math.max(...pts.map(p => p.price))
  const range = max - min || 1
  const W = 200, H = 36
  const points = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = H - ((p.price - min) / range) * (H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 36, display: 'block' }}>
      <polyline points={points} fill="none" stroke="#E8233B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Offer modal ──────────────────────────────────────────────────────────────

function OfferModal({
  currentUserId,
  countryCode,
  onSend,
  onClose,
}: {
  currentUserId: string
  countryCode: string
  onSend: (content: string) => void
  onClose: () => void
}) {
  const [cards, setCards]             = useState<MyCard[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<MyCard | null>(null)
  const [priceData, setPriceData]     = useState<CardPriceData | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [offerAmt, setOfferAmt]       = useState('')

  useEffect(() => {
    supabase
      .from('user_cards')
      .select('id, condition, is_foil, cards(id, name, image_url, set_name)')
      .eq('user_id', currentUserId)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCards((data ?? []) as unknown as MyCard[])
        setLoading(false)
      })
  }, [currentUserId])

  async function selectCard(card: MyCard) {
    setSelected(card)
    setOfferAmt('')
    setPriceData(null)
    if (!card.cards?.id) return
    setPriceLoading(true)
    const res = await fetch(`/api/card-detail?card_id=${card.cards.id}`)
    if (res.ok) setPriceData(await res.json())
    setPriceLoading(false)
  }

  function handleSend() {
    if (!selected || !offerAmt || isNaN(parseFloat(offerAmt)) || parseFloat(offerAmt) <= 0) return
    const isIN = countryCode === 'IN'
    const payload: OfferPayload = {
      userCardId:    selected.id,
      cardId:        selected.cards?.id ?? '',
      cardName:      selected.cards?.name ?? 'Unknown card',
      imageUrl:      selected.cards?.image_url ?? null,
      setName:       selected.cards?.set_name ?? null,
      condition:     selected.condition,
      isFoil:        selected.is_foil,
      marketUsd:     priceData?.price?.market ?? null,
      marketLocal:   priceData?.price ? (isIN ? priceData.price.inr : priceData.price.aed) : null,
      currency:      isIN ? 'INR' : 'AED',
      offerAmount:   parseFloat(offerAmt),
      historyPoints: (priceData?.history ?? []).slice(-14).map(h => ({ date: h.date, price: h.price })),
    }
    onSend(`[OFFER]:${JSON.stringify(payload)}`)
    onClose()
  }

  const symbol      = COUNTRIES[countryCode]?.symbol ?? '₹'
  const marketLocal = priceData?.price ? (countryCode === 'IN' ? priceData.price.inr : priceData.price.aed) : null
  const offerNum    = parseFloat(offerAmt)
  const valid       = offerAmt && !isNaN(offerNum) && offerNum > 0

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.65)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        background: '#FAF6EC', border: '2px solid #0A0A0A', borderBottom: 'none',
        boxShadow: '0 -4px 0 #0A0A0A',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '2px solid #0A0A0A', flexShrink: 0 }}>
          <div>
            <h2 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, margin: 0 }}>
              {selected ? selected.cards?.name ?? 'Card selected' : 'Select a card to offer'}
            </h2>
            <p style={{ color: '#8B7866', fontSize: 11, margin: '2px 0 0' }}>
              {selected ? 'Set your offer price' : 'From your binder'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#0A0A0A', color: '#FAF6EC', border: 'none', width: 28, height: 28, fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
          {!selected ? (
            loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div style={{ width: 28, height: 28, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'chatSpin 0.8s linear infinite' }} />
              </div>
            ) : cards.length === 0 ? (
              <p style={{ color: '#8B7866', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>No cards in your binder yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {cards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => selectCard(card)}
                    style={{
                      background: '#FAF6EC', border: '2px solid #0A0A0A', padding: 0,
                      cursor: 'pointer', textAlign: 'left',
                      borderRadius: 10, overflow: 'hidden',
                      boxShadow: '3px 3px 0 #0A0A0A',
                    }}
                  >
                    <div style={{ height: 110, position: 'relative', background: '#f0ece2', borderBottom: '2px solid #0A0A0A' }}>
                      {card.cards?.image_url ? (
                        <Image src={card.cards.image_url} alt={card.cards.name ?? ''} fill sizes="33vw" className="object-contain p-1.5" unoptimized />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, opacity: 0.3 }}>🃏</div>
                      )}
                    </div>
                    <div style={{ padding: '6px 7px' }}>
                      <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 10, margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.cards?.name ?? '—'}</p>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 2 }}>{card.condition ?? 'NM'}</span>
                        {card.is_foil && <span style={{ background: '#F4D03F', color: '#0A0A0A', fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 2, border: '1px solid #0A0A0A' }}>FOIL</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div>
              <button onClick={() => { setSelected(null); setPriceData(null) }} style={{ background: 'none', border: 'none', color: '#E8233B', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '0 0 16px 0', display: 'block' }}>
                ← Choose a different card
              </button>

              {/* Card preview */}
              <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                <div style={{ width: 80, flexShrink: 0, border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', overflow: 'hidden', position: 'relative', background: '#f0ece2' }}>
                  <div style={{ aspectRatio: '2.5/3.5', position: 'relative' }}>
                    {selected.cards?.image_url ? (
                      <Image src={selected.cards.image_url} alt={selected.cards.name ?? ''} fill sizes="80px" className="object-contain" unoptimized />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.3 }}>🃏</div>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15, margin: '0 0 3px' }}>{selected.cards?.name ?? '—'}</p>
                  {selected.cards?.set_name && <p style={{ color: '#8B7866', fontSize: 12, margin: '0 0 8px' }}>{selected.cards.set_name}</p>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {selected.condition && <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 9, fontWeight: 900, padding: '2px 6px' }}>{selected.condition}</span>}
                    {selected.is_foil && <span style={{ background: '#F4D03F', color: '#0A0A0A', fontSize: 9, fontWeight: 900, padding: '2px 6px', border: '1px solid #0A0A0A' }}>FOIL</span>}
                  </div>
                </div>
              </div>

              {/* Market price + history */}
              {priceLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', marginBottom: 16 }}>
                  <div style={{ width: 16, height: 16, border: '2px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'chatSpin 0.8s linear infinite', flexShrink: 0 }} />
                  <p style={{ color: '#8B7866', fontSize: 12, margin: 0 }}>Fetching market price…</p>
                </div>
              ) : priceData ? (
                <div style={{ border: '2px solid #0A0A0A', marginBottom: 20, overflow: 'hidden' }}>
                  <div style={{ background: '#0A0A0A', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8B7866', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Market Price</span>
                    {priceData.price ? (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#E8233B', fontWeight: 900, fontSize: 18 }}>
                          {symbol}{marketLocal?.toLocaleString('en-IN') ?? '—'}
                        </span>
                        {priceData.price.market != null && (
                          <span style={{ color: '#8B7866', fontSize: 10, display: 'block' }}>${priceData.price.market.toFixed(2)} USD</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#8B7866', fontSize: 12 }}>No data</span>
                    )}
                  </div>
                  {priceData.history.length >= 2 && (
                    <div style={{ padding: '10px 14px', borderTop: '2px solid #0A0A0A' }}>
                      <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>30-Day History</p>
                      <PriceSparkline history={priceData.history} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ color: '#8B7866', fontSize: 9 }}>{priceData.history[0]?.date?.slice(0, 10)}</span>
                        <span style={{ color: '#8B7866', fontSize: 9 }}>{priceData.history[priceData.history.length - 1]?.date?.slice(0, 10)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Offer input */}
              <div>
                <label style={{ display: 'block', color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Your Offer</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #0A0A0A', overflow: 'hidden' }}>
                  <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 14, padding: '12px 14px', flexShrink: 0 }}>{symbol}</span>
                  <input
                    type="number"
                    value={offerAmt}
                    onChange={e => setOfferAmt(e.target.value)}
                    placeholder="Enter amount"
                    min="0"
                    style={{ flex: 1, background: '#FAF6EC', border: 'none', color: '#0A0A0A', fontSize: 18, fontWeight: 700, padding: '12px 14px', outline: 'none' }}
                  />
                </div>
                {marketLocal != null && valid && (
                  <p style={{ fontSize: 12, margin: '6px 0 0', fontWeight: 700, color: offerNum < marketLocal ? '#E8233B' : '#16a34a' }}>
                    {offerNum < marketLocal
                      ? `${symbol}${(marketLocal - offerNum).toLocaleString('en-IN')} below market`
                      : `${symbol}${(offerNum - marketLocal).toLocaleString('en-IN')} above market`
                    }
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {selected && (
          <div style={{ padding: '12px 16px', borderTop: '2px solid #0A0A0A', flexShrink: 0 }}>
            <button
              onClick={handleSend}
              disabled={!valid}
              style={{ width: '100%', padding: '14px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: valid ? '3px 3px 0 #0A0A0A' : 'none', color: '#FAF6EC', fontWeight: 900, fontSize: 14, cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.4 }}
            >
              Send Offer
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Rating modal ─────────────────────────────────────────────────────────────

function RatingModal({
  otherUsername,
  onSubmit,
  onClose,
}: {
  otherUsername: string
  onSubmit: (stars: number, comment: string) => Promise<void>
  onClose: () => void
}) {
  const [stars, setStars]           = useState(5)
  const [comment, setComment]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    await onSubmit(stars, comment)
    setDone(true)
    setSubmitting(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', padding: 24, width: '100%', maxWidth: 440 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🎉</span>
            <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 18, margin: 0 }}>Trade complete!</p>
            <p style={{ color: '#8B7866', fontSize: 13, margin: '8px 0 0' }}>Thanks for trading on projecttrading.</p>
            <button
              onClick={onClose}
              style={{ marginTop: 20, width: '100%', padding: '12px 0', background: '#E8233B', color: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', fontWeight: 900, fontSize: 14, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 18, margin: '0 0 4px' }}>Rate this trade</h2>
            <p style={{ color: '#8B7866', fontSize: 13, margin: '0 0 20px' }}>How was your experience with @{otherUsername}?</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setStars(s)}
                  style={{ background: 'none', border: 'none', fontSize: 30, cursor: 'pointer', color: s <= stars ? '#F4D03F' : '#e8e2d4' }}
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
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#FAF6EC', border: '2px solid #0A0A0A',
                color: '#0A0A0A', fontSize: 13, padding: '10px 12px',
                resize: 'none', outline: 'none', marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: '12px 0', background: '#FAF6EC', border: '2px solid #0A0A0A', color: '#8B7866', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ flex: 1, padding: '12px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const params  = useParams<{ match_id: string }>()
  const matchId = params.match_id
  const router  = useRouter()
  const { countryCode } = useCountry()

  const [match,          setMatch]          = useState<MatchData | null>(null)
  const [otherUser,      setOtherUser]      = useState<OtherUser | null>(null)
  const [sellerCards,    setSellerCards]    = useState<SellerCard[]>([])
  const [messages,       setMessages]       = useState<Message[]>([])
  const [currentUserId,  setCurrentUserId]  = useState('')
  const [role,           setRole]           = useState<Role>('BUYER')
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [input,          setInput]          = useState('')
  const [sending,        setSending]        = useState(false)
  const [acting,         setActing]         = useState(false)
  const [showRating,     setShowRating]     = useState(false)
  const [offerOpen,      setOfferOpen]      = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  async function loadData() {
    const res = await fetch(`/api/match-detail?match_id=${matchId}`)
    if (res.status === 401) { router.push('/login'); return }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(err.error ?? 'Match not found')
      setLoading(false)
      return
    }
    const data = await res.json()
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

  async function directSend(content: string) {
    if (!content || sending) return
    setSending(true)
    const optimisticId = `opt-${Date.now()}`
    setMessages(prev => [...prev, { id: optimisticId, sender_id: currentUserId, content, created_at: new Date().toISOString(), read_at: null }])
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
    }
    setSending(false)
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    setSending(true)

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
    const d     = new Date(iso)
    const diffH = (Date.now() - d.getTime()) / 3600000
    if (diffH < 20) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  function formatDateLabel(iso: string) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase()
  }

  const canType = !!match
    && match.status !== 'DECLINED'
    && match.status !== 'COMPLETED'
    && !(role === 'SELLER' && match.status === 'PENDING')

  const initials = otherUser?.username?.[0]?.toUpperCase() ?? '?'

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#FAF6EC' }}>
        <div style={{ padding: '14px 16px', borderBottom: '2px solid #0A0A0A', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: '#e8e2d4', border: '2px solid #0A0A0A' }} className="animate-pulse" />
          <div style={{ width: 44, height: 44, background: '#e8e2d4', border: '2px solid #0A0A0A' }} className="animate-pulse" />
          <div style={{ flex: 1, height: 14, background: '#e8e2d4', borderRadius: 2 }} className="animate-pulse" />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'chatSpin 0.8s linear infinite' }} />
        </div>
        <style>{`@keyframes chatSpin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  if (error || !match) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', background: '#FAF6EC' }}>
        <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>⚠️</span>
        <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, marginBottom: 8 }}>{error ?? 'Match not found'}</p>
        <Link href="/matches" style={{ color: '#E8233B', fontWeight: 800, fontSize: 14 }}>← Back to Trades</Link>
      </main>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#FAF6EC' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position:     'sticky',
          top:          0,
          zIndex:       20,
          background:   '#FAF6EC',
          borderBottom: '2px solid #0A0A0A',
          flexShrink:   0,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          {/* Back */}
          <Link
            href="/matches"
            style={{
              width:          36,
              height:         36,
              background:     '#F4D03F',
              border:         '2px solid #0A0A0A',
              boxShadow:      '2px 2px 0 #0A0A0A',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       16,
              fontWeight:     900,
              color:          '#0A0A0A',
              textDecoration: 'none',
              flexShrink:     0,
            }}
          >
            ←
          </Link>

          {/* Avatar */}
          <div style={{
            width:    44,
            height:   44,
            border:   '2px solid #0A0A0A',
            boxShadow: '2px 2px 0 #0A0A0A',
            overflow: 'hidden',
            flexShrink: 0,
            position: 'relative',
          }}>
            {otherUser?.avatar_url ? (
              <Image src={otherUser.avatar_url} alt={otherUser.username} fill className="object-cover" unoptimized />
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#E8233B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#FAF6EC', fontWeight: 900, fontSize: 18 }}>{initials}</span>
              </div>
            )}
          </div>

          {/* Name + status */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15, margin: 0, lineHeight: 1.2 }}>
              @{otherUser?.username ?? '—'}
            </p>
            <p style={{ color: '#E8233B', fontSize: 11, margin: '2px 0 0', fontWeight: 600 }}>
              {otherUser?.city ? `● Online · ${otherUser.city}` : '● Online'}
            </p>
          </div>

          {/* Binder link */}
          {otherUser && (
            <Link
              href={`/binder/${otherUser.username}`}
              style={{
                background:     '#FAF6EC',
                border:         '2px solid #0A0A0A',
                color:          '#0A0A0A',
                fontWeight:     900,
                fontSize:       11,
                padding:        '5px 10px',
                textDecoration: 'none',
                letterSpacing:  '0.05em',
                flexShrink:     0,
              }}
            >
              BINDER
            </Link>
          )}
        </div>
      </div>

      {/* ── Binder / Trade-in-progress banner ──────────────────────────────── */}
      {sellerCards.length > 0 && match.status !== 'DECLINED' && match.status !== 'COMPLETED' && (
        <div style={{ flexShrink: 0, background: '#F4D03F', border: '2px solid #0A0A0A', borderLeft: 'none', borderRight: 'none', padding: '12px 16px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#E8233B', border: '1.5px solid #0A0A0A', flexShrink: 0 }} />
              <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {match.status === 'ACTIVE' ? 'TRADE IN PROGRESS' : 'THEIR BINDER'}
              </span>
              <span style={{ color: '#0A0A0A', fontSize: 11, fontWeight: 600 }}>
                · {sellerCards.length} cards
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Card thumbnails */}
              <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                {sellerCards.map(item => (
                  <div key={item.id} style={{
                    width: 44, height: 62, position: 'relative', flexShrink: 0,
                    background: '#f0ece2', border: '2px solid #0A0A0A', overflow: 'hidden',
                  }}>
                    {item.cards?.image_url && (
                      <Image src={item.cards.image_url} alt={item.cards.name ?? ''} fill sizes="44px" className="object-contain" unoptimized />
                    )}
                  </div>
                ))}
              </div>
              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {match.status === 'ACTIVE' && (
                  <button
                    onClick={() => setShowRating(true)}
                    style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', color: '#0A0A0A', fontWeight: 900, fontSize: 12, padding: '5px 12px', cursor: 'pointer' }}
                  >
                    Complete
                  </button>
                )}
                {otherUser && (
                  <Link
                    href={`/binder/${otherUser.username}`}
                    style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', color: '#0A0A0A', fontWeight: 900, fontSize: 12, padding: '5px 12px', textDecoration: 'none', display: 'block', textAlign: 'center' }}
                  >
                    Binder
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending seller banner ───────────────────────────────────────────── */}
      {match.status === 'PENDING' && role === 'SELLER' && (
        <div style={{ flexShrink: 0, background: '#F4D03F', borderBottom: '2px solid #0A0A0A', padding: '12px 16px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ color: '#0A0A0A', fontWeight: 700, fontSize: 13, margin: 0 }}>
              ⚡ @{otherUser?.username ?? 'Someone'} is interested in your collection
            </p>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={handleAccept}
                disabled={acting}
                style={{ background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 12, padding: '6px 12px', cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.5 : 1 }}
              >
                Accept
              </button>
              <button
                onClick={handleDecline}
                disabled={acting}
                style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', color: '#0A0A0A', fontWeight: 900, fontSize: 12, padding: '6px 12px', cursor: acting ? 'not-allowed' : 'pointer', opacity: acting ? 0.5 : 1 }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {match.status === 'PENDING' && role === 'BUYER' && (
        <div style={{ flexShrink: 0, borderBottom: '2px solid #0A0A0A', padding: '10px 16px', background: '#FAF6EC' }}>
          <p style={{ maxWidth: 640, margin: '0 auto', color: '#8B7866', fontSize: 13, fontWeight: 600 }}>
            ⏳ Waiting for @{otherUser?.username ?? 'seller'} to accept your request
          </p>
        </div>
      )}

      {match.status === 'DECLINED' && (
        <div style={{ flexShrink: 0, borderBottom: '2px solid #0A0A0A', padding: '10px 16px', background: '#FAF6EC' }}>
          <p style={{ maxWidth: 640, margin: '0 auto', color: '#8B7866', fontSize: 13, fontWeight: 600 }}>
            ✕ This request was declined
          </p>
        </div>
      )}

      {match.status === 'COMPLETED' && (
        <div style={{ flexShrink: 0, borderBottom: '2px solid #0A0A0A', padding: '10px 16px', background: '#FAF6EC' }}>
          <p style={{ maxWidth: 640, margin: '0 auto', color: '#0A0A0A', fontSize: 13, fontWeight: 700 }}>
            ✓ Trade completed — well done!
          </p>
        </div>
      )}

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>👋</span>
              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15, margin: '0 0 6px' }}>
                {role === 'BUYER' ? 'Say hi to kick things off!' : 'Accept to start chatting.'}
              </p>
              {role === 'BUYER' && otherUser && (
                <p style={{ color: '#8B7866', fontSize: 13 }}>
                  Tell @{otherUser.username} what you&apos;re looking to trade.
                </p>
              )}
            </div>
          )}

          {messages.map((msg, idx) => {
            const isMe     = msg.sender_id === currentUserId
            const prevMsg  = messages[idx - 1]
            const showDate = !prevMsg || formatDateLabel(msg.created_at) !== formatDateLabel(prevMsg.created_at)
            const isOffer  = msg.content.startsWith('[OFFER]:')

            let offerPayload: OfferPayload | null = null
            if (isOffer) {
              try { offerPayload = JSON.parse(msg.content.slice('[OFFER]:'.length)) } catch { /* ignore */ }
            }

            return (
              <div key={msg.id}>
                {showDate && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                    <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 10, fontWeight: 900, padding: '3px 10px', letterSpacing: '0.08em' }}>
                      {formatDateLabel(msg.created_at)}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    {offerPayload ? (
                      // ── Full offer card (both sides); accept/decline only for receiver ──
                      <div style={{ border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', overflow: 'hidden', background: '#FAF6EC', width: 260 }}>
                          {/* Offer header */}
                          <div style={{ background: '#F4D03F', padding: '6px 12px', borderBottom: '2px solid #0A0A0A', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚡ Price Offer</span>
                          </div>
                          {/* Card row */}
                          <div style={{ display: 'flex', gap: 10, padding: '10px 12px' }}>
                            <div style={{ width: 52, flexShrink: 0, border: '2px solid #0A0A0A', overflow: 'hidden', position: 'relative', background: '#f0ece2' }}>
                              <div style={{ aspectRatio: '2.5/3.5', position: 'relative' }}>
                                {offerPayload.imageUrl ? (
                                  <Image src={offerPayload.imageUrl} alt={offerPayload.cardName} fill sizes="52px" className="object-contain" unoptimized />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: 0.3 }}>🃏</div>
                                )}
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 13, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offerPayload.cardName}</p>
                              {offerPayload.setName && <p style={{ color: '#8B7866', fontSize: 10, margin: '0 0 6px' }}>{offerPayload.setName}</p>}
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {offerPayload.condition && <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 8, fontWeight: 900, padding: '2px 5px' }}>{offerPayload.condition}</span>}
                                {offerPayload.isFoil && <span style={{ background: '#F4D03F', color: '#0A0A0A', fontSize: 8, fontWeight: 900, padding: '2px 5px', border: '1px solid #0A0A0A' }}>FOIL</span>}
                              </div>
                            </div>
                          </div>
                          {/* Price comparison */}
                          <div style={{ borderTop: '2px solid #0A0A0A', display: 'grid', gridTemplateColumns: offerPayload.marketLocal != null ? '1fr 1fr' : '1fr' }}>
                            {offerPayload.marketLocal != null && (
                              <div style={{ padding: '8px 12px', borderRight: '2px solid #0A0A0A' }}>
                                <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Market</p>
                                <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 14, margin: 0 }}>
                                  {offerPayload.currency === 'INR' ? '₹' : 'AED '}{offerPayload.marketLocal.toLocaleString('en-IN')}
                                </p>
                              </div>
                            )}
                            <div style={{ padding: '8px 12px', background: '#E8233B' }}>
                              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Offered</p>
                              <p style={{ color: '#FAF6EC', fontWeight: 900, fontSize: 14, margin: 0 }}>
                                {offerPayload.currency === 'INR' ? '₹' : 'AED '}{offerPayload.offerAmount.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>
                          {/* Sparkline */}
                          {offerPayload.historyPoints.length >= 2 && (
                            <div style={{ padding: '8px 12px', borderTop: '2px solid #0A0A0A' }}>
                              <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Price trend (30 days)</p>
                              <PriceSparkline history={offerPayload.historyPoints} />
                            </div>
                          )}
                          {/* Accept / Decline — receiver only */}
                          {!isMe && (
                            <div style={{ borderTop: '2px solid #0A0A0A', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                              <button
                                onClick={() => directSend(`✓ Offer accepted — ${offerPayload!.cardName} for ${offerPayload!.currency === 'INR' ? '₹' : 'AED '}${offerPayload!.offerAmount.toLocaleString('en-IN')}`)}
                                style={{ padding: '10px 0', background: '#0A0A0A', border: 'none', borderRight: '2px solid #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}
                              >
                                ✓ Accept
                              </button>
                              <button
                                onClick={() => directSend(`✗ Offer declined — ${offerPayload!.cardName}`)}
                                style={{ padding: '10px 0', background: '#FAF6EC', border: 'none', color: '#E8233B', fontWeight: 900, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}
                              >
                                ✗ Decline
                              </button>
                            </div>
                          )}
                      </div>
                    ) : (
                      // ── Regular message ────────────────────────────────
                      <div style={{
                        padding:    '10px 14px',
                        fontSize:   14,
                        fontWeight: 600,
                        lineHeight: 1.4,
                        wordBreak:  'break-word',
                        background: isMe ? '#E8233B' : '#FAF6EC',
                        color:      isMe ? '#FAF6EC' : '#0A0A0A',
                        border:     '2px solid #0A0A0A',
                        boxShadow:  isMe ? '3px 3px 0 #0A0A0A' : '2px 2px 0 #0A0A0A',
                      }}>
                        {msg.content}
                      </div>
                    )}
                    <span style={{ fontSize: 10, color: '#8B7866', paddingLeft: 2, paddingRight: 2 }}>
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div style={{
        position:     'sticky',
        bottom:       0,
        flexShrink:   0,
        background:   '#0A0A0A',
        borderTop:    '2px solid #0A0A0A',
        padding:      '10px 16px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {/* Main input row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* + attachment button */}
            <div style={{
              width:          44,
              height:         44,
              background:     '#F4D03F',
              border:         '2px solid #F4D03F',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
              fontSize:       20,
              fontWeight:     900,
              color:          '#0A0A0A',
            }}>
              +
            </div>

            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={!canType}
              placeholder={
                match.status === 'DECLINED'  ? 'This request was declined' :
                match.status === 'COMPLETED' ? 'Trade completed' :
                role === 'SELLER' && match.status === 'PENDING' ? 'Accept to chat…' :
                'Type a message…'
              }
              style={{
                flex:        1,
                background:  '#FAF6EC',
                border:      '2px solid #FAF6EC',
                color:       '#0A0A0A',
                fontSize:    14,
                padding:     '10px 14px',
                outline:     'none',
                opacity:     canType ? 1 : 0.5,
              }}
            />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canType || !input.trim() || sending}
              style={{
                width:          44,
                height:         44,
                background:     '#E8233B',
                border:         '2px solid #E8233B',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
                fontSize:       18,
                fontWeight:     900,
                color:          '#FAF6EC',
                cursor:         (!canType || !input.trim() || sending) ? 'not-allowed' : 'pointer',
                opacity:        (!canType || !input.trim() || sending) ? 0.4 : 1,
              }}
            >
              {sending
                ? <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FAF6EC', borderRadius: '50%', display: 'block', animation: 'chatSpin 0.7s linear infinite' }} />
                : '↑'
              }
            </button>
          </div>

          {/* Quick action chips */}
          {canType && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => setOfferOpen(true)}
                style={{ background: '#F4D03F', border: '1.5px solid #FAF6EC', color: '#0A0A0A', fontWeight: 800, fontSize: 11, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ⚡ Send Offer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Rating modal ─────────────────────────────────────────────────────── */}
      {showRating && otherUser && (
        <RatingModal
          otherUsername={otherUser.username}
          onSubmit={handleRate}
          onClose={() => setShowRating(false)}
        />
      )}

      {/* ── Offer modal ──────────────────────────────────────────────────────── */}
      {offerOpen && (
        <OfferModal
          currentUserId={currentUserId}
          countryCode={countryCode}
          onSend={directSend}
          onClose={() => setOfferOpen(false)}
        />
      )}

      <style>{`
        @keyframes chatSpin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  )
}

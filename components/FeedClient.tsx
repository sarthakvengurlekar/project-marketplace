'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreviewCard {
  id: string
  condition: string | null
  is_foil: boolean
  usd_price: number | null
  cards: {
    id: string
    name: string
    image_url: string
  }
}

export interface Seller {
  id: string
  username: string
  avatar_url: string | null
  city: string | null
  country_code: string
  trade_rating: number | null
  card_count: number
  preview_cards: PreviewCard[]
}

type CountryFilter = 'IN' | 'UAE' | 'BOTH'

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }

const CONDITION_COLOURS: Record<string, string> = {
  NM: 'text-emerald-400',
  LP: 'text-lime-400',
  MP: 'text-yellow-400',
  HP: 'text-red-400',
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-zinc-500 text-xs">New trader</span>
  const filled = Math.min(5, Math.max(0, Math.round(rating)))
  return (
    <span>
      <span className="text-yellow-400 text-xs tracking-tight">
        {'★'.repeat(filled)}{'☆'.repeat(5 - filled)}
      </span>
      <span className="text-zinc-400 text-xs ml-1">{rating.toFixed(1)}</span>
    </span>
  )
}

// ─── Seller card ──────────────────────────────────────────────────────────────

function SellerCard({
  seller,
  onSwipe,
  disabled,
}: {
  seller: Seller
  onSwipe: (id: string, username: string, dir: 'LIKE' | 'PASS') => void
  disabled: boolean
}) {
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background:  '#160e20',
        border:      '1px solid rgba(255,222,0,0.12)',
        boxShadow:   '0 0 0 1px rgba(124,83,140,0.12), 0 4px 24px rgba(0,0,0,0.4)',
        borderTop:   '2.5px solid rgba(255,222,0,0.35)',
      }}
    >

      {/* Profile header */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="relative w-12 h-12 flex-shrink-0">
            {seller.avatar_url ? (
              <Image
                src={seller.avatar_url}
                alt={seller.username}
                fill
                className="rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,222,0,0.2), rgba(255,107,53,0.15))',
                  border:     '1.5px solid rgba(255,222,0,0.35)',
                  boxShadow:  '0 0 10px rgba(255,222,0,0.15)',
                }}
              >
                <span className="font-black text-base uppercase" style={{ color: '#FFDE00' }}>
                  {seller.username[0]}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-white font-black text-sm leading-tight">@{seller.username}</span>
              <span className="text-base leading-none">{FLAGS[seller.country_code] ?? ''}</span>
            </div>
            <p className="text-zinc-500 text-xs mt-0.5 line-clamp-1">
              {[seller.city, `${seller.card_count} cards available`].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-1">
              <Stars rating={seller.trade_rating} />
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal card strip */}
      <div
        className="flex gap-2 px-4 pb-4 overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {seller.preview_cards.map(item => (
          <div
            key={item.id}
            className="flex-shrink-0 w-[72px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <Link href={`/binder/card/${encodeURIComponent(item.cards?.id ?? '')}`}>
              <div className="relative w-[72px] h-[100px] rounded-xl overflow-hidden" style={{ background: '#1a1028' }}>
                {item.cards?.image_url && (
                  <Image
                    src={item.cards.image_url}
                    alt={item.cards.name ?? ''}
                    fill
                    sizes="72px"
                    className="object-contain"
                    unoptimized
                  />
                )}
              </div>
            </Link>
            <p className="text-[10px] text-zinc-400 mt-1 leading-tight line-clamp-1 text-center">
              {item.cards?.name}
            </p>
            {item.condition && (
              <p className={`text-[9px] font-bold text-center ${CONDITION_COLOURS[item.condition] ?? 'text-zinc-500'}`}>
                {item.condition}
              </p>
            )}
            {item.usd_price != null && (
              <p className="text-[9px] font-bold text-center" style={{ color: '#FFDE00' }}>
                ${item.usd_price.toFixed(2)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* View collection link */}
      <div className="px-4 pb-3.5">
        <Link
          href={`/binder/${seller.username}`}
          className="text-yellow-400 hover:text-yellow-300 text-xs font-bold transition-colors"
        >
          View Full Collection →
        </Link>
      </div>

      {/* Pass / Interested */}
      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        <button
          onClick={() => onSwipe(seller.id, seller.username, 'PASS')}
          disabled={disabled}
          className="py-4 flex items-center justify-center gap-2 rounded-2xl text-sm font-black transition-all disabled:opacity-30"
          style={{
            background: 'rgba(238,21,21,0.1)',
            border:     '1px solid rgba(238,21,21,0.25)',
            color:      '#f87171',
          }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(238,21,21,0.35)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}
        >
          <span className="text-lg">✕</span> Pass
        </button>
        <button
          onClick={() => onSwipe(seller.id, seller.username, 'LIKE')}
          disabled={disabled}
          className="py-4 flex items-center justify-center gap-2 rounded-2xl text-sm font-black transition-all disabled:opacity-30"
          style={{
            background: 'linear-gradient(135deg, rgba(255,222,0,0.18) 0%, rgba(255,107,53,0.18) 100%)',
            border:     '1px solid rgba(255,222,0,0.3)',
            color:      '#FFDE00',
            boxShadow:  '0 0 14px rgba(255,222,0,0.12)',
          }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(255,222,0,0.35)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 14px rgba(255,222,0,0.12)' }}
        >
          <span className="text-lg">♥</span> Interested
        </button>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export default function FeedClient({
  sellers: initialSellers,
  currentUserId,
  defaultFilter,
}: {
  sellers: Seller[]
  currentUserId: string
  defaultFilter: string
}) {
  const router = useRouter()

  const [sellers, setSellers]           = useState<Seller[]>(initialSellers)
  const [countryFilter, setCountryFilter] = useState<CountryFilter>(defaultFilter as CountryFilter)
  const [searchQuery, setSearchQuery]   = useState('')
  const [swipingId, setSwipingId]       = useState<string | null>(null)
  const [toast, setToast]               = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const handleSwipe = useCallback(async (sellerId: string, sellerUsername: string, dir: 'LIKE' | 'PASS') => {
    if (swipingId) return
    setSwipingId(sellerId)

    // Optimistic remove
    setSellers(prev => prev.filter(s => s.id !== sellerId))

    try {
      const res = await fetch('/api/swipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swiped_id: sellerId }),
      })
      const data = await res.json() as { success?: boolean; matchId?: string | null; error?: string }
      console.log('[feed] swipe response:', data)

      if (!res.ok || data.error) {
        showToast(`Error: ${data.error ?? 'swipe failed'}`)
      } else if (dir === 'LIKE') {
        if (data.matchId) {
          showToast(`Trade request sent to @${sellerUsername}! Say hi to get started.`)
          setTimeout(() => router.push(`/matches/${data.matchId}`), 1600)
        } else {
          showToast(`Interested sent — waiting for @${sellerUsername} to match back.`)
        }
      }
    } catch (err) {
      console.error('[feed] swipe fetch error:', err)
      showToast('Something went wrong — please try again.')
    }

    setSwipingId(null)
  }, [swipingId, router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Country + search filter (client-side on already-fetched data) ─────────
  const visibleSellers = (() => {
    const afterCountry = countryFilter === 'BOTH'
      ? sellers
      : sellers.filter(s => s.country_code?.toUpperCase() === countryFilter)

    const q = searchQuery.trim().toLowerCase()
    return q
      ? afterCountry.filter(s =>
          s.preview_cards.some(c => c.cards?.name?.toLowerCase().includes(q))
        )
      : afterCountry
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen pb-28" style={{ background: 'radial-gradient(ellipse at 50% -10%, #2d1060 0%, #1a0830 40%, #0a0514 100%)' }}>

      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 backdrop-blur-sm px-4 py-3"
        style={{ background: 'rgba(10,5,20,0.96)', borderBottom: '1px solid rgba(139,92,246,0.18)' }}
      >
        <div className="max-w-lg mx-auto space-y-3">

          {/* Nav */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center shadow-md shadow-yellow-400/20">
                <span className="text-xs font-black text-black">PT</span>
              </div>
              <span className="text-white font-black text-base tracking-tight">projecttrading</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/binder" className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest">
                Binder
              </Link>
              <Link href="/matches" className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest">
                Matches
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Country toggle */}
          <div className="flex gap-2">
            {(['IN', 'UAE', 'BOTH'] as CountryFilter[]).map(c => (
              <button
                key={c}
                onClick={() => setCountryFilter(c)}
                className="flex-1 py-1.5 rounded-xl text-xs font-black transition-all"
                style={countryFilter === c
                  ? { background: 'linear-gradient(135deg, #FFDE00, #F4C430)', color: '#111', boxShadow: '0 0 14px rgba(255,222,0,0.3)' }
                  : { background: '#2a1f3a', color: '#a1a1aa', border: '1px solid rgba(139,92,246,0.2)' }
                }
              >
                {c === 'IN' ? '🇮🇳 India' : c === 'UAE' ? '🇦🇪 UAE' : 'Both'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by card name…"
              className="w-full text-white placeholder-zinc-600 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none transition-all"
              style={{ background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.3)' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Feed */}
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        {visibleSellers.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center mt-4"
            style={{ background: 'linear-gradient(135deg, #1e1035, #160e20)', border: '1px solid rgba(255,222,0,0.15)', boxShadow: '0 0 30px rgba(124,83,140,0.12)' }}
          >
            <span className="text-5xl mb-4 block">🔍</span>
            <h2 className="text-white font-black text-lg mb-2">No traders found here</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              {sellers.length > 0
                ? `${sellers.length} trader${sellers.length !== 1 ? 's' : ''} found — try switching to Both countries.`
                : 'No traders have added cards yet. Check back soon!'}
            </p>
            {sellers.length > 0 && countryFilter !== 'BOTH' && (
              <button
                onClick={() => setCountryFilter('BOTH')}
                className="mt-5 text-yellow-400 hover:text-yellow-300 text-sm font-bold transition-colors"
              >
                Show all countries →
              </button>
            )}
          </div>
        ) : (
          visibleSellers.map(seller => (
            <SellerCard
              key={seller.id}
              seller={seller}
              onSwipe={handleSwipe}
              disabled={swipingId !== null}
            />
          ))
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl backdrop-blur-sm max-w-xs w-[calc(100%-3rem)] text-center"
          style={{
            background: 'rgba(22, 14, 32, 0.95)',
            border:     '1px solid rgba(52,211,153,0.35)',
            color:      '#6ee7b7',
            boxShadow:  '0 0 20px rgba(52,211,153,0.15), 0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {toast}
        </div>
      )}
    </main>
  )
}

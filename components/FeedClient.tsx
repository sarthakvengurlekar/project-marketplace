'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPriceFromUSD } from '@/lib/currency'

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
    rarity: string | null
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
  rarities: string[]
  preview_cards: PreviewCard[]
  filter_cards: PreviewCard[]
}

export interface CurrentUserProfile {
  id: string
  username: string
  avatar_url: string | null
}

type CountryFilter = 'IN' | 'UAE' | 'BOTH'

function rarityKey(rarity: string | null | undefined): string {
  return (rarity ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── Seller card ──────────────────────────────────────────────────────────────

function SellerCard({
  seller,
  onSwipe,
  disabled,
  countryCode,
  activeRarityKeys,
}: {
  seller: Seller
  onSwipe: (id: string, username: string, dir: 'LIKE' | 'PASS') => void
  disabled: boolean
  countryCode: string
  activeRarityKeys: string[]
}) {
  const initials = seller.username[0]?.toUpperCase() ?? '?'
  const flag = seller.country_code === 'UAE' ? '🇦🇪' : seller.country_code === 'IN' ? '🇮🇳' : ''
  const rating = seller.trade_rating
  const hasRarityFilters = activeRarityKeys.length > 0
  const displayedCards = hasRarityFilters
    ? seller.filter_cards.filter(item => activeRarityKeys.includes(rarityKey(item.cards?.rarity))).slice(0, 8)
    : seller.preview_cards
  const hiddenCardCount = hasRarityFilters
    ? seller.filter_cards.filter(item => activeRarityKeys.includes(rarityKey(item.cards?.rarity))).length - displayedCards.length
    : seller.card_count - seller.preview_cards.length

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background:  '#FAF6EC',
        border:      '2px solid #0A0A0A',
        boxShadow:   '4px 4px 0 #E8233B',
      }}
    >
      {/* Profile header */}
      <div
        className="p-4 pb-3"
        style={{ borderBottom: '2px solid #0A0A0A' }}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className="relative w-12 h-12 flex-shrink-0 overflow-hidden"
            style={{ border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A' }}
          >
            {seller.avatar_url ? (
              <Image src={seller.avatar_url} alt={seller.username} fill className="object-cover" unoptimized />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-black text-base"
                style={{ background: '#E8233B', color: '#FAF6EC' }}
              >
                {initials}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-black text-sm" style={{ color: '#0A0A0A' }}>@{seller.username}</span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#F4D03F', border: '1.5px solid #0A0A0A', color: '#0A0A0A', fontSize: 9 }}>
                VERIFIED
              </span>
              <span className="text-sm">{flag}</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#8B7866' }}>
              {[seller.city, `${seller.card_count} cards available`].filter(Boolean).join(' · ')}
            </p>
            {rating != null && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs" style={{ color: '#F4D03F' }}>{'★'.repeat(Math.round(Math.min(5, Math.max(0, rating))))}</span>
                <span className="text-[10px]" style={{ color: '#8B7866' }}>{rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal card strip */}
      <div
        className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none"
        style={{ borderBottom: '2px solid #0A0A0A', scrollSnapType: 'x mandatory' } as React.CSSProperties}
      >
        {displayedCards.map(item => (
          <div
            key={item.id}
            className="flex-shrink-0 w-[72px]"
            style={{ scrollSnapAlign: 'start' }}
          >
            <Link href={`/binder/card/${encodeURIComponent(item.cards?.id ?? '')}`}>
              <div
                className="relative w-[72px] h-[100px] overflow-hidden"
                style={{ background: '#f0ece2', border: '2px solid #0A0A0A' }}
              >
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
            <p className="text-[9px] font-bold mt-1 leading-tight line-clamp-1 text-center" style={{ color: '#0A0A0A' }}>
              {item.cards?.name}
            </p>
            {item.condition && (
              <p className="text-[8px] font-black text-center" style={{ color: '#8B7866' }}>{item.condition}</p>
            )}
            {item.usd_price != null && (
              <p className="text-[9px] font-black text-center" style={{ color: '#E8233B' }}>
                {formatPriceFromUSD(item.usd_price, countryCode)}
              </p>
            )}
          </div>
        ))}

        {/* "+N more" placeholder */}
        {hiddenCardCount > 0 && (
          <div
            className="flex-shrink-0 w-[72px] h-[100px] flex flex-col items-center justify-center gap-1"
            style={{ border: '2px dashed #0A0A0A', background: '#f0ece2' }}
          >
            <span className="font-black text-sm" style={{ color: '#0A0A0A' }}>+{hiddenCardCount}</span>
            <span className="text-[8px] uppercase tracking-wider" style={{ color: '#8B7866' }}>VIEW</span>
          </div>
        )}
      </div>

      {/* View collection */}
      <div className="px-4 py-2.5" style={{ borderBottom: '2px solid #0A0A0A' }}>
        <Link
          href={`/binder/${seller.username}`}
          className="text-xs font-black uppercase tracking-wider"
          style={{ color: '#E8233B' }}
        >
          View Full Collection →
        </Link>
      </div>

      {/* Pass / Interested */}
      <div className="grid grid-cols-2">
        <button
          onClick={() => onSwipe(seller.id, seller.username, 'PASS')}
          disabled={disabled}
          className="py-4 flex items-center justify-center gap-2 text-sm font-black transition-all disabled:opacity-30"
          style={{
            borderRight:  '2px solid #0A0A0A',
            background:   '#FAF6EC',
            color:        '#0A0A0A',
          }}
        >
          <span>✕</span> PASS
        </button>
        <button
          onClick={() => onSwipe(seller.id, seller.username, 'LIKE')}
          disabled={disabled}
          className="py-4 flex items-center justify-center gap-2 text-sm font-black transition-all disabled:opacity-30"
          style={{ background: '#E8233B', color: '#FAF6EC' }}
        >
          <span>♥</span> INTERESTED
        </button>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export default function FeedClient({
  sellers: initialSellers,
  currentUser,
  defaultFilter,
}: {
  sellers: Seller[]
  currentUser: CurrentUserProfile | null
  defaultFilter: string
}) {
  const router = useRouter()
  const { countryCode } = useCountry()

  const [sellers, setSellers]               = useState<Seller[]>(initialSellers)
  const [countryFilter, setCountryFilter]   = useState<CountryFilter>(defaultFilter as CountryFilter)
  const [searchQuery, setSearchQuery]       = useState('')
  const [filtersOpen, setFiltersOpen]       = useState(false)
  const [rarityFilters, setRarityFilters]   = useState<string[]>([])
  const [swipingId, setSwipingId]           = useState<string | null>(null)
  const [toast, setToast]                   = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const handleSwipe = useCallback(async (sellerId: string, sellerUsername: string, dir: 'LIKE' | 'PASS') => {
    if (swipingId) return
    setSwipingId(sellerId)
    setSellers(prev => prev.filter(s => s.id !== sellerId))

    try {
      const res = await fetch('/api/swipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swiped_id: sellerId }),
      })
      const data = await res.json() as { success?: boolean; matchId?: string | null; error?: string }

      if (!res.ok || data.error) {
        showToast(`Error: ${data.error ?? 'swipe failed'}`)
      } else if (dir === 'LIKE') {
        if (data.matchId) {
          showToast(`Trade request sent to @${sellerUsername}!`)
          setTimeout(() => router.push(`/matches/${data.matchId}`), 1600)
        } else {
          showToast(`Interested sent — waiting for @${sellerUsername} to match back.`)
        }
      }
    } catch {
      showToast('Something went wrong — please try again.')
    }

    setSwipingId(null)
  }, [swipingId, router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const currentInitial = currentUser?.username?.[0]?.toUpperCase() ?? '?'

  const rarityOptionMap = new Map<string, string>()
  sellers.flatMap(s => s.rarities ?? []).forEach(rarity => {
    const key = rarityKey(rarity)
    if (key && !rarityOptionMap.has(key)) rarityOptionMap.set(key, rarity.trim())
  })
  const rarityOptions = Array.from(rarityOptionMap.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const activeFilterCount = rarityFilters.length

  function toggleRarity(rarity: string) {
    setRarityFilters(prev =>
      prev.includes(rarity)
        ? prev.filter(r => r !== rarity)
        : [...prev, rarity]
    )
  }

  const visibleSellers = (() => {
    const afterCountry = countryFilter === 'BOTH'
      ? sellers
      : sellers.filter(s => s.country_code?.toUpperCase() === countryFilter)
    const q = searchQuery.trim().toLowerCase()
    const afterSearch = q
      ? afterCountry.filter(s => s.preview_cards.some(c => c.cards?.name?.toLowerCase().includes(q)))
      : afterCountry
    return afterSearch.filter(s => {
      const sellerRarityKeys = (s.rarities ?? []).map(rarityKey)
      const rarityOk = rarityFilters.length === 0 || rarityFilters.some(r => sellerRarityKeys.includes(r))
      return rarityOk
    })
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen pb-28" style={{ background: '#FAF6EC' }}>

      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 px-4 py-3"
        style={{ background: '#FAF6EC', borderBottom: '2px solid #0A0A0A' }}
      >
        <div className="max-w-lg mx-auto space-y-3">

          {/* Nav row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-black text-xl leading-none" style={{ color: '#0A0A0A' }}>Find traders</h1>
              <p className="text-xs mt-0.5" style={{ color: '#8B7866' }}>
                {visibleSellers.length} new in your region
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/binder" className="text-xs font-black uppercase tracking-widest" style={{ color: '#8B7866' }}>
                Binder
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs font-black uppercase tracking-widest"
                style={{ color: '#8B7866' }}
              >
                Sign out
              </button>
              <Link
                href="/profile"
                className="w-9 h-9 flex items-center justify-center font-black text-sm overflow-hidden"
                style={{ background: '#F4D03F', color: '#0A0A0A', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', position: 'relative' }}
                aria-label="Profile"
              >
                {currentUser?.avatar_url ? (
                  <Image src={currentUser.avatar_url} alt={currentUser.username} fill sizes="36px" className="object-cover" unoptimized />
                ) : (
                  currentInitial
                )}
              </Link>
            </div>
          </div>

          {/* Country tabs */}
          <div
            className="grid grid-cols-3 overflow-hidden"
            style={{ border: '2px solid #0A0A0A' }}
          >
            {(['IN', 'UAE', 'BOTH'] as CountryFilter[]).map((c, i, arr) => (
              <button
                key={c}
                onClick={() => setCountryFilter(c)}
                className="py-2 text-xs font-black uppercase tracking-wide transition-all"
                style={{
                  background:  countryFilter === c ? '#F4D03F' : '#FAF6EC',
                  color:       '#0A0A0A',
                  borderRight: i < arr.length - 1 ? '2px solid #0A0A0A' : 'none',
                }}
              >
                {c === 'IN' ? '🇮🇳 India' : c === 'UAE' ? '🇦🇪 UAE' : 'Both'}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative" style={{ border: '2px solid #0A0A0A', background: '#FAF6EC' }}>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none" style={{ color: '#8B7866' }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by card name…"
              className="w-full pl-9 pr-16 py-2.5 text-sm focus:outline-none bg-transparent"
              style={{ color: '#0A0A0A' }}
            />
            <button
              onClick={() => setFiltersOpen(prev => !prev)}
              className="absolute right-0 top-0 bottom-0 flex items-center justify-center px-3 text-[10px] font-black uppercase"
              style={{ background: activeFilterCount > 0 ? '#F4D03F' : '#E8233B', color: activeFilterCount > 0 ? '#0A0A0A' : '#FAF6EC', border: 'none', borderLeft: '2px solid #0A0A0A', cursor: 'pointer' }}
            >
              {activeFilterCount > 0 ? `FILTERED ${activeFilterCount}` : 'FILTERS'}
            </button>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-16 top-1/2 -translate-y-1/2 text-xs font-black"
                style={{ color: '#0A0A0A' }}
              >
                ✕
              </button>
            )}
          </div>

          {filtersOpen && (
            <div style={{ border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', background: '#FAF6EC', padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 11, letterSpacing: '0.08em' }}>CARD FILTERS</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setRarityFilters([])}
                    style={{ background: 'none', border: 'none', color: '#E8233B', fontWeight: 900, fontSize: 11, cursor: 'pointer' }}
                  >
                    CLEAR
                  </button>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', margin: '0 0 6px' }}>RARITY</p>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
                  {[{ key: 'ALL', label: 'All' }, ...rarityOptions].map(r => {
                    const selected = r.key === 'ALL' ? activeFilterCount === 0 : rarityFilters.includes(r.key)
                    return (
                      <button
                        key={r.key}
                        onClick={() => r.key === 'ALL' ? setRarityFilters([]) : toggleRarity(r.key)}
                        style={{
                          flexShrink: 0,
                          background: selected ? '#F4D03F' : '#FAF6EC',
                          border: '2px solid #0A0A0A',
                          boxShadow: selected ? '2px 2px 0 #0A0A0A' : 'none',
                          color: '#0A0A0A',
                          fontWeight: selected ? 900 : 700,
                          fontSize: 11,
                          padding: '5px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Feed */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {visibleSellers.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center mt-4"
            style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
          >
            <span className="text-5xl mb-4 block">🔍</span>
            <h2 className="font-black text-lg mb-2" style={{ color: '#0A0A0A' }}>No traders found here</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#8B7866' }}>
              {sellers.length > 0
                ? `${sellers.length} trader${sellers.length !== 1 ? 's' : ''} found — try switching to Both countries.`
                : 'No traders have added cards yet. Check back soon!'}
            </p>
            {sellers.length > 0 && countryFilter !== 'BOTH' && (
              <button
                onClick={() => setCountryFilter('BOTH')}
                className="mt-5 text-sm font-black"
                style={{ color: '#E8233B' }}
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
                countryCode={countryCode}
                activeRarityKeys={rarityFilters}
              />
          ))
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 text-sm font-black px-5 py-3 rounded max-w-xs w-[calc(100%-3rem)] text-center"
          style={{
            background:  '#0A0A0A',
            color:       '#FAF6EC',
            border:      '2px solid #0A0A0A',
            boxShadow:   '4px 4px 0 #E8233B',
          }}
        >
          {toast}
        </div>
      )}
    </main>
  )
}

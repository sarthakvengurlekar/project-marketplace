'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewCard {
  id: string            // user_cards.id
  condition: string | null
  is_foil: boolean
  cards: {
    id: string
    name: string
    image_url: string
  }
}

interface Seller {
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

// ─── Skeleton seller card ─────────────────────────────────────────────────────

function SellerCardSkeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden animate-pulse">
      <div className="p-4">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3.5 bg-zinc-800 rounded w-1/3" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
            <div className="h-3 bg-zinc-800 rounded w-1/4" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[72px] h-[100px] rounded-xl bg-zinc-800 flex-shrink-0" />
        ))}
      </div>
      <div className="h-12 bg-zinc-800/40 border-t border-zinc-800" />
    </div>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden ring-1 ring-yellow-400/5">

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
              <div className="w-12 h-12 rounded-full bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
                <span className="text-yellow-400 font-black text-base uppercase">
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
            <div className="relative w-[72px] h-[100px] rounded-xl overflow-hidden bg-zinc-800">
              <Image
                src={item.cards.image_url}
                alt={item.cards.name}
                fill
                sizes="72px"
                className="object-contain"
                unoptimized
              />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 leading-tight line-clamp-1 text-center">
              {item.cards.name}
            </p>
            {item.condition && (
              <p className={`text-[9px] font-bold text-center ${CONDITION_COLOURS[item.condition] ?? 'text-zinc-500'}`}>
                {item.condition}
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

      <div className="border-t border-zinc-800" />

      {/* Pass / Interested */}
      <div className="grid grid-cols-2 divide-x divide-zinc-800">
        <button
          onClick={() => onSwipe(seller.id, seller.username, 'PASS')}
          disabled={disabled}
          className="py-3.5 flex items-center justify-center gap-2 text-zinc-400 hover:text-white hover:bg-zinc-800/50 active:bg-zinc-800 transition-all text-sm font-bold disabled:opacity-30"
        >
          <span>✕</span> Pass
        </button>
        <button
          onClick={() => onSwipe(seller.id, seller.username, 'LIKE')}
          disabled={disabled}
          className="py-3.5 flex items-center justify-center gap-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/5 active:bg-yellow-400/10 transition-all text-sm font-bold disabled:opacity-30"
        >
          <span>♥</span> Interested
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const router = useRouter()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sellers, setSellers] = useState<Seller[]>([])
  const [countryFilter, setCountryFilter] = useState<CountryFilter>('IN')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fetch sellers ──────────────────────────────────────────────────────────

  const fetchSellers = useCallback(async (uid: string) => {
    setLoading(true)

    // Step 1 — already-swiped IDs
    const { data: swipeRows } = await supabase
      .from('swipes')
      .select('target_user_id')
      .eq('swiper_user_id', uid)

    const swipedIds = new Set((swipeRows ?? []).map(r => r.target_user_id as string))

    // Step 2 — all HAVE cards with card details
    const { data: cardRows, error: cardErr } = await supabase
      .from('user_cards')
      .select('user_id, id, condition, is_foil, cards(id, name, image_url)')
      .eq('list_type', 'HAVE')
      .neq('user_id', uid)
      .order('created_at', { ascending: false })

    if (cardErr) {
      console.error('[feed] user_cards error:', cardErr)
      setLoading(false)
      return
    }

    // Step 3 — group by seller, skip swiped, cap preview at 8
    const sellerMap = new Map<string, { cards: PreviewCard[]; count: number }>()
    for (const row of cardRows ?? []) {
      if (swipedIds.has(row.user_id)) continue
      if (!sellerMap.has(row.user_id)) sellerMap.set(row.user_id, { cards: [], count: 0 })
      const s = sellerMap.get(row.user_id)!
      s.count++
      if (s.cards.length < 8) s.cards.push(row as unknown as PreviewCard)
    }

    const sellerIds = Array.from(sellerMap.keys())
    if (sellerIds.length === 0) { setSellers([]); setLoading(false); return }

    // Step 4 — fetch profiles for those sellers
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, city, country_code, trade_rating')
      .in('id', sellerIds)

    if (profErr) {
      console.error('[feed] profiles error:', profErr)
      setLoading(false)
      return
    }

    const result: Seller[] = (profiles ?? [])
      .filter(p => (sellerMap.get(p.id)?.count ?? 0) > 0)
      .map(p => ({
        ...p,
        card_count: sellerMap.get(p.id)!.count,
        preview_cards: sellerMap.get(p.id)!.cards,
      }))

    setSellers(result)
    setLoading(false)
  }, [])

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setCurrentUserId(user.id)

      // Default country filter from the user's own profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.country_code) {
        setCountryFilter(profile.country_code as CountryFilter)
      }

      fetchSellers(user.id)
    }
    init()
  }, [router, fetchSellers])

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  // ── Swipe ──────────────────────────────────────────────────────────────────

  async function handleSwipe(sellerId: string, sellerUsername: string, dir: 'LIKE' | 'PASS') {
    if (!currentUserId || swipingId) return
    setSwipingId(sellerId)

    // Optimistic remove
    setSellers(prev => prev.filter(s => s.id !== sellerId))

    const { error: swipeErr } = await supabase.from('swipes').insert({
      swiper_user_id: currentUserId,
      target_user_id: sellerId,
      direction: dir,
    })

    if (swipeErr) {
      console.error('[feed] swipe error:', swipeErr)
      setSwipingId(null)
      return
    }

    if (dir === 'LIKE') {
      // Allow DB trigger time to fire
      await new Promise(r => setTimeout(r, 700))

      const { data: match } = await supabase
        .from('matches')
        .select('id')
        .eq('initiated_by', currentUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      showToast(`Trade request sent to @${sellerUsername}! Say hi to get started.`)

      if (match?.id) {
        setTimeout(() => router.push(`/matches/${match.id}`), 1600)
      }
    }

    setSwipingId(null)
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const visibleSellers = sellers
    .filter(s => countryFilter === 'BOTH' || s.country_code === countryFilter)
    .filter(s => {
      const q = searchQuery.trim().toLowerCase()
      if (!q) return true
      return s.preview_cards.some(c => c.cards?.name?.toLowerCase().includes(q))
    })

  // ── Sign out ───────────────────────────────────────────────────────────────

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-zinc-950 pb-16">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3">
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
              <Link
                href="/binder"
                className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest"
              >
                Binder
              </Link>
              <Link
                href="/matches"
                className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest"
              >
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
                className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
                  countryFilter === c
                    ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
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
              className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
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
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <SellerCardSkeleton key={i} />)
        ) : visibleSellers.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center ring-1 ring-yellow-400/10 mt-4">
            <span className="text-5xl mb-4 block">🔍</span>
            <h2 className="text-white font-black text-lg mb-2">No traders found here</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Try switching to Both countries or check back as more traders join!
            </p>
            <button
              onClick={() => setCountryFilter('BOTH')}
              className="mt-5 text-yellow-400 hover:text-yellow-300 text-sm font-bold transition-colors"
            >
              Show all countries →
            </button>
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl backdrop-blur-sm max-w-xs w-[calc(100%-3rem)] text-center">
          {toast}
        </div>
      )}
    </main>
  )
}

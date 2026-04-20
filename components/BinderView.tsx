'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPrice, convertFromUSD } from '@/lib/currency'
import CardSearch from '@/components/CardSearch'
import ScanCardModal from '@/components/ScanCardModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardPrice {
  usd_price: number | null
  inr_price: number | null
  aed_price: number | null
  last_fetched: string | null
}

interface CardData {
  id: string
  name: string
  set_name: string
  rarity: string | null
  image_url: string
  card_number: string
  card_prices: CardPrice[]
}

interface CollectionItem {
  id: string        // user_cards.id
  card_id: string
  created_at: string
  condition: string | null
  is_foil: boolean
  cards: CardData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONDITION_STYLES: Record<string, string> = {
  NM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  LP: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  MP: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HP: 'bg-red-500/20 text-red-400 border-red-500/30',
}

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true
  return Date.now() - new Date(fetchedAt).getTime() > 86_400_000
}

// ─── Skeleton tile ────────────────────────────────────────────────────────────

function SkeletonTile() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="w-full aspect-[2.5/3.5] bg-zinc-800" />
      <div className="p-2.5 space-y-2">
        <div className="h-3 bg-zinc-800 rounded w-3/4" />
        <div className="h-2.5 bg-zinc-800 rounded w-1/2" />
        <div className="h-4 bg-zinc-800 rounded w-2/3 mt-1" />
      </div>
    </div>
  )
}

// ─── Card tile ────────────────────────────────────────────────────────────────

function CardTile({
  item,
  isOwner,
  priceLoading,
  countryCode,
  onDelete,
}: {
  item: CollectionItem
  isOwner: boolean
  priceLoading: boolean
  countryCode: string
  onDelete: (userCardId: string) => void
}) {
  const condition = item.condition ?? 'NM'
  const condStyle = CONDITION_STYLES[condition] ?? CONDITION_STYLES['NM']
  const priceData = item.cards.card_prices?.[0]
  const usdPrice = priceData?.usd_price ?? null
  const localPrice = countryCode === 'UAE' ? (priceData?.aed_price ?? null) : (priceData?.inr_price ?? null)
  const fetchedAt = priceData?.last_fetched ?? null

  return (
    <Link
      href={`/binder/card/${item.cards.id}`}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden ring-1 ring-yellow-400/5 hover:ring-yellow-400/20 transition-all group relative block"
    >
      {/* Foil badge */}
      {item.is_foil && (
        <span className="absolute top-1.5 left-1.5 z-10 text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 uppercase tracking-wide">
          Foil
        </span>
      )}

      {/* Delete button — owner only, appears on hover */}
      {isOwner && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(item.id) }}
          className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-zinc-900/90 border border-zinc-700 hover:bg-red-500 hover:border-red-500 text-zinc-400 hover:text-white flex items-center justify-center text-[9px] transition-all opacity-0 group-hover:opacity-100"
          title="Remove from collection"
        >
          ✕
        </button>
      )}

      {/* Card image */}
      <div className="relative w-full aspect-[2.5/3.5] bg-zinc-800 overflow-hidden">
        <Image
          src={item.cards.image_url}
          alt={item.cards.name}
          fill
          sizes="(max-width: 640px) 50vw, 200px"
          className="object-contain p-1.5 group-hover:scale-105 transition-transform duration-200"
          unoptimized
        />
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1">
        <p className="text-white font-bold text-xs leading-tight line-clamp-1">{item.cards.name}</p>
        <p className="text-zinc-500 text-[11px] line-clamp-1">{item.cards.set_name}</p>

        {/* Condition badge */}
        <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wide ${condStyle}`}>
          {condition}
        </span>

        {/* Price */}
        {priceLoading ? (
          <div className="h-3.5 w-3/4 bg-zinc-800 rounded animate-pulse mt-1" />
        ) : usdPrice != null ? (
          <>
            <p className="text-yellow-400 font-black text-xs">
              {formatPrice(
                localPrice ?? convertFromUSD(usdPrice!, countryCode),
                countryCode
              )}
            </p>
            {fetchedAt && (
              <p className="text-zinc-600 text-[10px]">Updated {timeAgo(fetchedAt)}</p>
            )}
          </>
        ) : (
          <p className="text-zinc-600 text-[10px]">Price unavailable</p>
        )}
      </div>
    </Link>
  )
}

// ─── Slide-up drawer ──────────────────────────────────────────────────────────

function AddCardsDrawer({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-3xl transition-transform duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '88vh' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-white font-black text-base tracking-tight">Add Cards</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(88vh - 88px)' }}>
          <CardSearch onCardAdded={onAdded} />
        </div>
      </div>
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BinderView({
  profileUserId,
  profileUsername,
  isOwner,
}: {
  profileUserId: string
  profileUsername: string
  isOwner: boolean
}) {
  const { countryCode, initialized: countryReady } = useCountry()
  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [priceLoadingIds, setPriceLoadingIds] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const refreshed = useRef<Set<string>>(new Set())
  const [unmappedCount, setUnmappedCount] = useState(0)
  const [migrateState, setMigrateState] = useState<'idle' | 'running' | 'done'>('idle')
  const [migrateResult, setMigrateResult] = useState<{ matched: number; total: number } | null>(null)

  const fetchCollection = useCallback(async () => {
    console.log('[binder] fetchCollection — querying for user_id:', profileUserId)

    // Clear so newly-added cards get price-refreshed on re-fetch
    refreshed.current.clear()

    const { data, error } = await supabase
      .from('user_cards')
      .select(`
        id,
        card_id,
        created_at,
        condition,
        is_foil,
        cards (
          id, name, set_name, rarity, image_url, card_number,
          card_prices ( usd_price, inr_price, aed_price, last_fetched )
        )
      `)
      .eq('user_id', profileUserId)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[binder] query error — code:', error.code,
        '| message:', error.message,
        '| details:', error.details,
        '| hint:', error.hint)
      setLoading(false)
      return
    }

    console.log('[binder] query returned', data?.length ?? 0, 'cards for user_id:', profileUserId)

    if (!data) { setLoading(false); return }

    const typed = data as unknown as CollectionItem[]
    setItems(typed)
    setLoading(false)

    // Kick off price refresh for stale / missing cards
    const toRefresh = typed.filter(item => {
      const p = item.cards.card_prices?.[0]
      return !p?.usd_price || isStale(p.last_fetched)
    })
    if (toRefresh.length === 0) return

    const staleIds = new Set(toRefresh.map(i => i.cards.id))
    setPriceLoadingIds(staleIds)

    await Promise.allSettled(
      toRefresh.map(async (item) => {
        const cid = item.cards.id
        if (refreshed.current.has(cid)) return
        refreshed.current.add(cid)

        try {
          const res = await fetch(`/api/refresh-price?card_id=${encodeURIComponent(cid)}`)
          if (!res.ok) return
          const { usd_price, inr_price, aed_price, last_fetched } = await res.json()

          setItems(prev =>
            prev.map(i =>
              i.cards.id !== cid
                ? i
                : {
                    ...i,
                    cards: {
                      ...i.cards,
                      card_prices: [{ usd_price, inr_price, aed_price, last_fetched }],
                    },
                  }
            )
          )
        } finally {
          setPriceLoadingIds(prev => {
            const next = new Set(prev)
            next.delete(cid)
            return next
          })
        }
      })
    )
  }, [profileUserId])

  useEffect(() => {
    fetchCollection()
  }, [fetchCollection])

  // After items load, check how many cards are missing a tcgplayer_id mapping
  useEffect(() => {
    if (!isOwner || items.length === 0) return
    const cardIds = items.map(i => i.cards.id)
    void (async () => {
      try {
        const { count } = await supabase
          .from('cards')
          .select('id', { count: 'exact', head: true })
          .in('id', cardIds)
          .is('tcgplayer_id', null)
        setUnmappedCount(count ?? 0)
      } catch { /* column may not exist yet */ }
    })()
  }, [items, isOwner])

  async function handleMigrate() {
    setMigrateState('running')
    try {
      const res = await fetch('/api/migrate-card-ids')
      if (!res.ok) throw new Error('Migration failed')
      const { matched, total } = await res.json()
      setMigrateResult({ matched, total })
      setUnmappedCount(0)
      setMigrateState('done')
    } catch {
      setMigrateState('idle')
    }
  }

  async function handleDelete(userCardId: string) {
    const { error } = await supabase
      .from('user_cards')
      .delete()
      .eq('id', userCardId)
      .eq('user_id', profileUserId)

    if (!error) setItems(prev => prev.filter(i => i.id !== userCardId))
  }

  const totalLocal = items.reduce((sum, item) => {
    const p = item.cards.card_prices?.[0]
    const local = countryCode === 'UAE' ? (p?.aed_price ?? null) : (p?.inr_price ?? null)
    if (local != null) return sum + local
    // fall back to client-side conversion when pre-computed price is missing
    return sum + convertFromUSD(p?.usd_price ?? 0, countryCode)
  }, 0)
  const pricesStillLoading = priceLoadingIds.size > 0 || !countryReady

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 pb-32">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/feed">
              <div className="w-9 h-9 rounded-full bg-yellow-400 flex items-center justify-center shadow-md shadow-yellow-400/20">
                <span className="text-sm font-black text-black">PT</span>
              </div>
            </Link>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight leading-none">
                {isOwner ? 'My Binder' : `@${profileUsername}'s Binder`}
              </h1>
              <p className="text-zinc-500 text-xs mt-0.5">
                {loading ? '—' : `${items.length} card${items.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <Link
            href="/feed"
            className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest"
          >
            ← Feed
          </Link>
        </div>

        {/* Total value banner */}
        {!loading && items.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-4 mb-6 ring-1 ring-yellow-400/10">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
              {pricesStillLoading ? 'Updating prices…' : 'Total collection value'}
            </p>
            {pricesStillLoading ? (
              <div className="h-8 w-36 bg-zinc-800 rounded-lg animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-yellow-400 tracking-tight">
                {formatPrice(totalLocal, countryCode)}
              </p>
            )}
            <p className="text-zinc-600 text-[10px] mt-2 leading-relaxed">
              Prices based on US market rates. Actual trade value may vary.
            </p>
          </div>
        )}

        {/* Migration banner — shown when cards are missing tcgplayer_id */}
        {isOwner && !loading && unmappedCount > 0 && migrateState !== 'done' && (
          <div className="bg-zinc-900 border border-yellow-400/20 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-yellow-400 text-xs font-black">
                {unmappedCount} card{unmappedCount !== 1 ? 's' : ''} need data update
              </p>
              <p className="text-zinc-500 text-[11px] mt-0.5 leading-snug">
                Enables price history &amp; PSA grades for older cards
              </p>
            </div>
            <button
              onClick={handleMigrate}
              disabled={migrateState === 'running'}
              className="flex-shrink-0 flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60 text-black font-black text-xs rounded-xl px-4 py-2 transition-colors"
            >
              {migrateState === 'running' ? (
                <>
                  <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Updating…
                </>
              ) : 'Update card data'}
            </button>
          </div>
        )}

        {isOwner && migrateState === 'done' && migrateResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <p className="text-emerald-400 text-xs font-black">
              {migrateResult.matched}/{migrateResult.total} cards updated
            </p>
            <button
              onClick={() => setMigrateState('idle')}
              className="text-zinc-500 text-[11px] hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonTile key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center ring-1 ring-yellow-400/10">
            <span className="text-5xl mb-4 block">📦</span>
            <h2 className="text-white font-black text-lg mb-2">
              {isOwner ? 'Your binder is empty' : 'No cards yet'}
            </h2>
            <p className="text-zinc-500 text-sm mb-6">
              {isOwner
                ? 'Search for cards and add them to your collection.'
                : `@${profileUsername} hasn't added any cards yet.`}
            </p>
            {isOwner && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl px-5 py-2.5 text-sm transition-colors shadow-lg shadow-yellow-400/20"
              >
                + Add Cards
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map(item => (
              <CardTile
                key={item.id}
                item={item}
                isOwner={isOwner}
                priceLoading={priceLoadingIds.has(item.cards.id) || !countryReady}
                countryCode={countryCode}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Owner FABs */}
      {isOwner && !loading && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center gap-3 z-30 px-4">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-black rounded-2xl px-6 py-3.5 text-sm tracking-wide transition-colors shadow-xl shadow-yellow-400/30"
          >
            + Add Cards
          </button>
          <button
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white font-black rounded-2xl px-6 py-3.5 text-sm tracking-wide transition-colors shadow-xl border border-zinc-700"
            onClick={() => setScanOpen(true)}
          >
            📷 Scan Card
          </button>
        </div>
      )}

      {/* Add Cards drawer */}
      {isOwner && (
        <AddCardsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onAdded={fetchCollection}
        />
      )}

      {/* Scan Card modal */}
      {isOwner && (
        <ScanCardModal
          userId={profileUserId}
          isOpen={scanOpen}
          onClose={() => setScanOpen(false)}
          onCardAdded={fetchCollection}
        />
      )}
    </main>
  )
}

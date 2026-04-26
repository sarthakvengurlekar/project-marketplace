'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPrice, convertFromUSD } from '@/lib/currency'
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
  grading_company: string | null
  grade: number | null
  grade_label: string | null
  cards: CardData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONDITION_STYLES: Record<string, string> = {
  NM: 'bg-teal-500/20 text-teal-400 border-teal-500/40 badge-nm',
  LP: 'bg-blue-500/20 text-blue-400 border-blue-500/40 badge-lp',
  MP: 'bg-orange-500/20 text-orange-400 border-orange-500/40 badge-mp',
  HP: 'bg-red-500/20 text-red-400 border-red-500/40 badge-hp',
}

const CONDITION_ICONS: Record<string, string> = {
  NM: '★', LP: '✓', MP: '△', HP: '✕',
}

const GRADE_BADGE_STYLES: Record<string, string> = {
  PSA: 'bg-red-600 text-white glow-psa',
  BGS: 'bg-yellow-600 text-white glow-bgs',
  CGC: 'bg-blue-600 text-white glow-cgc',
  TAG: 'bg-purple-600 text-white glow-tag',
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
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: 'linear-gradient(160deg, #1e1030, #160e20)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div className="w-full aspect-[2.5/3.5]" style={{ background: '#2a1f3a' }} />
      <div className="p-2.5 space-y-2">
        <div className="h-3 rounded w-3/4" style={{ background: '#2a1f3a' }} />
        <div className="h-2.5 rounded w-1/2" style={{ background: '#2a1f3a' }} />
        <div className="h-4 rounded w-2/3 mt-1" style={{ background: '#2a1f3a' }} />
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

  const graded = item.grading_company && item.grading_company !== 'RAW' && item.grade != null
  const gradeDisplay = item.grade != null
    ? (item.grade % 1 === 0 ? String(item.grade) : item.grade.toFixed(1))
    : ''

  return (
    <Link
      href={`/binder/card/${item.cards.id}`}
      className="holo-card rounded-2xl overflow-hidden group relative block"
      style={{ background: 'linear-gradient(160deg, #1e1030, #160e20)', border: '1px solid rgba(139,92,246,0.25)' }}
    >
      {/* Top-left badges: grade (if graded) and/or foil */}
      <div className="absolute top-1.5 left-1.5 z-10 flex flex-col gap-1">
        {graded && (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow-md ${GRADE_BADGE_STYLES[item.grading_company!] ?? 'bg-zinc-600 text-white'}`}>
            {item.grading_company} {gradeDisplay}
          </span>
        )}
        {item.is_foil && (
          <span className="foil-badge text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">
            ✦ Foil
          </span>
        )}
      </div>

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
      <div className="relative w-full aspect-[2.5/3.5] overflow-hidden" style={{ background: '#1a1028' }}>
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
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wide ${condStyle}`}>
          <span>{CONDITION_ICONS[condition] ?? ''}</span>{condition}
        </span>

        {/* Price */}
        {priceLoading ? (
          <div className="h-3.5 w-3/4 bg-zinc-800 rounded animate-pulse mt-1" />
        ) : usdPrice != null ? (
          <>
            <p className="font-black text-xs text-gradient-pika">
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
  const [scanOpen, setScanOpen] = useState(false)
  const refreshed = useRef<Set<string>>(new Set())

  const fetchCollection = useCallback(async () => {
    console.log('[binder] fetchCollection — querying for user_id:', profileUserId)

    const { data, error } = await supabase
      .from('user_cards')
      .select(`
        id,
        card_id,
        created_at,
        condition,
        is_foil,
        grading_company,
        grade,
        grade_label,
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

    // Kick off price refresh for stale / missing cards.
    // Use last_fetched as the sole gate so null-price cards with a recent
    // last_fetched (bumped by refresh-price's 24h suppression) are not
    // re-queried on every mount.
    //
    // Only process cards NOT already in-flight (not in refreshed.current).
    // Using an additive merge (not replace) prevents a race where a second
    // fetchCollection call re-adds already-handled IDs that would then be
    // skipped by the refreshed.current guard — permanently blocking the total.
    const toRefresh = typed
      .filter(item => isStale(item.cards.card_prices?.[0]?.last_fetched ?? null))
      .filter(item => !refreshed.current.has(item.cards.id))

    if (toRefresh.length === 0) return

    const newIds = new Set(toRefresh.map(i => i.cards.id))
    setPriceLoadingIds(prev => new Set([...prev, ...newIds]))

    // Process in small batches to avoid hammering the upstream PPT API
    const BATCH = 3
    for (let i = 0; i < toRefresh.length; i += BATCH) {
      const batch = toRefresh.slice(i, i + BATCH)
      await Promise.allSettled(
        batch.map(async (item) => {
          const cid = item.cards.id
          if (refreshed.current.has(cid)) return
          refreshed.current.add(cid)

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15_000)

          try {
            const res = await fetch(`/api/refresh-price?card_id=${encodeURIComponent(cid)}`, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!res.ok) return
            const { usd_price, inr_price, aed_price, last_fetched } = await res.json()

            setItems(prev =>
              prev.map(it =>
                it.cards.id !== cid
                  ? it
                  : {
                      ...it,
                      cards: {
                        ...it.cards,
                        card_prices: [{ usd_price, inr_price, aed_price, last_fetched }],
                      },
                    }
              )
            )
          } catch {
            // AbortError (timeout) or network error — fall through to finally
          } finally {
            clearTimeout(timeoutId)
            setPriceLoadingIds(prev => {
              const next = new Set(prev)
              next.delete(cid)
              return next
            })
          }
        })
      )
      // 1-second gap between batches keeps us well under the 60 req/min PPT limit
      if (i + BATCH < toRefresh.length) await new Promise(r => setTimeout(r, 1000))
    }
  }, [profileUserId])

  useEffect(() => {
    fetchCollection()
  }, [fetchCollection])


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
  const pricesUpdating = priceLoadingIds.size > 0

  return (
    <main
      className="min-h-screen px-4 py-8 pb-48"
      style={{ background: 'radial-gradient(ellipse at 60% -20%, #3d1f80 0%, #1a0830 35%, #0a0514 100%)' }}
    >
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
          <div
            className="rounded-2xl px-5 py-4 mb-6"
            style={{ background: 'linear-gradient(135deg, #1e1035, #160e20)', border: '1px solid rgba(255,222,0,0.2)', boxShadow: '0 0 30px rgba(124,83,140,0.15)' }}
          >
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
              Total collection value
            </p>
            {!countryReady ? (
              <div className="h-8 w-36 bg-zinc-800 rounded-lg animate-pulse" />
            ) : (
              <p className="text-3xl font-black tracking-tight text-gradient-pika">
                {formatPrice(totalLocal, countryCode)}
              </p>
            )}
            {pricesUpdating && countryReady && (
              <p className="text-zinc-500 text-[10px] mt-1">Updating prices…</p>
            )}
            <p className="text-zinc-600 text-[10px] mt-2 leading-relaxed">
              Prices based on US market rates. Actual trade value may vary.
            </p>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonTile key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: 'linear-gradient(135deg, #1e1035, #160e20)', border: '1px solid rgba(255,222,0,0.15)', boxShadow: '0 0 30px rgba(124,83,140,0.12)' }}
          >
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
              <Link
                href="/binder/add-cards"
                className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl px-5 py-2.5 text-sm transition-colors shadow-lg shadow-yellow-400/20"
              >
                + Add Cards
              </Link>
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
        <div className="fixed bottom-24 left-0 right-0 flex justify-center gap-3 z-30 px-4">
          <Link
            href="/binder/add-cards"
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-black rounded-2xl px-6 py-3.5 text-sm tracking-wide transition-colors shadow-xl shadow-yellow-400/30"
          >
            + Add Cards
          </Link>
          <button
            className="flex items-center gap-2 text-white font-black rounded-2xl px-6 py-3.5 text-sm tracking-wide transition-colors shadow-xl"
            style={{ background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.35)' }}
            onClick={() => setScanOpen(true)}
          >
            📷 Scan Card
          </button>
        </div>
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

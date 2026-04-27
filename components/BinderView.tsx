'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  id: string
  card_id: string
  created_at: string
  condition: string | null
  is_foil: boolean
  grading_company: string | null
  grade: number | null
  grade_label: string | null
  added_price_usd: number | null
  cards: CardData
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONDITION_LABEL: Record<string, string> = {
  NM: 'NM', LP: 'LP', MP: 'MP', HP: 'HP',
}

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true
  return Date.now() - new Date(fetchedAt).getTime() > 86_400_000
}

// ─── Skeleton tile ────────────────────────────────────────────────────────────

function SkeletonTile() {
  return (
    <div className="rounded-xl overflow-hidden animate-pulse" style={{ background: '#f0ece2', border: '2px solid #0A0A0A' }}>
      <div className="w-full aspect-[2.5/3.5]" style={{ background: '#e0dbd0' }} />
      <div className="p-2.5 space-y-2">
        <div className="h-3 rounded w-3/4" style={{ background: '#e0dbd0' }} />
        <div className="h-2.5 rounded w-1/2" style={{ background: '#e0dbd0' }} />
        <div className="h-4 rounded w-2/3 mt-1" style={{ background: '#e0dbd0' }} />
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
  const condition  = item.condition ?? 'NM'
  const priceData  = item.cards.card_prices?.[0]
  const usdPrice   = priceData?.usd_price ?? null
  const localPrice = countryCode === 'UAE' ? (priceData?.aed_price ?? null) : (priceData?.inr_price ?? null)
  const fetchedAt  = priceData?.last_fetched ?? null

  const gainPct = (usdPrice != null && item.added_price_usd != null && item.added_price_usd > 0)
    ? ((usdPrice - item.added_price_usd) / item.added_price_usd) * 100
    : null

  const graded = item.grading_company && item.grading_company !== 'RAW' && item.grade != null
  const gradeDisplay = item.grade != null
    ? (item.grade % 1 === 0 ? String(item.grade) : item.grade.toFixed(1))
    : ''

  return (
    <Link
      href={`/binder/card/${item.cards.id}`}
      className="holo-card rounded-xl overflow-hidden group relative block"
      style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
    >
      {/* Top-left badge — grading only */}
      {graded && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: '#0A0A0A', color: '#FAF6EC' }}>
            {item.grading_company} {gradeDisplay}
          </span>
        </div>
      )}

      {/* Delete button */}
      {isOwner && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(item.id) }}
          className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded flex items-center justify-center text-[9px] transition-all opacity-0 group-hover:opacity-100"
          style={{ background: '#E8233B', border: '1.5px solid #0A0A0A', color: '#fff' }}
          title="Remove from collection"
        >
          ✕
        </button>
      )}

      {/* Card image */}
      <div className="relative w-full aspect-[2.5/3.5] overflow-hidden" style={{ background: '#f0ece2', borderBottom: '2px solid #0A0A0A' }}>
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
        <p className="font-black text-xs leading-tight line-clamp-1" style={{ color: '#0A0A0A' }}>{item.cards.name}</p>
        <p className="text-[11px] line-clamp-1" style={{ color: '#8B7866' }}>{item.cards.set_name}</p>

        {/* Condition + foil row */}
        <div className="flex items-center gap-1 flex-wrap">
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{ background: '#0A0A0A', color: '#FAF6EC' }}
          >
            {CONDITION_LABEL[condition] ?? condition}
          </span>
          {item.is_foil && (
            <span className="foil-badge text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide">
              ✦ FOIL
            </span>
          )}
        </div>

        {/* Price */}
        {priceLoading ? (
          <div className="h-3.5 w-3/4 rounded animate-pulse mt-1" style={{ background: '#e0dbd0' }} />
        ) : usdPrice != null ? (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-black text-xs" style={{ color: '#E8233B' }}>
                {formatPrice(localPrice ?? convertFromUSD(usdPrice, countryCode), countryCode)}
              </p>
              {isOwner && gainPct != null && (
                <span
                  className="text-[9px] font-black px-1 py-0.5"
                  style={{
                    background: gainPct >= 0 ? '#dcfce7' : '#fee2e2',
                    color:      gainPct >= 0 ? '#16a34a' : '#dc2626',
                  }}
                >
                  {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                </span>
              )}
            </div>
            {fetchedAt && (
              <p className="text-[10px]" style={{ color: '#8B7866' }}>Updated {timeAgo(fetchedAt)}</p>
            )}
          </>
        ) : (
          <p className="text-[10px]" style={{ color: '#8B7866' }}>Price unavailable</p>
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
  const router = useRouter()
  const { countryCode, initialized: countryReady } = useCountry()
  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [priceLoadingIds, setPriceLoadingIds] = useState<Set<string>>(new Set())
  const [scanOpen, setScanOpen] = useState(false)
  const [sevenDayChange, setSevenDayChange] = useState<number | null>(null)
  const refreshed     = useRef<Set<string>>(new Set())
  const snapshotSaved = useRef(false)

  const fetchCollection = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_cards')
      .select(`
        id, card_id, created_at, condition, is_foil,
        grading_company, grade, grade_label, added_price_usd,
        cards (
          id, name, set_name, rarity, image_url, card_number,
          card_prices ( usd_price, inr_price, aed_price, last_fetched )
        )
      `)
      .eq('user_id', profileUserId)
      .eq('list_type', 'HAVE')
      .order('created_at', { ascending: false })

    if (error) { setLoading(false); return }
    if (!data)  { setLoading(false); return }

    const typed = data as unknown as CollectionItem[]
    setItems(typed)
    setLoading(false)

    const toRefresh = typed
      .filter(item => isStale(item.cards.card_prices?.[0]?.last_fetched ?? null))
      .filter(item => !refreshed.current.has(item.cards.id))

    if (toRefresh.length === 0) return

    const newIds = toRefresh.map(i => i.cards.id)
    setPriceLoadingIds(prev => new Set(Array.from(prev).concat(newIds)))

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
                it.cards.id !== cid ? it : {
                  ...it,
                  cards: { ...it.cards, card_prices: [{ usd_price, inr_price, aed_price, last_fetched }] },
                }
              )
            )
          } catch {
            // AbortError or network error — finally handles cleanup
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
      if (i + BATCH < toRefresh.length) await new Promise(r => setTimeout(r, 1000))
    }

    // After all prices are fresh, save today's snapshot and compute 7D change
    if (!snapshotSaved.current) {
      snapshotSaved.current = true

      // Re-read items from state to get the latest prices
      setItems(latest => {
        const totalUsd = latest.reduce((sum, it) => {
          const p = it.cards.card_prices?.[0]?.usd_price ?? 0
          return sum + p
        }, 0)

        // Fire-and-forget: save today's snapshot, seed baseline if needed, compute 7D
        ;(async () => {
          await fetch('/api/snapshot-value', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value_usd: totalUsd }),
          })

          const res = await fetch('/api/snapshot-value')
          if (!res.ok) return
          const { snapshots } = await res.json() as { snapshots: { snapshot_date: string; value_usd: number }[] }

          if (snapshots.length <= 1) {
            // Seed a baseline 7 days ago so tracking begins immediately (shows 0% to start)
            const baseDate = new Date()
            baseDate.setDate(baseDate.getDate() - 7)
            await fetch('/api/snapshot-value', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value_usd: totalUsd, snapshot_date: baseDate.toISOString().slice(0, 10) }),
            })
            setSevenDayChange(0)
          } else {
            const oldest = snapshots[0].value_usd
            const newest = snapshots[snapshots.length - 1].value_usd
            if (oldest > 0) setSevenDayChange(((newest - oldest) / oldest) * 100)
          }
        })()

        return latest
      })
    }
  }, [profileUserId])

  useEffect(() => { fetchCollection() }, [fetchCollection])

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
    return sum + convertFromUSD(p?.usd_price ?? 0, countryCode)
  }, 0)

  // All-time gain: compare current USD value vs added_price_usd for cards that have both
  const { currentUsd: gainCurrentUsd, addedUsd: gainAddedUsd } = items.reduce(
    (acc, item) => {
      const cur = item.cards.card_prices?.[0]?.usd_price ?? null
      const add = item.added_price_usd ?? null
      if (cur != null && add != null && add > 0) {
        acc.currentUsd += cur
        acc.addedUsd   += add
      }
      return acc
    },
    { currentUsd: 0, addedUsd: 0 }
  )
  const allTimeGainPct = gainAddedUsd > 0
    ? ((gainCurrentUsd - gainAddedUsd) / gainAddedUsd) * 100
    : null

  const pricesUpdating = priceLoadingIds.size > 0

  return (
    <main className="min-h-screen px-4 py-6 pb-28" style={{ background: '#FAF6EC' }}>
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* Back button (non-owner) or PT logo (owner) */}
            {isOwner ? (
              <div
                className="w-10 h-10 flex items-center justify-center font-black text-sm"
                style={{ background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', color: '#FAF6EC' }}
              >
                PT
              </div>
            ) : (
              <button
                onClick={() => router.back()}
                className="w-10 h-10 flex items-center justify-center font-black text-base"
                style={{ background: '#F4D03F', border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A' }}
                aria-label="Back"
              >
                ←
              </button>
            )}
            <div>
              <h1 className="font-black text-lg leading-none tracking-tight" style={{ color: '#0A0A0A' }}>
                {isOwner ? 'My collection' : `@${profileUsername}`}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: '#8B7866' }}>
                {loading ? '—' : `${items.length} card${items.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        </div>

        {/* Stats / value banner */}
        {!loading && items.length > 0 && (
          <div
            className="rounded-xl mb-5 overflow-hidden"
            style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
          >
            <div className={`grid grid-cols-${isOwner ? 4 : 2}`} style={{ borderBottom: '2px solid #0A0A0A' }}>
              {[
                {
                  label: 'CARDS',
                  value: items.length.toString(),
                  color: '#0A0A0A',
                },
                {
                  label: 'VALUE',
                  value: countryReady ? formatPrice(totalLocal, countryCode) : '…',
                  color: '#E8233B',
                  updating: pricesUpdating,
                },
                ...(isOwner ? [
                  {
                    label: '7D',
                    value: sevenDayChange != null
                      ? `${sevenDayChange >= 0 ? '+' : ''}${sevenDayChange.toFixed(1)}%`
                      : '—',
                    color: sevenDayChange == null ? '#8B7866'
                      : sevenDayChange >= 0 ? '#16a34a' : '#dc2626',
                  },
                  {
                    label: 'GAIN',
                    value: allTimeGainPct != null
                      ? `${allTimeGainPct >= 0 ? '+' : ''}${allTimeGainPct.toFixed(1)}%`
                      : '—',
                    color: allTimeGainPct == null ? '#8B7866'
                      : allTimeGainPct >= 0 ? '#16a34a' : '#dc2626',
                  },
                ] : []),
              ].map((s, i, arr) => (
                <div
                  key={s.label}
                  className="py-3 px-2 flex flex-col"
                  style={{ borderRight: i < arr.length - 1 ? '2px solid #0A0A0A' : 'none', background: '#FAF6EC' }}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#8B7866' }}>{s.label}</span>
                  <span className="font-black text-sm leading-tight mt-0.5" style={{ color: s.color }}>
                    {'updating' in s && s.updating ? (
                      <span className="text-xs" style={{ color: '#8B7866' }}>…</span>
                    ) : s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Holdings label */}
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-sm" style={{ background: '#E8233B' }} />
            <span className="font-black text-xs uppercase tracking-widest" style={{ color: '#0A0A0A' }}>Holdings</span>
            <div className="flex-1 h-px" style={{ background: '#0A0A0A' }} />
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonTile key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
          >
            <span className="text-5xl mb-4 block">📦</span>
            <h2 className="font-black text-lg mb-2" style={{ color: '#0A0A0A' }}>
              {isOwner ? 'Your binder is empty' : 'No cards yet'}
            </h2>
            <p className="text-sm mb-6" style={{ color: '#8B7866' }}>
              {isOwner
                ? 'Search for cards and add them to your collection.'
                : `@${profileUsername} hasn't added any cards yet.`}
            </p>
            {isOwner && (
              <Link
                href="/binder/add-cards"
                className="inline-flex items-center gap-2 font-black rounded px-5 py-2.5 text-sm transition-all"
                style={{ background: '#E8233B', color: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
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
        <div className="fixed bottom-20 left-0 right-0 flex justify-center gap-3 z-30 px-4">
          <Link
            href="/binder/add-cards"
            className="flex items-center gap-2 font-black rounded px-6 py-3.5 text-sm tracking-wide transition-all"
            style={{ background: '#E8233B', color: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '5px 5px 0 #0A0A0A' }}
          >
            + ADD CARD
          </Link>
          <button
            className="flex items-center gap-2 font-black rounded px-6 py-3.5 text-sm tracking-wide"
            style={{ background: '#FAF6EC', color: '#0A0A0A', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}
            onClick={() => setScanOpen(true)}
          >
            SCAN
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

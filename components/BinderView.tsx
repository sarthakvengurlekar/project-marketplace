'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPrice, convertFromUSD } from '@/lib/currency'
import { getAdjustedUsdPrice } from '@/lib/grading'
import ScanCardModal from '@/components/ScanCardModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardPrice {
  usd_price: number | null
  inr_price: number | null
  aed_price: number | null
  last_fetched: string | null
  source?: string
  reason?: string
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
const PRICE_STALE_MS = 15 * 60_000

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function isStale(fetchedAt: string | null, staleMs = PRICE_STALE_MS): boolean {
  if (!fetchedAt) return true
  const fetchedTime = new Date(fetchedAt).getTime()
  if (!Number.isFinite(fetchedTime)) return true
  return Date.now() - fetchedTime > staleMs
}

function needsPriceRefresh(price: CardPrice | undefined, staleMs = PRICE_STALE_MS): boolean {
  if (!price || price.usd_price == null) return true
  return isStale(price.last_fetched, staleMs)
}

function isFinitePrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasUsdPrice(price: CardPrice | undefined): price is CardPrice {
  return isFinitePrice(price?.usd_price)
}

function priceFetchedTime(price: CardPrice | undefined): number {
  if (!price?.last_fetched) return 0
  const time = new Date(price.last_fetched).getTime()
  return Number.isFinite(time) ? time : 0
}

function mergeItemsWithCurrentPrices(
  incomingItems: CollectionItem[],
  currentItems: CollectionItem[],
): CollectionItem[] {
  const currentPriceByCardId = new Map<string, CardPrice>()

  for (const item of currentItems) {
    const price = item.cards.card_prices?.[0]
    if (hasUsdPrice(price)) currentPriceByCardId.set(item.cards.id, price)
  }

  return incomingItems.map(item => {
    const currentPrice = currentPriceByCardId.get(item.cards.id)
    if (!currentPrice) return item

    const incomingPrice = item.cards.card_prices?.[0]
    if (hasUsdPrice(incomingPrice) && priceFetchedTime(incomingPrice) >= priceFetchedTime(currentPrice)) {
      return item
    }

    return { ...item, cards: { ...item.cards, card_prices: [currentPrice] } }
  })
}

function mergePriceUpdates(
  items: CollectionItem[],
  updates: { cid: string; price: CardPrice }[],
): CollectionItem[] {
  const updateMap = new Map(updates.map(update => [update.cid, update.price]))

  return items.map(item => {
    const price = updateMap.get(item.cards.id)
    if (!price) return item
    return { ...item, cards: { ...item.cards, card_prices: [price] } }
  })
}

function getItemCurrentUsd(item: CollectionItem): number | null {
  const rawUsd = item.cards.card_prices?.[0]?.usd_price ?? null
  return getAdjustedUsdPrice(rawUsd, item.grading_company, item.grade)
}

function roundLocalPrice(amount: number, countryCode: string): number {
  return countryCode === 'UAE' ? Math.round(amount * 100) / 100 : Math.round(amount)
}

function getItemCurrentLocal(item: CollectionItem, countryCode: string): number | null {
  const priceData = item.cards.card_prices?.[0]
  const marketUsd = getItemCurrentUsd(item)
  if (marketUsd == null) return null

  const rawUsd = priceData?.usd_price
  const rawLocal = countryCode === 'UAE' ? priceData?.aed_price : priceData?.inr_price

  if (isFinitePrice(rawLocal) && isFinitePrice(rawUsd) && rawUsd > 0) {
    return roundLocalPrice(rawLocal * (marketUsd / rawUsd), countryCode)
  }

  return convertFromUSD(marketUsd, countryCode)
}

function getCollectionCurrentLocal(items: CollectionItem[], countryCode: string): number {
  return items.reduce((sum, item) => sum + (getItemCurrentLocal(item, countryCode) ?? 0), 0)
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
  const marketUsd  = getItemCurrentUsd(item)
  const localPrice = getItemCurrentLocal(item, countryCode)
  const fetchedAt  = priceData?.last_fetched ?? null
  const showPriceSkeleton = priceLoading && marketUsd == null

  const gainPct = (marketUsd != null && item.added_price_usd != null && item.added_price_usd > 0)
    ? ((marketUsd - item.added_price_usd) / item.added_price_usd) * 100
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
        <div className="space-y-1" style={{ minHeight: 34 }}>
        {showPriceSkeleton ? (
          <>
            <div className="h-3.5 w-3/4 rounded animate-pulse mt-1" style={{ background: '#e0dbd0' }} />
            <p className="text-[10px]" style={{ color: '#8B7866' }}>Checking price</p>
          </>
        ) : marketUsd != null ? (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-black text-xs" style={{ color: '#E8233B' }}>
                {formatPrice(localPrice ?? convertFromUSD(marketUsd, countryCode), countryCode)}
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
  const refreshed     = useRef<Set<string>>(new Set())
  const refreshing    = useRef<Set<string>>(new Set())
  const baselineBackfilled = useRef<Set<string>>(new Set())
  const baselineBackfilling = useRef<Set<string>>(new Set())
  const itemsRef      = useRef<CollectionItem[]>([])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const backfillMissingAddedPriceBaselines = useCallback(async (latestItems: CollectionItem[]) => {
    if (!isOwner) return latestItems

    const missingBaselines = latestItems
      .map(item => ({ item, baselineUsd: getItemCurrentUsd(item) }))
      .filter(({ item, baselineUsd }) => (
        baselineUsd != null &&
        baselineUsd > 0 &&
        (item.added_price_usd == null || item.added_price_usd <= 0) &&
        !baselineBackfilled.current.has(item.id) &&
        !baselineBackfilling.current.has(item.id)
      ))

    if (missingBaselines.length === 0) return latestItems

    missingBaselines.forEach(({ item }) => baselineBackfilling.current.add(item.id))

    const results = await Promise.allSettled(
      missingBaselines.map(async ({ item, baselineUsd }) => {
        const { error } = await supabase
          .from('user_cards')
          .update({ added_price_usd: baselineUsd })
          .eq('id', item.id)
          .eq('user_id', profileUserId)

        if (error) throw error
        return { userCardId: item.id, baselineUsd }
      })
    )

    missingBaselines.forEach(({ item }) => baselineBackfilling.current.delete(item.id))

    const updates = results
      .filter((result): result is PromiseFulfilledResult<{ userCardId: string; baselineUsd: number }> => result.status === 'fulfilled')
      .map(result => result.value)

    updates.forEach(update => baselineBackfilled.current.add(update.userCardId))

    if (updates.length === 0) return latestItems

    const baselineByUserCardId = new Map(updates.map(update => [update.userCardId, update.baselineUsd]))
    const nextItems = latestItems.map(item => {
      const baseline = baselineByUserCardId.get(item.id)
      return baseline != null ? { ...item, added_price_usd: baseline } : item
    })

    itemsRef.current = nextItems
    setItems(nextItems)
    return nextItems
  }, [isOwner, profileUserId])

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

    const typed = mergeItemsWithCurrentPrices(data as unknown as CollectionItem[], itemsRef.current)
    itemsRef.current = typed
    setItems(typed)
    setLoading(false)

    const toRefresh = typed
      .filter(item => needsPriceRefresh(item.cards.card_prices?.[0], PRICE_STALE_MS))
      .filter(item => !refreshed.current.has(item.cards.id))
      .filter(item => !refreshing.current.has(item.cards.id))
      .sort((a, b) => {
        const aPrice = a.cards.card_prices?.[0]
        const bPrice = b.cards.card_prices?.[0]
        const aMissing = getItemCurrentUsd(a) == null
        const bMissing = getItemCurrentUsd(b) == null
        if (aMissing !== bMissing) return aMissing ? -1 : 1
        return priceFetchedTime(aPrice) - priceFetchedTime(bPrice)
      })

    if (toRefresh.length === 0) {
      await backfillMissingAddedPriceBaselines(typed)
      return
    }

    const missingPriceIds = toRefresh
      .filter(item => getItemCurrentUsd(item) == null)
      .map(item => item.cards.id)
    if (missingPriceIds.length > 0) {
      setPriceLoadingIds(prev => new Set(Array.from(prev).concat(missingPriceIds)))
    }

    const BATCH = isOwner ? 2 : 3
    let latestItems = typed

    for (let i = 0; i < toRefresh.length; i += BATCH) {
      const batch = toRefresh.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const cid = item.cards.id
          if (refreshed.current.has(cid)) return null
          if (refreshing.current.has(cid)) return null
          refreshing.current.add(cid)

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15_000)

          try {
            const res = await fetch(`/api/refresh-price?card_id=${encodeURIComponent(cid)}`, { signal: controller.signal })
            clearTimeout(timeoutId)
            if (!res.ok) return null
            const { usd_price, inr_price, aed_price, last_fetched, source, reason } = await res.json()
            refreshed.current.add(cid)
            if (usd_price == null && item.cards.card_prices?.[0]?.usd_price != null) return null
            return { cid, price: { usd_price, inr_price, aed_price, last_fetched, source, reason } as CardPrice }
          } catch {
            // AbortError or network error — finally handles cleanup
            return null
          } finally {
            clearTimeout(timeoutId)
            refreshing.current.delete(cid)
            if (missingPriceIds.includes(cid)) {
              setPriceLoadingIds(prev => {
                const next = new Set(prev)
                next.delete(cid)
                return next
              })
            }
          }
        })
      )

      const updates = results
        .filter((result): result is PromiseFulfilledResult<{ cid: string; price: CardPrice }> => (
          result.status === 'fulfilled' && result.value != null
        ))
        .map(result => result.value)

      if (updates.length > 0) {
        latestItems = mergePriceUpdates(itemsRef.current.length > 0 ? itemsRef.current : latestItems, updates)
        itemsRef.current = latestItems
        setItems(latestItems)
      }

      if (i + BATCH < toRefresh.length) await new Promise(r => setTimeout(r, isOwner ? 700 : 1000))
    }

    await backfillMissingAddedPriceBaselines(latestItems)
  }, [profileUserId, isOwner, backfillMissingAddedPriceBaselines])

  useEffect(() => { fetchCollection() }, [fetchCollection])

  async function handleDelete(userCardId: string) {
    const { error } = await supabase
      .from('user_cards')
      .delete()
      .eq('id', userCardId)
      .eq('user_id', profileUserId)
    if (!error) {
      setItems(prev => {
        const next = prev.filter(i => i.id !== userCardId)
        itemsRef.current = next
        return next
      })
    }
  }

  const totalLocal = getCollectionCurrentLocal(items, countryCode)

  // All-time gain: compare current USD value vs added_price_usd for cards that have both
  const { currentUsd: gainCurrentUsd, addedUsd: gainAddedUsd } = items.reduce(
    (acc, item) => {
      const cur = getItemCurrentUsd(item)
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
            <div
              className="grid"
              style={{
                borderBottom: '2px solid #0A0A0A',
                gridTemplateColumns: `repeat(${isOwner ? 3 : 2}, minmax(0, 1fr))`,
              }}
            >
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
      {isOwner && !loading && items.length > 0 && (
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

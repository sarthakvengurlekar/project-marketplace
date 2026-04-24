'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPriceFromUSD } from '@/lib/currency'
import GradingSelector, { GradingSelection, DEFAULT_GRADING } from '@/components/GradingSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PptCard {
  tcgPlayerId?: string | number
  externalCatalogId?: string
  name?: string
  setName?: string
  setId?: string | number
  number?: string
  cardNumber?: string
  rarity?: string
  imageCdnUrl200?: string
  imageCdnUrl400?: string
  imageCdnUrl800?: string
  image?: { small?: string; large?: string }
  imageUrl?: string
  prices?: {
    market?: number | null
    low?: number | null
    high?: number | null
    primaryPrinting?: string | null
  }
  hp?: string | number
  stage?: string
  cardType?: string
  pokemonType?: string
  energyType?: string[]
  weakness?: string
  resistance?: string
  retreatCost?: string | number
  attacks?: Array<{ name: string; damage?: string; text?: string; cost?: string[] }>
  flavorText?: string
  artist?: string
  tcgPlayerUrl?: string
  printingsAvailable?: string[]
  dataCompleteness?: string
  lastScrapedAt?: string
}

function getImageUrl(card: PptCard): string {
  return (
    card.imageCdnUrl400 ??
    card.imageCdnUrl200 ??
    card.imageUrl ??
    card.image?.large ??
    card.image?.small ??
    ''
  )
}

interface ExchangeRates { USD_INR: number; USD_AED: number }
const FALLBACK_RATES: ExchangeRates = { USD_INR: 83.5, USD_AED: 3.67 }

// ─── Rarity helpers ───────────────────────────────────────────────────────────

const RARITY_BADGE: Record<string, { bg: string; color: string }> = {
  'Common':                    { bg: 'rgba(63,63,70,0.88)',   color: '#d4d4d8' },
  'Uncommon':                  { bg: 'rgba(5,46,22,0.88)',    color: '#6ee7b7' },
  'Rare':                      { bg: 'rgba(30,58,138,0.88)',  color: '#93c5fd' },
  'Rare Holo':                 { bg: 'rgba(78,52,6,0.88)',    color: '#fde68a' },
  'Rare Holo V':               { bg: 'rgba(78,52,6,0.88)',    color: '#fde68a' },
  'Rare Holo VMAX':            { bg: 'rgba(92,45,0,0.88)',    color: '#fdba74' },
  'Rare Holo VSTAR':           { bg: 'rgba(92,45,0,0.88)',    color: '#fdba74' },
  'Rare Ultra':                { bg: 'rgba(59,7,100,0.88)',   color: '#d8b4fe' },
  'Rare Rainbow':              { bg: 'rgba(80,7,36,0.88)',    color: '#fbcfe8' },
  'Rare Secret':               { bg: 'rgba(76,5,25,0.88)',    color: '#fca5a5' },
  'Rare Shining':              { bg: 'rgba(30,27,75,0.88)',   color: '#a5b4fc' },
  'Amazing Rare':              { bg: 'rgba(4,47,46,0.88)',    color: '#5eead4' },
  'Illustration Rare':         { bg: 'rgba(46,16,101,0.88)',  color: '#c4b5fd' },
  'Special Illustration Rare': { bg: 'rgba(74,4,78,0.88)',    color: '#f0abfc' },
  'Hyper Rare':                { bg: 'rgba(67,20,7,0.88)',    color: '#fed7aa' },
  'Promo':                     { bg: 'rgba(67,20,7,0.88)',    color: '#fdba74' },
}

function rarityBadge(r: string | undefined): { bg: string; color: string } {
  if (!r) return { bg: 'rgba(63,63,70,0.88)', color: '#a1a1aa' }
  return RARITY_BADGE[r] ?? { bg: 'rgba(63,63,70,0.88)', color: '#a1a1aa' }
}

function rarityShort(r: string | undefined): string {
  if (!r) return ''
  return r
    .replace('Special Illustration Rare', 'Sp. IR')
    .replace('Illustration Rare', 'Illus. R')
    .replace('Rare Holo VMAX', 'VMAX')
    .replace('Rare Holo VSTAR', 'VSTAR')
    .replace('Rare Holo V', 'Rare V')
    .replace('Rare Holo', 'Holo')
    .replace('Rare Ultra', 'Ultra R')
    .replace('Rare Rainbow', 'Rainbow')
    .replace('Rare Secret', 'Secret R')
    .replace('Rare Shining', 'Shining')
    .replace('Amazing Rare', 'Amazing')
    .replace('Hyper Rare', 'Hyper R')
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastState =
  | { type: 'success'; message: string }
  | { type: 'info';    message: string }
  | { type: 'error';   message: string }
  | null

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  if (!toast) return null
  const styles = {
    success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    info:    'bg-zinc-800 border-zinc-700 text-zinc-300',
    error:   'bg-red-500/15 border-red-500/30 text-red-400',
  }
  return (
    <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl text-sm font-semibold backdrop-blur-sm ${styles[toast.type]}`}>
      {toast.message}
    </div>
  )
}

// ─── Shimmer tile ─────────────────────────────────────────────────────────────

function ShimmerTile() {
  return (
    <div style={{ borderRadius: 12, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
      <div className="card-shimmer" style={{ height: 130 }} />
      <div style={{ padding: '8px 8px 10px' }}>
        <div className="card-shimmer" style={{ height: 13, width: '80%', borderRadius: 6, marginBottom: 6 }} />
        <div className="card-shimmer" style={{ height: 11, width: '55%', borderRadius: 5, marginBottom: 6 }} />
        <div className="card-shimmer" style={{ height: 13, width: '40%', borderRadius: 5 }} />
      </div>
    </div>
  )
}

// ─── Grading drawer ───────────────────────────────────────────────────────────

function GradingDrawer({
  card, open, adding, onClose, onConfirm,
}: {
  card: PptCard | null
  open: boolean
  adding: boolean
  onClose: () => void
  onConfirm: (g: GradingSelection) => void
}) {
  const [grading, setGrading] = useState<GradingSelection>(DEFAULT_GRADING)
  useEffect(() => { if (card) setGrading(DEFAULT_GRADING) }, [card])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const imageUrl = card ? getImageUrl(card) : ''

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/75 z-[60] backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-[60] bg-zinc-950 border-t border-zinc-800 rounded-t-3xl transition-transform duration-300 ease-out flex flex-col ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        <div className="overflow-y-auto px-4 pb-8 flex-1" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {card && (
            <div className="flex items-center gap-3 py-4 border-b border-zinc-800 mb-5">
              {imageUrl && (
                <div className="relative w-14 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-800">
                  <Image src={imageUrl} alt={card.name ?? ''} fill className="object-contain p-0.5" unoptimized />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white font-black text-base leading-tight">{card.name ?? '—'}</p>
                <p className="text-zinc-500 text-xs mt-0.5 line-clamp-1">{card.setName}</p>
              </div>
            </div>
          )}
          <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-4">Select Grading</p>
          <GradingSelector value={grading} onChange={setGrading} />
          <button
            onClick={() => onConfirm(grading)}
            disabled={adding}
            className="w-full mt-6 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-black rounded-xl py-3.5 text-sm tracking-wide transition-colors flex items-center justify-center gap-2"
          >
            {adding ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Adding…</> : 'Add to Collection'}
          </button>
          <button onClick={onClose} disabled={adding} className="w-full mt-2 text-zinc-500 hover:text-zinc-300 text-sm py-2.5 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Card tile ────────────────────────────────────────────────────────────────

type AddState = 'idle' | 'loading' | 'added' | 'duplicate'

function CardTile({
  card, addState, onAdd, rates, countryCode,
}: {
  card: PptCard
  addState: AddState
  onAdd: () => void
  rates: ExchangeRates
  countryCode: string
}) {
  const imageUrl  = getImageUrl(card)
  const usdPrice  = card.prices?.market ?? null
  const localPrice = usdPrice != null ? formatPriceFromUSD(usdPrice, countryCode) : null
  const rBadge    = rarityBadge(card.rarity)

  const btnBg =
    addState === 'added'     ? '#10b981' :
    addState === 'duplicate' ? '#27272a' :
    '#eab308'

  return (
    <div style={{
      position: 'relative',
      borderRadius: 12,
      background: '#1a1a1a',
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>

      {/* Image */}
      <div style={{ height: 130, position: 'relative', overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={card.name ?? ''}
            fill
            style={{ objectFit: 'cover', objectPosition: 'center top' }}
            unoptimized
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#252525', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 32, opacity: 0.25 }}>🃏</span>
          </div>
        )}

        {/* Price — top left */}
        {usdPrice != null && (
          <span style={{
            position: 'absolute', top: 5, left: 5,
            background: 'rgba(0,0,0,0.78)', color: '#fff',
            fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 6,
            backdropFilter: 'blur(4px)',
          }}>
            ${usdPrice.toFixed(2)}
          </span>
        )}

        {/* Rarity — top right */}
        {card.rarity && (
          <span style={{
            position: 'absolute', top: 5, right: 5,
            background: rBadge.bg, color: rBadge.color,
            fontSize: 9, fontWeight: 700,
            padding: '2px 5px', borderRadius: 5,
            backdropFilter: 'blur(4px)',
          }}>
            {rarityShort(card.rarity)}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '7px 40px 8px 8px' }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
          {card.name ?? '—'}
        </p>
        <p style={{ color: '#71717a', fontSize: 11, lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0' }}>
          {[card.setName, (card.cardNumber ?? card.number) ? `#${card.cardNumber ?? card.number}` : null].filter(Boolean).join(' · ')}
        </p>
        {(card.hp || card.stage) && (
          <p style={{ color: '#52525b', fontSize: 10, margin: '2px 0 0', lineHeight: '1.2' }}>
            {[card.hp ? `${card.hp} HP` : null, card.stage].filter(Boolean).join(' · ')}
          </p>
        )}
        {localPrice && (
          <p style={{ color: '#eab308', fontWeight: 700, fontSize: 13, margin: '3px 0 0', lineHeight: '1.2' }}>
            {localPrice}
          </p>
        )}
      </div>

      {/* + button */}
      <button
        onClick={onAdd}
        disabled={addState !== 'idle'}
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: btnBg,
          border: 'none',
          cursor: addState === 'idle' ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: addState === 'idle' ? '0 0 10px rgba(234,179,8,0.55)' : 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
          zIndex: 10,
          padding: 0,
        }}
      >
        {addState === 'loading' ? (
          <span style={{
            width: 14, height: 14,
            border: '2px solid rgba(0,0,0,0.4)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'block',
            animation: 'tileSpin 0.7s linear infinite',
          }} />
        ) : addState === 'added' ? (
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, lineHeight: 1 }}>✓</span>
        ) : addState === 'duplicate' ? (
          <span style={{ color: '#52525b', fontWeight: 800, fontSize: 14, lineHeight: 1 }}>✓</span>
        ) : (
          <span style={{ color: '#000', fontWeight: 900, fontSize: 22, lineHeight: 1, userSelect: 'none' }}>+</span>
        )}
      </button>
    </div>
  )
}

// ─── Guest tile (no auth) ─────────────────────────────────────────────────────

function CardTileGuest({ card }: { card: PptCard }) {
  const imageUrl = getImageUrl(card)
  return (
    <div style={{ borderRadius: 12, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', opacity: 0.7 }}>
      <div style={{ height: 130, position: 'relative', overflow: 'hidden' }}>
        {imageUrl ? (
          <Image src={imageUrl} alt={card.name ?? ''} fill style={{ objectFit: 'cover', objectPosition: 'center top' }} unoptimized />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#252525' }} />
        )}
      </div>
      <div style={{ padding: '7px 8px 8px' }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{card.name ?? '—'}</p>
        <p style={{ color: '#71717a', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0' }}>{card.setName}</p>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export default function CardSearch({ onCardAdded }: { onCardAdded?: () => void } = {}) {
  const { countryCode } = useCountry()

  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<PptCard[]>([])
  const [loading,     setLoading]     = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched,    setSearched]    = useState(false)
  const [hasMore,     setHasMore]     = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [userId,      setUserId]      = useState<string | null>(null)
  const [rates,       setRates]       = useState<ExchangeRates>(FALLBACK_RATES)
  const [toast,       setToast]       = useState<ToastState>(null)

  const [gradingCard,   setGradingCard]   = useState<PptCard | null>(null)
  const [gradingAdding, setGradingAdding] = useState(false)
  const [addStates,     setAddStates]     = useState<Record<string, AddState>>({})

  const abortRef    = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offsetRef   = useRef(0)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
      const { data: rateRows } = await supabase
        .from('exchange_rates').select('currency_pair, rate')
        .in('currency_pair', ['USD_INR', 'USD_AED'])
      if (rateRows?.length) {
        setRates({
          USD_INR: rateRows.find(r => r.currency_pair === 'USD_INR')?.rate ?? FALLBACK_RATES.USD_INR,
          USD_AED: rateRows.find(r => r.currency_pair === 'USD_AED')?.rate ?? FALLBACK_RATES.USD_AED,
        })
      }
    }
    init()
  }, [])

  const runSearch = useCallback(async (term: string, offset: number) => {
    if (!term.trim()) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (offset === 0) {
      setLoading(true); setSearched(true); setResults([])
      setError(null); setRateLimited(false); setAddStates({})
    } else {
      setLoadingMore(true)
    }

    try {
      const res = await fetch(
        `/api/search-cards?search=${encodeURIComponent(term.trim())}&offset=${offset}&limit=${PAGE_SIZE}`,
        { signal: ctrl.signal },
      )
      if (!res.ok) throw new Error(`Search error ${res.status}`)
      const json = await res.json()
      const cards: PptCard[] = json.cards ?? []
      if (offset === 0) setResults(cards)
      else setResults(prev => [...prev, ...cards])
      offsetRef.current = offset + cards.length
      setHasMore(json.hasMore ?? false)
      setRateLimited(json.rateLimited ?? false)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Search failed.')
      if (offset === 0) setResults([])
    } finally {
      setLoading(false); setLoadingMore(false)
    }
  }, [])

  // 300ms debounce on query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]); setSearched(false); setHasMore(false); setRateLimited(false); setError(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { offsetRef.current = 0; runSearch(query, 0) }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, runSearch])

  function triggerSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    offsetRef.current = 0; runSearch(query, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') triggerSearch()
  }

  function handleRequestAdd(card: PptCard) {
    if (!userId) return
    const id = String(card.tcgPlayerId ?? '')
    const st = addStates[id]
    if (st === 'added' || st === 'duplicate' || st === 'loading') return
    setGradingCard(card)
  }

  async function handleConfirmGrading(grading: GradingSelection) {
    if (!gradingCard || !userId) return
    const card   = gradingCard
    const cardId = String(card.tcgPlayerId ?? '')
    setGradingAdding(true)
    setAddStates(prev => ({ ...prev, [cardId]: 'loading' }))

    try {
      const { error: cardErr } = await supabase.from('cards').upsert({
        id:                  cardId,
        name:                card.name ?? '',
        set_name:            card.setName ?? null,
        set_code:            card.externalCatalogId ? card.externalCatalogId.split('-')[0] : null,
        set_id:              card.setId != null ? Number(card.setId) : null,
        card_number:         card.cardNumber ?? card.number ?? null,
        rarity:              card.rarity ?? null,
        image_url:           card.imageCdnUrl200 ?? card.imageCdnUrl400 ?? card.imageUrl ?? card.image?.small ?? null,
        image_url_hires:     card.imageCdnUrl800 ?? card.imageUrl ?? card.image?.large ?? null,
        tcgplayer_id:        cardId,
        hp:                  card.hp != null ? String(card.hp) : null,
        stage:               card.stage ?? null,
        card_type:           card.cardType ?? null,
        pokemon_type:        card.pokemonType ?? null,
        energy_type:         card.energyType ?? null,
        weakness:            card.weakness ?? null,
        resistance:          card.resistance ?? null,
        retreat_cost:        card.retreatCost != null ? String(card.retreatCost) : null,
        attacks:             card.attacks ?? null,
        flavor_text:         card.flavorText ?? null,
        artist:              card.artist ?? null,
        tcgplayer_url:       card.tcgPlayerUrl ?? null,
        external_catalog_id: card.externalCatalogId ?? null,
        printings_available: card.printingsAvailable ?? null,
        primary_printing:    card.prices?.primaryPrinting ?? null,
        data_completeness:   card.dataCompleteness ?? null,
        last_scraped_at:     card.lastScrapedAt ?? null,
      }, { onConflict: 'id' })
      if (cardErr) throw cardErr

      const usdPrice = card.prices?.market ?? null
      if (usdPrice != null) {
        await supabase.from('card_prices').upsert({
          card_id:      cardId,
          usd_price:    usdPrice,
          inr_price:    Math.round(usdPrice * rates.USD_INR),
          aed_price:    Math.round(usdPrice * rates.USD_AED * 100) / 100,
          last_fetched: new Date().toISOString(),
        }, { onConflict: 'card_id' })
      }

      const { data: existing } = await supabase
        .from('user_cards').select('id')
        .eq('user_id', userId).eq('card_id', cardId).eq('list_type', 'HAVE').maybeSingle()

      if (existing) {
        setAddStates(prev => ({ ...prev, [cardId]: 'duplicate' }))
        setToast({ type: 'info', message: `${card.name ?? 'Card'} is already in your collection.` })
        setGradingCard(null); return
      }

      const { error: ucErr } = await supabase.from('user_cards').insert({
        user_id: userId, card_id: cardId, list_type: 'HAVE', added_via: 'manual',
        grading_company: grading.company, grade: grading.grade, grade_label: grading.grade_label,
      })
      if (ucErr) throw ucErr

      setAddStates(prev => ({ ...prev, [cardId]: 'added' }))
      setToast({ type: 'success', message: `${card.name ?? 'Card'} added to your collection!` })
      onCardAdded?.()
      setGradingCard(null)
    } catch (err: unknown) {
      setAddStates(prev => ({ ...prev, [cardId]: 'idle' }))
      setToast({ type: 'error', message: (err as { message?: string })?.message ?? 'Failed to add card.' })
    } finally {
      setGradingAdding(false)
    }
  }

  const dismissToast = useCallback(() => setToast(null), [])

  return (
    <div className="w-full">

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Pokémon cards…"
            className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:border-yellow-400 transition-colors"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin block" />
            </span>
          )}
        </div>
        <button
          onClick={triggerSearch}
          disabled={loading || !query.trim()}
          className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black rounded-xl px-4 text-sm tracking-wide transition-colors flex-shrink-0"
        >
          Search
        </button>
      </div>

      {/* Rate-limit warning */}
      {rateLimited && (
        <div className="mt-2.5 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-400">
          <span>⚡</span>
          <span>Rate limited — showing cached results. Try again in a moment.</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* Empty + prompt */}
      {!loading && searched && results.length === 0 && !error && (
        <p className="mt-8 text-center text-zinc-500 text-sm">No cards found for &ldquo;{query}&rdquo;</p>
      )}
      {!searched && !loading && (
        <p className="mt-4 text-zinc-600 text-xs text-center">Start typing to search cards</p>
      )}

      {/* Shimmer grid */}
      {loading && results.length === 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerTile key={i} />)}
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {results.map(card =>
            userId ? (
              <CardTile
                key={String(card.tcgPlayerId ?? card.name)}
                card={card}
                addState={addStates[String(card.tcgPlayerId ?? '')] ?? 'idle'}
                onAdd={() => handleRequestAdd(card)}
                rates={rates}
                countryCode={countryCode}
              />
            ) : (
              <CardTileGuest key={String(card.tcgPlayerId ?? card.name)} card={card} />
            )
          )}
        </div>
      )}

      {/* Load-more shimmer */}
      {loadingMore && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => <ShimmerTile key={`lm-${i}`} />)}
        </div>
      )}

      {/* Load more button */}
      {hasMore && results.length > 0 && !loading && !loadingMore && (
        <button
          onClick={() => runSearch(query, offsetRef.current)}
          className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 font-medium rounded-xl py-2.5 text-xs tracking-wide transition-colors"
        >
          Load more (showing {results.length} results)
        </button>
      )}

      {/* Grading drawer */}
      <GradingDrawer
        card={gradingCard}
        open={gradingCard !== null}
        adding={gradingAdding}
        onClose={() => { if (!gradingAdding) setGradingCard(null) }}
        onConfirm={handleConfirmGrading}
      />

      <Toast toast={toast} onDismiss={dismissToast} />

      <style>{`
        .card-shimmer {
          background: linear-gradient(90deg, #1f1f1f 25%, #2a2a2a 50%, #1f1f1f 75%);
          background-size: 200% 100%;
          animation: cardShimmer 1.4s infinite linear;
        }
        @keyframes cardShimmer {
          0%   { background-position:  200% 0 }
          100% { background-position: -200% 0 }
        }
        @keyframes tileSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  prices?: { market?: number | null; low?: number | null; high?: number | null; primaryPrinting?: string | null }
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

type AddState = 'idle' | 'loading' | 'added' | 'duplicate'

interface ExchangeRates { USD_INR: number; USD_AED: number }
const FALLBACK_RATES: ExchangeRates = { USD_INR: 83.5, USD_AED: 3.67 }

interface RecentSet { name: string; releaseDate: string; code: string }

function getImageUrl(card: PptCard): string {
  return card.imageCdnUrl400 ?? card.imageCdnUrl200 ?? card.imageUrl ?? card.image?.large ?? card.image?.small ?? ''
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

const RARITY_ORDER: Record<string, number> = {
  'Special Illustration Rare': 1, 'Illustration Rare': 2,
  'Hyper Rare': 3, 'Rare Ultra': 4, 'Rare Rainbow': 5, 'Amazing Rare': 6,
  'Rare Secret': 7, 'Rare Holo VMAX': 8, 'Rare Holo VSTAR': 9,
  'Rare Holo V': 10, 'Rare Holo': 11, 'Rare': 12, 'Promo': 13, 'Uncommon': 14, 'Common': 15,
}

function sortCards(cards: PptCard[]): PptCard[] {
  return [...cards].sort((a, b) => {
    const ra = RARITY_ORDER[a.rarity ?? ''] ?? 16
    const rb = RARITY_ORDER[b.rarity ?? ''] ?? 16
    if (ra !== rb) return ra - rb
    return (b.prices?.market ?? 0) - (a.prices?.market ?? 0)
  })
}

// ─── Shimmer tile ─────────────────────────────────────────────────────────────

function ShimmerTile() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse" style={{ background: 'linear-gradient(160deg, #1e1030, #160e20)', border: '1px solid rgba(139,92,246,0.2)' }}>
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

function AddCardTile({
  card, addState, onAdd, countryCode,
}: {
  card: PptCard
  addState: AddState
  onAdd: () => void
  countryCode: string
}) {
  const imageUrl = card.imageCdnUrl200 ?? card.imageUrl ?? card.image?.small ?? ''
  const usdPrice = card.prices?.market ?? null
  const localPrice = usdPrice != null ? formatPriceFromUSD(usdPrice, countryCode) : null

  return (
    <div className="holo-card rounded-2xl overflow-hidden relative group" style={{ background: '#160e20', border: '1px solid rgba(139,92,246,0.2)' }}>

      {/* + Add button */}
      <button
        onClick={onAdd}
        disabled={addState !== 'idle'}
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all"
        style={{
          background: addState === 'added' ? '#10b981' : addState === 'duplicate' ? '#3f3f46' : '#eab308',
          border: 'none',
          cursor: addState === 'idle' ? 'pointer' : 'default',
          boxShadow: addState === 'idle' ? '0 0 6px rgba(234,179,8,0.4)' : 'none',
        }}
        title="Add to collection"
      >
        {addState === 'loading' ? (
          <span style={{ width: 10, height: 10, border: '2px solid rgba(0,0,0,0.35)', borderTopColor: 'transparent', borderRadius: '50%', display: 'block', animation: 'acSpin 0.7s linear infinite' }} />
        ) : addState === 'added' ? (
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>
        ) : addState === 'duplicate' ? (
          <span style={{ color: '#71717a', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>
        ) : (
          <span style={{ color: '#000', fontSize: 16, fontWeight: 900, lineHeight: 1, userSelect: 'none' }}>+</span>
        )}
      </button>

      {/* Card image */}
      <div className="relative w-full aspect-[2.5/3.5] overflow-hidden" style={{ background: '#1a1028' }}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={card.name ?? ''}
            fill
            sizes="(max-width: 640px) 33vw, 160px"
            className="object-contain p-1.5"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#1a1028' }}>
            <span className="text-xl opacity-20">🃏</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1">
        <p className="text-white font-bold text-xs leading-tight line-clamp-1">{card.name ?? '—'}</p>
        <p className="text-zinc-500 text-[11px] line-clamp-1">{card.setName ?? '—'}</p>
        <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wide bg-teal-500/20 text-teal-400 border-teal-500/40 badge-nm">
          ★ NM
        </span>
        {localPrice ? (
          <p className="font-black text-xs text-gradient-pika">{localPrice}</p>
        ) : (
          <p className="text-zinc-600 text-[10px]">Price unavailable</p>
        )}
      </div>
    </div>
  )
}

// ─── Grading drawer ───────────────────────────────────────────────────────────

function GradingDrawer({ card, open, adding, onClose, onConfirm }: {
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
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 60, backdropFilter: 'blur(4px)',
          transition: 'opacity 0.3s',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
          background: '#0f0a1a', borderTop: '1px solid rgba(139,92,246,0.25)',
          borderRadius: '24px 24px 0 0', maxHeight: '92vh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3f3f46' }} />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px 32px', flex: 1 }}>
          {card && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 16px', borderBottom: '1px solid #27272a', marginBottom: 20 }}>
              {imageUrl && (
                <div style={{ position: 'relative', width: 56, height: 80, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#18181b' }}>
                  <Image src={imageUrl} alt={card.name ?? ''} fill style={{ objectFit: 'contain', padding: 2 }} unoptimized />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#fff', fontWeight: 900, fontSize: 15, lineHeight: 1.3, margin: 0 }}>{card.name ?? '—'}</p>
                <p style={{ color: '#71717a', fontSize: 12, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.setName}</p>
              </div>
            </div>
          )}

          <p style={{ color: '#71717a', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
            Select Grading
          </p>
          <GradingSelector value={grading} onChange={setGrading} />

          <button
            onClick={() => onConfirm(grading)}
            disabled={adding}
            style={{
              width: '100%', marginTop: 24,
              background: adding ? 'rgba(255,222,0,0.4)' : 'linear-gradient(135deg, #FFDE00, #F4C430)',
              boxShadow: adding ? 'none' : '0 0 16px rgba(255,222,0,0.35)',
              color: '#000', fontWeight: 900, fontSize: 14,
              border: 'none', borderRadius: 14, padding: '14px 0',
              cursor: adding ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {adding ? (
              <>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.4)', borderTopColor: 'transparent', borderRadius: '50%', display: 'block', animation: 'acSpin 0.7s linear infinite' }} />
                Adding…
              </>
            ) : 'Add to Collection'}
          </button>
          <button
            onClick={onClose}
            disabled={adding}
            style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: '#71717a', fontSize: 14, padding: '10px 0', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDismiss }: { message: string | null; type?: 'success' | 'info' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!message) return null

  const colours = {
    success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', color: '#6ee7b7' },
    info:    { bg: 'rgba(39,39,42,0.95)',   border: 'rgba(63,63,70,0.8)',   color: '#d4d4d8' },
    error:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  color: '#fca5a5' },
  }
  const c = colours[type]

  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 70, background: c.bg, border: `1px solid ${c.border}`,
      color: c.color, fontWeight: 600, fontSize: 13,
      padding: '10px 18px', borderRadius: 12,
      backdropFilter: 'blur(12px)', whiteSpace: 'nowrap',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    }}>
      {type === 'success' ? '✓ ' : type === 'error' ? '✕ ' : ''}{message}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const BROWSE_LIMIT = 60
const SEARCH_LIMIT = 20

export default function AddCardsPage() {
  const router = useRouter()
  const { countryCode } = useCountry()

  const [userId,        setUserId]        = useState<string | null>(null)
  const [rates,         setRates]         = useState<ExchangeRates>(FALLBACK_RATES)
  const [query,         setQuery]         = useState('')
  const [activeSet,     setActiveSet]     = useState<string | null>(null)
  const [inputFocused,  setInputFocused]  = useState(false) // used for border highlight only
  const [recentSets,    setRecentSets]    = useState<RecentSet[]>([])
  const [allCards,      setAllCards]      = useState<PptCard[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [hasMore,       setHasMore]       = useState(false)
  const [toast,         setToast]         = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  const [addStates,     setAddStates]     = useState<Record<string, AddState>>({})
  const [gradingCard,   setGradingCard]   = useState<PptCard | null>(null)
  const [gradingAdding, setGradingAdding] = useState(false)

  const abortRef    = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offsetRef   = useRef(0)
  const isSearch    = query.trim().length > 0 || activeSet !== null

  const displayCards = useMemo(() => {
    return isSearch ? allCards : sortCards(allCards)
  }, [allCards, isSearch])


  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const [rateRes, setsRes] = await Promise.all([
        supabase.from('exchange_rates').select('currency_pair, rate').in('currency_pair', ['USD_INR', 'USD_AED']),
        fetch('/api/sets'),
      ])

      const rateRows = rateRes.data
      if (rateRows?.length) {
        setRates({
          USD_INR: rateRows.find((r: { currency_pair: string }) => r.currency_pair === 'USD_INR')?.rate ?? FALLBACK_RATES.USD_INR,
          USD_AED: rateRows.find((r: { currency_pair: string }) => r.currency_pair === 'USD_AED')?.rate ?? FALLBACK_RATES.USD_AED,
        })
      }

      if (setsRes.ok) {
        const json = await setsRes.json()
        setRecentSets(json.sets ?? [])
      }
    }
    init()
  }, [router])

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchBrowse = useCallback(async (offset: number) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (offset === 0) { setLoading(true); setAllCards([]) }
    else setLoadingMore(true)

    try {
      const res = await fetch(`/api/browse-cards?offset=${offset}&limit=${BROWSE_LIMIT}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      const cards: PptCard[] = json.cards ?? []
      if (offset === 0) setAllCards(cards)
      else setAllCards(prev => [...prev, ...cards])
      offsetRef.current = offset + cards.length
      setHasMore(json.hasMore ?? false)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
    } finally {
      setLoading(false); setLoadingMore(false)
    }
  }, [])

  const fetchSearch = useCallback(async (term: string, setName: string | null, offset: number) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    if (offset === 0) { setLoading(true); setAllCards([]) }
    else setLoadingMore(true)

    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(SEARCH_LIMIT) })
      if (setName) params.set('set', setName)
      if (term.trim()) params.set('search', term.trim())

      const res = await fetch(`/api/search-cards?${params}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error('Search failed')
      const json = await res.json()
      const cards: PptCard[] = json.cards ?? []
      if (offset === 0) setAllCards(cards)
      else setAllCards(prev => [...prev, ...cards])
      offsetRef.current = offset + cards.length
      setHasMore(json.hasMore ?? false)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
    } finally {
      setLoading(false); setLoadingMore(false)
    }
  }, [])

  // ── Initial browse load ─────────────────────────────────────────────────────
  useEffect(() => { fetchBrowse(0) }, [fetchBrowse])

  // ── Debounced search / set change ────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim() && !activeSet) {
      offsetRef.current = 0
      fetchBrowse(0)
      return
    }
    const delay = activeSet && !query.trim() ? 0 : 300
    debounceRef.current = setTimeout(() => {
      offsetRef.current = 0
      fetchSearch(query, activeSet, 0)
    }, delay)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, activeSet, fetchBrowse, fetchSearch])

  // ── Add card ────────────────────────────────────────────────────────────────
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

      const { data: existing } = await supabase.from('user_cards')
        .select('id').eq('user_id', userId).eq('card_id', cardId).eq('list_type', 'HAVE').maybeSingle()

      if (existing) {
        setAddStates(prev => ({ ...prev, [cardId]: 'duplicate' }))
        setToast({ message: `${card.name ?? 'Card'} is already in your collection`, type: 'info' })
        setGradingCard(null)
        return
      }

      const { error: ucErr } = await supabase.from('user_cards').insert({
        user_id:         userId,
        card_id:         cardId,
        list_type:       'HAVE',
        added_via:       'manual',
        grading_company: grading.company,
        grade:           grading.grade,
        grade_label:     grading.grade_label,
      })
      if (ucErr) throw ucErr

      setAddStates(prev => ({ ...prev, [cardId]: 'added' }))
      setToast({ message: `${card.name ?? 'Card'} added to collection!`, type: 'success' })
      setGradingCard(null)
    } catch (err: unknown) {
      setAddStates(prev => ({ ...prev, [cardId]: 'idle' }))
      setToast({ message: (err as { message?: string })?.message ?? 'Failed to add card', type: 'error' })
    } finally {
      setGradingAdding(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: '100vh', background: '#0a0514', paddingBottom: 48 }}>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(10,5,20,0.97)',
        borderBottom: '1px solid rgba(139,92,246,0.2)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px' }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px 8px 4px 0', fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            aria-label="Back"
          >
            ←
          </button>
          <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 18, margin: 0, flex: 1, textAlign: 'center', letterSpacing: '-0.02em' }}>
            Add Cards
          </h1>
          <div style={{ width: 36 }} />
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#52525b', fontSize: 15, pointerEvents: 'none', lineHeight: 1 }}>
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                if (e.target.value.trim()) setActiveSet(null)
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setTimeout(() => setInputFocused(false), 150)}
              placeholder={activeSet ? `Searching in ${activeSet}…` : 'Search by name, set or number…'}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#1e1628',
                border: `1.5px solid ${inputFocused || query || activeSet ? 'rgba(255,222,0,0.65)' : 'rgba(139,92,246,0.25)'}`,
                borderRadius: 12, padding: '10px 36px 10px 34px',
                color: '#fff', fontSize: 14, outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />
            {(query || activeSet) && (
              <button
                onClick={() => { setQuery(''); setActiveSet(null) }}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Active set pill */}
        {activeSet && (
          <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#71717a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Set:</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
              color: '#fbbf24', fontSize: 12, fontWeight: 700,
              padding: '3px 8px 3px 10px', borderRadius: 20,
            }}>
              {activeSet}
              <button onClick={() => setActiveSet(null)} style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13 }}>✕</button>
            </span>
          </div>
        )}

        {/* Latest set chips — always visible */}
        {recentSets.length > 0 && (
          <div style={{ padding: '0 0 10px' }}>
            <div style={{ overflowX: 'auto', display: 'flex', gap: 7, padding: '0 16px', scrollbarWidth: 'none' } as React.CSSProperties}>
              {recentSets.map(s => {
                const isActive = activeSet === s.name
                return (
                  <button
                    key={s.code || s.name}
                    onClick={() => isActive ? setActiveSet(null) : (setActiveSet(s.name), setQuery(''))}
                    style={{
                      flexShrink: 0,
                      background: isActive ? 'linear-gradient(135deg, #FFDE00, #F4C430)' : 'rgba(30,22,40,0.8)',
                      border: `1px solid ${isActive ? '#FFDE00' : 'rgba(139,92,246,0.3)'}`,
                      color: isActive ? '#000' : '#d4d4d8',
                      boxShadow: isActive ? '0 0 12px rgba(255,222,0,0.4)' : 'none',
                      fontSize: 12, fontWeight: isActive ? 800 : 600,
                      padding: '5px 13px', borderRadius: 20, cursor: 'pointer',
                      whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Count bar ──────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto" style={{ padding: '8px 16px 4px' }}>
        <p style={{ color: '#52525b', fontSize: 12, margin: 0 }}>
          {loading ? 'Loading…' : `Showing ${displayCards.length} card${displayCards.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Card grid ──────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-3 pb-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <ShimmerTile key={i} />)}
          </div>
        ) : displayCards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#52525b', fontSize: 14 }}>
            {isSearch ? `No cards found for "${query}"` : 'No cards available'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {displayCards.map(card => (
              <AddCardTile
                key={String(card.tcgPlayerId ?? `${card.name}-${card.cardNumber ?? card.number ?? ''}`)}
                card={card}
                addState={addStates[String(card.tcgPlayerId ?? '')] ?? 'idle'}
                onAdd={() => handleRequestAdd(card)}
                countryCode={countryCode}
              />
            ))}
          </div>
        )}

        {/* Load-more shimmer */}
        {loadingMore && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            {Array.from({ length: 6 }).map((_, i) => <ShimmerTile key={`lm-${i}`} />)}
          </div>
        )}

        {/* Load more button */}
        {hasMore && !loading && !loadingMore && displayCards.length > 0 && (
          <button
            onClick={() => isSearch ? fetchSearch(query, activeSet, offsetRef.current) : fetchBrowse(offsetRef.current)}
            style={{
              display: 'block', width: '100%', marginTop: 14,
              background: '#1e1628', border: '1px solid rgba(139,92,246,0.25)',
              color: '#a1a1aa', fontWeight: 600, fontSize: 13,
              borderRadius: 12, padding: '12px 0', cursor: 'pointer',
            }}
          >
            Load more (showing {displayCards.length} cards)
          </button>
        )}
      </div>

      {/* ── Grading drawer ─────────────────────────────────────────────────── */}
      <GradingDrawer
        card={gradingCard}
        open={gradingCard !== null}
        adding={gradingAdding}
        onClose={() => { if (!gradingAdding) setGradingCard(null) }}
        onConfirm={handleConfirmGrading}
      />

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      <Toast
        message={toast?.message ?? null}
        type={toast?.type}
        onDismiss={() => setToast(null)}
      />

      <style>{`
        @keyframes acSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  )
}

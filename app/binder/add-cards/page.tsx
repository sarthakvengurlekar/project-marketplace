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
    <div
      className="animate-pulse overflow-hidden"
      style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A' }}
    >
      <div style={{ background: '#e8e2d4', aspectRatio: '2.5/3.5', width: '100%' }} />
      <div style={{ padding: '8px 10px', borderTop: '2px solid #0A0A0A' }}>
        <div style={{ background: '#e8e2d4', height: 10, borderRadius: 2, marginBottom: 6, width: '75%' }} />
        <div style={{ background: '#e8e2d4', height: 8, borderRadius: 2, width: '50%' }} />
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
  const router = useRouter()
  const imageUrl = card.imageCdnUrl200 ?? card.imageUrl ?? card.image?.small ?? ''
  const usdPrice = card.prices?.market ?? null
  const localPrice = usdPrice != null ? formatPriceFromUSD(usdPrice, countryCode) : null
  const rawId = card.tcgPlayerId ? String(card.tcgPlayerId) : (card.externalCatalogId ?? '')
  const cardId = rawId
  const isAdded = addState === 'added' || addState === 'duplicate'

  async function handleViewDetails() {
    if (!cardId) return
    sessionStorage.setItem(`ppt_card_preview_${cardId}`, JSON.stringify(card))
    supabase.from('cards').upsert({
      id:               cardId,
      name:             card.name ?? '',
      set_name:         card.setName ?? null,
      set_code:         card.externalCatalogId ? card.externalCatalogId.split('-')[0] : null,
      card_number:      String(card.cardNumber ?? card.number ?? ''),
      rarity:           card.rarity ?? null,
      image_url:        card.imageCdnUrl200 ?? card.imageCdnUrl400 ?? card.imageUrl ?? card.image?.small ?? null,
      image_url_hires:  card.imageCdnUrl800 ?? card.imageUrl ?? card.image?.large ?? null,
      tcgplayer_id:     card.tcgPlayerId ? String(card.tcgPlayerId) : null,
      hp:               card.hp != null ? String(card.hp) : null,
      stage:            card.stage ?? null,
      card_type:        card.cardType ?? null,
      pokemon_type:     card.pokemonType ?? null,
      energy_type:      card.energyType ?? null,
      weakness:         card.weakness ?? null,
      resistance:       card.resistance ?? null,
      retreat_cost:     card.retreatCost != null ? String(card.retreatCost) : null,
      attacks:          card.attacks ?? null,
      flavor_text:      card.flavorText ?? null,
      artist:           card.artist ?? null,
      tcgplayer_url:    card.tcgPlayerUrl ?? null,
    }, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.warn('[add-cards] card upsert failed:', error.message)
    })
    router.push(`/binder/card/${encodeURIComponent(cardId)}`)
  }

  return (
    <div
      onClick={handleViewDetails}
      style={{
        background:  '#FAF6EC',
        border:      '2px solid #0A0A0A',
        boxShadow:   isAdded ? '3px 3px 0 #E8233B' : '2px 2px 0 #0A0A0A',
        overflow:    'hidden',
        cursor:      'pointer',
        position:    'relative',
      }}
    >
      {/* Card image */}
      <div
        style={{
          position:     'relative',
          background:   '#f0ece2',
          borderBottom: '2px solid #0A0A0A',
          aspectRatio:  '2.5/3.5',
          width:        '100%',
          overflow:     'hidden',
        }}
      >
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
          <div
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span style={{ fontSize: 24, opacity: 0.3 }}>🃏</span>
          </div>
        )}

        {/* Add / added button */}
        <button
          onClick={e => { e.stopPropagation(); onAdd() }}
          disabled={addState !== 'idle'}
          style={{
            position:   'absolute',
            bottom:     6,
            right:      6,
            zIndex:     10,
            width:      26,
            height:     26,
            background: isAdded ? '#E8233B' : '#F4D03F',
            border:     '2px solid #0A0A0A',
            boxShadow:  '1px 1px 0 #0A0A0A',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor:     addState === 'idle' ? 'pointer' : 'default',
            flexShrink: 0,
          }}
          title="Add to collection"
        >
          {addState === 'loading' ? (
            <span style={{ width: 10, height: 10, border: '2px solid rgba(0,0,0,0.35)', borderTopColor: 'transparent', borderRadius: '50%', display: 'block', animation: 'acSpin 0.7s linear infinite' }} />
          ) : isAdded ? (
            <span style={{ color: '#FAF6EC', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>
          ) : (
            <span style={{ color: '#0A0A0A', fontSize: 18, fontWeight: 900, lineHeight: 1, userSelect: 'none' }}>+</span>
          )}
        </button>
      </div>

      {/* Info */}
      <div style={{ padding: '8px 10px' }}>
        <p style={{ fontWeight: 800, fontSize: 12, color: '#0A0A0A', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.name ?? '—'}
        </p>
        <p style={{ fontSize: 10, color: '#8B7866', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[card.setName, card.cardNumber ?? card.number].filter(Boolean).join(' · ')}
        </p>
        {localPrice ? (
          <p style={{ fontWeight: 900, fontSize: 12, color: '#E8233B', marginTop: 4 }}>{localPrice}</p>
        ) : (
          <p style={{ fontSize: 10, color: '#8B7866', marginTop: 4 }}>—</p>
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
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position:     'fixed',
          inset:        0,
          background:   'rgba(10,10,10,0.65)',
          zIndex:       60,
          transition:   'opacity 0.25s',
          opacity:      open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position:       'fixed',
          bottom:         0,
          left:           0,
          right:          0,
          zIndex:         60,
          background:     '#FAF6EC',
          borderTop:      '2px solid #0A0A0A',
          borderLeft:     '2px solid #0A0A0A',
          borderRight:    '2px solid #0A0A0A',
          borderRadius:   '16px 16px 0 0',
          maxHeight:      '92vh',
          transform:      open ? 'translateY(0)' : 'translateY(100%)',
          transition:     'transform 0.3s ease-out',
          display:        'flex',
          flexDirection:  'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, background: '#0A0A0A', borderRadius: 2 }} />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px 40px', flex: 1 }}>
          {/* Card preview */}
          {card && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0 16px',
              borderBottom: '2px solid #0A0A0A',
              marginBottom: 20,
            }}>
              {imageUrl && (
                <div style={{
                  position: 'relative', width: 52, height: 72, flexShrink: 0,
                  border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A',
                  background: '#f0ece2', overflow: 'hidden',
                }}>
                  <Image src={imageUrl} alt={card.name ?? ''} fill style={{ objectFit: 'contain', padding: 2 }} unoptimized />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15, lineHeight: 1.3, margin: 0 }}>{card.name ?? '—'}</p>
                <p style={{ color: '#8B7866', fontSize: 12, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.setName}</p>
              </div>
            </div>
          )}

          <p style={{ color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
            Select Grading
          </p>
          <GradingSelector value={grading} onChange={setGrading} />

          <button
            onClick={() => onConfirm(grading)}
            disabled={adding}
            style={{
              width:          '100%',
              marginTop:      24,
              background:     adding ? '#E8233B99' : '#E8233B',
              color:          '#FAF6EC',
              fontWeight:     900,
              fontSize:       14,
              border:         '2px solid #0A0A0A',
              boxShadow:      adding ? 'none' : '3px 3px 0 #0A0A0A',
              padding:        '14px 0',
              cursor:         adding ? 'not-allowed' : 'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            8,
              letterSpacing:  '0.05em',
            }}
          >
            {adding ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FAF6EC', borderRadius: '50%', display: 'block', animation: 'acSpin 0.7s linear infinite' }} />
                Adding…
              </>
            ) : 'ADD TO COLLECTION'}
          </button>

          <button
            onClick={onClose}
            disabled={adding}
            style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: '#8B7866', fontSize: 14, fontWeight: 700, padding: '10px 0', cursor: 'pointer' }}
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

  return (
    <div style={{
      position:   'fixed',
      bottom:     28,
      left:       '50%',
      transform:  'translateX(-50%)',
      zIndex:     70,
      background: '#0A0A0A',
      color:      '#FAF6EC',
      fontWeight: 800,
      fontSize:   13,
      padding:    '10px 18px',
      border:     '2px solid #0A0A0A',
      boxShadow:  `4px 4px 0 ${type === 'error' ? '#E8233B' : type === 'success' ? '#F4D03F' : '#8B7866'}`,
      whiteSpace: 'nowrap',
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
  const [inputFocused,  setInputFocused]  = useState(false)
  const [recentSets,    setRecentSets]    = useState<RecentSet[]>([])
  const [allCards,      setAllCards]      = useState<PptCard[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [hasMore,       setHasMore]       = useState(false)
  const [toast,         setToast]         = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  const [addStates,     setAddStates]     = useState<Record<string, AddState>>({})
  const [addedTotalUsd, setAddedTotalUsd] = useState(0)
  const [gradingCard,   setGradingCard]   = useState<PptCard | null>(null)
  const [gradingAdding, setGradingAdding] = useState(false)

  const abortRef    = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offsetRef   = useRef(0)
  const isSearch    = query.trim().length > 0 || activeSet !== null

  const addedCount = Object.values(addStates).filter(s => s === 'added').length

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
        user_id:          userId,
        card_id:          cardId,
        list_type:        'HAVE',
        added_via:        'manual',
        grading_company:  grading.company,
        grade:            grading.grade,
        grade_label:      grading.grade_label,
        added_price_usd:  usdPrice ?? null,
      })
      if (ucErr) throw ucErr

      setAddStates(prev => ({ ...prev, [cardId]: 'added' }))
      setAddedTotalUsd(prev => prev + (usdPrice ?? 0))
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
    <main style={{ minHeight: '100vh', background: '#FAF6EC', paddingBottom: addedCount > 0 ? 96 : 48 }}>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div style={{
        position:   'sticky',
        top:        0,
        zIndex:     20,
        background: '#FAF6EC',
        borderBottom: '2px solid #0A0A0A',
      }}>

        {/* Back + title + scan */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 10px' }}>
          <button
            onClick={() => router.back()}
            style={{
              width:          36,
              height:         36,
              background:     '#F4D03F',
              border:         '2px solid #0A0A0A',
              boxShadow:      '2px 2px 0 #0A0A0A',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              fontSize:       16,
              fontWeight:     900,
              flexShrink:     0,
            }}
            aria-label="Back"
          >
            ←
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 17, margin: 0, lineHeight: 1.2 }}>Add cards</h1>
            {addedCount > 0 && (
              <p style={{ color: '#8B7866', fontSize: 11, margin: '2px 0 0', fontWeight: 600 }}>
                {addedCount} selected
              </p>
            )}
          </div>
          <button
            style={{
              background:     '#FAF6EC',
              border:         '2px solid #0A0A0A',
              boxShadow:      '2px 2px 0 #0A0A0A',
              color:          '#0A0A0A',
              fontWeight:     900,
              fontSize:       12,
              letterSpacing:  '0.08em',
              padding:        '6px 14px',
              cursor:         'pointer',
            }}
          >
            SCAN
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ position: 'relative', border: `2px solid #0A0A0A`, background: '#FAF6EC' }}>
            <span style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              color: '#E8233B', fontSize: 14, pointerEvents: 'none', lineHeight: 1,
            }}>
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); if (e.target.value.trim()) setActiveSet(null) }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setTimeout(() => setInputFocused(false), 150)}
              placeholder={activeSet ? `Searching in ${activeSet}…` : 'Search by name, set or number…'}
              style={{
                width:           '100%',
                boxSizing:       'border-box',
                background:      'transparent',
                border:          'none',
                outline:         'none',
                padding:         '10px 40px 10px 34px',
                color:           '#0A0A0A',
                fontSize:        14,
                fontWeight:      500,
              }}
            />
            {(query || activeSet) && (
              <button
                onClick={() => { setQuery(''); setActiveSet(null) }}
                style={{
                  position:  'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#0A0A0A',
                  cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1,
                  fontWeight: 900,
                }}
                aria-label="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Filter by set */}
        {recentSets.length > 0 && (
          <div style={{ padding: '0 0 10px' }}>
            <p style={{ color: '#0A0A0A', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 16px 6px', margin: 0 }}>
              FILTER BY SET
            </p>
            <div
              style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '0 16px', scrollbarWidth: 'none' } as React.CSSProperties}
            >
              {recentSets.map(s => {
                const isActive = activeSet === s.name
                return (
                  <button
                    key={s.code || s.name}
                    onClick={() => isActive ? setActiveSet(null) : (setActiveSet(s.name), setQuery(''))}
                    style={{
                      flexShrink:  0,
                      background:  isActive ? '#F4D03F' : '#FAF6EC',
                      border:      '2px solid #0A0A0A',
                      boxShadow:   isActive ? '2px 2px 0 #0A0A0A' : 'none',
                      color:       '#0A0A0A',
                      fontSize:    12,
                      fontWeight:  isActive ? 900 : 600,
                      padding:     '5px 12px',
                      cursor:      'pointer',
                      whiteSpace:  'nowrap',
                      display:     'flex',
                      alignItems:  'center',
                      gap:         5,
                    }}
                  >
                    {isActive && <span style={{ fontSize: 10 }}>×</span>}
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Count bar ──────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto" style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: '#8B7866', fontSize: 12, margin: 0, fontWeight: 600 }}>
          {loading ? 'Loading…' : `${displayCards.length} result${displayCards.length !== 1 ? 's' : ''}`}
        </p>
        {!loading && displayCards.length > 0 && (
          <p style={{ color: '#E8233B', fontSize: 12, margin: 0, fontWeight: 700 }}>Sort: Rarity ↓</p>
        )}
      </div>

      {/* ── Card grid ──────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-3 pb-4">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <ShimmerTile key={i} />)}
          </div>
        ) : displayCards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>🔍</span>
            <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, margin: '0 0 8px' }}>No cards found</p>
            <p style={{ color: '#8B7866', fontSize: 13 }}>
              {isSearch
                ? (activeSet && !query.trim()
                    ? `No cards found in "${activeSet}"`
                    : `No results for "${query}"`)
                : 'No cards available'}
            </p>
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
              display:    'block',
              width:      '100%',
              marginTop:  14,
              background: '#FAF6EC',
              border:     '2px solid #0A0A0A',
              boxShadow:  '3px 3px 0 #0A0A0A',
              color:      '#0A0A0A',
              fontWeight: 800,
              fontSize:   13,
              padding:    '12px 0',
              cursor:     'pointer',
            }}
          >
            Load more ({displayCards.length} shown)
          </button>
        )}
      </div>

      {/* ── Added cards CTA bar ─────────────────────────────────────────────── */}
      {addedCount > 0 && (
        <div
          style={{
            position:     'fixed',
            bottom:       0,
            left:         0,
            right:        0,
            zIndex:       40,
            background:   '#E8233B',
            borderTop:    '2px solid #0A0A0A',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <button
            onClick={() => router.push('/binder')}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            12,
              width:          '100%',
              background:     'none',
              border:         'none',
              cursor:         'pointer',
              padding:        '16px',
            }}
          >
            <span style={{ color: '#FAF6EC', fontWeight: 900, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              VIEW {addedCount} CARD{addedCount !== 1 ? 'S' : ''} ADDED
            </span>
            {addedTotalUsd > 0 && (
              <span style={{
                background:  '#F4D03F',
                color:       '#0A0A0A',
                fontWeight:  900,
                fontSize:    13,
                padding:     '4px 10px',
                border:      '2px solid #0A0A0A',
              }}>
                {formatPriceFromUSD(addedTotalUsd, countryCode)}
              </span>
            )}
          </button>
        </div>
      )}

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

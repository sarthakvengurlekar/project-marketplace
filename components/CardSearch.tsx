'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPriceFromUSD } from '@/lib/currency'
import GradingSelector, { GradingSelection, DEFAULT_GRADING } from '@/components/GradingSelector'

// ─── PokemonPriceTracker API types ────────────────────────────────────────────

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

interface ExchangeRates {
  USD_INR: number
  USD_AED: number
}

const FALLBACK_RATES: ExchangeRates = { USD_INR: 83.5, USD_AED: 3.67 }

// ─── Pokemon type colours ─────────────────────────────────────────────────────

const TYPE_DOT_COLORS: Record<string, string> = {
  Fire:       '#ef4444',
  Water:      '#3b82f6',
  Grass:      '#22c55e',
  Lightning:  '#eab308',
  Electric:   '#eab308',
  Psychic:    '#a855f7',
  Fighting:   '#f97316',
  Darkness:   '#6b7280',
  Dark:       '#6b7280',
  Metal:      '#9ca3af',
  Dragon:     '#14b8a6',
  Colorless:  '#71717a',
  Fairy:      '#ec4899',
}

// ─── Rarity badge ─────────────────────────────────────────────────────────────

const RARITY_STYLES: Record<string, string> = {
  'Common':               'bg-zinc-700/80 text-zinc-300',
  'Uncommon':             'bg-emerald-900/70 text-emerald-300',
  'Rare':                 'bg-blue-900/70 text-blue-300',
  'Rare Holo':            'bg-yellow-900/70 text-yellow-300',
  'Rare Holo V':          'bg-yellow-800/70 text-yellow-200',
  'Rare Holo VMAX':       'bg-amber-900/70 text-amber-300',
  'Rare Holo VSTAR':      'bg-amber-800/70 text-amber-200',
  'Rare Ultra':           'bg-purple-900/70 text-purple-300',
  'Rare Rainbow':         'bg-pink-900/70 text-pink-300',
  'Rare Secret':          'bg-rose-900/70 text-rose-300',
  'Rare Shining':         'bg-indigo-900/70 text-indigo-300',
  'Amazing Rare':         'bg-teal-900/70 text-teal-300',
  'Illustration Rare':    'bg-violet-900/70 text-violet-300',
  'Special Illustration Rare': 'bg-fuchsia-900/70 text-fuchsia-300',
  'Hyper Rare':           'bg-orange-900/70 text-orange-200',
  'Promo':                'bg-orange-900/70 text-orange-300',
}

function rarityStyle(rarity: string | undefined): string {
  if (!rarity) return 'bg-zinc-700/80 text-zinc-400'
  return RARITY_STYLES[rarity] ?? 'bg-zinc-700/80 text-zinc-400'
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastState =
  | { type: 'success'; message: string }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | null

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  if (!toast) return null

  const colours = {
    success: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    info:    'bg-zinc-800 border-zinc-700 text-zinc-300',
    error:   'bg-red-500/15 border-red-500/30 text-red-400',
  }
  const icons = { success: '✓', info: 'ℹ', error: '✕' }

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl text-sm font-semibold backdrop-blur-sm ${colours[toast.type]}`}>
      <span className="text-base leading-none">{icons[toast.type]}</span>
      {toast.message}
    </div>
  )
}

// ─── Grading drawer ───────────────────────────────────────────────────────────

function GradingDrawer({
  card,
  open,
  adding,
  onClose,
  onConfirm,
}: {
  card: PptCard | null
  open: boolean
  adding: boolean
  onClose: () => void
  onConfirm: (grading: GradingSelection) => void
}) {
  const [grading, setGrading] = useState<GradingSelection>(DEFAULT_GRADING)

  // Reset grading when a new card is queued
  useEffect(() => {
    if (card) setGrading(DEFAULT_GRADING)
  }, [card])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const imageUrl = card ? getImageUrl(card) : ''

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/70 z-50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-3xl transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '92vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-4 pb-8 flex-1" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

          {/* Card preview */}
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

          <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-4">
            Select Grading
          </p>

          <GradingSelector value={grading} onChange={setGrading} />

          <button
            onClick={() => onConfirm(grading)}
            disabled={adding}
            className="w-full mt-6 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:opacity-50 text-black font-black rounded-xl py-3.5 text-sm tracking-wide transition-colors shadow-lg shadow-yellow-400/20 flex items-center justify-center gap-2"
          >
            {adding ? (
              <>
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Adding…
              </>
            ) : 'Add to Collection'}
          </button>
          <button
            onClick={onClose}
            disabled={adding}
            className="w-full mt-2 text-zinc-500 hover:text-zinc-300 text-sm py-2.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Card result tile ─────────────────────────────────────────────────────────

type AddState = 'idle' | 'loading' | 'added' | 'duplicate'

function CardResult({
  card,
  addState,
  onAdd,
  rates,
  countryCode,
}: {
  card: PptCard
  addState: AddState
  onAdd: () => void
  rates: ExchangeRates
  countryCode: string
}) {
  const buttonStyles: Record<AddState, string> = {
    idle:      'bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black',
    loading:   'bg-yellow-400/50 text-black cursor-wait',
    added:     'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 cursor-default',
    duplicate: 'bg-zinc-700 text-zinc-400 cursor-default',
  }
  const buttonLabel: Record<AddState, string> = {
    idle:      '+ Add to Collection',
    loading:   'Adding…',
    added:     '✓ Added',
    duplicate: 'Already owned',
  }

  const imageUrl   = getImageUrl(card)
  const usdPrice   = card.prices?.market ?? null
  const localPrice = usdPrice != null ? formatPriceFromUSD(usdPrice, countryCode) : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col ring-1 ring-yellow-400/5 hover:ring-yellow-400/20 transition-all group">

      {/* Card image */}
      <div className="relative w-full bg-zinc-800 overflow-hidden" style={{ aspectRatio: '2.5 / 3.5' }}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={card.name ?? ''}
            width={200}
            height={280}
            className="w-full h-full transition-transform duration-300 group-hover:scale-105"
            style={{ objectFit: 'contain', objectPosition: 'center', transform: 'none' }}
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-zinc-600 text-4xl">🃏</span>
          </div>
        )}

        {/* Price badge */}
        <div className="absolute top-2 right-2">
          {usdPrice != null ? (
            <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg">
              ${usdPrice.toFixed(2)}
            </span>
          ) : (
            <span className="bg-zinc-700/90 text-zinc-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
              N/A
            </span>
          )}
        </div>
      </div>

      {/* Info + button */}
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        <div className="flex-1 space-y-1">
          <p className="text-white font-bold text-xs leading-tight line-clamp-2">{card.name ?? '—'}</p>
          <p className="text-zinc-500 text-[10px] leading-tight line-clamp-1">{card.setName}</p>

          {/* Card number */}
          {(card.cardNumber ?? card.number) && (
            <p className="text-zinc-600 text-[9px] leading-none">
              #{card.cardNumber ?? card.number}
            </p>
          )}

          {/* HP + Stage */}
          {(card.hp || card.stage) && (
            <p className="text-zinc-600 text-[9px] leading-none">
              {[card.hp ? `${card.hp} HP` : null, card.stage].filter(Boolean).join(' · ')}
            </p>
          )}

          <div className="flex items-center justify-between gap-1 flex-wrap">
            {card.rarity && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${rarityStyle(card.rarity)}`}>
                {card.rarity}
              </span>
            )}
            {/* Pokemon type dot */}
            {card.pokemonType && (
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: TYPE_DOT_COLORS[card.pokemonType] ?? '#71717a' }}
                />
                <span className="text-[9px] text-zinc-500">{card.pokemonType}</span>
              </span>
            )}
            {localPrice && (
              <span className="text-zinc-300 text-[10px] font-bold ml-auto">{localPrice}</span>
            )}
          </div>

          {/* Primary printing */}
          {card.prices?.primaryPrinting && (
            <p className="text-zinc-600 text-[9px] leading-none">{card.prices.primaryPrinting}</p>
          )}
        </div>

        <button
          onClick={onAdd}
          disabled={addState !== 'idle'}
          className={`w-full rounded-xl py-1.5 text-[10px] font-black tracking-wide transition-colors ${buttonStyles[addState]}`}
        >
          {buttonLabel[addState]}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CardSearch({ onCardAdded }: { onCardAdded?: () => void } = {}) {
  const { countryCode } = useCountry()

  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<PptCard[]>([])
  const [loading, setLoading]   = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [userId, setUserId]     = useState<string | null>(null)
  const [rates, setRates]       = useState<ExchangeRates>(FALLBACK_RATES)
  const [toast, setToast]       = useState<ToastState>(null)

  // Grading drawer state
  const [gradingCard, setGradingCard] = useState<PptCard | null>(null)
  const [gradingAdding, setGradingAdding] = useState(false)

  // Per-card add state (keyed by tcgPlayerId)
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: rateRows } = await supabase
        .from('exchange_rates')
        .select('currency_pair, rate')
        .in('currency_pair', ['USD_INR', 'USD_AED'])

      if (rateRows?.length) {
        const USD_INR = rateRows.find(r => r.currency_pair === 'USD_INR')?.rate ?? FALLBACK_RATES.USD_INR
        const USD_AED = rateRows.find(r => r.currency_pair === 'USD_AED')?.rate ?? FALLBACK_RATES.USD_AED
        setRates({ USD_INR, USD_AED })
      }
    }
    init()
  }, [])

  const search = useCallback(async (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setSearched(true)
    setAddStates({})

    try {
      const res = await fetch(`/api/search-cards?q=${encodeURIComponent(trimmed)}`)
      if (!res.ok) throw new Error(`Search error ${res.status}`)
      const json = await res.json()
      setResults(json.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') search(query)
  }

  function handleRequestAdd(card: PptCard) {
    if (!userId) return
    const cardId = String(card.tcgPlayerId ?? '')
    const state = addStates[cardId]
    if (state === 'added' || state === 'duplicate' || state === 'loading') return
    setGradingCard(card)
  }

  async function handleConfirmGrading(grading: GradingSelection) {
    if (!gradingCard || !userId) return
    const card = gradingCard
    const cardId = String(card.tcgPlayerId ?? '')

    setGradingAdding(true)
    setAddStates(prev => ({ ...prev, [cardId]: 'loading' }))

    try {
      const { error: cardError } = await supabase.from('cards').upsert(
        {
          id:                   cardId,
          name:                 card.name ?? '',
          set_name:             card.setName ?? null,
          set_code:             card.externalCatalogId ? card.externalCatalogId.split('-')[0] : null,
          set_id:               card.setId != null ? Number(card.setId) : null,
          card_number:          card.cardNumber ?? card.number ?? null,
          rarity:               card.rarity ?? null,
          image_url:            card.imageCdnUrl200 ?? card.imageCdnUrl400 ?? card.imageUrl ?? card.image?.small ?? null,
          image_url_hires:      card.imageCdnUrl800 ?? card.imageUrl ?? card.image?.large ?? null,
          tcgplayer_id:         cardId,
          hp:                   card.hp != null ? String(card.hp) : null,
          stage:                card.stage ?? null,
          card_type:            card.cardType ?? null,
          pokemon_type:         card.pokemonType ?? null,
          energy_type:          card.energyType ?? null,
          weakness:             card.weakness ?? null,
          resistance:           card.resistance ?? null,
          retreat_cost:         card.retreatCost != null ? String(card.retreatCost) : null,
          attacks:              card.attacks ?? null,
          flavor_text:          card.flavorText ?? null,
          artist:               card.artist ?? null,
          tcgplayer_url:        card.tcgPlayerUrl ?? null,
          external_catalog_id:  card.externalCatalogId ?? null,
          printings_available:  card.printingsAvailable ?? null,
          primary_printing:     card.prices?.primaryPrinting ?? null,
          data_completeness:    card.dataCompleteness ?? null,
          last_scraped_at:      card.lastScrapedAt ?? null,
        },
        { onConflict: 'id' }
      )
      if (cardError) throw cardError

      const usdPrice = card.prices?.market ?? null
      if (usdPrice != null) {
        await supabase.from('card_prices').upsert(
          {
            card_id:      cardId,
            usd_price:    usdPrice,
            inr_price:    Math.round(usdPrice * rates.USD_INR),
            aed_price:    Math.round(usdPrice * rates.USD_AED * 100) / 100,
            last_fetched: new Date().toISOString(),
          },
          { onConflict: 'card_id' }
        )
      }

      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .eq('list_type', 'HAVE')
        .maybeSingle()

      if (existing) {
        setAddStates(prev => ({ ...prev, [cardId]: 'duplicate' }))
        setToast({ type: 'info', message: `${card.name ?? 'Card'} is already in your collection.` })
        setGradingCard(null)
        return
      }

      const { error: ucError } = await supabase.from('user_cards').insert({
        user_id:         userId,
        card_id:         cardId,
        list_type:       'HAVE',
        added_via:       'manual',
        grading_company: grading.company,
        grade:           grading.grade,
        grade_label:     grading.grade_label,
      })
      if (ucError) throw ucError

      setAddStates(prev => ({ ...prev, [cardId]: 'added' }))
      setToast({ type: 'success', message: `${card.name ?? 'Card'} added to your collection!` })
      onCardAdded?.()
      setGradingCard(null)
    } catch (err: unknown) {
      setAddStates(prev => ({ ...prev, [cardId]: 'idle' }))
      const msg = (err as { message?: string })?.message ?? 'Failed to add card.'
      setToast({ type: 'error', message: msg })
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
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-base select-none pointer-events-none">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search Pokémon cards…"
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
          />
        </div>
        <button
          onClick={() => search(query)}
          disabled={loading || !query.trim()}
          className="bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black rounded-xl px-5 text-sm tracking-wide transition-colors flex-shrink-0 shadow-lg shadow-yellow-400/20"
        >
          {loading ? (
            <span className="block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : 'Search'}
        </button>
      </div>

      {/* States */}
      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {!loading && searched && results.length === 0 && !error && (
        <div className="mt-8 text-center text-zinc-500 text-sm">
          No cards found for &ldquo;{query}&rdquo;
        </div>
      )}
      {!searched && !loading && (
        <p className="mt-4 text-zinc-600 text-xs text-center">
          Type a card name and press Enter or Search
        </p>
      )}
      {loading && (
        <div className="mt-8 flex justify-center">
          <div className="w-7 h-7 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[72vh] overflow-y-auto pr-1 pb-2">
          {results.map(card =>
            userId ? (
              <CardResult
                key={card.tcgPlayerId ?? card.name}
                card={card}
                addState={addStates[String(card.tcgPlayerId ?? '')] ?? 'idle'}
                onAdd={() => handleRequestAdd(card)}
                rates={rates}
                countryCode={countryCode}
              />
            ) : (
              <div
                key={card.tcgPlayerId ?? card.name}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden opacity-60"
              >
                <div className="w-full bg-zinc-800 overflow-hidden" style={{ aspectRatio: '2.5 / 3.5' }}>
                  {getImageUrl(card) ? (
                    <Image
                      src={getImageUrl(card)}
                      alt={card.name ?? ''}
                      width={200}
                      height={280}
                      className="w-full h-full"
                      style={{ objectFit: 'contain', objectPosition: 'center', transform: 'none' }}
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-zinc-600 text-3xl">🃏</span>
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-white font-bold text-xs line-clamp-1">{card.name ?? '—'}</p>
                  <p className="text-zinc-500 text-[10px] mt-0.5">{card.setName}</p>
                </div>
              </div>
            )
          )}
        </div>
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
    </div>
  )
}

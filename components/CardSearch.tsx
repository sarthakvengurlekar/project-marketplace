'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPriceFromUSD } from '@/lib/currency'

// ─── PokemonPriceTracker API types ────────────────────────────────────────────

interface PptCard {
  tcgPlayerId?: string
  name?: string
  setName?: string
  setId?: string
  number?: string
  cardNumber?: string
  rarity?: string
  imageCdnUrl200?: string
  imageCdnUrl400?: string
  imageCdnUrl800?: string
  image?: { small?: string; large?: string }
  imageUrl?: string
  prices?: { market?: number | null; low?: number | null; high?: number | null }
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

// ─── Card result ──────────────────────────────────────────────────────────────

type AddState = 'idle' | 'loading' | 'added' | 'duplicate'

function CardResult({
  card,
  userId,
  rates,
  countryCode,
  onToast,
  onCardAdded,
}: {
  card: PptCard
  userId: string
  rates: ExchangeRates
  countryCode: string
  onToast: (t: ToastState) => void
  onCardAdded?: () => void
}) {
  const [addState, setAddState] = useState<AddState>('idle')

  async function handleAdd() {
    if (addState !== 'idle') return
    setAddState('loading')

    try {
      const cardId = String(card.tcgPlayerId ?? '')

      const { error: cardError } = await supabase.from('cards').upsert(
        {
          id:              cardId,
          name:            card.name ?? '',
          set_name:        card.setName ?? null,
          set_code:        card.setId ?? card.setName ?? null,
          card_number:     card.number ?? card.cardNumber ?? null,
          rarity:          card.rarity ?? null,
          image_url:       card.imageCdnUrl400 ?? card.imageCdnUrl200 ?? card.imageUrl ?? card.image?.small ?? null,
          image_url_hires: card.imageCdnUrl800 ?? card.imageUrl ?? card.image?.large ?? null,
        },
        { onConflict: 'id' }
      )
      if (cardError) throw cardError

      const usdPrice = card.prices?.market ?? null
      if (usdPrice != null) {
        const { error: priceError } = await supabase.from('card_prices').upsert(
          {
            card_id:      cardId,
            usd_price:    usdPrice,
            inr_price:    Math.round(usdPrice * rates.USD_INR),
            aed_price:    Math.round(usdPrice * rates.USD_AED * 100) / 100,
            last_fetched: new Date().toISOString(),
          },
          { onConflict: 'card_id' }
        )
        if (priceError) throw priceError
      }

      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .eq('list_type', 'HAVE')
        .maybeSingle()

      if (existing) {
        setAddState('duplicate')
        onToast({ type: 'info', message: `${card.name ?? 'Card'} is already in your collection.` })
        return
      }

      const { error: ucError } = await supabase.from('user_cards').insert({
        user_id:   userId,
        card_id:   cardId,
        list_type: 'HAVE',
        added_via: 'manual',
      })
      if (ucError) throw ucError

      setAddState('added')
      onToast({ type: 'success', message: `${card.name ?? 'Card'} added to your collection!` })
      onCardAdded?.()
    } catch (err: unknown) {
      setAddState('idle')
      const msg = (err as { message?: string })?.message ?? 'Failed to add card.'
      onToast({ type: 'error', message: msg })
    }
  }

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

      {/* Card image with price overlay */}
      <div className="w-full bg-zinc-800 overflow-hidden" style={{ aspectRatio: '2.5 / 3.5' }}>
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

        {/* USD price badge — top right */}
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

          <div className="flex items-center justify-between gap-1 flex-wrap">
            {card.rarity && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${rarityStyle(card.rarity)}`}>
                {card.rarity}
              </span>
            )}
            {localPrice && (
              <span className="text-zinc-300 text-[10px] font-bold ml-auto">{localPrice}</span>
            )}
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={addState === 'loading' || addState === 'added' || addState === 'duplicate'}
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

  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<PptCard[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [userId, setUserId]   = useState<string | null>(null)
  const [rates, setRates]     = useState<ExchangeRates>(FALLBACK_RATES)
  const [toast, setToast]     = useState<ToastState>(null)
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
                userId={userId}
                rates={rates}
                countryCode={countryCode}
                onToast={setToast}
                onCardAdded={onCardAdded}
              />
            ) : (
              /* Not logged in — show card image only */
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

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

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
  return card.imageCdnUrl200 ?? card.imageUrl ?? card.image?.small ?? card.image?.large ?? ''
}

interface ExchangeRates {
  USD_INR: number
  USD_AED: number
}

const FALLBACK_RATES: ExchangeRates = { USD_INR: 83.5, USD_AED: 3.67 }

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
    info: 'bg-zinc-800 border-zinc-700 text-zinc-300',
    error: 'bg-red-500/15 border-red-500/30 text-red-400',
  }
  const icons = { success: '✓', info: 'ℹ', error: '✕' }

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl text-sm font-semibold backdrop-blur-sm transition-all ${colours[toast.type]}`}
    >
      <span className="text-base leading-none">{icons[toast.type]}</span>
      {toast.message}
    </div>
  )
}

// ─── Card result item ─────────────────────────────────────────────────────────

type AddState = 'idle' | 'loading' | 'added' | 'duplicate'

function CardResult({
  card,
  userId,
  rates,
  onToast,
  onCardAdded,
}: {
  card: PptCard
  userId: string
  rates: ExchangeRates
  onToast: (t: ToastState) => void
  onCardAdded?: () => void
}) {
  const [addState, setAddState] = useState<AddState>('idle')

  async function handleAdd() {
    if (addState !== 'idle') return
    setAddState('loading')

    try {
      // 1. Upsert into public.cards
      const cardId = String(card.tcgPlayerId ?? '')
      const { error: cardError } = await supabase.from('cards').upsert(
        {
          id: cardId,
          name: card.name ?? '',
          set_name: card.setName ?? null,
          set_code: card.setId ?? card.setName ?? null,
          card_number: card.number ?? card.cardNumber ?? null,
          rarity: card.rarity ?? null,
          image_url: card.imageCdnUrl200 ?? card.imageUrl ?? card.image?.small ?? null,
          image_url_hires: card.imageCdnUrl800 ?? card.imageUrl ?? card.image?.large ?? null,
        },
        { onConflict: 'id' }
      )
      if (cardError) {
        console.error('[add-card] cards upsert error:', cardError)
        throw cardError
      }

      // 2. Upsert price with INR + AED computed from exchange rates
      const usdPrice = card.prices?.market ?? null
      if (usdPrice != null) {
        const inrPrice = Math.round(usdPrice * rates.USD_INR)
        const aedPrice = Math.round(usdPrice * rates.USD_AED * 100) / 100
        const { error: priceError } = await supabase.from('card_prices').upsert(
          {
            card_id: cardId,
            usd_price: usdPrice,
            inr_price: inrPrice,
            aed_price: aedPrice,
            last_fetched: new Date().toISOString(),
          },
          { onConflict: 'card_id' }
        )
        if (priceError) {
          console.error('[add-card] card_prices upsert error:', priceError)
          throw priceError
        }
      }

      // 3. Check for duplicate
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

      // 4. Insert into user_cards
      const { error: ucError } = await supabase.from('user_cards').insert({
        user_id: userId,
        card_id: cardId,
        list_type: 'HAVE',
        added_via: 'manual',
      })
      if (ucError) {
        console.error('[add-card] user_cards insert error:', ucError)
        throw ucError
      }

      setAddState('added')
      onToast({ type: 'success', message: `${card.name ?? 'Card'} added to your collection!` })
      onCardAdded?.()
    } catch (err: unknown) {
      console.error('[add-card] unhandled error:', err)
      setAddState('idle')
      const msg = (err as { message?: string })?.message ?? 'Failed to add card.'
      onToast({ type: 'error', message: msg })
    }
  }

  const buttonStyles: Record<AddState, string> = {
    idle: 'bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black',
    loading: 'bg-yellow-400/50 text-black cursor-wait',
    added: 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 cursor-default',
    duplicate: 'bg-zinc-700 text-zinc-400 cursor-default',
  }
  const buttonLabel: Record<AddState, string> = {
    idle: 'Add to My Collection',
    loading: 'Adding…',
    added: '✓ Added',
    duplicate: 'Already owned',
  }

  const imageUrl = getImageUrl(card)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col ring-1 ring-yellow-400/5 hover:ring-yellow-400/20 transition-all">
      <div className="relative w-full bg-zinc-800 aspect-[2.5/3.5] overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={card.name ?? ''}
            fill
            sizes="(max-width: 640px) 50vw, 200px"
            className="object-contain p-2"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-zinc-600 text-3xl">🃏</span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex-1">
          <p className="text-white font-bold text-sm leading-tight line-clamp-1">{card.name ?? '—'}</p>
          <p className="text-zinc-500 text-xs mt-0.5 line-clamp-1">{card.setName}</p>
          {card.rarity && (
            <p className="text-yellow-500/70 text-xs mt-0.5 line-clamp-1">{card.rarity}</p>
          )}
          {card.prices?.market != null && (
            <p className="text-zinc-400 text-xs mt-1 font-medium">
              ${card.prices.market.toFixed(2)}
            </p>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={addState === 'loading' || addState === 'added' || addState === 'duplicate'}
          className={`w-full rounded-xl py-2 text-xs font-black tracking-wide transition-colors ${buttonStyles[addState]}`}
        >
          {buttonLabel[addState]}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CardSearch({ onCardAdded }: { onCardAdded?: () => void } = {}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PptCard[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [rates, setRates] = useState<ExchangeRates>(FALLBACK_RATES)
  const [toast, setToast] = useState<ToastState>(null)
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
      if (json.data?.length > 0) {
        console.log('[search-cards] first result structure:', JSON.stringify(json.data[0], null, 2))
      }
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
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-base select-none pointer-events-none">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          ) : (
            'Search'
          )}
        </button>
      </div>

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

      {results.length > 0 && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto pr-1 pb-2">
          {results.map((card) =>
            userId ? (
              <CardResult
                key={card.tcgPlayerId}
                card={card}
                userId={userId}
                rates={rates}
                onToast={setToast}
                onCardAdded={onCardAdded}
              />
            ) : (
              <div
                key={card.tcgPlayerId ?? Math.random()}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden opacity-60"
              >
                <div className="relative w-full aspect-[2.5/3.5] bg-zinc-800">
                  {getImageUrl(card) ? (
                    <Image
                      src={getImageUrl(card)}
                      alt={card.name ?? ''}
                      fill
                      sizes="200px"
                      className="object-contain p-2"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-zinc-600 text-3xl">🃏</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-white font-bold text-sm line-clamp-1">{card.name ?? '—'}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{card.setName}</p>
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

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// ─── Pokémon TCG API types ───────────────────────────────────────────────────

interface TcgPrice {
  low?: number | null
  mid?: number | null
  high?: number | null
  market?: number | null
  directLow?: number | null
}

interface TcgPlayerPrices {
  normal?: TcgPrice
  holofoil?: TcgPrice
  reverseHolofoil?: TcgPrice
  [key: string]: TcgPrice | undefined
}

interface PokemonCard {
  id: string
  name: string
  number: string
  rarity?: string
  images: {
    small: string
    large: string
  }
  set: {
    id: string
    name: string
    series: string
  }
  tcgplayer?: {
    url?: string
    prices?: TcgPlayerPrices
  }
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
  onToast,
  onCardAdded,
}: {
  card: PokemonCard
  userId: string
  onToast: (t: ToastState) => void
  onCardAdded?: () => void
}) {
  const [addState, setAddState] = useState<AddState>('idle')

  async function handleAdd() {
    if (addState !== 'idle') return
    setAddState('loading')

    try {
      // 1. Upsert into public.cards
      const { error: cardError } = await supabase.from('cards').upsert(
        {
          id: card.id,
          name: card.name,
          set_name: card.set.name,
          set_code: card.set.id,
          card_number: card.number,
          rarity: card.rarity ?? null,
          image_url: card.images.small,
        },
        { onConflict: 'id' }
      )
      if (cardError) throw cardError

      // 2. Upsert price if available
      const marketPrice = card.tcgplayer?.prices?.normal?.market ?? null
      if (marketPrice !== null) {
        const { error: priceError } = await supabase.from('card_prices').upsert(
          {
            card_id: card.id,
            usd_price: marketPrice,
            last_fetched: new Date().toISOString(),
          },
          { onConflict: 'card_id' }
        )
        if (priceError) throw priceError
      }

      // 3. Check for existing user_card to give a friendlier duplicate message
      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('card_id', card.id)
        .eq('list_type', 'HAVE')
        .maybeSingle()

      if (existing) {
        setAddState('duplicate')
        onToast({ type: 'info', message: `${card.name} is already in your collection.` })
        return
      }

      // 4. Insert into user_cards
      const { error: ucError } = await supabase.from('user_cards').insert({
        user_id: userId,
        card_id: card.id,
        list_type: 'HAVE',
        added_via: 'manual',
      })
      if (ucError) throw ucError

      setAddState('added')
      onToast({ type: 'success', message: `${card.name} added to your collection!` })
      onCardAdded?.()
    } catch (err: unknown) {
      setAddState('idle')
      onToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to add card.',
      })
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

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col ring-1 ring-yellow-400/5 hover:ring-yellow-400/20 transition-all">
      {/* Card image */}
      <div className="relative w-full bg-zinc-800 aspect-[2.5/3.5] overflow-hidden">
        <Image
          src={card.images.small}
          alt={card.name}
          fill
          sizes="(max-width: 640px) 50vw, 200px"
          className="object-contain p-2"
          unoptimized
        />
      </div>

      {/* Info + button */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex-1">
          <p className="text-white font-bold text-sm leading-tight line-clamp-1">{card.name}</p>
          <p className="text-zinc-500 text-xs mt-0.5 line-clamp-1">{card.set.name}</p>
          {card.rarity && (
            <p className="text-yellow-500/70 text-xs mt-0.5 line-clamp-1">{card.rarity}</p>
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
  const [results, setResults] = useState<PokemonCard[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  const search = useCallback(async (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      const apiKey = process.env.NEXT_PUBLIC_POKEMON_TCG_API_KEY
      if (apiKey) headers['X-Api-Key'] = apiKey

      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(trimmed)}*&orderBy=name&pageSize=30`,
        { headers }
      )

      if (!res.ok) throw new Error(`API error ${res.status}`)

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

      {/* Results grid */}
      {results.length > 0 && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto pr-1 pb-2">
          {results.map((card) =>
            userId ? (
              <CardResult
                key={card.id}
                card={card}
                userId={userId}
                onToast={setToast}
                onCardAdded={onCardAdded}
              />
            ) : (
              <div
                key={card.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden opacity-60"
              >
                <div className="relative w-full aspect-[2.5/3.5] bg-zinc-800">
                  <Image
                    src={card.images.small}
                    alt={card.name}
                    fill
                    sizes="200px"
                    className="object-contain p-2"
                    unoptimized
                  />
                </div>
                <div className="p-3">
                  <p className="text-white font-bold text-sm line-clamp-1">{card.name}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{card.set.name}</p>
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

'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import GradingSelector, { GradingSelection, DEFAULT_GRADING } from '@/components/GradingSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PptCard {
  tcgPlayerId?: string | number
  externalCatalogId?: string
  name?: string
  setName?: string
  setId?: string | number
  cardNumber?: string | number
  number?: string | number
  totalSetNumber?: number | string
  rarity?: string
  imageCdnUrl200?: string
  imageCdnUrl400?: string
  imageCdnUrl800?: string
  imageUrl?: string
  image?: { small?: string; large?: string }
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
  lowConfidence?: boolean
}

interface ScanResult {
  card_name: string
  set_name: string
  card_number: string
  set_code: string
  total_cards: number
  is_foil: boolean
}

type ScanState = 'idle' | 'identifying' | 'matched' | 'adding' | 'added' | 'error'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function resizeToBase64(file: File, maxDim = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

function extractMarketPrice(card: PptCard): number | null {
  return card.prices?.market ?? null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanCardModal({
  userId,
  isOpen,
  onClose,
  onCardAdded,
}: {
  userId: string
  isOpen: boolean
  onClose: () => void
  onCardAdded: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanState, setScanState]     = useState<ScanState>('idle')
  const [matchedCard, setMatchedCard] = useState<PptCard | null>(null)
  const [scanResult, setScanResult]   = useState<ScanResult | null>(null)
  const [isFoil, setIsFoil]           = useState(false)
  const [errorMsg, setErrorMsg]       = useState('')
  const [grading, setGrading]         = useState<GradingSelection>(DEFAULT_GRADING)

  function reset() {
    setScanState('idle')
    setMatchedCard(null)
    setScanResult(null)
    setIsFoil(false)
    setErrorMsg('')
    setGrading(DEFAULT_GRADING)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanState('identifying')
    setGrading(DEFAULT_GRADING)

    try {
      const imageBase64 = await resizeToBase64(file)

      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })

      if (res.status === 404) {
        setScanState('error')
        setErrorMsg("Couldn't identify this card. Try better lighting or use the search instead.")
        return
      }

      if (!res.ok) {
        setScanState('error')
        setErrorMsg('Something went wrong. Please try again.')
        return
      }

      const { card, is_foil, scan_result } = await res.json()
      setMatchedCard(card)
      setScanResult(scan_result ?? null)
      setIsFoil(is_foil ?? false)
      setScanState('matched')
    } catch (err) {
      console.error('[scan-card] client error:', err)
      setScanState('error')
      setErrorMsg('Something went wrong. Please try again.')
    }
  }

  async function handleConfirmAdd() {
    if (!matchedCard) return
    setScanState('adding')

    try {
      const cardId = String(matchedCard.tcgPlayerId ?? '')
      if (!cardId) throw new Error('Card has no ID')

      const { error: cardErr } = await supabase.from('cards').upsert(
        {
          id:                   cardId,
          name:                 matchedCard.name ?? '',
          set_name:             matchedCard.setName ?? null,
          set_code:             matchedCard.externalCatalogId ? matchedCard.externalCatalogId.split('-')[0] : null,
          set_id:               matchedCard.setId != null ? Number(matchedCard.setId) : null,
          card_number:          String(matchedCard.cardNumber ?? matchedCard.number ?? ''),
          rarity:               matchedCard.rarity ?? null,
          image_url:            matchedCard.imageCdnUrl200 ?? matchedCard.imageCdnUrl400 ?? matchedCard.imageUrl ?? matchedCard.image?.small ?? null,
          image_url_hires:      matchedCard.imageCdnUrl800 ?? matchedCard.imageUrl ?? matchedCard.image?.large ?? null,
          tcgplayer_id:         cardId,
          hp:                   matchedCard.hp != null ? String(matchedCard.hp) : null,
          stage:                matchedCard.stage ?? null,
          card_type:            matchedCard.cardType ?? null,
          pokemon_type:         matchedCard.pokemonType ?? null,
          energy_type:          matchedCard.energyType ?? null,
          weakness:             matchedCard.weakness ?? null,
          resistance:           matchedCard.resistance ?? null,
          retreat_cost:         matchedCard.retreatCost != null ? String(matchedCard.retreatCost) : null,
          attacks:              matchedCard.attacks ?? null,
          flavor_text:          matchedCard.flavorText ?? null,
          artist:               matchedCard.artist ?? null,
          tcgplayer_url:        matchedCard.tcgPlayerUrl ?? null,
          external_catalog_id:  matchedCard.externalCatalogId ?? null,
          printings_available:  matchedCard.printingsAvailable ?? null,
          primary_printing:     matchedCard.prices?.primaryPrinting ?? null,
          data_completeness:    matchedCard.dataCompleteness ?? null,
          last_scraped_at:      matchedCard.lastScrapedAt ?? null,
        },
        { onConflict: 'id' }
      )
      if (cardErr) throw cardErr

      const marketPrice = extractMarketPrice(matchedCard)
      if (marketPrice != null) {
        // Use fallback rates for INR/AED — refresh-price will overwrite with live rates
        // when the card next goes stale (24h), but this ensures the total shows immediately.
        const INR_RATE = 83.5
        const AED_RATE = 3.67
        await supabase.from('card_prices').upsert(
          {
            card_id:      cardId,
            usd_price:    marketPrice,
            inr_price:    Math.round(marketPrice * INR_RATE),
            aed_price:    Math.round(marketPrice * AED_RATE * 100) / 100,
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

      if (!existing) {
        const { error: ucErr } = await supabase.from('user_cards').insert({
          user_id:         userId,
          card_id:         cardId,
          list_type:       'HAVE',
          added_via:       'scan',
          is_foil:         isFoil,
          grading_company: grading.company,
          grade:           grading.grade,
          grade_label:     grading.grade_label,
        })
        if (ucErr) throw ucErr
      }

      setScanState('added')
      onCardAdded()
    } catch (err) {
      console.error('[scan-card] add error:', err)
      setScanState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add card.')
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
      />

      {/* Modal — top-anchored so grading selector has room to breathe */}
      <div
        className="fixed inset-x-4 top-[4%] z-50 max-w-sm mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-white font-black text-base tracking-tight">📷 Scan Card</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="p-5 overflow-y-auto flex-1">

          {/* ── idle ────────────────────────────────────────── */}
          {scanState === 'idle' && (
            <div className="text-center py-4">
              <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-dashed border-zinc-700 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📷</span>
              </div>
              <h3 className="text-white font-black text-lg mb-1">Take a photo</h3>
              <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
                Point your camera at a Pokémon card. Make sure the card name and number are clearly visible.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-black rounded-xl py-3 text-sm tracking-wide transition-colors shadow-lg shadow-yellow-400/20"
              >
                Open Camera
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* ── identifying ─────────────────────────────────── */}
          {scanState === 'identifying' && (
            <div className="text-center py-10">
              <div className="w-12 h-12 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
              <p className="text-white font-black text-base">Identifying your card…</p>
              <p className="text-zinc-500 text-sm mt-1">Asking GPT-4o to read the card</p>
            </div>
          )}

          {/* ── matched ─────────────────────────────────────── */}
          {scanState === 'matched' && matchedCard && (
            <div className="space-y-5">
              {/* Card preview */}
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 text-center ${matchedCard.lowConfidence ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {matchedCard.lowConfidence
                    ? 'We found a possible match — is this your card?'
                    : 'Is this your card?'}
                </p>
                <div className="flex gap-4">
                  <div className="relative w-20 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-800" style={{ height: 112 }}>
                    {getImageUrl(matchedCard) ? (
                      <Image
                        src={getImageUrl(matchedCard)}
                        alt={matchedCard.name ?? 'Card'}
                        width={80}
                        height={112}
                        className="object-contain p-1 w-full h-full"
                        style={{ transform: 'none' }}
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-2xl">🃏</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-white font-black text-sm leading-tight">{matchedCard.name}</p>
                    <p className="text-zinc-400 text-xs mt-1 line-clamp-1">{matchedCard.setName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {(matchedCard.cardNumber ?? matchedCard.number) && (
                        <span className="text-zinc-300 text-xs font-bold">
                          #{matchedCard.cardNumber ?? matchedCard.number}
                        </span>
                      )}
                      {matchedCard.setId && (
                        <span className="text-zinc-500 text-xs font-mono uppercase">{matchedCard.setId}</span>
                      )}
                    </div>
                    {scanResult?.card_number && scanResult.card_number !== (matchedCard.cardNumber ?? matchedCard.number) && (
                      <p className="text-amber-500/70 text-xs mt-0.5">Scanned: {scanResult.card_number}</p>
                    )}
                    {matchedCard.rarity && (
                      <p className="text-yellow-500/70 text-xs mt-0.5">{matchedCard.rarity}</p>
                    )}
                    {isFoil && (
                      <span className="inline-block mt-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 uppercase tracking-wide">
                        Foil
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-800" />

              {/* Grading selector */}
              <GradingSelector value={grading} onChange={setGrading} />

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleConfirmAdd}
                  className="w-full bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-black font-black rounded-xl py-3 text-sm tracking-wide transition-colors shadow-lg shadow-yellow-400/20"
                >
                  Add to My Collection
                </button>
                <button
                  onClick={reset}
                  className="w-full text-zinc-500 hover:text-zinc-300 text-sm py-2 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* ── adding ──────────────────────────────────────── */}
          {scanState === 'adding' && (
            <div className="text-center py-10">
              <div className="w-12 h-12 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
              <p className="text-white font-bold">Adding to your collection…</p>
            </div>
          )}

          {/* ── added ───────────────────────────────────────── */}
          {scanState === 'added' && matchedCard && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-emerald-400">✓</span>
              </div>
              <p className="text-white font-black text-lg mb-1">Card Added!</p>
              <p className="text-zinc-400 text-sm mb-6 line-clamp-1">
                {matchedCard.name} is now in your binder.
              </p>
              <button
                onClick={handleClose}
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl py-3 text-sm tracking-wide transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* ── error ───────────────────────────────────────── */}
          {scanState === 'error' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <p className="text-white font-bold text-base mb-2">Scan Failed</p>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{errorMsg}</p>
              <button
                onClick={reset}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl py-2.5 text-sm transition-colors mb-2"
              >
                Try Again
              </button>
              <button
                onClick={handleClose}
                className="w-full text-zinc-600 hover:text-zinc-400 text-sm py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

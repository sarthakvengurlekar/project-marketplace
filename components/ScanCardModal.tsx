'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import GradingSelector, { GradingSelection, DEFAULT_GRADING } from '@/components/GradingSelector'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPriceFromUSD } from '@/lib/currency'
import { getGradeMultiplier } from '@/lib/grading'

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
  const { countryCode } = useCountry()

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

      // Store graded price as the baseline so GAIN reflects actual card value
      const gradeMultiplier = getGradeMultiplier(grading.company, grading.grade)
      const gradedPrice = marketPrice != null ? marketPrice * gradeMultiplier : null

      const { data: existing } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .eq('list_type', 'HAVE')
        .maybeSingle()

      if (!existing) {
        const { error: ucErr } = await supabase.from('user_cards').insert({
          user_id:          userId,
          card_id:          cardId,
          list_type:        'HAVE',
          added_via:        'scan',
          is_foil:          isFoil,
          grading_company:  grading.company,
          grade:            grading.grade,
          grade_label:      grading.grade_label,
          added_price_usd:  gradedPrice ?? null,
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
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.7)', zIndex: 50 }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: '0 16px', top: '5%', zIndex: 51,
        maxWidth: 440, margin: '0 auto',
        background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '6px 6px 0 #0A0A0A',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '2px solid #0A0A0A', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: '#E8233B', border: '2px solid #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '2px 2px 0 #0A0A0A' }}>
              📷
            </div>
            <h2 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, margin: 0 }}>Scan Card</h2>
          </div>
          <button
            onClick={handleClose}
            style={{ width: 28, height: 28, background: '#0A0A0A', border: 'none', color: '#FAF6EC', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>

          {/* ── idle ──────────────────────────────────────────── */}
          {scanState === 'idle' && (
            <div style={{ textAlign: 'center', paddingTop: 16 }}>
              <div style={{
                width: 80, height: 80, margin: '0 auto 20px',
                background: '#F4D03F', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
              }}>
                📷
              </div>
              <h3 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 18, margin: '0 0 8px' }}>Take a photo</h3>
              <p style={{ color: '#8B7866', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>
                Point your camera at a Pokémon card. Make sure the card name and number are clearly visible.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', padding: '14px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', cursor: 'pointer' }}
              >
                OPEN CAMERA
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>
          )}

          {/* ── identifying ───────────────────────────────────── */}
          {scanState === 'identifying' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'scanSpin 0.8s linear infinite', margin: '0 auto 20px' }} />
              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15, margin: '0 0 4px' }}>Identifying your card…</p>
              <p style={{ color: '#8B7866', fontSize: 12 }}>Asking GPT-4o to read the card</p>
              <style>{`@keyframes scanSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── matched ───────────────────────────────────────── */}
          {scanState === 'matched' && matchedCard && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Confidence label */}
              <p style={{
                textAlign: 'center', fontSize: 10, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                color: matchedCard.lowConfidence ? '#E8233B' : '#8B7866',
                margin: 0,
              }}>
                {matchedCard.lowConfidence ? '⚠ Possible match — confirm below' : 'Is this your card?'}
              </p>

              {/* Card preview */}
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 80, flexShrink: 0, border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', background: '#f0ece2', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ aspectRatio: '2.5/3.5', position: 'relative' }}>
                    {getImageUrl(matchedCard) ? (
                      <Image src={getImageUrl(matchedCard)} alt={matchedCard.name ?? 'Card'} fill className="object-contain p-1.5" unoptimized />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, opacity: 0.3 }}>🃏</div>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15, margin: '0 0 3px', lineHeight: 1.3 }}>{matchedCard.name}</p>
                  <p style={{ color: '#8B7866', fontSize: 12, margin: '0 0 6px' }}>{matchedCard.setName}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(matchedCard.cardNumber ?? matchedCard.number) && (
                      <span style={{ background: '#0A0A0A', color: '#FAF6EC', fontSize: 9, fontWeight: 900, padding: '2px 6px' }}>
                        #{matchedCard.cardNumber ?? matchedCard.number}
                      </span>
                    )}
                    {matchedCard.rarity && (
                      <span style={{ background: '#F4D03F', color: '#0A0A0A', fontSize: 9, fontWeight: 900, padding: '2px 6px', border: '1px solid #0A0A0A' }}>
                        {matchedCard.rarity}
                      </span>
                    )}
                    {isFoil && (
                      <span style={{ background: '#F4D03F', color: '#0A0A0A', fontSize: 9, fontWeight: 900, padding: '2px 6px', border: '1px solid #0A0A0A' }}>
                        ✦ FOIL
                      </span>
                    )}
                  </div>
                  {scanResult?.card_number && scanResult.card_number !== String(matchedCard.cardNumber ?? matchedCard.number) && (
                    <p style={{ color: '#E8233B', fontSize: 10, margin: '6px 0 0' }}>Scanned: {scanResult.card_number}</p>
                  )}
                  {matchedCard.prices?.market != null && (() => {
                    const raw = matchedCard.prices!.market!
                    const multiplier = getGradeMultiplier(grading.company, grading.grade)
                    const effectiveUsd = raw * multiplier
                    const isGraded = grading.company !== 'RAW' && grading.grade !== null
                    return (
                      <div style={{ marginTop: 8 }}>
                        <p style={{ color: '#E8233B', fontWeight: 900, fontSize: 14, margin: 0 }}>
                          {formatPriceFromUSD(effectiveUsd, countryCode)}
                        </p>
                        <p style={{ color: '#8B7866', fontSize: 10, fontWeight: 700, margin: '2px 0 0' }}>
                          {isGraded
                            ? `Est. ${grading.company} ${grading.grade} · Raw: ${formatPriceFromUSD(raw, countryCode)}`
                            : 'Market price'}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '2px solid #0A0A0A' }} />

              {/* Grading selector */}
              <GradingSelector value={grading} onChange={setGrading} />

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={handleConfirmAdd}
                  style={{ width: '100%', padding: '14px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', cursor: 'pointer' }}
                >
                  ADD TO COLLECTION
                </button>
                <button
                  onClick={reset}
                  style={{ width: '100%', padding: '10px 0', background: 'none', border: '2px solid #0A0A0A', color: '#0A0A0A', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* ── adding ────────────────────────────────────────── */}
          {scanState === 'adding' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'scanSpin 0.8s linear infinite', margin: '0 auto 20px' }} />
              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 15 }}>Adding to your collection…</p>
            </div>
          )}

          {/* ── added ─────────────────────────────────────────── */}
          {scanState === 'added' && matchedCard && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 64, height: 64, margin: '0 auto 16px',
                background: '#F4D03F', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 900, color: '#0A0A0A',
              }}>
                ✓
              </div>
              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 18, margin: '0 0 6px' }}>Card Added!</p>
              <p style={{ color: '#8B7866', fontSize: 13, margin: '0 0 24px' }}>
                {matchedCard.name} is now in your binder.
              </p>
              <button
                onClick={handleClose}
                style={{ width: '100%', padding: '14px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', cursor: 'pointer' }}
              >
                DONE
              </button>
            </div>
          )}

          {/* ── error ─────────────────────────────────────────── */}
          {scanState === 'error' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 64, height: 64, margin: '0 auto 16px',
                background: '#FAF6EC', border: '2px solid #E8233B', boxShadow: '4px 4px 0 #E8233B',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>
                ⚠️
              </div>
              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, margin: '0 0 8px' }}>Scan Failed</p>
              <p style={{ color: '#8B7866', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={reset}
                  style={{ width: '100%', padding: '14px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 14, letterSpacing: '0.05em', cursor: 'pointer' }}
                >
                  TRY AGAIN
                </button>
                <button
                  onClick={handleClose}
                  style={{ width: '100%', padding: '10px 0', background: 'none', border: '2px solid #0A0A0A', color: '#0A0A0A', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

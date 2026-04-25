'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import type { CardDetailResponse, HistoryPoint } from '@/app/api/card-detail/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attack {
  name: string
  damage?: string
  text?: string
  cost?: string[]
}

interface CardRow {
  id: string
  name: string
  set_name: string
  card_number: string | null
  rarity: string | null
  image_url: string | null
  image_url_hires: string | null
  // Rich fields
  hp: string | null
  stage: string | null
  card_type: string | null
  pokemon_type: string | null
  energy_type: string[] | null
  weakness: string | null
  resistance: string | null
  retreat_cost: string | null
  attacks: Attack[] | null
  flavor_text: string | null
  artist: string | null
  tcgplayer_url: string | null
  external_catalog_id: string | null
}

interface UserCardRow {
  condition: string | null
  is_foil: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONDITION_STYLES: Record<string, string> = {
  NM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  LP: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  MP: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  HP: 'bg-red-500/20 text-red-400 border-red-500/30',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtUSD(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtINR(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function fmtAED(n: number) {
  return `AED ${(Math.round(n * 100) / 100).toFixed(2)}`
}

function localFmt(usd: number, countryCode: string, rates: { USD_INR: number; USD_AED: number }) {
  if (countryCode === 'UAE') return fmtAED(usd * rates.USD_AED)
  return fmtINR(usd * rates.USD_INR)
}

// ─── Price history chart ──────────────────────────────────────────────────────

interface ChartPoint {
  label: string
  inr: number
  usd: number
  volume: number
}

function buildChartData(history: HistoryPoint[], USD_INR: number): ChartPoint[] {
  return history.map(h => ({
    label:  new Date(h.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    inr:    Math.round(h.price * USD_INR),
    usd:    h.price,
    volume: h.volume,
  }))
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: { name: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const inrEntry  = payload.find(p => p.name === 'inr')
  const volEntry  = payload.find(p => p.name === 'volume')
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-zinc-400 text-[11px] mb-1">{label}</p>
      {inrEntry && <p className="text-yellow-400 font-black text-sm">{fmtINR(inrEntry.value)}</p>}
      {volEntry && volEntry.value > 0 && (
        <p className="text-zinc-500 text-[11px] mt-0.5">{volEntry.value} sold</p>
      )}
    </div>
  )
}

// ─── Card detail helpers ──────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Fire:       { bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30',    dot: '#ef4444' },
  Water:      { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30',   dot: '#3b82f6' },
  Grass:      { bg: 'bg-green-500/15',  text: 'text-green-400',  border: 'border-green-500/30',  dot: '#22c55e' },
  Lightning:  { bg: 'bg-yellow-400/15', text: 'text-yellow-400', border: 'border-yellow-400/30', dot: '#eab308' },
  Electric:   { bg: 'bg-yellow-400/15', text: 'text-yellow-400', border: 'border-yellow-400/30', dot: '#eab308' },
  Psychic:    { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', dot: '#a855f7' },
  Fighting:   { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', dot: '#f97316' },
  Darkness:   { bg: 'bg-zinc-600/20',   text: 'text-zinc-300',   border: 'border-zinc-600/40',   dot: '#6b7280' },
  Dark:       { bg: 'bg-zinc-600/20',   text: 'text-zinc-300',   border: 'border-zinc-600/40',   dot: '#6b7280' },
  Metal:      { bg: 'bg-zinc-400/10',   text: 'text-zinc-300',   border: 'border-zinc-400/20',   dot: '#9ca3af' },
  Dragon:     { bg: 'bg-teal-500/15',   text: 'text-teal-400',   border: 'border-teal-500/30',   dot: '#14b8a6' },
  Colorless:  { bg: 'bg-zinc-600/15',   text: 'text-zinc-400',   border: 'border-zinc-600/30',   dot: '#71717a' },
  Fairy:      { bg: 'bg-pink-500/15',   text: 'text-pink-400',   border: 'border-pink-500/30',   dot: '#ec4899' },
}

function TypePill({ type }: { type: string }) {
  const c = TYPE_COLORS[type]
  if (!c) return <span className="text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-lg">{type}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {type}
    </span>
  )
}

function retreatStars(cost: string | null): string {
  if (!cost) return '—'
  const n = parseInt(cost, 10)
  if (isNaN(n)) return cost
  if (n === 0) return 'Free'
  return '★'.repeat(Math.min(n, 6))
}

// ─── Grade info tooltip ───────────────────────────────────────────────────────

function GradeInfoBadge() {
  return (
    <div className="group relative inline-flex">
      <span className="w-4 h-4 rounded-full bg-zinc-700 text-zinc-400 text-[9px] font-black flex items-center justify-center cursor-help select-none">?</span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] leading-relaxed px-3 py-2 rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
        PSA 10 = Gem Mint. Graded cards typically sell for a premium over raw ungraded cards. Smart Market Price = weighted recent sales average.
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CardDetailPage() {
  const params   = useParams()
  const cardId   = params.cardId as string
  const router   = useRouter()
  const { countryCode } = useCountry()

  const [card,          setCard]          = useState<CardRow | null>(null)
  const [userCard,      setUserCard]      = useState<UserCardRow | null>(null)
  const [price,         setPrice]         = useState<{ usd: number | null; inr: number | null; aed: number | null; lastFetched: string | null }>({
    usd: null, inr: null, aed: null, lastFetched: null,
  })
  const [detail,        setDetail]        = useState<CardDetailResponse | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [detailLoading, setDetailLoading] = useState(true)

  const loadCard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()

    const [cardRes, priceRes] = await Promise.all([
      supabase.from('cards').select('id, name, set_name, card_number, rarity, image_url, image_url_hires, hp, stage, card_type, pokemon_type, energy_type, weakness, resistance, retreat_cost, attacks, flavor_text, artist, tcgplayer_url, external_catalog_id').eq('id', cardId).maybeSingle(),
      supabase.from('card_prices').select('usd_price, inr_price, aed_price, last_fetched').eq('card_id', cardId).maybeSingle(),
    ])

    if (!cardRes.data) {
      // Card not in DB yet — check if add-cards page stored a preview in sessionStorage
      const stored = typeof window !== 'undefined'
        ? sessionStorage.getItem(`ppt_card_preview_${cardId}`)
        : null
      if (stored) {
        try {
          const p = JSON.parse(stored)
          setCard({
            id:                  cardId,
            name:                p.name ?? '',
            set_name:            p.setName ?? '',
            card_number:         String(p.cardNumber ?? p.number ?? ''),
            rarity:              p.rarity ?? null,
            image_url:           p.imageCdnUrl200 ?? p.imageCdnUrl400 ?? p.imageUrl ?? p.image?.small ?? null,
            image_url_hires:     p.imageCdnUrl800 ?? p.imageUrl ?? p.image?.large ?? null,
            hp:                  p.hp != null ? String(p.hp) : null,
            stage:               p.stage ?? null,
            card_type:           p.cardType ?? null,
            pokemon_type:        p.pokemonType ?? null,
            energy_type:         p.energyType ?? null,
            weakness:            p.weakness ?? null,
            resistance:          p.resistance ?? null,
            retreat_cost:        p.retreatCost != null ? String(p.retreatCost) : null,
            attacks:             p.attacks ?? null,
            flavor_text:         p.flavorText ?? null,
            artist:              p.artist ?? null,
            tcgplayer_url:       p.tcgPlayerUrl ?? null,
            external_catalog_id: p.externalCatalogId ?? null,
          })
          if (p.prices?.market != null) {
            setPrice({ usd: p.prices.market, inr: null, aed: null, lastFetched: null })
          }
          setLoading(false)
          return
        } catch { /* fall through to router.back */ }
      }
      router.back(); return
    }
    setCard(cardRes.data as CardRow)

    if (priceRes.data) {
      setPrice({
        usd: priceRes.data.usd_price,
        inr: priceRes.data.inr_price,
        aed: priceRes.data.aed_price,
        lastFetched: priceRes.data.last_fetched,
      })
    }

    if (user) {
      const { data: uc } = await supabase
        .from('user_cards')
        .select('condition, is_foil')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .eq('list_type', 'HAVE')
        .maybeSingle()
      if (uc) setUserCard(uc as UserCardRow)
    }

    setLoading(false)
  }, [cardId, router])

  const loadDetail = useCallback(async () => {
    setDetailLoading(true)

    const [refreshRes, detailRes] = await Promise.allSettled([
      fetch(`/api/refresh-price?card_id=${encodeURIComponent(cardId)}`),
      fetch(`/api/card-detail?card_id=${encodeURIComponent(cardId)}`),
    ])

    if (refreshRes.status === 'fulfilled' && refreshRes.value.ok) {
      const { usd_price, inr_price, aed_price, last_fetched } = await refreshRes.value.json()
      setPrice({ usd: usd_price, inr: inr_price, aed: aed_price, lastFetched: last_fetched })
    }

    if (detailRes.status === 'fulfilled' && detailRes.value.ok) {
      setDetail(await detailRes.value.json() as CardDetailResponse)
    }

    setDetailLoading(false)
  }, [cardId])

  useEffect(() => {
    loadCard()
    loadDetail()
  }, [loadCard, loadDetail])

  // ── Derived values ───────────────────────────────────────────────────────────

  const rates        = detail?.rates ?? { USD_INR: 83.5, USD_AED: 3.67 }
  const displayPrice = countryCode === 'UAE' ? price.aed : price.inr
  const displayFmt   = countryCode === 'UAE' ? (v: number) => fmtAED(v) : (v: number) => fmtINR(v)
  const chartData    = detail ? buildChartData(detail.history, rates.USD_INR) : []

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950">
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
            <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="w-full aspect-[2.5/3.5] max-w-[240px] mx-auto bg-zinc-800 rounded-2xl animate-pulse mb-6" />
          <div className="space-y-3">
            {[80, 40, 60].map((w, i) => (
              <div key={i} className="h-4 bg-zinc-800 rounded animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (!card) return null

  const condition = userCard?.condition ?? null
  const isFoil    = userCard?.is_foil ?? false
  const condStyle = condition ? (CONDITION_STYLES[condition] ?? CONDITION_STYLES['NM']) : null
  const imageUrl  = card.image_url_hires ?? card.image_url ?? ''

  return (
    <main className="min-h-screen bg-zinc-950 pb-16">
      <div className="max-w-lg mx-auto px-4">

        {/* Header */}
        <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm py-3 flex items-center gap-3 border-b border-zinc-900 -mx-4 px-4 mb-6">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm flex-shrink-0"
          >
            ←
          </button>
          <h1 className="text-white font-black text-sm tracking-tight truncate flex-1">{card.name}</h1>
          <Link
            href="/binder"
            className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors flex-shrink-0"
          >
            Binder
          </Link>
        </div>

        {/* Card image */}
        <div className="flex justify-center mb-6">
          <div className="relative w-[220px] flex-shrink-0">
            {isFoil && (
              <span className="absolute top-2 left-2 z-10 text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 uppercase tracking-wide">
                Foil
              </span>
            )}
            {imageUrl ? (
              <div className="relative w-[220px] h-[308px] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
                <Image src={imageUrl} alt={card.name} fill sizes="220px" className="object-contain" unoptimized priority />
              </div>
            ) : (
              <div className="w-[220px] h-[308px] rounded-2xl bg-zinc-800 flex items-center justify-center">
                <span className="text-5xl">🃏</span>
              </div>
            )}
          </div>
        </div>

        {/* Card info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <h2 className="text-white font-black text-xl mb-1">{card.name}</h2>
          <p className="text-zinc-400 text-sm">{card.set_name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {card.card_number && (
              <span className="text-[11px] font-bold text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-lg">
                #{card.card_number}
              </span>
            )}
            {card.rarity && (
              <span className="text-[11px] font-bold text-yellow-500/80 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-lg">
                {card.rarity}
              </span>
            )}
            {condition && condStyle && (
              <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-wide ${condStyle}`}>
                {condition}
              </span>
            )}
            {isFoil && (
              <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-yellow-400/15 text-yellow-400 border border-yellow-400/25 uppercase tracking-wide">
                ✦ Foil
              </span>
            )}
          </div>
        </div>

        {/* Card Details */}
        {(card.hp || card.stage || card.pokemon_type || card.weakness || card.resistance ||
          card.retreat_cost || card.artist || card.attacks?.length || card.flavor_text) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4 space-y-4">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Card Details</p>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              {card.hp && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">HP</p>
                  <p className="text-white font-black text-lg leading-none">{card.hp}</p>
                </div>
              )}
              {card.stage && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Stage</p>
                  <span className="text-xs font-bold text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-lg">
                    {card.stage}
                  </span>
                </div>
              )}
              {card.retreat_cost && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Retreat</p>
                  <p className="text-yellow-400 font-black text-sm">{retreatStars(card.retreat_cost)}</p>
                </div>
              )}
              {card.artist && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Artist</p>
                  <p className="text-zinc-300 text-xs font-semibold">{card.artist}</p>
                </div>
              )}
            </div>

            {/* Type + Weakness + Resistance */}
            {(card.pokemon_type || card.energy_type?.length || card.weakness || card.resistance) && (
              <div className="flex flex-wrap gap-2 items-center">
                {card.pokemon_type && <TypePill type={card.pokemon_type} />}
                {card.energy_type?.filter(t => t !== card.pokemon_type).map(t => (
                  <TypePill key={t} type={t} />
                ))}
                {card.weakness && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                    Weak: {card.weakness}
                  </span>
                )}
                {card.resistance && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Resist: {card.resistance}
                  </span>
                )}
              </div>
            )}

            {/* Attacks */}
            {card.attacks && card.attacks.length > 0 && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Attacks</p>
                <div className="space-y-0 divide-y divide-zinc-800">
                  {card.attacks.map((atk, i) => (
                    <div key={i} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {atk.cost && atk.cost.length > 0 && (
                            <div className="flex gap-0.5 flex-shrink-0">
                              {atk.cost.map((c, j) => (
                                <span
                                  key={j}
                                  className="w-3 h-3 rounded-full border border-zinc-600 flex-shrink-0"
                                  style={{ background: TYPE_COLORS[c]?.dot ?? '#6b7280' }}
                                />
                              ))}
                            </div>
                          )}
                          <span className="text-white font-black text-sm truncate">{atk.name}</span>
                        </div>
                        {atk.damage && (
                          <span className="text-yellow-400 font-black text-base flex-shrink-0 ml-2">{atk.damage}</span>
                        )}
                      </div>
                      {(atk.text) && (
                        <p className="text-zinc-400 text-xs leading-relaxed">{atk.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flavor text */}
            {card.flavor_text && (
              <p className="text-zinc-500 text-xs italic leading-relaxed border-t border-zinc-800 pt-3">
                &ldquo;{card.flavor_text}&rdquo;
              </p>
            )}

            {/* TCGPlayer link */}
            {card.tcgplayer_url && (
              <a
                href={card.tcgplayer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white font-bold text-xs rounded-xl py-2.5 transition-colors"
              >
                View on TCGPlayer ↗
              </a>
            )}
          </div>
        )}

        {/* Market price */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Raw Card Price</p>
          {detailLoading && displayPrice == null ? (
            <div className="h-10 w-1/2 bg-zinc-800 rounded-xl animate-pulse" />
          ) : displayPrice != null ? (
            <>
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-black text-yellow-400 tracking-tight">{displayFmt(displayPrice)}</p>
                {price.usd != null && <p className="text-zinc-500 text-sm">{fmtUSD(price.usd)}</p>}
              </div>
              {price.lastFetched && (
                <p className="text-zinc-600 text-[11px] mt-2">Last updated {timeAgo(price.lastFetched)}</p>
              )}
            </>
          ) : (
            <p className="text-zinc-600 text-sm">Price unavailable</p>
          )}
        </div>

        {/* Price by condition */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Price by Condition</p>
          {detailLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-zinc-800 rounded-lg animate-pulse" />)}
            </div>
          ) : detail?.conditions.length ? (
            <>
              <div className="grid grid-cols-3 text-[10px] font-black text-zinc-600 uppercase tracking-wide pb-2 border-b border-zinc-800 mb-1">
                <span>Condition</span>
                <span className="text-right">USD</span>
                <span className="text-right">INR</span>
              </div>
              <div className="divide-y divide-zinc-800">
                {detail.conditions.map(({ condition: cond, usd }) => (
                  <div key={cond} className="grid grid-cols-3 items-center py-2.5">
                    <span className="text-xs text-zinc-300">{cond}</span>
                    <span className="text-right text-xs font-bold text-zinc-400">{fmtUSD(usd)}</span>
                    <span className="text-right text-xs font-black text-yellow-400">{fmtINR(usd * rates.USD_INR)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-zinc-600 text-sm">No condition pricing available</p>
          )}
        </div>

        {/* Price history chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">
            Price History — 30 days (Near Mint)
          </p>
          {detailLoading ? (
            <div className="h-44 bg-zinc-800/50 rounded-xl animate-pulse" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="price"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                />
                <YAxis
                  yAxisId="vol"
                  orientation="right"
                  tick={{ fill: '#52525b', fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  width={20}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar yAxisId="vol" dataKey="volume" name="volume" fill="#3f3f46" radius={[2, 2, 0, 0]} barSize={10} />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="inr"
                  name="inr"
                  stroke="#facc15"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: '#facc15', stroke: '#09090b', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <p className="text-zinc-600 text-sm">No price history available yet</p>
            </div>
          )}
        </div>

        {/* Graded prices */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Graded Card Prices</p>
            <GradeInfoBadge />
          </div>
          <p className="text-[10px] text-zinc-600 mb-4">Smart Market Price = weighted recent sales average</p>

          {detailLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-10 bg-zinc-800 rounded-xl animate-pulse" />)}
            </div>
          ) : detail?.grades.length ? (
            <>
              <div className="grid grid-cols-5 text-[10px] font-black text-zinc-600 uppercase tracking-wide pb-2 border-b border-zinc-800 mb-1 gap-1">
                <span className="col-span-1">Grade</span>
                <span className="text-right">USD</span>
                <span className="text-right">INR</span>
                <span className="text-right">Sales</span>
                <span className="text-right">7D Avg</span>
              </div>
              <div className="divide-y divide-zinc-800">
                {detail.grades.map(g => {
                  const isPsa10 = g.grade === 'psa10'
                  return (
                    <div
                      key={g.grade}
                      className={`grid grid-cols-5 items-center py-3 gap-1 px-1 -mx-1 rounded-lg ${isPsa10 ? 'bg-yellow-400/5' : ''}`}
                    >
                      <span className={`text-xs font-black col-span-1 ${isPsa10 ? 'text-yellow-400' : 'text-white'}`}>
                        {g.label}
                      </span>
                      <span className="text-right text-xs font-bold text-zinc-400">{fmtUSD(g.smartPrice)}</span>
                      <span className={`text-right text-xs font-black ${isPsa10 ? 'text-yellow-400' : 'text-zinc-200'}`}>
                        {fmtINR(Math.round(g.smartPrice * rates.USD_INR))}
                      </span>
                      <span className="text-right text-xs text-zinc-500">{g.count}</span>
                      <span className="text-right text-xs text-zinc-500">
                        {g.avg7Day != null ? fmtUSD(g.avg7Day) : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-zinc-600 text-sm">No PSA sales data found. This card may not have been graded or sold recently on eBay.</p>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}

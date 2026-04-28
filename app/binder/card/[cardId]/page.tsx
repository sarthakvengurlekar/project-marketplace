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

function fmtUSD(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtINR(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
function fmtAED(n: number) {
  return `AED ${(Math.round(n * 100) / 100).toFixed(2)}`
}
function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function retreatStars(cost: string | null): string {
  if (!cost) return '—'
  const n = parseInt(cost, 10)
  if (isNaN(n)) return cost
  if (n === 0) return 'Free'
  return '★'.repeat(Math.min(n, 6))
}

// ─── Chart ────────────────────────────────────────────────────────────────────

interface ChartPoint { label: string; local: number; usd: number; volume: number }

function buildChartData(history: HistoryPoint[], rate: number): ChartPoint[] {
  return history.map(h => ({
    label:  new Date(h.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    local:  Math.round(h.price * rate),
    usd:    h.price,
    volume: h.volume,
  }))
}

function CustomTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null
  const localEntry = payload.find(p => p.name === 'local')
  const volEntry   = payload.find(p => p.name === 'volume')
  return (
    <div style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', padding: '8px 12px', borderRadius: 4 }}>
      <p style={{ color: '#8B7866', fontSize: 10, marginBottom: 4 }}>{label}</p>
      {localEntry && <p style={{ color: '#E8233B', fontWeight: 900, fontSize: 13 }}>{fmt(localEntry.value)}</p>}
      {volEntry && volEntry.value > 0 && <p style={{ color: '#8B7866', fontSize: 10 }}>{volEntry.value} sold</p>}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'price' | 'graded' | 'details'

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
  const [activeTab,     setActiveTab]     = useState<Tab>('price')

  const loadCard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()

    const [cardRes, priceRes] = await Promise.all([
      supabase.from('cards').select('id, name, set_name, card_number, rarity, image_url, image_url_hires, hp, stage, card_type, pokemon_type, energy_type, weakness, resistance, retreat_cost, attacks, flavor_text, artist, tcgplayer_url, external_catalog_id').eq('id', cardId).maybeSingle(),
      supabase.from('card_prices').select('usd_price, inr_price, aed_price, last_fetched').eq('card_id', cardId).maybeSingle(),
    ])

    if (!cardRes.data) {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem(`ppt_card_preview_${cardId}`) : null
      if (stored) {
        try {
          const p = JSON.parse(stored)
          setCard({
            id: cardId, name: p.name ?? '', set_name: p.setName ?? '',
            card_number: String(p.cardNumber ?? p.number ?? ''), rarity: p.rarity ?? null,
            image_url: p.imageCdnUrl200 ?? p.imageCdnUrl400 ?? p.imageUrl ?? p.image?.small ?? null,
            image_url_hires: p.imageCdnUrl800 ?? p.imageUrl ?? p.image?.large ?? null,
            hp: p.hp != null ? String(p.hp) : null, stage: p.stage ?? null,
            card_type: p.cardType ?? null, pokemon_type: p.pokemonType ?? null,
            energy_type: p.energyType ?? null, weakness: p.weakness ?? null,
            resistance: p.resistance ?? null, retreat_cost: p.retreatCost != null ? String(p.retreatCost) : null,
            attacks: p.attacks ?? null, flavor_text: p.flavorText ?? null,
            artist: p.artist ?? null, tcgplayer_url: p.tcgPlayerUrl ?? null,
            external_catalog_id: p.externalCatalogId ?? null,
          })
          if (p.prices?.market != null) setPrice({ usd: p.prices.market, inr: null, aed: null, lastFetched: null })
          setLoading(false); return
        } catch { /* fall through */ }
      }
      router.back(); return
    }

    setCard(cardRes.data as CardRow)
    if (priceRes.data) {
      setPrice({ usd: priceRes.data.usd_price, inr: priceRes.data.inr_price, aed: priceRes.data.aed_price, lastFetched: priceRes.data.last_fetched })
    }

    if (user) {
      const { data: uc } = await supabase.from('user_cards').select('condition, is_foil').eq('user_id', user.id).eq('card_id', cardId).eq('list_type', 'HAVE').maybeSingle()
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
      const detailData = await detailRes.value.json() as CardDetailResponse
      setDetail(detailData)
      if (detailData.price?.market != null) {
        setPrice({
          usd: detailData.price.market,
          inr: detailData.price.inr,
          aed: detailData.price.aed,
          lastFetched: detailData.price.lastFetched,
        })
      }
    }
    setDetailLoading(false)
  }, [cardId])

  useEffect(() => { loadCard(); loadDetail() }, [loadCard, loadDetail])

  const rates        = detail?.rates ?? { USD_INR: 83.5, USD_AED: 3.67 }
  const localRate    = countryCode === 'UAE' ? rates.USD_AED : rates.USD_INR
  const displayPrice = countryCode === 'UAE' ? price.aed : price.inr
  const displayFmt   = countryCode === 'UAE' ? fmtAED : fmtINR
  const currencyLabel = countryCode === 'UAE' ? 'AED' : 'INR'
  const chartData    = detail ? buildChartData(detail.history, localRate) : []

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen" style={{ background: '#FAF6EC' }}>
        <div className="max-w-lg mx-auto px-4 py-6 animate-pulse">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded" style={{ background: '#e0dbd0', border: '2px solid #0A0A0A' }} />
            <div className="h-4 w-40 rounded" style={{ background: '#e0dbd0' }} />
          </div>
          <div className="w-full aspect-[2.5/3.5] max-w-[200px] mx-auto rounded" style={{ background: '#e0dbd0', border: '2px solid #0A0A0A' }} />
        </div>
      </main>
    )
  }

  if (!card) return null

  const isFoil   = userCard?.is_foil ?? false
  const imageUrl = card.image_url_hires ?? card.image_url ?? ''
  const TABS: { key: Tab; label: string }[] = [
    { key: 'price',   label: 'Price'   },
    { key: 'graded',  label: 'Graded'  },
    { key: 'details', label: 'Details' },
  ]

  return (
    <main className="min-h-screen pb-16" style={{ background: '#FAF6EC' }}>
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div
          className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
          style={{ background: '#FAF6EC', borderBottom: '2px solid #0A0A0A' }}
        >
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center font-black text-base flex-shrink-0"
            style={{ background: '#F4D03F', border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A' }}
          >
            ‹
          </button>
          <h1 className="font-black text-sm tracking-tight truncate flex-1" style={{ color: '#0A0A0A' }}>
            {card.name} · {card.card_number}
          </h1>
          <Link
            href="/binder"
            className="text-xs font-black uppercase tracking-widest flex-shrink-0"
            style={{ color: '#E8233B' }}
          >
            BINDER
          </Link>
        </div>

        {/* Card image — yellow diamond backdrop */}
        <div className="relative flex justify-center py-8 px-4 overflow-hidden" style={{ background: '#FAF6EC' }}>
          {/* Diamond rotated bg square */}
          <div
            className="absolute"
            style={{
              width: 200, height: 200,
              background: '#F4D03F',
              border: '2px solid #0A0A0A',
              transform: 'rotate(45deg)',
              top: '50%', left: '50%',
              marginTop: -100, marginLeft: -100,
              zIndex: 0,
            }}
          />
          {/* Card */}
          <div className="relative z-10" style={{ filter: 'drop-shadow(4px 4px 0 #0A0A0A)' }}>
            {imageUrl ? (
              <div
                className="relative overflow-hidden"
                style={{ width: 180, height: 252, border: '2px solid #E8233B', background: '#FAF6EC' }}
              >
                <Image src={imageUrl} alt={card.name} fill sizes="180px" className="object-contain" unoptimized priority />
                {isFoil && (
                  <span
                    className="absolute top-6 right-1.5 text-[8px] font-black px-1 py-0.5"
                    style={{ background: '#F4D03F', border: '1.5px solid #0A0A0A', color: '#0A0A0A' }}
                  >
                    FOIL
                  </span>
                )}
              </div>
            ) : (
              <div
                style={{ width: 180, height: 252, border: '2px solid #E8233B', background: '#f0ece2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span style={{ fontSize: 48 }}>🃏</span>
              </div>
            )}
          </div>
        </div>

        {/* Title + rarity */}
        <div className="px-4 text-center mb-4">
          <h2 className="font-black text-2xl" style={{ color: '#0A0A0A' }}>{card.name}</h2>
          <p className="text-xs mt-1 uppercase tracking-widest" style={{ color: '#8B7866' }}>
            {card.set_name} · {card.card_number}
          </p>
          {card.rarity && (
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1" style={{ border: '2px solid #0A0A0A', background: '#F4D03F' }}>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#0A0A0A' }}>
                {card.rarity}
              </span>
            </div>
          )}
        </div>

        {/* Price summary (RAW / PSA) */}
        <div className="px-4 mb-4">
          <div className="grid grid-cols-2 overflow-hidden" style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #E8233B' }}>
            <div className="p-4" style={{ background: '#0A0A0A', borderRight: '2px solid #0A0A0A' }}>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#8B7866' }}>RAW NM</p>
              {detailLoading && displayPrice == null ? (
                <div className="h-7 w-24 rounded animate-pulse mt-1" style={{ background: '#2a2a2a' }} />
              ) : displayPrice != null ? (
                <p className="font-black text-xl mt-1" style={{ color: '#E8233B' }}>{displayFmt(displayPrice)}</p>
              ) : (
                <p className="text-sm mt-1" style={{ color: '#6b7280' }}>—</p>
              )}
              {price.lastFetched && (
                <p className="text-[9px] mt-1" style={{ color: '#8B7866' }}>↑ updated {timeAgo(price.lastFetched)}</p>
              )}
            </div>
            <div className="p-4" style={{ background: '#0A0A0A' }}>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#8B7866' }}>PSA 10</p>
              {detailLoading ? (
                <div className="h-7 w-24 rounded animate-pulse mt-1" style={{ background: '#2a2a2a' }} />
              ) : detail?.grades.find(g => g.grade === 'psa10') ? (
                <>
                  <p className="font-black text-xl mt-1" style={{ color: '#FAF6EC' }}>
                    {displayFmt(detail.grades.find(g => g.grade === 'psa10')!.smartPrice * localRate)}
                  </p>
                  <p className="text-[9px] mt-1" style={{ color: '#8B7866' }}>
                    {detail.grades.find(g => g.grade === 'psa10')!.count} sale{detail.grades.find(g => g.grade === 'psa10')!.count !== 1 ? 's' : ''} · 7d
                  </p>
                </>
              ) : (
                <p className="text-sm mt-1" style={{ color: '#6b7280' }}>—</p>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-4 mb-4">
          <div className="grid grid-cols-3 overflow-hidden" style={{ border: '2px solid #0A0A0A' }}>
            {TABS.map((tab, i, arr) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="py-2.5 text-xs font-black uppercase tracking-wide transition-all"
                style={{
                  background:  activeTab === tab.key ? '#0A0A0A' : '#FAF6EC',
                  color:       activeTab === tab.key ? '#FAF6EC' : '#0A0A0A',
                  borderRight: i < arr.length - 1 ? '2px solid #0A0A0A' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab: Price */}
        {activeTab === 'price' && (
          <div className="px-4 space-y-4 mb-8">
            {/* Price history chart */}
            <div className="overflow-hidden" style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}>
              <div className="px-4 pt-4 pb-2 flex items-center justify-between" style={{ borderBottom: '2px solid #0A0A0A', background: '#FAF6EC' }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#0A0A0A' }}>PRICE HISTORY</p>
                <div className="flex gap-1">
                  {['7d', '30d', '90d'].map(t => (
                    <span
                      key={t}
                      className="text-[9px] font-black px-2 py-0.5"
                      style={t === '30d'
                        ? { background: '#F4D03F', border: '1.5px solid #0A0A0A', color: '#0A0A0A' }
                        : { color: '#8B7866' }
                      }
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-4" style={{ background: '#FAF6EC' }}>
                {detailLoading ? (
                  <div className="h-40 rounded animate-pulse" style={{ background: '#e0dbd0' }} />
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d4cfc5" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#8B7866', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis yAxisId="price" tick={{ fill: '#8B7866', fontSize: 9 }} tickLine={false} axisLine={false} width={52} tickFormatter={v => countryCode === 'UAE' ? (v >= 1000 ? `AED${(v/1000).toFixed(1)}k` : `AED${v}`) : (v >= 1000 ? `₹${(v/1000).toFixed(1)}k` : `₹${v}`)} />
                      <YAxis yAxisId="vol" orientation="right" tick={{ fill: '#c4bfb5', fontSize: 8 }} tickLine={false} axisLine={false} width={18} />
                      <Tooltip content={<CustomTooltip fmt={displayFmt} />} />
                      <Bar yAxisId="vol" dataKey="volume" name="volume" fill="#e0dbd0" radius={[2, 2, 0, 0]} barSize={8} />
                      <Line yAxisId="price" type="monotone" dataKey="local" name="local" stroke="#E8233B" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#E8233B', stroke: '#FAF6EC', strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-32 flex items-center justify-center">
                    <p className="text-sm" style={{ color: '#8B7866' }}>No price history available yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Price by condition */}
            <div className="overflow-hidden" style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}>
              <div className="px-4 py-3" style={{ borderBottom: '2px solid #0A0A0A', background: '#FAF6EC' }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#0A0A0A' }}>PRICE BY CONDITION</p>
              </div>
              <div style={{ background: '#FAF6EC' }}>
                {detailLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-8 rounded animate-pulse" style={{ background: '#e0dbd0' }} />)}
                  </div>
                ) : detail?.conditions.length ? (
                  detail.conditions.map((c, i, arr) => (
                    <div
                      key={c.condition}
                      className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: i < arr.length - 1 ? '1.5px solid #e0dbd0' : 'none' }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-5 rounded-sm" style={{ background: i === 0 ? '#E8233B' : i === 1 ? '#F4D03F' : '#0A0A0A' }} />
                        <span className="text-sm font-bold" style={{ color: '#0A0A0A' }}>{c.condition}</span>
                      </div>
                      <span className="font-black text-sm" style={{ color: '#E8233B' }}>
                        {displayFmt(c.usd * localRate)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-4 text-sm" style={{ color: '#8B7866' }}>No condition pricing available</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Graded */}
        {activeTab === 'graded' && (
          <div className="px-4 mb-8">
            <div className="overflow-hidden" style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}>
              <div className="px-4 py-3" style={{ borderBottom: '2px solid #0A0A0A', background: '#FAF6EC' }}>
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#0A0A0A' }}>GRADED CARD PRICES</p>
                <p className="text-[9px] mt-0.5" style={{ color: '#8B7866' }}>Smart Market Price = weighted recent sales average</p>
              </div>
              <div style={{ background: '#FAF6EC' }}>
                {detailLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 rounded animate-pulse" style={{ background: '#e0dbd0' }} />)}
                  </div>
                ) : detail?.grades.length ? (
                  <div>
                    <div
                      className="grid grid-cols-4 px-4 py-2 text-[9px] font-black uppercase tracking-widest"
                      style={{ borderBottom: '1.5px solid #e0dbd0', color: '#8B7866' }}
                    >
                      <span>Grade</span>
                      <span className="text-right">USD</span>
                      <span className="text-right">{currencyLabel}</span>
                      <span className="text-right">Sales</span>
                    </div>
                    {detail.grades.map((g, i, arr) => (
                      <div
                        key={g.grade}
                        className="grid grid-cols-4 items-center px-4 py-3"
                        style={{
                          borderBottom: i < arr.length - 1 ? '1.5px solid #e0dbd0' : 'none',
                          background: g.grade === 'psa10' ? '#fff8e6' : '#FAF6EC',
                        }}
                      >
                        <span className="font-black text-xs" style={{ color: g.grade === 'psa10' ? '#E8233B' : '#0A0A0A' }}>{g.label}</span>
                        <span className="text-right text-xs font-bold" style={{ color: '#8B7866' }}>{fmtUSD(g.smartPrice)}</span>
                        <span className="text-right text-xs font-black" style={{ color: g.grade === 'psa10' ? '#E8233B' : '#0A0A0A' }}>
                          {displayFmt(Math.round(g.smartPrice * localRate))}
                        </span>
                        <span className="text-right text-xs" style={{ color: '#8B7866' }}>{g.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-sm text-center" style={{ color: '#8B7866' }}>No PSA grading data found.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Details */}
        {activeTab === 'details' && (
          <div className="px-4 mb-8 space-y-4">
            {/* Stats */}
            {(card.hp || card.stage || card.retreat_cost || card.artist) && (
              <div className="overflow-hidden" style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}>
                <div className="px-4 py-3" style={{ borderBottom: '2px solid #0A0A0A', background: '#FAF6EC' }}>
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#0A0A0A' }}>CARD STATS</p>
                </div>
                <div className="grid grid-cols-2" style={{ background: '#FAF6EC' }}>
                  {[
                    card.hp      && { label: 'HP',      value: card.hp },
                    card.stage   && { label: 'Stage',   value: card.stage },
                    card.retreat_cost && { label: 'Retreat', value: retreatStars(card.retreat_cost) },
                    card.artist  && { label: 'Artist',  value: card.artist },
                  ].filter(Boolean).map((stat, i, arr) => (
                    <div
                      key={(stat as {label:string}).label}
                      className="p-4"
                      style={{
                        borderRight: i % 2 === 0 ? '1.5px solid #e0dbd0' : 'none',
                        borderBottom: i < arr.length - 2 ? '1.5px solid #e0dbd0' : 'none',
                      }}
                    >
                      <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: '#8B7866' }}>{(stat as {label:string}).label}</p>
                      <p className="font-black text-sm" style={{ color: '#0A0A0A' }}>{(stat as {value:string}).value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attacks */}
            {card.attacks && card.attacks.length > 0 && (
              <div className="overflow-hidden" style={{ border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A' }}>
                <div className="px-4 py-3" style={{ borderBottom: '2px solid #0A0A0A', background: '#FAF6EC' }}>
                  <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#0A0A0A' }}>ATTACKS</p>
                </div>
                <div style={{ background: '#FAF6EC' }}>
                  {card.attacks.map((atk, i, arr) => (
                    <div
                      key={i}
                      className="px-4 py-3"
                      style={{ borderBottom: i < arr.length - 1 ? '1.5px solid #e0dbd0' : 'none' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm" style={{ color: '#0A0A0A' }}>{atk.name}</span>
                        {atk.damage && <span className="font-black text-sm" style={{ color: '#E8233B' }}>{atk.damage}</span>}
                      </div>
                      {atk.text && <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8B7866' }}>{atk.text}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flavor text */}
            {card.flavor_text && (
              <div className="p-4" style={{ border: '2px solid #0A0A0A', background: '#FAF6EC', boxShadow: '4px 4px 0 #0A0A0A' }}>
                <p className="text-xs italic leading-relaxed" style={{ color: '#8B7866' }}>&ldquo;{card.flavor_text}&rdquo;</p>
              </div>
            )}

            {/* TCGPlayer */}
            {card.tcgplayer_url && (
              <a
                href={card.tcgplayer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 font-black text-sm"
                style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', color: '#0A0A0A' }}
              >
                View on TCGPlayer ↗
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

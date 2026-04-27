'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { convertINRToLocal, formatPrice, COUNTRIES } from '@/lib/currency'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  username: string
  avatar_url: string | null
  city: string | null
  country_code: string
  bio: string | null
  roles: string[] | null
  trade_rating: number | null
  created_at: string
}

interface Stats {
  card_count: number
  collection_value_local: number
  trade_count: number
  avg_rating: number | null
  badge_metrics: {
    foil_count: number
    graded_count: number
    psa10_count: number
    scanned_count: number
    max_card_value_local: number
    rare_card_count: number
    sets_with_10_count: number
  }
}

interface PreviewCard {
  id: string
  condition: string | null
  is_foil: boolean
  cards: { id: string; name: string; image_url: string | null } | null
}

interface BadgeStage {
  key: string
  label: string
  target: number
  text: string
  complete: boolean
}

interface BadgeProgress {
  id: string
  name: string
  icon: string
  level: string
  current: number
  nextTarget: number | null
  progress: number
  sub: string
  stages: BadgeStage[]
}

interface BadgeUnlock {
  badgeName: string
  level: string
  text: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }

const CITIES: Record<string, string[]> = {
  IN:  ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Other'],
  UAE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Other'],
}

const COUNTRY_OPTIONS = [
  { code: 'IN',  flag: '🇮🇳', name: 'India' },
  { code: 'UAE', flag: '🇦🇪', name: 'UAE'   },
]

const BADGE_ART: Record<string, {
  watermark: string
  stamp: string
  pattern: string
  motif: string
  accent: string
}> = {
  deal_maker: {
    watermark: 'DONE DEAL',
    stamp: 'SEALED',
    pattern: 'linear-gradient(135deg, rgba(10,10,10,0.09) 0 2px, transparent 2px 16px), linear-gradient(45deg, rgba(232,35,59,0.08) 0 2px, transparent 2px 18px)',
    motif: '<>',
    accent: '#E8233B',
  },
  foil_hunter: {
    watermark: 'SHINY CHASE',
    stamp: 'HOLO',
    pattern: 'repeating-linear-gradient(115deg, rgba(244,208,63,0.42) 0 5px, rgba(250,246,236,0) 5px 14px, rgba(232,35,59,0.13) 14px 18px, rgba(250,246,236,0) 18px 28px)',
    motif: '*',
    accent: '#F4D03F',
  },
  high_roller: {
    watermark: 'BIG STACKS',
    stamp: 'VALUE',
    pattern: 'radial-gradient(circle at 18% 24%, transparent 0 15px, rgba(10,10,10,0.12) 16px 18px, transparent 19px), radial-gradient(circle at 82% 72%, transparent 0 20px, rgba(232,35,59,0.11) 21px 23px, transparent 24px)',
    motif: '$',
    accent: '#E8233B',
  },
  set_collector: {
    watermark: 'FULL SET',
    stamp: 'BINDER',
    pattern: 'linear-gradient(rgba(10,10,10,0.1) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(10,10,10,0.1) 1.5px, transparent 1.5px)',
    motif: '[]',
    accent: '#F4D03F',
  },
  rare_taste: {
    watermark: 'RARE AIR',
    stamp: 'CHASE',
    pattern: 'radial-gradient(circle at 24% 34%, rgba(232,35,59,0.13) 0 3px, transparent 4px), radial-gradient(circle at 72% 28%, rgba(244,208,63,0.36) 0 4px, transparent 5px), radial-gradient(circle at 58% 78%, rgba(10,10,10,0.1) 0 3px, transparent 4px)',
    motif: '<>',
    accent: '#E8233B',
  },
  slab_master: {
    watermark: 'LOCKED IN',
    stamp: 'GRADED',
    pattern: 'linear-gradient(90deg, rgba(10,10,10,0.13) 0 2px, transparent 2px 52px), linear-gradient(rgba(10,10,10,0.12) 0 2px, transparent 2px 40px)',
    motif: '10',
    accent: '#F4D03F',
  },
  sharp_eye: {
    watermark: 'SCAN MODE',
    stamp: 'FOCUS',
    pattern: 'linear-gradient(90deg, rgba(232,35,59,0.18) 0 2px, transparent 2px 24px), linear-gradient(rgba(10,10,10,0.1) 0 2px, transparent 2px 24px)',
    motif: '[]',
    accent: '#E8233B',
  },
}

// ─── Badge helpers ───────────────────────────────────────────────────────────

function buildCountBadge(
  id: string,
  name: string,
  icon: string,
  current: number,
  unit: string,
  stages: Array<{ key: string; label: string; target: number; text: string }>,
): BadgeProgress {
  const completeCount = stages.filter(s => current >= s.target).length
  const next = stages[completeCount] ?? null
  return {
    id,
    name,
    icon,
    level: completeCount > 0 ? stages[completeCount - 1].label : 'Locked',
    current,
    nextTarget: next?.target ?? null,
    progress: next ? Math.min(100, Math.round((current / next.target) * 100)) : 100,
    sub: next ? `${current.toLocaleString('en-IN')} / ${next.target.toLocaleString('en-IN')} ${unit}` : `${current.toLocaleString('en-IN')} ${unit}`,
    stages: stages.map(s => ({ ...s, complete: current >= s.target })),
  }
}

function buildValueBadge(stats: Stats, countryCode: string): BadgeProgress {
  const stageFromInr = (targetInr: number, plus = false) => {
    const target = convertINRToLocal(targetInr, countryCode)
    return {
      target,
      text: `${formatPrice(target, countryCode)}${plus ? '+' : ''} collection`,
    }
  }
  const stages = [
    { key: 'bronze', label: 'Bronze', ...stageFromInr(10_000) },
    { key: 'silver', label: 'Silver', ...stageFromInr(50_000) },
    { key: 'gold', label: 'Gold', ...stageFromInr(100_000) },
    { key: 'platinum', label: 'Platinum', ...stageFromInr(500_000) },
    { key: 'diamond', label: 'Diamond', ...stageFromInr(1_000_000, true) },
  ]
  const current = stats.collection_value_local
  const completeCount = stages.filter(s => current >= s.target).length
  const next = stages[completeCount] ?? null
  return {
    id: 'high_roller',
    name: 'High Roller',
    icon: countryCode === 'UAE' ? 'AED' : '₹',
    level: completeCount > 0 ? stages[completeCount - 1].label : 'Locked',
    current,
    nextTarget: next?.target ?? null,
    progress: next ? Math.min(100, Math.round((current / next.target) * 100)) : 100,
    sub: next ? `${formatPrice(current, countryCode)} / ${formatPrice(next.target, countryCode)}` : formatPrice(current, countryCode),
    stages: stages.map(s => ({ ...s, complete: current >= s.target })),
  }
}

function buildSlabBadge(stats: Stats): BadgeProgress {
  const graded = stats.badge_metrics.graded_count
  const psa10 = stats.badge_metrics.psa10_count
  const stages = [
    { key: 'bronze', label: 'Bronze', target: 1, text: 'First graded card', complete: graded >= 1 },
    { key: 'silver', label: 'Silver', target: 5, text: '5 graded cards', complete: graded >= 5 },
    { key: 'gold', label: 'Gold', target: 10, text: '10 graded cards', complete: graded >= 10 },
    { key: 'platinum', label: 'Platinum', target: 1, text: 'PSA 10 owner', complete: psa10 >= 1 },
    { key: 'diamond', label: 'Diamond', target: 5, text: '5+ PSA 10s', complete: psa10 >= 5 },
  ]
  const completeCount = stages.filter(s => s.complete).length
  const next = stages.find(s => !s.complete) ?? null
  const current = next?.key === 'platinum' || next?.key === 'diamond' ? psa10 : graded
  return {
    id: 'slab_master',
    name: 'Slab Master',
    icon: 'SLAB',
    level: completeCount > 0 ? stages.filter(s => s.complete).at(-1)!.label : 'Locked',
    current,
    nextTarget: next?.target ?? null,
    progress: next ? Math.min(100, Math.round((current / next.target) * 100)) : 100,
    sub: next ? `${current.toLocaleString('en-IN')} / ${next.target.toLocaleString('en-IN')} ${next.key.includes('diamond') || next.key.includes('platinum') ? 'PSA 10s' : 'graded'}` : `${graded} graded · ${psa10} PSA 10`,
    stages,
  }
}

function buildBadges(stats: Stats, countryCode: string): BadgeProgress[] {
  return [
    buildCountBadge('deal_maker', 'Deal Maker', 'DEAL', stats.trade_count, 'trades', [
      { key: 'bronze', label: 'Bronze', target: 1, text: 'First trade' },
      { key: 'silver', label: 'Silver', target: 10, text: '10 trades' },
      { key: 'gold', label: 'Gold', target: 50, text: '50 trades' },
      { key: 'platinum', label: 'Platinum', target: 100, text: '100 trades' },
      { key: 'diamond', label: 'Diamond', target: 500, text: '500 trades' },
    ]),
    buildCountBadge('foil_hunter', 'Foil Hunter', 'FOIL', stats.badge_metrics.foil_count, 'foil cards', [
      { key: 'bronze', label: 'Bronze', target: 5, text: '5 foil cards' },
      { key: 'silver', label: 'Silver', target: 20, text: '20 foil cards' },
      { key: 'gold', label: 'Gold', target: 50, text: '50 foil cards' },
      { key: 'platinum', label: 'Platinum', target: 100, text: '100 foil cards' },
      { key: 'diamond', label: 'Diamond', target: 200, text: '200 foil cards' },
    ]),
    buildValueBadge(stats, countryCode),
    buildCountBadge('set_collector', 'Set Collector', 'SET', stats.badge_metrics.sets_with_10_count, 'sets with 10+ cards', [
      { key: 'bronze', label: 'Level 1', target: 1, text: '1 set with 10+ cards' },
      { key: 'silver', label: 'Level 2', target: 3, text: '3 sets with 10+ cards' },
      { key: 'gold', label: 'Level 3', target: 5, text: '5 sets with 10+ cards' },
      { key: 'platinum', label: 'Level 4', target: 10, text: '10 sets with 10+ cards' },
    ]),
    buildCountBadge('rare_taste', 'Rare Taste', 'RARE', stats.badge_metrics.rare_card_count, 'cards worth 10k+', [
      { key: 'bronze', label: 'One Rare', target: 1, text: 'One card worth 10k+' },
      { key: 'silver', label: 'Three Rares', target: 3, text: 'Three cards worth 10k+' },
      { key: 'gold', label: 'Ten Rares', target: 10, text: 'Ten cards worth 10k+' },
      { key: 'platinum', label: 'Twenty Rares', target: 20, text: 'Twenty cards worth 10k+' },
    ]),
    buildSlabBadge(stats),
    buildCountBadge('sharp_eye', 'Sharp Eye', 'SCAN', stats.badge_metrics.scanned_count, 'scanned cards', [
      { key: 'bronze', label: 'Bronze', target: 25, text: '25 scanned cards' },
      { key: 'silver', label: 'Silver', target: 50, text: '50 scanned cards' },
      { key: 'gold', label: 'Gold', target: 100, text: '100 scanned cards' },
    ]),
  ]
}

function BadgeIcon({
  badgeId,
  fallback,
  unlocked,
  accent,
}: {
  badgeId: string
  fallback: string
  unlocked: boolean
  accent: string
}) {
  const iconBg = unlocked ? '#F4D03F' : '#FAF6EC'
  const muted = unlocked ? '#0A0A0A' : '#8B7866'
  const red = unlocked ? '#E8233B' : '#8B7866'

  const icon = (() => {
    switch (badgeId) {
      case 'deal_maker':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            <rect x="9" y="14" width="21" height="29" fill="#FAF6EC" stroke={muted} strokeWidth="4" />
            <rect x="34" y="21" width="21" height="29" fill="#FAF6EC" stroke={muted} strokeWidth="4" />
            <path d="M22 45 L30 53 L43 40" fill="none" stroke={red} strokeWidth="5" strokeLinecap="square" strokeLinejoin="miter" />
            <path d="M18 26 H28 M36 33 H48" stroke={muted} strokeWidth="4" strokeLinecap="square" />
          </svg>
        )
      case 'foil_hunter':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            <rect x="16" y="9" width="32" height="46" fill="#FAF6EC" stroke={muted} strokeWidth="4" />
            <path d="M22 48 L43 15 M18 35 L34 11 M32 53 L48 28" stroke={accent} strokeWidth="4" strokeLinecap="square" />
            <path d="M48 8 L51 16 L59 19 L51 22 L48 30 L45 22 L37 19 L45 16 Z" fill={red} />
            <path d="M13 11 L15 16 L20 18 L15 20 L13 25 L11 20 L6 18 L11 16 Z" fill={muted} />
          </svg>
        )
      case 'high_roller':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            <ellipse cx="32" cy="16" rx="18" ry="8" fill="#FAF6EC" stroke={muted} strokeWidth="4" />
            <path d="M14 16 V42 C14 46 22 51 32 51 C42 51 50 46 50 42 V16" fill="#FAF6EC" stroke={muted} strokeWidth="4" />
            <path d="M14 29 C14 34 22 38 32 38 C42 38 50 34 50 29" fill="none" stroke={muted} strokeWidth="4" />
            <text x="32" y="32" textAnchor="middle" dominantBaseline="middle" fontSize={fallback.length > 2 ? '10' : '18'} fontWeight="900" fill={red}>{fallback}</text>
          </svg>
        )
      case 'set_collector':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            {[10, 28].map((x, ix) => [9, 31].map((y, iy) => (
              <rect key={`${ix}-${iy}`} x={x} y={y} width="16" height="20" fill="#FAF6EC" stroke={muted} strokeWidth="3" />
            )))}
            <path d="M43 47 L49 53 L58 39" fill="none" stroke={red} strokeWidth="5" strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        )
      case 'rare_taste':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            <path d="M32 7 L54 24 L32 57 L10 24 Z" fill="#FAF6EC" stroke={muted} strokeWidth="4" strokeLinejoin="miter" />
            <path d="M18 24 H46 M24 15 L32 57 M40 15 L32 57" stroke={red} strokeWidth="3" />
            <path d="M50 7 L52 13 L58 15 L52 17 L50 23 L48 17 L42 15 L48 13 Z" fill={accent} stroke={muted} strokeWidth="2" />
          </svg>
        )
      case 'slab_master':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            <rect x="13" y="6" width="38" height="52" fill="#FAF6EC" stroke={muted} strokeWidth="4" />
            <rect x="18" y="12" width="28" height="10" fill={accent} stroke={muted} strokeWidth="3" />
            <rect x="21" y="27" width="22" height="24" fill="#FAF6EC" stroke={muted} strokeWidth="3" />
            <text x="32" y="19" textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="900" fill={muted}>10</text>
          </svg>
        )
      case 'sharp_eye':
        return (
          <svg viewBox="0 0 64 64" aria-hidden style={{ width: 42, height: 42, display: 'block' }}>
            <path d="M12 24 V12 H24 M40 12 H52 V24 M52 40 V52 H40 M24 52 H12 V40" fill="none" stroke={muted} strokeWidth="5" strokeLinecap="square" />
            <circle cx="32" cy="32" r="12" fill="#FAF6EC" stroke={red} strokeWidth="4" />
            <path d="M32 18 V26 M32 38 V46 M18 32 H26 M38 32 H46" stroke={muted} strokeWidth="4" strokeLinecap="square" />
          </svg>
        )
      default:
        return <span style={{ color: muted, fontWeight: 900, fontSize: fallback.length > 2 ? 9 : 18 }}>{fallback}</span>
    }
  })()

  return (
    <div style={{ position: 'relative', width: 66, height: 66, flexShrink: 0 }}>
      <div style={{
        position: 'absolute',
        inset: '6px 0 0 6px',
        background: '#0A0A0A',
      }} />
      <div style={{
        position: 'relative',
        width: 60,
        height: 60,
        background: iconBg,
        border: '3px solid #0A0A0A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          position: 'absolute',
          inset: 5,
          border: `1.5px solid ${unlocked ? 'rgba(10,10,10,0.35)' : 'rgba(139,120,102,0.35)'}`,
          pointerEvents: 'none',
        }} />
        {icon}
      </div>
    </div>
  )
}

function BadgeWatermark({
  badgeId,
  art,
  unlocked,
}: {
  badgeId: string
  art: typeof BADGE_ART[string]
  unlocked: boolean
}) {
  const ink = unlocked ? art.accent : '#8B7866'
  const black = '#0A0A0A'
  const yellow = '#F4D03F'
  const words = art.watermark.split(' ')

  const motif = (() => {
    switch (badgeId) {
      case 'deal_maker':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            <rect x="30" y="30" width="42" height="58" fill="none" stroke={black} strokeWidth="8" />
            <rect x="108" y="42" width="42" height="58" fill="none" stroke={ink} strokeWidth="8" />
            <path d="M74 46 H109 L99 35 M106 84 H71 L81 95" fill="none" stroke={black} strokeWidth="8" strokeLinecap="square" strokeLinejoin="miter" />
            <path d="M61 76 L78 93 L113 59" fill="none" stroke={ink} strokeWidth="8" strokeLinecap="square" strokeLinejoin="miter" />
          </svg>
        )
      case 'foil_hunter':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            <rect x="48" y="18" width="66" height="92" fill="none" stroke={black} strokeWidth="8" />
            <path d="M57 100 L107 27 M45 74 L83 18 M80 112 L123 52" stroke={yellow} strokeWidth="7" strokeLinecap="square" />
            <path d="M130 12 L139 36 L164 45 L139 54 L130 78 L121 54 L96 45 L121 36 Z" fill={ink} />
            <path d="M34 24 L39 38 L54 43 L39 48 L34 62 L29 48 L14 43 L29 38 Z" fill={black} />
          </svg>
        )
      case 'high_roller':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            <ellipse cx="91" cy="32" rx="47" ry="17" fill="none" stroke={ink} strokeWidth="9" />
            <path d="M44 32 V89 C44 104 65 116 91 116 C117 116 138 104 138 89 V32" fill="none" stroke={black} strokeWidth="8" />
            <path d="M44 61 C44 76 65 88 91 88 C117 88 138 76 138 61" fill="none" stroke={ink} strokeWidth="8" />
          </svg>
        )
      case 'set_collector':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            {[25, 62, 99, 136].map(x => <path key={x} d={`M${x} 7 V123`} stroke={black} strokeWidth="4" />)}
            {[20, 56, 92].map(y => <path key={y} d={`M16 ${y} H164`} stroke={black} strokeWidth="4" />)}
            <rect x="28" y="23" width="35" height="52" fill="none" stroke={ink} strokeWidth="7" />
            <rect x="73" y="23" width="35" height="52" fill="none" stroke={ink} strokeWidth="7" />
            <rect x="118" y="23" width="35" height="52" fill="none" stroke={ink} strokeWidth="7" />
          </svg>
        )
      case 'rare_taste':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            <path d="M91 13 L155 61 L91 119 L27 61 Z" fill="none" stroke={ink} strokeWidth="9" strokeLinejoin="miter" />
            <path d="M48 61 H134 M69 31 L91 119 M113 31 L91 119" stroke={black} strokeWidth="6" />
            <path d="M30 13 L38 34 L61 42 L38 50 L30 72 L22 50 L0 42 L22 34 Z" fill={yellow} />
          </svg>
        )
      case 'slab_master':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            <rect x="50" y="8" width="78" height="114" fill="none" stroke={black} strokeWidth="9" />
            <rect x="63" y="22" width="52" height="22" fill="none" stroke={ink} strokeWidth="7" />
            <rect x="67" y="59" width="44" height="48" fill="none" stroke={black} strokeWidth="7" />
          </svg>
        )
      case 'sharp_eye':
        return (
          <svg viewBox="0 0 180 130" aria-hidden style={{ width: 190, height: 136, display: 'block' }}>
            <path d="M33 48 V17 H64 M116 17 H147 V48 M147 82 V113 H116 M64 113 H33 V82" fill="none" stroke={ink} strokeWidth="10" strokeLinecap="square" />
            <circle cx="90" cy="65" r="30" fill="none" stroke={black} strokeWidth="8" />
            <path d="M90 23 V53 M90 77 V107 M48 65 H78 M102 65 H132" stroke={ink} strokeWidth="7" />
          </svg>
        )
      default:
        return null
    }
  })()

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 112,
        background: unlocked ? 'rgba(244,208,63,0.2)' : 'rgba(139,120,102,0.08)',
        borderLeft: '2px solid rgba(10,10,10,0.08)',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        right: -52,
        top: 10,
        opacity: unlocked ? 0.11 : 0.07,
        transform: 'rotate(-8deg) scale(0.72)',
        transformOrigin: 'center',
      }}>
        {motif}
      </div>
      <div style={{
        position: 'absolute',
        right: 8,
        bottom: 10,
        width: 94,
        color: ink,
        opacity: unlocked ? 0.5 : 0.32,
        transform: 'rotate(-4deg)',
        textAlign: 'right',
        fontFamily: 'var(--font-poppins), Poppins, Arial, sans-serif',
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 0.96,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {words.map(word => (
          <span key={word} style={{ display: 'block' }}>{word}</span>
        ))}
      </div>
    </div>
  )
}

function ProfileStatIcon({ type, active }: { type: 'cards' | 'value' | 'trades' | 'rating'; active?: boolean }) {
  const accent = active ? '#E8233B' : '#F4D03F'
  const cream = '#FAF6EC'
  const muted = '#8B7866'

  switch (type) {
    case 'cards':
      return (
        <svg viewBox="0 0 32 32" aria-hidden style={{ width: 24, height: 24, margin: '0 auto 5px', display: 'block' }}>
          <rect x="7" y="5" width="13" height="19" fill="none" stroke={cream} strokeWidth="3" />
          <rect x="12" y="8" width="13" height="19" fill="none" stroke={accent} strokeWidth="3" />
        </svg>
      )
    case 'value':
      return (
        <svg viewBox="0 0 32 32" aria-hidden style={{ width: 24, height: 24, margin: '0 auto 5px', display: 'block' }}>
          <ellipse cx="16" cy="8" rx="9" ry="4" fill="none" stroke={accent} strokeWidth="3" />
          <path d="M7 8 V22 C7 25 11 28 16 28 C21 28 25 25 25 22 V8" fill="none" stroke={cream} strokeWidth="3" />
          <path d="M7 15 C7 18 11 20 16 20 C21 20 25 18 25 15" fill="none" stroke={muted} strokeWidth="2.5" />
        </svg>
      )
    case 'trades':
      return (
        <svg viewBox="0 0 32 32" aria-hidden style={{ width: 24, height: 24, margin: '0 auto 5px', display: 'block' }}>
          <path d="M6 11 H23 L18 6 M26 21 H9 L14 26" fill="none" stroke={cream} strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
          <path d="M6 21 H14 M18 11 H26" stroke={accent} strokeWidth="3" strokeLinecap="square" />
        </svg>
      )
    case 'rating':
      return (
        <svg viewBox="0 0 32 32" aria-hidden style={{ width: 24, height: 24, margin: '0 auto 5px', display: 'block' }}>
          <path d="M16 4 L19.5 12 L28 12.8 L21.5 18.3 L23.5 27 L16 22.5 L8.5 27 L10.5 18.3 L4 12.8 L12.5 12 Z" fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="miter" />
        </svg>
      )
  }
}

function BadgeCard({ badge }: { badge: BadgeProgress }) {
  const unlocked = badge.stages.some(s => s.complete)
  const art = BADGE_ART[badge.id] ?? {
    watermark: badge.name.toUpperCase(),
    stamp: 'BADGE',
    pattern: 'linear-gradient(135deg, rgba(10,10,10,0.08) 0 2px, transparent 2px 18px)',
    motif: '*',
    accent: '#E8233B',
  }

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      background: unlocked ? '#FAF6EC' : '#f3ede0',
      border: '2px solid #0A0A0A',
      boxShadow: unlocked ? '4px 4px 0 #0A0A0A' : '2px 2px 0 rgba(10,10,10,0.35)',
      opacity: unlocked ? 1 : 0.76,
      padding: 14,
      paddingRight: 102,
      minHeight: 158,
      isolation: 'isolate',
    }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: art.pattern,
          backgroundSize: badge.id === 'set_collector' ? '34px 44px' : undefined,
          opacity: badge.id === 'foil_hunter'
            ? (unlocked ? 0.1 : 0.05)
            : (unlocked ? 0.05 : 0.025),
          zIndex: 0,
        }}
      />
      <BadgeWatermark badgeId={badge.id} art={art} unlocked={unlocked} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <BadgeIcon badgeId={badge.id} fallback={badge.icon} unlocked={unlocked} accent={art.accent} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, margin: 0, lineHeight: 1.05 }}>{badge.name}</p>
            <span style={{
              background: unlocked ? '#E8233B' : '#FAF6EC',
              color: unlocked ? '#FAF6EC' : '#8B7866',
              border: '1.5px solid #0A0A0A',
              boxShadow: unlocked ? '2px 2px 0 #0A0A0A' : 'none',
              fontSize: 9,
              fontWeight: 900,
              padding: '2px 6px',
              whiteSpace: 'nowrap',
            }}>
              {badge.level}
            </span>
          </div>
          <p style={{ color: '#8B7866', fontSize: 11, margin: '7px 0 10px', fontWeight: 900 }}>{badge.sub}</p>
          <div style={{ height: 10, background: '#FAF6EC', border: '1.5px solid #0A0A0A', overflow: 'hidden', boxShadow: '2px 2px 0 rgba(10,10,10,0.18)', maxWidth: 230 }}>
            <div style={{ width: `${badge.progress}%`, height: '100%', background: unlocked ? art.accent : '#8B7866' }} />
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, paddingLeft: 78 } as React.CSSProperties}>
        {badge.stages.map(stage => (
          <span
            key={stage.key}
            title={stage.text}
            style={{
              flexShrink: 0,
              background: stage.complete ? '#0A0A0A' : '#FAF6EC',
              color: stage.complete ? '#FAF6EC' : '#8B7866',
              border: '1.5px solid #0A0A0A',
              boxShadow: stage.complete ? '2px 2px 0 rgba(10,10,10,0.22)' : 'none',
              fontWeight: 900,
              fontSize: 8,
              padding: '2px 6px',
              textTransform: 'uppercase',
            }}
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function BadgeUnlockModal({ unlock, onClose }: { unlock: BadgeUnlock; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.65)', zIndex: 60 }} />
      <div style={{ position: 'fixed', left: 16, right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 61, maxWidth: 420, margin: '0 auto', background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '6px 6px 0 #0A0A0A', padding: 22, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 14px', background: '#F4D03F', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 24 }}>
          ✓
        </div>
        <p style={{ color: '#8B7866', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Badge unlocked</p>
        <h2 style={{ color: '#0A0A0A', fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>{unlock.badgeName}</h2>
        <p style={{ color: '#E8233B', fontSize: 14, fontWeight: 900, margin: '0 0 6px' }}>{unlock.level}</p>
        <p style={{ color: '#8B7866', fontSize: 13, margin: '0 0 18px' }}>{unlock.text}</p>
        <button onClick={onClose} style={{ width: '100%', background: '#E8233B', color: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #0A0A0A', padding: '12px 0', fontWeight: 900, cursor: 'pointer' }}>
          Nice
        </button>
      </div>
    </>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile
  onClose: () => void
  onSaved: (updated: Partial<Profile>) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [username,      setUsername]      = useState(profile.username)
  const [bio,           setBio]           = useState(profile.bio ?? '')
  const [country,       setCountry]       = useState(profile.country_code)
  const [city,          setCity]          = useState(profile.city ?? '')
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  function handleCountryChange(code: string) {
    setCountry(code)
    setCity('')
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    if (!username.trim()) { setError('Username is required'); return }
    if (!city) { setError('Please select a city'); return }
    setSaving(true)
    setError(null)

    try {
      let avatarUrl = profile.avatar_url

      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop()
        const path = `${profile.id}-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (uploadErr) throw uploadErr
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = publicUrl
      }

      const payload = {
        username:     username.trim(),
        bio:          bio.trim() || null,
        city,
        country_code: country,
        avatar_url:   avatarUrl,
      }

      const { error: updateErr } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', profile.id)

      if (updateErr) throw updateErr

      onSaved({ ...payload, avatar_url: avatarUrl })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#FAF6EC', border: '2px solid #0A0A0A',
    color: '#0A0A0A', fontSize: 14, padding: '10px 14px',
    outline: 'none',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.65)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', inset: '0 16px', top: '50%', transform: 'translateY(-50%)',
        zIndex: 50, maxWidth: 440, margin: '0 auto',
        background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '2px solid #0A0A0A', flexShrink: 0 }}>
          <h2 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 16, margin: 0 }}>Edit Profile</h2>
          <button onClick={onClose} style={{ background: '#0A0A0A', border: 'none', color: '#FAF6EC', width: 28, height: 28, cursor: 'pointer', fontWeight: 900, fontSize: 12 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ position: 'relative', width: 72, height: 72, border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A', overflow: 'hidden', cursor: 'pointer', background: '#F4D03F' }}
            >
              {(avatarPreview ?? profile.avatar_url) ? (
                <Image src={avatarPreview ?? profile.avatar_url!} alt="Avatar" fill className="object-cover" unoptimized />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900 }}>
                  {profile.username[0]?.toUpperCase()}
                </div>
              )}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                📷
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
          </div>

          {/* Username */}
          <div>
            <label style={{ display: 'block', color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} maxLength={30} style={inputStyle} />
          </div>

          {/* Bio */}
          <div>
            <label style={{ display: 'block', color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Bio</label>
            <textarea
              value={bio} onChange={e => setBio(e.target.value)} maxLength={160} rows={3}
              placeholder="Tell traders about yourself..."
              style={{ ...inputStyle, resize: 'none' } as React.CSSProperties}
            />
            <p style={{ textAlign: 'right', fontSize: 10, color: '#8B7866', margin: '4px 0 0' }}>{bio.length}/160</p>
          </div>

          {/* Country */}
          <div>
            <label style={{ display: 'block', color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Country</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {COUNTRY_OPTIONS.map(c => (
                <button
                  key={c.code}
                  onClick={() => handleCountryChange(c.code)}
                  style={{
                    flex: 1, padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: country === c.code ? '#F4D03F' : '#FAF6EC',
                    border: '2px solid #0A0A0A',
                    boxShadow: country === c.code ? '2px 2px 0 #0A0A0A' : 'none',
                    fontWeight: 800, fontSize: 13, cursor: 'pointer', color: '#0A0A0A',
                  }}
                >
                  <span>{c.flag}</span><span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          {country && (
            <div>
              <label style={{ display: 'block', color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>City</label>
              <select value={city} onChange={e => setCity(e.target.value)} style={{ ...inputStyle, appearance: 'none' } as React.CSSProperties}>
                <option value="">Select city…</option>
                {(CITIES[country] ?? []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {error && (
            <p style={{ color: '#E8233B', fontSize: 13, fontWeight: 700, padding: '8px 12px', border: '1.5px solid #E8233B', background: 'rgba(232,35,59,0.06)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '2px solid #0A0A0A', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', padding: '12px 0', background: '#E8233B', border: '2px solid #0A0A0A', boxShadow: saving ? 'none' : '3px 3px 0 #0A0A0A', color: '#FAF6EC', fontWeight: 900, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} style={{ width: '100%', padding: '10px 0', background: 'none', border: '2px solid #0A0A0A', color: '#0A0A0A', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse max-w-lg mx-auto">
      <div style={{ height: 120, background: '#e8e2d4' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -36, paddingBottom: 20, gap: 10 }}>
        <div style={{ width: 72, height: 72, background: '#e8e2d4', border: '2px solid #0A0A0A' }} />
        <div style={{ width: 120, height: 14, background: '#e8e2d4', borderRadius: 2 }} />
        <div style={{ width: 80, height: 10, background: '#e8e2d4', borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const { setCountryCode } = useCountry()

  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [stats,        setStats]        = useState<Stats | null>(null)
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([])
  const [loading,      setLoading]      = useState(true)
  const [editOpen,     setEditOpen]     = useState(false)
  const [badgeUnlock,  setBadgeUnlock]  = useState<BadgeUnlock | null>(null)

  const loadProfile = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const res = await fetch('/api/profile', { cache: 'no-store' })
    if (res.status === 401) { router.replace('/login'); return }
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    setProfile(data.profile)
    setStats(data.stats)
    setPreviewCards(data.preview_cards ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadProfile(true)
  }, [loadProfile])

  useEffect(() => {
    function handleFocus() {
      loadProfile()
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') loadProfile()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadProfile])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setCountryCode('IN')
    router.replace('/login')
  }

  function handleSaved(updated: Partial<Profile>) {
    setProfile(prev => prev ? { ...prev, ...updated } : prev)
    if (updated.country_code) setCountryCode(updated.country_code)
  }

  const badgeProgress = useMemo(() => {
    if (!stats || !profile) return []
    return buildBadges(stats, profile.country_code)
  }, [profile, stats])

  const achievedBadgeKeys = useMemo(() => (
    badgeProgress.flatMap(badge =>
      badge.stages
        .filter(stage => stage.complete)
        .map(stage => `${badge.id}:${stage.key}`)
    )
  ), [badgeProgress])

  useEffect(() => {
    if (!profile || badgeProgress.length === 0) return

    const storageKey = `pt_seen_badges_${profile.id}`
    const existing = window.localStorage.getItem(storageKey)

    if (!existing) {
      window.localStorage.setItem(storageKey, JSON.stringify(achievedBadgeKeys))
      return
    }

    let seen: string[] = []
    try { seen = JSON.parse(existing) as string[] } catch { seen = [] }

    const nextKey = achievedBadgeKeys.find(key => !seen.includes(key))
    if (!nextKey || badgeUnlock) return

    const [badgeId, stageKey] = nextKey.split(':')
    const badge = badgeProgress.find(b => b.id === badgeId)
    const stage = badge?.stages.find(s => s.key === stageKey)
    if (!badge || !stage) return

    setBadgeUnlock({ badgeName: badge.name, level: stage.label, text: stage.text })
  }, [achievedBadgeKeys, badgeProgress, badgeUnlock, profile])

  function closeBadgeUnlock() {
    if (profile) {
      window.localStorage.setItem(`pt_seen_badges_${profile.id}`, JSON.stringify(achievedBadgeKeys))
    }
    setBadgeUnlock(null)
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#FAF6EC' }}><ProfileSkeleton /></div>
  }

  if (!profile || !stats) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAF6EC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8B7866', fontSize: 14 }}>Failed to load profile.</p>
      </div>
    )
  }

  const countryCode   = profile.country_code
  const flag          = FLAGS[countryCode] ?? ''
  const collectionVal = formatPrice(stats.collection_value_local, countryCode)
  const ratingDisplay = stats.avg_rating != null ? stats.avg_rating.toFixed(1) : '—'
  const initials      = profile.username[0]?.toUpperCase() ?? '?'

  return (
    <main className="min-h-screen pb-28" style={{ background: '#FAF6EC' }}>
      <div className="max-w-lg mx-auto" style={{ minHeight: '100vh', background: '#FAF6EC' }}>

      {/* ── Header banner (diagonal stripe) ─────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <div style={{
          height: 120,
          background: '#E8233B',
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(244,208,63,0.55) 12px, rgba(244,208,63,0.55) 22px)',
        }} />

        {/* EDIT button */}
        <button
          onClick={() => setEditOpen(true)}
          style={{
            position:   'absolute',
            top:        12,
            right:      12,
            background: '#FAF6EC',
            border:     '2px solid #0A0A0A',
            boxShadow:  '2px 2px 0 #0A0A0A',
            color:      '#0A0A0A',
            fontWeight: 900,
            fontSize:   11,
            padding:    '5px 12px',
            cursor:     'pointer',
            letterSpacing: '0.05em',
          }}
        >
          EDIT
        </button>
      </div>

      {/* ── Avatar + name ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -40, paddingBottom: 16, paddingLeft: 16, paddingRight: 16 }}>
        <button onClick={() => setEditOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <div style={{
            width:      80,
            height:     80,
            background: '#F4D03F',
            border:     '3px solid #0A0A0A',
            boxShadow:  '3px 3px 0 #0A0A0A',
            overflow:   'hidden',
            position:   'relative',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.username} fill className="object-cover" unoptimized />
            ) : (
              <span style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 32 }}>{initials}</span>
            )}
          </div>
        </button>

        <h1 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 22, margin: '12px 0 4px', letterSpacing: '-0.02em' }}>
          {profile.username}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            background: '#F4D03F', color: '#0A0A0A', border: '1.5px solid #0A0A0A',
            fontSize: 9, fontWeight: 900, padding: '2px 7px', letterSpacing: '0.05em',
          }}>
            PRO
          </span>
          {flag && <span style={{ fontSize: 16 }}>{flag}</span>}
          {(profile.city || COUNTRIES[countryCode]?.name) && (
            <span style={{ color: '#8B7866', fontSize: 13 }}>
              {[profile.city, COUNTRIES[countryCode]?.name].filter(Boolean).join(', ')}
            </span>
          )}
        </div>

      </div>

      {/* ── Stats grid ───────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '2px solid #0A0A0A', overflow: 'hidden' }}>
          {[
            { label: 'CARDS',  value: stats.card_count.toLocaleString(), icon: 'cards' as const },
            { label: 'VALUE',  value: collectionVal, red: true, icon: 'value' as const },
            { label: 'TRADES', value: stats.trade_count.toLocaleString(), icon: 'trades' as const },
            { label: 'RATING', value: `${ratingDisplay}`, icon: 'rating' as const },
          ].map((s, i, arr) => (
            <div
              key={s.label}
              style={{
                padding:     '10px 6px',
                textAlign:   'center',
                background:  '#0A0A0A',
                borderRight: i < arr.length - 1 ? '2px solid #FAF6EC' : 'none',
              }}
            >
              <ProfileStatIcon type={s.icon} active={s.red} />
              <p style={{ color: s.red ? '#E8233B' : '#FAF6EC', fontWeight: 900, fontSize: 14, margin: 0, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{s.value}</p>
              <p style={{ color: '#8B7866', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Badges ───────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
            BADGES
          </p>
          <span style={{ color: '#8B7866', fontSize: 10, fontWeight: 800 }}>
            {achievedBadgeKeys.length} stages unlocked
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {badgeProgress.map(badge => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </div>

      {/* ── My Collection ────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
            MY COLLECTION
          </p>
          <Link href="/binder" style={{ color: '#E8233B', fontWeight: 800, fontSize: 12, textDecoration: 'none' }}>
            VIEW ALL →
          </Link>
        </div>

        <div
          style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}
        >
          {previewCards.length === 0 ? (
            <p style={{ color: '#8B7866', fontSize: 13, fontStyle: 'italic' }}>No cards yet</p>
          ) : (
            previewCards.map(uc => (
              <Link key={uc.id} href="/binder" style={{ textDecoration: 'none', flexShrink: 0 }}>
                <div style={{
                  width: 60, aspectRatio: '2.5/3.5',
                  background: '#f0ece2', border: '2px solid #0A0A0A',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {uc.cards?.image_url ? (
                    <Image
                      src={uc.cards.image_url}
                      alt={uc.cards.name}
                      fill
                      sizes="60px"
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: 0.3 }}>🃏</div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* ── Notifications row ────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '3px 3px 0 #E8233B' }}>
          <button
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔔</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 14, margin: 0 }}>Notifications</p>
              <p style={{ color: '#8B7866', fontSize: 11, margin: '2px 0 0' }}>3 enabled</p>
            </div>
            <span style={{ color: '#8B7866', fontSize: 16 }}>›</span>
          </button>
        </div>
      </div>

      {/* ── Sign out ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px' }}>
        <button
          onClick={handleSignOut}
          style={{
            width:      '100%',
            padding:    '14px 0',
            background: '#FAF6EC',
            border:     '2px solid #0A0A0A',
            color:      '#E8233B',
            fontWeight: 900,
            fontSize:   13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor:     'pointer',
          }}
        >
          Sign Out
        </button>
      </div>
      </div>

      {/* ── Edit modal ───────────────────────────────────────────────────── */}
      {editOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {badgeUnlock && (
        <BadgeUnlockModal unlock={badgeUnlock} onClose={closeBadgeUnlock} />
      )}
    </main>
  )
}

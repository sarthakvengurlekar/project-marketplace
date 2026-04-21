'use client'

import { useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GradingCompany = 'RAW' | 'PSA' | 'BGS' | 'CGC' | 'TAG'

export interface GradingSelection {
  company: GradingCompany
  grade: number | null
  grade_label: string | null
}

export const DEFAULT_GRADING: GradingSelection = { company: 'RAW', grade: null, grade_label: null }

// ─── Company metadata ─────────────────────────────────────────────────────────

const COMPANIES: {
  id: GradingCompany
  label: string
  tagline: string
  initials: string
  circleClass: string
  selectedBg: string
  selectedBorder: string
}[] = [
  {
    id: 'RAW',
    label: 'RAW',
    tagline: 'Ungraded',
    initials: 'R',
    circleClass: 'bg-zinc-500',
    selectedBg: 'bg-zinc-800/80',
    selectedBorder: 'border-zinc-400 shadow-zinc-400/20',
  },
  {
    id: 'PSA',
    label: 'PSA',
    tagline: 'Most valuable',
    initials: 'PSA',
    circleClass: 'bg-red-600',
    selectedBg: 'bg-red-950/40',
    selectedBorder: 'border-red-400 shadow-red-400/20',
  },
  {
    id: 'BGS',
    label: 'BGS',
    tagline: 'Subgrades',
    initials: 'BGS',
    circleClass: 'bg-orange-600',
    selectedBg: 'bg-orange-950/40',
    selectedBorder: 'border-orange-400 shadow-orange-400/20',
  },
  {
    id: 'CGC',
    label: 'CGC',
    tagline: 'Half points',
    initials: 'CGC',
    circleClass: 'bg-blue-600',
    selectedBg: 'bg-blue-950/40',
    selectedBorder: 'border-blue-400 shadow-blue-400/20',
  },
  {
    id: 'TAG',
    label: 'TAG',
    tagline: 'AI graded',
    initials: 'TAG',
    circleClass: 'bg-purple-600',
    selectedBg: 'bg-purple-950/40',
    selectedBorder: 'border-purple-400 shadow-purple-400/20',
  },
]

// ─── Grade data ───────────────────────────────────────────────────────────────

const PSA_GRADES  = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const BGS_CGC_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const TAG_GRADES  = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function getGrades(company: GradingCompany): number[] {
  if (company === 'PSA') return PSA_GRADES
  if (company === 'BGS' || company === 'CGC') return BGS_CGC_GRADES
  if (company === 'TAG') return TAG_GRADES
  return []
}

const PSA_LABELS: Record<number, string> = {
  1: 'Poor', 2: 'Good', 3: 'Very Good', 4: 'VG-EX',
  5: 'Excellent', 6: 'EX-MT', 7: 'Near Mint', 8: 'NM-MT',
  9: 'Mint', 10: 'Gem Mint',
}
const BGS_LABELS: Record<number, string> = {
  10: 'Pristine', 9.5: 'Gem Mint', 9: 'Mint+',
  8.5: 'NM-MT+', 8: 'NM-MT', 7.5: 'NM+', 7: 'Near Mint',
}
const CGC_LABELS: Record<number, string> = {
  10: 'Gem Mint', 9.5: 'NM-MT+', 9: 'Mint+',
  8.5: 'NM-MT+', 8: 'NM-MT', 7: 'Near Mint',
}
const TAG_LABELS: Record<number, string> = {
  10: 'Pristine', 9: 'Gem Mint', 8: 'NM-MT',
  7: 'Near Mint', 6: 'Excellent',
}

function getLabel(company: GradingCompany, grade: number): string {
  if (company === 'PSA') return PSA_LABELS[grade] ?? ''
  if (company === 'BGS') return BGS_LABELS[grade] ?? ''
  if (company === 'CGC') return CGC_LABELS[grade] ?? ''
  if (company === 'TAG') return TAG_LABELS[grade] ?? ''
  return ''
}

// ─── Value insights ───────────────────────────────────────────────────────────

function getInsight(company: GradingCompany, grade: number | null): string {
  if (company === 'RAW') return '📦 Ungraded card — condition affects trade value'
  if (grade == null) return ''
  if (company === 'PSA') {
    if (grade === 10) return '🏆 Top tier grade. Commands highest market premium'
    if (grade === 9)  return '⭐ Excellent grade. Strong resale value'
    if (grade === 8)  return '✅ Very collectible. Popular for trading'
    if (grade >= 6)   return '🔄 Mid-grade card. Good for casual trading'
    return '📉 Lower grade — affects resale value'
  }
  if (company === 'BGS') {
    if (grade === 10)  return '👑 Pristine — rarest BGS grade possible'
    if (grade === 9.5) return '💎 BGS 9.5 equals PSA 10 in collector value'
    if (grade >= 9)    return '⭐ Excellent BGS grade. High collector demand'
    if (grade >= 7)    return '✅ Solid BGS grade. Popular for trading'
    return '📉 Lower grade — affects resale value'
  }
  if (company === 'CGC') {
    if (grade === 10) return '✨ Gem Mint — CGC\'s highest standard'
    if (grade >= 9)   return '⭐ Excellent CGC grade. Strong collector value'
    if (grade >= 7)   return '✅ Solid CGC grade. Popular for trading'
    return '📉 Lower grade — affects resale value'
  }
  if (company === 'TAG') {
    if (grade === 10) return '🤖 AI-verified Pristine — TAG\'s elite grade'
    if (grade >= 9)   return '⭐ Excellent AI-verified grade'
    if (grade >= 7)   return '✅ Good condition, AI-verified'
    return '📉 Lower grade — affects resale value'
  }
  return ''
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function pillRangeClass(grade: number): string {
  if (grade >= 9) return 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
  if (grade >= 7) return 'bg-blue-950/60 border-blue-800/60 text-blue-300'
  return 'bg-zinc-800/60 border-zinc-700/60 text-zinc-400'
}

function gradeLabelColor(grade: number): string {
  if (grade >= 9) return 'text-emerald-400'
  if (grade >= 7) return 'text-blue-400'
  return 'text-zinc-400'
}

function gradeEmoji(grade: number): string {
  if (grade >= 9.5) return ' ✨'
  if (grade >= 9)   return ' ⭐'
  return ''
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GradingSelector({
  value,
  onChange,
}: {
  value: GradingSelection
  onChange: (v: GradingSelection) => void
}) {
  const grades = useMemo(() => getGrades(value.company), [value.company])

  function selectCompany(company: GradingCompany) {
    if (company === 'RAW') {
      onChange({ company, grade: null, grade_label: null })
      return
    }
    const newGrades = getGrades(company)
    const kept      = value.grade != null && newGrades.includes(value.grade) ? value.grade : null
    onChange({ company, grade: kept, grade_label: kept ? (getLabel(company, kept) || null) : null })
  }

  function selectGrade(grade: number) {
    const label = getLabel(value.company, grade)
    onChange({ company: value.company, grade, grade_label: label || null })
  }

  const gradeLabel = value.grade != null ? getLabel(value.company, value.grade) : null
  const insight    = getInsight(value.company, value.grade)

  return (
    <div className="space-y-4">

      {/* ── Company selector ─────────────────────────────────────────────── */}
      <div>
        <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-2.5">
          Grading Company
        </p>
        <div
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {COMPANIES.map(co => {
            const selected = value.company === co.id
            return (
              <button
                key={co.id}
                onClick={() => selectCompany(co.id)}
                style={{ scrollSnapAlign: 'start' }}
                className={`flex-shrink-0 w-[72px] rounded-2xl border p-2.5 flex flex-col items-center gap-1.5 transition-all duration-150 ${
                  selected
                    ? `${co.selectedBg} ${co.selectedBorder} shadow-lg -translate-y-0.5`
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 active:bg-zinc-800'
                }`}
              >
                <div className={`w-9 h-9 rounded-full ${co.circleClass} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white font-black text-[9px] leading-none tracking-tight">
                    {co.initials}
                  </span>
                </div>
                <span className={`text-[11px] font-black leading-none ${selected ? 'text-white' : 'text-zinc-300'}`}>
                  {co.label}
                </span>
                <span className="text-[9px] text-zinc-500 text-center leading-tight">
                  {co.tagline}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Grade pills ──────────────────────────────────────────────────── */}
      {value.company !== 'RAW' && (
        <div>
          <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-2.5">
            Grade
          </p>
          <div
            className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {grades.map(g => {
              const selected = value.grade === g
              return (
                <button
                  key={g}
                  onClick={() => selectGrade(g)}
                  style={{ scrollSnapAlign: 'start' }}
                  className={`flex-shrink-0 rounded-xl border px-3 py-2 text-[11px] font-black transition-all duration-100 ${
                    selected
                      ? 'bg-yellow-400 border-yellow-400 text-black shadow-md shadow-yellow-400/20'
                      : `${pillRangeClass(g)} hover:opacity-80 active:opacity-60`
                  }`}
                >
                  {g % 1 === 0 ? g : g.toFixed(1)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Grade label ──────────────────────────────────────────────────── */}
      {value.company !== 'RAW' && value.grade != null && (
        <div className="text-center py-1">
          <p className={`text-base font-black leading-snug ${gradeLabelColor(value.grade)}`}>
            {value.company} {value.grade % 1 === 0 ? value.grade : value.grade.toFixed(1)}
            {gradeLabel ? ` — ${gradeLabel}` : ''}
            {gradeEmoji(value.grade)}
          </p>
        </div>
      )}

      {/* ── Value insight ─────────────────────────────────────────────────── */}
      {insight && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3">
          <p className="text-zinc-300 text-xs leading-relaxed">{insight}</p>
        </div>
      )}

    </div>
  )
}

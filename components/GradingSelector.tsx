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
  color: string
}[] = [
  { id: 'RAW', label: 'RAW', tagline: 'Ungraded',     color: '#8B7866' },
  { id: 'PSA', label: 'PSA', tagline: 'Most valuable', color: '#E8233B' },
  { id: 'BGS', label: 'BGS', tagline: 'Subgrades',     color: '#E87423' },
  { id: 'CGC', label: 'CGC', tagline: 'Half points',   color: '#2363E8' },
  { id: 'TAG', label: 'TAG', tagline: 'AI graded',     color: '#8B23E8' },
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

function gradeQuality(grade: number): 'high' | 'mid' | 'low' {
  if (grade >= 9) return 'high'
  if (grade >= 7) return 'mid'
  return 'low'
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
  const activeCo   = COMPANIES.find(c => c.id === value.company)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Company selector ─────────────────────────────────────────────── */}
      <div>
        <p style={{ color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
          Grading Company
        </p>
        <div
          style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' } as React.CSSProperties}
        >
          {COMPANIES.map(co => {
            const selected = value.company === co.id
            return (
              <button
                key={co.id}
                onClick={() => selectCompany(co.id)}
                style={{
                  flexShrink:     0,
                  width:          72,
                  background:     selected ? co.color : '#FAF6EC',
                  border:         `2px solid ${selected ? co.color : '#0A0A0A'}`,
                  boxShadow:      selected ? `2px 2px 0 #0A0A0A` : 'none',
                  padding:        '10px 6px',
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  gap:            6,
                  cursor:         'pointer',
                  transition:     'all 0.1s',
                }}
              >
                <div style={{
                  width:          36,
                  height:         36,
                  borderRadius:   '50%',
                  background:     selected ? 'rgba(255,255,255,0.25)' : co.color,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  border:         selected ? '2px solid rgba(255,255,255,0.4)' : 'none',
                }}>
                  <span style={{ color: '#FAF6EC', fontWeight: 900, fontSize: 9, letterSpacing: '-0.02em' }}>
                    {co.label}
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 900, color: selected ? '#FAF6EC' : '#0A0A0A', lineHeight: 1 }}>
                  {co.label}
                </span>
                <span style={{ fontSize: 9, color: selected ? 'rgba(255,255,255,0.7)' : '#8B7866', textAlign: 'center', lineHeight: 1.2 }}>
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
          <p style={{ color: '#8B7866', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Grade
          </p>
          <div
            style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, flexWrap: 'wrap', scrollbarWidth: 'none' } as React.CSSProperties}
          >
            {grades.map(g => {
              const selected = value.grade === g
              const quality  = gradeQuality(g)
              const pillBg   = selected
                ? (activeCo?.color ?? '#F4D03F')
                : quality === 'high' ? '#FAF6EC' : '#FAF6EC'
              const pillColor = selected ? '#FAF6EC' : quality === 'high' ? '#0A0A0A' : quality === 'mid' ? '#0A0A0A' : '#8B7866'
              return (
                <button
                  key={g}
                  onClick={() => selectGrade(g)}
                  style={{
                    flexShrink:  0,
                    background:  pillBg,
                    border:      `2px solid ${selected ? (activeCo?.color ?? '#0A0A0A') : quality === 'high' ? '#0A0A0A' : '#8B7866'}`,
                    boxShadow:   selected ? '1px 1px 0 #0A0A0A' : 'none',
                    padding:     '6px 12px',
                    fontSize:    11,
                    fontWeight:  selected ? 900 : 700,
                    color:       pillColor,
                    cursor:      'pointer',
                    transition:  'all 0.1s',
                  }}
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
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <p style={{ fontSize: 15, fontWeight: 900, color: activeCo?.color ?? '#0A0A0A', margin: 0 }}>
            {value.company} {value.grade % 1 === 0 ? value.grade : value.grade.toFixed(1)}
            {gradeLabel ? ` — ${gradeLabel}` : ''}
            {value.grade >= 9.5 ? ' ✨' : value.grade >= 9 ? ' ⭐' : ''}
          </p>
        </div>
      )}

      {/* ── Value insight ─────────────────────────────────────────────────── */}
      {insight && (
        <div style={{
          background:   '#FAF6EC',
          border:       '2px solid #0A0A0A',
          padding:      '10px 14px',
        }}>
          <p style={{ color: '#0A0A0A', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{insight}</p>
        </div>
      )}

    </div>
  )
}

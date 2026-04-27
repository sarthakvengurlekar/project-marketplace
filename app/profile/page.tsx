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

function BadgeCard({ badge }: { badge: BadgeProgress }) {
  const unlocked = badge.stages.some(s => s.complete)
  return (
    <div style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: unlocked ? '4px 4px 0 #0A0A0A' : 'none', opacity: unlocked ? 1 : 0.72, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 44, height: 44, flexShrink: 0, background: unlocked ? '#F4D03F' : '#f0ece2', border: '2px solid #0A0A0A', boxShadow: unlocked ? '2px 2px 0 #0A0A0A' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0A0A', fontWeight: 900, fontSize: badge.icon.length > 2 ? 9 : 18 }}>
          {badge.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 14, margin: 0 }}>{badge.name}</p>
            <span style={{ background: unlocked ? '#E8233B' : '#FAF6EC', color: unlocked ? '#FAF6EC' : '#8B7866', border: '1.5px solid #0A0A0A', fontSize: 9, fontWeight: 900, padding: '2px 6px', whiteSpace: 'nowrap' }}>
              {badge.level}
            </span>
          </div>
          <p style={{ color: '#8B7866', fontSize: 11, margin: '4px 0 8px' }}>{badge.sub}</p>
          <div style={{ height: 8, background: '#f0ece2', border: '1.5px solid #0A0A0A', overflow: 'hidden' }}>
            <div style={{ width: `${badge.progress}%`, height: '100%', background: unlocked ? '#E8233B' : '#8B7866' }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 10 } as React.CSSProperties}>
        {badge.stages.map(stage => (
          <span
            key={stage.key}
            title={stage.text}
            style={{
              flexShrink: 0,
              background: stage.complete ? '#0A0A0A' : '#FAF6EC',
              color: stage.complete ? '#FAF6EC' : '#8B7866',
              border: '1.5px solid #0A0A0A',
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
    <div className="animate-pulse">
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
    <div className="min-h-screen pb-28" style={{ background: '#FAF6EC' }}>

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
            { label: 'CARDS',  value: stats.card_count.toLocaleString() },
            { label: 'VALUE',  value: collectionVal, red: true },
            { label: 'TRADES', value: stats.trade_count.toLocaleString() },
            { label: 'RATING', value: `${ratingDisplay}` },
          ].map((s, i, arr) => (
            <div
              key={s.label}
              style={{
                padding:     '12px 8px',
                textAlign:   'center',
                background:  '#0A0A0A',
                borderRight: i < arr.length - 1 ? '2px solid #FAF6EC' : 'none',
              }}
            >
              <p style={{ color: s.red ? '#E8233B' : '#FAF6EC', fontWeight: 900, fontSize: 15, margin: 0, lineHeight: 1.2 }}>{s.value}</p>
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
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'
import { formatPrice, COUNTRIES } from '@/lib/currency'

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
}

interface PreviewCard {
  id: string
  condition: string | null
  is_foil: boolean
  cards: { id: string; name: string; image_url: string | null } | null
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
  const [username, setUsername]     = useState(profile.username)
  const [bio, setBio]               = useState(profile.bio ?? '')
  const [country, setCountry]       = useState(profile.country_code)
  const [city, setCity]             = useState(profile.city ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

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

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />
      <div
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
        style={{ background: '#160e20', border: '1px solid rgba(139,92,246,0.3)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(139,92,246,0.2)' }}>
          <h2 className="text-white font-black text-base">Edit Profile</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white text-sm" style={{ background: '#2a1f3a' }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-yellow-400/50 hover:border-yellow-400 transition-colors"
            >
              {(avatarPreview ?? profile.avatar_url) ? (
                <Image
                  src={avatarPreview ?? profile.avatar_url!}
                  alt="Avatar"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-2xl">
                  {profile.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-lg">📷</span>
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={30}
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
              style={{ background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.3)' }}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={160}
              rows={3}
              placeholder="Tell traders about yourself..."
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors resize-none placeholder:text-zinc-600"
              style={{ background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.3)' }}
            />
            <p className="text-right text-[10px] text-zinc-600 mt-1">{bio.length}/160</p>
          </div>

          {/* Country */}
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Country</label>
            <div className="flex gap-2">
              {COUNTRY_OPTIONS.map(c => (
                <button
                  key={c.code}
                  onClick={() => handleCountryChange(c.code)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={country === c.code
                    ? { background: 'rgba(255,222,0,0.1)', border: '1px solid #FFDE00', color: '#FFDE00' }
                    : { background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.3)', color: '#a1a1aa' }
                  }
                >
                  <span>{c.flag}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          {country && (
            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1.5">City</label>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
              style={{ background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.3)' }}
              >
                <option value="">Select city…</option>
                {(CITIES[country] ?? []).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-400/10 rounded-xl px-4 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 space-y-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(139,92,246,0.2)' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full disabled:opacity-50 text-black font-black rounded-xl py-3 text-sm tracking-wide transition-all"
            style={{ background: 'linear-gradient(135deg, #FFDE00, #F4C430)', boxShadow: '0 0 18px rgba(255,222,0,0.35)' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="w-full text-zinc-300 font-bold rounded-xl py-2.5 text-sm transition-colors"
            style={{ background: '#2a1f3a', border: '1px solid rgba(139,92,246,0.2)' }}
          >
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
      <div className="h-36 bg-zinc-800 rounded-none" />
      <div className="flex flex-col items-center -mt-12 px-5 pb-5">
        <div className="w-24 h-24 rounded-full bg-zinc-700 border-4 border-zinc-950 mb-3" />
        <div className="h-5 w-36 bg-zinc-700 rounded-full mb-2" />
        <div className="h-3 w-24 bg-zinc-800 rounded-full" />
      </div>
      <div className="px-4 space-y-3">
        <div className="h-20 bg-zinc-900 rounded-2xl" />
        <div className="h-28 bg-zinc-900 rounded-2xl" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const { setCountryCode } = useCountry()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats]     = useState<Stats | null>(null)
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/profile')
      if (res.status === 401) { router.replace('/login'); return }
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setProfile(data.profile)
      setStats(data.stats)
      setPreviewCards(data.preview_cards ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSignOut() {
    await supabase.auth.signOut()
    setCountryCode('IN')
    router.replace('/login')
  }

  function handleSaved(updated: Partial<Profile>) {
    setProfile(prev => prev ? { ...prev, ...updated } : prev)
    if (updated.country_code) setCountryCode(updated.country_code)
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: '#0a0514' }}>
        <ProfileSkeleton />
      </div>
    )
  }

  if (!profile || !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0514' }}>
        <p className="text-zinc-500 text-sm">Failed to load profile.</p>
      </div>
    )
  }

  const countryCode  = profile.country_code
  const flag         = FLAGS[countryCode] ?? ''
  const isBuyer      = profile.roles?.includes('buy')
  const isSeller     = profile.roles?.includes('sell')
  const collectionVal = formatPrice(stats.collection_value_local, countryCode)
  const ratingDisplay = stats.avg_rating != null ? stats.avg_rating.toFixed(1) : '—'

  return (
    <div className="min-h-screen pb-28" style={{ background: 'radial-gradient(ellipse at 50% -10%, #2d1060 0%, #1a0830 40%, #0a0514 100%)' }}>

      {/* ── Header banner ───────────────────────────────────────────────── */}
      <div className="relative">
        {/* Pokemon sky gradient banner */}
        <div
          className="h-36"
          style={{ background: 'linear-gradient(135deg, #0a0514 0%, #2d1060 35%, #7c3a00 72%, #ff6b35 100%)' }}
        />

        {/* Edit button top-right */}
        <button
          onClick={() => setEditOpen(true)}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-sm border border-white/10 rounded-full text-white text-xs font-semibold transition-colors"
        >
          <span className="text-xs">✏️</span> Edit
        </button>

        {/* Avatar — overlaps banner */}
        <div className="flex flex-col items-center px-5 -mt-12 pb-4">
          <button onClick={() => setEditOpen(true)} className="relative mb-3 group">
            {/* Championship belt ring */}
            <div
              className="rounded-full p-[3px]"
              style={{ background: 'linear-gradient(135deg, #FFDE00, #FF6B35, #EE1515, #7C538C, #FFDE00)', boxShadow: '0 0 20px rgba(255,222,0,0.4)' }}
            >
            <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 shadow-xl" style={{ border: '3px solid #0a0514' }}>
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username}
                  width={96}
                  height={96}
                  className="object-cover w-full h-full"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-black text-zinc-400">
                  {profile.username[0]?.toUpperCase()}
                </div>
              )}
            </div>
            </div>{/* end championship ring */}
            {/* Camera overlay */}
            <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
              <span className="text-white text-xl opacity-0 group-hover:opacity-100 transition-opacity">📷</span>
            </div>
            {/* Small camera badge */}
            <div
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-md"
              style={{ background: 'linear-gradient(135deg, #FFDE00, #F4C430)', border: '2px solid #0a0514' }}
            >
              📷
            </div>
          </button>

          {/* Name */}
          <h1 className="text-white font-black text-2xl tracking-tight leading-none mb-1">
            {profile.username}
          </h1>

          {/* Location */}
          {(profile.city || countryCode) && (
            <p className="text-zinc-400 text-sm mb-3">
              {flag} {[profile.city, COUNTRIES[countryCode]?.name].filter(Boolean).join(', ')}
            </p>
          )}

          {/* Role badges */}
          <div className="flex gap-2">
            {isBuyer && (
              <span className="px-3 py-1 bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold rounded-full">
                🛒 Buyer
              </span>
            )}
            {isSeller && (
              <span className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-full">
                🏷️ Seller
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div
          className="grid grid-cols-4 rounded-2xl overflow-hidden"
          style={{ background: '#160e20', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          {[
            { label: 'Cards',  value: stats.card_count.toLocaleString(), color: '#FFDE00' },
            { label: 'Value',  value: collectionVal,                      color: '#FF6B35' },
            { label: 'Trades', value: stats.trade_count.toLocaleString(), color: '#00A7E1' },
            { label: 'Rating', value: `${ratingDisplay}${stats.avg_rating != null ? ' ★' : ''}`, color: '#F4C430' },
          ].map((stat, i, arr) => (
            <div
              key={stat.label}
              className="flex flex-col items-center py-4"
              style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(139,92,246,0.15)' : 'none' }}
            >
              <span className="font-black text-base leading-none mb-1" style={{ color: stat.color }}>{stat.value}</span>
              <span className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wide">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bio ─────────────────────────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="rounded-2xl p-4" style={{ background: '#160e20', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wide">Bio</h3>
            <button
              onClick={() => setEditOpen(true)}
              className="text-zinc-500 hover:text-yellow-400 transition-colors text-xs flex items-center gap-1"
            >
              ✏️ <span>Edit</span>
            </button>
          </div>
          {profile.bio ? (
            <p className="text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
          ) : (
            <p className="text-zinc-600 text-sm italic">
              Add a bio to tell traders about yourself
            </p>
          )}
        </div>
      </div>

      {/* ── Collection preview ──────────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="rounded-2xl overflow-hidden" style={{ background: '#160e20', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
            <h3 className="text-white font-black text-sm">My Collection</h3>
            <Link
              href="/binder"
              className="text-yellow-400 text-xs font-bold hover:text-yellow-300 transition-colors"
            >
              View All →
            </Link>
          </div>

          {previewCards.length === 0 ? (
            <div className="py-8 text-center text-zinc-600 text-sm">No cards yet</div>
          ) : (
            <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
              {previewCards.map(uc => (
                <Link key={uc.id} href="/binder" className="flex-shrink-0">
                  <div className="w-20 rounded-xl overflow-hidden" style={{ aspectRatio: '2.5/3.5', background: '#1a1028', border: '1px solid rgba(139,92,246,0.2)' }}>
                    {uc.cards?.image_url ? (
                      <Image
                        src={uc.cards.image_url}
                        alt={uc.cards.name}
                        width={80}
                        height={112}
                        className="w-full h-full object-contain"
                        style={{ transform: 'none' }}
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl text-zinc-600">🃏</div>
                    )}
                  </div>
                  {uc.is_foil && (
                    <p className="text-[9px] text-yellow-400 font-bold text-center mt-0.5">✨ Foil</p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settings ────────────────────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="rounded-2xl overflow-hidden" style={{ background: '#160e20', border: '1px solid rgba(139,92,246,0.2)' }}>
          {[
            { icon: '🔔', label: 'Notification Preferences' },
            { icon: '❓', label: 'Help & Support' },
            { icon: '📤', label: 'Share App' },
          ].map((item, i, arr) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
              style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(139,92,246,0.12)' : 'none' }}
            >
              <span className="text-lg w-7 text-center">{item.icon}</span>
              <span className="flex-1 text-zinc-300 text-sm font-medium">{item.label}</span>
              <span className="text-zinc-600 text-xs">›</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sign out ────────────────────────────────────────────────────── */}
      <div className="px-4">
        <button
          onClick={handleSignOut}
          className="w-full bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/25 border border-red-500/20 hover:border-red-500/40 text-red-400 font-black rounded-2xl py-4 text-sm tracking-wide transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────── */}
      {editOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

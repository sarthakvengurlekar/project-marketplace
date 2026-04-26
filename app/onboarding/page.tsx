'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useCountry } from '@/lib/context/CountryContext'

const CITIES: Record<string, string[]> = {
  IN: ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Other'],
  UAE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Other'],
}

const ROLES = [
  { value: 'buy', label: 'I want to Buy cards', emoji: '🛒' },
  { value: 'sell', label: 'I want to Sell cards', emoji: '💰' },
]

const COUNTRY_OPTIONS = [
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'UAE', flag: '🇦🇪', name: 'UAE' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { setCountryCode } = useCountry()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [checking, setChecking] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // form state
  const [roles, setRoles] = useState<string[]>([])
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // on mount: verify auth, skip if profile exists
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      setUserId(user.id)

      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (existing) { router.replace('/feed'); return }

      setChecking(false)
    }
    init()
  }, [router])

  function toggleRole(value: string) {
    setRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    )
  }

  function selectCountry(code: string) {
    setCountry(code)
    setCity('')
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!username.trim()) { setError('Username is required.'); return }
    if (!country) { setError('Please select a country.'); return }
    if (!city) { setError('Please select a city.'); return }

    setLoading(true)

    try {
      // Re-fetch the session at submit time — the stored userId state
      // can go stale if the session refreshed since the component mounted.
      const { data: { user: currentUser }, error: sessionError } = await supabase.auth.getUser()

      if (sessionError || !currentUser) {
        console.error('[onboarding] No active session at submit time:', sessionError)
        throw new Error('Session expired. Please sign in again.')
      }

      console.log('[onboarding] Auth uid at submit:', currentUser.id)

      let avatarUrl: string | null = null

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop()
        const path = `${currentUser.id}-${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })

        if (uploadError) {
          console.error('[onboarding] Avatar upload error:', uploadError)
          throw uploadError
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(path)

        avatarUrl = publicUrl
      }

      const payload = {
        id: currentUser.id,
        username: username.trim(),
        city,
        country_code: country,
        avatar_url: avatarUrl,
        bio: bio.trim() || null,
        roles,
      }

      console.log('[onboarding] Upserting profile payload:', payload)

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })

      if (upsertError) {
        console.error('[onboarding] Upsert error — code:', upsertError.code,
          '| message:', upsertError.message,
          '| details:', upsertError.details,
          '| hint:', upsertError.hint,
          '| full:', upsertError)
        throw upsertError
      }

      console.log('[onboarding] Profile saved successfully for uid:', currentUser.id)
      setCountryCode(country)
      router.push('/feed')
    } catch (err: unknown) {
      console.error('[onboarding] handleSubmit caught:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: '#FAF6EC' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  return (
    <main
      className="min-h-screen px-4 py-10"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0514 65%)' }}
    >
      <div className="max-w-sm mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{
              background: 'linear-gradient(135deg, #FFDE00 0%, #F4C430 100%)',
              boxShadow:  '0 0 24px rgba(255,222,0,0.5), 0 0 48px rgba(255,222,0,0.2)',
            }}
          >
            <span className="text-2xl font-black text-black">PT</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Set up your profile</h1>
          <p className="text-zinc-500 text-sm mt-1">Just a few things to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* ── 1. Role selector ───────────────────────────────── */}
          <section>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              What do you want to do?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleRole(value)}
                  className={`flex flex-col items-center gap-2 py-5 px-3 rounded-2xl border-2 font-bold text-sm transition-all ${
                    roles.includes(value)
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300 shadow-lg shadow-yellow-400/10'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <span className="text-2xl">{emoji}</span>
                  <span className="text-center leading-snug">{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── 2. Country selector ────────────────────────────── */}
          <section>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Country
            </p>
            <div className="grid grid-cols-2 gap-3">
              {COUNTRY_OPTIONS.map(({ code, flag, name }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => selectCountry(code)}
                  className={`flex flex-col items-center gap-2 py-5 px-3 rounded-2xl border-2 font-bold text-sm transition-all ${
                    country === code
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300 shadow-lg shadow-yellow-400/10'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <span className="text-3xl">{flag}</span>
                  {name}
                </button>
              ))}
            </div>
          </section>

          {/* ── 3. City dropdown ───────────────────────────────── */}
          {country && (
            <section>
              <label
                htmlFor="city"
                className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3"
              >
                City
              </label>
              <div className="relative">
                <select
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full appearance-none bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all pr-10"
                >
                  <option value="" disabled>Select a city…</option>
                  {CITIES[country].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">
                  ▼
                </span>
              </div>
            </section>
          )}

          {/* ── 4. Username ────────────────────────────────────── */}
          <section>
            <label
              htmlFor="username"
              className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3"
            >
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm select-none">
                @
              </span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
                placeholder="yourhandle"
                maxLength={30}
                autoComplete="off"
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
              />
            </div>
          </section>

          {/* ── 5. Avatar upload ───────────────────────────────── */}
          <section>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Profile Photo{' '}
              <span className="text-zinc-600 normal-case font-normal">(optional)</span>
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 flex-shrink-0 rounded-full border-2 border-dashed border-zinc-700 hover:border-yellow-400 bg-zinc-900 flex items-center justify-center overflow-hidden transition-colors"
              >
                {avatarPreview ? (
                  <Image
                    src={avatarPreview}
                    alt="Avatar preview"
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">📷</span>
                )}
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-colors"
                >
                  {avatarPreview ? 'Change photo' : 'Upload photo'}
                </button>
                <p className="text-zinc-600 text-xs mt-0.5">JPG, PNG or WebP · max 5 MB</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </section>

          {/* ── 6. Bio ─────────────────────────────────────────── */}
          <section>
            <label
              htmlFor="bio"
              className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3"
            >
              Bio{' '}
              <span className="text-zinc-600 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the community about yourself…"
              maxLength={160}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all resize-none"
            />
            <p className="text-right text-xs text-zinc-600 mt-1">{bio.length}/160</p>
          </section>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── 7. Submit ──────────────────────────────────────── */}
          <button
            type="submit"
            disabled={loading}
            className="w-full disabled:opacity-40 disabled:cursor-not-allowed text-black font-black rounded-xl py-3.5 text-sm tracking-wide transition-all"
            style={{
              background: 'linear-gradient(135deg, #FFDE00 0%, #F4C430 100%)',
              boxShadow:  '0 0 18px rgba(255,222,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {loading ? 'Saving…' : 'Complete Setup →'}
          </button>

        </form>

        <div className="mt-10 flex justify-center">
          <div className="h-1 w-16 rounded-full bg-yellow-400/30" />
        </div>
      </div>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SignupPage() {
  const router = useRouter()
  const [email,           setEmail]           = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [hydrated,        setHydrated]        = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  const inputStyle: React.CSSProperties = {
    width:      '100%',
    boxSizing:  'border-box',
    background: '#FAF6EC',
    border:     '2px solid #0A0A0A',
    color:      '#0A0A0A',
    fontSize:   14,
    padding:    '12px 14px',
    outline:    'none',
  }

  return (
    <main style={{ minHeight: '100vh', background: '#FAF6EC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display:        'inline-flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:           60,
            height:          60,
            background:     '#E8233B',
            border:         '3px solid #0A0A0A',
            boxShadow:      '4px 4px 0 #0A0A0A',
            marginBottom:    16,
          }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#FAF6EC', letterSpacing: '-0.03em' }}>PT</span>
          </div>
          <h1 style={{ color: '#0A0A0A', fontWeight: 900, fontSize: 24, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            projecttrading
          </h1>
          <p style={{ color: '#8B7866', fontSize: 13, margin: 0 }}>Create your account</p>
        </div>

        {/* Form card */}
        <div style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '5px 5px 0 #0A0A0A', padding: '24px' }}>
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{ display: 'block', color: '#0A0A0A', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#0A0A0A', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#0A0A0A', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(232,35,59,0.06)', border: '2px solid #E8233B', padding: '10px 14px', color: '#E8233B', fontSize: 13, fontWeight: 700 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !hydrated}
              style={{
                width:         '100%',
                padding:       '13px 0',
                background:    loading || !hydrated ? '#E8233B99' : '#E8233B',
                border:        '2px solid #0A0A0A',
                boxShadow:     loading || !hydrated ? 'none' : '4px 4px 0 #0A0A0A',
                color:         '#FAF6EC',
                fontWeight:    900,
                fontSize:      14,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor:        loading || !hydrated ? 'not-allowed' : 'pointer',
                marginTop:     4,
              }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#8B7866' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#E8233B', fontWeight: 800, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
        </div>

        {/* Bottom accent */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, gap: 6 }}>
          <div style={{ width: 8, height: 8, background: '#E8233B', border: '1px solid #0A0A0A' }} />
          <div style={{ width: 8, height: 8, background: '#F4D03F', border: '1px solid #0A0A0A' }} />
          <div style={{ width: 8, height: 8, background: '#0A0A0A' }} />
        </div>
      </div>
    </main>
  )
}

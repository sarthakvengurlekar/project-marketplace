'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      router.push('/feed')
    }
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
          <p style={{ color: '#8B7866', fontSize: 13, margin: 0 }}>Choose a new password</p>
        </div>

        {/* Form card */}
        <div style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '5px 5px 0 #0A0A0A', padding: '24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{ display: 'block', color: '#0A0A0A', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                New Password
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
              disabled={loading}
              style={{
                width:         '100%',
                padding:       '13px 0',
                background:    loading ? '#E8233B99' : '#E8233B',
                border:        '2px solid #0A0A0A',
                boxShadow:     loading ? 'none' : '4px 4px 0 #0A0A0A',
                color:         '#FAF6EC',
                fontWeight:    900,
                fontSize:      14,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor:        loading ? 'not-allowed' : 'pointer',
                marginTop:     4,
              }}
            >
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
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

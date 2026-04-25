'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0514 65%)' }}
    >
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{
              background: 'linear-gradient(135deg, #FFDE00 0%, #F4C430 100%)',
              boxShadow:  '0 0 24px rgba(255,222,0,0.5), 0 0 48px rgba(255,222,0,0.2)',
            }}
          >
            <span className="text-2xl font-black text-black tracking-tight">PT</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">projecttrading</h1>
          <p className="text-zinc-500 text-sm mt-1">Create your account</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 shadow-2xl"
          style={{
            background: '#160e20',
            border:     '1px solid rgba(139, 92, 246, 0.25)',
            boxShadow:  '0 0 0 1px rgba(255,222,0,0.06), 0 24px 48px rgba(0,0,0,0.4)',
          }}
        >
          <form onSubmit={handleSignup} className="space-y-4">

            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-40 disabled:cursor-not-allowed text-black font-black rounded-xl py-3 text-sm tracking-wide transition-all mt-2"
              style={{
                background: 'linear-gradient(135deg, #FFDE00 0%, #F4C430 100%)',
                boxShadow:  loading ? 'none' : '0 0 18px rgba(255,222,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-yellow-400 hover:text-yellow-300 font-bold transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {/* Bottom accent */}
        <div className="mt-6 flex justify-center">
          <div className="h-1 w-16 rounded-full bg-yellow-400/30" />
        </div>
      </div>
    </main>
  )
}

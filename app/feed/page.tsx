'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import CardSearch from '@/components/CardSearch'

export default function FeedPage() {
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-yellow-400 flex items-center justify-center shadow-md shadow-yellow-400/20">
              <span className="text-sm font-black text-black">PT</span>
            </div>
            <h1 className="text-lg font-black text-white tracking-tight">projecttrading</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/binder"
              className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest"
            >
              Binder
            </Link>
            <button
              onClick={handleSignOut}
              className="text-xs font-bold text-zinc-500 hover:text-yellow-400 transition-colors uppercase tracking-widest"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Card Search */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
            Search Cards
          </h2>
          <CardSearch />
        </section>

        {/* Feed placeholder */}
        <section>
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
            Listings
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center ring-1 ring-yellow-400/10">
            <span className="text-4xl mb-4 block">🃏</span>
            <h3 className="text-white font-black text-lg mb-2">No listings yet</h3>
            <p className="text-zinc-500 text-sm">Seller cards and trade offers will appear here.</p>
          </div>
        </section>

      </div>
    </main>
  )
}

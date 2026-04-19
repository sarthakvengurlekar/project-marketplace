'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchRow {
  id: string
  user1_id: string
  user2_id: string
  created_at: string
}

interface OtherUser {
  id: string
  username: string
  avatar_url: string | null
  city: string | null
  country_code: string
  trade_rating: number | null
}

interface Match {
  id: string
  created_at: string
  other_user: OtherUser
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = { IN: '🇮🇳', UAE: '🇦🇪' }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function MatchSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-zinc-800 rounded w-1/3" />
        <div className="h-3 bg-zinc-800 rounded w-1/2" />
      </div>
      <div className="h-3 bg-zinc-800 rounded w-10" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const router = useRouter()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setCurrentUserId(user.id)

      const { data: rows, error } = await supabase
        .from('matches')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[matches] fetch error:', error)
        setLoading(false)
        return
      }

      const matchRows = (rows ?? []) as MatchRow[]
      if (matchRows.length === 0) { setLoading(false); return }

      const otherIds = matchRows.map(r =>
        r.user1_id === user.id ? r.user2_id : r.user1_id
      )

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, city, country_code, trade_rating')
        .in('id', otherIds)

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

      const result: Match[] = matchRows
        .map(r => {
          const otherId = r.user1_id === user.id ? r.user2_id : r.user1_id
          const profile = profileMap.get(otherId)
          if (!profile) return null
          return { id: r.id, created_at: r.created_at, other_user: profile as OtherUser }
        })
        .filter((m): m is Match => m !== null)

      setMatches(result)
      setLoading(false)
    }
    load()
  }, [router])

  return (
    <main className="min-h-screen bg-zinc-950 pb-16">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link
            href="/feed"
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors text-sm"
          >
            ←
          </Link>
          <h1 className="text-white font-black text-base tracking-tight flex-1">Matches</h1>
          {!loading && matches.length > 0 && (
            <span className="text-xs text-zinc-500 font-bold">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {loading ? (
          <div className="divide-y divide-zinc-800/50">
            {Array.from({ length: 4 }).map((_, i) => <MatchSkeleton key={i} />)}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-20 px-6">
            <span className="text-5xl mb-4 block">🤝</span>
            <h2 className="text-white font-black text-lg mb-2">No matches yet</h2>
            <p className="text-zinc-500 text-sm leading-relaxed mb-6">
              When someone you&apos;re interested in is also interested in you, they&apos;ll appear here.
            </p>
            <Link
              href="/feed"
              className="inline-block bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl px-6 py-3 text-sm transition-colors"
            >
              Browse Traders →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {matches.map(match => (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                className="flex items-center gap-3 p-4 hover:bg-zinc-900/50 active:bg-zinc-900 transition-colors"
              >
                {/* Avatar */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  {match.other_user.avatar_url ? (
                    <Image
                      src={match.other_user.avatar_url}
                      alt={match.other_user.username}
                      fill
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
                      <span className="text-yellow-400 font-black text-base uppercase">
                        {match.other_user.username[0]}
                      </span>
                    </div>
                  )}
                  {/* Match indicator dot */}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-950" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-black text-sm">@{match.other_user.username}</span>
                    <span className="text-sm leading-none">{FLAGS[match.other_user.country_code] ?? ''}</span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-0.5 truncate">
                    {[match.other_user.city, 'Tap to start trading'].filter(Boolean).join(' · ')}
                  </p>
                </div>

                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[10px] text-zinc-600">{timeAgo(match.created_at)}</span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400 border border-yellow-400/20 uppercase tracking-wide">
                    Matched
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

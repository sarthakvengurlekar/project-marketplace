'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BinderView from '@/components/BinderView'

export default function UserBinderPage() {
  const params = useParams()
  const username = params.username as string

  const [state, setState] = useState<{
    profileUserId: string
    profileUsername: string
    isOwner: boolean
  } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function init() {
      const [
        { data: { user } },
        { data: profile },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('id, username').eq('username', username).single(),
      ])

      if (!profile) { setNotFound(true); return }

      setState({
        profileUserId: profile.id,
        profileUsername: profile.username,
        isOwner: user?.id === profile.id,
      })
    }
    init()
  }, [username])

  if (notFound) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <h1 className="text-white font-black text-xl mb-2">@{username} not found</h1>
          <p className="text-zinc-500 text-sm mb-6">This user doesn&apos;t exist or hasn&apos;t set up their profile yet.</p>
          <Link href="/feed" className="text-yellow-400 hover:text-yellow-300 font-bold text-sm transition-colors">
            ← Back to Feed
          </Link>
        </div>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <BinderView
      profileUserId={state.profileUserId}
      profileUsername={state.profileUsername}
      isOwner={state.isOwner}
    />
  )
}

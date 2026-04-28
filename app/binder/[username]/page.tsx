'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BinderView from '@/components/BinderView'

export default function UserBinderPage() {
  const params = useParams()
  const router = useRouter()
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
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAF6EC' }}>
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <h1 className="font-black text-xl mb-2" style={{ color: '#0A0A0A' }}>@{username} not found</h1>
          <p className="text-sm mb-6" style={{ color: '#8B7866' }}>This user doesn&apos;t exist or hasn&apos;t set up their profile yet.</p>
          <button onClick={() => router.back()} className="font-bold text-sm" style={{ color: '#E8233B', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Back to Feed
          </button>
        </div>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: '#FAF6EC' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

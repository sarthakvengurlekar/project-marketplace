'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BinderView from '@/components/BinderView'

export default function MyBinderPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<{ id: string; username: string } | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', user.id)
        .single()

      if (!data) { router.replace('/onboarding'); return }

      setProfile(data)
      setChecking(false)
    }
    init()
  }, [router])

  if (checking) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (!profile) return null

  return <BinderView profileUserId={profile.id} profileUsername={profile.username} isOwner={true} />
}

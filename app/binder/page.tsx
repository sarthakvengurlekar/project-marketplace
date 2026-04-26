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
      <main className="min-h-screen flex items-center justify-center" style={{ background: '#FAF6EC' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  if (!profile) return null

  return <BinderView profileUserId={profile.id} profileUsername={profile.username} isOwner={true} />
}

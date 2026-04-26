'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import FeedClient, { type Seller } from '@/components/FeedClient'

export default function FeedPage() {
  const [sellers, setSellers]           = useState<Seller[] | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const [defaultFilter, setDefaultFilter] = useState('IN')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/feed-sellers')
      .then(async r => {
        if (r.status === 401) { router.push('/login'); return }
        const data = await r.json()
        setSellers(data.sellers)
        setCurrentUserId(data.currentUserId)
        setDefaultFilter(data.defaultFilter)
      })
      .catch(err => console.error('[feed] fetch error:', err))
  }, [router])

  if (sellers === null) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: '#FAF6EC' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #0A0A0A', borderTopColor: '#E8233B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    )
  }

  return (
    <FeedClient
      sellers={sellers}
      currentUserId={currentUserId}
      defaultFilter={defaultFilter}
    />
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

// ─── SVG icons ────────────────────────────────────────────────────────────────

function BinderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="4" y1="8" x2="20" y2="8"/>
      <line x1="9" y1="2" x2="9" y2="22"/>
    </svg>
  )
}

function FeedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
}

function TradesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4"/>
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { href: '/binder',  icon: <BinderIcon />,  label: 'Binder'  },
  { href: '/feed',    icon: <FeedIcon />,    label: 'Feed'    },
  { href: '/matches', icon: <TradesIcon />,  label: 'Trades'  },
  { href: '/profile', icon: <ProfileIcon />, label: 'Profile' },
] as const

const HIDDEN_PREFIXES = ['/login', '/signup', '/onboarding', '/binder/add-cards']

// ─── Component ────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname      = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  const isChatPage = pathname.startsWith('/matches/') && pathname !== '/matches'
  const isHidden   = HIDDEN_PREFIXES.some(p => pathname.startsWith(p)) || isChatPage

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/matches-list', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const all = data.matches ?? [...(data.buying ?? []), ...(data.selling ?? [])]
      const count = all.reduce((sum: number, m: {
        lastMessage?: { isUnread: boolean }
        status?: string
        role?: string
        pendingOffers?: Array<{ needsAction?: boolean }>
      }) => {
        const unread = m.lastMessage?.isUnread ? 1 : 0
        const pendingMatch = m.status === 'PENDING' && m.role === 'SELLER' ? 1 : 0
        const pendingOffers = (m.pendingOffers ?? []).filter(offer => offer.needsAction).length
        return sum + unread + pendingMatch + pendingOffers
      }, 0)
      setUnreadCount(count)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (isHidden) return
    fetchUnread()
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchUnread() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isHidden, fetchUnread])

  if (isHidden) return null

  // /binder/[username] (someone else's binder) should keep Feed active, not Binder
  const isOtherUserBinder = (() => {
    const segs = pathname.split('/').filter(Boolean)
    return segs[0] === 'binder' && segs.length >= 2 && segs[1] !== 'add-cards' && segs[1] !== 'card'
  })()

  const activeIndex = TABS.findIndex(tab => {
    if (tab.href === '/matches') return pathname === '/matches'
    if (tab.href === '/feed')   return pathname.startsWith('/feed') || isOtherUserBinder
    if (tab.href === '/binder') return !isOtherUserBinder && pathname.startsWith('/binder')
    return pathname.startsWith(tab.href)
  })

  return (
    <>
      <div style={{ height: 'calc(68px + env(safe-area-inset-bottom, 0px))' }} />

      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background:    '#0A0A0A',
          borderTop:     '2px solid #0A0A0A',
        }}
      >
        <div className="flex h-[68px] max-w-lg mx-auto">
          {TABS.map((tab, i) => {
            const isActive = activeIndex === i
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 relative flex flex-col items-center justify-center gap-[3px] select-none"
              >
                {/* Active yellow square bg */}
                {isActive && (
                  <div
                    className="absolute inset-[6px] rounded-xl"
                    style={{ background: '#F4D03F' }}
                  />
                )}

                {/* Icon + badge */}
                <div className="relative z-10">
                  <span style={{ color: isActive ? '#0A0A0A' : '#6b7280', display: 'block' }}>
                    {tab.icon}
                  </span>
                  {tab.href === '/matches' && unreadCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] text-white text-[8px] font-black rounded-full flex items-center justify-center px-[3px] leading-none"
                      style={{ background: '#E8233B', animation: 'navBadgePulse 1.8s ease-in-out infinite' }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>

                <span
                  className="relative z-10"
                  style={{
                    fontSize:   9,
                    fontWeight: isActive ? 800 : 500,
                    color:      isActive ? '#0A0A0A' : '#6b7280',
                    letterSpacing: '0.05em',
                    lineHeight: 1,
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

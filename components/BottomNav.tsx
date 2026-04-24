'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

const TABS = [
  { href: '/binder',  icon: '📦', label: 'Collection' },
  { href: '/feed',    icon: '🔍', label: 'Browse'     },
  { href: '/matches', icon: '💬', label: 'Trades'     },
  { href: '/profile', icon: '👤', label: 'Profile'    },
]

const HIDDEN_PREFIXES = ['/login', '/signup', '/onboarding', '/binder/add-cards']

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

export default function BottomNav() {
  const pathname    = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  const isChatPage = pathname.startsWith('/matches/') && pathname !== '/matches'
  const isHidden   = HIDDEN_PREFIXES.some(p => pathname.startsWith(p)) || isChatPage

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/matches-list', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const all = data.matches ?? [...(data.buying ?? []), ...(data.selling ?? [])]
      const count = all.filter((m: { lastMessage?: { isUnread: boolean }; status?: string; role?: string }) =>
        m.lastMessage?.isUnread || (m.status === 'PENDING' && m.role === 'SELLER')
      ).length
      setUnreadCount(count)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (isHidden) return
    fetchUnread()
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchUnread() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [isHidden, fetchUnread])

  if (isHidden) return null

  const activeIndex = TABS.findIndex(tab =>
    tab.href === '/matches'
      ? pathname === '/matches'
      : pathname.startsWith(tab.href)
  )

  return (
    <>
      {/* Page spacer — keeps content above the nav */}
      <div style={{ height: 'calc(72px + env(safe-area-inset-bottom, 0px))' }} />

      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'rgba(4, 4, 4, 0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 215, 0, 0.15)',
        }}
      >
        {/* Inner row — max-w-lg so pill math lines up on big screens */}
        <div className="relative flex h-[72px] max-w-lg mx-auto">

          {/* ── Sliding gold pill ─────────────────────────────────────────── */}
          {activeIndex >= 0 && (
            <div
              aria-hidden
              className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none"
              style={{
                width: '25%',
                left: `${activeIndex * 25}%`,
                transition: `left 0.32s ${SPRING}`,
              }}
            >
              <div
                style={{
                  width:        80,
                  height:       44,
                  borderRadius: 20,
                  background:   'linear-gradient(150deg, #fef08a 0%, #eab308 100%)',
                  boxShadow:    '0 0 14px rgba(255,215,0,0.45), 0 2px 10px rgba(0,0,0,0.35)',
                  transition:   `transform 0.32s ${SPRING}`,
                  transform:    'scale(1.05)',
                }}
              />
            </div>
          )}

          {/* ── Tab links ─────────────────────────────────────────────────── */}
          {TABS.map((tab, i) => {
            const isActive = activeIndex === i

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 relative z-10 flex flex-col items-center justify-center gap-[3px] select-none"
              >
                {/* Icon + unread badge */}
                <div className="relative">
                  <span
                    className="leading-none"
                    style={{
                      fontSize:   isActive ? 21 : 19,
                      display:    'block',
                      opacity:    isActive ? 1 : 0.42,
                      transform:  isActive ? 'scale(1.1)' : 'scale(0.92)',
                      transition: `all 0.3s ${SPRING}`,
                    }}
                  >
                    {tab.icon}
                  </span>

                  {tab.href === '/matches' && unreadCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-[3px] leading-none shadow-lg"
                      style={{ animation: 'navBadgePulse 1.8s ease-in-out infinite' }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  style={{
                    fontSize:     9,
                    fontWeight:   isActive ? 800 : 600,
                    letterSpacing: '0.06em',
                    lineHeight:   1,
                    color:        isActive ? '#111' : '#6b7280',
                    transition:   'color 0.2s ease',
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes navBadgePulse {
          0%,  100% { transform: scale(1.0); }
          50%        { transform: scale(1.15); }
        }
      `}</style>
    </>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'

// ─── Pokemon-themed SVG icons ─────────────────────────────────────────────────

function PokeballIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.5"/>
      <path d="M2.5 12h7M14.5 12H21.5"/>
      <circle cx="12" cy="12" r="2.5" fill={active ? 'currentColor' : 'none'}/>
    </svg>
  )
}

function PokedexIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4.5" y="2" width="15" height="20" rx="2.5"/>
      <circle cx="12" cy="14" r="3.5"/>
      <path d="M8 7h3M13 7h3"/>
    </svg>
  )
}

function TradeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3L3 7l4 4"/>
      <path d="M3 7h13a4 4 0 010 8H8"/>
      <path d="M17 21l4-4-4-4"/>
      <path d="M21 17H8a4 4 0 010-8h12"/>
    </svg>
  )
}

function TrainerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="3"/>
      <circle cx="9" cy="10" r="2.5"/>
      <path d="M5 19c0-2.2 1.8-4 4-4"/>
      <path d="M14 9h5M14 12h4M14 15h3"/>
    </svg>
  )
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { href: '/binder',  icon: (active: boolean) => <PokeballIcon active={active} />, label: 'Collection' },
  { href: '/feed',    icon: (_active: boolean) => <PokedexIcon />,                label: 'Browse'     },
  { href: '/matches', icon: (_active: boolean) => <TradeIcon />,                  label: 'Trades'     },
  { href: '/profile', icon: (_active: boolean) => <TrainerIcon />,                label: 'Profile'    },
] as const

const HIDDEN_PREFIXES = ['/login', '/signup', '/onboarding', '/binder/add-cards']

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

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
      const count = all.filter((m: { lastMessage?: { isUnread: boolean }; status?: string; role?: string }) =>
        m.lastMessage?.isUnread || (m.status === 'PENDING' && m.role === 'SELLER')
      ).length
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

  const activeIndex = TABS.findIndex(tab =>
    tab.href === '/matches'
      ? pathname === '/matches'
      : pathname.startsWith(tab.href)
  )

  return (
    <>
      <div style={{ height: 'calc(72px + env(safe-area-inset-bottom, 0px))' }} />

      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          paddingBottom:          'env(safe-area-inset-bottom, 0px)',
          background:             'rgba(10, 5, 20, 0.97)',
          backdropFilter:         'blur(24px)',
          WebkitBackdropFilter:   'blur(24px)',
          borderTop:              '1px solid rgba(139, 92, 246, 0.2)',
        }}
      >
        <div className="relative flex h-[72px] max-w-lg mx-auto">

          {/* Sliding electric yellow pill */}
          {activeIndex >= 0 && (
            <div
              aria-hidden
              className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none"
              style={{
                width:      '25%',
                left:       `${activeIndex * 25}%`,
                transition: `left 0.32s ${SPRING}`,
              }}
            >
              <div
                style={{
                  width:        82,
                  height:       46,
                  borderRadius: 23,
                  background:   'linear-gradient(135deg, #FFDE00 0%, #F4C430 100%)',
                  boxShadow:    '0 0 22px rgba(255,222,0,0.55), 0 0 44px rgba(255,222,0,0.2), 0 2px 8px rgba(0,0,0,0.4)',
                  transition:   `transform 0.32s ${SPRING}`,
                  transform:    'scale(1.05)',
                }}
              />
            </div>
          )}

          {TABS.map((tab, i) => {
            const isActive = activeIndex === i
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 relative z-10 flex flex-col items-center justify-center gap-[3px] select-none"
              >
                <div className="relative">
                  <span
                    style={{
                      display:    'block',
                      color:      isActive ? '#111' : '#6b7280',
                      opacity:    isActive ? 1 : 0.55,
                      transform:  isActive ? 'scale(1.08)' : 'scale(0.9)',
                      transition: `all 0.3s ${SPRING}`,
                    }}
                  >
                    {tab.icon(isActive)}
                  </span>

                  {tab.href === '/matches' && unreadCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 text-black text-[9px] font-black rounded-full flex items-center justify-center px-[3px] leading-none"
                      style={{
                        background: '#FFDE00',
                        animation:  'navBadgePulse 1.8s ease-in-out infinite',
                        boxShadow:  '0 0 10px rgba(255,222,0,0.7)',
                      }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>

                <span
                  style={{
                    fontSize:      9,
                    fontWeight:    isActive ? 800 : 600,
                    letterSpacing: '0.06em',
                    lineHeight:    1,
                    color:         isActive ? '#111' : '#6b7280',
                    transition:    'color 0.2s ease',
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

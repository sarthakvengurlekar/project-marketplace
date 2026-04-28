import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS    = ['/login', '/signup', '/forgot-password', '/reset-password']  // no auth needed
const AUTH_ONLY_PATHS = ['/onboarding']                // auth required, profile not required

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic    = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const isAuthOnly  = AUTH_ONLY_PATHS.some(p => pathname.startsWith(p))
  const isApi       = pathname.startsWith('/api/')

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Must be first Supabase call — refreshes session cookies
    const { data: { user } } = await supabase.auth.getUser()

    // ── Not authenticated ──────────────────────────────────────────────────────
    if (!user) {
      if (isPublic) return supabaseResponse
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // ── Authenticated, public path (login/signup) → send to feed ──────────────
    if (isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = '/feed'
      return NextResponse.redirect(url)
    }

    // ── Authenticated, API route → skip profile check ─────────────────────────
    if (isApi) return supabaseResponse

    // ── Authenticated, onboarding → let through (profile not required yet) ────
    if (isAuthOnly) return supabaseResponse

    // ── Authenticated, protected page → verify profile exists ─────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

  } catch {
    // Supabase unreachable — only block protected pages
    if (!isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

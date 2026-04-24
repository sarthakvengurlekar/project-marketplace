import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

// Known recent sets in reverse chronological order (newest first)
const FALLBACK_SETS = [
  { name: 'Mega Evolution—Perfect Order',      releaseDate: '2026-03-27', code: 'mev04' },
  { name: 'Mega Evolution—Ascended Heroes',    releaseDate: '2026-01-30', code: 'mev03' },
  { name: 'Mega Evolution—Phantasmal Flames',  releaseDate: '2025-11-14', code: 'mev02' },
  { name: 'Mega Evolution (Base Set)',           releaseDate: '2025-09-26', code: 'mev01' },
  { name: 'Scarlet & Violet—Black Bolt & White Flare', releaseDate: '2025-07-18', code: 'sv10' },
]

export async function GET() {
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()

  if (apiKey) {
    try {
      const res = await fetch(`${PPT_BASE}/sets?limit=10&sortBy=releaseDate&sortOrder=desc`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 86400 }, // 24h server cache
      })
      if (res.ok) {
        const data = await res.json()
        const raw: Array<{ name?: string; releaseDate?: string; code?: string; setCode?: string }> =
          Array.isArray(data) ? data : (data.data ?? data.sets ?? [])
        if (raw.length > 0) {
          const sets = raw.slice(0, 5).map(s => ({
            name:        s.name ?? '',
            releaseDate: s.releaseDate ?? '',
            code:        s.code ?? s.setCode ?? '',
          }))
          return NextResponse.json({ sets })
        }
      }
    } catch {
      // fall through to hardcoded list
    }
  }

  return NextResponse.json({ sets: FALLBACK_SETS })
}

import { NextRequest, NextResponse } from 'next/server'

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
  if (!apiKey) {
    console.error('[search-cards] POKEMON_PRICE_TRACKER_API_KEY is not set')
    return NextResponse.json({ error: 'PPT API key not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${PPT_BASE}/cards?search=${encodeURIComponent(q)}&limit=20`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 0 },
      }
    )

    if (!res.ok) {
      console.error(`[search-cards] PPT API returned ${res.status}`)
      return NextResponse.json({ error: `PPT API error ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[search-cards] fetch error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

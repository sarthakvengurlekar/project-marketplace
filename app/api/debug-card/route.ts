import { NextRequest, NextResponse } from 'next/server'

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

export async function GET(request: NextRequest) {
  const cardId = request.nextUrl.searchParams.get('card_id') ?? '676096'

  const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
  if (!pptKey) {
    return NextResponse.json({ error: 'POKEMON_PRICE_TRACKER_API_KEY not set' }, { status: 500 })
  }

  const auth = { Authorization: `Bearer ${pptKey}` }
  const base = `${PPT_BASE}/cards?tcgPlayerId=${encodeURIComponent(cardId)}`

  const urls = [
    base,
    `${base}&includeHistory=true&days=30`,
    `${base}&includeEbay=true`,
  ]

  const results: { url: string; status: number; body: unknown }[] = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const res = await fetch(url, { headers: auth, cache: 'no-store' })
      const body = await res.json().catch(() => null)
      console.log(`CALL ${i + 1} [${res.status}] ${url}`)
      console.log(`CALL ${i + 1}:`, JSON.stringify(body, null, 2))
      results.push({ url, status: res.status, body })
    } catch (err) {
      console.error(`CALL ${i + 1} threw:`, err)
      results.push({ url, status: 0, body: String(err) })
    }
  }

  return NextResponse.json({ card_id: cardId, calls: results })
}

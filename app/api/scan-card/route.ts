import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const SYSTEM_PROMPT =
  'This is a Pokemon trading card. Look carefully at the card name printed at the top, the set symbol on the right side, and the card number at the bottom. Return ONLY a valid JSON object with these exact fields: card_name (string), set_name (string), card_number (string), is_foil (boolean, set to true if the card has a holographic or special finish). If you cannot identify the card clearly, return exactly: {"error": "unidentified"}'

interface ScanResult {
  card_name: string
  set_name: string
  card_number: string
  is_foil: boolean
}

interface TcgCard {
  id: string
  name: string
  number: string
  set: { id: string; name: string }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function pickBestMatch(cards: TcgCard[], result: ScanResult): TcgCard {
  const exact = cards.find(
    (c) =>
      c.number === result.card_number &&
      c.set.name.toLowerCase().includes(result.set_name.toLowerCase().slice(0, 6))
  )
  return exact ?? cards[0]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const imageBase64: string | undefined = body?.imageBase64

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('[scan-card] OPENAI_API_KEY is not set')
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // ── GPT-4o vision ─────────────────────────────────────────────────────────
    console.log('[scan-card] Sending image to GPT-4o, base64 length:', imageBase64.length)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    })

    const rawContent = completion.choices[0]?.message?.content ?? ''
    console.log('[scan-card] GPT-4o raw response:', rawContent)

    // Strip markdown fences GPT-4o sometimes adds
    const cleaned = rawContent.replace(/```json\s*|```\s*/g, '').trim()

    let parsed: ScanResult | { error: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[scan-card] JSON parse failed for:', cleaned)
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    if ('error' in parsed) {
      console.log('[scan-card] GPT-4o could not identify the card')
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    const result = parsed as ScanResult
    console.log('[scan-card] Identified:', result)

    // ── Pokémon TCG search ────────────────────────────────────────────────────
    const tcgHeaders: HeadersInit = {}
    const tcgKey = process.env.POKEMON_TCG_API_KEY?.trim()
    if (tcgKey) tcgHeaders['X-Api-Key'] = tcgKey

    const tcgSearch = async (query: string): Promise<TcgCard[] | null> => {
      const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=20`
      console.log('[scan-card] TCG search:', url)
      const res = await fetch(url, { headers: tcgHeaders, cache: 'no-store' })
      if (!res.ok) {
        console.error('[scan-card] TCG API returned', res.status, 'for query:', query)
        return null
      }
      const { data } = await res.json()
      return Array.isArray(data) && data.length > 0 ? data : null
    }

    // 1. Exact quoted name
    let cards = await tcgSearch(`name:"${result.card_name}"`)

    // 2. Wildcard unquoted name
    if (!cards) {
      cards = await tcgSearch(`name:${result.card_name}*`)
    }

    if (!cards) {
      console.log('[scan-card] No TCG cards found for:', result.card_name)
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    const bestMatch = pickBestMatch(cards, result)
    console.log('[scan-card] Best match:', bestMatch.name, bestMatch.set.name, bestMatch.number)

    return NextResponse.json({ card: bestMatch, is_foil: result.is_foil })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[scan-card] Unhandled error:', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

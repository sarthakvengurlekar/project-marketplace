import { NextRequest, NextResponse } from 'next/server'

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

function pickBestMatch(cards: TcgCard[], result: ScanResult): TcgCard {
  // Prefer exact card number + set name match, fall back to first result
  const exact = cards.find(
    (c) =>
      c.number === result.card_number &&
      c.set.name.toLowerCase().includes(result.set_name.toLowerCase().slice(0, 6))
  )
  return exact ?? cards[0]
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const imageBase64: string | undefined = body?.imageBase64

  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  // ── GPT-4o vision ─────────────────────────────────────────────────────────
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
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
                detail: 'high',
              },
            },
          ],
        },
      ],
    }),
  })

  if (!openaiRes.ok) {
    const text = await openaiRes.text()
    console.error('[scan-card] OpenAI error:', openaiRes.status, text)
    return NextResponse.json({ error: 'Vision API failed' }, { status: 502 })
  }

  const openaiData = await openaiRes.json()
  const rawContent: string = openaiData.choices?.[0]?.message?.content ?? ''

  // Strip markdown fences GPT-4o sometimes adds
  const cleaned = rawContent.replace(/```json\s*|```\s*/g, '').trim()

  let parsed: ScanResult | { error: string }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.error('[scan-card] Could not parse GPT response:', rawContent)
    return NextResponse.json({ error: 'unidentified' }, { status: 404 })
  }

  if ('error' in parsed) {
    return NextResponse.json({ error: 'unidentified' }, { status: 404 })
  }

  const result = parsed as ScanResult

  // ── Pokémon TCG search ────────────────────────────────────────────────────
  const tcgHeaders: HeadersInit = {}
  const tcgKey = process.env.POKEMON_TCG_API_KEY?.trim()
  if (tcgKey) tcgHeaders['X-Api-Key'] = tcgKey

  const tcgRes = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(result.card_name)}&pageSize=20`,
    { headers: tcgHeaders, next: { revalidate: 0 } }
  )

  if (!tcgRes.ok) {
    console.error('[scan-card] TCG API error:', tcgRes.status)
    return NextResponse.json({ error: 'TCG API failed' }, { status: 502 })
  }

  const { data: cards } = await tcgRes.json()

  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ error: 'unidentified' }, { status: 404 })
  }

  const bestMatch = pickBestMatch(cards, result)

  return NextResponse.json({
    card: bestMatch,
    is_foil: result.is_foil,
  })
}

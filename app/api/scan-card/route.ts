import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const SYSTEM_PROMPT =
  'This is a Pokemon trading card. Look carefully at the card name at the top, and especially the bottom of the card where you will find a card number like "158/191" and a small set code like "SSP" or "sv8". Return ONLY a valid JSON object with these exact fields: card_name (string), set_name (string), card_number (string, the full number shown e.g. "158/191"), set_code (string, the small alphanumeric code at the bottom left e.g. "SSP", "sv8", "swsh1"), total_cards (number, the total after the slash e.g. 191, or 0 if unknown), is_foil (boolean, true if holographic or special finish). If you cannot identify the card clearly, return exactly: {"error": "unidentified"}'

interface ScanResult {
  card_name: string
  set_name: string
  card_number: string
  set_code: string
  total_cards: number
  is_foil: boolean
}

interface PptCard {
  tcgPlayerId?: string | number
  name?: string
  setName?: string
  setId?: string | number
  cardNumber?: string | number
  number?: string | number
  totalSetNumber?: number | string
  rarity?: string
  imageCdnUrl400?: string
  imageCdnUrl200?: string
  imageUrl?: string
  prices?: { market?: number | null; low?: number | null; high?: number | null }
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

function pickBestMatch(cards: PptCard[], result: ScanResult): PptCard {
  const scannedNum   = result.card_number.trim()
  const scannedTotal = result.total_cards
  const scannedName  = result.card_name.toLowerCase().trim()
  const scannedHasEx = /\bex\b/i.test(scannedName)

  let best = cards[0]
  let bestScore = -1

  for (const c of cards) {
    const cNum   = String(c.cardNumber ?? c.number ?? '').trim()
    const cTotal = Number(c.totalSetNumber ?? 0)
    const cName  = (c.name ?? '').toLowerCase().trim()
    const cHasEx = /\bex\b/i.test(cName)

    let score = 0

    // Exact full card number match (e.g. "158/191")
    if (cNum === scannedNum) score += 100

    // Name: penalise ex/EX when the scanned card is not ex
    if (!scannedHasEx && !cHasEx) score += 50
    if (!scannedHasEx && cHasEx)  score -= 50

    // Total set size match
    if (scannedTotal > 0 && cTotal === scannedTotal) score += 30

    // Name contains scanned name
    if (cName.includes(scannedName)) score += 10

    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  return best
}

export async function POST(request: NextRequest) {
  try {
    // ── Parse request body ────────────────────────────────────────────────────
    let body: { imageBase64?: string } | null = null
    try {
      body = await request.json()
    } catch (parseErr) {
      console.error('[scan-card] Failed to parse request body:', parseErr)
      return NextResponse.json({ error: 'Invalid JSON body', details: String(parseErr) }, { status: 400 })
    }

    const imageBase64 = body?.imageBase64
    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
    }

    console.log('[scan-card] imageBase64 length:', imageBase64.length)

    // ── Check environment variables ───────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY?.trim()
    if (!openaiKey) {
      console.error('[scan-card] OPENAI_API_KEY is not set')
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
    if (!pptKey) {
      console.error('[scan-card] POKEMON_PRICE_TRACKER_API_KEY is not set')
      return NextResponse.json({ error: 'PPT API key not configured' }, { status: 500 })
    }

    // ── GPT-4o vision ─────────────────────────────────────────────────────────
    console.log('[scan-card] Calling GPT-4o vision...')
    let rawContent: string
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 250,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
              },
            ],
          },
        ],
      })
      rawContent = completion.choices[0]?.message?.content ?? ''
      console.log('[scan-card] GPT-4o raw response:', rawContent)
    } catch (openaiErr) {
      console.error('[scan-card] OpenAI API error:', openaiErr)
      return NextResponse.json(
        { error: 'OpenAI request failed', details: String(openaiErr) },
        { status: 500 }
      )
    }

    // ── Parse GPT-4o response ─────────────────────────────────────────────────
    const cleaned = rawContent.replace(/```json\s*|```\s*/g, '').trim()

    let parsed: ScanResult | { error: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch (jsonErr) {
      console.error('[scan-card] JSON parse failed:', cleaned, jsonErr)
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    if ('error' in parsed) {
      console.log('[scan-card] GPT-4o could not identify the card')
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    const result = parsed as ScanResult
    console.log('[scan-card] Identified:', JSON.stringify(result))

    // ── PPT search ────────────────────────────────────────────────────────────
    const pptUrl = `${PPT_BASE}/cards?search=${encodeURIComponent(result.card_name)}&limit=20`
    console.log('[scan-card] PPT search URL:', pptUrl)

    let pptData: { data?: PptCard[]; cards?: PptCard[] }
    try {
      const pptRes = await fetch(pptUrl, {
        headers: { Authorization: `Bearer ${pptKey}` },
      })
      console.log('[scan-card] PPT response status:', pptRes.status)
      if (!pptRes.ok) {
        const pptBody = await pptRes.text().catch(() => '')
        console.error('[scan-card] PPT API error body:', pptBody)
        return NextResponse.json(
          { error: 'PPT API error', details: `status ${pptRes.status}: ${pptBody}` },
          { status: 502 }
        )
      }
      pptData = await pptRes.json()
    } catch (pptErr) {
      console.error('[scan-card] PPT fetch error:', pptErr)
      return NextResponse.json(
        { error: 'PPT fetch failed', details: String(pptErr) },
        { status: 502 }
      )
    }

    const cards: PptCard[] = pptData.data ?? pptData.cards ?? []
    console.log('[scan-card] PPT cards count:', cards.length)

    if (cards.length === 0) {
      console.log('[scan-card] No PPT cards found for:', result.card_name)
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    const bestMatch = pickBestMatch(cards, result)
    console.log(
      '[scan-card] Best match:',
      bestMatch.name,
      '|', bestMatch.setName,
      '| #', bestMatch.cardNumber ?? bestMatch.number,
      '| setId:', bestMatch.setId
    )

    return NextResponse.json({ card: bestMatch, is_foil: result.is_foil, scan_result: result })

  } catch (error) {
    console.error('[scan-card] Unhandled error:', error)
    if (error instanceof Error) {
      console.error('[scan-card] Stack:', error.stack)
    }
    return NextResponse.json(
      { error: 'Scan failed', details: String(error) },
      { status: 500 }
    )
  }
}

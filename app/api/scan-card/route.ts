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
  externalCatalogId?: string | number
  name?: string
  setName?: string
  setId?: string | number
  cardNumber?: string | number
  number?: string | number
  totalSetNumber?: number | string
  rarity?: string
  imageCdnUrl200?: string
  imageCdnUrl400?: string
  imageCdnUrl800?: string
  imageUrl?: string
  prices?: {
    market?: number | null
    low?: number | null
    high?: number | null
    primaryPrinting?: string | null
  }
  // Rich card data
  hp?: string | number
  stage?: string
  cardType?: string
  pokemonType?: string
  energyType?: string[]
  weakness?: string
  resistance?: string
  retreatCost?: string | number
  attacks?: Array<{ name: string; damage?: string; text?: string; cost?: string[] }>
  flavorText?: string
  artist?: string
  tcgPlayerUrl?: string
  printingsAvailable?: string[]
  dataCompleteness?: string
  lastScrapedAt?: string
  lowConfidence?: boolean
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

function extractNumPrefix(numStr: string): string {
  return numStr.includes('/') ? numStr.split('/')[0] : numStr
}

function extractSetPrefix(externalCatalogId: string): string {
  const dashIdx = externalCatalogId.lastIndexOf('-')
  return dashIdx > 0 ? externalCatalogId.slice(0, dashIdx) : externalCatalogId
}

function pickBestMatch(cards: PptCard[], result: ScanResult): { card: PptCard; score: number } | null {
  const scannedNum    = result.card_number.trim()
  const scannedPrefix = extractNumPrefix(scannedNum)
  const scannedTotal  = result.total_cards
  const scannedName   = result.card_name.toLowerCase().trim()
  const scannedCode   = result.set_code.toLowerCase()
  // Does the scanned name have a parenthetical variant like "(Delta Species)"?
  const scannedHasParen = /\(/.test(result.card_name)

  const scored = cards.map(c => {
    const cNum    = String(c.cardNumber ?? c.number ?? '').trim()
    const cPrefix = extractNumPrefix(cNum)
    const cTotal  = Number(c.totalSetNumber ?? 0)
    const cName   = (c.name ?? '').trim()
    const cNameLc = cName.toLowerCase()
    const cExtId  = String(c.externalCatalogId ?? '').toLowerCase()
    const cSetId  = String(c.setId ?? '').toLowerCase()

    let score = 0

    // ── 1. Set code match (+100) ──────────────────────────────────────────────
    if (scannedCode) {
      const extPrefix    = extractSetPrefix(cExtId)
      const equivalentSv = SET_CODE_TO_EXT_PREFIX[result.set_code.toUpperCase()]
      const directHit    = extPrefix === scannedCode || cExtId.includes(scannedCode) || cSetId.includes(scannedCode)
      const svHit        = !!equivalentSv && cExtId.startsWith(equivalentSv)
      if (directHit || svHit) score += 100
    }

    // ── 2. Exact card number match (+80) ──────────────────────────────────────
    if (cNum === scannedNum) {
      score += 80
    // ── 3. Card number prefix match (+40) ────────────────────────────────────
    } else if (cPrefix === scannedPrefix && scannedPrefix !== '') {
      score += 40
    // ── 3b. No prefix match at all (−20) ─────────────────────────────────────
    } else if (scannedPrefix !== '' && cPrefix !== scannedPrefix) {
      score -= 20
    }

    // ── 4. Total set size match (+30) ─────────────────────────────────────────
    if (scannedTotal > 0 && cTotal === scannedTotal) score += 30

    // ── 5. Name exact match (+25) ─────────────────────────────────────────────
    if (cNameLc === scannedName) {
      score += 25
    // ── 6. Name contains match (+10) ─────────────────────────────────────────
    } else if (cNameLc.includes(scannedName)) {
      score += 10
    }

    // ── 7a. Vintage penalty (−60) ─────────────────────────────────────────────
    // Modern large-set scan (>150 cards) should never match to old <100-card sets
    if (scannedTotal > 150 && cTotal > 0 && cTotal < 100) score -= 60

    // ── 7b. Parenthetical variant penalty (−40) ───────────────────────────────
    // e.g. scanned "Latias ex" should not match "Latias ex (Delta Species)"
    if (!scannedHasParen && /\(/.test(cName)) score -= 40

    return { c, score, cNum, cPrefix, cTotal, cName: cName || '(unknown)' }
  })

  scored.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : (Number(b.cTotal) - Number(a.cTotal)) // tiebreak: prefer more modern (larger) set
  )

  console.log('[scan-card] Top 3 candidates:')
  scored.slice(0, 3).forEach((item, i) => {
    console.log(
      `  [${i + 1}] "${item.cName}" | #${item.cNum} | total:${item.cTotal} | score:${item.score}`
    )
  })

  if (!scored[0]) return null

  return { card: scored[0].c, score: scored[0].score }
}

const CONFIDENT_THRESHOLD = 10

const SET_CODE_TO_PPT_NAME: Record<string, string> = {
  // Scarlet & Violet
  SSP:  'SV08: Surging Sparks',
  SV08: 'SV08: Surging Sparks',
  SCR:  'SV07: Stellar Crown',
  SV07: 'SV07: Stellar Crown',
  TWM:  'SV06: Twilight Masquerade',
  SV06: 'SV06: Twilight Masquerade',
  TEF:  'SV05: Temporal Forces',
  SV05: 'SV05: Temporal Forces',
  PAF:  'SV04.5: Paldean Fates',
  PAR:  'SV04: Paradox Rift',
  SV04: 'SV04: Paradox Rift',
  OBF:  'SV03: Obsidian Flames',
  SV03: 'SV03: Obsidian Flames',
  PAL:  'SV02: Paldea Evolved',
  SV02: 'SV02: Paldea Evolved',
  SVI:  'SV01: Scarlet & Violet',
  SV01: 'SV01: Scarlet & Violet',
  PRE:  'SV08.5: Prismatic Evolutions',
  SVP:  'SV: Black Star Promos',
  // Sword & Shield
  CRZ:  'SWSH12.5: Crown Zenith',
  SIT:  'SWSH12: Silver Tempest',
  LOR:  'SWSH11: Lost Origin',
  PGO:  'SWSH10.5: Pokemon GO',
  ASR:  'SWSH10: Astral Radiance',
  BRS:  'SWSH09: Brilliant Stars',
  FST:  'SWSH08: Fusion Strike',
  CEL:  'SWSH07.5: Celebrations',
  EVS:  'SWSH07: Evolving Skies',
  CRE:  'SWSH06: Chilling Reign',
  BST:  'SWSH05: Battle Styles',
  SHF:  'SWSH045: Shining Fates',
  VIV:  'SWSH04: Vivid Voltage',
  DAA:  'SWSH03: Darkness Ablaze',
  RCL:  'SWSH02: Rebel Clash',
  SSH:  'SWSH01: Sword & Shield',
  SWSH: 'SWSH01: Sword & Shield',
}

// Maps TCG set codes to the PPT externalCatalogId prefix (e.g. SSP → "sv08")
const SET_CODE_TO_EXT_PREFIX: Record<string, string> = {
  // Scarlet & Violet
  SSP:  'sv08',
  SV08: 'sv08',
  SCR:  'sv07',
  SV07: 'sv07',
  TWM:  'sv06',
  SV06: 'sv06',
  TEF:  'sv05',
  SV05: 'sv05',
  PAR:  'sv04',
  SV04: 'sv04',
  PAF:  'sv04.5',
  OBF:  'sv03',
  SV03: 'sv03',
  PAL:  'sv02',
  SV02: 'sv02',
  SVI:  'sv01',
  SV01: 'sv01',
  PRE:  'sv08.5',
  // Sword & Shield
  CRZ:  'swsh12.5',
  SIT:  'swsh12',
  LOR:  'swsh11',
  PGO:  'swsh10.5',
  ASR:  'swsh10',
  BRS:  'swsh09',
  FST:  'swsh08',
  EVS:  'swsh07',
  CRE:  'swsh06',
  BST:  'swsh05',
  VIV:  'swsh04',
  DAA:  'swsh03',
  RCL:  'swsh02',
  SSH:  'swsh01',
  SWSH: 'swsh01',
}

async function fetchSetCards(setName: string, apiKey: string): Promise<PptCard[]> {
  const params = new URLSearchParams({ set: setName, limit: '300' })
  const url = `${PPT_BASE}/cards?${params.toString()}`
  console.log(`[scan] Fetching set: ${setName}`)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) {
    console.error('[scan] Set fetch returned', res.status, 'for set:', setName)
    return []
  }
  const data = await res.json()
  const cards: PptCard[] = data.data ?? data.cards ?? []
  console.log(`[scan] Set fetch returned ${cards.length} cards`)
  return cards
}

async function searchPPT(
  query: string,
  apiKey: string,
  extra: Record<string, string> = {},
): Promise<PptCard[]> {
  const params = new URLSearchParams({ search: query, limit: '20', ...extra })
  const url = `${PPT_BASE}/cards?${params.toString()}`
  console.log('[scan-card] PPT search:', url)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) {
    console.error('[scan-card] PPT returned', res.status, 'for query:', query)
    return []
  }
  const data = await res.json()
  return data.data ?? data.cards ?? []
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

    // ── Step 0: Set fetch → exact card number match ───────────────────────────
    const mappedSetName = SET_CODE_TO_PPT_NAME[result.set_code.toUpperCase()]
    const extPrefix     = SET_CODE_TO_EXT_PREFIX[result.set_code.toUpperCase()]
    const numPrefix     = result.card_number.includes('/')
      ? result.card_number.split('/')[0]
      : result.card_number

    if (mappedSetName && numPrefix) {
      const setCards  = await fetchSetCards(mappedSetName, pptKey)
      const catalogId = extPrefix ? `${extPrefix}-${numPrefix}` : null

      const setMatch = setCards.find(c => {
        const cNum   = String(c.cardNumber ?? c.number ?? '')
        const cExtId = String(c.externalCatalogId ?? '').toLowerCase()
        return cNum === result.card_number
          || cNum.startsWith(numPrefix)
          || (catalogId && cExtId === catalogId)
      })

      if (setMatch) {
        console.log(`[scan] Set match found: ${setMatch.name}`)
        return NextResponse.json({ card: setMatch, is_foil: result.is_foil, scan_result: result })
      }
      console.log(`[scan] No set match for ${result.card_number} in "${mappedSetName}", falling back to name search`)
    }

    // ── Step 1: name + card_number combined search ────────────────────────────
    const primaryQuery = `${result.card_name} ${result.card_number}`
    const primaryCards = await searchPPT(primaryQuery, pptKey, { limit: '5' })
    console.log(`[scan-card] Primary search: ${primaryQuery} → ${primaryCards.length} results`)

    if (primaryCards.length > 0) {
      const best = pickBestMatch(primaryCards, result)
      if (best) {
        const lowConfidence = best.score < CONFIDENT_THRESHOLD
        const card = lowConfidence ? { ...best.card, lowConfidence: true } : best.card
        console.log(
          `[scan-card] Primary winner (score:${best.score}, lowConfidence:${lowConfidence}):`,
          best.card.name, '| #', best.card.cardNumber ?? best.card.number
        )
        return NextResponse.json({ card, is_foil: result.is_foil, scan_result: result })
      }
    }

    // ── Step 2: name-only fallback ────────────────────────────────────────────
    const fallbackCards = await searchPPT(result.card_name, pptKey, { limit: '20' })
    console.log(`[scan-card] Fallback search: ${result.card_name} → ${fallbackCards.length} results`)

    if (fallbackCards.length === 0) {
      console.log('[scan-card] No candidates found')
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    const fallbackBest = pickBestMatch(fallbackCards, result)
    if (!fallbackBest) {
      console.log('[scan-card] No candidates found')
      return NextResponse.json({ error: 'unidentified' }, { status: 404 })
    }

    const lowConfidence = fallbackBest.score < CONFIDENT_THRESHOLD
    const card = lowConfidence ? { ...fallbackBest.card, lowConfidence: true } : fallbackBest.card

    console.log(
      `[scan-card] Fallback winner (score:${fallbackBest.score}, lowConfidence:${lowConfidence}):`,
      fallbackBest.card.name, '| set:', fallbackBest.card.setName,
      '| #', fallbackBest.card.cardNumber ?? fallbackBest.card.number
    )

    return NextResponse.json({ card, is_foil: result.is_foil, scan_result: result })

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

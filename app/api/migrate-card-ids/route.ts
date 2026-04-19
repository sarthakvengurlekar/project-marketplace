import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Prereq: ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS tcgplayer_id text;

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Service-role client bypasses RLS — safe for server-side migration only
function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

// Strip card-type suffixes and special characters so PPT search works
function cleanForSearch(name: string): string {
  return name
    .replace(/\s*&\s*/g, ' ')                          // "X & Y" → "X Y"
    .replace(/-(GX|EX|VMAX|VSTAR|V)\b/gi, '')          // hyphenated suffixes
    .replace(/\s+(GX|EX|VMAX|VSTAR|V|TAG TEAM)$/i, '') // trailing space-suffixes
    .replace(/[^\w\s]/g, ' ')                           // remaining special chars
    .replace(/\s+/g, ' ')
    .trim()
}

// Grab just the first Pokémon name — first word >2 chars that looks like a name
function firstPokemonName(name: string): string {
  const cleaned = cleanForSearch(name)
  const words = cleaned.split(' ').filter(w => w.length > 2)
  return words[0] ?? cleaned.split(' ')[0]
}

// Normalise a card number for comparison (strip leading zeros, "/nnn" suffix)
function normaliseNum(s: string): string {
  return s.toLowerCase().replace(/\/\d+$/, '').replace(/^0+/, '') || s.toLowerCase()
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface CardRow {
  id: string
  name: string
  set_name: string | null
  card_number: string | null
}

interface PptResult {
  tcgPlayerId?: string | number
  name?: string
  setName?: string
  cardNumber?: string
  number?: string
}

function scoreMatch(card: CardRow, result: PptResult): number {
  const cardCleaned   = cleanForSearch(card.name).toLowerCase()
  const resultCleaned = cleanForSearch(result.name ?? '').toLowerCase()

  if (!resultCleaned) return 0

  const cardWords   = cardCleaned.split(/\s+/).filter(w => w.length > 2)
  const resultWords = resultCleaned.split(/\s+/).filter(w => w.length > 2)

  if (cardWords.length === 0 || resultWords.length === 0) return 0

  // Word overlap (Jaccard-style)
  const common = cardWords.filter(w => resultWords.includes(w))
  if (common.length === 0) return 0

  let score = common.length / Math.max(cardWords.length, resultWords.length)

  // Set name bonus
  const cardSet   = (card.set_name ?? '').toLowerCase()
  const resultSet = (result.setName ?? '').toLowerCase()
  if (cardSet && resultSet && (cardSet.includes(resultSet) || resultSet.includes(cardSet))) {
    score += 0.3
  }

  // Card number bonus
  const cardNum   = normaliseNum(card.card_number ?? '')
  const resultNum = normaliseNum(result.cardNumber ?? result.number ?? '')
  if (cardNum && resultNum && cardNum === resultNum) {
    score += 0.4
  }

  return Math.min(score, 1)
}

// ─── PPT search helper ────────────────────────────────────────────────────────

async function searchPPT(term: string, pptKey: string): Promise<PptResult[]> {
  const url = `${PPT_BASE}/cards?search=${encodeURIComponent(term)}&limit=10`
  console.log('[migrate] PPT search:', url)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pptKey}` },
      cache: 'no-store',
    })
    console.log('[migrate] PPT status:', res.status)
    if (!res.ok) return []
    const json = await res.json()
    const results: PptResult[] = Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : []
    console.log('[migrate] PPT results count:', results.length,
      '| names:', results.map(r => `"${r.name}" (${r.setName})`).join(', '))
    return results
  } catch (err) {
    console.error('[migrate] PPT fetch error:', err)
    return []
  }
}

function pickBest(card: CardRow, results: PptResult[]): { best: PptResult; score: number } | null {
  let bestScore = 0
  let best: PptResult | null = null
  for (const r of results) {
    const s = scoreMatch(card, r)
    console.log(`[migrate]   score ${s.toFixed(2)} — "${r.name}" (${r.setName})`)
    if (s > bestScore) { bestScore = s; best = r }
  }
  return best && bestScore > 0 ? { best, score: bestScore } : null
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const pptKey = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim()
  if (!pptKey) {
    return NextResponse.json({ error: 'POKEMON_PRICE_TRACKER_API_KEY not set' }, { status: 500 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const sb = serviceClient()

  const { data: cards, error } = await sb
    .from('cards')
    .select('id, name, set_name, card_number')
    .or('tcgplayer_id.is.null,tcgplayer_id.eq.')

  if (error) {
    return NextResponse.json({
      error: 'Query failed. Run: ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS tcgplayer_id text;',
      detail: error.message,
    }, { status: 500 })
  }

  if (!cards?.length) {
    return NextResponse.json({ total: 0, matched: 0, unmatched: 0, details: [] })
  }

  console.log('[migrate] cards to process:', cards.length, cards.map(c => c.name))

  type Detail = {
    id: string; name: string; set: string | null; status: string
    tcgplayer_id?: string; matchedName?: string; matchedSet?: string; score?: number
    searchTerms?: string[]
  }
  const details: Detail[] = []
  let matched = 0

  for (const card of cards) {
    console.log(`\n[migrate] ── Processing: "${card.name}" (${card.set_name ?? 'no set'}, #${card.card_number ?? '?'})`)

    const cleanedFull  = cleanForSearch(card.name)
    const firstWord    = firstPokemonName(card.name)
    const searchTerms  = [cleanedFull]
    if (firstWord !== cleanedFull) searchTerms.push(firstWord)

    let matched_result: { best: PptResult; score: number } | null = null

    for (const term of searchTerms) {
      console.log(`[migrate] trying search term: "${term}"`)
      const results = await searchPPT(term, pptKey)
      matched_result = pickBest(card, results)
      if (matched_result && matched_result.score >= 0.3) break
      await delay(200)
    }

    if (!matched_result || matched_result.score < 0.3) {
      console.log(`[migrate] NO MATCH for "${card.name}" (best score: ${matched_result?.score?.toFixed(2) ?? '—'})`)
      details.push({ id: card.id, name: card.name, set: card.set_name, status: 'no match', searchTerms, score: matched_result?.score })
      await delay(200)
      continue
    }

    const { best, score } = matched_result
    const tcgId = String(best.tcgPlayerId!)
    console.log(`[migrate] MATCH "${card.name}" → "${best.name}" (${best.setName}) tcgPlayerId=${tcgId} score=${score.toFixed(2)}`)

    const { error: upErr } = await sb
      .from('cards')
      .update({ tcgplayer_id: tcgId })
      .eq('id', card.id)

    if (upErr) {
      console.error('[migrate] DB update error:', upErr.message)
      details.push({ id: card.id, name: card.name, set: card.set_name, status: `db error: ${upErr.message}`, searchTerms })
    } else {
      details.push({ id: card.id, name: card.name, set: card.set_name, status: 'matched', tcgplayer_id: tcgId, matchedName: best.name, matchedSet: best.setName, score, searchTerms })
      matched++
    }

    await delay(200)
  }

  console.log(`\n[migrate] Done: ${matched}/${cards.length} matched`)
  return NextResponse.json({ total: cards.length, matched, unmatched: cards.length - matched, details })
}

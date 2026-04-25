import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PPT_BASE = 'https://www.pokemonpricetracker.com/api/v2'

// Known recent sets in reverse chronological order (newest first)
const FALLBACK_SETS = [
  { name: 'Mega Evolution—Perfect Order',     releaseDate: '2026-03-27', code: 'mev04' },
  { name: 'Mega Evolution—Ascended Heroes',   releaseDate: '2026-01-30', code: 'mev03' },
  { name: 'Mega Evolution—Phantasmal Flames', releaseDate: '2025-11-14', code: 'mev02' },
  { name: 'Scarlet & Violet—Surging Sparks',  releaseDate: '2024-11-08', code: 'sv08'  },
  { name: 'Scarlet & Violet—Stellar Crown',   releaseDate: '2024-09-13', code: 'sv07'  },
]

export async function GET() {
  return NextResponse.json({ sets: FALLBACK_SETS })
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const FEED_SELLER_EMAIL = 'e2e-feed-seller@example.com'
const MATCH_USER_EMAIL = 'e2e-match-user@example.com'

type SeedUser = {
  id: string
  email?: string
}

type EnvMap = Record<string, string>

function parseEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {}

  const env: EnvMap = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function getAdminClient(): SupabaseClient {
  const localEnv = parseEnvFile(path.join(process.cwd(), '.env.local'))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? localEnv.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('E2E seed requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<SeedUser | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return { id: user.id, email: user.email }
    if (data.users.length < 1000) return null
  }

  return null
}

async function getRequiredTestUser(admin: SupabaseClient, email: string): Promise<SeedUser> {
  const user = await findUserByEmail(admin, email)
  if (!user) {
    throw new Error('TEST_USER_EMAIL does not exist in Supabase Auth. Create it before running e2e tests.')
  }
  return user
}

async function getOrCreateHelperUser(admin: SupabaseClient, email: string): Promise<SeedUser> {
  const existing = await findUserByEmail(admin, email)
  if (existing) return existing

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `E2e-${crypto.randomUUID()}!`,
    email_confirm: true,
  })
  if (error) throw error
  if (!data.user) throw new Error(`Failed to create helper user ${email}.`)
  return { id: data.user.id, email: data.user.email }
}

function sortUserPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export async function seedE2eData(testEmail: string) {
  const admin = getAdminClient()
  const testUser = await getRequiredTestUser(admin, testEmail)
  const feedSeller = await getOrCreateHelperUser(admin, FEED_SELLER_EMAIL)
  const matchUser = await getOrCreateHelperUser(admin, MATCH_USER_EMAIL)

  const cardIds = ['452018', '623606', '264226', '517030', '589984']
  const helperIds = [feedSeller.id, matchUser.id]

  const { error: profileError } = await admin.from('profiles').upsert([
    {
      id: testUser.id,
      username: 'e2etest',
      avatar_url: '/pokwho-style-avatars/03-fire-newt-pup.png',
      city: 'Mumbai',
      country_code: 'IN',
      bio: 'Dedicated Playwright test account',
      roles: ['buy', 'sell'],
      trade_rating: 5.0,
    },
    {
      id: feedSeller.id,
      username: 'e2efeed',
      avatar_url: '/pokwho-style-avatars/01-grass-gecko.png',
      city: 'Mumbai',
      country_code: 'IN',
      bio: 'Visible feed seller for Playwright',
      roles: ['sell'],
      trade_rating: 4.8,
    },
    {
      id: matchUser.id,
      username: 'e2ematch',
      avatar_url: '/pokwho-style-avatars/02-water-otter-frog.png',
      city: 'Dubai',
      country_code: 'UAE',
      bio: 'Active match helper for Playwright',
      roles: ['sell'],
      trade_rating: 4.7,
    },
  ], { onConflict: 'id' })
  if (profileError) throw profileError

  const { error: cardsError } = await admin.from('cards').upsert([
    {
      id: '452018',
      name: 'Jynx',
      set_name: 'SWSH12: Silver Tempest Trainer Gallery',
      set_code: 'SWSH12',
      card_number: 'TG04/TG30',
      rarity: 'Ultra Rare',
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/452018_in_200x200.jpg',
      image_url_hires: 'https://tcgplayer-cdn.tcgplayer.com/product/452018_in_1000x1000.jpg',
      tcgplayer_id: '452018',
    },
    {
      id: '623606',
      name: "Brock's Scouting",
      set_name: 'SV09: Journey Together',
      set_code: 'SV09',
      card_number: '179/159',
      rarity: 'Ultra Rare',
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/623606_in_200x200.jpg',
      image_url_hires: 'https://tcgplayer-cdn.tcgplayer.com/product/623606_in_1000x1000.jpg',
      tcgplayer_id: '623606',
    },
    {
      id: '264226',
      name: 'Rapid Strike Urshifu V',
      set_name: 'SWSH09: Brilliant Stars Trainer Gallery',
      set_code: 'SWSH09',
      card_number: 'TG20/TG30',
      rarity: 'Ultra Rare',
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/264226_in_200x200.jpg',
      image_url_hires: 'https://tcgplayer-cdn.tcgplayer.com/product/264226_in_1000x1000.jpg',
      tcgplayer_id: '264226',
    },
    {
      id: '517030',
      name: 'Ninetales ex',
      set_name: 'SV: Scarlet and Violet 151',
      set_code: 'SV',
      card_number: '186/165',
      rarity: 'Special Illustration Rare',
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/517030_in_200x200.jpg',
      image_url_hires: 'https://tcgplayer-cdn.tcgplayer.com/product/517030_in_1000x1000.jpg',
      tcgplayer_id: '517030',
    },
    {
      id: '589984',
      name: 'Latias ex',
      set_name: 'SV08: Surging Sparks',
      set_code: 'SV08',
      card_number: '220/191',
      rarity: 'Special Illustration Rare',
      image_url: 'https://tcgplayer-cdn.tcgplayer.com/product/589984_in_200x200.jpg',
      image_url_hires: 'https://tcgplayer-cdn.tcgplayer.com/product/589984_in_1000x1000.jpg',
      tcgplayer_id: '589984',
    },
  ], { onConflict: 'id' })
  if (cardsError) throw cardsError

  const { error: priceError } = await admin.from('card_prices').upsert([
    { card_id: '452018', usd_price: 3.08, inr_price: 257, aed_price: 11.30, last_fetched: new Date().toISOString() },
    { card_id: '623606', usd_price: 3.39, inr_price: 283, aed_price: 12.44, last_fetched: new Date().toISOString() },
    { card_id: '264226', usd_price: 6.04, inr_price: 504, aed_price: 22.17, last_fetched: new Date().toISOString() },
    { card_id: '517030', usd_price: 15.42, inr_price: 1288, aed_price: 56.59, last_fetched: new Date().toISOString() },
    { card_id: '589984', usd_price: 7.68, inr_price: 641, aed_price: 28.19, last_fetched: new Date().toISOString() },
  ], { onConflict: 'card_id' })
  if (priceError) throw priceError

  const { data: existingMatches, error: existingMatchError } = await admin
    .from('matches')
    .select('id')
    .or(`and(user_1_id.eq.${testUser.id},user_2_id.in.(${helperIds.join(',')})),and(user_2_id.eq.${testUser.id},user_1_id.in.(${helperIds.join(',')}))`)
  if (existingMatchError) throw existingMatchError

  const existingMatchIds = (existingMatches ?? []).map(match => match.id as string)
  if (existingMatchIds.length > 0) {
    const { error: messageDeleteError } = await admin.from('messages').delete().in('match_id', existingMatchIds)
    if (messageDeleteError) throw messageDeleteError

    await admin.from('ratings').delete().in('match_id', existingMatchIds)

    const { error: matchDeleteError } = await admin.from('matches').delete().in('id', existingMatchIds)
    if (matchDeleteError) throw matchDeleteError
  }

  const { error: swipeDeleteError } = await admin
    .from('swipes')
    .delete()
    .or(`and(swiper_id.eq.${testUser.id},swiped_id.in.(${helperIds.join(',')})),and(swiped_id.eq.${testUser.id},swiper_id.in.(${helperIds.join(',')}))`)
  if (swipeDeleteError) throw swipeDeleteError

  const { error: cardDeleteError } = await admin
    .from('user_cards')
    .delete()
    .in('user_id', [testUser.id, ...helperIds])
    .in('card_id', cardIds)
  if (cardDeleteError) throw cardDeleteError

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const { error: userCardsError } = await admin.from('user_cards').insert([
    { user_id: testUser.id, card_id: '452018', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 3.08, created_at: new Date(now - 5 * dayMs).toISOString() },
    { user_id: testUser.id, card_id: '623606', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 3.39, created_at: new Date(now - 4 * dayMs).toISOString() },
    { user_id: testUser.id, card_id: '264226', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 6.04, created_at: new Date(now - 3 * dayMs).toISOString() },
    { user_id: feedSeller.id, card_id: '452018', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 3.08, created_at: new Date(now - 3 * dayMs).toISOString() },
    { user_id: feedSeller.id, card_id: '517030', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 15.42, created_at: new Date(now - 2 * dayMs).toISOString() },
    { user_id: feedSeller.id, card_id: '589984', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 7.68, created_at: new Date(now - dayMs).toISOString() },
    { user_id: matchUser.id, card_id: '517030', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 15.42, created_at: new Date(now - 2 * dayMs).toISOString() },
    { user_id: matchUser.id, card_id: '589984', list_type: 'HAVE', condition: 'NM', is_foil: true, added_via: 'manual', grading_company: 'RAW', grade: null, grade_label: null, added_price_usd: 7.68, created_at: new Date(now - dayMs).toISOString() },
  ])
  if (userCardsError) throw userCardsError

  const [user1, user2] = sortUserPair(testUser.id, matchUser.id)
  const { data: activeMatch, error: matchInsertError } = await admin
    .from('matches')
    .insert({
      user_1_id: user1,
      user_2_id: user2,
      initiated_by: testUser.id,
      status: 'ACTIVE',
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()
  if (matchInsertError) throw matchInsertError

  const { error: messageInsertError } = await admin.from('messages').insert([
    {
      match_id: activeMatch.id,
      sender_id: testUser.id,
      content: 'Hey, this is the seeded e2e chat.',
      created_at: new Date(now - 90 * 60 * 1000).toISOString(),
      read_at: new Date(now - 89 * 60 * 1000).toISOString(),
    },
    {
      match_id: activeMatch.id,
      sender_id: matchUser.id,
      content: '[OFFER]:{"cardId":"517030","cardName":"Ninetales ex","imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/517030_in_200x200.jpg","setName":"SV: Scarlet and Violet 151","condition":"NM","isFoil":true,"marketLocal":1288,"currency":"INR","offerAmount":1200}',
      created_at: new Date(now - 20 * 60 * 1000).toISOString(),
      read_at: null,
    },
  ])
  if (messageInsertError) throw messageInsertError
}

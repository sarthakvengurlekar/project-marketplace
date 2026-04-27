import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Service-role client bypasses RLS — auth is enforced manually in each handler
const adminSb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST — upsert today's snapshot (optionally a specific date for seeding baseline)
export async function POST(request: NextRequest) {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const value_usd = typeof body.value_usd === 'number' ? body.value_usd : null
  if (value_usd === null) return NextResponse.json({ error: 'value_usd required' }, { status: 400 })

  const snapshot_date = typeof body.snapshot_date === 'string'
    ? body.snapshot_date
    : new Date().toISOString().slice(0, 10)

  const { error } = await adminSb
    .from('collection_value_snapshots')
    .upsert(
      { user_id: user.id, snapshot_date, value_usd },
      { onConflict: 'user_id,snapshot_date' }
    )

  if (error) {
    console.error('[snapshot-value] upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET — return last 8 daily snapshots for the current user (oldest first)
export async function GET() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await adminSb
    .from('collection_value_snapshots')
    .select('snapshot_date, value_usd')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(8)

  // Return oldest-first so callers can read index 0 as earliest
  return NextResponse.json({ snapshots: (data ?? []).reverse() })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Cancel, not delete — the row, its attribution, and its history stay.
// Concurrency and "cannot win after capture started" are the same DB-
// enforced guarantees as the edit route: the UPDATE only ever succeeds
// while the row is still genuinely 'scheduled' with the expected
// updated_at, verified by Postgres itself, not a preceding SELECT here.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { expected_updated_at } = await req.json()
  if (!expected_updated_at) return NextResponse.json({ error: 'expected_updated_at required' }, { status: 400 })

  const { data, error } = await supabase
    .from('shows')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
    .eq('updated_at', expected_updated_at)
    .select('id, status, updated_at')

  if (error) return NextResponse.json({ error: 'This show can no longer be cancelled — it may have already started.' }, { status: 409 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'This was changed elsewhere — reload and try again.' }, { status: 409 })
  return NextResponse.json({ show: data[0] })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// The single sanctioned entry point into live capture from a scheduled
// show. Delegates every guarantee (atomicity, fresh authorization, same-
// actor retry safety, different-actor race protection, no reopening a
// completed show) to start_scheduled_show() — a SECURITY DEFINER function
// called via the authenticated client so auth.uid() resolves to the real
// caller inside it. This route does not itself decide any of that.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('start_scheduled_show', { p_show_id: params.id })

  if (error) {
    const code = error.message || ''
    if (code.includes('SHOW_NOT_FOUND')) return NextResponse.json({ error: 'Show not found.' }, { status: 404 })
    if (code.includes('NOT_AUTHORIZED') || code.includes('NOT_AUTHENTICATED')) return NextResponse.json({ error: 'You are not authorized to start this show.' }, { status: 403 })
    if (code.includes('ALREADY_STARTED_BY_OTHER')) return NextResponse.json({ error: 'This show was just started by someone else.' }, { status: 409 })
    if (code.includes('SHOW_ALREADY_COMPLETED')) return NextResponse.json({ error: 'This show has already finished.' }, { status: 409 })
    if (code.includes('SHOW_CANCELLED')) return NextResponse.json({ error: 'This show was cancelled.' }, { status: 409 })
    return NextResponse.json({ error: 'Could not start this show.' }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ performance_id: row.performance_id, already_started: row.already_started })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_API_KEY = process.env.RESEND_API_KEY

async function notifyManagerOfApproval(to: string, artistName: string) {
  if (!RESEND_API_KEY) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Setlistr <invites@setlistr.ai>', to,
        subject: `${artistName} approved your request`,
        html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;"><p style="font-size: 14px; color: #b8a888; line-height: 1.6;">${artistName} approved your manager access request. They now appear in your Manager workspace.</p></div>`,
      }),
    })
  } catch (err) {
    console.error('Approval-notify email failed:', err)
  }
}

// Artist-only response to a manager-initiated request (invited_by =
// delegate_id — see migration 0023). This route is NEVER the path for a
// manager accepting an artist-initiated invite; that remains
// app/api/team/accept, called by the delegate. Direction is checked
// below before anything else, and authorization is checked against the
// verified session, never the request body.
export async function POST(req: NextRequest) {
  try {
    const { delegation_id, decision } = await req.json()
    if (!delegation_id || (decision !== 'approve' && decision !== 'decline')) {
      return NextResponse.json({ error: 'delegation_id and a valid decision are required.' }, { status: 400 })
    }

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: row } = await supabase
      .from('artist_delegates')
      .select('id, artist_id, delegate_id, invited_by, accepted_at, declined_at, revoked_at')
      .eq('id', delegation_id)
      .maybeSingle()

    if (!row) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

    // Direction guard: this row must be a manager-initiated REQUEST
    // (invited_by === delegate_id), never an artist-initiated invite —
    // those are accepted by the delegate via /api/team/accept, not
    // approved/declined by anyone here.
    if (row.invited_by !== row.delegate_id) {
      return NextResponse.json({ error: 'This is not a pending request.' }, { status: 400 })
    }

    // Authorization: only the intended ARTIST may respond — identity
    // equality against the verified session, never trusted from the
    // request body, never satisfiable by the requesting manager
    // themselves (their id is delegate_id, not artist_id, by construction
    // of how this row was created in POST /api/team/request).
    if (user.id !== row.artist_id) {
      return NextResponse.json({ error: 'Only the artist can respond to this request.' }, { status: 403 })
    }

    // Atomic, conditional update: only a row that is STILL fully pending
    // (none of accepted/declined/revoked set) can transition. A
    // concurrent second response, a retry after decline, or any attempt
    // to resurrect a revoked connection all affect zero rows here —
    // never silently re-applied, never a second write. Only
    // accepted_at/declined_at are ever touched; role, artist_id, and
    // delegate_id are never part of this UPDATE, so an existing
    // delegation's grants can never be altered by a response.
    const patch = decision === 'approve' ? { accepted_at: new Date().toISOString() } : { declined_at: new Date().toISOString() }
    const { data: updated, error } = await supabase
      .from('artist_delegates')
      .update(patch)
      .eq('id', delegation_id)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null)
      .select('id, artist_id, delegate_id, accepted_at, declined_at')
      .maybeSingle()

    if (error) {
      console.error('Respond update error:', error)
      return NextResponse.json({ error: 'Could not record your response.' }, { status: 500 })
    }
    if (!updated) {
      return NextResponse.json({ error: 'This request has already been responded to.' }, { status: 409 })
    }

    if (decision === 'approve') {
      const [{ data: artistProfile }, { data: managerProfile }] = await Promise.all([
        supabase.from('profiles').select('artist_name, full_name').eq('id', row.artist_id).single(),
        supabase.from('profiles').select('email').eq('id', row.delegate_id).single(),
      ])
      const artistName = artistProfile?.artist_name || artistProfile?.full_name || 'The artist'
      if (managerProfile?.email) await notifyManagerOfApproval(managerProfile.email, artistName)
    }

    return NextResponse.json({ success: true, decision })
  } catch (err) {
    console.error('Team respond error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

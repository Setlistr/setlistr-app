import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — look up invite by token, return context for the accept screen
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: invite } = await supabase
    .from('artist_delegates')
    .select('id, artist_id, delegate_id, role, accepted_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })

  // Get artist profile
  const { data: artist } = await supabase
    .from('profiles')
    .select('artist_name, full_name, email')
    .eq('id', invite.artist_id)
    .single()

  return NextResponse.json({
    id: invite.id,
    artist_id: invite.artist_id,
    delegate_id: invite.delegate_id,
    role: invite.role,
    artist_name: artist?.artist_name || artist?.full_name || 'An artist',
    artist_email: artist?.email || '',
    already_accepted: !!invite.accepted_at,
  })
}

// POST — accept the invite, write accepted_at
export async function POST(req: NextRequest) {
  try {
    const { token, delegate_id } = await req.json()
    if (!token || !delegate_id) {
      return NextResponse.json({ error: 'token and delegate_id required' }, { status: 400 })
    }

    // Look up the invite
    const { data: invite } = await supabase
      .from('artist_delegates')
      .select('id, artist_id, delegate_id, accepted_at')
      .eq('invite_token', token)
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
    if (invite.accepted_at) return NextResponse.json({ success: true, already_accepted: true })

    // Verify the accepting user matches the intended delegate
    if (invite.delegate_id !== delegate_id) {
      return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
    }

    // Accept it
    const { error } = await supabase
      .from('artist_delegates')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    if (error) {
      console.error('Accept invite error:', error)
      return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Accept invite route error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

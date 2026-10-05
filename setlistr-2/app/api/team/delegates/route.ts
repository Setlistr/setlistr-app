import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user || user.id !== artistId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const { data: delegates } = await supabase
      .from('artist_delegates')
      .select('id, delegate_id, role, accepted_at, declined_at, invited_at, invited_by, invited_email, invite_token')
      .eq('artist_id', artistId)
      .order('invited_at', { ascending: false })

    if (!delegates || delegates.length === 0) {
      return NextResponse.json({ delegates: [] })
    }

    // A manager-initiated request (invited_by === delegate_id) always
    // has a real, already-authenticated account behind delegate_id — no
    // placeholder case to exclude, unlike an artist-initiated invite to
    // an email with no account yet.
    const realDelegateIds = delegates
      .filter(d => (d.delegate_id !== artistId && d.accepted_at) || d.invited_by === d.delegate_id)
      .map(d => d.delegate_id)

    let profiles: Record<string, { artist_name: string | null; full_name: string | null; avatar_url: string | null }> = {}
    if (realDelegateIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, artist_name, full_name, avatar_url')
        .in('id', realDelegateIds)

      profileData?.forEach(p => {
        profiles[p.id] = { artist_name: p.artist_name, full_name: p.full_name, avatar_url: p.avatar_url }
      })
    }

    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'

    const result = delegates.map(d => {
      const profile = profiles[d.delegate_id]
      const isRequest = d.invited_by === d.delegate_id
      const isPending = !d.accepted_at && !d.declined_at
      const name = profile?.artist_name || profile?.full_name || null

      return {
        id: d.id,
        delegate_id: d.delegate_id,
        // A request always has a real account to name; an invite shows
        // "Invite pending" exactly as before until accepted.
        name: isRequest ? (name || d.invited_email || 'Unknown') : (isPending ? 'Invite pending' : name || 'Unknown'),
        role: d.role,
        direction: isRequest ? 'requested_by_manager' : 'invited_by_artist',
        accepted: !!d.accepted_at,
        accepted_at: d.accepted_at,
        declined_at: d.declined_at,
        invited_at: d.invited_at,
        invited_email: d.invited_email,
        // Resend-link affordance only ever applies to the invite direction
        // this route already sent — never to an incoming request.
        invite_url: (!isRequest && isPending) ? `${BASE_URL}/app/accept-invite?token=${d.invite_token}` : null,
        avatar_url: profile?.avatar_url || null,
      }
    })

    return NextResponse.json({ delegates: result })
  } catch (err) {
    console.error('Delegates fetch error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { delegate_id, artist_id } = await req.json()
    if (!delegate_id || !artist_id) {
      return NextResponse.json({ error: 'delegate_id and artist_id required' }, { status: 400 })
    }

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user || user.id !== artist_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabase
      .from('artist_delegates')
      .delete()
      .eq('id', delegate_id)
      .eq('artist_id', artist_id) // verified above: caller's session must match artist_id

    if (error) return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

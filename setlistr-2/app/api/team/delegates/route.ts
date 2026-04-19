import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  try {
    const { data: delegates } = await supabase
      .from('artist_delegates')
      .select('id, delegate_id, role, accepted_at, invited_at, invite_token')
      .eq('artist_id', artistId)
      .order('invited_at', { ascending: false })

    if (!delegates || delegates.length === 0) {
      return NextResponse.json({ delegates: [] })
    }

    // Get delegate profiles (exclude self-referential placeholders)
    const realDelegateIds = delegates
      .filter(d => d.delegate_id !== artistId && d.accepted_at)
      .map(d => d.delegate_id)

    let profiles: Record<string, { artist_name: string | null; full_name: string | null }> = {}
    if (realDelegateIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, artist_name, full_name')
        .in('id', realDelegateIds)

      profileData?.forEach(p => {
        profiles[p.id] = { artist_name: p.artist_name, full_name: p.full_name }
      })
    }

    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'

    const result = delegates.map(d => {
      const profile = profiles[d.delegate_id]
      const isPending = !d.accepted_at
      const name = profile?.artist_name || profile?.full_name || null

      return {
        id: d.id,
        delegate_id: d.delegate_id,
        name: isPending ? 'Invite pending' : name || 'Unknown',
        role: d.role,
        accepted: !!d.accepted_at,
        accepted_at: d.accepted_at,
        invited_at: d.invited_at,
        invite_url: isPending ? `${BASE_URL}/app/accept-invite?token=${d.invite_token}` : null,
        invite_token: isPending ? d.invite_token : null,
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

    const { error } = await supabase
      .from('artist_delegates')
      .delete()
      .eq('id', delegate_id)
      .eq('artist_id', artist_id) // safety: only artist can revoke

    if (error) return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

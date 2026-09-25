import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Find all artists this user manages (currently accepted, non-revoked
    // delegations only). A lookup error must deny, not silently report
    // "manages nobody" — that would look like a legitimate empty state.
    const { data: delegations, error: delegationsError } = await service
      .from('artist_delegates')
      .select('artist_id, role, accepted_at')
      .eq('delegate_id', user.id)
      .not('accepted_at', 'is', null)
      .is('revoked_at', null)

    if (delegationsError) {
      return NextResponse.json({ error: 'Authorization check failed' }, { status: 500 })
    }
    if (!delegations || delegations.length === 0) {
      return NextResponse.json({ managed: [] })
    }

    const artistIds = delegations.map(d => d.artist_id)

    const { data: profiles } = await service
      .from('profiles')
      .select('id, artist_name, full_name, avatar_url')
      .in('id', artistIds)

    const managed = delegations.map(d => {
      const profile = profiles?.find(p => p.id === d.artist_id)
      return {
        artist_id: d.artist_id,
        artist_name: profile?.artist_name || profile?.full_name || 'Unknown Artist',
        role: d.role,
        avatar_url: profile?.avatar_url || null,
      }
    })

    return NextResponse.json({ managed })
  } catch (err) {
    console.error('Managed artists error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

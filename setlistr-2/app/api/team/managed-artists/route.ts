import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Find all artists this user manages (accepted delegates only)
    const { data: delegations } = await service
      .from('artist_delegates')
      .select('artist_id, role, accepted_at')
      .eq('delegate_id', user.id)
      .not('accepted_at', 'is', null)

    if (!delegations || delegations.length === 0) {
      return NextResponse.json({ managed: [] })
    }

    const artistIds = delegations.map(d => d.artist_id)

    const { data: profiles } = await service
      .from('profiles')
      .select('id, artist_name, full_name')
      .in('id', artistIds)

    const managed = delegations.map(d => {
      const profile = profiles?.find(p => p.id === d.artist_id)
      return {
        artist_id: d.artist_id,
        artist_name: profile?.artist_name || profile?.full_name || 'Unknown Artist',
        role: d.role,
      }
    })

    return NextResponse.json({ managed })
  } catch (err) {
    console.error('Managed artists error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

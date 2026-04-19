import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const artistId = req.nextUrl.searchParams.get('artist_id')
    if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

    // Verify requesting user is an accepted delegate for this artist
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: delegation } = await service
      .from('artist_delegates')
      .select('id, role')
      .eq('artist_id', artistId)
      .eq('delegate_id', user.id)
      .not('accepted_at', 'is', null)
      .maybeSingle()

    if (!delegation) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get artist profile
    const { data: profile } = await service
      .from('profiles')
      .select('artist_name, full_name, bandsintown_artist_name, pro_affiliation')
      .eq('id', artistId)
      .single()

    // Get performances
    const { data: perfsRaw } = await service
      .from('performances')
      .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, ended_at, created_at, shows ( show_type ), venues ( capacity )`)
      .eq('user_id', artistId)
      .order('created_at', { ascending: false })

    const performances = (perfsRaw || []).map((p: any) => ({
      id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
      city: p.city, country: p.country, status: p.status,
      submission_status: p.submission_status || null,
      started_at: p.started_at, ended_at: p.ended_at || null,
      created_at: p.created_at,
      show_type: p.shows?.show_type || 'single',
      venue_capacity: p.venues?.capacity || null,
    }))

    // Get song counts
    const perfIds = performances.map(p => p.id)
    let songCountMap: Record<string, number> = {}
    if (perfIds.length > 0) {
      const { data: songData } = await service
        .from('performance_songs')
        .select('performance_id')
        .in('performance_id', perfIds)
      songData?.forEach((s: any) => {
        songCountMap[s.performance_id] = (songCountMap[s.performance_id] || 0) + 1
      })
    }

    return NextResponse.json({
      artist_id: artistId,
      artist_name: profile?.artist_name || profile?.full_name || 'Unknown',
      bandsintown_artist_name: profile?.bandsintown_artist_name || null,
      pro_affiliation: profile?.pro_affiliation || null,
      role: delegation.role,
      performances,
      songCountMap,
    })
  } catch (err) {
    console.error('Context data error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Uses service role — bypasses RLS, runs server-side only
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const performanceId = searchParams.get('performanceId')

  if (!performanceId) {
    return NextResponse.json({ songs: [] }, { status: 400 })
  }

  // Try performance_songs first
  const { data: perfSongs } = await supabaseAdmin
    .from('performance_songs')
    .select('title, artist, isrc, composer, publisher, work_number, is_cover')
    .eq('performance_id', performanceId)
    .order('position')

  if (perfSongs && perfSongs.length > 0) {
    return NextResponse.json({ songs: perfSongs, source: 'performance_songs' })
  }

  // Fall back to setlist_items via setlists table
  const { data: setlist } = await supabaseAdmin
    .from('setlists')
    .select('id')
    .eq('performance_id', performanceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (setlist?.id) {
    const { data: setlistSongs } = await supabaseAdmin
      .from('setlist_items')
      .select('title, artist_name, isrc, composer, publisher, work_number, is_cover')
      .eq('setlist_id', setlist.id)
      .order('position')

    if (setlistSongs && setlistSongs.length > 0) {
      return NextResponse.json({
        songs: setlistSongs.map(s => ({ ...s, artist: s.artist_name })),
        source: 'setlist_items'
      })
    }
  }

  return NextResponse.json({ songs: [], source: 'none' })
}

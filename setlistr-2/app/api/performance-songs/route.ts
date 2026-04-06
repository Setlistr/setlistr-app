import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const performanceId = searchParams.get('performanceId')

  if (!performanceId) {
    return NextResponse.json({ error: 'missing performanceId' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'missing env vars', hasUrl: !!url, hasKey: !!key, songs: [] })
  }

  const supabaseAdmin = createClient(url, key)

  const { data: perfSongs, error } = await supabaseAdmin
    .from('performance_songs')
    .select('title, artist, isrc, composer, publisher')
    .eq('performance_id', performanceId)
    .order('position')

  if (error) {
    return NextResponse.json({ error: error.message, songs: [] })
  }

  if (perfSongs && perfSongs.length > 0) {
    return NextResponse.json({ songs: perfSongs, source: 'performance_songs' })
  }

  // Fall back to setlist_items
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
      .select('title, artist_name, isrc, composer, publisher')
      .eq('setlist_id', setlist.id)
      .order('position')

    if (setlistSongs && setlistSongs.length > 0) {
      return NextResponse.json({
        songs: setlistSongs.map(s => ({ ...s, artist: s.artist_name })),
        source: 'setlist_items'
      })
    }
  }

  return NextResponse.json({ songs: [], source: 'none', performanceId })
}

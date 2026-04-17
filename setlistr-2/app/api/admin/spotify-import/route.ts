import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
]

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getSpotifyToken(): Promise<string> {
  const clientId     = process.env.SPOTIFY_CLIENT_ID!
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to get Spotify token')
  const data = await res.json()
  return data.access_token
}

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

export async function POST(req: NextRequest) {
  try {
    // Auth check — must be admin
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { user_id, artist_name, spotify_artist_id } = await req.json()
    if (!user_id || !artist_name) {
      return NextResponse.json({ error: 'user_id and artist_name required' }, { status: 400 })
    }

    const token = await getSpotifyToken()
    const adminSupa = getServiceSupabase()

    // Step 1: Find the Spotify artist if no ID provided
    let spotifyId = spotify_artist_id
    if (!spotifyId) {
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(artist_name)}&type=artist&limit=3`,
        { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' }
      )
      if (!searchRes.ok) throw new Error('Spotify search failed')
      const searchData = await searchRes.json()
      const artists = searchData.artists?.items || []
      if (!artists.length) return NextResponse.json({ error: 'Artist not found on Spotify' }, { status: 404 })
      // Pick closest name match
      const exact = artists.find((a: any) => a.name.toLowerCase() === artist_name.toLowerCase())
      spotifyId = (exact || artists[0]).id
    }

    // Step 2: Fetch top tracks
    let topTracks: any[] = []
    for (const market of ['US', 'CA', 'GB']) {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${spotifyId}/top-tracks?market=${market}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.tracks?.length) { topTracks = data.tracks; break }
      }
    }

    if (!topTracks.length) {
      return NextResponse.json({ error: 'No tracks found for this artist' }, { status: 404 })
    }

    // Step 3: Write to user_songs using service role
    let imported = 0
    for (const track of topTracks) {
      const title = track.name
      const artist = track.artists?.[0]?.name || artist_name
      const normalizedTitle = normalizeSongKey(title)
      if (!normalizedTitle) continue

      // Dedup guard
      const { data: existing } = await adminSupa
        .from('user_songs')
        .select('id, confirmed_count')
        .eq('user_id', user_id)
        .eq('song_title', title)
        .single()

      if (existing) {
        // Already exists — bump count slightly to signal it's in catalog
        await adminSupa.from('user_songs').update({
          confirmed_count: Math.max(existing.confirmed_count, 1),
          canonical_artist: artist || null,
        }).eq('id', existing.id)
      } else {
        const { error } = await adminSupa.from('user_songs').insert({
          user_id,
          song_title: title,
          canonical_artist: artist || null,
          confirmed_count: 1,
          last_confirmed_at: new Date().toISOString(),
        })
        if (!error) imported++
      }
    }

    return NextResponse.json({ success: true, imported, total: topTracks.length })
  } catch (err: any) {
    console.error('[AdminSpotifyImport]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

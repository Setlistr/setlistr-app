import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSpotifyToken(): Promise<string> {
  const clientId     = process.env.SPOTIFY_CLIENT_ID!
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!
  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url        = new URL(req.url)
    const artistId   = url.searchParams.get('artist_id')
    const artistName = url.searchParams.get('artist_name') || ''

    if (!artistId) return NextResponse.json({ error: 'Missing artist_id' }, { status: 400 })

    const token = await getSpotifyToken()

    // Fetch top tracks — try multiple markets to maximize results
    let topTracks: any[] = []
    for (const market of ['US', 'CA', 'GB']) {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=${market}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        if (data.tracks?.length) {
          topTracks = data.tracks
          break
        }
      }
    }

    const albumsRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=20`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )
    const albumsData = albumsRes.ok ? await albumsRes.json() : { items: [] }

    // Deduplicate tracks by normalized title
    const tracks: { title: string; spotifyId: string }[] = []
    const seen = new Set<string>()

    for (const track of topTracks) {
      const key = normalizeSongKey(track.name)
      if (key && !seen.has(key)) {
        seen.add(key)
        tracks.push({ title: track.name, spotifyId: track.id })
      }
    }

    // Supplement from albums if under 30 tracks
    if (tracks.length < 30 && albumsData.items?.length > 0) {
      const albumIds = albumsData.items.slice(0, 8).map((a: any) => a.id).join(',')
      const tracksRes = await fetch(
        `https://api.spotify.com/v1/albums?ids=${albumIds}&market=US`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (tracksRes.ok) {
        const tracksData = await tracksRes.json()
        for (const album of tracksData.albums || []) {
          for (const track of album.tracks?.items || []) {
            const isPrimary = track.artists?.[0]?.id === artistId
            if (!isPrimary) continue
            const key = normalizeSongKey(track.name)
            if (key && !seen.has(key)) {
              seen.add(key)
              tracks.push({ title: track.name, spotifyId: track.id })
              if (tracks.length >= 50) break
            }
          }
          if (tracks.length >= 50) break
        }
      }
    }

    if (tracks.length === 0) {
      return NextResponse.json({ imported: 0, total: 0, message: 'No tracks found on Spotify' })
    }

    // Load existing user_songs to protect real show data
    const { data: existing } = await supabase
      .from('user_songs')
      .select('song_title, confirmed_count, source')
      .eq('user_id', user.id)

    const existingMap = new Map<string, { count: number; source: string }>()
    for (const s of existing || []) {
      existingMap.set(normalizeSongKey(s.song_title), {
        count:  s.confirmed_count,
        source: s.source || 'show',
      })
    }

    // Filter out tracks that already exist from real show activity (keep those untouched)
    const toImport = tracks.filter(track => {
      const current = existingMap.get(normalizeSongKey(track.title))
      return !current || current.source === 'spotify_import'
    })

    if (toImport.length === 0) {
      return NextResponse.json({ imported: 0, total: tracks.length })
    }

    const now = new Date().toISOString()

    // Delete any existing spotify_import rows for these titles, then re-insert clean.
    // This avoids upsert conflict issues entirely.
    const titlesToImport = toImport.map(t => t.title)
    await supabase
      .from('user_songs')
      .delete()
      .eq('user_id', user.id)
      .eq('source', 'spotify_import')
      .in('song_title', titlesToImport)

    // Batch insert
    const rows = toImport.map(track => ({
      user_id:           user.id,
      song_title:        track.title,
      canonical_artist:  artistName,
      confirmed_count:   1,
      source:            'spotify_import',
      last_confirmed_at: now,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('user_songs')
      .insert(rows)
      .select('id')

    if (insertError) {
      console.error('[SpotifyImport] Insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const imported = inserted?.length ?? 0

    console.log(`[SpotifyImport] user=${user.id} artist=${artistName} tracks_found=${tracks.length} imported=${imported}`)
    return NextResponse.json({ imported, total: tracks.length })

  } catch (err: any) {
    console.error('[SpotifyImport] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

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

    let imported = 0
    for (const track of tracks) {
      const key     = normalizeSongKey(track.title)
      const current = existingMap.get(key)

      // Never touch songs that came from real show activity
      if (current && current.source !== 'spotify_import') continue

      // Upsert: insert new or overwrite a previous spotify_import
      // (handles the case where user re-imports after a prior run)
      const { error } = await supabase.from('user_songs').upsert(
        {
          user_id:           user.id,
          song_title:        track.title,
          canonical_artist:  artistName,
          confirmed_count:   1,
          source:            'spotify_import',
          last_confirmed_at: new Date().toISOString(),
        },
        {
          onConflict:        'user_id,song_title',
          ignoreDuplicates:  false,
        }
      )

      if (!error) imported++
    }

    console.log(`[SpotifyImport] user=${user.id} artist=${artistName} tracks_found=${tracks.length} imported=${imported}`)
    return NextResponse.json({ imported, total: tracks.length })

  } catch (err: any) {
    console.error('[SpotifyImport] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

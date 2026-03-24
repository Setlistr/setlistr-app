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

    // Fetch top tracks (up to 50 via several endpoints)
    const [topRes, albumsRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
      fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=20&market=US`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }),
    ])

    const topData    = topRes.ok    ? await topRes.json()    : { tracks: [] }
    const albumsData = albumsRes.ok ? await albumsRes.json() : { items: [] }

    // Get tracks from top tracks endpoint
    const tracks: { title: string; spotifyId: string }[] = []
    const seen = new Set<string>()

    for (const track of topData.tracks || []) {
      const title = track.name
      const key   = normalizeSongKey(title)
      if (key && !seen.has(key)) {
        seen.add(key)
        tracks.push({ title, spotifyId: track.id })
      }
    }

    // Get additional tracks from albums if we have fewer than 30
    if (tracks.length < 30 && albumsData.items?.length > 0) {
      const albumIds = albumsData.items.slice(0, 8).map((a: any) => a.id).join(',')
      const tracksRes = await fetch(
        `https://api.spotify.com/v1/albums?ids=${albumIds}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      )
      if (tracksRes.ok) {
        const tracksData = await tracksRes.json()
        for (const album of tracksData.albums || []) {
          for (const track of album.tracks?.items || []) {
            // Only include tracks where the target artist is the primary artist
            const isPrimary = track.artists?.[0]?.id === artistId
            if (!isPrimary) continue
            const title = track.name
            const key   = normalizeSongKey(title)
            if (key && !seen.has(key)) {
              seen.add(key)
              tracks.push({ title, spotifyId: track.id })
              if (tracks.length >= 50) break
            }
          }
          if (tracks.length >= 50) break
        }
      }
    }

    if (tracks.length === 0) {
      return NextResponse.json({ imported: 0, message: 'No tracks found' })
    }

    // Check existing user_songs to avoid overwriting real show data
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

    // Insert or skip — never overwrite real show data
    let imported = 0
    for (const track of tracks) {
      const key      = normalizeSongKey(track.title)
      const existing = existingMap.get(key)

      if (existing) {
        // Already exists from a show — don't overwrite, real data wins
        if (existing.source !== 'spotify_import') continue
        // Already imported from Spotify — skip duplicate
        continue
      }

      // New song — insert as spotify_import with count=1
      const { error } = await supabase.from('user_songs').insert({
        user_id:           user.id,
        song_title:        track.title,
        canonical_artist:  artistName,
        confirmed_count:   1,
        source:            'spotify_import',
        last_confirmed_at: new Date().toISOString(),
      })

      if (!error) imported++
    }

    console.log(`[SpotifyImport] user=${user.id} artist=${artistName} imported=${imported}/${tracks.length}`)
    return NextResponse.json({ imported, total: tracks.length })

  } catch (err: any) {
    console.error('[SpotifyImport] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

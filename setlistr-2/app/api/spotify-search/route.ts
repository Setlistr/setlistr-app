import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSpotifyToken(): Promise<string> {
  const clientId     = process.env.SPOTIFY_CLIENT_ID!
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!

  console.log('[SpotifySearch] clientId present:', !!clientId, 'length:', clientId?.length)
  console.log('[SpotifySearch] clientSecret present:', !!clientSecret, 'length:', clientSecret?.length)

  const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  console.log('[SpotifySearch] token response status:', res.status)

  if (!res.ok) {
    const body = await res.text()
    console.error('[SpotifySearch] token error body:', body)
    throw new Error(`Spotify token failed: ${res.status} — ${body}`)
  }

  const data = await res.json()
  console.log('[SpotifySearch] token received, length:', data.access_token?.length)
  return data.access_token
}

export async function GET(req: NextRequest) {
  try {
    const q = new URL(req.url).searchParams.get('q')
    if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

    const token = await getSpotifyToken()

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=5`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    )

    console.log('[SpotifySearch] search response status:', res.status)

    if (!res.ok) {
      const body = await res.text()
      console.error('[SpotifySearch] search error body:', body)
      throw new Error(`Spotify search failed: ${res.status}`)
    }

    const data = await res.json()
    const artists = (data.artists?.items || []).map((a: any) => ({
      id:        a.id,
      name:      a.name,
      followers: a.followers?.total || 0,
      image:     a.images?.[0]?.url || null,
      genres:    a.genres?.slice(0, 3) || [],
    }))

    console.log('[SpotifySearch] returning', artists.length, 'artists')
    return NextResponse.json({ artists })

  } catch (err: any) {
    console.error('[SpotifySearch] Error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

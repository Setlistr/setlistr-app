import { NextRequest, NextResponse } from 'next/server'

// ── MusicBrainz song enrichment ───────────────────────────────────────────────
// Called when user manually adds a song — async background lookup
// Returns: isrc, composer, publisher if found
// Never blocks the user — fire-and-forget from the client

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function searchMusicBrainz(title: string, artist: string) {
  const query = artist
    ? `recording:"${title}" AND artist:"${artist}"`
    : `recording:"${title}"`

  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&limit=1&fmt=json`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Setlistr/1.0 (setlistr.ai)',
      'Accept': 'application/json',
    },
  })

  if (!res.ok) return null
  const data = await res.json()
  const recording = data?.recordings?.[0]
  if (!recording) return null

  // Extract ISRC
  const isrc = recording.isrcs?.[0] || ''

  // Extract composer from relations
  const composer = recording.relations
    ?.filter((r: any) => r.type === 'composer' || r.type === 'lyricist' || r.type === 'writer')
    ?.map((r: any) => r.artist?.name)
    ?.filter(Boolean)
    ?.join(', ') || ''

  // Extract artist name (canonical)
  const canonicalArtist = recording['artist-credit']?.[0]?.artist?.name || artist

  // Extract release label as publisher proxy
  const publisher = recording.releases?.[0]?.['label-info']?.[0]?.label?.name || ''

  return {
    isrc,
    composer,
    publisher,
    canonical_artist: canonicalArtist,
    score: recording.score || 0,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, artist } = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'title required' }, { status: 400 })
    }

    const enriched = await searchMusicBrainz(title.trim(), artist?.trim() || '')

    if (!enriched || enriched.score < 70) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({
      found: true,
      isrc:             enriched.isrc,
      composer:         enriched.composer,
      publisher:        enriched.publisher,
      canonical_artist: enriched.canonical_artist,
    })
  } catch (err: any) {
    // Non-blocking — return not found rather than error
    return NextResponse.json({ found: false })
  }
}

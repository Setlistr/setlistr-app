import { NextRequest, NextResponse } from 'next/server'

// ── MusicBrainz song enrichment ───────────────────────────────────────────────
// Called when user manually adds a song — async background lookup
// Returns: isrc, composer, publisher if found
// Never blocks the user — fire-and-forget from the client

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function searchMusicBrainz(title: string, artist: string) {
  // Strategy: try with artist first, fall back to title only
  // Use broader query — let MusicBrainz score handle relevance
  const queries = artist
    ? [
        `recording:"${title}" AND artistname:"${artist}"`,
        `recording:"${title}"`,  // fallback without artist
      ]
    : [`recording:"${title}"`]

  let recording: any = null

  for (const query of queries) {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&limit=3&fmt=json&inc=isrcs+artist-credits+releases+recording-rels`
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Setlistr/1.0 (setlistr.ai)',
          'Accept': 'application/json',
        },
      })
      if (!res.ok) continue
      const data = await res.json()
      // Take the highest-scoring result
      const candidates = data?.recordings || []
      const best = candidates.sort((a: any, b: any) => (b.score || 0) - (a.score || 0))[0]
      if (best && (best.score || 0) >= 60) {
        recording = best
        break
      }
    } catch { continue }
  }

  if (!recording) return null

  // Extract ISRC — check both recording.isrcs and individual releases
  const isrc = recording.isrcs?.[0] || ''

  // Extract artist credits as composer proxy (for original songs)
  // Also check relations for explicit composer/lyricist credits
  const artistCredits = recording['artist-credit']
    ?.map((ac: any) => ac.artist?.name)
    ?.filter(Boolean) || []

  const relationComposers = recording.relations
    ?.filter((r: any) => ['composer', 'lyricist', 'writer', 'co-composer'].includes(r.type))
    ?.map((r: any) => r.artist?.name)
    ?.filter(Boolean) || []

  const composer = relationComposers.length > 0
    ? relationComposers.join(', ')
    : artistCredits.join(', ')  // fall back to artist credits

  // Extract canonical artist
  const canonicalArtist = recording['artist-credit']?.[0]?.artist?.name || artist

  // Extract label as publisher proxy
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

    if (!enriched || enriched.score < 60) {
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

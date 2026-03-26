import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(made popular by[^)]*\)/gi, '')
    .replace(/\s*\[vocal version\]/gi, '')
    .replace(/\s*\[karaoke\]/gi, '')
    .replace(/\s*\(karaoke[^)]*\)/gi, '')
    .replace(/\s*\(originally performed by[^)]*\)/gi, '')
    .replace(/\s*\(as made famous by[^)]*\)/gi, '')
    .trim()
}

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

// ─── Ranking score ────────────────────────────────────────────────────────────
// score = confirmed_count × recency_decay
//
// Decay uses a 90-day half-life so high play-count songs stay relevant longer.
// A song played 10× six months ago still outranks a song played 1× last week.
// Floor of 0.35 means nothing fully disappears from suggestions.
//
//   today    → decay ≈ 1.00
//   30 days  → decay ≈ 0.79
//   90 days  → decay ≈ 0.57  (half-life)
//   180 days → decay ≈ 0.44
//   very old → decay → 0.35  (floor)
function rankingScore(confirmedCount: number, lastConfirmedAt: string, venueBoost = 1): number {
  const daysSince = (Date.now() - new Date(lastConfirmedAt).getTime()) / 86400000
  const decay     = 0.35 + 0.65 * Math.pow(0.5, daysSince / 90)
  return confirmedCount * decay * venueBoost
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url          = new URL(req.url)
    const allowRepeats = url.searchParams.get('allow_repeats') === '1'
    const venueId      = url.searchParams.get('venue_id') || ''

    // Songs already in the current set — passed as comma-separated encoded titles
    const excludeRaw   = url.searchParams.get('exclude') || ''
    const excludedKeys = excludeRaw
      ? excludeRaw.split(',').map(t => normalizeSongKey(decodeURIComponent(t)))
      : []

    // ── Optional: same-venue boost ────────────────────────────────────────────
    // If venue_id is provided, fetch song titles played at this venue before.
    // One join — if it fails we just skip the boost, never block the response.
    const venuePlayedKeys = new Set<string>()
    if (venueId) {
      try {
        const { data: venueSongs } = await supabase
          .from('performance_songs')
          .select('title, performances!inner(venue_id)')
          .eq('performances.venue_id', venueId)
          .eq('performances.user_id', user.id)
          .limit(100)
        for (const s of venueSongs || []) {
          const key = normalizeSongKey(s.title)
          if (key) venuePlayedKeys.add(key)
        }
      } catch {
        // venue boost is non-critical — swallow silently
      }
    }

    // ── Fetch user's song catalog ─────────────────────────────────────────────
    const { data, error } = await supabase
      .from('user_songs')
      .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at, source')
      .eq('user_id', user.id)
      .limit(200)

    if (error) {
      console.error('[RecentSongs] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── Score, deduplicate, partition ─────────────────────────────────────────
    const deduped = new Map<string, {
      id: string; title: string; raw_title: string; artist: string
      play_count: number; last_played: string; source: string; score: number
    }>()

    for (const s of data || []) {
      const title = cleanTitle(s.song_title)
      const key   = normalizeSongKey(title)
      if (!key) continue

      const boost = venuePlayedKeys.has(key) ? 1.2 : 1
      const score = rankingScore(s.confirmed_count || 1, s.last_confirmed_at, boost)

      const entry = {
        id:          s.id,
        title,
        raw_title:   s.song_title,
        artist:      s.canonical_artist || '',
        play_count:  s.confirmed_count || 1,
        last_played: s.last_confirmed_at,
        source:      s.source || 'show',
        score,
      }

      const existing = deduped.get(key)
      if (!existing || score > existing.score) {
        deduped.set(key, entry)
      }
    }

    const allEntries = Array.from(deduped.entries())

    // ── Partition into in_set vs suggestions ──────────────────────────────────
    // in_set: songs currently in this show's setlist (only returned when allow_repeats=true)
    // suggestions: everything else, sorted by score descending
    const inSetEntries    = allEntries.filter(([key]) => excludedKeys.includes(key))
    const outsideEntries  = allEntries.filter(([key]) => !excludedKeys.includes(key))

    const toSongShape = ([, s]: [string, typeof deduped extends Map<string, infer V> ? V : never]) => ({
      id:          s.id,
      title:       s.title,
      raw_title:   s.raw_title,
      artist:      s.artist,
      play_count:  s.play_count,
      last_played: s.last_played,
      source:      s.source,
    })

    const suggestions = outsideEntries
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 50)
      .map(toSongShape)

    // in_set only sent when allow_repeats is on — otherwise it just clutters
    const in_set = allowRepeats
      ? inSetEntries.sort((a, b) => b[1].score - a[1].score).map(toSongShape)
      : []

    return NextResponse.json({ songs: suggestions, in_set })

  } catch (err: any) {
    console.error('[RecentSongs] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

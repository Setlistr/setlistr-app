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

// ─── Weighted ranking score ───────────────────────────────────────────────────
// score = confirmed_count × recency_decay
// recency_decay = 0.5 + 0.5 × e^(−days / 60)
//   today    → decay ≈ 1.0  (full weight)
//   30 days  → decay ≈ 0.78
//   60 days  → decay ≈ 0.68
//   180 days → decay ≈ 0.52
//   very old → decay → 0.5  (floor — old songs never fully disappear)
//
// Effect: "Born Again" played 10× last week beats "Whiskey" played 10× last year.
// But "Whiskey" played 10× last year still beats "New Song" played 1× yesterday.
function rankingScore(confirmedCount: number, lastConfirmedAt: string): number {
  const daysSince    = (Date.now() - new Date(lastConfirmedAt).getTime()) / 86400000
  const decay        = 0.5 + 0.5 * Math.exp(-daysSince / 60)
  return confirmedCount * decay
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url          = new URL(req.url)
    const allowRepeats = url.searchParams.get('allow_repeats') === '1'

    // Songs already confirmed in the current set — excluded by default
    // Passed as comma-separated encoded titles: ?exclude=Song+One,Song+Two
    const excludeRaw     = url.searchParams.get('exclude') || ''
    const excludedKeys   = excludeRaw
      ? excludeRaw.split(',').map(t => normalizeSongKey(decodeURIComponent(t)))
      : []

    const { data, error } = await supabase
      .from('user_songs')
      .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at, source')
      .eq('user_id', user.id)
      .limit(200)

    if (error) {
      console.error('[RecentSongs] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Score → deduplicate → filter → sort → return top 50
    const deduped = new Map<string, {
      id: string; title: string; raw_title: string; artist: string
      play_count: number; last_played: string; source: string; score: number
    }>()

    for (const s of data || []) {
      const title  = cleanTitle(s.song_title)
      const key    = normalizeSongKey(title)
      if (!key) continue

      const score  = rankingScore(s.confirmed_count || 1, s.last_confirmed_at)
      const entry  = {
        id:         s.id,
        title,
        raw_title:  s.song_title,
        artist:     s.canonical_artist || '',
        play_count: s.confirmed_count || 1,
        last_played: s.last_confirmed_at,
        source:     s.source || 'show',
        score,
      }

      // Keep highest-scoring entry per normalized title
      const existing = deduped.get(key)
      if (!existing || score > existing.score) {
        deduped.set(key, entry)
      }
    }

    const songs = Array.from(deduped.entries())
      .filter(([key]) => allowRepeats || !excludedKeys.includes(key))
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 50)
      .map(([, s]) => ({
        id:         s.id,
        title:      s.title,
        raw_title:  s.raw_title,
        artist:     s.artist,
        play_count: s.play_count,
        last_played: s.last_played,
        source:     s.source,
      }))

    return NextResponse.json({ songs })

  } catch (err: any) {
    console.error('[RecentSongs] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

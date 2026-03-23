import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Clean display title ──────────────────────────────────────────────────────
// Strips karaoke/live/version suffixes that ACR adds which look noisy in UI
// e.g. "Song Name (made popular by X) [vocal version]" → "Song Name"
// Preserves legitimate parentheticals like "(Live)" that are part of the real title
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

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('user_songs')
      .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at')
      .eq('user_id', user.id)
      .order('last_confirmed_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[RecentSongs] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Clean titles and deduplicate by normalized title
    // (handles FISHIN' IN THE DARK vs Fishin' in the Dark duplicates)
    const seen = new Set<string>()
    const songs = (data || [])
      .map(s => ({
        id: s.id,
        title: cleanTitle(s.song_title),
        raw_title: s.song_title,
        artist: s.canonical_artist || '',
        play_count: s.confirmed_count || 1,
        last_played: s.last_confirmed_at,
      }))
      .filter(s => {
        const key = s.title.toLowerCase().trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })

    return NextResponse.json({ songs })

  } catch (err: any) {
    console.error('[RecentSongs] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const performanceId = searchParams.get('performanceId')

  if (!performanceId) {
    return NextResponse.json({ error: 'missing performanceId' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ error: 'missing env vars', hasUrl: !!url, hasKey: !!key, songs: [] })
  }

  const supabaseAdmin = createClient(url, key)

  // ── Primary source: performance_songs for this performance ─────────────────
  const { data: perfSongs, error } = await supabaseAdmin
    .from('performance_songs_visible')
    .select('title, artist, isrc, composer, publisher')
    .eq('performance_id', performanceId)
    .order('position')

  if (error) {
    return NextResponse.json({ error: error.message, songs: [] })
  }

  let songs: any[] = []
  let source = 'none'

  if (perfSongs && perfSongs.length > 0) {
    songs = perfSongs.map((s: any) => ({
      title: s.title,
      artist: s.artist || '',
      isrc: s.isrc || null,
      composer: s.composer || null,
      publisher: s.publisher || null,
    }))
    source = 'performance_songs'
  } else {
    // ── Fallback: setlist_items ───────────────────────────────────────────────
    const { data: setlist } = await supabaseAdmin
      .from('setlists')
      .select('id')
      .eq('performance_id', performanceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (setlist?.id) {
      const { data: setlistSongs } = await supabaseAdmin
        .from('setlist_items')
        .select('title, artist_name, isrc, composer, publisher')
        .eq('setlist_id', setlist.id)
        .order('position')

      if (setlistSongs && setlistSongs.length > 0) {
        songs = setlistSongs.map((s: any) => ({
          title: s.title,
          artist: s.artist_name || '',
          isrc: s.isrc || null,
          composer: s.composer || null,
          publisher: s.publisher || null,
        }))
        source = 'setlist_items'
      }
    }
  }

  if (songs.length === 0) {
    return NextResponse.json({ songs: [], source: 'none', performanceId })
  }

  // ── Backfill missing ISRC/composer from user's song history ───────────────
  // For any song with no isrc, look up the most recent performance where this
  // user played the same song (matched on normalized title + artist) and pull
  // the isrc/composer/publisher from there. One batched query — never per-song.
  const songsNeedingBackfill = songs.filter((s: any) => !s.isrc)

  if (songsNeedingBackfill.length > 0) {
    const { data: perfData } = await supabaseAdmin
      .from('performances')
      .select('user_id')
      .eq('id', performanceId)
      .single()

    const userId = perfData?.user_id
    if (userId) {
      // All other performances for this user, most recent first
      const { data: userPerfs } = await supabaseAdmin
        .from('performances')
        .select('id, started_at')
        .eq('user_id', userId)
        .neq('id', performanceId)
        .order('started_at', { ascending: false })

      if (userPerfs && userPerfs.length > 0) {
        const userPerfIds = userPerfs.map((p: any) => p.id)
        const perfDateMap = new Map<string, string>(
          userPerfs.map((p: any) => [p.id, p.started_at])
        )

        // One batched query: all songs with non-null ISRC across user's history
        const { data: catalogRows } = await supabaseAdmin
          .from('performance_songs_visible')
          .select('title, artist, isrc, composer, publisher, performance_id')
          .in('performance_id', userPerfIds)
          .not('isrc', 'is', null)

        if (catalogRows && catalogRows.length > 0) {
          // Sort by performance date desc so most recent match is considered first
          catalogRows.sort((a: any, b: any) => {
            const da = perfDateMap.get(a.performance_id) ?? ''
            const db = perfDateMap.get(b.performance_id) ?? ''
            return db.localeCompare(da)
          })

          // Build lookup keyed on normalized(title)|normalized(artist).
          // First entry per key wins (most recent, due to sort above).
          const backfillMap = new Map<string, { isrc: string; composer: string | null; publisher: string | null }>()
          for (const row of catalogRows as any[]) {
            const key = `${(row.title ?? '').toLowerCase().trim()}|${(row.artist ?? '').toLowerCase().trim()}`
            if (!backfillMap.has(key)) {
              backfillMap.set(key, {
                isrc: row.isrc,
                composer: row.composer ?? null,
                publisher: row.publisher ?? null,
              })
            }
          }

          // Fill in songs with null isrc — only when title AND artist both match
          songs = songs.map((s: any) => {
            if (s.isrc) return s
            const key = `${(s.title ?? '').toLowerCase().trim()}|${(s.artist ?? '').toLowerCase().trim()}`
            const found = backfillMap.get(key)
            if (!found) return s
            return {
              ...s,
              isrc: found.isrc,
              composer: found.composer ?? s.composer,
              publisher: found.publisher ?? s.publisher,
            }
          })
        }
      }
    }
  }

  return NextResponse.json({ songs, source })
}

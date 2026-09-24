import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

  // ── Auth: this route reads via the service-role client (bypasses RLS),
  // so it must gate itself explicitly rather than relying on RLS or on
  // /app/* middleware — the route is independently reachable regardless of
  // which page (if any) a request came through.
  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', songs: [] }, { status: 401 })
  }

  // Resolve the performance's ACTUAL owner from the database — never trust
  // a client-supplied artist/owner id, because there isn't one to trust:
  // performanceId is the only input, and the owner is derived from the
  // performance row itself. performances_visible already excludes
  // soft-deleted rows (deleted_at IS NULL).
  const { data: perf, error: perfLookupError } = await supabaseAdmin
    .from('performances_visible')
    .select('user_id')
    .eq('id', performanceId)
    .maybeSingle()

  if (perfLookupError) {
    // Fail closed: a lookup error is not proof of anything, least of all
    // authorization — never fall through to returning song data.
    return NextResponse.json({ error: 'Authorization check failed', songs: [] }, { status: 500 })
  }
  if (!perf) {
    return NextResponse.json({ error: 'Not found', songs: [] }, { status: 404 })
  }

  const ownerId = perf.user_id
  let authorized = user.id === ownerId
  if (!authorized) {
    // Every recognized team role holds view_workspace — this only needs to
    // confirm a currently-accepted, non-revoked delegation exists, not
    // which role it is. profiles.role is never consulted (see
    // lib/permissions.ts: it's self-writable and authorizes nothing).
    const { data: delegation, error: delegationError } = await supabaseAdmin
      .from('artist_delegates')
      .select('id')
      .eq('artist_id', ownerId)
      .eq('delegate_id', user.id)
      .not('accepted_at', 'is', null)
      .is('revoked_at', null)
      .maybeSingle()

    if (delegationError) {
      return NextResponse.json({ error: 'Authorization check failed', songs: [] }, { status: 500 })
    }
    authorized = !!delegation
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Access denied', songs: [] }, { status: 403 })
  }

  // ── Song source: performance_songs for this performance ─────────────────
  // A legacy fallback to setlists/setlist_items used to live here. Removed:
  // it queried setlists.performance_id and setlist_items.isrc/composer/
  // publisher, none of which exist in the live schema — confirmed via
  // read-only metadata query, not inferred. The fallback's own errors were
  // never checked, so it silently returned nothing rather than surfacing
  // that it was broken. No replacement linkage is invented here.
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
      .from('performances_visible')
      .select('user_id')
      .eq('id', performanceId)
      .single()

    const userId = perfData?.user_id
    if (userId) {
      // All other performances for this user, most recent first
      const { data: userPerfs } = await supabaseAdmin
        .from('performances_visible')
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

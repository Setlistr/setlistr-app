import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'
import { recomputeLastConfirmedAt } from '@/lib/reconciliation/userSongLedger'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── POST — undo a soft-delete ───────────────────────────────────────────────
// The ledger rows this performance originally contributed were deleted, not
// flagged, when it was soft-deleted — there's no stored snapshot of exactly
// what they were. This re-derives them from the performance's current
// performance_songs_visible list (i.e. today's confirmed setlist for this
// show) rather than reversing a record of the original write. That's only
// safe because a deleted performance is unreachable from the UI — there's no
// path to edit its songs while deleted, so the list can't have drifted from
// what it was at delete time.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const performanceId = params.id

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: perf } = await service
      .from('performances')
      .select('id, user_id, deleted_at')
      .eq('id', performanceId)
      .single()

    if (!perf) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Same accepted-row check as the delete route, team/invite, and
    // team/context-data.
    if (user.id !== perf.user_id) {
      const { data: delegation } = await service
        .from('artist_delegates')
        .select('id')
        .eq('artist_id', perf.user_id)
        .eq('delegate_id', user.id)
        .not('accepted_at', 'is', null)
        .maybeSingle()

      if (!delegation) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (!perf.deleted_at) {
      return NextResponse.json({ error: 'Not deleted' }, { status: 409 })
    }

    // ── Restore the performance first — performance_songs_visible excludes
    // songs on a deleted parent, so the song list below must be read after
    // clearing deleted_at, not before.
    const { error: restoreError } = await service
      .from('performances')
      .update({ deleted_at: null })
      .eq('id', performanceId)

    if (restoreError) {
      return NextResponse.json({ error: restoreError.message }, { status: 500 })
    }

    const { data: songs } = await service
      .from('performance_songs_visible')
      .select('title')
      .eq('performance_id', performanceId)

    for (const song of songs || []) {
      if (!song.title?.trim()) continue
      const normalizedTitle = normalizeSongKey(song.title)
      if (!normalizedTitle) continue

      const { error: guardError } = await service
        .from('user_song_performances')
        .insert({ user_id: perf.user_id, performance_id: performanceId, normalized_title: normalizedTitle })

      if (guardError) continue // 23505 or otherwise — already accounted for, don't double-increment.

      const { data: existing } = await service
        .from('user_songs')
        .select('id, confirmed_count')
        .eq('user_id', perf.user_id)
        .eq('song_title', song.title)
        .maybeSingle()

      if (!existing) continue // No catalog row to credit — same as the original write paths' behavior.

      const newLastConfirmedAt = await recomputeLastConfirmedAt(service, perf.user_id, normalizedTitle)

      await service
        .from('user_songs')
        .update({
          confirmed_count: existing.confirmed_count + 1,
          last_confirmed_at: newLastConfirmedAt,
        })
        .eq('id', existing.id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[PerformanceDeleteUndo] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

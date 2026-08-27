import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'
import { recomputeLastConfirmedAt } from '@/lib/reconciliation/userSongLedger'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── POST — soft-delete a performance ────────────────────────────────────────
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

    // Authorized only if the caller is the performance's owner, or an
    // accepted delegate for that owner — same accepted-row check as
    // team/invite and team/context-data.
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

    if (perf.deleted_at) {
      return NextResponse.json({ error: 'Already deleted' }, { status: 409 })
    }

    // ── Read the ledger for this performance before it's gone ──────────────
    const { data: ledgerRows } = await service
      .from('user_song_performances')
      .select('user_id, normalized_title')
      .eq('performance_id', performanceId)

    // ── Delete the ledger rows for this performance ─────────────────────────
    // Deliberately deleted, not flagged — undo re-inserts and re-increments
    // explicitly rather than restoring a flag, so it re-derives from this
    // performance's current song list instead of trusting a stale snapshot.
    if (ledgerRows && ledgerRows.length > 0) {
      await service.from('user_song_performances').delete().eq('performance_id', performanceId)
    }

    // ── Decrement confirmed_count and recompute last_confirmed_at per song ──
    // Grouped by user_id since a performance could in principle carry
    // contributions credited to more than one account.
    const byUser = new Map<string, string[]>()
    for (const row of ledgerRows || []) {
      const titles = byUser.get(row.user_id) || []
      titles.push(row.normalized_title)
      byUser.set(row.user_id, titles)
    }

    for (const ledgerUserId of Array.from(byUser.keys())) {
      const normalizedTitles = byUser.get(ledgerUserId)!
      const { data: songs } = await service
        .from('user_songs')
        .select('id, song_title, confirmed_count')
        .eq('user_id', ledgerUserId)

      for (const normalizedTitle of normalizedTitles) {
        const match = (songs || []).find(s => normalizeSongKey(s.song_title) === normalizedTitle)
        if (!match) continue // No provenance for this contribution — nothing to reverse.

        const newCount = Math.max(0, match.confirmed_count - 1)
        const newLastConfirmedAt = await recomputeLastConfirmedAt(service, ledgerUserId, normalizedTitle)

        await service
          .from('user_songs')
          .update({ confirmed_count: newCount, last_confirmed_at: newLastConfirmedAt })
          .eq('id', match.id)
      }
    }

    // ── Soft-delete the performance itself ──────────────────────────────────
    const { error: deleteError } = await service
      .from('performances')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', performanceId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[PerformanceDelete] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

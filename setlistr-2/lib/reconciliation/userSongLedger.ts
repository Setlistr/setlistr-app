import type { SupabaseClient } from '@supabase/supabase-js'

// Shared by the performance delete/undo routes — both need to re-derive
// last_confirmed_at from whatever user_song_performances rows exist for a
// user+song after the ledger changes underneath them (rows removed on
// delete, rows re-inserted on undo). Matches the existing convention
// elsewhere in this codebase of dating a confirmation by write time, not by
// the underlying performance's date — the original review/live write paths
// already stamp last_confirmed_at as "now," not the show's started_at.
export async function recomputeLastConfirmedAt(
  service: SupabaseClient,
  userId: string,
  normalizedTitle: string
): Promise<string | null> {
  const { data: remaining } = await service
    .from('user_song_performances')
    .select('created_at')
    .eq('user_id', userId)
    .eq('normalized_title', normalizedTitle)
    .order('created_at', { ascending: false })
    .limit(1)

  return remaining && remaining.length > 0 ? remaining[0].created_at : null
}

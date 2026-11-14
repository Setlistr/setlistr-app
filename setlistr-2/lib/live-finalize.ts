// Ending a live capture without ever losing saved songs.
//
// The previous End marked the show finished, deleted every saved song, then
// inserted the final list, ignoring errors. A failure between the delete and
// the insert left an empty Review, and because the show was no longer live
// nothing saved the list again.
//
// This runs as an ordered sequence in which every step can be repeated:
//   1. If the show is no longer live, stop. Someone already finished it (an
//      earlier tap, another device) and its songs may since have been edited
//      in Review; End must not write over them.
//   2. Upsert the final rows by their row id. Rows saved during capture are
//      updated in place; nothing is removed yet.
//   3. Remove only rows that aren't in the final list (songs the artist
//      deleted during the show).
//   4. Read the saved ids back and require them to match the final list.
//   5. Only then mark the show finished, guarded on it still being live, so
//      two attempts can't both finish it.
// Until step 5 succeeds the show stays live, so a failure at any point (error,
// lost connection, closed app) leaves a live show whose saved songs are a
// superset of the final list. It can be finished again from the live page,
// which reopens it with those songs, or from the unfinished-show row on Home
// and History.

export type FinalSongRow = {
  id: string
  performance_id: string
  title: string | null
  artist: string | null
  position: number
  isrc: string | null
  composer: string | null
  publisher: string | null
  source: string
  was_planned: boolean
  inclusion_reason: string | null
  threshold: number | null
  score: number | null
  confusion_matrix_result: string
}

export type FinalizeStep = 'read' | 'songs' | 'cleanup' | 'verify' | 'status'
export type FinalizeResult =
  | { ok: true; transitioned: boolean }   // transitioned: this call finished the show
  | { ok: false; step: FinalizeStep }

type Err = { message: string } | null
// The few query shapes used here, so tests can pass a stand-in client.
type Client = {
  from: (table: string) => any
}

const LIVE = ['live', 'pending']

export async function finalizeLiveCapture(supabase: Client, args: {
  performanceId: string
  rows: FinalSongRow[]
  endedAt: string
  durationMinutes: number | null
}): Promise<FinalizeResult> {
  const { performanceId, rows, endedAt, durationMinutes } = args

  // 1. Still live?
  const read = await supabase.from('performances').select('status').eq('id', performanceId).single() as { data: { status: string } | null; error: Err }
  if (read.error || !read.data) return { ok: false, step: 'read' }
  if (!LIVE.includes(read.data.status)) return { ok: true, transitioned: false }

  // 2. Final rows, in place.
  if (rows.length > 0) {
    const { error } = await supabase.from('performance_songs').upsert(rows, { onConflict: 'id' }) as { error: Err }
    if (error) return { ok: false, step: 'songs' }
  }

  // 3. Only rows the artist removed.
  let del = supabase.from('performance_songs').delete().eq('performance_id', performanceId)
  if (rows.length > 0) del = del.not('id', 'in', `(${rows.map(r => r.id).join(',')})`)
  const cleanup = await del as { error: Err }
  if (cleanup.error) return { ok: false, step: 'cleanup' }

  // 4. Saved list must be exactly the final list.
  const check = await supabase.from('performance_songs').select('id').eq('performance_id', performanceId) as { data: { id: string }[] | null; error: Err }
  if (check.error || !check.data) return { ok: false, step: 'verify' }
  const want = new Set(rows.map(r => r.id))
  if (check.data.length !== want.size || check.data.some(r => !want.has(r.id))) return { ok: false, step: 'verify' }

  // 5. Finish, only from live. Zero rows updated means another attempt got
  // there first: re-read to tell that apart from a refused write.
  const upd = await supabase.from('performances')
    .update({ status: 'review', ended_at: endedAt, set_duration_minutes: durationMinutes })
    .eq('id', performanceId).in('status', LIVE).select('id') as { data: { id: string }[] | null; error: Err }
  if (upd.error) return { ok: false, step: 'status' }
  if (upd.data && upd.data.length > 0) return { ok: true, transitioned: true }
  const again = await supabase.from('performances').select('status').eq('id', performanceId).single() as { data: { status: string } | null; error: Err }
  if (!again.error && again.data && !LIVE.includes(again.data.status)) return { ok: true, transitioned: false }
  return { ok: false, step: 'status' }
}

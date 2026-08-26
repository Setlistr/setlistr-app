import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { normalizeSongKey } from './normalize'
import type {
  PerformanceRow, RecognitionLogRow, DetectionEventRow, AudioCaptureRow,
  RecognitionJobRow, PlannedSetlistSongRow, PerformanceSongRow, UserSongRow,
  TruthSong, Conclusion,
} from './types'

// Engine runs exclusively with the service role key — same posture as
// app/api/identify/route.ts's getSupabase(). This is a server-only,
// human-invoked CLI script; it is never reachable from a browser, so
// bypassing RLS here is the correct (and only workable) mode. The new
// reconciliation_* tables ship with RLS enabled and no policies, which
// means the anon/authenticated keys cannot read or write them at all —
// only this service-role client can.
let _client: SupabaseClient | null = null
export function getAdminClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — did you load .env.local?')
  }
  _client = createClient(url, key)
  return _client
}

export async function fetchPerformance(performanceId: string): Promise<PerformanceRow> {
  // Deliberately base table — diagnostic CLI tool, wants to see everything
  // including deleted rows.
  const { data, error } = await getAdminClient()
    .from('performances')
    .select('id, user_id, show_id, started_at, ended_at, artist_name, venue_name, performance_date')
    .eq('id', performanceId)
    .single()
  if (error || !data) throw new Error(`performance ${performanceId} not found: ${error?.message}`)
  return data as PerformanceRow
}

export async function fetchDetectionEvents(performanceId: string): Promise<DetectionEventRow[]> {
  const { data, error } = await getAdminClient()
    .from('detection_events')
    .select('id, performance_id, detected_at, acr_title, acr_artist, acr_score, acr_state, final_title, final_artist, confidence_level, auto_confirmed, candidate_pool')
    .eq('performance_id', performanceId)
    .order('detected_at', { ascending: true })
  if (error) throw new Error(`fetchDetectionEvents failed: ${error.message}`)
  return (data || []) as DetectionEventRow[]
}

export async function fetchRecognitionLogs(performanceId: string): Promise<RecognitionLogRow[]> {
  const { data, error } = await getAdminClient()
    .from('recognition_logs')
    .select('id, created_at, performance_id, detected, title, artist, isrc, score, source, raw_response')
    .eq('performance_id', performanceId)
    .eq('detected', true)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`fetchRecognitionLogs failed: ${error.message}`)
  return (data || []) as RecognitionLogRow[]
}

// Tier b: full raw ACR payload for every chunk, but only reachable via
// performances.show_id -> audio_captures.show_id -> recognition_jobs.audio_capture_id.
// Coverage is sparse (most performances have zero audio_captures rows) —
// callers must treat an empty result as normal, not an error.
export async function fetchRecognitionJobsForShow(
  showId: string | null
): Promise<Array<{ id: string; timestamp: string; raw_response: any }>> {
  if (!showId) return []
  const admin = getAdminClient()
  const { data: captures, error: capErr } = await admin
    .from('audio_captures')
    .select('id, show_id, captured_at')
    .eq('show_id', showId)
    .order('captured_at', { ascending: true })
  if (capErr) throw new Error(`fetchRecognitionJobsForShow (audio_captures) failed: ${capErr.message}`)
  const captureRows = (captures || []) as AudioCaptureRow[]
  if (captureRows.length === 0) return []

  const captureIds = captureRows.map(c => c.id)
  const { data: jobs, error: jobErr } = await admin
    .from('recognition_jobs')
    .select('id, audio_capture_id, completed_at, raw_response')
    .in('audio_capture_id', captureIds)
  if (jobErr) throw new Error(`fetchRecognitionJobsForShow (recognition_jobs) failed: ${jobErr.message}`)

  const captureTsById = new Map(captureRows.map(c => [c.id, c.captured_at]))
  return ((jobs || []) as RecognitionJobRow[])
    .filter(j => j.raw_response)
    .map(j => ({
      id: j.id,
      timestamp: j.completed_at || captureTsById.get(j.audio_capture_id || '') || new Date(0).toISOString(),
      raw_response: j.raw_response,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export async function fetchPlannedSetlistSongs(performanceId: string): Promise<PlannedSetlistSongRow[]> {
  const admin = getAdminClient()
  const { data: planned } = await admin
    .from('planned_setlists').select('id').eq('performance_id', performanceId).maybeSingle()
  if (!planned?.id) return []
  const { data: songs, error } = await admin
    .from('planned_setlist_songs')
    .select('title, position')
    .eq('planned_setlist_id', planned.id)
    .order('position', { ascending: true })
  if (error) throw new Error(`fetchPlannedSetlistSongs failed: ${error.message}`)
  return (songs || []) as PlannedSetlistSongRow[]
}

export async function fetchArtistCatalogueTitles(userId: string | null): Promise<Set<string>> {
  const titles = new Set<string>()
  if (!userId) return titles
  const { data, error } = await getAdminClient()
    .from('user_songs').select('song_title').eq('user_id', userId).limit(1000)
  if (error) throw new Error(`fetchArtistCatalogueTitles failed: ${error.message}`)
  for (const row of (data || []) as UserSongRow[]) {
    const key = normalizeSongKey(row.song_title || '')
    if (key) titles.add(key)
  }
  return titles
}

// Map of normalized title -> number of the artist's OTHER confirmed
// performances that included it (capped for scoring by config, not here).
export async function fetchPriorConfirmedSetlistCounts(
  userId: string, excludePerformanceId: string
): Promise<Map<string, number>> {
  const admin = getAdminClient()
  const counts = new Map<string, number>()

  const { data: perfs, error: perfErr } = await admin
    .from('performances_visible').select('id').eq('user_id', userId).neq('id', excludePerformanceId)
  if (perfErr) throw new Error(`fetchPriorConfirmedSetlistCounts (performances) failed: ${perfErr.message}`)
  const perfIds = (perfs || []).map((p: any) => p.id)
  if (perfIds.length === 0) return counts

  const { data: songs, error: songErr } = await admin
    .from('performance_songs')
    .select('performance_id, title, artist_save_complete, artist_removed')
    .in('performance_id', perfIds)
    .eq('artist_save_complete', true)
  if (songErr) throw new Error(`fetchPriorConfirmedSetlistCounts (performance_songs) failed: ${songErr.message}`)

  const seenPerShow = new Map<string, Set<string>>() // performance_id -> normalized titles already counted
  for (const row of (songs || []) as PerformanceSongRow[]) {
    if (row.artist_removed === true) continue
    const key = normalizeSongKey(row.title || '')
    if (!key) continue
    let seen = seenPerShow.get(row.performance_id)
    if (!seen) { seen = new Set(); seenPerShow.set(row.performance_id, seen) }
    if (seen.has(key)) continue // one performance counts a song at most once
    seen.add(key)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

export async function fetchTruthFromPerformanceSongs(performanceId: string): Promise<TruthSong[]> {
  const { data, error } = await getAdminClient()
    .from('performance_songs')
    .select('title, artist, artist_save_complete, artist_removed')
    .eq('performance_id', performanceId)
    .eq('artist_save_complete', true)
  if (error) throw new Error(`fetchTruthFromPerformanceSongs failed: ${error.message}`)
  return ((data || []) as PerformanceSongRow[])
    .filter(row => row.artist_removed !== true)
    .map(row => ({ title: row.title, artist: row.artist || undefined }))
}

export interface RunRecord {
  performance_id: string
  mode: 'baseline' | 'engine'
  engine_version: string
  params: Record<string, any>
}

export async function insertReconciliationRun(run: RunRecord): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('reconciliation_runs')
    .insert({ ...run, status: 'running' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertReconciliationRun failed: ${error?.message}`)
  return data.id as string
}

export async function completeReconciliationRun(
  runId: string, scoring: Record<string, any>, status: 'completed' | 'failed' = 'completed', errorMessage?: string
): Promise<void> {
  const { error } = await getAdminClient()
    .from('reconciliation_runs')
    .update({ status, scoring, error_message: errorMessage || null, completed_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw new Error(`completeReconciliationRun failed: ${error.message}`)
}

export async function insertReconciliationConclusions(runId: string, conclusions: Conclusion[]): Promise<void> {
  if (conclusions.length === 0) return
  const rows = conclusions.map(c => ({
    run_id: runId,
    slot_index: c.slotIndex,
    slot_start: c.slotStart,
    slot_end: c.slotEnd,
    concluded_title: c.title,
    concluded_artist: c.artist,
    concluded_isrc: c.isrc,
    tier: c.tier,
    score: c.score,
    evidence: c.evidence,
  }))
  const { error } = await getAdminClient().from('reconciliation_conclusions').insert(rows)
  if (error) throw new Error(`insertReconciliationConclusions failed: ${error.message}`)
}

export interface RunSummary {
  id: string
  performance_id: string
  mode: 'baseline' | 'engine'
  engine_version: string
  params: Record<string, any>
  status: string
  scoring: Record<string, any> | null
  created_at: string
}

export async function fetchReconciliationRunsForPerformance(performanceId: string): Promise<RunSummary[]> {
  const { data, error } = await getAdminClient()
    .from('reconciliation_runs')
    .select('id, performance_id, mode, engine_version, params, status, scoring, created_at')
    .eq('performance_id', performanceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`fetchReconciliationRunsForPerformance failed: ${error.message}`)
  return (data || []) as RunSummary[]
}

// Deletes a single run by its exact id. reconciliation_conclusions rows
// cascade automatically (run_id REFERENCES reconciliation_runs(id) ON
// DELETE CASCADE). Intentionally takes only a single full UUID — no bulk
// or filtered delete — so a cleanup call can only ever remove the one row
// its caller explicitly named.
export async function deleteReconciliationRunById(runId: string): Promise<void> {
  const { error, count } = await getAdminClient()
    .from('reconciliation_runs')
    .delete({ count: 'exact' })
    .eq('id', runId)
  if (error) throw new Error(`deleteReconciliationRunById failed: ${error.message}`)
  if (count !== 1) throw new Error(`deleteReconciliationRunById: expected to delete exactly 1 row for id ${runId}, deleted ${count}`)
}

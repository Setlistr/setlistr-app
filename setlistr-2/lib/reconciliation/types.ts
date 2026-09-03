// Shared types for the reconciliation engine (lib/reconciliation/*).
// Additive-only module: reads capture data, never imports or mutates
// app/api/identify or any other capture-chain route.

export type SourceTier = 'a' | 'b' | 'c'
// a = recognition_logs.raw_response   (full ACR candidate array, but only for chunks that got auto-added)
// b = recognition_jobs.raw_response   (full ACR candidate array for every chunk, only where audio_captures exist)
// c = detection_events.candidate_pool (single collapsed candidate, every chunk, always present)

export interface Candidate {
  title: string
  normalizedTitle: string
  artist: string
  isrc: string | null
  score: number            // ACR-style 0-100 scale (humming already ×100, matching identify/route.ts convention)
  durationMs: number | null
  rank: number              // 1-based rank within its own observation's candidate array
}

export interface Observation {
  timestamp: string
  tier: SourceTier
  sourceRowIds: {
    detectionEventId: string | null
    recognitionLogId: string | null
    recognitionJobId: string | null
  }
  candidates: Candidate[]    // full ranked array for tier a/b, 0-1 synthetic entries for tier c
  autoConfirmed: boolean     // true if live detection's inclusion cascade added this chunk's top candidate
}

export interface Slot {
  index: number
  startTs: string
  endTs: string
  observations: Observation[]
  anchorTitle: string | null      // normalized title, set when CLUSTER found a confident run of consecutive matches
  anchorArtist: string | null
  anchorCandidate: Candidate | null
}

export interface PriorApplied {
  name: string
  weight: number
  detail: string
}

export type Tier = 'CONFIRMED' | 'LIKELY' | 'UNKNOWN'

export interface Conclusion {
  slotIndex: number
  slotStart: string
  slotEnd: string
  title: string | null
  artist: string | null
  isrc: string | null
  tier: Tier
  score: number
  evidence: {
    log_row_ids: string[]
    priors_applied: PriorApplied[]
    source_tier: SourceTier
  }
}

export interface TruthSong {
  title: string
  artist?: string
}

export interface ScoreResult {
  predictedCount: number
  truthCount: number
  truePositives: number
  precision: number
  recall: number
  f1: number
  headline: string
  matched: string[]
  missed: string[]
  extra: string[]
}

// ── Raw DB row shapes (only the columns we actually read) ─────────────────

export interface PerformanceRow {
  id: string
  user_id: string
  show_id: string | null
  started_at: string | null
  ended_at: string | null
  artist_name: string | null
  venue_name: string | null
  performance_date: string | null
}

export interface RecognitionLogRow {
  id: string
  created_at: string
  performance_id: string | null
  detected: boolean
  title: string | null
  artist: string | null
  isrc: string | null
  score: number | null
  source: 'fingerprint' | 'humming' | null
  raw_response: any
}

export interface DetectionEventRow {
  id: string
  performance_id: string | null
  detected_at: string
  acr_title: string | null
  acr_artist: string | null
  acr_score: number | null
  acr_state: string | null
  final_title: string | null
  final_artist: string | null
  confidence_level: string | null
  auto_confirmed: boolean | null
  candidate_pool: any
  // Upload-only, nullable — see supabase/migrations/0004_upload_chunk_index.sql.
  // NULL for every Live Capture row and any Upload row written before this
  // column existed; those fall back to evidence.ts's existing timestamp-
  // proximity matching, unchanged.
  chunk_index: number | null
}

export interface AudioCaptureRow {
  id: string
  show_id: string | null
  captured_at: string
}

export interface RecognitionJobRow {
  id: string
  audio_capture_id: string | null
  completed_at: string | null
  raw_response: any
  // Already existed in the DB (app/api/upload-recognize/route.ts has always
  // written { host, audio_bytes, performance_id, chunk_index } here) — only
  // newly SELECTed by db.ts as of the chunk_index linkage fix, not a schema
  // change.
  raw_request: any
}

export interface PlannedSetlistSongRow {
  title: string
  position: number
}

export interface PerformanceSongRow {
  id: string
  performance_id: string
  title: string
  artist: string | null
  was_planned: boolean | null
  artist_save_complete: boolean | null
  artist_removed: boolean | null
}

export interface UserSongRow {
  song_title: string
}

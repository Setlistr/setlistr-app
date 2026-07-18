// Builds one merged, tiered observation timeline per performance.
//
// detection_events is the only table with full temporal coverage (every
// chunk, hit or miss), so it's the backbone. Each event is then enriched
// with the richest candidate data available for that exact chunk:
//   tier a — recognition_logs.raw_response   (full ACR array, added chunks only)
//   tier b — recognition_jobs.raw_response   (full ACR array, any chunk, sparse coverage)
//   tier c — detection_events.candidate_pool (single collapsed guess, always present)
// per the approved RESOLVE ladder (a, falling back to b, falling back to c).

import { normalizeSongKey, cleanTitle } from './normalize'
import {
  fetchDetectionEvents, fetchRecognitionLogs, fetchRecognitionJobsForShow,
} from './db'
import type {
  Candidate, Observation, PerformanceRow, RecognitionLogRow, DetectionEventRow,
} from './types'

const TIER_A_MATCH_TOLERANCE_MS = 5_000
const TIER_B_MATCH_TOLERANCE_MS = 10_000

function toScore(rawScore: unknown, isHumming: boolean): number {
  const n = typeof rawScore === 'string' ? parseFloat(rawScore) : (typeof rawScore === 'number' ? rawScore : 0)
  if (!Number.isFinite(n)) return 0
  return isHumming ? n * 100 : n
}

function makeCandidate(item: any, rank: number, isHumming: boolean): Candidate {
  const title = cleanTitle(item.title || '')
  return {
    title,
    normalizedTitle: normalizeSongKey(title),
    artist: item.artists?.[0]?.name || '',
    isrc: item.external_ids?.isrc || null,
    score: toScore(item.score, isHumming),
    durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : null,
    rank,
  }
}

// Same array-selection logic as identify/route.ts: prefer humming over
// fingerprint when both are present in a single ACR response.
export function extractCandidatesFromPayload(raw: any): Candidate[] {
  if (!raw?.metadata) return []
  const humming: any[] = raw.metadata.humming || []
  const music: any[] = raw.metadata.music || []
  if (humming.length > 0) return humming.map((item, i) => makeCandidate(item, i + 1, true))
  if (music.length > 0) return music.map((item, i) => makeCandidate(item, i + 1, false))
  return []
}

function extractTierCCandidates(event: DetectionEventRow): Candidate[] {
  const pool: any[] = Array.isArray(event.candidate_pool) ? event.candidate_pool : []
  if (pool.length > 0) {
    return pool
      .filter(item => item && item.title)
      .map((item, i) => {
        const title = cleanTitle(item.title)
        return {
          title,
          normalizedTitle: normalizeSongKey(title),
          artist: item.artist || '',
          isrc: null,
          score: typeof item.score === 'number' ? item.score : 0,
          durationMs: null,
          rank: i + 1,
        }
      })
  }
  if (event.acr_title) {
    const title = cleanTitle(event.acr_title)
    return [{
      title,
      normalizedTitle: normalizeSongKey(title),
      artist: event.acr_artist || '',
      isrc: null,
      score: typeof event.acr_score === 'number' ? event.acr_score : 0,
      durationMs: null,
      rank: 1,
    }]
  }
  return []
}

export async function buildObservationTimeline(performance: PerformanceRow): Promise<Observation[]> {
  const [detectionEvents, recognitionLogs, recognitionJobs] = await Promise.all([
    fetchDetectionEvents(performance.id),
    fetchRecognitionLogs(performance.id),
    fetchRecognitionJobsForShow(performance.show_id),
  ])

  const usedLogIds = new Set<string>()
  const usedJobIds = new Set<string>()

  return detectionEvents.map((event): Observation => {
    const finalKey = event.final_title ? normalizeSongKey(event.final_title) : null

    let bestLog: RecognitionLogRow | null = null
    let bestLogDiff = Infinity
    if (finalKey) {
      for (const log of recognitionLogs) {
        if (usedLogIds.has(log.id)) continue
        if (normalizeSongKey(log.title || '') !== finalKey) continue
        const diff = Math.abs(new Date(log.created_at).getTime() - new Date(event.detected_at).getTime())
        if (diff <= TIER_A_MATCH_TOLERANCE_MS && diff < bestLogDiff) { bestLog = log; bestLogDiff = diff }
      }
    }
    if (bestLog) {
      usedLogIds.add(bestLog.id)
      return {
        timestamp: event.detected_at,
        tier: 'a',
        sourceRowIds: { detectionEventId: event.id, recognitionLogId: bestLog.id, recognitionJobId: null },
        candidates: extractCandidatesFromPayload(bestLog.raw_response),
        autoConfirmed: !!event.auto_confirmed,
      }
    }

    let bestJob: { id: string; timestamp: string; raw_response: any } | null = null
    let bestJobDiff = Infinity
    for (const job of recognitionJobs) {
      if (usedJobIds.has(job.id)) continue
      const diff = Math.abs(new Date(job.timestamp).getTime() - new Date(event.detected_at).getTime())
      if (diff <= TIER_B_MATCH_TOLERANCE_MS && diff < bestJobDiff) { bestJob = job; bestJobDiff = diff }
    }
    if (bestJob) {
      usedJobIds.add(bestJob.id)
      return {
        timestamp: event.detected_at,
        tier: 'b',
        sourceRowIds: { detectionEventId: event.id, recognitionLogId: null, recognitionJobId: bestJob.id },
        candidates: extractCandidatesFromPayload(bestJob.raw_response),
        autoConfirmed: !!event.auto_confirmed,
      }
    }

    return {
      timestamp: event.detected_at,
      tier: 'c',
      sourceRowIds: { detectionEventId: event.id, recognitionLogId: null, recognitionJobId: null },
      candidates: extractTierCCandidates(event),
      autoConfirmed: !!event.auto_confirmed,
    }
  })
}

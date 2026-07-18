// BEFORE: what live detection alone produced. recognition_logs only ever
// gets one row per song the inclusion cascade actually auto-added (the
// "already added" branch in identify/route.ts returns before writing a
// second row for a repeat), so this is already the deduplicated top-result
// set the existing pipeline concluded, with zero reconciliation applied.

import { fetchRecognitionLogs } from './db'
import { normalizeSongKey } from './normalize'

export interface BaselinePrediction {
  title: string
  artist: string | null
  normalizedTitle: string
}

export async function runBaseline(performanceId: string): Promise<BaselinePrediction[]> {
  const logs = await fetchRecognitionLogs(performanceId)
  const seen = new Set<string>()
  const predictions: BaselinePrediction[] = []
  for (const log of logs) {
    if (!log.title) continue
    const key = normalizeSongKey(log.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    predictions.push({ title: log.title, artist: log.artist, normalizedTitle: key })
  }
  return predictions
}

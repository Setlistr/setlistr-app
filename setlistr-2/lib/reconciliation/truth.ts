// Ground truth for scoring: either the artist's own confirmation
// (performance_songs.artist_save_complete = true) or a manually supplied
// truth list — the latter is how external attestations (e.g. Depot Park /
// Pickering Casino, confirmed by the artist's team rather than through the
// review page) get fed into the harness.

import { readFileSync } from 'fs'
import { fetchTruthFromPerformanceSongs } from './db'
import type { TruthSong } from './types'

export type TruthSource = 'manual' | 'performance_songs'

export async function loadTruth(
  performanceId: string, truthFilePath?: string
): Promise<{ truth: TruthSong[]; source: TruthSource }> {
  if (truthFilePath) {
    const raw = readFileSync(truthFilePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`truth file ${truthFilePath} must be a non-empty JSON array of {title, artist?}`)
    }
    for (const item of parsed) {
      if (typeof item.title !== 'string' || !item.title.trim()) {
        throw new Error(`truth file ${truthFilePath} contains an entry without a string "title"`)
      }
    }
    return { truth: parsed as TruthSong[], source: 'manual' }
  }

  const truth = await fetchTruthFromPerformanceSongs(performanceId)
  if (truth.length === 0) {
    throw new Error(
      `performance ${performanceId} has no artist_save_complete=true performance_songs rows and no ` +
      `--truth-file was given — cannot score without ground truth`
    )
  }
  return { truth, source: 'performance_songs' }
}

// CONCLUDE stage: applies the tier thresholds and packages the evidence
// row exactly as reconciliation_conclusions.evidence expects it — always
// including source_tier, per the approved RESOLVE ladder.

import { RECONCILIATION_CONFIG as CFG } from './config'
import type { Conclusion, Slot, Tier } from './types'
import type { Resolution } from './resolve'

function tierFromScore(score: number): Tier {
  if (score >= CFG.CONFIRMED_THRESHOLD) return 'CONFIRMED'
  if (score >= CFG.LIKELY_THRESHOLD) return 'LIKELY'
  return 'UNKNOWN'
}

export function concludeSlot(slot: Slot, resolution: Resolution): Conclusion {
  return {
    slotIndex: slot.index,
    slotStart: slot.startTs,
    slotEnd: slot.endTs,
    title: resolution.title,
    artist: resolution.artist,
    isrc: resolution.isrc,
    tier: tierFromScore(resolution.score),
    score: Math.round(resolution.score * 10000) / 10000,
    evidence: {
      log_row_ids: resolution.logRowIds,
      priors_applied: resolution.priorsApplied,
      // A slot with zero candidates anywhere (true silence/no-result) has no
      // real source tier to cite — default to 'c', the always-present floor.
      source_tier: resolution.sourceTier ?? 'c',
    },
  }
}

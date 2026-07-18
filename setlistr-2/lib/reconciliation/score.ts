import { normalizeSongKey } from './normalize'
import type { Resolution, GroupScoreBreakdown } from './resolve'
import type { Conclusion, ScoreResult, Tier, TruthSong } from './types'

export function scorePredictions(predictedTitles: string[], truth: TruthSong[]): ScoreResult {
  const predictedKeys = new Set(predictedTitles.map(normalizeSongKey).filter(Boolean))
  const truthKeys = new Set(truth.map(t => normalizeSongKey(t.title)).filter(Boolean))

  const matched = Array.from(predictedKeys).filter(k => truthKeys.has(k))
  const extra = Array.from(predictedKeys).filter(k => !truthKeys.has(k))
  const missed = Array.from(truthKeys).filter(k => !predictedKeys.has(k))

  const tp = matched.length
  const precision = predictedKeys.size > 0 ? tp / predictedKeys.size : 0
  const recall = truthKeys.size > 0 ? tp / truthKeys.size : 0
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0

  return {
    predictedCount: predictedKeys.size,
    truthCount: truthKeys.size,
    truePositives: tp,
    precision, recall, f1,
    headline: `${tp} / ${truthKeys.size}`,
    matched, missed, extra,
  }
}

export interface MissedSong {
  normalizedTitle: string
  // 'suppressed'          — some slot's WINNING candidate matched this title,
  //                         but it scored below the tier cutoff being
  //                         counted — evidence existed, won its slot, the
  //                         config kept it below the counted tiers.
  // 'out_competed_in_slot' — this title appeared as a candidate in one or
  //                         more observations, but never won ANY slot — a
  //                         higher-scoring group won every slot it competed
  //                         in. Evidence existed and was seen, but never
  //                         surfaced as any conclusion's title.
  // 'no_evidence'         — this title never appeared as a candidate in any
  //                         observation, winning or losing, anywhere in the
  //                         performance's timeline. Never-detected.
  reason: 'suppressed' | 'out_competed_in_slot' | 'no_evidence'
  bestConclusionTier?: Tier
  bestConclusionScore?: number
  bestLosingBreakdown?: GroupScoreBreakdown
  bestLosingSlotIndex?: number
  bestLosingWinnerTitle?: string | null
}

export interface EngineScoreResult extends ScoreResult {
  missedDetail: MissedSong[]
}

// Same precision/recall/F1 as scorePredictions, filtered to the tiers being
// counted, plus a missed-song breakdown that distinguishes three cases —
// suppressed-but-won, out-competed-in-slot, and truly never seen — needed
// before any suppression-weight tuning can be judged against real cause
// rather than intuition.
//
// `resolutions` is optional and must be the parallel array returned
// alongside `conclusions` by runEngine() (same slot order) — without it,
// out_competed_in_slot can't be distinguished from no_evidence and every
// non-winning missed title falls back to no_evidence, matching the prior
// (pre-losing-group) behavior of this function.
export function scoreConclusions(
  conclusions: Conclusion[], truth: TruthSong[], countTiers: Tier[], resolutions?: Resolution[]
): EngineScoreResult {
  const predictedTitles = conclusions
    .filter(c => c.title && countTiers.includes(c.tier))
    .map(c => c.title as string)
  const base = scorePredictions(predictedTitles, truth)

  const bestByTitle = new Map<string, Conclusion>()
  for (const c of conclusions) {
    if (!c.title) continue
    const key = normalizeSongKey(c.title)
    const existing = bestByTitle.get(key)
    if (!existing || c.score > existing.score) bestByTitle.set(key, c)
  }

  // For each missed title, find its best (highest finalScore) appearance
  // across every slot's losing groups, plus which title actually won that
  // slot — so the harness can report exactly what out-competed it.
  const bestLosingByTitle = new Map<string, { breakdown: GroupScoreBreakdown; slotIndex: number; winnerTitle: string | null }>()
  if (resolutions) {
    resolutions.forEach((resolution, slotIndex) => {
      for (const losing of resolution.losingGroups) {
        const existing = bestLosingByTitle.get(losing.normalizedTitle)
        if (!existing || losing.finalScore > existing.breakdown.finalScore) {
          bestLosingByTitle.set(losing.normalizedTitle, { breakdown: losing, slotIndex, winnerTitle: resolution.title })
        }
      }
    })
  }

  const missedDetail: MissedSong[] = base.missed.map(normalizedTitle => {
    const best = bestByTitle.get(normalizedTitle)
    if (best) {
      return { normalizedTitle, reason: 'suppressed', bestConclusionTier: best.tier, bestConclusionScore: best.score }
    }
    const losing = bestLosingByTitle.get(normalizedTitle)
    if (losing) {
      return {
        normalizedTitle, reason: 'out_competed_in_slot',
        bestLosingBreakdown: losing.breakdown, bestLosingSlotIndex: losing.slotIndex, bestLosingWinnerTitle: losing.winnerTitle,
      }
    }
    return { normalizedTitle, reason: 'no_evidence' }
  })

  return { ...base, missedDetail }
}

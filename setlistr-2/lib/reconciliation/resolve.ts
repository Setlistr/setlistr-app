// RESOLVE stage: turns a Slot (from CLUSTER) into a best-guess candidate +
// score, using the full candidate arrays available within the slot plus
// named priors. Works identically whether the slot already has a CLUSTER
// anchor (strong direct evidence) or is weak/empty (must lean on priors) —
// an anchor is simply folded in as one more named, scored signal.

import { RECONCILIATION_CONFIG as CFG } from './config'
import type { Candidate, PriorApplied, Slot, SourceTier } from './types'

export interface Priors {
  plannedTitles: Set<string>            // normalized
  plannedOrder: Map<string, number>     // normalized title -> position
  catalogueTitles: Set<string>          // normalized, from user_songs
  priorConfirmedCounts: Map<string, number> // normalized title -> # of artist's other confirmed shows containing it
}

// Full computed score breakdown for one candidate group within a slot,
// whether it won or lost. Additive/observability only — nothing here
// feeds back into scoring; it exists so the harness (and the missed-song
// classifier in score.ts) can tell "evidence existed but lost slot
// resolution" apart from "no evidence existed anywhere."
export interface GroupScoreBreakdown {
  normalizedTitle: string
  title: string
  artist: string | null
  isrc: string | null
  bestScore: number           // base candidate score (ACR score/100 * rank decay * tier multiplier), pre-boost
  bestTier: SourceTier
  supportingObservations: number
  consistencyBoost: number
  anchorBoost: number
  priorsApplied: PriorApplied[]  // planned/catalogue/prior-confirmed-setlist boosts, or the suppression entry
  suppressionMultiplier: number  // 1 if not suppressed, CFG.UNKNOWN_SONG_SUPPRESSION if suppressed
  finalScore: number             // clamped [0, 1] — what this group would have scored had it won
  logRowIds: string[]
}

export interface Resolution {
  title: string | null
  artist: string | null
  isrc: string | null
  score: number                // clamped [0, 1]
  priorsApplied: PriorApplied[]
  sourceTier: SourceTier | null
  logRowIds: string[]
  losingGroups: GroupScoreBreakdown[]
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)) }

function tierRank(t: SourceTier): number { return t === 'a' ? 2 : t === 'b' ? 1 : 0 }

function baseCandidateScore(candidate: Candidate, tier: SourceTier): number {
  const tierMultiplier = tier === 'c' ? CFG.TIER_C_CONFIDENCE_MULTIPLIER : 1
  const rankMultiplier = Math.pow(CFG.RANK_DECAY, candidate.rank - 1)
  return clamp01((candidate.score / 100) * rankMultiplier * tierMultiplier)
}

function applyPriors(
  candidateKey: string, priors: Priors, expectedNextPlannedTitle: string | null
): { boost: number; applied: PriorApplied[]; suppressed: boolean } {
  const applied: PriorApplied[] = []
  let boost = 0
  let matchedAny = false

  if (priors.plannedTitles.has(candidateKey)) {
    boost += CFG.PLANNED_SETLIST_MEMBERSHIP_BOOST
    applied.push({
      name: 'planned_setlist_membership', weight: CFG.PLANNED_SETLIST_MEMBERSHIP_BOOST,
      detail: 'song is on the planned setlist',
    })
    matchedAny = true
    if (expectedNextPlannedTitle && expectedNextPlannedTitle === candidateKey) {
      boost += CFG.PLANNED_SETLIST_ORDER_BOOST
      applied.push({
        name: 'planned_setlist_order', weight: CFG.PLANNED_SETLIST_ORDER_BOOST,
        detail: 'matches the next un-played planned song in position order',
      })
    }
  }

  if (priors.catalogueTitles.has(candidateKey)) {
    boost += CFG.ARTIST_CATALOGUE_MEMBERSHIP_BOOST
    applied.push({
      name: 'artist_catalogue_membership', weight: CFG.ARTIST_CATALOGUE_MEMBERSHIP_BOOST,
      detail: 'song is in the artist catalogue (user_songs)',
    })
    matchedAny = true
  }

  const priorShows = priors.priorConfirmedCounts.get(candidateKey) || 0
  if (priorShows > 0) {
    const cappedShows = Math.min(priorShows, CFG.PRIOR_CONFIRMED_SETLIST_BOOST_MAX_SHOWS)
    const w = cappedShows * CFG.PRIOR_CONFIRMED_SETLIST_BOOST_PER_SHOW
    boost += w
    applied.push({
      name: 'prior_confirmed_setlists', weight: w,
      detail: `played in ${priorShows} of the artist's other confirmed setlists (capped at ${CFG.PRIOR_CONFIRMED_SETLIST_BOOST_MAX_SHOWS})`,
    })
    matchedAny = true
  }

  if (!matchedAny) {
    applied.push({
      name: 'unknown_song_suppression', weight: -(1 - CFG.UNKNOWN_SONG_SUPPRESSION),
      detail: 'not planned, not in the artist catalogue, never confirmed before — treated as likely ACR noise',
    })
  }

  return { boost, applied, suppressed: !matchedAny }
}

interface GroupAgg {
  normalizedTitle: string
  bestCandidate: Candidate
  bestScore: number
  bestTier: SourceTier
  supportingObservations: number
  logRowIds: Set<string>
}

export function resolveSlot(
  slot: Slot, priors: Priors, expectedNextPlannedTitle: string | null
): Resolution {
  const groups = new Map<string, GroupAgg>()

  for (const obs of slot.observations) {
    const seenInThisObs = new Set<string>()
    for (const candidate of obs.candidates) {
      if (!candidate.normalizedTitle) continue
      const score = baseCandidateScore(candidate, obs.tier)
      let group = groups.get(candidate.normalizedTitle)
      if (!group) {
        group = {
          normalizedTitle: candidate.normalizedTitle, bestCandidate: candidate,
          bestScore: score, bestTier: obs.tier, supportingObservations: 0, logRowIds: new Set(),
        }
        groups.set(candidate.normalizedTitle, group)
      }
      if (score > group.bestScore || (score === group.bestScore && tierRank(obs.tier) > tierRank(group.bestTier))) {
        group.bestScore = score
        group.bestCandidate = candidate
        group.bestTier = obs.tier
      }
      if (!seenInThisObs.has(candidate.normalizedTitle)) {
        seenInThisObs.add(candidate.normalizedTitle)
        group.supportingObservations += 1
      }
      const rowId = obs.sourceRowIds.recognitionLogId || obs.sourceRowIds.recognitionJobId || obs.sourceRowIds.detectionEventId
      if (rowId) group.logRowIds.add(rowId)
    }
  }

  if (groups.size === 0) {
    const allEventIds = slot.observations
      .map(o => o.sourceRowIds.detectionEventId)
      .filter((id): id is string => !!id)
    return {
      title: null, artist: null, isrc: null, score: 0, priorsApplied: [],
      sourceTier: null, logRowIds: allEventIds, losingGroups: [],
    }
  }

  const breakdowns: GroupScoreBreakdown[] = []

  for (const agg of Array.from(groups.values())) {
    const consistencyBoost = Math.min(
      CFG.CONSISTENCY_BOOST_MAX,
      (agg.supportingObservations - 1) * CFG.CONSISTENCY_BOOST_PER_OBSERVATION
    )
    const anchorBoost = slot.anchorTitle === agg.normalizedTitle ? CFG.ANCHOR_BASE_SCORE : 0
    const priorResult = applyPriors(agg.normalizedTitle, priors, expectedNextPlannedTitle)

    const suppressionMultiplier = priorResult.suppressed ? CFG.UNKNOWN_SONG_SUPPRESSION : 1
    const rawScore = (agg.bestScore + consistencyBoost + anchorBoost + priorResult.boost) * suppressionMultiplier
    const finalScore = clamp01(rawScore)

    const priorsApplied: PriorApplied[] = [
      ...(anchorBoost > 0
        ? [{ name: 'cluster_anchor', weight: anchorBoost, detail: `${agg.supportingObservations} consecutive matching observations anchored this slot` }]
        : []),
      ...(consistencyBoost > 0
        ? [{ name: 'cross_chunk_consistency', weight: consistencyBoost, detail: `candidate reappeared across ${agg.supportingObservations} observations in this slot` }]
        : []),
      ...priorResult.applied,
    ]

    breakdowns.push({
      normalizedTitle: agg.normalizedTitle,
      title: agg.bestCandidate.title,
      artist: agg.bestCandidate.artist || null,
      isrc: agg.bestCandidate.isrc,
      bestScore: agg.bestScore,
      bestTier: agg.bestTier,
      supportingObservations: agg.supportingObservations,
      consistencyBoost, anchorBoost, priorsApplied, suppressionMultiplier,
      finalScore, logRowIds: Array.from(agg.logRowIds),
    })
  }

  let winnerIdx = 0
  for (let idx = 1; idx < breakdowns.length; idx++) {
    if (breakdowns[idx].finalScore > breakdowns[winnerIdx].finalScore) winnerIdx = idx
  }
  const winner = breakdowns[winnerIdx]
  const losingGroups = breakdowns.filter((_, idx) => idx !== winnerIdx)

  return {
    title: winner.title,
    artist: winner.artist,
    isrc: winner.isrc,
    score: winner.finalScore,
    priorsApplied: winner.priorsApplied,
    sourceTier: winner.bestTier,
    logRowIds: winner.logRowIds,
    losingGroups,
  }
}

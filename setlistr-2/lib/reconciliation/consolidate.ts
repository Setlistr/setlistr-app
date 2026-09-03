// CONSOLIDATE stage: runs AFTER CLUSTER -> RESOLVE -> CONCLUDE, as a pure
// post-processing pass over the Conclusion[] array runEngine() already
// produces. Never touches CLUSTER/RESOLVE/CONCLUDE's own logic, never
// re-scores anything, never reads or writes the DB.
//
// Root cause this exists for (read-only diagnostic, 2026-09-03, traced
// against two real Upload performances — 5d48c873-6ee1-4bad-814b-
// a6bfe9174b23 and 321745f1-ffff-403d-b6bd-87d27b6719db): CLUSTER's run
// detection (cluster.ts) is a strict, zero-tolerance consecutive-equality
// scan — a single noisy/unrelated ACR top-candidate observation sitting
// mid-song is enough to break one real continuous song into two separately
// anchored slots, each independently satisfying ANCHOR_MIN_CONSECUTIVE.
// Traced 9 real duplicate-title CONFIRMED slot pairs: 8 of 9 had zero
// intervening slots of any kind (pure candidate-noise splits, safe to
// merge); the 9th had a real, different CONFIRMED song between the two
// appearances and must NOT be merged. This stage's rule is built and
// validated specifically against that exact split.
//
// Rule: merge two same-normalized-title CONFIRMED/LIKELY conclusions only
// when no DIFFERENT CONFIRMED/LIKELY conclusion sits between them in slot
// order. An UNKNOWN-tier conclusion (even one with a title) never blocks a
// merge and is never itself merged with anything — it passes through
// unchanged. This deliberately does NOT globally dedupe by title: a real
// repeated song separated by another confirmed song stays two entries.

import { normalizeSongKey } from './normalize'
import type { Conclusion, PriorApplied, SourceTier, Tier } from './types'

function tierRank(t: SourceTier): number { return t === 'a' ? 2 : t === 'b' ? 1 : 0 }

// One original slot's worth of evidence, preserved verbatim inside a merged
// conclusion's audit trail — nothing is discarded on merge, only summarized
// at the top level.
export interface ConsolidatedSource {
  slotIndex: number
  slotStart: string
  slotEnd: string
  tier: Tier
  score: number
  artist: string | null
  isrc: string | null
  sourceTier: SourceTier
  logRowIds: string[]
}

export interface ConsolidatedConclusion {
  title: string | null
  artist: string | null
  isrc: string | null
  tier: Tier
  score: number
  slotStart: string  // earliest merged instance's start
  slotEnd: string    // latest merged instance's end
  evidence: {
    log_row_ids: string[]           // deduped union across every merged instance
    priors_applied: PriorApplied[]  // from the winning (representative) instance only
    source_tier: SourceTier         // winning instance's source tier
  }
  // Full per-instance audit trail, in original slot order. Length 1 when
  // nothing was merged — every conclusion (merged or not) has this field,
  // so callers can check `mergedFrom.length > 1` rather than special-case
  // "was this touched by CONSOLIDATE at all."
  mergedFrom: ConsolidatedSource[]
}

function toSource(c: Conclusion): ConsolidatedSource {
  return {
    slotIndex: c.slotIndex, slotStart: c.slotStart, slotEnd: c.slotEnd,
    tier: c.tier, score: c.score, artist: c.artist, isrc: c.isrc,
    sourceTier: c.evidence.source_tier, logRowIds: c.evidence.log_row_ids,
  }
}

function toConsolidated(c: Conclusion): ConsolidatedConclusion {
  return {
    title: c.title, artist: c.artist, isrc: c.isrc, tier: c.tier, score: c.score,
    slotStart: c.slotStart, slotEnd: c.slotEnd,
    evidence: {
      log_row_ids: [...c.evidence.log_row_ids],
      priors_applied: c.evidence.priors_applied,
      source_tier: c.evidence.source_tier,
    },
    mergedFrom: [toSource(c)],
  }
}

// Merges `next` into `group` IN PLACE. The representative title/artist/
// isrc/tier/score/priors_applied come from whichever instance — the
// group's current representative, or `next` — has the stronger
// evidence.source_tier (a > b > c). Score only breaks a tie between equal
// tiers; it is never the primary criterion, since both instances are
// frequently already at the 1.0 score ceiling and can't be discriminated
// by score alone. On a true tie (equal tier, equal score) the existing
// representative is kept, for determinism. slotStart/slotEnd expand to
// cover the full merged span; log_row_ids is the deduped union of every
// merged instance's rows, so no evidence is lost even for the instance
// that didn't win representative status.
function mergeInto(group: ConsolidatedConclusion, next: Conclusion): void {
  const currentRank = tierRank(group.evidence.source_tier)
  const nextRank = tierRank(next.evidence.source_tier)
  const nextIsStronger = nextRank > currentRank || (nextRank === currentRank && next.score > group.score)

  if (nextIsStronger) {
    group.title = next.title
    group.artist = next.artist
    group.isrc = next.isrc
    group.tier = next.tier
    group.score = next.score
    group.evidence.priors_applied = next.evidence.priors_applied
    group.evidence.source_tier = next.evidence.source_tier
  }

  if (next.slotStart < group.slotStart) group.slotStart = next.slotStart
  if (next.slotEnd > group.slotEnd) group.slotEnd = next.slotEnd

  const seen = new Set(group.evidence.log_row_ids)
  for (const id of next.evidence.log_row_ids) {
    if (!seen.has(id)) { seen.add(id); group.evidence.log_row_ids.push(id) }
  }

  group.mergedFrom.push(toSource(next))
}

// CONSOLIDATE — the fourth stage. Pure function: takes CONCLUDE's output in
// slot order, returns a new array; never mutates its input.
export function consolidateConclusions(conclusions: Conclusion[]): ConsolidatedConclusion[] {
  const result: ConsolidatedConclusion[] = []
  // The single most-recently-seen CONFIRMED/LIKELY title — this is exactly
  // "the open group," since as soon as a DIFFERENT CONFIRMED/LIKELY title
  // appears it replaces this, correctly closing off any earlier group for
  // a title that might reappear later (the "Phone Call From Home" case).
  let openGroup: { key: string; index: number } | null = null

  for (const c of conclusions) {
    const isConfirmedOrLikely = c.tier === 'CONFIRMED' || c.tier === 'LIKELY'
    if (!c.title || !isConfirmedOrLikely) {
      // UNKNOWN (or titleless) conclusions pass through untouched — they
      // never block a later merge and are never merged with anything.
      result.push(toConsolidated(c))
      continue
    }

    const key = normalizeSongKey(c.title)
    if (openGroup && openGroup.key === key) {
      mergeInto(result[openGroup.index], c)
    } else {
      result.push(toConsolidated(c))
      openGroup = { key, index: result.length - 1 }
    }
  }

  return result
}

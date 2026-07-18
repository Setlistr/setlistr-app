// CLUSTER stage: groups the observation timeline into slots.
//   - same-song consecutive matches (by top candidate) anchor a slot
//   - a song-duration prior (~1.5x the anchor's known ACR duration, or a
//     flat default when no duration is known) caps how much of the
//     following timeline that anchored slot can absorb
//   - CONFIRMED FAILURE MODE (Scotiabank slot 7, 2026-07-18): the 1.5x cap
//     absorbs everything up to the cap regardless of content, so a long
//     anchor (e.g. a bootleg/live-tagged duration) can swallow a genuinely
//     different song that starts partway through. Fix: once a slot has
//     passed 1.0x of the anchor's nominal duration, if >=2 independent
//     rank-1 observations agree on the same non-anchor title, the slot
//     closes at the FIRST such observation and a new slot anchors on that
//     title instead. Before 1.0x, absorption is unchanged (jam/extended-
//     outro tolerance is intentional and stays as-is).
//   - runs of observations between two differently-anchored runs, that
//     the duration prior doesn't absorb, become their own unresolved
//     ("no-result gap") candidate slot for RESOLVE to fill in
//   - performances.started_at/ended_at bound the whole timeline (this
//     schema's capture_sessions rows are unpopulated in practice, so the
//     performance row itself is the only reliable session boundary)

import { RECONCILIATION_CONFIG as CFG } from './config'
import type { Observation, PerformanceRow, Slot } from './types'

function topCandidateKey(obs: Observation): string | null {
  return obs.candidates[0]?.normalizedTitle || null
}

export function clusterObservations(performance: PerformanceRow, observations: Observation[]): Slot[] {
  if (observations.length === 0) return []

  // performances.started_at/ended_at is the only reliable session bound in
  // this schema (capture_sessions rows are unpopulated in practice) — but
  // the upload path (app/app/show/upload/page.tsx) writes an identical
  // placeholder timestamp to both fields, since it has no real session
  // clock. A zero-or-negative-width performance span would filter out
  // every real observation and produce zero slots, so fall back to the
  // observation timeline's own min/max timestamp whenever the performance
  // span isn't real.
  const obsMinMs = new Date(observations[0].timestamp).getTime()
  const obsMaxMs = new Date(observations[observations.length - 1].timestamp).getTime()
  const perfStartMs = performance.started_at ? new Date(performance.started_at).getTime() : NaN
  const perfEndMs = performance.ended_at ? new Date(performance.ended_at).getTime() : NaN
  const hasRealSpan = Number.isFinite(perfStartMs) && Number.isFinite(perfEndMs) && perfStartMs < perfEndMs
  const boundStartMs = hasRealSpan ? perfStartMs : obsMinMs
  const boundEndMs = hasRealSpan ? perfEndMs : obsMaxMs

  const inBounds = observations.filter(o => {
    const ts = new Date(o.timestamp).getTime()
    return ts >= boundStartMs && ts <= boundEndMs
  })
  if (inBounds.length === 0) return []
  const boundStart = new Date(boundStartMs).toISOString()
  const boundEnd = new Date(boundEndMs).toISOString()

  type Run = { title: string; startIdx: number; endIdx: number; durationMs: number | null }
  const runs: Run[] = []
  let i = 0
  while (i < inBounds.length) {
    const key = topCandidateKey(inBounds[i])
    if (!key) { i++; continue }
    let j = i
    while (j + 1 < inBounds.length && topCandidateKey(inBounds[j + 1]) === key) j++
    if (j - i + 1 >= CFG.ANCHOR_MIN_CONSECUTIVE) {
      runs.push({ title: key, startIdx: i, endIdx: j, durationMs: inBounds[i].candidates[0]?.durationMs ?? null })
    }
    i = j + 1
  }

  if (runs.length === 0) {
    return [{
      index: 0, startTs: boundStart, endTs: boundEnd, observations: inBounds,
      anchorTitle: null, anchorArtist: null, anchorCandidate: null,
    }]
  }

  const slots: Slot[] = []

  // Extends slots[slots.length-1] forward from gapStart, absorbing
  // observations up to its 1.5x cap exactly as before — UNLESS, past 1.0x
  // of its own nominal duration, two independent rank-1 observations agree
  // on the same non-anchor title. In that case the current slot is closed
  // at the FIRST such observation, a new slot is anchored on that title
  // starting there, and absorption continues (with the same split check)
  // for the new slot. Loops to handle chained splits within one gap.
  // Returns the index of the first observation not absorbed by any slot.
  function extendWithSplitDetection(gapStart: number, gapLimitIdx: number): number {
    let cursor = gapStart
    while (cursor < gapLimitIdx) {
      const prevSlot = slots[slots.length - 1]
      if (!prevSlot || !prevSlot.anchorCandidate) return cursor

      const startMs = new Date(prevSlot.startTs).getTime()
      // fullCapMs reproduces the original (pre-fix) 1.5x cap exactly, in
      // both the known-duration and flat-default cases. nominalCapMs is
      // derived as fullCapMs / 1.5 so the two stay proportionally
      // consistent even when the anchor candidate carries no ACR duration
      // (performance_songs.duration_seconds is never populated in this
      // schema, so a known duration is only ever available from ACR).
      const fullCapMs = prevSlot.anchorCandidate.durationMs !== null
        ? prevSlot.anchorCandidate.durationMs * CFG.DURATION_PRIOR_MULTIPLIER
        : CFG.DEFAULT_SLOT_MAX_SECONDS * 1000
      const nominalCapMs = fullCapMs / CFG.DURATION_PRIOR_MULTIPLIER
      const nominalCapTs = startMs + nominalCapMs
      const fullCapTs = startMs + fullCapMs

      const firstSeenPastNominal = new Map<string, number>() // normalized title -> index of first rank-1 sighting
      let splitIdx = -1
      let scanEnd = cursor

      let k = cursor
      while (k < gapLimitIdx) {
        const ts = new Date(inBounds[k].timestamp).getTime()
        if (ts > fullCapTs) break
        if (ts > nominalCapTs) {
          const topKey = topCandidateKey(inBounds[k])
          if (topKey && topKey !== prevSlot.anchorTitle) {
            const firstIdx = firstSeenPastNominal.get(topKey)
            if (firstIdx !== undefined) { splitIdx = firstIdx; break }
            firstSeenPastNominal.set(topKey, k)
          }
        }
        scanEnd = k + 1
        k++
      }

      if (splitIdx === -1) {
        if (scanEnd > cursor) {
          prevSlot.observations.push(...inBounds.slice(cursor, scanEnd))
          prevSlot.endTs = inBounds[scanEnd - 1].timestamp
        }
        return scanEnd
      }

      if (splitIdx > cursor) {
        prevSlot.observations.push(...inBounds.slice(cursor, splitIdx))
        prevSlot.endTs = inBounds[splitIdx - 1].timestamp
      }
      const splitObs = inBounds[splitIdx]
      const splitCandidate = splitObs.candidates[0] || null
      slots.push({
        index: slots.length,
        startTs: splitObs.timestamp,
        endTs: splitObs.timestamp,
        observations: [splitObs],
        anchorTitle: topCandidateKey(splitObs),
        anchorArtist: splitCandidate?.artist || null,
        anchorCandidate: splitCandidate,
      })
      cursor = splitIdx + 1
      // loop continues, now extending the newly-pushed split slot
    }
    return cursor
  }

  let cursor = 0
  for (const run of runs) {
    const gapStart = extendWithSplitDetection(cursor, run.startIdx)
    if (gapStart < run.startIdx) {
      slots.push({
        index: slots.length,
        startTs: inBounds[gapStart].timestamp,
        endTs: inBounds[run.startIdx - 1].timestamp,
        observations: inBounds.slice(gapStart, run.startIdx),
        anchorTitle: null, anchorArtist: null, anchorCandidate: null,
      })
    }

    const anchorObs = inBounds.slice(run.startIdx, run.endIdx + 1)
    const anchorCandidate = anchorObs[0].candidates[0] || null
    slots.push({
      index: slots.length,
      startTs: anchorObs[0].timestamp,
      endTs: anchorObs[anchorObs.length - 1].timestamp,
      observations: anchorObs,
      anchorTitle: run.title,
      anchorArtist: anchorCandidate?.artist || null,
      anchorCandidate,
    })

    cursor = run.endIdx + 1
  }

  if (cursor < inBounds.length) {
    const remainderStart = extendWithSplitDetection(cursor, inBounds.length)
    if (remainderStart < inBounds.length) {
      slots.push({
        index: slots.length,
        startTs: inBounds[remainderStart].timestamp,
        endTs: inBounds[inBounds.length - 1].timestamp,
        observations: inBounds.slice(remainderStart),
        anchorTitle: null, anchorArtist: null, anchorCandidate: null,
      })
    }
  }

  return slots
}

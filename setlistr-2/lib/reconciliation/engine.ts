// Orchestrates CLUSTER -> RESOLVE -> CONCLUDE for one performance.

import { normalizeSongKey } from './normalize'
import { buildObservationTimeline } from './evidence'
import { clusterObservations } from './cluster'
import { resolveSlot, type Priors, type Resolution } from './resolve'
import { concludeSlot } from './conclude'
import {
  fetchPerformance, fetchPlannedSetlistSongs, fetchArtistCatalogueTitles,
  fetchPriorConfirmedSetlistCounts,
} from './db'
import type { Conclusion, PerformanceRow, Slot } from './types'

export async function buildPriors(performance: PerformanceRow): Promise<Priors> {
  const [plannedSongs, catalogueTitles, priorConfirmedCounts] = await Promise.all([
    fetchPlannedSetlistSongs(performance.id),
    fetchArtistCatalogueTitles(performance.user_id),
    fetchPriorConfirmedSetlistCounts(performance.user_id, performance.id),
  ])

  const plannedTitles = new Set<string>()
  const plannedOrder = new Map<string, number>()
  for (const s of plannedSongs) {
    const key = normalizeSongKey(s.title || '')
    if (!key) continue
    plannedTitles.add(key)
    if (!plannedOrder.has(key)) plannedOrder.set(key, s.position)
  }

  return { plannedTitles, plannedOrder, catalogueTitles, priorConfirmedCounts }
}

export interface EngineRunResult {
  performance: PerformanceRow
  slots: Slot[]
  conclusions: Conclusion[]
  // Parallel to conclusions (same index = same slot). Carries each slot's
  // full RESOLVE output, including losing-group score breakdowns — engine-
  // internal detail, not persisted to reconciliation_conclusions, kept here
  // so the harness's scoring step can distinguish "evidence existed but
  // lost slot resolution" from "no evidence existed anywhere."
  resolutions: Resolution[]
}

export async function runEngine(performanceId: string): Promise<EngineRunResult> {
  const performance = await fetchPerformance(performanceId)
  const [observations, priors] = await Promise.all([
    buildObservationTimeline(performance),
    buildPriors(performance),
  ])
  const slots = clusterObservations(performance, observations)

  const plannedByPosition = Array.from(priors.plannedOrder.entries()).sort((a, b) => a[1] - b[1])
  const claimedPlanned = new Set<string>()
  function nextExpectedPlannedTitle(): string | null {
    for (const [key] of plannedByPosition) if (!claimedPlanned.has(key)) return key
    return null
  }

  const conclusions: Conclusion[] = []
  const resolutions: Resolution[] = []
  for (const slot of slots) {
    const expected = nextExpectedPlannedTitle()
    const resolution = resolveSlot(slot, priors, expected)
    const conclusion = concludeSlot(slot, resolution)
    conclusions.push(conclusion)
    resolutions.push(resolution)

    if (conclusion.title && (conclusion.tier === 'CONFIRMED' || conclusion.tier === 'LIKELY')) {
      const key = normalizeSongKey(conclusion.title)
      if (priors.plannedTitles.has(key)) claimedPlanned.add(key)
    }
  }

  return { performance, slots, conclusions, resolutions }
}

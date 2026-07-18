// Reconciliation engine harness — CLI only, not wired to any route or UI.
//
// Usage:
//   npm run reconcile -- --performance <id> [--truth-file path.json] [--label "SMOKE TEST"] [--mode baseline|engine|both] [--dry-run]
//   npm run reconcile -- --golden-set [--mode baseline|engine|both] [--dry-run]
//
// mode=baseline scores only what live detection alone produced (top-result
// matches only) — no CLUSTER/RESOLVE/CONCLUDE runs at all. mode=engine runs
// only the engine. mode=both (default) runs and reports both.

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { runBaseline } from '../lib/reconciliation/baseline'
import { runEngine } from '../lib/reconciliation/engine'
import { loadTruth } from '../lib/reconciliation/truth'
import { scorePredictions, scoreConclusions } from '../lib/reconciliation/score'
import { RECONCILIATION_CONFIG } from '../lib/reconciliation/config'
import {
  insertReconciliationRun, completeReconciliationRun, insertReconciliationConclusions,
} from '../lib/reconciliation/db'
import { GOLDEN_SET } from '../lib/reconciliation/goldenSet'

type Mode = 'baseline' | 'engine' | 'both'

interface Args {
  performanceIds: string[]
  truthFile?: string
  label?: string
  mode: Mode
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { performanceIds: [], mode: 'both', dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--performance') args.performanceIds.push(argv[++i])
    else if (a === '--truth-file') args.truthFile = argv[++i]
    else if (a === '--label') args.label = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--mode') {
      const m = argv[++i]
      if (m !== 'baseline' && m !== 'engine' && m !== 'both') throw new Error(`--mode must be baseline|engine|both, got "${m}"`)
      args.mode = m
    }
    else if (a === '--golden-set') args.performanceIds.push(...GOLDEN_SET.map(g => g.id))
    else throw new Error(`unrecognized argument: ${a}\n\nUsage: --performance <id> [--truth-file path.json] [--label "..."] [--mode baseline|engine|both] [--dry-run] | --golden-set [--mode ...] [--dry-run]`)
  }
  if (args.performanceIds.length === 0) {
    throw new Error('pass at least one --performance <id>, or --golden-set to run the full benchmark set')
  }
  return args
}

function fmtScore(headline: string, p: number, r: number, f1: number): string {
  return `${headline}  P=${p.toFixed(2)} R=${r.toFixed(2)} F1=${f1.toFixed(2)}`
}

async function runOne(performanceId: string, args: Args): Promise<void> {
  const goldenEntry = GOLDEN_SET.find(g => g.id === performanceId)
  const label = args.label || goldenEntry?.label || 'run'

  console.log(`\n${'='.repeat(72)}`)
  console.log(`Performance ${performanceId}${goldenEntry ? ` — ${goldenEntry.venue}, ${goldenEntry.date}` : ''}`)
  console.log(`label: ${label}  mode: ${args.mode}`)
  console.log('='.repeat(72))

  const { truth, source: truthSource } = await loadTruth(performanceId, args.truthFile)
  console.log(`truth: ${truth.length} songs (source: ${truthSource})`)

  const runBaselinePhase = args.mode === 'baseline' || args.mode === 'both'
  const runEnginePhase = args.mode === 'engine' || args.mode === 'both'

  let baselineScore: ReturnType<typeof scorePredictions> | null = null
  if (runBaselinePhase) {
    const baselinePredictions = await runBaseline(performanceId)
    baselineScore = scorePredictions(baselinePredictions.map(p => p.title), truth)
    console.log(`\nBASELINE (live detection, top-result only): ${fmtScore(baselineScore.headline, baselineScore.precision, baselineScore.recall, baselineScore.f1)}`)
    if (baselineScore.missed.length) console.log(`  missed: ${baselineScore.missed.join(', ')}`)
    if (baselineScore.extra.length) console.log(`  false positives: ${baselineScore.extra.join(', ')}`)
  }

  let conclusions: Awaited<ReturnType<typeof runEngine>>['conclusions'] = []
  let engineConfirmedScore: ReturnType<typeof scoreConclusions> | null = null
  let engineConfirmedLikelyScore: ReturnType<typeof scoreConclusions> | null = null
  let tierCounts: Record<string, number> = {}

  if (runEnginePhase) {
    const result = await runEngine(performanceId)
    conclusions = result.conclusions
    engineConfirmedScore = scoreConclusions(conclusions, truth, ['CONFIRMED'], result.resolutions)
    engineConfirmedLikelyScore = scoreConclusions(conclusions, truth, ['CONFIRMED', 'LIKELY'], result.resolutions)
    tierCounts = conclusions.reduce((acc: Record<string, number>, c) => {
      acc[c.tier] = (acc[c.tier] || 0) + 1
      return acc
    }, {})

    console.log(`\nENGINE (CONFIRMED only):    ${fmtScore(engineConfirmedScore.headline, engineConfirmedScore.precision, engineConfirmedScore.recall, engineConfirmedScore.f1)}`)
    console.log(`ENGINE (CONFIRMED+LIKELY):  ${fmtScore(engineConfirmedLikelyScore.headline, engineConfirmedLikelyScore.precision, engineConfirmedLikelyScore.recall, engineConfirmedLikelyScore.f1)}`)
    console.log(`slots: ${conclusions.length}  (CONFIRMED=${tierCounts.CONFIRMED || 0} LIKELY=${tierCounts.LIKELY || 0} UNKNOWN=${tierCounts.UNKNOWN || 0})`)
    for (const m of engineConfirmedLikelyScore.missedDetail) {
      if (m.reason === 'suppressed') {
        console.log(`  missed (suppressed): "${m.normalizedTitle}" — engine concluded it at ${m.bestConclusionTier} score=${m.bestConclusionScore?.toFixed(3)}, below the C+L cutoff`)
      } else if (m.reason === 'out_competed_in_slot') {
        console.log(`  missed (out-competed): "${m.normalizedTitle}" — lost slot ${m.bestLosingSlotIndex} to "${m.bestLosingWinnerTitle}" (its own score=${m.bestLosingBreakdown?.finalScore.toFixed(3)}, suppressionMultiplier=${m.bestLosingBreakdown?.suppressionMultiplier})`)
      } else {
        console.log(`  missed (no evidence): "${m.normalizedTitle}" — never appeared as a candidate in any observation`)
      }
    }
    if (engineConfirmedLikelyScore.extra.length) console.log(`  false positives: ${engineConfirmedLikelyScore.extra.join(', ')}`)
  }

  if (args.dryRun) {
    console.log('(--dry-run: not persisting to reconciliation_runs/reconciliation_conclusions)')
    return
  }

  if (baselineScore) {
    const baselineRunId = await insertReconciliationRun({
      performance_id: performanceId, mode: 'baseline', engine_version: RECONCILIATION_CONFIG.ENGINE_VERSION,
      params: { label, truth_source: truthSource },
    })
    await completeReconciliationRun(baselineRunId, baselineScore as any)
    console.log(`persisted: baseline run ${baselineRunId}`)
  }

  if (engineConfirmedScore && engineConfirmedLikelyScore) {
    const engineRunId = await insertReconciliationRun({
      performance_id: performanceId, mode: 'engine', engine_version: RECONCILIATION_CONFIG.ENGINE_VERSION,
      params: { label, truth_source: truthSource, config: RECONCILIATION_CONFIG },
    })
    await insertReconciliationConclusions(engineRunId, conclusions)
    await completeReconciliationRun(engineRunId, {
      confirmed_only: engineConfirmedScore,
      confirmed_plus_likely: engineConfirmedLikelyScore,
      tier_counts: tierCounts,
    } as any)
    console.log(`persisted: engine run ${engineRunId} (${conclusions.length} conclusions)`)
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  let failures = 0
  for (const id of args.performanceIds) {
    try {
      await runOne(id, args)
    } catch (err: any) {
      failures++
      console.error(`\n[FAILED] performance ${id}: ${err.message}`)
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} of ${args.performanceIds.length} performance(s) failed.`)
    process.exitCode = 1
  }
}

main().catch(err => { console.error(err); process.exitCode = 1 })

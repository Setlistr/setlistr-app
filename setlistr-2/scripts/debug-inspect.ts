// Temporary diagnostic — dumps full slot/observation/resolution detail for
// one performance. Not part of the harness; kept per instruction pending
// Step 3 (suppression sweep), delete after Phase 1 diagnostics are done.
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { runEngine } from '../lib/reconciliation/engine'

async function main() {
  const performanceId = process.argv[2]
  const targetSlotIndex = process.argv[3] ? parseInt(process.argv[3], 10) : null
  const { slots, resolutions, conclusions } = await runEngine(performanceId)
  slots.forEach((s, idx) => {
    if (targetSlotIndex !== null && s.index !== targetSlotIndex) return
    console.log(`\n--- slot ${s.index} [${s.startTs} .. ${s.endTs}] anchor=${s.anchorTitle} anchorDurationMs=${s.anchorCandidate?.durationMs} ---`)
    for (const obs of s.observations) {
      console.log(`  obs ${obs.timestamp} tier=${obs.tier} autoConfirmed=${obs.autoConfirmed}`)
      for (const c of obs.candidates) {
        console.log(`    rank${c.rank} "${c.title}" (${c.normalizedTitle}) artist="${c.artist}" score=${c.score} durationMs=${c.durationMs}`)
      }
    }

    const conclusion = conclusions[idx]
    const resolution = resolutions[idx]
    console.log(`  => WINNER: "${conclusion.title}" tier=${conclusion.tier} score=${conclusion.score}`)
    for (const p of conclusion.evidence.priors_applied) {
      console.log(`       prior: ${p.name} weight=${p.weight} (${p.detail})`)
    }
    if (resolution.losingGroups.length > 0) {
      console.log(`  losing groups (${resolution.losingGroups.length}):`)
      for (const g of resolution.losingGroups.sort((a, b) => b.finalScore - a.finalScore)) {
        console.log(`    - "${g.title}" (${g.normalizedTitle}) finalScore=${g.finalScore.toFixed(4)} bestScore=${g.bestScore.toFixed(4)} ` +
          `consistency=${g.consistencyBoost.toFixed(3)} anchor=${g.anchorBoost.toFixed(3)} suppressionMult=${g.suppressionMultiplier} ` +
          `supportingObs=${g.supportingObservations}`)
        for (const p of g.priorsApplied) {
          console.log(`         prior: ${p.name} weight=${p.weight} (${p.detail})`)
        }
      }
    }
  })
}
main().catch(err => { console.error(err); process.exit(1) })

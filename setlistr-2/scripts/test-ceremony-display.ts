// Focused, DB-free tests for lib/ceremony-display.ts — the count-up math and
// upload-vs-live wording behind app/app/review/[id]/page.tsx's post-save
// "Show complete" screen.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-ceremony-display.ts

import { countAt, capturedLabel } from '../lib/ceremony-display'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// ── countAt ────────────────────────────────────────────────────────────
check('countAt: progress 0 -> 0', countAt(0, 9) === 0, String(countAt(0, 9)))
check('countAt: progress 1 -> exactly target', countAt(1, 9) === 9, String(countAt(1, 9)))
check('countAt: progress > 1 clamps to target', countAt(1.5, 9) === 9, String(countAt(1.5, 9)))
check('countAt: progress < 0 clamps to 0', countAt(-0.2, 9) === 0, String(countAt(-0.2, 9)))
check('countAt: target 0 -> always 0', countAt(0.5, 0) === 0, String(countAt(0.5, 0)))

// The specific property under test: for the disproportionately-long final
// stretch of the eased curve, the displayed integer must reach `target`
// (not linger at target - 1) well before progress actually hits 1 — this
// is what floor() got wrong (see lib/ceremony-display.ts's doc comment).
// eased(progress) = 1 - (1-progress)^3; solve for eased == 1 - 0.5/target
// (the round() crossover point) at progress = 1 - (0.5/target)^(1/3).
{
  const target = 9
  const crossover = 1 - Math.pow(0.5 / target, 1 / 3)
  const justBefore = countAt(crossover - 0.01, target)
  const justAfter = countAt(crossover + 0.01, target)
  check('countAt: crosses to target strictly before progress=1 (rounding, not flooring)', justAfter === target, `justAfter=${justAfter} at progress=${(crossover + 0.01).toFixed(3)}`)
  check('countAt: is target-1 immediately before the crossover (sanity — the curve is genuinely being exercised)', justBefore === target - 1, `justBefore=${justBefore}`)
}

// Floor would have shown target-1 for roughly the final ~15-20% of the
// animation at progress=0.9; round must have already reached target by then
// for any target in the small range these ceremony counts actually use.
for (const target of [1, 3, 5, 8, 9, 12]) {
  check(`countAt: target=${target} has reached the true value by progress=0.9`, countAt(0.9, target) === target, `got ${countAt(0.9, target)}`)
}

// ── capturedLabel ──────────────────────────────────────────────────────
check("capturedLabel('live') -> 'Captured live'", capturedLabel('live') === 'Captured live')
check("capturedLabel('upload') -> upload-specific wording, never 'Captured live'", capturedLabel('upload') === 'From your recording' && capturedLabel('upload') !== 'Captured live')
check("capturedLabel(null) -> neutral fallback, asserts neither method", capturedLabel(null) !== 'Captured live' && capturedLabel(null) !== 'From your recording')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

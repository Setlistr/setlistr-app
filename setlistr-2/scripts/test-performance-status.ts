// Focused, DB-free tests for lib/performance-status.ts — the canonical
// show-lifecycle predicates shared by app/app/dashboard, app/app/history
// ("Your Record"), and app/app/file (Filing Queue). Pure functions, no
// network/DB required.
//
// These exist because the three screens previously disagreed on basic
// counts of the exact same underlying shows:
//   - dashboard's headline "shows on record" count used its own status
//     whitelist (missing an in-flight status history implicitly included,
//     plus a dead 'submitted' entry that can never match a `status`
//     value) and never excluded placeholder-venue rows the way history
//     did — so a garbage row could inflate the dashboard's total but not
//     history's.
//   - history's own "ready to submit" banner counted 'review' (not yet
//     reviewed) shows alongside genuinely complete ones, while the
//     "Ready to Claim" tab right next to it counted only the latter.
// Every screen now imports these same predicates instead of re-deriving
// its own — this file is what proves the predicates themselves are
// correct, so a shared bug can't hide behind "the test only checked one
// caller."
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-performance-status.ts

import { isRealVenue, isCompleteStage, isSubmitted, isCapturedShow, type PerformanceLifecycleFields } from '../lib/performance-status'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// ── isRealVenue ────────────────────────────────────────────────────────
check('isRealVenue: null -> false', isRealVenue(null) === false)
check('isRealVenue: undefined -> false', isRealVenue(undefined) === false)
check('isRealVenue: empty string -> false', isRealVenue('') === false)
check('isRealVenue: whitespace-only -> false', isRealVenue('   ') === false)
check('isRealVenue: "." -> false (placeholder)', isRealVenue('.') === false)
check('isRealVenue: ".." -> false (placeholder)', isRealVenue('..') === false)
check('isRealVenue: real name -> true', isRealVenue('The Fillmore') === true)
check('isRealVenue: real name with surrounding whitespace -> true', isRealVenue('  The Fillmore  ') === true)

// ── isCompleteStage ────────────────────────────────────────────────────
check('isCompleteStage: complete -> true', isCompleteStage({ status: 'complete' }) === true)
check('isCompleteStage: completed -> true', isCompleteStage({ status: 'completed' }) === true)
check('isCompleteStage: exported -> true', isCompleteStage({ status: 'exported' }) === true)
check('isCompleteStage: review -> false (not yet reviewed)', isCompleteStage({ status: 'review' }) === false)
check('isCompleteStage: processing -> false', isCompleteStage({ status: 'processing' }) === false)
check('isCompleteStage: draft -> false', isCompleteStage({ status: 'draft' }) === false)
check('isCompleteStage: live -> false', isCompleteStage({ status: 'live' }) === false)
check('isCompleteStage: null -> false', isCompleteStage({ status: null }) === false)

// ── isSubmitted ────────────────────────────────────────────────────────
check('isSubmitted: "submitted" -> true', isSubmitted({ submission_status: 'submitted' }) === true)
check('isSubmitted: null -> false', isSubmitted({ submission_status: null }) === false)
check('isSubmitted: undefined -> false', isSubmitted({ submission_status: undefined }) === false)
check('isSubmitted: "complete" (a status value, not submission_status) -> false', isSubmitted({ submission_status: 'complete' }) === false)

// ── isCapturedShow ─────────────────────────────────────────────────────
const REAL: PerformanceLifecycleFields = { status: 'complete', submission_status: null, data_source: 'captured', venue_name: 'The Fillmore' }

check('isCapturedShow: real complete show -> true', isCapturedShow(REAL) === true)
check('isCapturedShow: real review-stage show -> true (captured, just not complete)', isCapturedShow({ ...REAL, status: 'review' }) === true)
check('isCapturedShow: real processing-stage show -> true (captured != complete)', isCapturedShow({ ...REAL, status: 'processing' }) === true)
check('isCapturedShow: draft -> false', isCapturedShow({ ...REAL, status: 'draft' }) === false)
check('isCapturedShow: live -> false', isCapturedShow({ ...REAL, status: 'live' }) === false)
check('isCapturedShow: pending -> false', isCapturedShow({ ...REAL, status: 'pending' }) === false)
check('isCapturedShow: imported history -> false', isCapturedShow({ ...REAL, data_source: 'setlistfm_imported' }) === false)
check('isCapturedShow: blank venue_name (placeholder/draft-in-transit) -> false', isCapturedShow({ ...REAL, venue_name: '' }) === false)
check('isCapturedShow: "." venue_name -> false', isCapturedShow({ ...REAL, venue_name: '.' }) === false)
check('isCapturedShow: null status -> false', isCapturedShow({ ...REAL, status: null }) === false)
check('isCapturedShow: submitted show still counts (submission is orthogonal to capture) -> true', isCapturedShow({ ...REAL, submission_status: 'submitted' }) === true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

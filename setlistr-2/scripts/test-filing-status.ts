// Focused, DB-free tests for lib/filing-status.ts — the state calculation
// and navigation decision behind app/app/file/page.tsx's Filing Queue.
// Pure functions, no network/DB required; imports the ACTUAL production
// functions, not re-typed copies.
//
// Core requirements under test:
//   - A show must not be called "ready" merely because it exists — neither
//     because its PRO/identity/required fields happen to be filled in
//     while the setlist itself hasn't been reviewed yet (the review-stage
//     gate), nor by omission of a required field check.
//   - The owner/delegate identity-privacy boundary from
//     app/app/submit/[id]/page.tsx stays intact.
//   - A PRO field is only ever treated as a blocker when lib/pro-rules.ts
//     actually marks it required FOR THAT PRO — never a hardcoded/assumed
//     universal requirement (e.g. promoter is required for SOCAN/ASCAP but
//     optional for BMI/GMR).
//   - filingActionPath() sends an unfinished show to the review step, not
//     a dead-end Submit page.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-filing-status.ts

import { computeFilingStatus, filingActionPath, type FilingPerformanceFields, type FilingProfileFields } from '../lib/filing-status'
import { PRO_RULES, type ProCode } from '../lib/pro-rules'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const BASE_PERF: FilingPerformanceFields = {
  status: 'complete',
  submission_status: null,
  started_at: '2026-01-15T21:00:00Z',
  city: 'Austin',
  venue_city: null,
  venue_capacity: 500,
}

const COMPLETE_OWNER_PROFILE: FilingProfileFields = {
  pro_affiliation: 'SOCAN', legal_name: 'Jane Doe', ipi_number: '123456789',
}

// ── 1. No PRO selected — never "ready" just because a show exists ────────
{
  const r = computeFilingStatus(BASE_PERF, 5, { pro_affiliation: null }, false, {})
  check('1. no PRO: state is needs_review', r.state === 'needs_review', r.state)
  check('1. no PRO: reason listed', r.missing.includes('No PRO selected'), JSON.stringify(r.missing))
}

// ── 2. No songs — needs_review even with a PRO set ────────────────────────
{
  const r = computeFilingStatus(BASE_PERF, 0, COMPLETE_OWNER_PROFILE, false, { promoter: 'Self' })
  check('2. no songs: state is needs_review', r.state === 'needs_review', r.state)
  check('2. no songs: reason listed', r.missing.includes('no songs added'), JSON.stringify(r.missing))
}

// ── 3. Owner, SOCAN, missing promoter (required for SOCAN) — needs_review ─
{
  const r = computeFilingStatus(BASE_PERF, 5, COMPLETE_OWNER_PROFILE, false, {})
  check('3. owner/SOCAN, no promoter: state is needs_review', r.state === 'needs_review', r.state)
  check('3. owner/SOCAN, no promoter: reason listed', r.missing.includes('promoter'), JSON.stringify(r.missing))
}

// ── 4. Owner, SOCAN, everything present — ready ───────────────────────────
{
  const r = computeFilingStatus(BASE_PERF, 5, COMPLETE_OWNER_PROFILE, false, { promoter: 'Live Nation' })
  check('4. owner/SOCAN complete: state is ready', r.state === 'ready', JSON.stringify(r))
  check('4. owner/SOCAN complete: no missing reasons', r.missing.length === 0, JSON.stringify(r.missing))
  check('4. proName resolved', r.proName === 'SOCAN', String(r.proName))
}

// ── 5. Owner, missing identity fields — needs_review, fields named ───────
{
  const profile: FilingProfileFields = { pro_affiliation: 'SOCAN', legal_name: null, ipi_number: null }
  const r = computeFilingStatus(BASE_PERF, 5, profile, false, { promoter: 'Self' })
  check('5. owner missing identity: state is needs_review', r.state === 'needs_review', r.state)
  check('5. owner missing identity: legal name listed', r.missing.includes('legal name'), JSON.stringify(r.missing))
  check('5. owner missing identity: IPI number listed', r.missing.includes('IPI number'), JSON.stringify(r.missing))
}

// ── 6. Delegate, SAME privacy-redacted profile shape — identity must NOT
//    demote the show, since a delegate can never know if it's really
//    missing (see lib/submission-identity.ts's doc comment). This is the
//    privacy-boundary case the whole feature must not violate. ───────────
{
  const delegateProfile: FilingProfileFields = { pro_affiliation: 'SOCAN', legal_name: null, ipi_number: null }
  const r = computeFilingStatus(BASE_PERF, 5, delegateProfile, true, { promoter: 'Self' })
  check('6. delegate, redacted identity: state is ready (not demoted)', r.state === 'ready', JSON.stringify(r))
  check('6. delegate, redacted identity: no identity fields leaked into missing', !r.missing.includes('legal name') && !r.missing.includes('IPI number'), JSON.stringify(r.missing))
}

// ── 7. Owner vs delegate, otherwise-identical inputs, diverge only on
//    identity — confirms the boundary is the ONLY difference. ────────────
{
  const profile: FilingProfileFields = { pro_affiliation: 'SOCAN', legal_name: null, ipi_number: null }
  const owner = computeFilingStatus(BASE_PERF, 5, profile, false, { promoter: 'Self' })
  const delegate = computeFilingStatus(BASE_PERF, 5, profile, true, { promoter: 'Self' })
  check('7. owner needs_review, delegate ready, same underlying data', owner.state === 'needs_review' && delegate.state === 'ready')
}

// ── 8. Already submitted — 'submitted' wins regardless of completeness ───
{
  const perf: FilingPerformanceFields = { ...BASE_PERF, status: 'review', submission_status: 'submitted' }
  const r = computeFilingStatus(perf, 0, { pro_affiliation: null }, false, {})
  check('8. submitted: state is submitted even with no PRO/songs/review', r.state === 'submitted', r.state)
  check('8. submitted: no missing reasons surfaced', r.missing.length === 0, JSON.stringify(r.missing))
}

// ── 9. BMI requires start_time — derived from started_at when present ────
{
  const profile: FilingProfileFields = { pro_affiliation: 'BMI', legal_name: 'Jane', ipi_number: '1' }
  const withStart = computeFilingStatus(BASE_PERF, 5, profile, false, { ticketPrice: '20' })
  check('9a. BMI, started_at present: start time not flagged', !withStart.missing.includes('start time'), JSON.stringify(withStart.missing))
  const noStart: FilingPerformanceFields = { ...BASE_PERF, started_at: null }
  const withoutStart = computeFilingStatus(noStart, 5, profile, false, { ticketPrice: '20' })
  check('9b. BMI, no started_at and no saved startTime: start time flagged', withoutStart.missing.includes('start time'), JSON.stringify(withoutStart.missing))
  const savedTime = computeFilingStatus(noStart, 5, profile, false, { ticketPrice: '20', startTime: '20:30' })
  check('9c. BMI, no started_at but saved startTime: start time not flagged', !savedTime.missing.includes('start time'), JSON.stringify(savedTime.missing))
}

// ── 10. GMR — promoter is optional there, so an empty promoter must not
//    block readiness (distinguishes "required" from "any missing field"). ─
{
  const profile: FilingProfileFields = { pro_affiliation: 'GMR', legal_name: 'Jane', ipi_number: '1' }
  const r = computeFilingStatus(BASE_PERF, 5, profile, false, { attendance: '150' })
  check('10. GMR, no promoter (optional there): promoter not flagged', !r.missing.includes('promoter'), JSON.stringify(r.missing))
  check('10. GMR otherwise complete: state is ready', r.state === 'ready', JSON.stringify(r))
}

// ── 11. SESAC lists capacity as a claim field, but it's optional in
//    lib/pro-rules.ts (required: false) — confirms only REQUIRED fields
//    block readiness, not merely "the PRO's portal has a box for it." ────
{
  const profile: FilingProfileFields = { pro_affiliation: 'SESAC', legal_name: 'Jane', ipi_number: '1' }
  const noCapacity: FilingPerformanceFields = { ...BASE_PERF, venue_capacity: null }
  const r = computeFilingStatus(noCapacity, 5, profile, false, { ticketPrice: '10', attendance: '80' })
  check('11. SESAC, no venue_capacity (optional field): not flagged, state ready', !r.missing.includes('venue capacity') && r.state === 'ready', JSON.stringify(r))
}

// ── 12. Review-stage gate: a show still in 'review' (or any other
//    pre-complete status) must never read 'ready', even when every PRO
//    field happens to already be filled in — it hasn't been reviewed yet.
//    This is the exact class of bug the dashboard/history count mismatch
//    traced back to: something being "otherwise complete" is not the same
//    as actually being complete. ───────────────────────────────────────
{
  const reviewStage: FilingPerformanceFields = { ...BASE_PERF, status: 'review' }
  const r = computeFilingStatus(reviewStage, 5, COMPLETE_OWNER_PROFILE, false, { promoter: 'Live Nation' })
  check('12a. review-stage, otherwise complete: state is needs_review, not ready', r.state === 'needs_review', JSON.stringify(r))
  check('12a. review-stage: reason listed', r.missing.includes('setlist not yet reviewed'), JSON.stringify(r.missing))

  const processingStage: FilingPerformanceFields = { ...BASE_PERF, status: 'processing' }
  const rp = computeFilingStatus(processingStage, 5, COMPLETE_OWNER_PROFILE, false, { promoter: 'Live Nation' })
  check('12b. processing-stage, otherwise complete: state is needs_review', rp.state === 'needs_review', JSON.stringify(rp))

  const completeStage: FilingPerformanceFields = { ...BASE_PERF, status: 'exported' }
  const re = computeFilingStatus(completeStage, 5, COMPLETE_OWNER_PROFILE, false, { promoter: 'Live Nation' })
  check('12c. exported (complete-family): state is ready', re.state === 'ready', JSON.stringify(re))
}

// ── 13. Promoter requirement traced directly from lib/pro-rules.ts for
//    every PRO — never a hardcoded/assumed universal requirement. All
//    OTHER required fields are supplied so promoter is the only variable
//    under test; the expectation is computed from PRO_RULES itself, not
//    restated by hand, so this can't silently drift from the source of
//    truth it's supposed to verify. ───────────────────────────────────
{
  const generousInputs = { ticketPrice: '20', attendance: '150', startTime: '20:30', city: 'Austin' }
  for (const code of Object.keys(PRO_RULES) as ProCode[]) {
    const expectedRequired = PRO_RULES[code].fields.some(f => f.key === 'promoter' && f.required)
    const profile: FilingProfileFields = { pro_affiliation: code, legal_name: 'Jane', ipi_number: '1' }
    const r = computeFilingStatus(BASE_PERF, 5, profile, false, generousInputs)
    const flagged = r.missing.includes('promoter')
    check(`13. ${code}: promoter required=${expectedRequired}, flagged=${flagged}`, flagged === expectedRequired, JSON.stringify(r.missing))
  }
}

// ── 14. filingActionPath — an unfinished show must route to the review
//    step, never a dead-end Submit page. ─────────────────────────────────
{
  const noSongs = filingActionPath('perf-1', 'complete', 0)
  check('14a. no songs: routes to review', noSongs.href === '/app/review/perf-1', JSON.stringify(noSongs))

  const reviewStage = filingActionPath('perf-2', 'review', 5)
  check('14b. review-stage with songs: still routes to review', reviewStage.href === '/app/review/perf-2', JSON.stringify(reviewStage))

  const processingStage = filingActionPath('perf-3', 'processing', 5)
  check('14c. processing-stage with songs: routes to review', processingStage.href === '/app/review/perf-3', JSON.stringify(processingStage))

  const readyToFile = filingActionPath('perf-4', 'complete', 5)
  check('14d. complete stage with songs: routes to submit', readyToFile.href === '/app/submit/perf-4', JSON.stringify(readyToFile))

  const exportedReady = filingActionPath('perf-5', 'exported', 3)
  check('14e. exported stage with songs: routes to submit', exportedReady.href === '/app/submit/perf-5', JSON.stringify(exportedReady))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

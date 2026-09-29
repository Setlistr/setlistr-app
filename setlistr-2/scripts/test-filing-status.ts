// Focused, DB-free tests for lib/filing-status.ts's computeFilingStatus() —
// the state calculation behind app/app/file/page.tsx's filing queue. Pure
// function, no network/DB required; imports the ACTUAL production function,
// not a re-typed copy.
//
// Core requirement under test: a show must not be called "ready" merely
// because it exists — computeFilingStatus must only return 'ready' once
// every field the show's actual PRO rule requires is genuinely present,
// and must keep the owner/delegate identity-privacy boundary from
// app/app/submit/[id]/page.tsx intact (a delegate's redacted profile must
// never be misread as "the artist is missing this").
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-filing-status.ts

import { computeFilingStatus, type FilingPerformanceFields, type FilingProfileFields } from '../lib/filing-status'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const BASE_PERF: FilingPerformanceFields = {
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

// ── 3. Owner, SOCAN, missing promoter (required) — needs_review ──────────
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
  const perf: FilingPerformanceFields = { ...BASE_PERF, submission_status: 'submitted' }
  const r = computeFilingStatus(perf, 0, { pro_affiliation: null }, false, {})
  check('8. submitted: state is submitted even with no PRO/songs', r.state === 'submitted', r.state)
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

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

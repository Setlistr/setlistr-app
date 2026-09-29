// Focused, DB-free tests for lib/submissions-nav-counts.ts's countsFromRows()
// — the filtering behind the Filing Queue / Full History switcher shown at
// the top of both app/app/file and app/app/history. Each count must match
// that page's OWN real definition, not a re-approximation of it.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-submissions-nav-counts.ts

import { countsFromRows, type MinimalPerf } from '../lib/submissions-nav-counts'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function perf(over: Partial<MinimalPerf>): MinimalPerf {
  return { venue_name: 'The Fillmore', status: 'complete', submission_status: null, data_source: 'captured', ...over }
}

// ── 1. Empty set ───────────────────────────────────────────────────────
{
  const r = countsFromRows([])
  check('1. empty rows: both counts 0', r.filingQueueCount === 0 && r.fullHistoryCount === 0, JSON.stringify(r))
}

// ── 2. A normal unfiled, captured show counts in BOTH ─────────────────
{
  const r = countsFromRows([perf({})])
  check('2. captured, not submitted: counts in Filing Queue', r.filingQueueCount === 1, String(r.filingQueueCount))
  check('2. captured, not submitted: counts in Full History', r.fullHistoryCount === 1, String(r.fullHistoryCount))
}

// ── 3. Submitted show: counts in Full History, NOT Filing Queue ───────
{
  const r = countsFromRows([perf({ submission_status: 'submitted' })])
  check('3. submitted: excluded from Filing Queue', r.filingQueueCount === 0, String(r.filingQueueCount))
  check('3. submitted: still counted in Full History', r.fullHistoryCount === 1, String(r.fullHistoryCount))
}

// ── 4. Live/pending/draft: excluded from BOTH ──────────────────────────
for (const status of ['live', 'pending', 'draft']) {
  const r = countsFromRows([perf({ status })])
  check(`4. status=${status}: excluded from Filing Queue`, r.filingQueueCount === 0, String(r.filingQueueCount))
  check(`4. status=${status}: excluded from Full History`, r.fullHistoryCount === 0, String(r.fullHistoryCount))
}

// ── 5. review/processing (pre-complete, but captured): counts in both —
//    Filing Queue's OWN "needs review" state still means the show belongs
//    on the queue, just not marked ready. ──────────────────────────────
for (const status of ['review', 'processing']) {
  const r = countsFromRows([perf({ status })])
  check(`5. status=${status}: still counted in Filing Queue (unfinished, not absent)`, r.filingQueueCount === 1, String(r.filingQueueCount))
  check(`5. status=${status}: still counted in Full History`, r.fullHistoryCount === 1, String(r.fullHistoryCount))
}

// ── 6. Imported show: excluded from Filing Queue, but Full History
//    deliberately still counts it — "Your Record" is the broader view,
//    unlike every other captured-shows definition in this codebase. ────
{
  const r = countsFromRows([perf({ data_source: 'setlistfm_imported' })])
  check('6. imported: excluded from Filing Queue', r.filingQueueCount === 0, String(r.filingQueueCount))
  check('6. imported: still counted in Full History (deliberately broader)', r.fullHistoryCount === 1, String(r.fullHistoryCount))
}

// ── 7. Placeholder venue_name: excluded from both ──────────────────────
for (const venue_name of ['', '.', '  ']) {
  const r = countsFromRows([perf({ venue_name })])
  check(`7. placeholder venue_name=${JSON.stringify(venue_name)}: excluded from Full History`, r.fullHistoryCount === 0, String(r.fullHistoryCount))
}

// ── 8. Mixed set adds up correctly ─────────────────────────────────────
{
  const rows: MinimalPerf[] = [
    perf({}),                                          // captured, unfiled -> both
    perf({ submission_status: 'submitted' }),          // -> history only
    perf({ status: 'draft' }),                          // -> neither
    perf({ data_source: 'setlistfm_imported' }),        // -> history only
    perf({ status: 'review' }),                         // -> both
  ]
  const r = countsFromRows(rows)
  check('8. mixed set: Filing Queue count', r.filingQueueCount === 2, String(r.filingQueueCount))
  check('8. mixed set: Full History count', r.fullHistoryCount === 4, String(r.fullHistoryCount))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

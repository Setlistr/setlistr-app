// Focused, DB-free tests for lib/filing-deadline-label.ts — the compact
// deadline summary shown on Filing Queue rows. Pure function built on
// lib/pro-rules.ts's own deadline()/daysUntil()/urgencyFor(), untouched by
// this — this only reformats their output for a row instead of a banner.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-filing-deadline-label.ts

import { filingDeadlineLabel } from '../lib/filing-deadline-label'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// ── 1. No PRO — never invents a deadline ──────────────────────────────
{
  const r = filingDeadlineLabel(null, new Date())
  check('1. no PRO: returns null', r === null, JSON.stringify(r))
}
{
  const r = filingDeadlineLabel('NOT_A_REAL_PRO', new Date())
  check('1b. unknown PRO code: returns null', r === null, JSON.stringify(r))
}

// ── 2. SOCAN — 12-month unverified window, comfortably open ───────────
{
  const showDate = new Date() // today — deadline is ~365 days out
  const r = filingDeadlineLabel('SOCAN', showDate)
  check('2. SOCAN, recent show: returns a label', r !== null && r.label.includes('day'), JSON.stringify(r))
  check('2. SOCAN, recent show: open urgency color (not red/amber)', r?.color === '#8a7a68', JSON.stringify(r))
}

// ── 3. A show far enough in the past that the window has closed ───────
{
  const oldShow = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) // ~400 days ago
  const r = filingDeadlineLabel('SOCAN', oldShow)
  check('3. expired window: label says closed', r !== null && r.label.startsWith('Window closed'), JSON.stringify(r))
  check('3. expired window: red urgency color', r?.color === '#f87171', JSON.stringify(r))
}

// ── 4. ASCAP — official quarter-based deadline, computed not guessed ──
{
  const showDate = new Date(2026, 0, 15) // Jan 15, 2026 -> ASCAP deadline end of Q2 2026 (Jun 30)
  const r = filingDeadlineLabel('ASCAP', showDate)
  check('4. ASCAP: label present', r !== null, JSON.stringify(r))
  check('4. ASCAP: date component matches the real rule (Jun 30, 2026)', r !== null && r.label.includes('Jun 30, 2026'), JSON.stringify(r))
}

// ── 5. Every real PRO code produces SOME result (never throws) ────────
for (const code of ['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR']) {
  let threw = false
  let r: ReturnType<typeof filingDeadlineLabel> = null
  try { r = filingDeadlineLabel(code, new Date()) } catch { threw = true }
  check(`5. ${code}: does not throw and returns a label`, !threw && r !== null && r.label.length > 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

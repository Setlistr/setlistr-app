// Regression guard for this pass's mobile-layout fixes. No browser or
// screenshot tool was available in this session to visually verify iPhone
// rendering directly — this instead asserts, by reading the actual source
// files, that the specific fix for each reported symptom is still present.
// It cannot prove the layout LOOKS right; it can prove the exact mechanism
// identified as the cause hasn't silently regressed. Real visual
// confirmation at narrow/standard iPhone widths, with the keyboard open,
// is still owed against the deployed preview.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-mobile-layout-invariants.ts

import * as fs from 'fs'
import * as path from 'path'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
}

// ── AppShell: bottom-nav clearance is safe-area-aware, not a flat number ──
{
  const src = read('components/layout/AppShell.tsx')
  check('AppShell: main paddingBottom includes env(safe-area-inset-bottom)', /paddingBottom:\s*['"`].*env\(safe-area-inset-bottom\)/.test(src), 'flat padding would under-clear the nav on notched iPhones')
  check('AppShell: Submissions tab points at the Filing Queue', /href:\s*'\/app\/file'.*label:\s*'Submissions'/.test(src) || /label:\s*'Submissions'/.test(src) && src.includes("href: '/app/file'"))
  check('AppShell: needsReviewCount query uses the real status value', src.includes(".eq('status', 'review')"), "'needs_review' never occurs as a real status")
  check('AppShell: the query itself no longer filters on the wrong status string (a mention in the explanatory comment is fine)', !src.includes(".eq('status', 'needs_review')"))
}

// ── Upload Performance: date/time native-widget overflow containment ─────
{
  const src = read('app/app/upload/new/page.tsx')
  // lastIndexOf, not indexOf — both inputs are preceded by an explanatory
  // comment that itself contains the literal string `<input type="...">`,
  // which indexOf would match first.
  const dateIdx = src.lastIndexOf('type="date"')
  const dateBlock = src.slice(dateIdx - 400, dateIdx + 200)
  check('Upload form: date input sits inside an overflow:hidden wrapper', /overflow:\s*'hidden'/.test(dateBlock))
  const timeIdx = src.lastIndexOf('type="time"')
  const timeBlock = src.slice(timeIdx - 400, timeIdx + 200)
  check('Upload form: custom time input sits inside an overflow:hidden wrapper', /overflow:\s*'hidden'/.test(timeBlock))
  check('Upload form: recent-venue chips no longer wrap to multiple lines', src.includes("flexWrap: 'nowrap' as const, paddingBottom: 2"))
  check('Upload form: recent-venue chips cap their own width (long names truncate individually)', src.includes('maxWidth: 140'))
}

// ── Your Record: row layout and filter-chip trailing space ───────────────
{
  const src = read('app/app/history/page.tsx')
  check('Your Record: status-tab row has trailing padding past the last chip', /overflowX:\s*'auto' as const,\s*paddingRight:\s*16/.test(src))
  check('Your Record: row is a two-line column layout, not one cramped horizontal line', src.includes("flexDirection: 'column', gap: 6, fontFamily: 'inherit', flex: 1"))
  check('Your Record: delete control is visually quiet at rest (no border/background until armed)', src.includes("border: isPendingDel ? '1px solid rgba(220,38,38,0.35)' : 'none'"))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

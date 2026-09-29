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
  check('AppShell: Submissions tab activePaths cover both /app/file and /app/history', src.includes("activePaths: ['/app/file', '/app/history']"), 'the tab must stay lit on both, not just the one it navigates to')
  check('AppShell: isActive is computed from activePaths, not a single href', src.includes('tab.activePaths.some('))
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

// ── Your Record: filter-chip trailing space, delete control unchanged ────
{
  const src = read('app/app/history/page.tsx')
  check('Your Record: status-tab row has trailing padding past the last chip', /overflowX:\s*'auto' as const,\s*paddingRight:\s*16/.test(src))
  check('Your Record: delete control is visually quiet at rest (no border/background until armed)', src.includes("border: isPendingDel ? '1px solid rgba(220,38,38,0.35)' : 'none'"))
}

// ── Submissions switcher: wired into both pages, dashboard duplicate gone ─
{
  const filePage = read('app/app/file/page.tsx')
  check('Filing Queue: renders the shared switcher with active="file"', filePage.includes('<SubmissionsSwitcher active="file"'))
  check('Filing Queue: no leftover standalone "Full History →" link', !filePage.includes('Full History →'))

  const historyPage = read('app/app/history/page.tsx')
  check('Your Record: renders the shared switcher with active="history"', historyPage.includes('<SubmissionsSwitcher active="history"'))

  const dashboard = read('app/app/dashboard/page.tsx')
  check('Dashboard: dedicated Filing Queue nav button removed', !dashboard.includes("router.push('/app/file')") || !dashboard.includes('Filing queue</span>'))
  check('Dashboard: unused ClipboardList import removed', !dashboard.includes('ClipboardList'))
  check('Dashboard: "File them" now routes to the Filing Queue, not history', dashboard.includes("onClick={() => router.push('/app/file')}\n              style={{ background: C.gold"))
}

// ── One coherent Submissions design: shared row component + deadline,
//    used by both pages; responsive page/list containers on both. ────────
{
  const filePage = read('app/app/file/page.tsx')
  const historyPage = read('app/app/history/page.tsx')

  check('Filing Queue: renders show entries via the shared SubmissionEntryRow', filePage.includes('<SubmissionEntryRow'))
  check('Your Record: renders show entries via the same shared SubmissionEntryRow', historyPage.includes('<SubmissionEntryRow'))
  check('Filing Queue: computes a deadline per row via the dedicated, untouched pro-rules deadline()', filePage.includes('filingDeadlineLabel('))
  check('Filing Queue: only ever shows the single most important blocker, not the full list', filePage.includes('row.status.missing[0]'))
  check('Filing Queue: a comfortably-open deadline is filtered out before it ever reaches a row', filePage.includes('deadlineNeedsAttention('))
  check('Your Record: passes the $ estimate through to the shared row', historyPage.includes('estimate={est?.expected}'))
  check('Your Record: dot fill is restored to the original condition (Marked Submitted only, not Ready to Claim)', historyPage.includes("dotFilled={displayStatus.color === C.green}"))

  for (const [label, src] of [['Filing Queue', filePage], ['Your Record', historyPage]] as const) {
    check(`${label}: responsive page container caps at a readable width, not a wide multi-column layout`, src.includes('className="subm-page"') && src.includes('@media (min-width: 768px)') && !src.includes('@media (min-width: 1024px)'))
    check(`${label}: row list stays a single column at every width (no grid reflow)`, src.includes('className="subm-list"') && !src.includes('grid-template-columns'))
    check(`${label}: no fixed maxWidth left on the old phone-width column`, !/maxWidth:\s*(480|600),\s*(width:\s*'100%',\s*)?margin:\s*'0 auto'/.test(src))
  }

  const rowSrc = read('components/SubmissionEntryRow.tsx')
  check('SubmissionEntryRow: venue name is allowed to wrap, not truncated with ellipsis', !rowSrc.includes("textOverflow: 'ellipsis'") || !/venueName[\s\S]{0,200}textOverflow/.test(rowSrc))
  check('SubmissionEntryRow: flat list row (bottom divider), not a bordered card', rowSrc.includes('borderBottom:') && !rowSrc.includes('boxShadow:'))
  check('SubmissionEntryRow: dot color is fixed gold, independent of the status text color prop', rowSrc.includes('C.gold') && !/dotFilled \? statusTextColor/.test(rowSrc))
}

// ── This pass: scrollbar, header consistency, desktop width, contrast,
//    redundant blocker text, delete-control alignment ────────────────────
{
  const filePage = read('app/app/file/page.tsx')
  const historyPage = read('app/app/history/page.tsx')

  check('Your Record: status-tab scrollbar is hidden cosmetically (scroll behavior untouched)', historyPage.includes('subm-filter-scroll') && historyPage.includes('::-webkit-scrollbar { display: none; }') && historyPage.includes("overflowX: 'auto'"))
  check('Your Record: scrollbar-hiding does not touch the global ::-webkit-scrollbar rule', !historyPage.includes('*::-webkit-scrollbar'))

  check('Filing Queue header uses the same back-button style as Your Record (bordered pill + ChevronLeft)', filePage.includes('<ChevronLeft size={14} /> Back') && filePage.includes("border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px'"))
  check('Filing Queue header H1 matches Your Record\'s size/weight/spacing rhythm', filePage.includes("fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', flex: 1"))
  check('Filing Queue header carries a count chip like Your Record does', filePage.includes('{rows.length} to file'))

  for (const [label, src] of [['Filing Queue', filePage], ['Your Record', historyPage]] as const) {
    check(`${label}: desktop reading width widened for a more intentional feel (700px, not the cramped 640px)`, src.includes('max-width: 700px'))
  }

  check('Your Record: muted/secondary tokens match Filing Queue\'s (contrast + cross-page consistency)', historyPage.includes("secondary: '#b8a888', muted: '#8a7a68'"))

  check('Filing Queue: the redundant "setlist not yet reviewed" blocker line is suppressed (status label + action already say it)', filePage.includes("topReason !== 'setlist not yet reviewed'"))

  check('Your Record: delete control aligns with the row\'s own top line, not floating mid-height', historyPage.includes("alignSelf: 'flex-start'") && historyPage.includes('marginTop: 16'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

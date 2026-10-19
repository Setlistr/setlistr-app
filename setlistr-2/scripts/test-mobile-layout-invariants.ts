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
  check('Your Record: status filters wrap as a group (no sideways-scrolling chip row)', /\.hx-status \{[^}]*flex-wrap: wrap/.test(src) && !/overflowX:\s*'auto' as const,\s*paddingRight:\s*16/.test(src))
  check('Your Record: delete control is visually quiet at rest (no border/background until armed)', src.includes("border: isPendingDel ? '1px solid color-mix(in srgb, var(--sl-danger) 35%, transparent)' : 'none'"))
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
  check('Dashboard: the "Not yet marked submitted" ledger row routes to the Filing Queue, not history', /router\.push\('\/app\/file'\)[\s\S]{0,400}Not yet marked submitted/.test(dashboard))
}

// ── Direction B frame: the shell owns page height and safe areas; one
//    record definition on the dashboard; zoom is never disabled ─────────
{
  const shell = read('components/layout/AppShell.tsx')
  check('AppShell: publishes --sl-page-min-height (header + nav clearance subtracted) for pages inside it', shell.includes("'--sl-page-min-height'") && shell.includes('APP_HEADER_HEIGHT} - 96px - env(safe-area-inset-bottom'))
  for (const rel of ['app/app/dashboard/page.tsx', 'app/app/file/page.tsx', 'app/app/history/page.tsx', 'app/app/stats/page.tsx', 'app/app/schedule/page.tsx', 'app/app/team/page.tsx', 'app/app/settings/page.tsx', 'app/app/accept-invite/page.tsx']) {
    check(`${rel}: no bare 100svh page minimum inside the shell (forced a scroll of header + nav height)`, !read(rel).includes("minHeight: '100svh'"))
  }
  const dashboard = read('app/app/dashboard/page.tsx')
  check('Dashboard: hero, milestone, submitted and last show all come from summarizeRecord()', dashboard.includes('summarizeRecord(performances)') && dashboard.includes('record.count') && dashboard.includes('<NextMilestoneRow count={record.count} />') && dashboard.includes('record.submitted') && dashboard.includes('record.lastShow'))
  // One milestone component for the dashboard and the post-save celebration:
  // dots from milestoneFor(), the celebration's step only when the save added a counted show.
  const nextMilestone = read('components/record/NextMilestone.tsx'), recordFinish = read('components/record/RecordFinish.tsx'), reviewSrc = read('app/app/review/[id]/page.tsx')
  check('Milestone row: one shared component (dots, milestoneFor) used by the dashboard and the celebration', nextMilestone.includes('milestoneFor(count)') && nextMilestone.includes('one dot per show') && !nextMilestone.includes('Each dot is one show') && !dashboard.includes('function MilestoneTicks') && recordFinish.includes('<NextMilestoneRow'))
  check('Celebration: count steps up only when this save put the show on the record (isCapturedShow before vs after)', reviewSrc.includes('const wasCounted = isCapturedShow(') && reviewSrc.includes('added: counted && !wasCounted') && recordFinish.includes('step = d.added'))
  check('Milestones are earned by the show (its place on the record in show-date order), not by a save: one source for the moment and the card', reviewSrc.includes('setHeldMilestone(milestoneHeldBy(data, performance.id))') && reviewSrc.includes('if (heldMilestone) moments.push') && reviewSrc.includes('...(heldMilestone ? [{') && !reviewSrc.includes('intelligence.milestone)'))
  const cardsSrc = read('components/share-cards/RecordCards.tsx'), exportSrc = read('lib/share-card-export.ts')
  check('Share cards: the shared image comes from the browser layout (html-to-image), 1080 wide, no html2canvas fallback', exportSrc.includes("from 'html-to-image'") && exportSrc.includes('canvasWidth: target.width') && !reviewSrc.includes('html2canvas') && reviewSrc.includes('exportShareCard(cardDiv, format)'))
  check('Share cards: First Appearance and Royalty Moment are held back from selection, sharing and the preview page (code kept)', reviewSrc.includes("const HELD_CARDS = new Set(['song_debut', 'royalty_moment'])") && reviewSrc.includes('.filter(c => !HELD_CARDS.has(c.id))') && !read('app/app/share-preview/page.tsx').includes('<RoyaltyMomentCard') && !read('app/app/share-preview/page.tsx').includes('<SongDebutCard'))
  check('Share cards: no "tonight"/"new" or chronological show-number claims; milestone says "Through <date>"', !/tonight|#\{|SHOW #|VERIFIED/i.test(cardsSrc.replace(/\/\/.*$/gm, '')) && cardsSrc.includes('Through {date}'))
  check('Celebration: reduced motion renders no orb', recordFinish.includes('const orb = !reduced &&'))
  check('Dashboard: no "On pace" projection', !/On pace/.test(dashboard))
  check('Dashboard: no "filed"/"documented" wording for self-reported submissions or estimates', !/\bfiled\b<|documented</.test(dashboard))
  check('Root layout: pinch zoom is not capped', !/maximumScale\s*:/.test(read('app/layout.tsx')))
  check('Dashboard: record query selects only columns it uses (no captured_by_name/photo_url)', !/captured_by_name|photo_url/.test(dashboard))
  check('Dashboard: a failed load lands on the error state (try/catch around the load, fetch failures handled)', dashboard.includes('try { await loadInner() } catch') && dashboard.includes('setEstimatesUnavailable('))
  check('Dashboard: the counting rule (imported shows listed in History, not counted) is available behind a named, expandable control', dashboard.includes('imported from setlist.fm') && dashboard.includes('and not counted.') && dashboard.includes('aria-label="How the record is counted"') && dashboard.includes('aria-expanded={countInfoOpen}') && dashboard.includes('aria-controls="record-count-info"'))
  const history = read('app/app/history/page.tsx')
  check('History: scope unchanged (no data_source filter on the query) but the imported split is stated', !/\.neq\('data_source'/.test(history) && history.includes('on your live record') && history.includes('{importedCount} imported'))
  const ctx = read('app/api/team/context-data/route.ts')
  check('context-data: a failed performances read returns an error, not an empty list', ctx.includes("if (perfsError)") && ctx.includes('status: 500'))

  // Desktop milestone: one frame, role-gated capture, real "next" show
  const shell2 = read('components/layout/AppShell.tsx')
  check('AppShell: every capture control is gated on the role answer (canCapture), not merely having a workspace', (shell2.match(/href="\/app\/show\/new"/g) || []).length === 2 && !/hasWorkspace && \(\s*<Link\s+href="\/app\/show\/new"/.test(shell2) && (shell2.match(/\{canCapture && \(/g) || []).length === 2)
  check('AppShell: a single header/AccountMenu at every width (desktop top bar is the same element)', (shell2.match(/<AccountMenu /g) || []).length === 1 && shell2.includes('.sl-header {'))
  check('AppShell: desktop sidebar is 248px and only applies from 900px', shell2.includes('const SIDEBAR_WIDTH = 248') && shell2.includes('export const DESKTOP_MIN_WIDTH = 900'))
  check('Schedule: write controls follow the role (no hardcoded canManage={true})', read('app/app/schedule/page.tsx').includes('canManage={canWrite}'))
  check('Manager Schedule: write controls follow the selected artist role (no hardcoded canManage={true})', read('app/app/manager/schedule/page.tsx').includes('canManage={isWriteCapableRole(') && !read('app/app/manager/schedule/page.tsx').includes('canManage={true}'))
  for (const rel of ['app/auth/login/page.tsx', 'app/auth/reset-password/page.tsx']) {
    const src = read(rel)
    check(`${rel}: always-dark fields keep a 3:1 border at rest and on focus (no 40% gold focus, no 7% rest line)`, !src.includes("borderColor = 'rgba(201,168,76,0.4)'") && src.includes('${val.trim() ? C.lineActive : C.line}') && src.includes("line: '#6e6656', lineActive: '#a68a3e'"))
  }
  const layout = read('app/layout.tsx'), appearance = read('lib/appearance.ts')
  check('Appearance: boot script runs in <head> before first paint; <html> suppresses only its own hydration attribute warning', layout.includes('__html: APPEARANCE_BOOT_SCRIPT') && layout.includes('<html lang="en" suppressHydrationWarning>') && layout.includes('<AppearanceSync />'))
  check('Appearance: default Dark; installed app Dark unless the account-bound rollout grant is present (boot script and sync)', appearance.includes("DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = 'dark'") && appearance.includes("light=themed&&(!nat||granted)&&") && appearance.includes('if(!nat&&H.indexOf') && appearance.includes('if (nativeApp && !nativeGranted) return \'dark\'') && read('components/AppearanceSync.tsx').includes('session?.user?.id !== grant'))
  const settingsSrc = read('app/app/settings/page.tsx')
  check('Settings: Appearance control (Dark/Light/System) for browsers; installed app only for the rollout list', settingsSrc.includes("[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]") && settingsSrc.includes('const showAppearance = !nativeApp || (NATIVE_APPEARANCE_PREVIEW_EMAILS.includes(email)'))
  const live = read('app/app/live/[id]/page.tsx')
  check('Live capture safe areas: side insets once at the root, inert top strip below overlay layers, bottom clearance, no sticky header', live.includes("paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)'") && live.includes("height: 'env(safe-area-inset-top, 0px)', background: C.bg, zIndex: 20, pointerEvents: 'none'") && live.includes("padding: '0 16px max(40px, calc(16px + env(safe-area-inset-bottom, 0px)))'") && !/position: 'sticky'/.test(live) && (live.match(/safe-area-inset-left/g) || []).length === 1 && (live.match(/safe-area-inset-right/g) || []).length === 1)
  check('Live capture: gold orb stays literal gold in every appearance; idle orb from tokens', live.includes("'radial-gradient(circle at 40% 35%, #c9a84ccc, #c9a84c 55%, #8a6520)'") && live.includes("'radial-gradient(circle at 40% 35%, #e8c76a, #c9a84c 55%, #a07828)'") && live.includes("'var(--sl-orb-idle-bg)'") && read('app/globals.css').split('--sl-orb-idle-bg').length === 3)
  check('Converted fields: focus/filled borders use the 3:1 active line, not a faint gold', !/input:focus\s*\{\s*border-color:\s*color-mix\(in srgb, var\(--sl-accent\) 40%/.test(['app/app/review/[id]/page.tsx', 'app/app/submit/[id]/page.tsx', 'app/app/upload/new/page.tsx', 'app/app/show/upload/page.tsx', 'app/app/history/page.tsx'].map(read).join('\n')))
  const sched = read('components/scheduling/UpcomingShows.tsx')
  check('Coming up: next show picked by venue-local date (past still-scheduled shows skipped)', sched.includes('pickNextScheduled<ScheduledShow>(') && !sched.includes('(data.shows || [])[0]'))
  check('Disc: breathing glow restored on the phone disc only, animating box-shadow alone, off under reduced motion', shell2.includes('className="sl-disc-breathe"') && /@keyframes sl-disc-breathe \{[^}]*box-shadow[^}]*\}[^}]*box-shadow[^}]*\} \}/.test(shell2) && !/@keyframes sl-disc-breathe[^\n]*(transform|scale|opacity)/.test(shell2) && shell2.includes('@media (prefers-reduced-motion: reduce) { .sl-disc-breathe { animation: none; } }'))
  for (const rel of ['app/app/file/page.tsx', 'app/app/history/page.tsx', 'app/app/stats/page.tsx', 'components/MySongsTab.tsx', 'app/app/venue/[id]/page.tsx', 'app/app/proof/page.tsx', 'app/app/settings/page.tsx', 'app/app/team/page.tsx', 'app/app/accept-invite/page.tsx', 'app/app/schedule/page.tsx', 'components/scheduling/UpcomingShows.tsx', 'components/SubmissionsSwitcher.tsx', 'components/SubmissionEntryRow.tsx', 'components/WorkspaceGate.tsx', 'components/SetlistrLoader.tsx', 'app/app/review/[id]/page.tsx', 'app/app/submit/[id]/page.tsx', 'app/app/upload/new/page.tsx', 'app/app/show/upload/page.tsx', 'app/app/onboarding/page.tsx', 'components/CatalogSearch.tsx', 'components/layout/ManagerShell.tsx', 'app/app/manager/page.tsx', 'app/app/manager/artists/page.tsx', 'app/app/manager/artists/[artistId]/page.tsx', 'app/app/manager/schedule/page.tsx', 'app/app/manager/analytics/page.tsx', 'app/app/show/new/page.tsx']) {
    // Lines marked "map imagery" keep fixed colours on purpose (text over a dark map image),
    // as do html2canvas options (it can't read CSS variables).
    const src = read(rel).split('\n').filter(l => !l.includes('map imagery') && !l.includes('html2canvas:')).join('\n')
    check(`${rel}: palette is theme tokens (no legacy hex palette colours left)`, !/#(0a0908|141210|171512|f0ece3|b8a888|8a7a68|c9a84c|5a5040|5a5448)\b/i.test(src))
  }
  check('Dashboard: wide layouts follow the content width (container queries), phones keep fallbacks', dashboard.includes('container-type: inline-size') && dashboard.includes('@container sl-dash (min-width: 900px)'))
}

// ── One coherent Submissions design: shared row component + deadline,
//    used by both pages; responsive page/list containers on both. ────────
{
  const filePage = read('app/app/file/page.tsx')
  const historyPage = read('app/app/history/page.tsx')

  check('Filing Queue: renders show entries via the shared SubmissionEntryRow', filePage.includes('<SubmissionEntryRow'))
  check('Your Record: renders show entries via the same shared SubmissionEntryRow', historyPage.includes('<SubmissionEntryRow'))
  check('Filing Queue: computes a deadline per row via the dedicated, untouched pro-rules deadline()', filePage.includes('filingDeadlineLabel('))
  check('Filing Queue: only ever shows the single most important next step, not the full list', filePage.includes('showOnly[0]') && !filePage.includes('missing.join('))
  check('Filing Queue: a comfortably-open deadline is filtered out before it ever reaches a row', filePage.includes('deadlineNeedsAttention('))
  check('Your Record: passes the $ estimate through to the shared row', historyPage.includes('estimate={est?.expected}'))
  check('Your Record: dot fill is restored to the original condition (Marked Submitted only, not Ready to Claim)', historyPage.includes("dotFilled={displayStatus.color === C.green}"))

  for (const [label, src] of [['Filing Queue', filePage], ['Your Record', historyPage]] as const) {
    check(`${label}: responsive page container caps at a readable width, not a wide multi-column layout`, src.includes('className="subm-page"') && src.includes('<div className="subm-cq">') && src.includes('<SubmissionsDesktopStyles />') && !src.includes('@media (min-width: 768px)'))
    check(`${label}: row list stays a single column at every width (no grid reflow)`, src.includes('className="subm-list"') && !src.replace(/\.hx-tb \{[^}]*\}/g, '').includes('grid-template-columns'))
    check(`${label}: no fixed maxWidth left on the old phone-width column`, !/maxWidth:\s*(480|600),\s*(width:\s*'100%',\s*)?margin:\s*'0 auto'/.test(src))
  }

  const rowSrc = read('components/SubmissionEntryRow.tsx')
  check('SubmissionEntryRow: venue name is allowed to wrap, not truncated with ellipsis', !rowSrc.includes("textOverflow: 'ellipsis'") || !/venueName[\s\S]{0,200}textOverflow/.test(rowSrc))
  check('SubmissionEntryRow: flat list row (bottom divider), not a bordered card', rowSrc.includes('borderBottom:') && !rowSrc.includes('boxShadow:'))
  check('SubmissionEntryRow: explicit queue/history variants; both lead with the venue, the queue states one next step', rowSrc.includes("variant: 'queue'") && rowSrc.includes("variant: 'history'") && filePage.includes('variant="queue"') && filePage.includes('task={step}') && historyPage.includes('variant="history"') && (rowSrc.match(/>\{venueName\}<\/span>/g) || []).length === 2)
  check('SubmissionEntryRow: the whole row is the one control — no nested buttons or links inside it', (() => { const row = rowSrc.slice(rowSrc.indexOf('export function SubmissionEntryRow('), rowSrc.indexOf('export function SubmissionRowsSkeleton(')); return (row.match(/<button/g) || []).length === 1 && !/<a[\s>]/.test(row) })())
  check('Filing Queue actions read "Review the setlist" / "Open the claim sheet" (destinations unchanged)', read('lib/filing-status.ts').includes("label: 'Review the setlist'") && read('lib/filing-status.ts').includes("label: 'Open the claim sheet'"))
  check('Ready state reads "Ready to submit" on both screens (same filing.state === ready)', filePage.includes("if (status.state === 'ready') return 'Ready to submit'") && historyPage.includes("label: 'Ready to submit'") && !historyPage.includes('Ready to Claim'))
  check('Your Record: Marked Submitted keeps green text with the filled gold dot', historyPage.includes("label: 'Marked Submitted', color: C.green") && historyPage.includes('dotFilled={displayStatus.color === C.green}'))
  check('SubmissionEntryRow: dot color is fixed gold, independent of the status text color prop', read('components/ui/StatusLabel.tsx').includes("border: '1.5px solid var(--sl-accent)'") && rowSrc.includes('<StatusLabel') && !/dotFilled \? statusTextColor/.test(rowSrc))
}

// ── This pass: scrollbar, header consistency, desktop width, contrast,
//    redundant blocker text, delete-control alignment ────────────────────
{
  const filePage = read('app/app/file/page.tsx')
  const historyPage = read('app/app/history/page.tsx')

  check('Your Record: status filters never scroll sideways (phone: behind Filters; wider: wrap as one group)', historyPage.includes('className="hx-status"') && !historyPage.includes('subm-filter-scroll subm-tb-tabs'))
  check('Your Record: scrollbar-hiding does not touch the global ::-webkit-scrollbar rule', !historyPage.includes('*::-webkit-scrollbar'))

  check('Submissions screens (a navigation tab) carry no Back button on either view', !filePage.includes('ChevronLeft') && !historyPage.includes('ChevronLeft'))
  check('Filing Queue header H1 matches Your Record\'s size/weight/spacing rhythm', [filePage, historyPage].every(p => p.includes("fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', padding: '20px 0")))
  check('Submissions headers carry no duplicate count chip (the switcher shows the counts)', !filePage.includes('to file`') && !historyPage.includes('`${performances.length} shows`'))
  check('Submissions loading: skeleton rows, error with Try again, results keyed to the workspace (no stale rows)', [filePage, historyPage].every(p => p.includes('SubmissionRowsSkeleton') && p.includes('<LoadError ') && p.includes('onRetry={retry}') && p.includes('workspaceKey')) && !filePage.includes('SetlistrLoader') && !historyPage.includes('if (loading) return'))
  check('Filing Queue count is carried by the switcher, as on Your Record', filePage.includes('filingQueueCount={navCounts?.filingQueueCount}') && historyPage.includes('fullHistoryCount={navCounts?.fullHistoryCount}'))

  for (const [label, src] of [['Filing Queue', filePage], ['Your Record', historyPage]] as const) {
    check(`${label}: desktop follows the dashboard's container tiers and margins, list bounded to 880px`, (() => { const r = read('components/SubmissionEntryRow.tsx'); return r.includes('@container subm (min-width: 600px)') && r.includes('max-width: 640px !important; padding: 0 32px 56px') && r.includes('@container subm (min-width: 900px)') && r.includes('max-width: 1120px !important; padding: 0 48px 64px') && r.includes('.subm-page > * { max-width: 880px; }') })())
  }

  check('Your Record: muted/secondary tokens match Filing Queue\'s (contrast + cross-page consistency)', historyPage.includes("secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)'") && read('app/app/file/page.tsx').includes("secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)'"))

  check('Filing Queue: "setlist not yet reviewed" reads once, as the step "Review the setlist"', filePage.includes("showOnly[0] === 'setlist not yet reviewed'") && filePage.includes("return 'Review the setlist'"))

  check('Your Record: delete is behind Edit, offered only to write-capable accounts (not Viewers), and rendered beside the row, not inside it', historyPage.includes('const { canWrite } = useWorkspaceRole()') && historyPage.includes('{canWrite && performances.length > 0 && (') && historyPage.includes('{editing && canWrite && (') && historyPage.includes('handleDeleteTap(e, perf.id)'))
  check('Your Record: delete keeps its tap-to-arm confirmation and the undo banner', historyPage.includes("isPendingDel ? 'Delete?' : '✕'") && historyPage.includes('undoDelete') && historyPage.includes('/delete/undo'))
}

// ── Shared app UI standard (docs/ui-standard.md) ──────────────────────────
{
  const globals = read('app/globals.css')
  const dashboard = read('app/app/dashboard/page.tsx')
  const career = read('app/app/stats/page.tsx')
  const rows = read('components/SubmissionEntryRow.tsx')
  const subSwitch = read('components/SubmissionsSwitcher.tsx')
  const historyPage = read('app/app/history/page.tsx')
  const filePage = read('app/app/file/page.tsx')
  check('Loading: one skeleton shimmer, defined once in globals.css with a reduced-motion stop', (globals.match(/@keyframes sl-shimmer/g) || []).length === 1 && globals.includes('@media (prefers-reduced-motion: reduce) { .sl-skel::after { animation: none; display: none; } }') && !dashboard.includes('@keyframes sl-shimmer') && !rows.includes('sl-subm-skel'))
  check('Loading: dashboard, Submissions rows and Career all use the shared Skeleton', [dashboard, rows, career].every(src => src.includes("from '@/components/ui/Skeleton'")) && !/function Skeleton\(/.test(dashboard))
  check('View switcher: Career and Submissions use the shared ViewSwitcher', career.includes('<ViewSwitcher') && subSwitch.includes('<ViewSwitcher') && career.includes('onSelect=') && subSwitch.includes("href: '/app/file'"))
  check('Filters stay a separate pattern: History status chips are not the view switcher', historyPage.includes('subm-filter-scroll') && !historyPage.includes('<ViewSwitcher'))
  check('Errors: Career and both Submissions screens use the shared LoadError', [career, historyPage, filePage].every(src => src.includes("from '@/components/ui/LoadError'")))
  check('Status label: Submissions rows use the shared StatusLabel (MARKED SUBMITTED = green text + filled gold dot)', rows.includes("from '@/components/ui/StatusLabel'") && !rows.includes('function StatusLine(') && historyPage.includes('dotFilled={displayStatus.color === C.green}'))
  check('Career: shared frame and header; results keyed to the workspace; page and section retry', career.includes('<PageFrame>') && career.includes('<PageHeader title="Career" />') && career.includes('workspaceKey') && career.includes('onRetry={retryPage}') && career.includes('onRetry={retrySection}'))
  check('Career: standard estimate wording, no "documented", no "verified shows"', career.includes('{ESTIMATE_DISCLAIMER}') && career.includes('formatEstimate(estimatedLifetimeRoyalty)') && !/documented/.test(career) && !/verified shows/.test(career))
  check('Career: honest signature-song ties and the debut-date fix', career.includes('tiedTop.length > 1') && career.includes("'Most played live · tied'") && career.includes('showDate({ performance_date: d })'))
  check('Career: the broader figures are explained once, beside the live-record headline (no per-figure "incl." notes)', career.includes('Shows played is your live record.') && career.includes('the monthly chart, and the song, venue and debut lists also include') && !career.includes('`incl. ${beyondLabel}`') && career.includes('.cr-stats, .cr-scope { order: 2; }'))
  check('Career: data scopes unchanged (same status filter and selects)', (career.match(/CAREER_SHOW_STATUSES/g) || []).length === 3 && read('lib/performance-status.ts').includes("export const CAREER_SHOW_STATUSES = ['completed', 'complete', 'exported', 'review']") && career.includes("select('id, venue_name, venue_id, city, country, started_at, ended_at, set_duration_minutes, submission_status, status, data_source, shows(show_type), venues(capacity)')") && career.includes('isCapturedShow({ status: p.status ?? null') && career.includes("select('title, artist, position, performance_id')"))
  check('Career map: same Static Images style and tap-through; fitted to the pins; reserved space with a fallback', career.includes('mapbox/dark-v11/static/${markerOverlay}/auto/600x340@2x') && career.includes('attribution=false') && career.includes('© Mapbox © OpenStreetMap') && career.includes("router.push('/app/career-map')") && career.includes("aspectRatio: '600 / 340'") && career.includes('Map preview unavailable'))
  check('Career: venue rows are buttons (keyboard reachable), not clickable divs', career.includes("onClick={() => router.push(`/app/venue/${venue.id}`)} style={{ ...listRow"))
}

// ── Post-save celebration (app/app/review/[id] showComplete) ──────────────
{
  const review = read('app/app/review/[id]/page.tsx')
  const debutCard = read('components/share-cards/SongDebutCard.tsx')
  check('Save: every required write checked; completion confirmed (returned row, or read back as newly complete); celebration only then', (review.match(/await step\('/g) || []).length >= 10 && review.includes(".update({ status: PERFORMANCE_COMPLETE }).eq('id', performance.id).select('id'))") && review.includes("if (!error && !wasComplete && check?.status === PERFORMANCE_COMPLETE) confirmed = true") && review.includes('if (!confirmed) {') && review.includes('setSaveError({'))
  check("Save: performances.status is written as 'complete' (the column's allowed value; 'completed' is rejected with 23514), shows.status keeps 'completed'", review.includes("const PERFORMANCE_COMPLETE = 'complete'") && !/from\('performances'\)\.update\(\{ status: 'completed'/.test(review) && review.includes("supabase.from('shows').update({ status: 'completed' }).eq('id', performance.show_id))"))
  check('Save: the linked show is a required step, before the performance is marked complete', review.indexOf("step('mark the linked show finished'") > 0 && review.indexOf("step('mark the linked show finished'") < review.indexOf("step('mark the show complete'"))
  check('Save: a rejection the database will repeat is not offered as a retry; temporary failures are; a catalogue failure (tagged by the database) is named as such', review.includes("const repeats = !temporary && /^(22|23|42|P0|PGRST)/.test(code)") && review.includes("const temporary = /^(40001|40P01|55P03|57014|53|08|57P0)/.test(code)") && review.includes("const catalogue = f?.hint === 'setlistr:song-catalogue'") && review.includes('retry: !refused && !repeats') && review.includes("saveError?.retry ? 'Try again' : 'Save & Complete'") && review.includes('Trying again won’t fix this'))
  check('Save: songs added during review are never inserted twice (saved rows remembered; lost inserts adopted before inserting)', review.includes('savedNewRowsRef.current[s.id] = (r as any).data.id') && review.includes(".eq('inclusion_reason', 'manually added post-show')") && review.includes('savedNewRowsRef.current[s.id] = row.id'))
  check('Save: optional steps (legacy setlist mirror, moments) after confirmation, never decide the result; mirror is non-destructive; the page writes no catalogue (the database records it with the final write); a played planned song is stored as played', review.indexOf('// ── Optional after a confirmed save') > review.indexOf("confirmed = !!done.data && done.data.length === 1") && review.includes("if (insErr) throw insErr") && !review.includes('recognition_decision_id: s.recognition_decision_id || null }') && review.includes('const songDebuts = catalogComplete ?') && !review.includes('writeUserSongFromReview') && !/from\('user_songs'\)\.(insert|update)|from\('user_song_performances'\)\.insert/.test(review) && review.includes("update({ position, source: 'manual', was_planned: true })"))
  const mySongs = read('components/MySongsTab.tsx'), statsSrc = read('app/app/stats/page.tsx')
  check("My Songs venue list uses Career's performance statuses (shared CAREER_SHOW_STATUSES), not 'completed' alone", mySongs.includes(".in('status', CAREER_SHOW_STATUSES)") && !mySongs.includes(".eq('status', 'completed')") && statsSrc.includes(".in('status', CAREER_SHOW_STATUSES)") && statsSrc.includes('CAREER_SHOW_STATUSES.includes(p.status)'))
  check('notion-sync counts only the transition into complete (previous status required)', read('app/api/notion-sync/route.ts').includes('if (isPerformanceCompletion(payload)) {'))
  check('Save messages are plain and accurate (no "Nothing was marked complete"); a reference names the failed operation', !/Nothing was marked complete/.test(review) && review.includes('Only part of the setlist was saved') && review.includes('The connection dropped before the save could be confirmed') && review.includes('ref: `Reference: ${op}'))
  check('Celebration: shared frame, shared estimate wording, "Open the claim sheet" only where the role can write', review.includes('<PageFrame style=') && review.includes('{ESTIMATE_DISCLAIMER}') && review.includes('Open the claim sheet →') && review.includes("onClaim={canWrite ? () => router.push(`/app/submit/${params.id}`) : null}"))
  check('Celebration: no unsupported first-live claims; ordinals are real', !/first time played live/i.test(review) && !/FIRST TIME PLAYED LIVE|LIVE DEBUT/.test(debutCard) && review.includes('First appearance on your record') && review.includes('function ordinal('))
  check('Celebration: opens straight after save at the top; reduced motion shows everything at once', review.includes('setSeqPhase(7); setShowComplete(true)') && review.includes("window.scrollTo({ top: 0") && review.includes('@media (prefers-reduced-motion: reduce)') && review.includes("matchMedia('(prefers-reduced-motion: reduce)').matches) { setCount(target); return }"))
  check('Celebration: optional intelligence has loading and failed states (never an endless loader)', review.includes("setIntelligenceState('failed')") && review.includes("intelligenceState === 'ok' && moments.length > 0"))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

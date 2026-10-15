# Submissions refinement — handoff

Branch `design/submissions-rows`, cut from `main` at `8a3a5ba`. Reviewed on Preview (desktop and mobile) and approved for merge at `fbda2de`; this document is the only commit added after that approval. Merged to `main` by fast-forward (no force push). `main` had no new commits since `8a3a5ba` at merge time.

## What shipped

| Commit | Change |
|---|---|
| `d6b4e15` | Shared `SubmissionEntryRow` with explicit `queue` / `history` variants. Filing Queue leads with the task ("Review the setlist" / "Open the claim sheet"), History with the venue. "Ready to submit" on both screens (same `filing.state === 'ready'`; eligibility unchanged). History delete moved behind Edit, offered only when `useWorkspaceRole().canWrite`; tap-to-arm confirmation and Undo unchanged. One button per row, no nested controls. |
| `b1f64be` | Deadline-label contrast fix (theme danger/warn tokens). Cherry-pick of `828d5fe` — identical patch-id. The original `fix/deadline-label-contrast` branch does not need a separate merge. |
| `032aaca` | Loading: skeleton rows shaped like the real rows; header, switcher and History search/filters usable while loading; results tagged with the workspace they were loaded for (no previous-artist rows, late responses ignored); any failed request shows "Couldn't load … shows" with Try again instead of an empty state or endless loader. Requests: one sign-in check, then profile and show list in parallel, then song counts; switcher counts derived from the same rows (`countsFromRows`). Header count chip wraps at larger text sizes. |
| `fbda2de` | Desktop composition only (phones unchanged). Container queries on the page content width copy the dashboard's tiers and margins: 640px column / 32px margins from 600px, 1120px frame / 48px margins from 900px with the column bounded to 880px. Desktop rows: date, details, right-aligned status + deadline/estimate beside the action. Compact History toolbar. |

Files: `components/SubmissionEntryRow.tsx`, `app/app/file/page.tsx`, `app/app/history/page.tsx`, `lib/filing-status.ts`, `lib/load-filing-profile.ts`, `lib/filing-deadline-label.ts`, `scripts/test-mobile-layout-invariants.ts`, `scripts/test-filing-deadline-label.ts`.

Not changed: destinations (`filingActionPath` hrefs), estimates, priority order, permissions, data scope, SQL/migrations, Auth, native/Capacitor, capture.

## Checks run

- `npx tsc --noEmit` (app tsconfig) and `next build`: pass.
- Script suites (`npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-<name>.ts`): mobile-layout-invariants 114, filing-status 39, filing-deadline-label 21, submissions-nav-counts 22, record-summary 22, appearance 75, workspace-boundary 66, viewer-write-containment 465 — all passing.
- Browser checks (Playwright against `next dev` and a local Supabase with seeded test accounts; harnesses kept outside the repo):
  - Rows (72): both screens, phone and desktop, both themes, 320px and 130% zoom, contrast (deadline labels included), no nested controls, no clipping, Edit → arm → delete → Undo, Viewer sees no Edit, Manager does.
  - Loading (27): slow first load shows skeletons and never an empty state; switcher usable while loading; show-list and song-count failures show the error and Try again recovers; workspace switching both ways and a rapid double switch never show the other workspace's rows.
  - Delegated workspaces (15): failure → Try again on both screens (team context, show list, song counts); switching away before a delayed failure or a delayed success returns — the late response never reaches the new workspace; Viewer failure → retry.
  - Desktop (56): 1024 / 1280 / 1440 in both themes — left content edge equal to the dashboard's at every width, list ≤ 880px, one status column, contrast, Edit/Undo, desktop skeleton. Phones pixel-identical to before apart from the bottom nav's animated capture disc.
  - Request trace (production build, 150ms added latency): 9 → 6 requests, first row ~1150ms → ~830ms.

## Known limitations

- The local database lacks `profiles.legal_name / ipi_number / publisher_name` and `performances_visible.captured_by_name / photo_url / submitted_at`; browser checks supplied those fields in the response. Production has them.
- Larger text was approximated with CSS zoom, not iOS Dynamic Type. No installed-app (Capacitor) check of this branch was run.
- On Full History, if only the delegated team-context request fails, the list still loads and statuses fall back to "no PRO selected" (Needs review). This fail-closed fallback predates this work and was kept; Filing Queue shows the error in that case.
- History filter chips wrap to a second line at the 1024px window (576px column).
- The app shell's own requests (a `performances_visible` HEAD count and a session call) still run on these pages; they were out of scope.

## Next

- Optional on-device pass of Filing Queue / History in the installed app.
- Career refinement: proposal first (mobile and desktop, both themes), no implementation before approval.

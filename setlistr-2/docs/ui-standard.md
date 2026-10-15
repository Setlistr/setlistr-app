# Setlistr app UI standard

The shared patterns for screens inside the app frame (`/app/*`). Built from the shipped dashboard, the refined Submissions rows and Career's Overview / My Songs control. Use the components and tokens listed here; don't copy their CSS into pages.

Consistency applies to frame, controls and states, not to every layout. Each screen keeps its own identity: the dashboard's record number and ledger, Career's map and songs, capture's orb.

## Components and tokens

| Pattern | Use | Where |
|---|---|---|
| Page frame | Width tiers and gutters | `components/ui/PageFrame` + `.sl-frame` rules in `app/globals.css` |
| Page header | Title, optional Back, optional meta chip | `components/ui/PageHeader` |
| View switcher | Sibling views of one area | `components/ui/ViewSwitcher` (Submissions wraps it in `SubmissionsSwitcher`) |
| Skeleton | Every loading placeholder | `components/ui/Skeleton` + `.sl-skel` in `app/globals.css` |
| Load error | Failed load with Try again | `components/ui/LoadError` |
| Status label | Filing status on a show | `components/ui/StatusLabel` |
| Estimate copy | Royalty estimate wording | `lib/estimate-copy.ts` |
| Dates | Show dates from the database | `showDate()` in `lib/record-summary.ts` |
| Colour, surfaces, type | Everything | `--sl-*` tokens in `app/globals.css`. Inline styles only, no Tailwind classes. |

## Layout

- **Frame tiers** are measured on the content width beside the desktop sidebar, not the window:
  - under 600px: a 480px column with **20px** gutters (aligned with the app header)
  - 600–899px: a 640px column with 32px gutters
  - 900px+: a 1120px frame with 48px gutters
- **Column splits inside the frame are per page.** Dashboard: poster | ledger (360–440px, gap 72). Career: map column | statistics column (340–400px, gap 48). Submissions: one bounded 880px list.
- **Safe areas are owned by AppShell** (header top inset, nav bottom inset, side insets). Pages add no `env(safe-area-*)` padding. Live capture is the exception (full-screen, outside the frame).
- **Page height** uses `var(--sl-page-min-height, 100svh)`, never a bare `100svh`.

## Page header

- One title at 28px / 800 / -0.02em.
- **Back** only on sub-pages (Submissions screens), never on a tab root (Career, Home).
- An optional meta chip (e.g. "7 to file") sits on the right. The row wraps at larger text sizes instead of overflowing.
- A sibling-view switcher sits directly below the header, or below the page's one-line description.

## View switcher vs filters

- **View switcher (segmented):** chooses between sibling views of one area.
  - Career: Overview / My Songs (in-page tabs, `role="tablist"`).
  - Submissions: Filing Queue / Full History (two pages, `nav` + `aria-current`).
  - Segments are 44px tall. The active segment is elevated with a gold-tinted border.
  - Counts are optional and never block the control.
- **Filters (chips):** narrow one list without changing the view, e.g. History's All / Needs Review / Ready to submit / Marked Submitted.
  - Rounded chips with counts that scroll sideways on phones and wrap on desktop.
  - Never styled as the view switcher, and never combined with it.

## Controls

- **Primary button:** gold fill, `--sl-on-accent` text, radius 12–14, min-height 44 (48 for page-level actions).
- **Secondary button:** gold-tinted outline (accent 45%), gold text, min-height 44. "Try again" uses this.
- **Text action:** gold text, 700, used for "Show all", "View your map", etc. Its hit area is still 44px tall.
- **Fields:**
  - `--sl-input-bg` background, `--sl-input-line` border (3:1 at rest), `--sl-input-line-active` on focus or when filled.
  - Radius 12, 16px text on iOS (no focus zoom), min-height 44.
- **Menus:** the AccountMenu pattern.
  - `--sl-elevated` surface, `--sl-line` border, radius 14, `--sl-menu-shadow`.
  - Items `role="menuitem"`, min-height 44.
- **Touch targets:** 44px minimum for anything tappable. Rows can be the whole target (one button, no nested controls).

## Status, dates and estimates

- **Filing status:** `StatusLabel`, an uppercase label with a gold dot, outline by default.
  - **MARKED SUBMITTED:** green text (`--sl-ok`) with the **filled** gold dot.
  - **Ready to submit:** gold text with the outline dot.
  - **Needs review:** secondary text with the outline dot.
  - The dot is always gold.
- **Dates:**
  - Rows use the stacked date: day 20px/700, month 12px muted.
  - Inline dates read "Oct 10, 2026" (en-US short month).
  - Relative dates ("5 days ago") use `lastShowLabel()`.
  - Always parse database dates with `showDate()` / `parseLocalDate()`. A date-only value read with `new Date()` shifts a day west of UTC, and a timestamp split as `YYYY-MM-DD` prints "Invalid Date".
- **Estimates:**
  - Amounts read "~$320 est." (`formatEstimate()` + `ESTIMATE_UNIT`).
  - The disclaimer is exactly "Estimates only, not guaranteed. Payouts vary by PRO." (`ESTIMATE_DISCLAIMER`).
  - Never "documented", "earned" or another certainty word.
- **Most played** is counted from setlists. It is never called "best". When several songs share the top count, say they're tied instead of naming one signature song.

## Loading

Audited on the shipped dashboard (`app/app/dashboard/page.tsx`): the frame stays; skeleton blocks shaped like the poster and ledger; one shimmer (1.4s, Light-tuned, removed under reduced motion); a page-level error with Try again (and Switch workspace for delegates).

- **App frame:** the AppShell header, nav and sidebar never re-render into a loader. The page header and view switcher render immediately and stay usable.
- **Initial load:**
  - Skeletons use `Skeleton` blocks with the same columns, block sizes and order as the finished page, so nothing moves when data arrives (Career measured: the map moves 0px).
  - Shared surface `--sl-skeleton`, shared shimmer, no motion under `prefers-reduced-motion`.
  - Expose `aria-busy="true"` and one visually hidden status line.
- **Never:**
  - an empty state before data arrives
  - an endless loader after a failure
  - artificial waits
- **Workspace switching:**
  - Tag results with the workspace they were loaded for (`actingAsArtistId || 'own'`) and render them only while that workspace is active.
  - Cancel or ignore late responses (effect cleanup flag), and reset per-workspace UI state (Edit mode, armed deletes, undo banners, expanded lists).
- **In-page refresh and filtering:**
  - Keep current content on screen while it refreshes (e.g. Undo in History, a section retry in Career). Only a page-level retry returns to the skeleton.
  - Client-side filters apply instantly with no loader.
- **Errors and retry:**
  - Primary data fails: `LoadError` replaces the content area with what didn't load (naming the artist in a delegated workspace) and Try again.
  - Secondary data fails (e.g. Career's song debuts): a compact `LoadError` inside that section; the rest of the page stays.
  - Treat a Supabase `{ error }` result as a failure; never fall through to an empty list.
- **Imagery (Career map):**
  - Reserve the final size from the first frame (aspect-ratio box).
  - Show an on-dark skeleton until the image loads; show "Map preview unavailable" in the same box if it fails or there's no token.
  - Never block the rest of the page on it. Request the image once, after its framing inputs (geocoded pins) settle, rather than drawing a view and then re-framing.
- **Requests:** trace before changing them (CLAUDE.md, Submissions handoff). Remove proven serial waits and duplicate fetches. Never restart expensive content for visual consistency.

## Empty states

- Only after a successful load that returned nothing.
- One sentence saying what will appear and how, plus at most one primary action when there is a clear next step ("Capture a Show →").
- Filter results that come back empty say so ("No shows match your filters") and are not the first-run message.

## Accessibility

- 44px targets, as above.
- Visible keyboard focus (`.sl-seg:focus-visible`, row `:focus-visible` outlines).
- Rows that navigate are single buttons with no nested interactive elements.
- 4.5:1 text contrast in both themes. Theme tokens only; fixed colours are allowed only on imagery that is dark in both themes, marked `map imagery: fixed`.
- No sideways scroll at 320px or at 130% text.

## Intentional exceptions

- **Dashboard:**
  - Its poster number, ledger and hero-scale load error are its identity. It keeps its own two-column split, and its error is a full-poster state rather than an inline `LoadError`.
  - Its 20px gutter is the standard.
- **Live capture** (`/app/live/[id]`): full-screen, outside the frame and header rules. It owns its safe areas and the gold orb stays literal gold in every appearance.
- **Career map card:** fixed dark colours over the map image in both themes (the imagery is dark in both).
- **Public pages** (`/s/[id]`, marketing): not covered by this standard.

## Known deviations (not fixed in this batch)

- **Submissions:**
  - Mobile gutter is 16px (standard 20px). Its layout was approved before this standard. Fix when it adopts `PageFrame`.
  - Has its own container (`.subm-cq`, same tiers as `PageFrame`) and hand-built headers that match `PageHeader` visually. Migrate both.
  - History's banner uses "Estimate only, not guaranteed — actual payouts vary by PRO." Switch to `ESTIMATE_DISCLAIMER`.
- **Dashboard:**
  - The workspace-switch reload has no stale-response guard. A slow response from a previous switch can land after a quick second switch.
  - Its recent-shows rows say "Completed" where Submissions says "Ready to submit" / "Needs review".
- **Career:**
  - Counts shows by status, so imported shows are included (29 vs 27 on the dashboard and full map). Count-definition alignment is a separate decision.
  - Map-card geocoding runs up to 6 lookups one after another. A candidate fix, not changed until traced with Mapbox.
  - The My Songs tab keeps its own internal layout at its previous reading width.
- **Career Map** (full map): on phones it opened zoomed out to a globe instead of fitting the cities.

## Route adoption checklist

✅ adopted · ◐ partly · ○ not yet. Columns: Frame / Header / Switcher or filters / Loading / Errors / Copy.

| Route | Frame | Header | Switch / filters | Loading | Errors | Copy | Notes |
|---|---|---|---|---|---|---|---|
| `/app/dashboard` | ✅ (own tiers) | ✅ | n/a | ✅ shared Skeleton | ✅ (page-level exception) | ◐ "Completed" label | Add stale-response guard on switch |
| `/app/stats` (Career Overview) | ✅ | ✅ | ✅ tabs | ✅ | ✅ page + section | ✅ | My Songs tab internals ○ |
| `/app/file` (Filing Queue) | ◐ `.subm-cq`, 16px | ◐ hand-built | ✅ | ✅ | ✅ | ✅ | Migrate to PageFrame/PageHeader |
| `/app/history` | ◐ `.subm-cq`, 16px | ◐ hand-built | ✅ switcher + filter chips | ✅ | ✅ | ◐ banner disclaimer | |
| `/app/career-map` | ○ | ○ | n/a | ○ breathing ring | ○ | ○ | Phone fit issue; separate full-map pass |
| `/app/schedule` | ○ | ○ | ○ | ○ | ○ | ○ | |
| `/app/venue/[id]` | ○ | ○ | n/a | ○ | ○ | ○ | |
| `/app/proof` | ○ | ○ | n/a | ○ | ○ | ○ | |
| `/app/review/[id]`, `/app/submit/[id]` | ○ | ○ | n/a | ○ | ○ | ◐ | Fields already on input tokens |
| `/app/show/new`, `/app/upload/new` | ○ | ○ | n/a | ○ | ○ | ○ | |
| `/app/live/[id]` | exception | exception | n/a | — | — | — | Capture orb, own safe areas |
| `/app/settings`, `/app/team`, `/app/accept-invite`, `/app/onboarding` | ○ | ○ | ○ | ○ | ○ | ○ | |
| `/app/artist/[id]`, `/app/manager/*` | ○ | ○ | ○ | ○ | ○ | ○ | ManagerShell |
| `/app/admin/*` | ○ | ○ | n/a | ○ | ○ | ○ | Internal; lowest priority |

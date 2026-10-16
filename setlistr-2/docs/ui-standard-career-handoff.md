# UI standard + Career Overview — handoff

Branch `design/ui-standard-career`, cut from `main` at `0bd17c4`. Pushed for Preview review; **merge held** pending approval. The candidate is the commit that adds this file.

The standard itself is in `docs/ui-standard.md` (patterns, loading rules, intentional exceptions, known deviations, route adoption checklist).

## Commits

| Commit | Change |
|---|---|
| `7aa6fa5` | **Shared standard and first batch.** `components/ui`: PageFrame, PageHeader, ViewSwitcher, Skeleton, LoadError, StatusLabel; `lib/estimate-copy.ts`; one skeleton shimmer in `globals.css` (the dashboard's). Submissions uses the segmented ViewSwitcher, with filter chips kept separate, plus the shared Skeleton, LoadError and StatusLabel. **Career Overview:** the approved refinement (map first and framed to its pins, Light overlay fixed, flat statistics, lists on the page, desktop two columns), loading and error states, copy corrections, honest signature-song ties, and the debut-date fix. |
| `8eaff97` | Docs only. AppShell owns safe areas on framed routes; full-screen capture (`/app/live/[id]`) owns its own documented handling. |
| `377d798` | **Dashboard: stale responses dropped across workspace switches.** A generation guard on every load path; data tagged with its workspace; skeleton until it matches. |
| `d602e03` | **Career map: attribution kept legible.** Light scrim over the bottom strip, caption above it, Mapbox logo kept in the image, "© Mapbox © OpenStreetMap" drawn inside the card padding (`attribution=false` on the image request). |

**Not changed:** queries and data scopes, destinations, permissions, count definitions (Career 29 vs dashboard 27), the lifetime estimate's place, SQL/migrations, Auth, native/Capacitor configuration, capture behaviour.

## Checks

- **Type-check and build:** `npx tsc --noEmit` passes, and `next build` passes on `d602e03`'s code.
- **Script suites:** mobile-layout-invariants 126 (12 new for the standard), filing-status 39, filing-deadline-label 21, submissions-nav-counts 22, record-summary 22, appearance 75, workspace-boundary 66, viewer-write-containment 465.
- **Browser checks** (Playwright, local `next dev`, local Supabase, seeded test accounts; harnesses kept outside the repo):
  - **Career (38):** phone and 1280 in both themes; loading → ready with the map moving 0px; page error → retry; song-debuts section error → in-place retry; workspace switching both ways plus a rapid switch; delegated failure → retry; 320px and 130% text; contrast. Run with the Mapbox token blanked, which exercises the fallback.
  - **Career real map (12), token in the temporary server's environment only:**
    - phone and desktop, both themes: real Mapbox image, framed to the pins, legible caption and attribution
    - the pins image fails → the plain map shows
    - every map image fails → "Map preview unavailable" in the reserved space, rest of the page loaded
    - the map is reachable again → the framed map returns
  - **Dashboard workspace switching (6):**
    - Delayed artist success or failure after switching back to one's own workspace doesn't land.
    - A delayed own-workspace response after switching back to the artist doesn't land.
    - Staying on the new workspace shows the skeleton, then the right record or that artist's error; Try again recovers.
    - The same scenarios failed 4 of 6 before the fix.
  - **Submissions on the shared components:** loading 27, delegated 15, rows 72, desktop 56.
- **Production request trace for Career** (150ms added latency): no duplicate requests, three round trips, ready in about 830ms. Requests unchanged.

## Outstanding issues (product)

These are tracked in `docs/ui-standard.md` → Known deviations.

- **Career:** counts imported shows (29) where the dashboard and full map count captured shows (27). Count alignment is a separate decision.
- **Career map-card geocoding:** up to 6 city lookups run one after another. A candidate improvement; untraced, so unchanged.
- **Submissions:** 16px phone gutter, its own container and hand-built headers; the History banner still uses the old disclaimer wording.
- **Dashboard:** recent rows say "Completed" where Submissions uses filing statuses.
- **My Songs tab:** keeps its previous internal layout.
- **Full map on phones:** opens zoomed out to a globe instead of fitting the cities.

## Test-environment limitations

- **Missing local columns:** the local database lacks some production columns (`profiles.legal_name / ipi_number / publisher_name`; `performances_visible.captured_by_name / photo_url / submitted_at`). The browser checks supplied them in responses.
- **Mapbox token scope:** the token was used only in temporary local servers' environments for the map checks; it was never written to the repo or printed. Broader browser checks ran with it blanked, so their screenshots show the fallback card.
- **Not tested on real devices:** larger text was approximated with CSS zoom, not iOS Dynamic Type. No installed-app (Capacitor) check.
- **Dev-only doubles:** duplicate requests seen in `next dev` come from React Strict Mode's double effects; the production trace shows none.

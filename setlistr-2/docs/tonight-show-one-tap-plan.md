# Tonight's show, one tap: prototype and implementation-ready plan

*Proposal, 2026-10-28, based on production `main` `039871e`.* Nothing here is implemented in the app. There's no SQL, migration, production read or deployment.

- **Prototype:** https://claude.ai/artifact/Ea9tFbasQMdb96xaTvSsur. It's a click-through of real app-shell screens from a local build of `main`, with mocked scheduled shows on the disposable stack, and Start simulated.
- **Reference code:** the proposed eligibility rule, the shared components and the unit tests are in [tonight-show-one-tap/](tonight-show-one-tap/). It's reference only, not wired into the app.
- **Reconciliation:** see [product-strategy-reconciliation](product-strategy-reconciliation.md).

## Why (Matt Woodson's feedback, 2026-10-26)

**The manager prepares once.** Schedule or spreadsheet import (shipped) books the tour.

**The crew uses that preparation with minimal effort.** Today the most visible capture entry ignores it:
- **The gold button** asks "Where tonight?" and for the venue to be typed, then creates a **new, unlinked** show.
- **The Dashboard's Tonight row** comes only from Bandsintown and does the same.
- **The linked Start** lives three screens away on Schedule, the only path that uses the booking.

**Capture coverage becomes trustworthy.** Every capture started this way is linked to its booking, so "No capture linked" and possible duplicates stop being created by normal use.

## Behaviour

**Entries:**
- **Dashboard:** the existing Tonight row.
- **Gold capture button:** the first screen of New show.

Both use the same data, words and actions.

| Case | Dashboard | Gold button (first screen) | Taps until recording |
|---|---|---|---|
| **One eligible show** | Row: "Scheduled · Today" / **Mohawk** / "8:00 PM · Austin · Start capture" | "Where tonight?" / "Scheduled for {artist}." / card: venue, local time, city, "Added by…" or "Imported from…", **Start capture**; then **A different show** | Dashboard: **row → OK = 2**. Gold: **button → Start capture → OK = 3**. |
| **Several eligible shows** | Row: "2 shows · choose one to start", listing each venue and time; opens the gold-button screen | One card per show, each with its own Start capture. **Never chosen silently.** | Row → Start capture → OK = 3 |
| **Date-only booking today** | Row: "Add a start time to start capture" → Schedule (existing "Add a start time") | Card with **Add a start time** (no Start) | Time set first; **no second show is created** |
| **After midnight** (an 11:30 PM show at 12:15 AM) | "Scheduled · Yesterday" / 11:30 PM | Same | 2 / 3 |
| **Show in another zone** | Time in the show's zone, with the abbreviation when it differs from the device's ("8:00 PM EDT") | Same | 2 / 3 |
| **Capture already in progress** | The existing "Show in progress · Tap to continue capture" comes first; **no Tonight start** (the existing rule) | The same in-progress row, then "A different show" | Rejoin: 1 |
| **A teammate starts first** (screen was open) | Start → OK → existing message "This show was just started by someone else." → refresh → in-progress row | Same message on the screen; the show drops out | No duplicate (`ALREADY_STARTED_BY_OTHER`) |
| **Cancelled / completed / imported listing / revoked access** | Never listed: the schedule list returns only `scheduled`, through RLS. If it changes while open: existing message, then refresh. | Same; "A different show" remains | — |
| **Viewer** | No row (existing `canCapture`); Coming up still shows the booking as information | No gold button (existing) | — |
| **Nothing eligible** | Unchanged (the Bandsintown row when there's a listing today) | **Unchanged** first screen: Start Live Capture / Upload a Recording | Unchanged |
| **"A different show"** | — | Opens today's unchanged choice and manual setup | Unchanged |

**Where recording starts:**
- **A Start tap doesn't record.** It opens the **existing confirmation**, which names the artist, venue, day, time and zone, and says "This starts the show early…" or "This starts the show now."
- **OK starts the show** through the existing linked operation. It opens `/app/live/{id}?autostart=1`, and the live page **starts listening by itself**, after the microphone prompt on first use.

**Eligibility** (`tonightShows`, pure; 13 unit tests pass in the prototype):
- **Input:** `GET /api/shows/schedule` for the selected workspace. It returns `status 'scheduled'` only, through RLS, so revoked access returns nothing.
- **A timed show is eligible when any of these holds:**
  - its **own local date** (`scheduled_at` in `timezone`) is today **in that zone**;
  - it started up to **6 hours** ago (the Dashboard's existing live window);
  - it starts within **12 hours**.
- **A date-only booking** (`local_date`) is eligible on its own local date as **needs a start time**.
- **Order:** by start; date-only after timed, using the existing `compareScheduled`.
- **The viewer's device date is never used.**

**Freshness:** reload on focus/visibility change and every 60 seconds while the screen is open. Re-evaluate eligibility against the clock each minute, which handles midnight.

**Concurrency and permission:** entirely the existing `start_scheduled_show`. It locks the row, re-checks `can_write_for`, and refuses cancelled, completed, listed and no-time shows. A retry by the same person rejoins; a different person gets "started by other".

## Affected components

| File | Change |
|---|---|
| `lib/tonightShows.ts` (new) | The eligibility rule (as in the reference folder) |
| `components/scheduling/TonightShows.tsx` (new) | `TonightBand` (Dashboard row) and `TonightLead` (gold-button first screen), plus a `useTonightShows(artistId)` hook. The hook loads `/api/shows/schedule` and `/api/shows/timeline?section=active`, refreshes on focus, visibility and every 60 s, and starts through `useShowActions`. |
| `components/scheduling/UpcomingShows.tsx` | `useShowActions`: an optional `onRefused` callback, so a refused start refreshes the list (today it only shows the error). Schedule's behaviour is unchanged. |
| `app/app/dashboard/page.tsx` | The Tonight row prefers an eligible scheduled show and falls back to the Bandsintown listing. Errors appear under the row. The live and review rows are unchanged and keep priority. |
| `app/app/show/new/page.tsx` | Step 1a leads with `TonightLead` when shows are eligible or a capture is in progress. "A different show" reveals today's unchanged step. The manual flow, setlist loading, upload and past-setlist reuse are untouched. |
| `app/api/shows/schedule/[id]/start/route.ts` | Map `SHOW_MISSING_VENUE` and `SHOW_OWNER_MISSING_NAME` to clear 409 messages, which are currently a generic 500. This is the only server change. |
| **Unchanged** | `start_scheduled_show` and all migrations, the live page, ScheduleTimeline, AppShell and the gold button's link, permissions, the import model |

**Optional, owner's choice:** one event, `show_started_from_schedule`, with `action_type` = `dashboard` | `capture_button` | `schedule`, to measure which entry is used.

## Acceptance criteria (disposable stack; production untouched)

1. **One show tonight:** a tour manager starts it from the Dashboard in **2 taps** and from the gold button in **3**.
   - The live page opens and listens.
   - `performances.show_id` = the booking, and `started_by`/`captured_by` are set as Schedule's Start sets them.
   - **No new `shows` row.**
2. **Two shows tonight:** both are listed, nothing auto-starts, and the chosen one is linked.
3. **Date-only booking today:** no Start is offered, "Add a start time" opens Schedule's form, and no show is created.
4. **Time zones and midnight:**
   - a show in another zone shows its own local time and abbreviation;
   - an 11:30 PM show is still offered at 12:15 AM;
   - a show that started more than 6 hours ago on a previous day is not.
5. **In-progress capture:** the rejoin row comes first and no Tonight Start is offered (both entries).
6. **Concurrency:** two sessions start the same show. One wins; the other sees "This show was just started by someone else", the list refreshes, and there's exactly one performance.
7. **Stale state:** a show cancelled while the screen is open is refused with the existing message, then disappears. A show past the window disappears after the minute tick.
8. **Permissions:** a Viewer sees no row and no gold button. A member whose access is revoked sees no booking on the next load, and a start attempt returns 403.
9. **"A different show"** reaches today's unchanged flow, which still creates an unlinked show exactly as now.
10. **Unchanged screens:**
    - nothing eligible: the Dashboard and gold button are identical to today, including the Bandsintown row;
    - Schedule's own Start is unchanged.
11. **390 px:** rows and buttons are at least 44 px tall; no overflow; Light and Dark.

## Focused regression plan

- **Unit tests:** `scripts/test-tonight-shows.ts`, 13 cases (zones, midnight carry-over, look-ahead, DST night, date-only, ordering, invalid zone). Already passing against the prototype rule.
- **End-to-end (Playwright, disposable stack, real start route):** criteria 1–10, using seeded bookings with fixed `scheduled_at` values relative to now.
- **Regression of shipped flows:**
  - Schedule Start and its date-only "Add a start time";
  - New show manual path to live;
  - upload path;
  - Dashboard live and review rows;
  - the Bandsintown Tonight row when nothing is scheduled;
  - the Viewer Dashboard;
  - `scripts/test-team-route-revocation-parity.ts` (start route permissions).
- **Build:** `npx tsc --noEmit`, `next build`, 390 px screenshots.
- **Installed iOS app** (owner, after release; not a production test now): the system confirmation dialog appears and OK reaches live capture.
- **Not repeated:** invitation, admission and R&D tests (unchanged code).

## Not in this slice

- the onboarding destination change;
- reminders and notifications;
- new roles;
- manager dashboard additions;
- the attribution migration (P2);
- separating capture from submission (P3);
- a duplicate-count production query (not needed now).

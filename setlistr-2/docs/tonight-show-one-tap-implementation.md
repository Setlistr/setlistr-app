# Tonight's show, one tap: implementation candidate

Branch `feature/tonight-show-one-tap`, from production `main` `039871e`. It implements the approved, corrected scope of [tonight-show-one-tap-plan](tonight-show-one-tap-plan.md) (the plan is on branch `docs/overhaul-roadmap`).

- **Production impact:** no SQL, migration, capture-page change or settings change. Not merged or deployed.
- **Testing:** on the disposable stack only.

**Matt Woodson's feedback, attached:** the manager books the tour once; on show night the crew starts that booking from where they already tap, and each capture is linked to it. Linking makes "which bookings have a capture" answerable. It doesn't prove a show was or wasn't missed.

## What changed

| File | Change |
|---|---|
| `lib/tonightShows.ts` (new) | **Eligibility** (a discoverability rule, not evidence that a show is happening): the show's own local today, or started ≤ 6 h ago, or starting ≤ 12 h ahead. A date-only booking is offered only on its own local today, as "Add a start time". **A missing or invalid time zone is never inferred from the phone:** the show isn't offered here and stays on Schedule.<br>**Labels, kept separate from eligibility:** "Scheduled · Today", "Scheduled · Tomorrow", or the show's actual local date ("Wed, Oct 28"). The venue's zone is shown when it differs from the device's, or the day isn't today. |
| `components/scheduling/TonightShows.tsx` (new) | `useTonightShows` loads bookings and any capture in progress. It reloads on focus, visibility and every minute, re-checks the clock (midnight), and drops responses after a workspace switch.<br>`TonightBand` is the Dashboard row; `TonightLead` is the gold button's first screen. `ActiveCaptureRow` shows "continue" for your own capture and plain status for anyone else's. |
| `components/scheduling/UpcomingShows.tsx` | `useShowActions`, the existing Start used by Schedule:<br>• the confirmation now gives the show's actual local date: "Wed, Oct 28 (today), 8:00 PM CDT";<br>• a refusal refreshes the list and keeps its message;<br>• one optional `scheduled_start` event is logged. |
| `app/app/dashboard/page.tsx` | A booked show tonight comes first in the existing Tonight row; the Bandsintown row is offered only when none is eligible.<br>The in-progress row offers "continue" only for your own capture. A refused start's message stays under the rows. |
| `app/app/show/new/page.tsx` | The first screen leads with tonight's booking(s), or the capture in progress.<br>**A different show** opens today's unchanged choice, with "← Back to tonight's scheduled show".<br>Links with an explicit intent (a listing's `venue`, `mode=upload`) skip the lead. |
| `components/scheduling/ScheduleTimeline.tsx` | The same "continue only your own capture" rule; Start records entry `schedule`. |
| `app/api/shows/timeline/route.ts` | The read-only `active` section adds `own`, `by` and `byName`. The capturer is `started_by ?? captured_by ?? artist`. |
| `app/api/shows/schedule/[id]/start/route.ts` | **Preview lock:** 403 `preview_disabled` on any non-production host, before any read or write.<br>Clear messages for `SHOW_MISSING_VENUE` and `SHOW_OWNER_MISSING_NAME` (previously a generic 500). |
| `lib/previewWrites.ts` (new) | The fail-closed host rule, shared by the route and the client telemetry |
| `lib/telemetry.ts` | Adds `scheduled_start` with `action_type` `<entry>.<outcome>`:<br>• entry: `dashboard`, `capture_button` or `schedule`;<br>• outcome: `started`, `rejoined`, `refused` or `failed`.<br>It carries ids only, no venue names. Never awaited; skipped on Preview; a dismissed confirmation logs nothing. |

**Unchanged:**
- `start_scheduled_show` and all migrations;
- the live capture page;
- AppShell and the gold button's link;
- permissions and the import model;
- the manual New show flow and recording upload.

## Your corrections, and how each is met

1. **Confirmation:** the existing system confirmation is reused. It names the selected artist, venue, actual local date and time with zone, and early-start versus "starts the show now". Dismissing it sends nothing and creates nothing (tested). **Installed-app behaviour is not verified.** That needs a device check.
2. **Eligibility and labels:** as above. A previous-day show shows its real local date. Tested with a real zone just past local midnight: "Scheduled · Wed, Oct 28 · 11:40 PM GMT+10", and the confirmation says "Wed, Oct 28 (yesterday)".
3. **Active capture:** "continue" is offered only to the person whose capture it is, on the Dashboard, New show and Schedule. Everyone else sees "Being captured by {name}" as status, with no action.
   - **Evidence:**
     - every current live-capture path records its starter: the start operation always sets `started_by`; both New show pages set `captured_by` for a team member;
     - an owner's own capture leaves both empty.
   - **Limitation:**
     - nothing records *which device* is listening (`capture_sessions` has no user or device);
     - two devices signed in as the same person can both rejoin that person's capture;
     - any older capture that predates `captured_by` would read as the artist's. These fall outside the 6-hour live window.

   No live-page, database or capture change was made.
4. **Existing paths:**
   - "A different show" is a full-width button with a hint ("Capture somewhere else, or upload a recording"), and a way back to the booking;
   - it never changes the booking;
   - the manual and upload paths are unchanged (tested).

   For cancelled, completed, concurrently started and revoked cases, the existing message stays visible after refresh, with no duplicate.
5. **Measurement:** one event through the existing telemetry. Entry and outcome only; it never blocks Start. Tested with telemetry blocked: Start still reached live capture.

## Test results (disposable stack, local build of this branch)

| Suite | Result |
|---|---|
| `scripts/test-tonight-shows.ts`: eligibility, invalid/missing zone, date-only, labels, confirmation date | **23/23** |
| `tonight-e2e.js`: real start route, Playwright, browser in America/Chicago | **49/49** |
| `tonight-prevday.js`: a real zone just past local midnight | **3/3** |
| `scripts/test-team-route-revocation-parity.ts`: start route permissions | **61 passed, 0 failed** |
| `npx tsc --noEmit`, `next build` | pass |

**What `tonight-e2e.js` covers:**

| Area | Checks |
|---|---|
| **1. One show** | Dashboard row; the confirmation's wording; dismiss creates nothing; OK goes to `/app/live/…?autostart=1`, linked (`show_id`, `started_by` and `captured_by` = the tour manager); no extra show; event `dashboard.started` |
| **2. Gold button** | Lead names the artist; confirmation wording; 3 taps; linked; `capture_button.started` |
| **3. Two shows** | A choice, not a start; the chosen show is the one linked |
| **4. Date-only booking** | "Add a start time" on both entries; no show or performance created |
| **5. Time zones** | The venue's zone shown for a New York show; an invalid zone is not offered |
| **6. Concurrency** | A stale screen refused with "This show was just started by someone else", kept after refresh. The teammate's capture is status only for the manager and for the artist; the capturer can continue. Simultaneous starts give 200/409 and one performance. A same-starter retry gives no duplicate. Telemetry: `dashboard.started`, `capture_button.refused`. |
| **7. Recovery** | Cancelled or completed while open: message kept after refresh, no Start, "A different show" remains, nothing created. Telemetry blocked: Start unaffected. |
| **8. Permissions** | Viewer: no row, no gold button, direct start 403. Revoked while open: 403, nothing created; the booking list is empty on refresh. |
| **9. Workspace switching** | Switching in place, the row follows the selected artist, and the confirmation names that artist |
| **10. Existing paths** | "A different show" (choice plus a way back; booking untouched); the manual venue step; the upload link and page; Schedule Start (`schedule.started`); nothing booked gives today's screens |
| **11. Preview lock** | The same build with `SETLISTR_START_PREVIEW=1` returns 403 `preview_disabled`; nothing written |

**Test-fixture note:** bookings are seeded by SQL on the disposable database. Cleanup, and the two simulated server-side state changes, run with triggers suspended for that batch only, and touch only the run's own test artists. Date-only bookings are seeded under a real import batch. The app's own writes always go through every trigger.

**Screens** (`docs/tonight-show-one-tap-impl/`, real build):
- `phone-{dark,light}-{dashboard,gold}.jpg` and `desktop-{dark,light}-{dashboard,gold}.jpg`;
- states: two shows, teammate capturing, teammate started first, cancelled, previous day, zones.

## Finishing points (after visual review, 2026-10-28)

1. **No repeated booking under Coming up.** When the Tonight row features a booking, Coming up shows the next *distinct* booking (Schedule's own "next" rule), or leaves that item out when there is none. A Viewer, who sees no Tonight row, sees Coming up unchanged.
2. **The multiple-show summary** wraps onto at most two lines, then ends in an ellipsis. Long venue names break inside the row.
   - The Dashboard's row column is now `minmax(0, 1fr)`, so no row widens past a narrow screen. Before this, at 320 px with larger text, a row's long title widened the column and the Dashboard clipped it on the right. That also applied to the existing in-progress and review rows.
3. **"A different show" and its hint are reachable** above the bottom bar, including its raised capture button, once scrolled to the end. No change was needed: the app frame already reserves the space.

**Focused layout checks** (`tonight-layout.js`; results in `layout-results.json`):
- **"Larger text"** means browser zoom, which shrinks the CSS viewport, because these pages size text in px. So it's tested as 320 px at 130% (246 px) and 390 px at 150% (260 px).
- **Result: 11/11 pass.**

| Check | Result |
|---|---|
| Featured-only booking | Shown once; Coming up item omitted |
| Featured plus a later booking | Coming up shows the later one |
| Viewer | Coming up unchanged |
| Multi row at 320 px, 246 px (320 @ 130%), 390 px, 260 px (390 @ 150%) | No horizontal overflow; ≤ 2 summary lines; inside the screen |
| Gold-button screen scrolled to the end, at the same four sizes | Button and hint bottoms above the bar's top. At 320 px: hint 448 px, bar 490 px; at 246 px: 317 / 359. |

**Behaviour after these changes:**
- the end-to-end suite rerun on the finished build: **49/49**, including the previous-day case live (Europe/Moscow: "Scheduled · Wed, Oct 28 · 11:00 PM GMT+3");
- the previous-day check: 3/3, with the harness corrected to pick a zone where 2 hours ago really is the previous local day. An earlier run picked a zone at 3:27 AM, where "Today" was right; that failure was the harness, not the app.
- unit tests 23/23; type check and build pass.

**Screens:** `layout-*.jpg`.

## Preview

- On a Vercel Preview, which uses production data, **the start route refuses before any read or write**, and the client skips the telemetry insert, by host, fail-closed.
- The new rows and screens can be viewed, but Start shows "Starting shows is turned off on Preview deployments. Nothing was started."
- **No interactive production write tests.**

## Not in this slice

- the onboarding destination change;
- the manager follow-up;
- reminders;
- new roles;
- live-page changes;
- a device or session ownership record.

**Device check (after any release, owner):** in the installed iOS app, the system confirmation appears and OK reaches live capture.

# Schedule timeline and show identity (Preview slice)

**Approved** for Preview implementation on 2026-10-22, with corrections, from prototype `E4Q3vjmZpsf4gnXQP8dJqL`. Production is unchanged (`a10b545`).

## What this slice does, and doesn't

- **It does:** improve navigation on `/app/schedule`, showing what's next and what already happened, newest first. Records Setlistr stored as linked are grouped, and **possible duplicates** are shown for a person to check.
- **It doesn't:**
  - repair historical records;
  - merge, hide, reclassify or backfill anything;
  - prevent duplicate ingestion;
  - change Dashboard, Career, History or Proof counts.

  Preventing duplicate ingestion needs future write paths to adopt reviewed identity rules.

## Composition

1. **Header:** "Schedule", the artist, and "+ Add a show" for the owner and write-capable roles.
2. **A capture in progress, when there is one:** the Dashboard's band and rule (live or pending, started within 6 hours).
   - It links to live capture only for people who can capture, the same check as Start.
   - The capture page has no read-only mode, so a Viewer sees the band as plain status ("Being captured by the artist or their team"), with no link and no capture controls. Permissions aren't broadened.
3. **The next show:** today's or the next upcoming one, judged on each show's own clock (`isUpcomingInZone`, as the Dashboard's Next Show does).
   - Its button reads "Start early" or "Start Capture", with the same confirmation, route and navigation as before.
   - Edit and Cancel are in the same menu.
4. **Upcoming:** the remaining scheduled shows, each with the same Edit and Cancel menu. On phones the time sits under the venue.
5. **Earlier:** history, newest first, grouped by month, 25 at a time ("Show 25 more"). It loads separately and never delays the sections above.
   - An error shows in place ("Past shows didn't load. Upcoming shows aren't affected.").
   - Rows open to show their details.
6. **Roadmap line:** bulk import, calendar sync and tour-date listings, with no controls.

Viewers see everything except Add, Start and the show menus. The server enforces the same permissions as before.

## Identity rules (`lib/shows/identity.ts`, `lib/shows/timeline.ts`)

- **Grouping:** only a stored `performances.show_id` groups records. A show with several linked captures keeps every one, and its row reads "N captures".
- **Possible duplicates** are pairs, judged one at a time, with no transitive grouping. A pair needs:
  - **The same venue.** That means the same venue id, or the same normalised name (case, accents, punctuation, a leading "The") in a compatible place: same city, and no conflicting country. Same-named venues in different cities or countries never match, and festival stages with different names never match. If one record has no city, the pair is still possible, and the reason says so.
  - **And one of these timing conditions:**
    - same local date, with start times within two hours;
    - same date, with at least one start time unknown;
    - start times within two hours across midnight, both records having a real start time and a reliable time zone.
- **Adjacent dates are compared only for a midnight crossing** established by two real start times, each read in a known time zone. Missing time-zone data never widens matching to the previous or next date. Records without a recorded zone are compared on their stored date only.
- **The two-hour window narrows the search only.** Records farther apart aren't flagged, and that isn't a finding that they're separate.
- **The wording is neutral:** "Possible duplicate", with the specific reason and the limit shown when the row is opened. Both records stay listed.

## Dates, times and zones

- **Ordering and matching never use the viewer's zone.**
- **The zone used:** a record's times are read in its show's own time zone. Failing that, the zone at the venue's stored coordinates.
- **Dates:**
  - Date-only values, including midnight-UTC dates, are kept as stored.
  - Timestamps are read in that zone. With no zone, the stored value is kept and marked "Time zone not recorded", and no time is shown.
- **What counts as a start time:** `started_at`, unless it's a date stored at midnight UTC.
- **Order:** newest local date first, then start time, then a unique entry key as the tie-breaker. The cursor encodes all three, so many records on one date page without gaps or repeats. Pairs are found across the whole history, so a pair split across a page edge is found on both pages.

## Labels: source, method and state are distinct

- **State, one word:**
  - for captures, the Dashboard's existing labels: Live, Needs review, Completed, Exported, "Marked submitted";
  - for scheduled shows: "No capture linked" for a past scheduled show with no capture, and "Cancelled";
  - imports have no workflow state.
- **Source line:**
  - "Imported from setlist.fm";
  - "Scheduled" means scheduling provenance, from explicit stored evidence only: the scheduling actor stored by the scheduling route, or a status only the scheduling flow writes (scheduled, cancelled). It's never inferred from timing, so a show created long before its capture without that evidence doesn't read "Scheduled". Without evidence, the source line omits it.
  - the capture method by Proof's evidence rules ("recognised live", "from a recording", "entered by hand", "method not recorded"). It's never assumed; a legacy capture without evidence reads "Method not recorded".
- **"Added by":** personal attribution, kept separate from provenance.
  - In Earlier, it's shown only when a teammate's name is stored, and otherwise omitted.
  - Upcoming rows keep Schedule's existing wording, including "Added by a teammate" when another person scheduled the show but no name is stored.
- **Cancelled shows still ahead** are left out, as Schedule always did. A cancelled show appears in history once its date passes. This limited visibility is recorded as a later UX decision, unchanged in this slice.

## Files

| File | Change |
|---|---|
| `lib/shows/identity.ts` | New: the pure pairwise matcher. |
| `lib/shows/timeline.ts` | New: the pure entry builder, dates, ordering, cursor and wording. |
| `app/api/shows/timeline/route.ts` | New, GET only. Authorised like Proof (owner, or an accepted, non-revoked delegate of any role); reads with the service role; returns summaries only. `section=active` and `section=history`. |
| `components/scheduling/ScheduleTimeline.tsx` | New: the page composition. |
| `components/scheduling/UpcomingShows.tsx` | Refactor only. The type, helpers, form and actions menu are exported, and Start and Cancel move unchanged into `useShowActions`, which `UpcomingShows` itself uses. The Manager pages and the Dashboard's Next Show are unchanged. |
| `app/app/schedule/page.tsx` | Uses the timeline inside the standard page frame, keyed by workspace. |
| `scripts/test-show-identity.ts` | New: 42 unit tests. |

**Not touched:**
- SQL, migrations and RLS;
- capture, recognition, upload and the save handlers;
- `/api/shows/schedule` and the Start and Cancel database functions;
- Dashboard, Career, History and Proof counting.

## Verification (disposable database, production build)

- **Unit tests:** 47/0.
- **End-to-end:** 49/0 (`sched-e2e.js`).
  - **Access:** owner, manager and Viewer get 200; revoked, pending and unrelated users get 403; signed out gets 401; a tampered cursor gets 400.
  - **History:** 50 entries over two pages with no gaps or repeats, including 40 records on one date.
  - **Grouping and states:** a linked scheduled show, two captures on one show, "No capture linked", cancelled and imported.
  - **Possible duplicates and dates:**
    - a capture with a known zone paired with a same-night date-only upload;
    - a capture with no recorded zone and a same-night upload left unpaired, with their stored dates a day apart;
    - same-named venues in Chicago and Sydney not paired.
  - **Provenance:** a delayed start with no stored scheduling evidence doesn't read "Scheduled"; stored evidence does.
  - **Order and loading:** the active capture leads; history never delays the next show; a history failure stays local.
  - **Actions:**
    - Viewers get no actions, and the live band is status only, with no link to capture anywhere on the page;
    - a manager's band links to capture;
    - Add opens the existing form;
    - Cancel and "Start early" work as before.
  - **Workspace switching:** a late response is dropped.
  - **Regressions:** Manager Schedule and the Dashboard's Next Show are unchanged.
  - **Layout:** 320, 390 and 1280 px in dark and light, with no sideways scroll.

## Recorded for later, not changed here

- **Dashboard live band for Viewers.** The Dashboard's existing band links every role, Viewers included, to `/app/live/[id]`. That page has no read-only mode. Schedule doesn't repeat this. The Dashboard and capture page are unchanged in this slice; this needs its own reviewed fix.
- **Future cancelled shows** aren't shown anywhere until their date passes. That's a UX decision for later.

## Open data-model questions

1. **The `performance_date` type.** `supabase-schema.sql` declares `DATE`; both local databases have `timestamp with time zone`; production isn't verified. The timeline keeps stored values and doesn't depend on the answer. If it's needed, this read-only query settles it:

   `select data_type from information_schema.columns where table_schema = 'public' and table_name = 'performances' and column_name = 'performance_date';`

   It says whether "New show" stores an instant or a UTC calendar date. Neither answer by itself explains the historical same-day clusters; that needs the audit proposal's queries.
2. **Saved identity decisions** ("same show", "different shows") need a schema proposal. That's a later slice.
3. **Rescheduling history:** edits overwrite `scheduled_at`, and cancel-and-recreate has no link between the two shows.

# Spreadsheet import for Schedule (proposal)

**Status: proposal, awaiting approval.** Nothing is implemented. No SQL has run and nothing is deployed. Production is `3ce4833`.

- Prototype: https://claude.ai/artifact/W2rvPMGeQ3csXGfzDiAPhW (revision 2, example data). It shows live frames of the built app: the released Schedule beside the proposed entry and review, at phone and desktop widths, in Dark and Light.
- Schema proposal: `supabase/proposals/show_imports.sql` (not a migration, not applied).

## What it does, and doesn't

- **It does:** let the artist, or a teammate who can edit, add many past and upcoming shows from an ordinary spreadsheet.
  - It reads any layout with one show per row, a date and a venue.
  - The person checks how each column and the dates were read.
  - They settle missing details and decide on possible duplicates.
  - They confirm the import explicitly. Nothing is saved before that.
- **It doesn't:**
  - create performances, setlists or songs;
  - mark anything as performed;
  - change Proof, Career, History, Dashboard counts, royalty estimates or submissions;
  - merge, link, hide or edit existing records;
  - repair historical data.

**A past date doesn't establish that a show happened.** Past rows become *listed* shows, which appear in Earlier as "No capture linked". Upcoming rows become ordinary scheduled shows.

## Flow (as in the prototype, revision 2)

The prototype is built from the app's own code in a scratch copy (see "Prototype build" below). It sits inside the released AppShell and Schedule, with the artist workspace in the header throughout.

1. **Entry:** "Import shows" is a text action beside "+ Add a show" in Schedule's header, for the owner and write-capable roles.
   - Both actions get a 44px hit area; the released "+ Add a show" is 36px.
   - Viewers don't see it. At the page's address they get "Only <artist> and teammates who can edit can import shows", and the routes refuse them.
   - The roadmap line drops "importing past shows in bulk".
2. **Choose a file** (`/app/schedule/import`):
   - One sentence, then the primary "Choose a spreadsheet" button.
   - Accepted: `.xlsx`, `.csv`, `.tsv`. Google Sheets and Numbers files are downloaded as one of those first.
   - Limits: 5 MB, 500 data rows, one sheet per import.
   - Parsing happens in the browser. The file isn't uploaded or stored. Only the confirmed rows' mapped fields are sent.
3. **Review what Setlistr understood:**
   - **One line of what was read:** the row count, the title rows left out, and the date order, with an example ("Dates are day first, so 03/04/2025 is Apr 3, 2025"). "Date order", "Another file" and "Columns" are text actions on that line.
   - **Column mapping** opens only on request, or by itself when no date or venue column is found. Each column shows its heading, example values and a field select. "Don't import" columns are never sent or stored.
   - **Date order:** when the column settles it (a part over 12, or a four-digit year), it's applied and stated. When nothing settles it, "First, how are dates written?" comes before everything else, with no default. The rows wait under "Waiting for the date order".
   - **Rows** use Schedule's own row styles. They appear in this order:
     1. Needs a decision (first);
     2. Upcoming;
     3. Earlier, by month with the timeline's month headings, marked "No capture linked";
     4. Not imported.
     - Each row is one button. Its right column shows the one open question ("Which year?", "Time zone needed", "Venue needed"), or the timeline's "Possible duplicate" flag, or "No capture linked".
     - Opening a row shows the decision, then what the sheet said (row number and cells), what it was read as, its zone and where the zone came from, what it becomes, and "Leave this row out".
     - A settled row moves to its section.
   - **Continuing:** "Continue with N shows" stays disabled until nothing needs a decision. "Leave them out" excludes the open rows in one step.
4. **Confirm:**
   - **The question:** "Import N shows?"
   - **One list:**
     - Upcoming, with what can be done to them;
     - Earlier, saying they aren't counted as performed and that Proof, Career, royalty estimates and submissions don't change;
     - Not imported;
     - Added by;
     - Kept with each show: the file name and row, the columns not saved, and the new venues.
   - **Actions:** "Import N shows", and "Back to review".
5. **After:**
   - Schedule shows one line, "N shows imported from <file>. Earlier ones are marked "No capture linked"", with "Undo import".
   - The new shows appear in Upcoming and Earlier through the existing routes.
   - An imported Earlier row says where it came from when opened.
   - Undo removes the batch's shows that are still untouched: not edited, not started, no capture linked. Every other row is kept and listed.

## Row rules

| Situation | Treatment |
|---|---|
| No date, or "TBC" / "TBA" | Won't import. Add it later by hand. |
| A date that's invalid in the chosen order | Needs a detail: change the order or skip. |
| No year ("12 Apr") | Needs a detail: choose the year (choices are shown with their weekday). Never guessed. |
| A range ("18-20/07/2025") | Needs a detail: pick the day, or skip. One show per row. |
| Two-digit year | Read as 20YY, with a note on the row. |
| Excel date cell | Read from the cell's calendar date (UTC parts of the serial). Handles the 1900 and 1904 date systems. Never shifted by the device's zone. |
| No venue, or "TBA" | Needs a detail: type a venue, or skip. Start already requires a venue. |
| Upcoming, no zone | Needs a detail: choose a zone. Schedule decides "today" and Start's date on the show's own clock. |
| Past, a time, no zone | Needs a detail: choose a zone, or keep the date only. A time is never stored without a zone. |
| Past, date only, no zone | Ready. The date is kept as written and marked "Time zone not recorded", as the timeline does now. |
| A time that's missing or skipped by DST in its zone | Needs a detail: pick one of the two times, or change it. Uses `zonedLocalTimeToUtc` (as Add a show does). This case isn't in the prototype. |
| Several times ("Doors 7 / Show 8") | Needs a detail: pick the start time. |
| Possible duplicate | Needs a decision: "Skip this row" or "Import as a separate show". No default. Never merged or linked. |

**Zones, in order:**
1. a Time zone column, if it holds real IANA names (abbreviations like "EST" are refused and shown);
2. the zone at the coordinates of a venue already in this artist's records;
3. the country, only when it has a single zone;
4. otherwise the person chooses.

"Also use it for the other rows in <country>" is unchecked by default, because many countries have more than one zone. Choosing a zone is never inferred from a city name.

**Upcoming or earlier:**
- With a zone, a row is upcoming when its local date is on or after today in that zone, the same rule as `isUpcomingInZone`.
- With no zone, a row is earlier only if its date has ended everywhere. Otherwise it needs a zone.

## Possible duplicates (released identity rules, unchanged)

- **One matcher:** rows become `IdentityRecord`s (`r:<row>`) and go through `findCandidates` in `lib/shows/identity.ts` unchanged, together with:
  - the artist's history entries (`buildEntries`);
  - the artist's upcoming scheduled shows (Earlier excludes these, so they're added separately).
- **The rules carry over:**
  - same venue id or normalised name in a compatible place;
  - same local date with start times within two hours, or with a start time unknown;
  - a midnight crossing only with two real times in known zones.
  - Pairs are judged one at a time, never transitively.
- **Within the file:** a later row that pairs with an earlier one asks for the decision; the earlier row shows a note.
- **Earlier exact re-imports:** a row that pairs with a show from a previous spreadsheet import reads "From your import of <file> on <date>", on top of the usual reason.
- **Wording:** neutral, with the specific reason (the timeline's `VENUE_REASON` / `TIME_REASON`). Both records stay listed. A differently written venue name won't match, as now; that's a stated limit.

## Ownership, provenance and time

- **Ownership:** `shows.created_by` is the workspace artist. The RPC checks `can_write_for(artist)`. The owner lock and the write rules are unchanged.
- **Who added it:** `scheduled_by` / `scheduled_by_name` record the person importing, so the existing "Added by" wording works. They stay immutable.
- **Provenance:** `shows.import_batch_id` and `shows.source_row`. The batch records:
  - the file name, the sheet, and the file's SHA-256 (not its contents);
  - the column mapping (headings only), the date order;
  - the counts, who imported it, and when.
- **Source line:** "Imported from a spreadsheet" (plus "added by …" for a teammate). It's checked before the "Scheduled" provenance, so an imported show never reads "Scheduled in Setlistr".
- **Time:**
  - `local_date` holds the calendar date as written.
  - `scheduled_at` is the UTC instant only when a real time and zone exist, and is null otherwise.
  - `timezone` is a real IANA zone when known. Otherwise it's `'UTC'`, the existing "not recorded" convention that `isRealTimeZone` already treats as unknown, with no new meaning.
  - The viewer's zone is never used.

## Schema requirements (`supabase/proposals/show_imports.sql`)

1. **New table `show_import_batches`.**
   - Read: `can_act_for(artist_id)`.
   - No direct insert, update or delete; writes go only through the two functions.
2. **New columns on `shows`** (additive, nullable): `import_batch_id`, `source_row`, `local_date`.
   - Checks:
     - `import_batch_id` and `source_row` are set together;
     - a scheduled or listed row has `scheduled_at` or `local_date`.
3. **The status `listed`.** It's for imported past rows: they never appear in Upcoming or the Dashboard, and can't be started.
   - `/api/shows/schedule` already filters `status = 'scheduled'`, so the Dashboard's "past shows still marked scheduled" count isn't inflated.
   - The guard trigger allows schedule-field edits on `listed` rows, as on `scheduled`, and adds `local_date` to the locked fields.
   - `start_scheduled_show` refuses `listed` explicitly ("SHOW_NOT_STARTABLE"). It uses `local_date` for the performance date when `scheduled_at` is null, instead of falling back to `CURRENT_DATE`.
4. **`import_shows(p_batch jsonb, p_rows jsonb)`**, security definer, all or nothing.
   - **Guards:** authenticated; `can_write_for`; at most 500 rows; the batch id is client-generated, so a retry by the same person returns the existing result.
   - **Validation, per row:** a real date; a real zone where required; status is `scheduled` only for rows on or after today in their zone, otherwise `listed`.
   - **Venues:** a row either uses a venue id already referenced by this artist's records, or gets a new venue inserted.
5. **`undo_show_import(p_batch uuid)`.**
   - It deletes only untouched rows: status as inserted, `updated_at = created_at`, and no `performances.show_id` pointing at them.
   - It uses a transaction-local flag that the scheduled-delete trigger honours, and marks the batch undone.
   - It returns the rows it kept.

**Read-only production checks before the migration** (approval needed to run them; the queries are in the proposal file):
- `shows` columns and defaults: whether `created_at` exists, and the type of `timezone`;
- any status check constraint;
- the triggers on `shows`;
- the `venues` policies;
- the `performance_date` type, the open question from the timeline plan.

## App changes after approval

| File | Change |
|---|---|
| `lib/shows/import/parse.ts` (new, pure) | Sheet → rows: header detection, column guesses, readers for dates (numeric with order, ISO, Excel serial, month names, ranges, missing year, weekday prefixes) and times. |
| `lib/shows/import/review.ts` (new, pure) | Row issues, zone resolution, upcoming or earlier, identity records, and candidates via `findCandidates`. |
| `app/api/shows/import/check/route.ts` (new) | POST, read-only, write roles only. Returns the existing records that pair with the given rows, and venue matches, as summaries. It doesn't log row contents. |
| `app/api/shows/import/route.ts` (new) | POST commit. Recomputes candidates on fresh data; a pair the person didn't review returns 409 with those rows. Converts times with `zonedLocalTimeToUtc`, then calls `import_shows` with the cookie client. |
| `app/api/shows/import/[id]/route.ts` (new) | DELETE, calls `undo_show_import`. |
| `app/app/schedule/import/page.tsx`, `components/scheduling/import/*` (new) | The four steps, with inline styles. |
| `components/scheduling/ScheduleTimeline.tsx` | The import entry for `canManage`, the after-import banner, and New markers. |
| `lib/shows/timeline.ts` | `listed` maps to the no-capture kind; `local_date` is used when `scheduled_at` is null; the source line checks import first. |
| `lib/scheduleTime.ts`, `UpcomingShows.tsx`, the schedule edit route | Upcoming shows with a date but no time: "Time not set", sorted by date, edited as date-only. Only for rows that have `local_date`. |

| `components/scheduling/timelineStyles.ts` (new) | The timeline's `<style>` moved out verbatim, so the import rows use the same styles. `ScheduleTimeline` imports it, with no visual change. |
| `components/ui/controls.ts` (new) | Submit's released button, field and disclosure styles (`primaryBtn`, `secondaryBtn`, `textAction`, `inputStyle`, `labelStyle`, `sb-more`), moved verbatim so the import page doesn't copy them. Submit adopts it in the same change, with no visual change. |
| `components/scheduling/UpcomingShows.tsx` | Exports the existing `TimezoneCombobox`, with no other change. |

**Not touched:** capture, recognition, upload and the save handlers; `app/api/identify`; Proof, Career, History and Dashboard counting; the setlist.fm import.

**A new dependency needs approval.**
- Recommended: `papaparse` for CSV/TSV and `read-excel-file` for `.xlsx`, both loaded only on the import page.
- Not recommended: the `xlsx` npm package (0.18.5), which has known advisories; the fixed builds are published only outside npm.
- Legacy `.xls` would be refused with "Save it as .xlsx and try again".

## Prototype build (scratch copy, not the repo)

- **Where:** `scratchpad/proto-app`, a copy of the repo with the app routes removed. It's built with `next build` as a static export.
- **Unchanged from the release:**
  - AppShell, ActingAsProvider, WorkspaceRole, AccountMenu and AppearanceSync;
  - PageFrame, PageHeader and Skeleton;
  - `ScheduleTimeline` and `app/app/schedule/page.tsx` (in the "released" frame);
  - UpcomingShows;
  - `lib/scheduleTime`, `lib/timezoneLabels` and `lib/shows/identity`.
- **Mocked by webpack alias:** only `lib/supabase/client` (reads return example rows, every write is refused), `next/navigation` and `next/link` (move between prototype screens). `fetch` for `/api/team/managed-artists`, `/api/shows/schedule` and `/api/shows/timeline` returns example data in the released response shapes.
- **New in the proposal:**
  - the timeline's import entry, after-import line and roadmap wording;
  - the import page;
  - its pure reading module, which is simulated (two example sheets);
  - about 10 lines of page CSS (`.tl-head-acts`, the 44px header actions).
  - Everything else reuses the released styles listed above.
- **Checked locally with Playwright** (390px and 1280px, Dark and Light, Owner, Manager and Viewer):
  - no console errors;
  - no sideways scroll;
  - every new control is at least 44px.
  - The released controls that are smaller are listed below.

**Found in the released app while building this (not changed here):**
- **Earlier on phones:** past-year dates ("Aug 22, 2025") overflow the 70px date column and overlap the venue name. The import rows wrap their dates instead. The released timeline needs its own fix.
- **Under 44px:** "+ Add a show" (36px), the show actions menu button (31px), PageHeader's Back (36px) and `TimezoneCombobox`'s input (about 43px). The import page uses its own 44px "‹ Schedule" link instead of PageHeader's Back.

## Verification plan (disposable database only)

Preview uses production data, so there are no write tests there.

- **Unit tests:**
  - **Dates:** day, month and year order; invalid under one order; two-digit years; ranges; no year; Excel serials, including 60 (1900-02-29) and the 1904 system; month names; "TBC".
  - **Times:** 12 and 24 hours, "20h", "8.30pm", multiple times, DST gaps and overlaps.
  - **Zones and grouping:** zone order; upcoming or earlier around midnight in different zones.
  - **Matching:** candidates against history, against upcoming shows, and within the file.
- **End-to-end:**
  - **Access:** owner and manager can import; a Viewer, a revoked or pending delegate, and an unrelated user get 403 from the routes and the RPC; signed out gets 401.
  - **Commit:** a retry with the same batch id doesn't create twice; a duplicate added by a teammate between review and commit returns 409.
  - **Undo:** keeps rows that were edited or started.
  - **Labels:** "Imported from a spreadsheet", "No capture linked", "Added by".
  - **Counts:** Proof, Career, History and Dashboard are identical before and after an import of past shows.
  - **Dashboard:** the past-scheduled count is unchanged.
  - **Start:** a scheduled imported show starts with its `local_date`; a listed one is refused.
  - **Layout:** 320, 390 and 1280 px, dark and light.

## Order of work

1. Approval of this plan, the prototype and the dependency.
2. The read-only production checks, with approval.
3. Migration on the disposable database, then the pure modules and tests, the routes, and the page.
4. Release review. The production migration and the merge each need explicit approval. The migration is additive and inert, and goes first.

## Open questions

1. Should rows the person skipped be recorded in the batch (row numbers only), so a re-import can say "skipped last time"? The proposal records counts only.
2. Should multi-day festival ranges become one show per day in a later slice?
3. Linking an imported row to an existing capture ("same show") needs the saved identity decisions noted in the timeline plan. It's out of scope here.

# Spreadsheet import for Schedule: approval package

**Status: implemented locally and tested on the disposable stack; not released.**
- **Feature branch:** `feature/spreadsheet-import` (`2fd90a8`, local), built on the UI-defect candidate `5104622`.
- **Not done:** no production read or write, no SQL applied to production, no merge and no deployment. Production is `3ce4833`.
- The design was approved on 2026-10-24, with the corrections listed under "Implementation" below.

- **Review artifact:** https://claude.ai/artifact/W2rvPMGeQ3csXGfzDiAPhW (revision 3). It has screenshots of every state, captured from the built prototype, and the same decisions as this document.
- **Branches:**
  - `docs/spreadsheet-import-plan`: this document and `supabase/proposals/0028_*`;
  - `fix/schedule-phone-dates-touch-targets` (`5104622`, local, not pushed): the separate UI-defect candidate.

## Released to production (2026-10-26)

**Released:** PR #4, merged with a merge commit as `577dd3dfb35cc26064121666a7a026804e155cb4`.
- **Parents:** `3ce4833` (the previous production) and `5fc97e816bd158014ac5ab45071e5be9167f3eb3` (the approved candidate). Both were rechecked before merging.
- **Deployment:** Vercel production succeeded. The deployment is https://setlistr-e1t7o4eja-jesse-slacks-projects.vercel.app.
- **Includes:** the Schedule phone fix `5104622` and spreadsheet import. 0028 was already applied and was not run again; no SQL or environment changes came with the release.
- **Signed-out smoke checks (read-only):**
  - `/` and `/auth/login` return 200;
  - `/app/schedule`, `/app/schedule/import`, `/app/dashboard` and `/app/history` redirect (307) to sign-in;
  - the import routes, `/api/shows/schedule` and `/api/shows/timeline` return 401.
- **No production test imports.** The first import will be a real file the owner chooses.

**Rollback (app):** revert the merge through a PR, so GitHub → Vercel deploys `3ce4833`'s code:

    git checkout -b revert/spreadsheet-import origin/main
    git revert -m 1 577dd3dfb35cc26064121666a7a026804e155cb4
    git push -u origin revert/spreadsheet-import   # then open a PR and merge it

Alternatively, promote the previous production deployment in Vercel.
- Reverting the app **keeps imported data**, but the old UI puts it in the wrong place and labels it wrongly: date-only shows read "Date not recorded" or "Scheduled in Setlistr", and the Dashboard counts them as past.
- The schema rollback (`0028_show_imports.down.sql`) is refused while imported rows exist.

**Undo** removes only untouched shows from a batch. It keeps any show that has been edited, started or cancelled since the import, or that other records reference (a performance, capture, setlist, artist link or PRO report).

## Production SQL: 0028 applied (2026-10-26 17:57 UTC)

**Applied:** 0028 committed in production project `lelimetbogycrdnfxjok`, on owner approval. Exact file, SHA-256 `b21d2ec4…07faed`; applied atomically as `postgres`.
- **Pre-checks, all passed:**
  - the file hash;
  - zero scheduled shows without `scheduled_at`;
  - the seven function hashes;
  - no 0028 objects present.
- **Read-only verification, all passed:**
  - all 15 related functions identical to the tested ones;
  - the schema, constraints, triggers, status check and permissions as tested;
  - no imported or listed rows;
  - show counts unchanged;
  - the deployed app's Schedule queries return 200; signed-out smoke as expected.
- **Recorded:** `supabase/migrations/0028_show_imports.sql` and `0028_show_imports.APPLIED.md` on `feature/spreadsheet-import` (local commit). Do not run it again.
- **Still on hold:** production app code stays at `3ce4833`. The UI fix and the import feature are held for separate approval.

## Release candidate (2026-10-26)

- **Candidate:** `feature/spreadsheet-import` at `f63229db29b9e5ba4c385aea040459f4637c5346`, pushed and not merged.
- **Migration:** `supabase/proposals/0028_show_imports.sql`, identical in the candidate.
  - md5 `202b7bab110565987a9fc07fa32bddcf`
  - SHA-256 `b21d2ec42f787f54ee3bbb90fd11ad091b508f48ca40f9810536cf481407faed`
  - Down migration SHA-256 `245368565e728b13748919ae41eae438dd25708ce7c6a14b80fa9c6e31a0ad65`
- **Preview:** https://setlistr-5rm08avhe-jesse-slacks-projects.vercel.app (deployment success, 2026-10-26 13:47 UTC). It sits behind Vercel sign-in. Import and Undo are refused there by host. Existing Schedule actions on Preview write to production and are off limits.
- **Checks on exactly this app and SQL** (production build of `git archive f63229d`; disposable stack with the final 0028 and production's four-value status check):
  - SQL suite 72/72; races 8/8; Undo helper 8/8.
  - Import end-to-end 76/0; date-only → add a start time → start capture 8/0; Schedule 49/0.
  - Preview mode without 0028 17/0, and Schedule without 0028 49/0.
  - The deployed app (`3ce4833`) with 0028 applied: Schedule 49/0.
- **The Undo reference helper (`import_show_use_reason`):**
  - **Every schema:** it reads every foreign key that references `public.shows`, in any schema, from `pg_constraint`. Tested with a table in another schema.
  - **Quoting:** the table name comes from `regclass` output, which Postgres quotes and schema-qualifies. The column goes through `format('%I')`, and the show id is a bound parameter. Tested with a schema, table and column whose names contain spaces, quotes and semicolons.
  - **Who can call it:** `anon` and `authenticated` can't execute it; only Undo and the preview (both owned by `postgres`) call it.
  - **The preview (`show_import_usage`):** it returns only show ids and reason codes, never table names. It refuses anyone who can't see the artist's shows, and gives the same answer for an unknown batch, so it leaks nothing about other batches.
- **Access revocation:** `undo_show_import` (like `import_show_use_reason`) checks `can_write_for` with the caller's identity each time it runs. That reads the delegation as committed at that moment, so a teammate whose access was revoked before they press Undo is refused and nothing is removed (tested). A revocation committed while an Undo is already running takes effect from the next call, the same as every other write.

## Preview and production preflight (2026-10-26)

**Preview.**
- **Branch:** `feature/spreadsheet-import` at `f63229db29b9e5ba4c385aea040459f4637c5346` is pushed. Not merged; production is still `3ce4833`.
- **Writes are off on Preview, on the server, failing closed.**
  - Import and Undo writes are allowed only on `setlistr.ai`, `www.setlistr.ai` or a local host.
  - Any `*.vercel.app` host, and `VERCEL_ENV=preview`, gets 403 before any authentication or database call.
  - This doesn't rely on 0028 being absent.
- **What Preview shows:** the import review checks real files against labelled sample records ("Sample record ·"). A notice on every step says importing is off; Import is disabled; Recent imports and results aren't available.
- **Schedule reads on Preview:** they fall back to the pre-0028 columns. Writes never fall back.
- **Off limits on Preview:** existing Schedule actions write to production. That means "+ Add a show", Edit, Cancel, Start / Start early and "Add a start time", plus every other app write (capture, review, submit, team). Run no write tests there.

**Read-only production preflight.**
- **Method:** the Supabase Management API query endpoint with `read_only: true`, which runs as the pre-existing `supabase_read_only_user`. Every query ran with `transaction_read_only = on`.
- **No side effects found:** no role was created or refreshed, and no password was used.
- **Target:** project `lelimetbogycrdnfxjok` ("Setlistr's Project", matching the app's Supabase URL).
- **Material findings, and the SQL changes made for them:**
  1. **Production constrains `shows.status`** (`shows_status_check`: scheduled, live, completed, cancelled; the disposable stack didn't). 0028 now extends exactly that check with `listed`, and stops on any other status check. The down migration restores the four-value check.
  2. **Six tables reference `shows` in production**, not two: `capture_sessions` and `audio_captures` (SET NULL), and `show_artists` and `pro_reports` (CASCADE), alongside performances and setlists. Undo now checks every referencing table read from the catalogue each time. The rule lives in one function (`import_show_use_reason`), used by Undo and by the read-only result-page preview (`show_import_usage`), so the two can't disagree. A show referenced anywhere is kept ("linked to another record"). 0028 stops only on a multi-column reference.
  3. **`performances.performance_date` is `date` in production** (it's `timestamptz` locally). Start's use of `local_date` is compatible.
  4. **No other differences:**
     - the four replaced functions and the patch RPC match the tested bodies exactly (md5);
     - `can_write_for` and `can_act_for` match;
     - no name collisions; triggers as expected, none calling out;
     - no `listed` status in use;
     - PostgreSQL 17.6, with every feature 0028 uses.
- **Also added after review:** `start_scheduled_show` refuses a date-only booking with `SHOW_NEEDS_START_TIME`, so a start time is always required, including from old tabs and direct calls.

**Final 0028:** md5 `202b7bab110565987a9fc07fa32bddcf`. All the results below are for this file, on a disposable stack made production-like (the same four-value status check added first):
- SQL suite 72/72; races 8/8;
- round trip exact (down restores the production-like schema; up again);
- down refuses with imported rows present and changes nothing;
- import end-to-end 76/0; date-only → add a start time → start capture 8/0; Schedule end-to-end 49/0;
- Preview mode without 0028 17/0, and Schedule end-to-end without 0028 49/0 (feature build).

**Compatibility.**
- **The deployed app (`3ce4833`) with 0028 applied:** Schedule end-to-end passes 49/0. It reads no new column and writes no import field.
- **The deployed app with imported records present** (app-only rollback, or old tabs after release): no errors, and no data is lost. **Behaviour is not unchanged, though.** The old UI misplaces and mislabels imported rows:
  - Listings and date-only bookings appear under "Date not recorded", with "No date", labelled "Scheduled in Setlistr" instead of "Imported from a spreadsheet".
  - Date-only bookings disappear from Upcoming, and the Dashboard counts them as "past shows still marked scheduled".
  - A time kept as written isn't shown.
  - The old edit form can't prefill a date-only booking's date.
- **Old tabs:** they can't start a date-only booking (the database refuses). Their edit form would prefill such a booking with no usable date; the owner must type the date and time. Reloading fixes all of this.
- **The new app before 0028** (Preview, or a mistaken order): Schedule works through the read fallback; import refuses.

**Permission and races (two real sessions each):**
- **Start, edit or cancel commits first:** Undo waits on the row lock and then keeps the show (capture linked / edited / cancelled).
- **Undo commits first:** start, edit or cancel finds no show. No orphan capture and nothing recreated.
- **Revoked teammate:** a teammate whose access is revoked after the import can neither Undo nor import. Permission is checked when the function runs.

**Rollback with imported records present.**
- **App only (recommended):** revert the merge. 0028 stays, with its changes to the start, guard and constraint rules (section 10), which the old app passes (tested). Imported rows and their provenance are preserved, but the old UI misplaces and mislabels them as described above until the feature is restored.
- **Schema removal:** the down migration refuses while any imported row exists (tested; atomic, no change). To remove the schema:
  1. Undo each import, which removes untouched rows.
  2. Decide each kept row (used since import) explicitly. A date-only booking needs a time or a cancellation; a listing needs deleting or keeping the schema.
  3. Run down.

  No script deletes used rows automatically.

## Implementation (local, disposable stack)

**Usability and correctness corrections, as built:**
1. **Time-zone bulk action.**
   - After choosing a zone on one row, a list shows every other row that still needs a zone, each with its venue, city, state or province and country.
   - Only rows in the same city, state and country are ticked for you. Brooklyn isn't ticked from New York, Portland OR doesn't tick Portland ME, and rows with no city are never ticked.
   - Nothing is applied until "Use it for N rows" is pressed. Unticked rows stay unresolved.
   - The row stays open, marked Ready, until you move on, so the list stays in view.
   - Tested with a 12-row multi-zone US/Canada tour (unit) and in the end-to-end run.
2. **Shorter review.**
   - "N ready · N need attention · N skipped" sits at the top, with "Review next issue".
   - Upcoming bookings, Past listings and Skipped are collapsed, showing their counts.
   - The Continue bar (button only) sticks above the phone tab bar and its capture disc. It's a deliberate exception to "pages add no safe-area padding": its bottom offset includes the home-indicator inset.
   - "Continuing imports only the ready rows (N shows). The N rows that need attention are left out and listed in the result" sits at the top.
3. **Shorter confirmation.**
   - It leads with "Import into <artist>'s Schedule?" and three numbers: future bookings, past listings and rows left out. The rows and reasons sit behind "Show rows and reasons".
   - One line reconciles rows and shows ("14 shows from 13 ready rows (row 8 becomes 2 dates)").
   - Attribution and storage are one quiet line at the end. There are no implementation explanations.
   - Date-only bookings: "N has no start time yet; add one before starting capture". They can't be started from Schedule until a time is added: the next-show card offers "Add a start time" (the existing edit form) instead of Start. The Start helper refuses them as well.
4. **Date corrections.**
   - **Missing year:** last, this and next year, plus "Another year" (any year from 1950 to five years ahead).
   - **Skipped DST time:** asks "What time did the show start?" with a time field. "Suggestion, if the sheet used the old clock: 3:30 AM" only fills the field; check before using it.
   - **Festival range:** "Choose the dates to add". Past dates are added as unconfirmed listings.
5. **Result and recovery.**
   - Each import has its own result page (`/app/schedule/import/[id]`), reachable from the after-import line on Schedule, from "Recent imports" on Import shows, and from any imported show's details ("View import").
   - It shows what was added, the rows left out with reasons, each show and whether it has been used since, and Undo with a preview of what would be kept.
   - **Importing the same file again** is a new import: rows that exactly match a show from an earlier import (same date, venue, city and start time) are left out as "Already imported", unless you choose "Import as another record". A **retry of one batch** (double tap, lost reply) sends the same batch id and returns the first result.
   - Partial Undo is unchanged and tested.
6. **Polish.**
   - The "Planned for Schedule later" roadmap line is removed from Schedule; the roadmap stays in the plans only.
   - Rows and shows are counted separately everywhere: summary, Continue, confirmation and result.

**Schema change since the package:** two reason codes added to `import_shows`, `already_imported` and `unconfirmed_date_number` (an Excel day number left unconfirmed). They were re-validated: SQL suite 65/65.

**Tests (all on the disposable stack, production build of `2fd90a8`):**
- **Unit, `scripts/test-show-import.ts`: 72/0.** It covers:
  - headers and columns;
  - Excel cells;
  - date orders;
  - years, ranges and serials;
  - times and the two-times case;
  - zones;
  - DST;
  - the multi-zone tour;
  - duplicates and re-imports;
  - rows versus shows.
- **Existing suites, unchanged:**
  - show identity 47/0, next scheduled show 16/0, schedule time 13/0;
  - mobile layout invariants 147/0;
  - timezone labels 9/0, show date 13/0, Proof summary 83/0, date format 16/0.
- **Import end-to-end: 76/0.** A real `.xlsx` (two sheets, title rows, a date cell, a day number) and real CSVs, through the browser:
  - **Access:** owner and manager allowed; Viewer, revoked, pending and unrelated users refused (routes and page); signed out 401.
  - **Review:** every correction above.
  - **Confirm:** a double tap creates one batch.
  - **Stored values:** checked row by row.
  - **Nothing else written:** no performances, catalogue rows or setlists.
  - **Schedule and timeline:** wording, and the date-only booking.
  - **Result:** reopened from Recent imports.
  - **API:** a retry returns the first result; the same id with different rows is refused; a show added since review that matches → 409; a change since review that doesn't match → imports; a skipped time → 422.
  - **Re-importing the file:** rows marked "Already imported".
  - **Partial Undo** (one edited, one started): 12 removed, 2 kept, the capture still linked. A Viewer can't undo.
  - **Untouched Undo.**
  - **Ambiguous dates:** blocks the import.
  - **Layouts:** 320, 390 and 1280px in Dark and Light, with no sideways scroll, no control under 44px and no page errors.
- **Schedule end-to-end on the same build: 49/0.**

**Found and fixed by these tests:**
- A crash when two existing records paired with each other.
- A settled row jumping into a collapsed group and taking the bulk zone choice with it.

**Known gaps (not in this change):**
- Submit still has its own copy of the control styles (`components/ui/controls.ts` is the shared copy).
- The Manager pages' older `UpcomingShows` card buttons are under 44px.
- Editing a date-only booking through "+ Add a show"'s form requires a time: that is how a start time is added.

## What one approval covers (as packaged before implementation)

1. **Design.** The flow and states shown in the artifact, inside the released Schedule.
2. **Schema.** `supabase/proposals/0028_show_imports.sql`, exactly as validated on the disposable stack, together with its down migration.
   - First, the read-only preflight (`0028_show_imports.preflight.sql`) runs on production. Applying to production then needs its own go-ahead, once the preflight matches.
3. **Dependencies.** `papaparse@5.7.0` and `read-excel-file@9.3.12`, loaded only on the import page.
4. **Implementation.** The app changes listed below. They're built and tested on the disposable stack, then come back as a release candidate.

The UI-defect fix is a **separate small candidate**. Import builds on it, so it's released first.

## Flow

- **Entry.** "Import shows" sits beside "+ Add a show" in Schedule's header.
  - It's shown to the owner and write-capable roles. Viewers don't see it.
  - At `/app/schedule/import`, a Viewer gets "Only <artist> and teammates who can edit can import shows". The server refuses them too.
- **Choose a spreadsheet.**
  - Accepted: `.xlsx`, `.csv`, `.tsv`. Legacy `.xls` gets "Save it as .xlsx and try again".
  - The file is read in the browser: 5 MB, 500 rows, one sheet.
- **Review what Setlistr understood.**
  - **One line** gives the row count, the title rows left out and the date order with an example. "Date order", "Another file" and "Columns" are text actions on it.
  - **Column mapping** opens only on request, or by itself when no date or venue column is found.
  - **Sections**, in order:
    1. Needs a decision;
    2. Waiting for the date order;
    3. Upcoming bookings;
    4. Past listings, by month;
    5. Skipped.
  - **Rows** are the timeline's own rows. A row opens to show the decision, then what the sheet said, what it was read as, its zone and where the zone came from, and what it becomes.
- **Confirm.** One breakdown, then "Import N shows".
- **After.** Schedule shows one line, with "Import details" and "Undo import".

## 1. Dates and times

| Case | Treatment |
|---|---|
| A time, zone unknown | **The time is kept as written and never converted.** The row asks for the zone. A past row can instead keep the time as written with "time zone not recorded": `local_time` is stored, with no instant. An upcoming row must have a zone, because Schedule decides "today" and Start's date on the show's clock. |
| Zones, in order | A time-zone column (named IANA zones only; "EST" and fixed offsets are refused); then a venue already in the artist's records; then a country with one zone; then the person. "Also use this zone for …" names each affected row and city, and is never automatic. |
| Date only | `local_time` stays null and `scheduled_at` stays null: midnight is never assumed. Schedule shows "Time not set". It sorts after timed shows that day. |
| Repeated time (clocks go back) | Asked: "1:30 AM EDT (first, before clocks go back)" or "1:30 AM EST (second)". Either instant is stored; both read back as the booked wall time. |
| Skipped time (clocks go forward) | Asked: use the next valid time ("Use 3:30 AM"), enter another time, or leave the row out. The database refuses any instant that doesn't read back as the booked time. |
| Festival range ("18-20/07/2025") | Asked: choose the days actually performed, one or more, or leave the row out. Each chosen day is its own show. One show per day is never created automatically. |
| Missing year | Asked, with the weekday shown. Never guessed. |
| Ambiguous date order | Asked once for the file, before anything else, with no default. It's settled automatically only when a part over 12 or a four-digit year proves it. |
| Two-digit year | Read as 20YY, with a note on the row. |
| Excel cells | **Date cells** are read from their UTC calendar parts. `read-excel-file` returns UTC midnight whatever the device zone; checked with the device set to Los Angeles and Tokyo. **Time-formatted cells** are read as the time only. **A bare number in the date column** (an unformatted serial such as 45731) is shown as "45731 looks like Mar 15, 2025" and must be confirmed. |
| No date / "TBC" | Skipped (`no_date`). |

## 2. Review and reconciliation

- **Blocking rules:**
  - **File-level questions block the import:** the date order when it can't be proved, and a missing date or venue column. They affect every row.
  - **Row questions don't block.** Year, dates, venue, zone, time and duplicate decisions are per row. An unsettled row isn't imported.
  - **The settled rows can be imported on their own.** The page says so: "Settle them now, or continue: they aren't imported and the import result lists them". The confirm screen repeats it as "Unresolved, not imported", with each row and reason.
  - To add those rows later, import the sheet again. Rows already imported then show as possible duplicates of the earlier import.
- **Possible duplicates:** the released matcher (`lib/shows/identity`), unchanged. It compares against the artist's history, their upcoming shows, and the sheet's earlier rows. There are exactly two choices, each stating its consequence:
  - **Skip this row:** "<existing> stays exactly as it is. Row N isn't imported, and the import result lists it as a skipped duplicate."
  - **Import as another record:** "Setlistr adds a second show. Both appear in Schedule or Earlier, each marked Possible duplicate. Nothing is merged and <existing> doesn't change."
  - **No merging, linking or editing of existing records.** The database can't attach a capture to a listing either.
- **Final breakdown on Confirm:**
  - **Upcoming bookings**, split into timed and date-only;
  - **Past listings**, split into timed, time as written without a zone, and date only, with the not-performed sentence;
  - **Skipped**, each row with its reason;
  - **Unresolved, not imported**, each row with its reason;
  - **Added by**;
  - **Kept with each show.**
- **The import result** (`show_import_batches`) keeps:
  - the file name and SHA-256, the sheet name and date order;
  - the counts, who imported it, and when;
  - every skipped or unresolved row as `{row, reason}`, from a fixed list of 11 reason codes.
  - **It stores no cell values, unmapped columns or file.** Each imported show keeps its `source_row`.

## 3. Safe import and Undo

- **Double taps:** the button disables on the first tap.
- **Retries and lost responses:** the batch id is created once per review and reused by every retry. `import_shows` returns the first result ("already_imported") when the same person sends the same request again. A different request with the same id is refused.
- **Concurrent imports:** a per-workspace advisory lock serialises imports. The review's records fingerprint (count and latest change of the artist's shows and performances) is checked again under the lock. Any change since the review, such as another import, a teammate's "Add a show" or a capture, returns `IMPORT_STALE`. The page then goes back to review and says what changed.
  - **Residual:** a teammate's "Add a show" committed in the instant between the check and the commit isn't caught. The two records then both show as Possible duplicate on Schedule; nothing is lost or merged.
- **Rechecked at commit:**
  - write permission (`can_write_for`; Viewer, revoked, pending and unrelated users are refused);
  - zones;
  - instants against the booked times;
  - venue ownership;
  - whether each row is still upcoming or past ("a date passed overnight" returns `ROW_CHANGED_SINCE_REVIEW`).
- **Undo** removes only untouched rows. It keeps, with a reason:
  - **capture linked** (any performance points at it);
  - **setlist attached**;
  - **started or completed**;
  - **cancelled**;
  - **edited** (any update at all; imported rows stamp `clock_timestamp()` on update, so even an edit in the same transaction counts).
  - **Foreign keys aren't relied on.** Deleting a show would unlink its captures (`ON DELETE SET NULL`) and delete its setlists (`CASCADE`), so Undo checks both explicitly.
  - Undo is idempotent, and is refused to Viewers.
  - **The result is shown** either as "Import undone. N shows removed; nothing else changed", or as "N removed. M kept because they've been used since the import", with each kept show and its reason. The artifact shows both.

## 4. Schema: `0028_show_imports.sql`

**Why `local_date` and `local_time` are needed:**
- `scheduled_at` is an instant. It can't hold a date-only booking without inventing a time, and it can't hold a time whose zone is unknown.
- `performances.performance_date` belongs to captures, which a listing never has.

**Which field is authoritative, and how they stay consistent:**
- `local_date` and `local_time` are what was booked, and are authoritative for imported shows.
- `scheduled_at` exists exactly when a time and a real zone do, and must read back as `local_date + local_time` in `timezone`. A trigger enforces it, and handles both the repeated and the skipped hour.
- **When an existing path changes only the instant** (Schedule's edit RPC), the trigger carries `local_date` and `local_time` along. That's tested.
- Shows created before 0028 have `local_date` null and are unchanged.

**Contents:**
- **Additive:**
  - the `show_import_batches` table (readable through `can_act_for`, with no client writes);
  - four nullable columns on shows;
  - four CHECK constraints;
  - a unique index on (batch, row, date);
  - two new triggers (provenance, and local-field consistency);
  - four new functions (`import_shows`, `undo_show_import`, `show_records_fingerprint`, `is_real_time_zone`).
- **Changes to existing functions:** 19 lines added and 2 changed, each marked `0028`. The full diffs are in `docs/spreadsheet-import/existing-function-diffs.txt`.

| Function | Change |
|---|---|
| `enforce_schedule_start_guard` | `local_date`/`local_time` join the locked schedule fields; a status change into or out of `listed` is refused. (+7) |
| `reject_scheduled_show_delete` | Covers `listed` as well; honours the transaction-local flag set only inside `undo_show_import`. (+3 −1) |
| `reject_performance_insert_for_scheduled_show` | A performance can never point at a listing. (+4) |
| `start_scheduled_show` | The performance date is `local_date` first, then the scheduled instant's date, then today; a listing raises `SHOW_NOT_STARTABLE`. (+5 −1) |

`patch_scheduled_show_with_venue` is **unchanged**: it already refuses anything not `scheduled`.

### Where `listed` is excluded (tested on the disposable stack)

| Surface | How a listing is excluded | Test |
|---|---|---|
| Upcoming, Dashboard Next show, "past shows still marked scheduled" | `/api/shows/schedule` reads `status = 'scheduled'` only | upcoming has only future rows |
| Start | `start_scheduled_show` raises `SHOW_NOT_STARTABLE`; the guard refuses → live | both |
| Edit / Cancel / Delete | patch RPC refuses non-scheduled; guard refuses any status change; delete trigger refuses | 5 cases |
| Capture, recording upload, setlist link | no performance can reference a listing (insert guard); `performances.show_id` can't be changed later (0013) | refused |
| Live-record counts, Dashboard, Career, History, Stats, Publisher | all count `performances` / `performances_visible`; import never writes performances | performances, visible, user_songs, user_song_performances and setlists unchanged |
| Proof (page and PDF) | reads performances only (`lib/proof/load.ts`) | as above |
| Submissions queue and nav counts | `performances_visible` only | as above |
| Catalogue (`record_performance_catalog`) and Notion (`notion_show_count`) | both trigger on `performances` only; no trigger on shows calls out (preflight 4 and 11) | no performance created |
| Schedule timeline (Earlier) | shown as "No capture linked", source "Imported from a spreadsheet" | app change below |

### Every consumer of `shows` (inventory)

- **Insert (unaffected; they never set import fields, and the insert guard refuses them if they try):**
  - `app/app/show/new` (2), `app/app/new` (2), `app/app/show/upload`;
  - `app/api/upload-performance` (insert and update);
  - `app/api/shows/schedule` POST.
- **Status updates on a show reached through its performance** (a listing never has one): `app/app/live/[id]` (→ completed), `app/app/review/[id]` (→ completed), `app/api/admin/delete-show`.
- **Schedule routes:**
  - `GET /api/shows/schedule` (status = scheduled);
  - `PATCH …/[id]` (patch RPC);
  - `POST …/[id]/cancel` (a listing is refused by the guard);
  - `POST …/[id]/start` (RPC);
  - `GET /api/shows/timeline` (all shows; maps `listed` and `local_date`, app change).
- **Embedded reads through performances** (a listing can't appear): History, Review, Submit, Stats, the Publisher dashboard, `lib/proof/load.ts`.
- **Components:** `ScheduleTimeline`, `UpcomingShows` (Manager pages, the Dashboard's `NextShowSummary`, `pickNextScheduled`).
- **Database:**
  - `start_scheduled_show`, `patch_scheduled_show_with_venue`;
  - the guard, delete and performance-insert triggers;
  - `shows_lock_owner`, `shows_bump_updated_at`;
  - policies `shows_read/insert/write/delete` (0016);
  - `setlists` and `show_artists` policies.

### Disposable-stack validation

- **Suite:** `supabase/proposals/0028_show_imports.test.py` passes **65/65**; the output is in `0028_show_imports.test-output.txt`. It covers:
  - permissions for 8 roles;
  - stored values;
  - idempotency, conflicts and staleness;
  - the zone rules;
  - repeated and skipped times;
  - 13 listing exclusions;
  - Start and edit;
  - Undo, untouched and partly used;
  - 7 existing behaviours unchanged;
  - two real concurrent sessions: two imports, where the second gets `IMPORT_STALE`, and a double tap during a slow commit, where only one import happens.
- **Round trip:**
  - up, tests, down;
  - `pg_dump -s` identical to before, apart from pg_dump's random `\restrict` token;
  - up again from the final file, tests 65/65, down again, identical again.
  - The disposable stack is left as it was.
- **Found and fixed by the suite:** an edit in the import's own transaction left `updated_at = created_at`, so Undo could have removed an edited row. Imported rows now stamp `clock_timestamp()` on any update.

## 5. Existing UI defects (separate candidate `5104622`, local)

- **Earlier dates on phones:** past-year dates overflowed the 70px column and overlapped the venue. The date now wraps on phones and stays on one line at 900px and wider. Measured overlaps: 4 → 0 at 390px.
- **44px controls:**
  - the timeline's text actions ("+ Add a show", Retry), from 36px;
  - the show actions menu button, from 31px, and its items;
  - `PageHeader`'s Back, from 36px;
  - the time-zone picker's input, from about 43px.
- **What this enables:** the import page uses the shared `PageHeader` Back. There's no alternative Back link any more.
- **Checked:**
  - `tsc` clean;
  - production build;
  - **Schedule end-to-end 49/0** on the disposable stack, including the Manager Schedule and the Dashboard's Next show.
- **Not included:** the Manager pages' older `UpcomingShows` card buttons ("Start early" and "+ Add a show" there are under 44px). They're outside Schedule and listed for later.

## 6. Dependencies (not installed in the app; checked in an isolated scratch folder)

| Package | Version | Licence | Purpose | Bundle |
|---|---|---|---|---|
| `papaparse` | 5.7.0 (published 2026-08-24) | MIT, no dependencies | CSV and TSV parsing (quoted commas, line endings, encodings) | 19.5 KB min, **7.3 KB gzip** |
| `read-excel-file` | 9.3.12 (published 2026-10-07) | MIT; dependencies `fflate`, `saxen`, `worker-f`, `unzipper-esm` (all MIT; `unzipper-esm` pulls ISC/MIT Node-only modules not in the browser build) | `.xlsx` cells, typed (Date and Number) | browser entry 54.7 KB min, **17.2 KB gzip** |

- **Placement:** both load with `import()` inside the import page only. Nothing is added to the shared bundle or any other route.
- **Advisories:** `npm audit` found none.
- **Not chosen:** the `xlsx` npm package (0.18.5 has known advisories; fixed builds are published outside npm) and `exceljs` (larger).

## 7. Read-only preflight (`0028_show_imports.preflight.sql`, not run on production)

Twelve SELECTs in a `READ ONLY` transaction. Each says what it settles and what the disposable stack returned:
1. shows columns: `created_at`, `timezone` default;
2. constraints: no status CHECK;
3. statuses in use;
4. triggers on shows: none call out;
5. foreign keys to shows: Undo's checks;
6. md5 of the four replaced functions and the patch RPC: diffs made from production's bodies;
7. `can_write_for` and `can_act_for`;
8. no name collisions;
9. PostgreSQL features;
10. policies;
11. performances triggers: catalogue and Notion effects;
12. the type of `performance_date`.

The migration itself also stops if 2, 5 or 8 differ.

## 8. Simulated in the prototype

Only these are simulated:
- **Choosing a file:** it opens one of two example sheets.
- **Reading the sheet:** the rules are real code; the cell values are fixed examples.
- **Import:** the four outcomes are chosen from a dashed "Prototype" box: normal, response lost then retried, a teammate adds a matching show first, edit access removed first.
- **Undo:** "Nothing used" or "One edited, one started", chosen from a dashed "Prototype" box.
- **Data:** example data stands in for the database, and Start, Add, Edit and Cancel are refused.

Everything else is the app's own code in a scratch build:
- AppShell, workspace and role context, appearance;
- `PageFrame`, `PageHeader`, `Skeleton`;
- the timeline rows, `TimezoneCombobox`;
- the matcher, `lib/scheduleTime`;
- Submit's controls.

## 9. App changes after approval

| File | Change |
|---|---|
| `lib/shows/import/read.ts` (new, pure) | Sheet → rows with `papaparse` / `read-excel-file`; header detection; column guesses; date and time readers (the rules above). |
| `lib/shows/import/review.ts` (new, pure) | Issues, zones, DST, upcoming or past, matcher candidates, breakdown, reason codes (as `importModel.ts` in the prototype). |
| `app/api/shows/import/route.ts` (new) | POST. Reads the fingerprint and records, recomputes candidates (409 with the rows if a new one appeared), converts times with `zonedLocalTimeToUtc`, calls `import_shows` with the cookie client, retries once on `IMPORT_STALE`, and logs no row contents. |
| `app/api/shows/import/[id]/route.ts` (new) | DELETE → `undo_show_import`. |
| `app/app/schedule/import/page.tsx`, `components/scheduling/import/*` (new) | The screens in the artifact. |
| `components/scheduling/timelineStyles.ts`, `components/ui/controls.ts` (new) | Schedule's row CSS and Submit's control styles, moved verbatim and shared. Schedule and Submit adopt them with no visual change. |
| `components/scheduling/ScheduleTimeline.tsx` | The Import entry, the after-import line, date-only bookings, imported-row wording, and the roadmap line. |
| `components/scheduling/UpcomingShows.tsx` | Date-only bookings in cards, `NextShowSummary`, Start confirmation and the edit form ("No time yet" is kept unless a time is entered). `TimezoneCombobox` is exported. |
| `lib/scheduleTime.ts` | `pickNextScheduled` / upcoming helpers accept `local_date` when `scheduled_at` is null. |
| `lib/shows/timeline.ts`, `app/api/shows/timeline/route.ts` | `listed` → no-capture; `local_date`/`local_time`; source "Imported from a spreadsheet" ahead of "Scheduled". |
| `app/api/shows/schedule/route.ts` | GET also selects `local_date`, `local_time`, `import_batch_id`. |

**Not touched:** capture, recognition, upload, the save handlers, `app/api/identify`, and every counting surface.

## 10. Release order and what 0028 changes immediately

**0028 is not inert.** Applying it changes existing functions, guards and constraints at once, for the app that is deployed now:
- **`start_scheduled_show`:**
  - It refuses a scheduled show with no start time (`SHOW_NEEDS_START_TIME`).
  - It takes the performance date from `local_date` first. Shows created before 0028 have no `local_date`, so for them the date is the same as before.
- **`enforce_schedule_start_guard`:** it locks `local_date`/`local_time` along with the other schedule fields, and refuses any status change into or out of `listed`.
- **`reject_scheduled_show_delete`:** it also protects listings, and honours the Undo-only flag.
- **`reject_performance_insert_for_scheduled_show`:** it refuses any performance for a listing.
- **The status check:** `shows_status_check` gains `listed`.
- **New constraints, checked against every existing row when applied:**
  - `shows_planned_has_date`: a scheduled or listed show needs `scheduled_at` or `local_date`.
  - `shows_listed_is_imported`, `shows_local_time_needs_date` and `shows_import_source_pair`.
  - **If any existing scheduled show lacks `scheduled_at`, the migration fails as a whole and changes nothing.**
- **New triggers on every insert and update of `shows`:**
  - **Import fields:** an insert that sets them is refused unless it comes from `import_shows`. Their provenance can't change.
  - **Local-field consistency:** it does nothing when `local_date` is null, which is every existing row.
- **New functions callable by signed-in users:** `import_shows`, `undo_show_import`, `show_records_fingerprint` and `show_import_usage`. Each checks permission itself.

**Tested compatibility (disposable stack, production-like status check, final 0028):**
- **The deployed app (`3ce4833`) with 0028 applied:** Schedule end-to-end 49/0. That covers add, edit, cancel, Start, the Manager Schedule and the Dashboard's Next Show.
- **SQL suite, existing behaviour unchanged:**
  - a plain "Add a show" insert;
  - start keeps the scheduled date;
  - scheduled shows can't be deleted;
  - cancel works;
  - the patch RPC edits;
  - a raw performance insert for a scheduled show is still refused;
  - completed shows are untouched.

**Capture, upload, live and review with 0028 (closed 2026-10-26):** the deployed app (`3ce4833`), on the disposable stack, with local stubs for ACRCloud, MusicBrainz, Mapbox and Spotify (`docs/spreadsheet-import/fetch-stub.cjs`, preloaded into the server; no app code changed). The harness is `docs/spreadsheet-import/compat-flows.js`.
1. **New show → start capture (UI):** show and performance created, linked, both `live`; no import fields set.
2. **Recording upload → saved performance:** the upload page's own route sequence (create → stubbed recognition of 6 chunks → reconcile → save details). Performance `review`; show `completed` and linked; the reconciled songs saved.
3. **Live capture → End Show (UI, fake microphone):** performance `review` with `ended_at`; show `completed`; manually added songs kept.
4. **Review → Save & Complete (UI), for both the live and the uploaded show:** performance `complete`, show `completed`, songs unchanged.
   - **Catalogue:** `record_performance_catalog` records each song once. Uploads are recorded during reconciliation, and completion adds none again.

All four pass: 9/9 with final 0028 and 9/9 without it. Matched runs (a fresh server and stub for each) show **no difference** between the baseline and final 0028 in:
- statuses, links and songs;
- catalogue rows;
- Notion-trigger requests: one per completing status update, in both runs;
- calls to the outside-service stubs.

The summaries are in `docs/spreadsheet-import/compat-summary-*.json`.

**Order (each step on its own approval):**
1. **SQL:**
   - Immediately before applying, run one read-only check: no scheduled show has a null `scheduled_at` (`select count(*) from public.shows where status = 'scheduled' and scheduled_at is null` must be 0), and the preflight function hashes still match.
   - Then apply 0028 (SHA-256 `b21d2ec4…07faed`).
2. **Verification, read-only:**
   - the function hashes;
   - `shows_status_check` includes `listed`;
   - Schedule and the Dashboard load in the deployed app;
   - no `listed` rows yet;
   - one signed-out smoke pass.
3. **App:** release the UI fix (`5104622`), then the import feature (`f63229d` or its merge commit), each with one deployment check and a read-only device check.

**Rollback limitations:**
- **SQL rollback (0028's down migration):**
  - With no imported rows: it restores the schema, functions and four-value status check exactly (tested).
  - With imported rows: it's refused. Undo each import and decide each kept row first.
- **App-only rollback:** keeps all data, but the old UI misplaces and mislabels imported rows (see Compatibility).

## Remaining questions

1. Should the import result be viewable later (an "Imports" list), or only in the after-import line? The proposal keeps it in the database and shows it once.
2. "Time zone not recorded" past listings could later get a zone from the Schedule row menu. That's not in this slice.

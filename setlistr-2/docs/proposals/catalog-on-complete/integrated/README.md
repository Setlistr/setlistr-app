# Integrated test: patched save + proposed migration (2026-10-17)

Approved scope: a **disposable local** Supabase stack only. No shared or production database was changed, no backfill was run, nothing was deployed. The stack was deleted afterwards.

## Setup

- **Disposable stack:** Supabase CLI 2.120.0, project `setlistr-catalog-disposable` on ports 546xx, with its own containers and volumes (none shared with the `setlistr-security-test` stack), and unused services off.
- **Migrations, in order:**
  1. The current local app schema: a `pg_dump --schema-only` of `public` from the shared local database (read-only), minus two lines the migration runner rejects (psql `\restrict`, and `supabase_admin` default privileges, which the stack sets itself).
  2. `20261017000002_production_catalogue_rls.sql`: RLS on `user_songs` and `user_song_performances` with the production baseline policies (the local schema has them off).
  3. `../proposed-migration.sql`, unchanged.
- **App:** `design/share-cards` @ e47c879 with `../app.patch` applied, run with `next dev` against the disposable stack only. The harness refuses any other Supabase URL.

## Results: `int-verify.js`, 15/15 (`int-verify.log`)

Every save went through the real review page.

| Case | Result |
|---|---|
| Owner, Manager, Tour Manager save | show complete; the artist's catalogue recorded with it |
| Viewer saves | refused ("This account can't save changes"); show stays in review; nothing recorded |
| Planned song marked "Played", another left | the played one is counted, the other isn't |
| Song already counted during capture | not counted again |
| Re-save of a completed show | no change |
| Owner and Manager save two shows at once, both with the same new song | both complete; one catalogue row, count 2 |
| Catalogue fails (a forced check constraint) | completion rejected with a clear error (`mark the show complete · 23514`); show stays in review; no partial catalogue; the earlier song edit is saved |
| Retry after the cause is gone | completes; catalogue recorded once; no duplicate songs |
| Final write commits but its response is lost | the page confirms by reading back, celebrates; catalogue recorded once |
| Page closed the moment the summary appears (18 songs, 150 ms per request) | all 18 songs in the catalogue (previously measured: 2 of 18, one count lost) |
| setlist.fm-style import (insert as the user) | nothing counted |
| That imported show later saved from Review | counted, as today |

## Existing save suites against the same stack and patched app

| Suite | Result |
|---|---|
| save-stages (a lost response and a retry at every stage of the save) | 94/94 |
| fix-verify | 55/56 |
| opt-fail | 8/10 |

The three failures are obsolete scenarios. They inject failures into the page's own catalogue requests, which the patch removes: the injection fired 0 times and the save celebrated and completed. In fix-verify, the expected "no first-appearance claim" no longer applies, because the catalogue is now actually recorded. A real catalogue failure is covered above. These scenarios need rewriting before release.

## Cost

Measured in the disposable database: the final write with the catalogue took ~1–3 ms at 25 and 60 songs, and ~0.5 ms for a re-save.

`user_songs` has no index on (user_id, song_title), so each song's lookup scans the table. That's negligible here and unmeasured at production size. An index would be a separate schema change.

## Remaining limitations before production approval

- **Schema:** the test schema is the local app schema plus production RLS on the catalogue tables, not a production dump. Production-only objects (other triggers, policies, `product_events`, `photo_url`) weren't present.
- **Catalogue failure copy:** the page shows the existing "database refused… Trying again won't fix this" message. The retry does work once the cause is gone, so the copy may need adjusting for this case.
- **Capture is unchanged:** live capture and uploads still write the catalogue page/route-side in two steps (issue 1's pattern).
- **Existing damage:** lost counts are not repaired; any repair needs a separately approved backfill.
- **Obsolete scenarios:** the three described above need rewriting.
- **Not tested:** native iOS, and a production-size `user_songs` table.

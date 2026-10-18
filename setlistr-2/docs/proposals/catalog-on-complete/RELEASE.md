# Release steps (for use only after explicit approval)

Every step below is **held**. Nothing in this document has been run against production.

## What is being released

| Part | Exact artifact | SHA-256 / commit |
|---|---|---|
| C · administrative grants | [`proposed-catalogue-admin-privileges.sql`](proposed-catalogue-admin-privileges.sql) | `f6fed18c104c233f…` |
| B · catalogue write access | [`proposed-catalogue-write-access.sql`](proposed-catalogue-write-access.sql) | `1efd7589a0e06b30…` |
| A · catalogue repair SQL | [`proposed-migration.sql`](proposed-migration.sql) | `5813143049552258…` |
| A · app | `fix/catalog-on-complete-app` @ **0d5dd82cc4ce2854184191b7a7507e69f3c04593** | a fast-forward of `origin/main` @ 0bd17c4 |
| Read-only checks | [`release-checks.sql`](release-checks.sql) | — |

The SQL files are byte-identical to those tested. The candidate type-checks and builds cleanly (`final4/candidate-build.log`).

**What the app candidate contains** (every commit between `origin/main` and 0d5dd82):

| Batch | Commits | Recorded status |
|---|---|---|
| UI standard and Career refinement | 7aa6fa5 … 810af6f | pushed for Preview, **never explicitly approved for release in these notes: confirm** |
| Celebration ("Show complete, earned") | 2f472c4 | superseded by the record-finish orb |
| Review save repair: required vs optional writes; 'complete' status; status consumers; celebration on confirmed save | 4ce8474, 909338b, 4ee31be, fd60200 | — |
| Record finish: orb lands on the record; shared dots; compact "Your record · N shows" | 57c47b5, c0ae97e | approved direction |
| Share cards: Night and Milestone, html-to-image exporter, held cards hidden | 0c9a567, e47c879 | approved |
| Catalogue repair (page side) and failure wording | 538e885, 0d5dd82 | this package |

These are stacked commits, so the release candidate can't omit the UI standard and Career batch without being rebuilt.

## Steps, in order

Run every SQL step in the **Supabase SQL Editor** of project `lelimetbogycrdnfxjok`. Confirm Project Settings → General → Reference ID first. Paste each file whole. Wrap B and A in `BEGIN;` … `COMMIT;` so each applies atomically; C already contains its own. The release-order test applied exactly this way (`final4/release-order-smoke.log`).

**0. Before anything:** run `release-checks.sql` (read-only) and **save its output**. Its `table_acls` value is the exact baseline that C's rollback must restore.

| Step | Action | Then run `release-checks.sql`; expect | If it's wrong |
|---|---|---|---|
| **C** | run `proposed-catalogue-admin-privileges.sql` | `C_client_admin_privileges`: no privileges for any table → role pair | run `proposed-catalogue-admin-privileges.rollback.sql`; `table_acls` must equal step 0's |
| **B** | `BEGIN;` + `proposed-catalogue-write-access.sql` + `COMMIT;` | `B_catalogue_policies`: 8 (read/insert/update/delete on each table); `B_owner_locks`: both | it aborts by itself if production's policies changed since Run 1; otherwise run `proposed-catalogue-write-access.rollback.sql` |
| **A · SQL** | `BEGIN;` + `proposed-migration.sql` + `COMMIT;` | `A_functions`: three, EXECUTE only for postgres and service_role; `A_trigger`: present | it aborts by itself, changing nothing, if production's shape differs. **Once applied, the SQL stays** ([ROLLOUT.md](ROLLOUT.md)). |
| **A · smoke** | complete one real show from Review on the **current** production app | that show has one marker per kept song | the current app never fires the trigger (it writes `'completed'`), so this checks only that nothing broke. The trigger's first real use is step A · app. |
| **A · app** | push `fix/catalog-on-complete-app` (0d5dd82), open a PR to `main`, merge (fast-forward), and let Vercel deploy | complete one show as owner and one as a Manager: celebration appears; each has one marker per kept song | revert the deployment in Vercel / revert the merge. **The SQL stays.** |
| **Record** | commit the three applied files to `supabase/migrations/` as `0025_catalogue_admin_privileges.sql`, `0026_catalogue_write_access.sql`, `0027_catalog_on_complete.sql` (no app change) | — | — |

Notes:
- The candidate's Preview is safe to open only **after** A · SQL. Previews use the production database.
- C and B need no deployment and can be applied on a different day from A.
- Don't publish a candidate Preview before A · SQL.

## Not part of this release (open)

- historical backfill;
- the live-capture and upload catalogue writes;
- Notion webhook deduplication;
- the historical review audit;
- native iOS sharing (not tested).

No historical marker is altered and no count is changed.

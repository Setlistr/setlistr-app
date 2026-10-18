# Release package for approval (revision 2, 2026-10-18)

**Status:** **nothing applied anywhere.** No migration, production policy change, production write, backfill, deployment or merge. Approval stays held until preflight Runs 2 and 3 are back and reviewed.

There are two independent proposals, each approved, applied and rolled back on its own.

## A · Catalogue repair (the release)

| Item | Where |
|---|---|
| SQL, exact | [`proposed-migration.sql`](proposed-migration.sql) (revision 2; byte-identical to the file tested) |
| App candidate | `fix/catalog-on-complete-app` @ **0d5dd82cc4ce2854184191b7a7507e69f3c04593**, local only, on `design/share-cards` @ e47c879; diff in [`app.patch`](app.patch) |
| Preflight | [PREFLIGHT.md](PREFLIGHT.md): Run 1 done; Runs 2 and 3 prepared and validated |
| Rollout / rollback | [ROLLOUT.md](ROLLOUT.md): SQL first, then the app; the SQL stays; fix forward |
| Mixed writers | [OVERLAP.md](OVERLAP.md): corrected 2026-10-18 |

**Intended behaviour:**
- authorized Managers and Tour Managers update the artist's catalogue;
- a catalogue failure prevents final completion while keeping edits;
- Try again is offered only for temporary failures.

**Revision 2 vs revision 1:** an atomic upsert replaces update-then-insert (revision 1 failed with `23505` against production's unique key); the advisory lock is removed; markers are written as `id::text`; a shape precondition aborts the migration if production differs.

## B · Catalogue write access (separate permission repair)

| Item | Where |
|---|---|
| SQL, exact | [`proposed-catalogue-write-access.sql`](proposed-catalogue-write-access.sql), byte-identical to the file tested |
| Rollback, exact | [`proposed-catalogue-write-access.rollback.sql`](proposed-catalogue-write-access.rollback.sql), tested: restores production's current policies exactly |
| Finding, design, tests | [FINDING-catalogue-policies.md](FINDING-catalogue-policies.md) |

## Test results (disposable stack, verified to match production's shape)

| Suite | Configuration | Result |
|---|---|---|
| Database level: types, unique-key races, deadlocks, Notion webhook, function permissions | A only | 17/17 (`final2/db-verify.log`) |
| Browser: roles, played planned, capture, re-save, concurrency, failure boundary 5a–5d, overlap B1–B5, lost response, close at success, imports | A only | 34/34 (`final2/prod-verify.log`) |
| Browser, same suite | **A + B** | 34/34 (`final3/prod-verify-policy.log`) |
| Policy access matrix, ownership, writer paths, stale-write interleavings O1–O3 | A + B | 31/31 (`final3/policy-verify.log`) |
| Policy rollback restores production's policies; re-apply works | B | pass (`final3/policy-rollback-check.log`) |
| save-stages · fix-verify | A | 94/94 · 54/54 |
| Production-size timing | A | 1.2–1.6 ms per 18-song completion |
| Run 2 / Run 3 at production size; Run 3 categories on planted markers | — | 38 ms / 60 ms; 9 of 9 correct |

## Remaining risks

- **Runs 2 and 3 not yet run in production:** plan, table grants, column defaults, unmatched-marker categories.
- **Unmatched markers:** 1,007 of 2,103. Uncategorized until Run 3; not treated as lost counts; no backfill.
- **Stale writes ([OVERLAP.md](OVERLAP.md)):** a read-then-write writer can overwrite any committed count, the trigger's included, with a stale value. The count can then drift **either way**: under (O1, R2, R3) or over (O2). Guaranteed for every writer: at most one count per song per show, and one row per title. Exposure: old tabs until they reload; capture, uploads and delete/undo until those paths are repaired.
- **Completion now depends on the catalogue:** a persistent catalogue error would stop shows completing; the SQL is fixed forward.
- **Previews use the production database:** don't publish a candidate Preview before the migration.
- **Not tested:** native iOS sharing.

**Explicitly NOT repaired (open):**
- historical backfill;
- the live-capture and upload catalogue writes;
- Notion webhook deduplication;
- the historical review audit.

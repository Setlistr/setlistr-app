# Catalogue repair: review package, revision 2

**Status:** revised against the production preflight. **Not applied anywhere.** No migration, production write, backfill, deployment or merge. Approval stays held until preflight Runs 2 and 3 are back and reviewed.

## What to approve

| Item | Where |
|---|---|
| SQL, exact (revision 2) | [`proposed-migration.sql`](proposed-migration.sql); the file tested is byte-identical |
| App candidate (unchanged) | `fix/catalog-on-complete-app` @ **0d5dd82cc4ce2854184191b7a7507e69f3c04593**, local only (remote deleted to contain the Preview), on `design/share-cards` @ e47c879; diff in `app.patch` |
| Preflight | [PREFLIGHT.md](PREFLIGHT.md): Run 1 findings; Runs 2 and 3 prepared |
| Rollout / rollback | [ROLLOUT.md](ROLLOUT.md): SQL first; the SQL stays; fix forward |
| Mixed writers | [OVERLAP.md](OVERLAP.md): corrected for production's unique key |
| Separate permission finding | [FINDING-catalogue-policies.md](FINDING-catalogue-policies.md) |

## What changed from revision 1, and why

| Production finding | Change |
|---|---|
| `user_songs` has UNIQUE (user_id, song_title) | **Bug fixed.** Revision 1 updated, then inserted. When another writer created the song's row in between, its insert failed with `23505`, and the page would have reported a permanent failure. Revision 2 uses one atomic `INSERT … ON CONFLICT DO UPDATE`. Demonstrated failing on revision 1 and passing on revision 2. |
| The unique key serializes writers of the same song | the per-artist advisory lock is removed; songs are written in key order (0 deadlocks in 12 concurrent rounds) |
| `user_song_performances.performance_id` is text | markers written explicitly as `id::text`, the app's form (revision 1 also worked, through an assignment cast) |
| the migration's correctness depends on production's shape | a precondition block aborts the migration, changing nothing, if the column type, either unique key or the status check differs |

**Intended behaviour (unchanged):**
- authorized Managers and Tour Managers update the artist's catalogue;
- a catalogue failure prevents final completion while keeping edits;
- Try again is offered only for temporary failures.

## Test results: disposable stack in production's shape

**The shape is verified:** the same Run 1 on the disposable database matches production on every column type, nullability, constraint, policy, access function, index and trigger the repair touches (`final2/shape-check.out`). The only extra object is the proposed trigger. Production's Notion webhook trigger is reproduced against a closed local port.

| Suite | Result |
|---|---|
| Database level (`db-verify`): types, unique-key races, deadlocks, Notion webhook, function permissions, table access | **17/17**, plus 7 reported findings |
| Browser (`prod-verify`): roles, played planned, capture, re-save, concurrency, failure boundary 5a–5d, overlap B1–B5, lost response, close at success, imports | **34/34** |
| save-stages (a lost response and a retry at every stage) | **94/94** |
| fix-verify (scenario 5 replaced by 5a–5d) | **54/54** |
| Production-size timing (1,088 catalogue rows, largest artist 598; 3,548 songs; 2,103 markers) | **1.2–1.6 ms** per 18-song completion; both lookups use the unique indexes |

Checks against the earlier claims:
- **5c real contention** is now a row lock on the artist's catalogue row. The statement timeout arrives as `57014` untagged, is treated as temporary, and the retry completes.
- **B1** passes for both the owner and a Manager through deployed `main`.
- **B4** (`main` + candidate at once): the candidate completes, 2 markers, always one row; the total is 2, or 1 if `main` loses the race.

## Remaining risks and open items

- **Preflight Runs 2 and 3 are not yet run.** They cover the production plan, the table grants, column defaults and the unmatched-marker categories.
- **Unmatched markers:** 1,007 of 2,103 don't match a current song of their show. Uncategorized until Run 3. They're not treated as lost counts, and there's no backfill.
- **Unlocked writers can lose a count** when racing on the same new or existing song (R2, R3 in OVERLAP.md). They never add one. Affected: old tabs until they reload; capture, uploads and delete/undo permanently, until those paths are repaired.
- **Viewer write access to the catalogue** (separate finding). Not changed by this repair.
- **Completion now depends on the catalogue:** a persistent catalogue error would stop shows completing; the SQL is fixed forward.
- **Previews use the production database.** Don't publish a candidate Preview before the migration.
- **Not tested:** native iOS sharing.

**Explicitly NOT repaired by this change (still open):**
- historical backfill;
- the live-capture and upload catalogue writes;
- Notion webhook deduplication;
- the audit of historical shows left in review.

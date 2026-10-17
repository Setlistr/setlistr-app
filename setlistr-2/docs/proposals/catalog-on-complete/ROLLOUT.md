# Catalogue repair: rollout and rollback

Nothing here has been run against production. Every step needs explicit approval.

## Order

**SQL first, then the app. To roll back, revert the app first, then the SQL.** The reverse in either direction loses data: the candidate app doesn't write the catalogue itself, so it must never run against a database without the trigger (demonstrated, `final/suite-B-overlap-rollback.log`, B5).

### Rollout

1. **Preflight (read-only).** Run `preflight.sql` in production with authorization and compare each result with the expectation noted beside it. Stop on any difference. It writes nothing: SELECTs and an EXPLAIN without ANALYZE, inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`. It was run once on the disposable stack to prove it runs (`final/preflight-run-on-disposable.out`).
2. **Apply `proposed-migration.sql`** (as `0025_catalog_on_complete.sql`). The currently deployed app keeps working unchanged (next section).
3. **Smoke check (read-only).** A show completed after step 2 has one marker per kept song: `select count(*) from user_song_performances where performance_id = '<id>'`.
4. **Deploy the app candidate:** `fix/catalog-on-complete-app` @ 0d5dd82. It sits on `design/share-cards` @ e47c879, so it ships with or after that branch.
5. **Monitor:** the save's reference line `record the song catalogue · <code>` in support reports, and review saves that stay in `review`.

### Rollback

1. **Revert the app** to the previous deployment. With the trigger still in place, the previous app works and nothing is counted twice (B1, B2).
2. **Only then, if needed, remove the SQL:**

```sql
DROP TRIGGER IF EXISTS performances_record_catalog ON public.performances;
DROP FUNCTION IF EXISTS public.performances_record_catalog();
DROP FUNCTION IF EXISTS public.record_performance_catalog(uuid);
DROP FUNCTION IF EXISTS public.song_catalog_key(text);
```

Catalogue rows recorded while the trigger was in place stay correct and need no undo.

## Overlap with older app versions (demonstrated on the disposable stack)

During rollout, browsers keep running whatever code they loaded. Both kinds of older code are safe with the trigger in place.

| Running code | What happens with the migration applied | Result (B suite) |
|---|---|---|
| **Deployed `main` (0bd17c4)**, still writing `'completed'` | `performances_status_check` rejects `'completed'` (the error is ignored, as today), so the trigger never fires; main's own page-side loop counts the songs | each song once; same as today (B1) |
| **An old tab of a build with the page-side loop and `'complete'`** (e47c879) | the trigger records the catalogue in the final write; the old loop then finds each per-show marker and skips the song | each song once (B2); re-saving in the candidate changes nothing |
| Old tab and candidate at once, sharing a new song | the trigger takes a per-artist lock; the old loop only ever finds markers | one row, counted twice (B3) |
| `main` and candidate at once, sharing a new song | main's loop doesn't take the lock | no show counted twice; one row in this run (B4). Two rows split between them is possible in principle under exact timing: main's unlocked loop already races itself today. |

**Why it can't double-count:** every writer, old or new, first inserts the per-show marker `(user, performance, normalized title)`, which is unique. A song is counted only by the writer whose marker insert succeeds. The trigger writes marker and count in one transaction, so a marker never exists without its count.

## Previews use the production database

The `23514` error seen on an earlier Preview came from production's status constraint, which the local database doesn't have. So Vercel Previews of this repo appear to use the production database.

**Until the migration is applied, don't save shows on any Preview of `fix/catalog-on-complete-app`:** those shows would complete without their catalogue. Previews of other branches still have the page-side loop and are unaffected.

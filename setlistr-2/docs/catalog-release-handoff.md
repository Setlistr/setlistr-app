# Release handoff: catalogue on completion, catalogue permissions, record finish and share cards

**Released to production 2026-10-18.** Production commit **`1aee35b4e8dd911debde5482f7e6cb76b5a9e9e0`** on `main`, a fast-forward from 0bd17c4. Vercel production deployment 7163070485 succeeded.

## What shipped

**App:** identical to the approved candidate `0d5dd82`. It contains:
- the UI standard and Career refinement (7aa6fa5 … 810af6f);
- the review save repairs: required vs optional writes, the `'complete'` status, status consumers, and the celebration once the save is confirmed;
- record finish: the orb lands on the record, shared milestone dots, and "Your record · N shows";
- share cards: Night and Milestone, the html-to-image exporter, and the two held cards (First Appearance, Royalty Moment) hidden with their code kept;
- the review page no longer writes the catalogue itself, plus the catalogue failure wording.

**Database:** applied manually in the Supabase SQL Editor, in this order, each verified with `release-checks.sql` (read-only) before the next.

| Migration | What it does | Verified |
|---|---|---|
| `0025_catalogue_admin_privileges.sql` | removes TRUNCATE, TRIGGER, REFERENCES and MAINTAIN from anon/authenticated on `user_songs`, `user_song_performances` and `performance_songs` (the rule of 0010); DML and `service_role` untouched | ACLs now match `performances` |
| `0026_catalogue_write_access.sql` | catalogue reads unchanged (`can_act_for`); writes only for the artist and writing delegates (`can_write_for`); `user_id` locked | 8 policies, 2 owner locks |
| `0027_catalog_on_complete.sql` | records the song catalogue inside the review save's final write (trigger + SECURITY DEFINER functions; EXECUTE revoked from anon/authenticated) | 3 functions, trigger present |

- **Applied manually.** There's no migration-history table in production (`supabase_migrations.schema_migrations` doesn't exist), so as with 0001–0024 the repo files are the record. **Don't re-run them.** The files are byte-identical to the reviewed SQL (package `fix/catalog-on-complete` @ 6582a9e).
- **Pre-change baseline:** saved before 0025 (all four administrative privileges on the three tables; no PUBLIC grants).

## Production verification (by the user, 2026-10-18)

- **Owner save:** worked.
- **Manager save:** worked.
- **iPhone share:** worked. This is the first real-device check of native sharing.
- **Visuals:** confirmed good.
- **Database confirmation** (read-only, after a save): the saved show is `complete`, which only the new app writes, and its kept songs and markers match (1 and 1, written by the trigger during the save).

## Rollback

- **The app:** revert the Vercel deployment.
- **Leave 0027 installed.** Removing it while new app code can still run would complete shows without recording their catalogue (`docs/proposals/catalog-on-complete/ROLLOUT.md`).
- **0025 and 0026** have tested rollback scripts in the package, if they're ever needed.

## Still open (separate; no backfill, no historical cleanup)

See [`data-integrity-open-issues.md`](data-integrity-open-issues.md):
- live-capture and upload catalogue writes;
- stale read-then-write counts;
- Notion webhook duplicates;
- shows left in `review`;
- historical marker categories.

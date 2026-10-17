# Production preflight in the Supabase SQL Editor (read-only)

No password or connection string to handle: the SQL Editor runs inside the signed-in dashboard.

## Why two runs

The editor shows only the **last** statement's result, so a script ending in `ROLLBACK` would show nothing.

- **Run 1** sets the session read-only, then runs **one** `SELECT` that returns every check as a single JSON document: definitions, settings and counts only, no personal row data.
- **Run 2** is the per-song lookup's query plan: `EXPLAIN` without `ANALYZE`, so nothing is executed. It needs its own run because a plan can't be returned from inside a `SELECT`.

Both start with `SET default_transaction_read_only = on`. Proven locally: a write after that line fails with `cannot execute CREATE TABLE in a read-only transaction`. Both were validated on the local database: Run 1 returns 18 keys, about 12 KB.

## Steps

1. **Confirm the target project.** Vercel → **setlistr-app** → Settings → Environment Variables → the **Production** `NEXT_PUBLIC_SUPABASE_URL` is `https://<ref>.supabase.co`. In Supabase, open the project whose **Project Settings → General → Reference ID** is `<ref>`. Don't continue if they differ.
2. **SQL Editor → New query.** Paste [`preflight-sql-editor-run1.sql`](preflight-sql-editor-run1.sql) in full → **Run**. One row, one column `preflight`, comes back.
3. **Check the result.** Confirm it shows `"read_only": "on"`, then copy the `preflight` value and paste it into the conversation.
4. **New query.** Paste [`preflight-sql-editor-run2-plan.sql`](preflight-sql-editor-run2-plan.sql) → **Run** → copy the plan rows.
5. **Leave both queries unsaved,** or delete them.

If the editor warns that the query has "destructive operations", stop: neither script contains any.

## What each key answers

| Key | Question | Expected |
|---|---|---|
| `01_columns` | Do the columns the migration and the save use exist? | performances (5), performance_songs (8), all of user_songs and user_song_performances |
| `02_constraints` | Status values and the marker's uniqueness | `performances_status_check` allows `complete` (not `completed`); a UNIQUE on `user_song_performances (user_id, performance_id, normalized_title)` |
| `03_rls` | RLS on? | true on all four tables |
| `04_policies` | Who can write? | `performances_write` uses `can_write_for(user_id)`; `user_songs_self` / `user_song_performances_self` use `user_id = auth.uid()` |
| `05_access_functions` | The team role allowlist | `can_write_for` allows manager, tour_manager, band_member |
| `06a_name_clashes` | Do the new function names already exist? | `[]` |
| `06b_triggers` | Existing triggers | none named `performances_record_catalog`; none writing the catalogue |
| `07_default_function_acl` | Do new functions get EXECUTE for anon/authenticated by default? | yes, which is why the migration revokes it explicitly |
| `role` | Who will own the SECURITY DEFINER functions | a role with `bypass_rls: true` (e.g. postgres) |
| `09_indexes` | Lookup index | none on `user_songs (user_id, song_title)` today |
| `10_sizes`, `15_catalogue_rows_per_artist` | Lookup cost | rows and size; rows per artist |
| `12_duplicate_catalogue_rows` | Existing split rows | duplicate sets for the same artist and title |
| `13_marker_key_equivalence` | Do today's markers match the migration's key? | `matched` close to `markers`; renamed or removed songs and deleted shows legitimately don't match |
| `14_planned_rows_on_complete_shows` | Planned rows on completed shows | informational |

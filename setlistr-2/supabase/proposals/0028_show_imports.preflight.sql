-- 0028 preflight: READ-ONLY queries to run on production before asking to
-- apply 0028_show_imports.sql. NOT RUN YET. Each says what it settles and
-- what the disposable stack returned (the state 0028 was tested against).
-- Every statement is a SELECT; run in a read-only transaction:
BEGIN READ ONLY;

-- 1. shows columns. Settles: created_at exists (Undo compares it with
--    updated_at); timezone is NOT NULL DEFAULT 'UTC' (0028 stores 'UTC' as
--    "not recorded"); none of the new columns exist yet.
--    Disposable: id, created_by, status (NOT NULL, default 'live'), name,
--    show_type, started_at, scheduled_at, timezone (NOT NULL, 'UTC'), venue_id,
--    created_at (default now()), updated_at (default now()), ended_at,
--    scheduled_by, scheduled_by_name.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shows' ORDER BY ordinal_position;

-- 2. shows constraints. Settles: whether a status CHECK exists that would
--    reject 'listed' (0028 stops if it finds one).
--    Disposable: shows_pkey, three foreign keys, no CHECK constraint.
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.shows'::regclass ORDER BY conname;

-- 3. shows statuses in use. Settles: 'listed' is unused, and nothing outside
--    scheduled/live/completed/cancelled exists.
--    Disposable: cancelled, completed, live, scheduled.
SELECT status, count(*) FROM public.shows GROUP BY status ORDER BY status;

-- 4. Triggers on shows. Settles: exactly the four expected triggers, none
--    calling out (no Notion or webhook trigger on shows), so a listing has
--    no automatic effects. New 0028 triggers sort between them by name.
--    Disposable: shows_bump_updated_at, shows_enforce_schedule_start_guard,
--    shows_lock_owner, shows_reject_scheduled_delete.
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid = 'public.shows'::regclass AND NOT tgisinternal ORDER BY tgname;

-- 5. Tables referencing shows. Settles: what Undo must check before
--    deleting (a delete would unlink or cascade). 0028 stops if this differs.
--    Disposable: performances.show_id ON DELETE SET NULL; setlists.show_id
--    ON DELETE CASCADE.
SELECT conrelid::regclass AS referencing_table, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE confrelid = 'public.shows'::regclass AND contype = 'f' ORDER BY 1;

-- 6. The four functions 0028 replaces, plus the schedule edit RPC whose
--    behaviour it relies on. Settles: production's bodies are the ones the
--    diffs were made from (otherwise 0028 would overwrite unseen changes).
--    Disposable md5(prosrc):
--      enforce_schedule_start_guard                  b87fe954f0954ec04333f67ab7450256
--      patch_scheduled_show_with_venue               3f13fac755997fd520de663778629ea4
--      reject_performance_insert_for_scheduled_show  5d68c899087f9613b524eb796e8fefb9
--      reject_scheduled_show_delete                  6e6ba7f5b38163333b04730a05fd01a3
--      start_scheduled_show                          a2a6374a2db6774ffbc7a59d0c590b7b
SELECT p.proname, md5(p.prosrc), p.prosecdef, pg_get_userbyid(p.proowner)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('enforce_schedule_start_guard', 'patch_scheduled_show_with_venue',
  'reject_performance_insert_for_scheduled_show', 'reject_scheduled_show_delete', 'start_scheduled_show') ORDER BY 1;

-- 7. Access helpers 0028 calls. Settles: can_write_for / can_act_for are the
--    role-allowlist versions (Viewer, revoked and pending refused).
SELECT p.proname, md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('can_write_for', 'can_act_for') ORDER BY 1;

-- 8. No name collisions. Settles: none of 0028's objects or session flags exist.
--    Disposable: no rows.
SELECT 'relation' AS kind, relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('show_import_batches', 'shows_import_row_date')
UNION ALL SELECT 'function', proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('import_shows', 'undo_show_import', 'show_records_fingerprint', 'is_real_time_zone', 'shows_import_provenance', 'shows_local_fields_consistent')
UNION ALL SELECT 'flag user', proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (prosrc LIKE '%allow_show_import%' OR prosrc LIKE '%allow_import_undo%');

-- 9. Server features 0028 uses. Settles: sha256(), hashtextextended() and
--    the time-zone database are present (PostgreSQL 11+).
--    Disposable: PostgreSQL 17, America/New_York present.
SELECT version(), (SELECT count(*) FROM pg_timezone_names WHERE name = 'America/New_York') AS tz_present,
  to_regprocedure('sha256(bytea)') IS NOT NULL AS has_sha256, to_regprocedure('hashtextextended(text,bigint)') IS NOT NULL AS has_hashtextextended;

-- 10. Policies on shows, venues and performances. Settles: shows writes are
--     limited to can_write_for (0016), so import fields can only be set
--     through import_shows (plus 0028's insert guard).
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('shows', 'venues', 'performances') ORDER BY 1, 2;

-- 11. Triggers on performances. Settles: catalogue and Notion effects hang
--     off performances only; a listing creates no performance, so none fire.
--     Disposable: notion_show_count, performances_lock_links,
--     performances_lock_owner, performances_record_catalog,
--     performances_reject_scheduled_bypass, performances_require_authorized_creation.
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.performances'::regclass AND NOT tgisinternal ORDER BY 1;

-- 12. Open question from the timeline plan: performances.performance_date's
--     type (start_scheduled_show writes local_date into it).
--     Disposable: timestamp with time zone.
SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performances' AND column_name = 'performance_date';

ROLLBACK;

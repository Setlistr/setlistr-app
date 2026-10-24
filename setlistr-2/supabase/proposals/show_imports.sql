-- PROPOSAL ONLY: spreadsheet import for Schedule (docs/spreadsheet-import-plan.md).
-- Not a migration. Not applied anywhere. Requires approval, then the read-only
-- production checks below, before it becomes supabase/migrations/00NN_*.sql.
--
-- Additive: one table, three nullable columns on shows, one status value, two
-- functions, and narrow changes to the scheduling guard and start function
-- from 0020. Nothing existing is dropped. Performances are never written.

-- ── Read-only production checks (run first, with approval) ─────────────────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'shows' order by ordinal_position;
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.shows'::regclass;
-- select tgname, pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'public.shows'::regclass and not tgisinternal;
-- select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename in ('shows', 'venues');
-- select data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'performances' and column_name = 'performance_date';

BEGIN;

-- ── 1. Batches: provenance for each import ─────────────────────────────────
CREATE TABLE public.show_import_batches (
  id uuid PRIMARY KEY,                               -- client-generated; idempotency key
  artist_id uuid NOT NULL REFERENCES public.profiles(id),
  imported_by uuid NOT NULL REFERENCES public.profiles(id),
  imported_by_name text,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  sheet_name text CHECK (char_length(sheet_name) <= 200),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  column_mapping jsonb NOT NULL,                     -- heading -> field; headings only, no cell values
  date_order text NOT NULL CHECK (date_order IN ('DMY', 'MDY', 'YMD', 'ISO')),
  row_count int NOT NULL CHECK (row_count BETWEEN 1 AND 500),
  imported_count int NOT NULL,
  skipped_count int NOT NULL,
  status text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'undone')),
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.show_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "show_import_batches_read" ON public.show_import_batches
  FOR SELECT USING (can_act_for(artist_id));
-- No insert/update/delete policies: writes only through the functions below.

-- ── 2. Show columns ─────────────────────────────────────────────────────────
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.show_import_batches(id);
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS source_row int;
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS local_date date;   -- calendar date as written
ALTER TABLE public.shows ADD CONSTRAINT shows_import_source_pair
  CHECK ((import_batch_id IS NULL) = (source_row IS NULL));
ALTER TABLE public.shows ADD CONSTRAINT shows_planned_has_date
  CHECK (status NOT IN ('scheduled', 'listed') OR scheduled_at IS NOT NULL OR local_date IS NOT NULL);
CREATE INDEX IF NOT EXISTS shows_import_batch_idx ON public.shows (import_batch_id) WHERE import_batch_id IS NOT NULL;
-- 'listed' = an imported past show: not known to have been performed, never
-- upcoming, never startable. If the production check finds a status CHECK
-- constraint, extend it here to include 'listed'.

-- ── 3. Guard trigger (replaces 0020's function body; same trigger) ──────────
-- Changes: schedule fields stay editable while status is 'scheduled' OR
-- 'listed'; local_date joins the locked fields; 'listed' -> 'live' is refused.
--   v_schedule_fields_changed := (... existing five ... OR NEW.local_date IS DISTINCT FROM OLD.local_date);
--   IF OLD.status = 'listed' AND NEW.status = 'live' THEN RAISE EXCEPTION 'SHOW_NOT_STARTABLE' ...;
--   IF OLD.status NOT IN ('scheduled', 'listed') AND v_schedule_fields_changed THEN RAISE 'SCHEDULE_LOCKED';
-- reject_scheduled_show_delete(): also covers 'listed', and allows the delete
-- when current_setting('app.allow_import_undo', true) = 'true' (set only
-- inside undo_show_import, transaction-local).

-- ── 4. start_scheduled_show (0020) ─────────────────────────────────────────
-- performance_date := COALESCE(v_show.local_date,
--                              (v_show.scheduled_at AT TIME ZONE v_show.timezone)::date,
--                              CURRENT_DATE);
-- and an explicit branch: IF v_show.status = 'listed' THEN RAISE 'SHOW_NOT_STARTABLE'.

-- ── 5. import_shows ────────────────────────────────────────────────────────
-- p_batch: { id, artist_id, file_name, sheet_name, file_sha256, column_mapping,
--            date_order, row_count, skipped_count }
-- p_rows:  [{ source_row, local_date, scheduled_at|null, timezone|null,
--             venue_id|null, venue_name, venue_city, venue_country, name|null }]
-- Sketch:
--   v_actor := auth.uid(); NOT_AUTHENTICATED if null.
--   can_write_for(p_batch.artist_id) or NOT_AUTHORIZED.
--   If a batch with this id exists: same actor and artist -> return its shows
--     (retry); otherwise BATCH_ID_CONFLICT.
--   jsonb_array_length(p_rows) between 1 and 500.
--   Per row (all or nothing):
--     - local_date required; scheduled_at only with a real IANA timezone
--       (pg_timezone_names, and not 'UTC'/'Etc/UTC').
--     - upcoming := timezone is real AND local_date >= (now() AT TIME ZONE timezone)::date.
--       Without a zone, the row must satisfy local_date < (now() AT TIME ZONE 'Etc/GMT+12')::date
--       (ended everywhere), else ZONE_REQUIRED.
--     - status := CASE WHEN upcoming THEN 'scheduled' ELSE 'listed' END.
--     - venue_id, when given, must already be referenced by this artist's
--       shows or performances; otherwise insert venues(name, city, country).
--     - INSERT shows (created_by = artist, venue_id, scheduled_at, local_date,
--       timezone = COALESCE(real zone, 'UTC'), name, show_type 'single', status,
--       scheduled_by = v_actor, scheduled_by_name, import_batch_id, source_row).
--   INSERT the batch row first (imported_count = row count).
-- SECURITY DEFINER, SET search_path = ''. GRANT EXECUTE TO authenticated only.

-- ── 6. undo_show_import ────────────────────────────────────────────────────
-- Sketch:
--   can_write_for(batch.artist_id); batch.status = 'imported'.
--   set_config('app.allow_import_undo', 'true', true);
--   DELETE FROM shows s WHERE s.import_batch_id = p_batch
--     AND s.status IN ('scheduled', 'listed')
--     AND s.updated_at = s.created_at            -- never edited (bump trigger)
--     AND NOT EXISTS (SELECT 1 FROM performances p WHERE p.show_id = s.id);
--   set_config('app.allow_import_undo', 'false', true);
--   UPDATE batch SET status = 'undone', undone_at = now(), undone_by = auth.uid();
--   RETURN the source_row of every kept show.
-- Depends on shows.created_at existing (production check above).

ROLLBACK;  -- proposal: never commits

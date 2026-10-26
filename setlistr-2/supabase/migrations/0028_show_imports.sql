-- 0028_show_imports.sql — PROPOSAL, NOT APPLIED TO PRODUCTION.
-- Spreadsheet import for Schedule (docs/spreadsheet-import-plan.md).
-- Validated on the disposable stack only (see 0028_show_imports.test.sh).
--
-- Additive: one table, four nullable columns and four constraints on shows,
-- two new triggers, four new functions. Four existing functions change by
-- the lines marked "0028" (diffs in the plan): the schedule guard, the
-- scheduled-delete guard, the performance-insert guard and
-- start_scheduled_show. No existing row changes. Performances are never
-- written by an import.
BEGIN;

-- ── 0. Preconditions: stop if production differs from what this was
--    written and tested against (docs/spreadsheet-import-plan.md, preflight).
DO $$
BEGIN
  -- Production constrains status to the four scheduling values
  -- (shows_status_check, preflight 2); 0028 extends exactly that check with
  -- 'listed' below. Any other status check is a difference to review first.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.shows'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
             AND (conname <> 'shows_status_check' OR pg_get_constraintdef(oid) <> 'CHECK ((status = ANY (ARRAY[''scheduled''::text, ''live''::text, ''completed''::text, ''cancelled''::text])))')) THEN
    RAISE EXCEPTION '0028: shows has a status CHECK constraint other than the reviewed four-value shows_status_check';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'created_at') THEN
    RAISE EXCEPTION '0028: shows.created_at is required (Undo compares it with updated_at)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shows' AND column_name IN ('local_date', 'local_time', 'import_batch_id', 'source_row')) THEN
    RAISE EXCEPTION '0028: shows already has an import column';
  END IF;
  -- undo_show_import checks every table that references shows, read from
  -- the catalogue when it runs; it handles single-column references only.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid = 'public.shows'::regclass AND contype = 'f' AND array_length(conkey, 1) <> 1) THEN
    RAISE EXCEPTION '0028: a multi-column reference to shows exists; undo_show_import must be extended for it';
  END IF;
END $$;

-- ── 0b. Allow 'listed' where status is constrained (production) ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.shows'::regclass AND conname = 'shows_status_check') THEN
    ALTER TABLE public.shows DROP CONSTRAINT shows_status_check;
    ALTER TABLE public.shows ADD CONSTRAINT shows_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'live'::text, 'completed'::text, 'cancelled'::text, 'listed'::text]));
  END IF;
END $$;

-- ── 1. Import batches: provenance and the import result ─────────────────
-- No cell values and no file: the file name and hash (to recognise a
-- re-import), the date order used, counts, and skipped row numbers with a
-- fixed reason code.
CREATE TABLE public.show_import_batches (
  id               uuid PRIMARY KEY,                    -- client-generated; the idempotency key
  artist_id        uuid NOT NULL REFERENCES public.profiles(id),
  imported_by      uuid NOT NULL REFERENCES public.profiles(id),
  imported_by_name text,
  file_name        text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  sheet_name       text CHECK (char_length(sheet_name) <= 200),
  file_sha256      text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  date_order       text NOT NULL CHECK (date_order IN ('DMY', 'MDY', 'YMD', 'ISO', 'TEXT')),
  row_count        int  NOT NULL CHECK (row_count BETWEEN 1 AND 500),
  imported_count   int  NOT NULL CHECK (imported_count >= 1),
  skipped_rows     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(skipped_rows) = 'array'),
  request_hash     text NOT NULL,
  status           text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'undone', 'partly_undone')),
  undo_result      jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  undone_at        timestamptz,
  undone_by        uuid REFERENCES public.profiles(id)
);
CREATE INDEX show_import_batches_artist_idx ON public.show_import_batches (artist_id, created_at DESC);
ALTER TABLE public.show_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY show_import_batches_read ON public.show_import_batches FOR SELECT TO authenticated USING (public.can_act_for(artist_id));
REVOKE ALL ON public.show_import_batches FROM anon, authenticated;
GRANT SELECT ON public.show_import_batches TO authenticated;

-- ── 2. Show columns ─────────────────────────────────────────────────────
-- local_date / local_time: the calendar date and wall-clock time as booked.
-- scheduled_at stays the instant, and exists only when a time AND a real
-- zone are known. A date-only booking has local_time NULL (no invented
-- midnight); a time whose zone isn't recorded keeps local_time with no
-- instant. Kept consistent by shows_local_fields_consistent below.
ALTER TABLE public.shows
  ADD COLUMN import_batch_id uuid REFERENCES public.show_import_batches(id),
  ADD COLUMN source_row int CHECK (source_row >= 1),
  ADD COLUMN local_date date,
  ADD COLUMN local_time time;
ALTER TABLE public.shows ADD CONSTRAINT shows_import_source_pair CHECK ((import_batch_id IS NULL) = (source_row IS NULL));
ALTER TABLE public.shows ADD CONSTRAINT shows_local_time_needs_date CHECK (local_time IS NULL OR local_date IS NOT NULL);
ALTER TABLE public.shows ADD CONSTRAINT shows_listed_is_imported CHECK (status <> 'listed' OR (import_batch_id IS NOT NULL AND local_date IS NOT NULL));
ALTER TABLE public.shows ADD CONSTRAINT shows_planned_has_date CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL OR local_date IS NOT NULL);
CREATE UNIQUE INDEX shows_import_row_date ON public.shows (import_batch_id, source_row, local_date) WHERE import_batch_id IS NOT NULL;

-- ── 3. New triggers ─────────────────────────────────────────────────────
-- Import fields are written only by import_shows(), and provenance never
-- changes afterwards.
CREATE OR REPLACE FUNCTION public.shows_import_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.import_batch_id IS NOT NULL OR NEW.source_row IS NOT NULL OR NEW.local_date IS NOT NULL OR NEW.local_time IS NOT NULL OR NEW.status = 'listed')
       AND current_setting('app.allow_show_import', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'IMPORT_FIELDS_RESERVED' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id OR NEW.source_row IS DISTINCT FROM OLD.source_row THEN
    RAISE EXCEPTION 'IMPORT_PROVENANCE_IMMUTABLE' USING ERRCODE = '42501';
  ELSIF NEW.import_batch_id IS NOT NULL THEN
    -- Any update marks an imported row as used, even in the transaction
    -- that inserted it (now() would equal created_at there); Undo relies
    -- on updated_at = created_at meaning "never touched".
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shows_import_provenance BEFORE INSERT OR UPDATE ON public.shows
  FOR EACH ROW EXECUTE FUNCTION public.shows_import_provenance();

-- local_date/local_time are authoritative for what was booked; scheduled_at
-- is that wall time read in the show's zone. When an existing path (the
-- schedule edit) changes only the instant, the local fields follow it.
-- Fires after shows_enforce_schedule_start_guard (triggers run by name).
CREATE OR REPLACE FUNCTION public.shows_local_fields_consistent()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.local_date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.scheduled_at IS NOT NULL
     AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.timezone IS DISTINCT FROM OLD.timezone)
     AND NEW.local_date IS NOT DISTINCT FROM OLD.local_date AND NEW.local_time IS NOT DISTINCT FROM OLD.local_time THEN
    NEW.local_date := (NEW.scheduled_at AT TIME ZONE NEW.timezone)::date;
    NEW.local_time := (NEW.scheduled_at AT TIME ZONE NEW.timezone)::time;
  END IF;
  IF NEW.scheduled_at IS NOT NULL AND (
       NEW.local_time IS NULL OR NEW.timezone IN ('UTC', 'Etc/UTC')
       OR (NEW.scheduled_at AT TIME ZONE NEW.timezone) <> (NEW.local_date + NEW.local_time)) THEN
    RAISE EXCEPTION 'SHOW_LOCAL_FIELDS_INCONSISTENT' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shows_local_fields_consistent BEFORE INSERT OR UPDATE ON public.shows
  FOR EACH ROW EXECUTE FUNCTION public.shows_local_fields_consistent();

-- ── 4. Helpers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_real_time_zone(p_zone text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  -- A named IANA zone ("Area/City"): never UTC (the "not recorded" value),
  -- an Etc/ fixed offset or an abbreviation such as EST.
  SELECT p_zone IS NOT NULL AND p_zone LIKE '%/%' AND p_zone NOT LIKE 'Etc/%'
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_zone)
$$;

-- What the review was checked against: changes to the artist's shows or
-- performances (added, edited, deleted) change it. import_shows() compares
-- it again under the import lock.
CREATE OR REPLACE FUNCTION public.show_records_fingerprint(p_artist uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.can_write_for(p_artist) IS NOT TRUE THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN md5(concat_ws('|',
    (SELECT count(*) || ':' || coalesce(max(greatest(created_at, updated_at))::text, '') FROM public.shows WHERE created_by = p_artist),
    (SELECT count(*) || ':' || coalesce(max(greatest(created_at, updated_at, deleted_at))::text, '') FROM public.performances WHERE user_id = p_artist)));
END;
$$;

-- ── 5. import_shows: all or nothing ─────────────────────────────────────
-- p_batch: { id, artist_id, file_name, sheet_name, file_sha256, date_order, row_count, skipped_rows: [{row, reason}] }
-- p_rows:  [{ source_row, local_date, local_time?, timezone?, scheduled_at?, expect: 'scheduled'|'listed',
--             venue_id?, venue_name, venue_city?, venue_country?, name? }]
-- p_fingerprint: show_records_fingerprint() as read for the review.
CREATE OR REPLACE FUNCTION public.import_shows(p_batch jsonb, p_rows jsonb, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_artist uuid := (p_batch->>'artist_id')::uuid;
  v_batch_id uuid := (p_batch->>'id')::uuid;
  v_hash text := encode(sha256(convert_to(p_batch::text || '|' || p_rows::text, 'UTF8')), 'hex');
  v_existing public.show_import_batches%ROWTYPE;
  v_name text;
  v_row jsonb;
  v_skip jsonb;
  v_zone text;
  v_date date;
  v_time time;
  v_at timestamptz;
  v_status text;
  v_venue uuid;
  v_venues jsonb := '{}'::jsonb;
  v_key text;
  v_show uuid;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501'; END IF;
  IF v_artist IS NULL OR v_batch_id IS NULL THEN RAISE EXCEPTION 'BAD_REQUEST' USING ERRCODE = '22023'; END IF;
  -- Permission is checked here, at commit, not only when the review loaded.
  IF public.can_write_for(v_artist) IS NOT TRUE THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;

  -- One import at a time per artist workspace.
  PERFORM pg_advisory_xact_lock(hashtextextended('show_import:' || v_artist::text, 0));

  -- A retry (double tap, lost response) returns the first result.
  SELECT * INTO v_existing FROM public.show_import_batches WHERE id = v_batch_id;
  IF FOUND THEN
    IF v_existing.imported_by = v_actor AND v_existing.artist_id = v_artist AND v_existing.request_hash = v_hash THEN
      RETURN jsonb_build_object('batch_id', v_batch_id, 'result', 'already_imported', 'status', v_existing.status,
        'shows', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'source_row', source_row, 'local_date', local_date, 'status', status) ORDER BY source_row, local_date), '[]'::jsonb)
                  FROM public.shows WHERE import_batch_id = v_batch_id));
    END IF;
    RAISE EXCEPTION 'BATCH_ID_CONFLICT' USING ERRCODE = '23505';
  END IF;

  -- Anything added or changed since the review ran its duplicate check
  -- (another import, a teammate's Add a show, a capture) sends it back.
  IF p_fingerprint IS DISTINCT FROM public.show_records_fingerprint(v_artist) THEN
    RAISE EXCEPTION 'IMPORT_STALE' USING ERRCODE = '40001';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'BAD_ROWS' USING ERRCODE = '22023';
  END IF;
  FOR v_skip IN SELECT * FROM jsonb_array_elements(coalesce(p_batch->'skipped_rows', '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_skip->'row') <> 'number' OR (v_skip->>'reason') NOT IN (
      'no_date', 'skipped_by_you', 'possible_duplicate_skipped', 'unresolved_date_order', 'unresolved_year', 'unresolved_dates',
      'unresolved_venue', 'unresolved_time_zone', 'unresolved_time', 'unresolved_duplicate', 'not_a_date',
      'already_imported', 'unconfirmed_date_number') OR (SELECT count(*) FROM jsonb_object_keys(v_skip)) <> 2 THEN
      RAISE EXCEPTION 'BAD_SKIPPED_ROWS' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT coalesce(nullif(trim(artist_name), ''), full_name) INTO v_name FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.show_import_batches (id, artist_id, imported_by, imported_by_name, file_name, sheet_name, file_sha256, date_order,
    row_count, imported_count, skipped_rows, request_hash)
  VALUES (v_batch_id, v_artist, v_actor, v_name, p_batch->>'file_name', p_batch->>'sheet_name', p_batch->>'file_sha256', p_batch->>'date_order',
    (p_batch->>'row_count')::int, jsonb_array_length(p_rows), coalesce(p_batch->'skipped_rows', '[]'::jsonb), v_hash);

  PERFORM set_config('app.allow_show_import', 'true', true);
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_date := (v_row->>'local_date')::date;
    v_time := nullif(v_row->>'local_time', '')::time;
    v_zone := nullif(v_row->>'timezone', '');
    v_at := nullif(v_row->>'scheduled_at', '')::timestamptz;
    IF v_date IS NULL OR (v_row->>'source_row')::int IS NULL OR nullif(trim(v_row->>'venue_name'), '') IS NULL THEN
      RAISE EXCEPTION 'ROW_INCOMPLETE' USING ERRCODE = '22023', DETAIL = v_row->>'source_row';
    END IF;
    IF v_zone IS NOT NULL AND NOT public.is_real_time_zone(v_zone) THEN
      RAISE EXCEPTION 'ROW_BAD_TIME_ZONE' USING ERRCODE = '22023', DETAIL = v_row->>'source_row';
    END IF;
    -- The instant exists exactly when a time and a zone do; the
    -- consistency trigger then checks it reads back as the booked time
    -- (a repeated DST time may be either instant; a skipped one is neither).
    IF (v_at IS NOT NULL) <> (v_time IS NOT NULL AND v_zone IS NOT NULL) THEN
      RAISE EXCEPTION 'ROW_INSTANT_MISMATCH' USING ERRCODE = '22023', DETAIL = v_row->>'source_row';
    END IF;
    -- Upcoming on the show's own clock. Without a zone, a row is past only
    -- once its date has ended everywhere (UTC-12); otherwise it needs one.
    IF v_zone IS NOT NULL THEN
      v_status := CASE WHEN v_date >= (now() AT TIME ZONE v_zone)::date THEN 'scheduled' ELSE 'listed' END;
    ELSIF v_date < (now() AT TIME ZONE 'Etc/GMT+12')::date THEN
      v_status := 'listed';
    ELSE
      RAISE EXCEPTION 'ROW_NEEDS_TIME_ZONE' USING ERRCODE = '22023', DETAIL = v_row->>'source_row';
    END IF;
    -- What the person reviewed must still hold (a date can pass overnight).
    IF v_status IS DISTINCT FROM (v_row->>'expect') THEN
      RAISE EXCEPTION 'ROW_CHANGED_SINCE_REVIEW' USING ERRCODE = '40001', DETAIL = v_row->>'source_row';
    END IF;

    IF nullif(v_row->>'venue_id', '') IS NOT NULL THEN
      v_venue := (v_row->>'venue_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.shows WHERE created_by = v_artist AND venue_id = v_venue)
         AND NOT EXISTS (SELECT 1 FROM public.performances WHERE user_id = v_artist AND venue_id = v_venue) THEN
        RAISE EXCEPTION 'VENUE_NOT_IN_RECORDS' USING ERRCODE = '22023', DETAIL = v_row->>'source_row';
      END IF;
    ELSE
      v_key := lower(trim(v_row->>'venue_name')) || '|' || lower(coalesce(trim(v_row->>'venue_city'), '')) || '|' || lower(coalesce(trim(v_row->>'venue_country'), ''));
      v_venue := (v_venues->>v_key)::uuid;
      IF v_venue IS NULL THEN
        INSERT INTO public.venues (name, city, country)
        VALUES (trim(v_row->>'venue_name'), nullif(trim(v_row->>'venue_city'), ''), nullif(trim(v_row->>'venue_country'), ''))
        RETURNING id INTO v_venue;
        v_venues := v_venues || jsonb_build_object(v_key, v_venue);
      END IF;
    END IF;

    INSERT INTO public.shows (created_by, status, name, show_type, venue_id, scheduled_at, timezone, local_date, local_time,
      scheduled_by, scheduled_by_name, import_batch_id, source_row)
    VALUES (v_artist, v_status, nullif(trim(v_row->>'name'), ''), 'single', v_venue, v_at, coalesce(v_zone, 'UTC'), v_date, v_time,
      v_actor, v_name, v_batch_id, (v_row->>'source_row')::int)
    RETURNING id INTO v_show;
    v_out := v_out || jsonb_build_object('id', v_show, 'source_row', (v_row->>'source_row')::int, 'local_date', v_date, 'status', v_status);
  END LOOP;
  PERFORM set_config('app.allow_show_import', 'false', true);

  RETURN jsonb_build_object('batch_id', v_batch_id, 'result', 'imported', 'status', 'imported', 'shows', v_out);
END;
$$;

-- ── 6a. Why an imported show must be kept (shared by Undo and its preview) ──
-- NULL when untouched. Called on a row the caller has locked (Undo), so a
-- concurrent start, edit or cancel is seen once it commits.
CREATE OR REPLACE FUNCTION public.import_show_use_reason(p_show_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_s public.shows%ROWTYPE;
  v_ref record;
  v_found boolean;
BEGIN
  SELECT * INTO v_s FROM public.shows WHERE id = p_show_id;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  FOR v_ref IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.confrelid = 'public.shows'::regclass AND c.contype = 'f'
    ORDER BY (c.conrelid = 'public.performances'::regclass) DESC, 1
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', v_ref.tbl, v_ref.col) INTO v_found USING p_show_id;
    IF v_found THEN
      RETURN CASE WHEN v_ref.tbl IN ('public.performances', 'public.capture_sessions', 'public.audio_captures') THEN 'capture_linked'
                  WHEN v_ref.tbl = 'public.setlists' THEN 'setlist_attached' ELSE 'linked_record' END;
    END IF;
  END LOOP;
  RETURN CASE
    WHEN v_s.status IN ('live', 'completed') THEN 'started'
    WHEN v_s.status = 'cancelled' THEN 'cancelled'
    WHEN v_s.updated_at IS DISTINCT FROM v_s.created_at THEN 'edited'
    ELSE NULL END;
END;
$$;

-- Read-only preview for an import's result page: each show and why Undo
-- would keep it. Anyone who can see the artist's shows may read it.
CREATE OR REPLACE FUNCTION public.show_import_usage(p_batch_id uuid)
RETURNS TABLE(show_id uuid, reason text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_artist uuid;
BEGIN
  SELECT artist_id INTO v_artist FROM public.show_import_batches WHERE id = p_batch_id;
  IF v_artist IS NULL OR auth.uid() IS NULL OR public.can_act_for(v_artist) IS NOT TRUE THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT s.id, public.import_show_use_reason(s.id) FROM public.shows s WHERE s.import_batch_id = p_batch_id;
END;
$$;

-- ── 6. undo_show_import: removes only untouched rows ─────────────────────
-- Kept, with the reason: referenced by any other record (a capture,
-- capture session or audio capture; a setlist; show artists; a PRO report;
-- or any table that references shows, read from the catalogue each time),
-- started or completed, cancelled, or edited in any way since the import
-- (updated_at moves on every update). Deleting a show would otherwise unlink
-- (ON DELETE SET NULL) or delete (CASCADE) those records, so every reference
-- is checked explicitly, never left to the foreign keys. Repeat calls return
-- the first result.
CREATE OR REPLACE FUNCTION public.undo_show_import(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_batch public.show_import_batches%ROWTYPE;
  v_s record;
  v_reason text;
  v_removed jsonb := '[]'::jsonb;
  v_kept jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.show_import_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'BATCH_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF public.can_write_for(v_batch.artist_id) IS NOT TRUE THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('show_import:' || v_batch.artist_id::text, 0));
  SELECT * INTO v_batch FROM public.show_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.status <> 'imported' THEN RETURN v_batch.undo_result || jsonb_build_object('result', 'already_undone'); END IF;

  PERFORM set_config('app.allow_import_undo', 'true', true);
  FOR v_s IN SELECT * FROM public.shows WHERE import_batch_id = p_batch_id ORDER BY source_row, local_date FOR UPDATE LOOP
    v_reason := public.import_show_use_reason(v_s.id);
    IF v_reason IS NULL THEN
      DELETE FROM public.shows WHERE id = v_s.id;
      v_removed := v_removed || jsonb_build_object('source_row', v_s.source_row, 'local_date', v_s.local_date);
    ELSE
      v_kept := v_kept || jsonb_build_object('id', v_s.id, 'source_row', v_s.source_row, 'local_date', v_s.local_date, 'reason', v_reason);
    END IF;
  END LOOP;
  PERFORM set_config('app.allow_import_undo', 'false', true);

  v_result := jsonb_build_object('batch_id', p_batch_id, 'status', CASE WHEN jsonb_array_length(v_kept) = 0 THEN 'undone' ELSE 'partly_undone' END,
    'removed', v_removed, 'kept', v_kept);
  UPDATE public.show_import_batches SET status = v_result->>'status', undo_result = v_result, undone_at = now(), undone_by = v_actor WHERE id = p_batch_id;
  RETURN v_result || jsonb_build_object('result', 'undone_now');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_shows(jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.undo_show_import(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.show_records_fingerprint(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_real_time_zone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_shows(jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_show_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.show_records_fingerprint(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_real_time_zone(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.import_show_use_reason(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.show_import_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.show_import_usage(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.shows_import_provenance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shows_local_fields_consistent() FROM PUBLIC, anon, authenticated;

-- ── 7. Existing functions: minimal changes, marked 0028 ──────────────
CREATE OR REPLACE FUNCTION public.enforce_schedule_start_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_schedule_fields_changed boolean;
BEGIN
  -- scheduled_by/scheduled_by_name record who originally created the
  -- schedule — immutable after insert, regardless of status, same
  -- principle as shows_lock_owner already applies to created_by.
  IF NEW.scheduled_by IS DISTINCT FROM OLD.scheduled_by OR NEW.scheduled_by_name IS DISTINCT FROM OLD.scheduled_by_name THEN
    RAISE EXCEPTION 'SCHEDULED_BY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  v_schedule_fields_changed := (
    NEW.venue_id IS DISTINCT FROM OLD.venue_id
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
    OR NEW.timezone IS DISTINCT FROM OLD.timezone
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.show_type IS DISTINCT FROM OLD.show_type
    OR NEW.local_date IS DISTINCT FROM OLD.local_date      -- 0028
    OR NEW.local_time IS DISTINCT FROM OLD.local_time      -- 0028
  );

  -- 0028: an imported past listing never changes status, and nothing
  -- becomes a listing except through import_shows().
  IF (OLD.status = 'listed' OR NEW.status = 'listed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'LISTED_STATUS_LOCKED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'scheduled' AND NEW.status = 'live' THEN
    IF current_setting('app.allow_schedule_start', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'SCHEDULE_TRANSITION_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
    -- Even with the flag set, this transition may only ever touch
    -- status/started_at -- never used to smuggle an unrelated field edit
    -- (venue, date, owner) in alongside the sanctioned transition.
    IF v_schedule_fields_changed THEN
      RAISE EXCEPTION 'SCHEDULE_TRANSITION_FIELD_MISMATCH' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- "An edit must not win after capture has started": once a row has left
  -- 'scheduled' (now live/completed/cancelled), none of its schedule-
  -- specific fields may change through any path. Scoped to exactly these
  -- five columns, so it cannot affect the two existing live -> completed
  -- call sites (app/app/live/[id], app/app/review/[id]) -- neither of
  -- which ever touches venue_id/scheduled_at/timezone/name/show_type,
  -- confirmed by reading both.
  IF OLD.status != 'scheduled' AND v_schedule_fields_changed THEN
    RAISE EXCEPTION 'SCHEDULE_LOCKED' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_scheduled_show_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- 0028: listings are protected like scheduled shows; only
  -- undo_show_import() may delete either, for untouched imported rows.
  IF OLD.status IN ('scheduled', 'listed') AND current_setting('app.allow_import_undo', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'USE_CANCEL_NOT_DELETE' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_performance_insert_for_scheduled_show()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_show_status text;
BEGIN
  IF NEW.show_id IS NOT NULL THEN
    SELECT status INTO v_show_status FROM public.shows WHERE id = NEW.show_id;
    -- 0028: a listing is never captured or linked.
    IF v_show_status = 'listed' THEN
      RAISE EXCEPTION 'PERFORMANCE_FOR_LISTED_SHOW' USING ERRCODE = '42501';
    END IF;
    IF v_show_status = 'scheduled' AND current_setting('app.allow_schedule_start', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'PERFORMANCE_INSERT_BYPASSES_SCHEDULE_START' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_scheduled_show(p_show_id uuid)
 RETURNS TABLE(performance_id uuid, already_started boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_show public.shows%ROWTYPE;
  v_venue public.venues%ROWTYPE;
  v_existing_perf public.performances%ROWTYPE;
  v_actor uuid := auth.uid();
  v_full_name text;
  v_artist_name text;
  v_display_name text;
  v_owner_full_name text;
  v_owner_artist_name text;
  v_performance_artist_name text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_show FROM public.shows WHERE id = p_show_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF public.can_write_for(v_show.created_by) IS NOT TRUE THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF v_show.status = 'scheduled' THEN
    IF v_show.venue_id IS NULL THEN
      RAISE EXCEPTION 'SHOW_MISSING_VENUE' USING ERRCODE = 'P0001';
    END IF;
    -- 0028: a date-only booking (imported, no start time yet) needs a time
    -- before capture can start; Schedule offers "Add a start time" instead.
    IF v_show.scheduled_at IS NULL THEN
      RAISE EXCEPTION 'SHOW_NEEDS_START_TIME' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_venue FROM public.venues WHERE id = v_show.venue_id;

    SELECT full_name, artist_name INTO v_full_name, v_artist_name
    FROM public.profiles WHERE id = v_actor;
    v_display_name := COALESCE(v_artist_name, v_full_name);

    -- performances.artist_name names the PERFORMING ARTIST (the show's
    -- owner) -- distinct from v_display_name above, which names whoever
    -- is physically starting it and only ever feeds captured_by_name.
    -- NULLIF/TRIM so a blank or whitespace-only name counts as missing,
    -- not a literal empty string silently stored.
    SELECT full_name, artist_name INTO v_owner_full_name, v_owner_artist_name
    FROM public.profiles WHERE id = v_show.created_by;
    v_performance_artist_name := COALESCE(NULLIF(TRIM(v_owner_artist_name), ''), NULLIF(TRIM(v_owner_full_name), ''));
    IF v_performance_artist_name IS NULL THEN
      RAISE EXCEPTION 'SHOW_OWNER_MISSING_NAME' USING ERRCODE = 'P0001';
    END IF;

    -- Must be set BEFORE the performances INSERT below, not just before
    -- the shows UPDATE that follows it — performances_reject_scheduled_
    -- bypass (the raw-INSERT guard) checks this same flag on INSERT.
    PERFORM set_config('app.allow_schedule_start', 'true', true);

    INSERT INTO public.performances (
      show_id, user_id, performance_date, venue_name, venue_id, city, country,
      status, started_at, started_by, captured_by, captured_by_name,
      venue_latitude, venue_longitude, artist_name
    ) VALUES (
      v_show.id, v_show.created_by,
      -- Scheduled calendar date, in the show's own stored timezone --
      -- deliberately independent of started_at below (see the app-layer
      -- note on preserving scheduled-vs-actual timing).
      COALESCE(v_show.local_date, (v_show.scheduled_at AT TIME ZONE v_show.timezone)::date, CURRENT_DATE),  -- 0028: local_date first
      COALESCE(v_venue.name, 'Unknown Venue'), v_show.venue_id, v_venue.city, v_venue.country,
      'live', now(), v_actor,
      CASE WHEN v_actor = v_show.created_by THEN NULL ELSE v_actor END,
      CASE WHEN v_actor = v_show.created_by THEN NULL ELSE v_display_name END,
      v_venue.latitude, v_venue.longitude, v_performance_artist_name
    ) RETURNING id INTO performance_id;

    UPDATE public.shows SET status = 'live', started_at = now() WHERE id = v_show.id;
    PERFORM set_config('app.allow_schedule_start', 'false', true);

    already_started := false;
    RETURN NEXT; RETURN;
  END IF;

  IF v_show.status = 'live' THEN
    SELECT * INTO v_existing_perf FROM public.performances WHERE show_id = v_show.id ORDER BY created_at ASC LIMIT 1;
    IF FOUND AND v_existing_perf.started_by = v_actor THEN
      performance_id := v_existing_perf.id; already_started := true;
      RETURN NEXT; RETURN;
    END IF;
    RAISE EXCEPTION 'ALREADY_STARTED_BY_OTHER' USING ERRCODE = '40001';
  END IF;

  -- 0028: listings can't be started.
  IF v_show.status = 'listed' THEN
    RAISE EXCEPTION 'SHOW_NOT_STARTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF v_show.status = 'completed' THEN
    RAISE EXCEPTION 'SHOW_ALREADY_COMPLETED' USING ERRCODE = 'P0001';
  END IF;

  RAISE EXCEPTION 'SHOW_CANCELLED' USING ERRCODE = 'P0001';
END;
$function$
;

COMMIT;

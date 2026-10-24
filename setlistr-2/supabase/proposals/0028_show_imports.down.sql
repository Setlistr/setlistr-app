-- 0028_show_imports.down.sql — reverses 0028 exactly. Refuses while any
-- imported show exists: undo or keep them first (dropping the columns would
-- lose where they came from).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.shows WHERE import_batch_id IS NOT NULL OR local_date IS NOT NULL OR status = 'listed') THEN
    RAISE EXCEPTION '0028 down: imported shows exist';
  END IF;
END $$;
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
  );

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
  IF OLD.status = 'scheduled' THEN
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
      COALESCE((v_show.scheduled_at AT TIME ZONE v_show.timezone)::date, CURRENT_DATE),
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

  IF v_show.status = 'completed' THEN
    RAISE EXCEPTION 'SHOW_ALREADY_COMPLETED' USING ERRCODE = 'P0001';
  END IF;

  RAISE EXCEPTION 'SHOW_CANCELLED' USING ERRCODE = 'P0001';
END;
$function$

;

DROP TRIGGER shows_import_provenance ON public.shows;
DROP TRIGGER shows_local_fields_consistent ON public.shows;
DROP FUNCTION public.import_shows(jsonb, jsonb, text);
DROP FUNCTION public.undo_show_import(uuid);
DROP FUNCTION public.show_records_fingerprint(uuid);
DROP FUNCTION public.is_real_time_zone(text);
DROP FUNCTION public.shows_import_provenance();
DROP FUNCTION public.shows_local_fields_consistent();
DROP INDEX public.shows_import_row_date;
ALTER TABLE public.shows DROP CONSTRAINT shows_import_source_pair, DROP CONSTRAINT shows_local_time_needs_date,
  DROP CONSTRAINT shows_listed_is_imported, DROP CONSTRAINT shows_planned_has_date;
ALTER TABLE public.shows DROP COLUMN import_batch_id, DROP COLUMN source_row, DROP COLUMN local_date, DROP COLUMN local_time;
DROP TABLE public.show_import_batches;
COMMIT;

-- Fixes a demonstrated production failure: start_scheduled_show()'s
-- INSERT into performances never set artist_name. performances.artist_name
-- is NOT NULL on the real database with no default — confirmed directly
-- by reproducing the exact call against the real schema (not inferred):
--
--   ERROR: 23502: null value in column "artist_name" of relation
--   "performances" violates not-null constraint
--
-- This is schema drift, not a local/remote logic difference: local dev's
-- performances.artist_name is nullable, so the gap never surfaced there,
-- confirmed by checking information_schema.columns on both. Every other
-- NOT NULL column on performances without a default (performance_date,
-- user_id, venue_name) was already covered by the existing INSERT;
-- artist_name was the only one missing, confirmed by checking the full
-- column list, not just the one that happened to error first.
--
-- Also confirmed: the failure's own transaction rolled back atomically
-- (the show stayed 'scheduled', no orphan performance row), so retry
-- safety was never actually broken -- only the first attempt fails.
--
-- v_artist_name/v_full_name/v_display_name (already in the function)
-- name the ACTOR starting the show -- used correctly for captured_by_name
-- when a delegate starts it on the artist's behalf. artist_name on the
-- performance itself must name the PERFORMING ARTIST (the show's owner),
-- which is a different person when a manager starts it -- so this adds
-- a second, separate lookup rather than reusing the actor's name.
--
-- A blank or missing owner name (NULL, empty, or whitespace-only on both
-- profiles.artist_name and profiles.full_name) raises a distinct,
-- explicit error and creates no performance at all -- never a silently
-- substituted placeholder. This check runs before app.allow_schedule_start
-- is ever set, so a show that fails this way is left exactly as it was:
-- still 'scheduled', no performance row, safe to retry once the owner's
-- profile has a real name.
--
-- Additive to the function body only: no column, constraint, trigger, or
-- policy is touched. CREATE OR REPLACE — safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.start_scheduled_show(p_show_id uuid)
RETURNS TABLE(performance_id uuid, already_started boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
$$;

COMMIT;

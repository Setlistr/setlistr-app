-- Shared artist/manager show scheduling.
--
-- Confirmed against production (read-only inspection, not assumed):
-- shows.status already allows/defaults to 'scheduled', already supports
-- 'cancelled'; scheduled_at and updated_at already exist; RLS already
-- enforces can_act_for(created_by) for reads and can_write_for(created_by)
-- for writes with NO existing status restriction; shows_lock_owner
-- already rejects changing created_by on UPDATE; shows has NO
-- venue_name/city/country/coordinate columns of its own — only venue_id.
-- Current production data: 13 'live', 476 'completed', zero 'scheduled'
-- or 'cancelled' rows, so nothing here conflicts with existing data.
--
-- Everything below is additive. No existing column, constraint, or
-- policy on shows or performances is altered or dropped.

BEGIN;

-- ── 1. updated_at as the concurrency token ──────────────────────────────
-- The column already exists with a NOW() default, but nothing currently
-- bumps it on UPDATE (confirmed: shows_lock_owner is the only existing
-- trigger on this table, and it only guards created_by). Without this,
-- updated_at could not safely serve as an optimistic-concurrency token —
-- verified before relying on it, not assumed.
CREATE OR REPLACE FUNCTION public.bump_shows_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shows_bump_updated_at ON public.shows;
CREATE TRIGGER shows_bump_updated_at
  BEFORE UPDATE ON public.shows FOR EACH ROW
  EXECUTE FUNCTION public.bump_shows_updated_at();

-- ── 2. The one sanctioned scheduled -> live transition ──────────────────
-- Narrowly scoped to exactly this one transition so it can never affect
-- the existing, already-working live -> completed writes in
-- app/app/live/[id]/page.tsx and app/app/review/[id]/page.tsx, or any
-- completed -> completed resave/retry — none of those match this
-- condition. app.allow_schedule_start is set ONLY from inside
-- start_scheduled_show() below, transaction-local, immediately before its
-- own single UPDATE, and cleared right after — no function in this
-- migration exposes it as a directly callable RPC.
CREATE OR REPLACE FUNCTION public.enforce_schedule_start_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
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
$$;

DROP TRIGGER IF EXISTS shows_enforce_schedule_start_guard ON public.shows;
CREATE TRIGGER shows_enforce_schedule_start_guard
  BEFORE UPDATE ON public.shows FOR EACH ROW
  EXECUTE FUNCTION public.enforce_schedule_start_guard();

-- ── 3. Prefer cancel over hard-delete for scheduled rows only ───────────
-- Scoped to status = 'scheduled' only -- app/api/admin/delete-show/
-- route.ts already legitimately deletes live/completed shows today
-- (confirmed via its own code); that existing path is untouched.
CREATE OR REPLACE FUNCTION public.reject_scheduled_show_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'scheduled' THEN
    RAISE EXCEPTION 'USE_CANCEL_NOT_DELETE' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS shows_reject_scheduled_delete ON public.shows;
CREATE TRIGGER shows_reject_scheduled_delete
  BEFORE DELETE ON public.shows FOR EACH ROW
  EXECUTE FUNCTION public.reject_scheduled_show_delete();

-- ── 4. Close the raw-INSERT bypass on performances ──────────────────────
-- Without this, a write-capable delegate could INSERT a performances row
-- directly via plain PostgREST, show_id pointing at a still-'scheduled'
-- show, completely sidestepping start_scheduled_show()'s row lock and
-- single-performance guarantee. Reuses the exact same session flag.
CREATE OR REPLACE FUNCTION public.reject_performance_insert_for_scheduled_show()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
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
$$;

DROP TRIGGER IF EXISTS performances_reject_scheduled_bypass ON public.performances;
CREATE TRIGGER performances_reject_scheduled_bypass
  BEFORE INSERT ON public.performances FOR EACH ROW
  EXECUTE FUNCTION public.reject_performance_insert_for_scheduled_show();

-- ── 5. Explicit timezone for scheduled shows ────────────────────────────
-- Required so a scheduled show's date/time is never ambiguous relative to
-- the viewer's own device zone. Defaulted to UTC only for backfilling the
-- 476 existing completed/13 live rows (which never go through the new
-- scheduled state and never read this column) -- every NEW scheduled row
-- must set a real IANA zone explicitly at the application layer.
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- ── 5b. Visible creator attribution ──────────────────────────────────────
-- created_by is the ARTIST (owner) — unchanged, shows_lock_owner already
-- protects it. scheduled_by/scheduled_by_name record which ACTOR actually
-- created the schedule, distinct from ownership, so "Added by [manager
-- name]" can be shown when a delegate scheduled it on the artist's behalf.
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS scheduled_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.shows ADD COLUMN IF NOT EXISTS scheduled_by_name text;

-- ── 6. New attribution column ────────────────────────────────────────────
-- captured_by/captured_by_name already exist in production and keep their
-- existing "who captured on the artist's behalf" display meaning,
-- untouched. started_by is new: the actual initiating actor of a
-- schedule-start, recorded unconditionally (never inferred from
-- user_id/captured_by's ownership-based NULL convention) so same-actor
-- retry detection never depends on who happens to own the artist account.
ALTER TABLE public.performances ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES public.profiles(id);

-- ── 7. The one sanctioned transactional start ───────────────────────────
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

    -- Must be set BEFORE the performances INSERT below, not just before
    -- the shows UPDATE that follows it — performances_reject_scheduled_
    -- bypass (the raw-INSERT guard) checks this same flag on INSERT.
    PERFORM set_config('app.allow_schedule_start', 'true', true);

    INSERT INTO public.performances (
      show_id, user_id, performance_date, venue_name, venue_id, city, country,
      status, started_at, started_by, captured_by, captured_by_name,
      venue_latitude, venue_longitude
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
      v_venue.latitude, v_venue.longitude
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

REVOKE EXECUTE ON FUNCTION public.start_scheduled_show(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_scheduled_show(uuid) TO authenticated;

COMMIT;

-- Track already-live production access-control state in source control.
--
-- This migration changes NOTHING about production security behavior. The
-- function, policies, and views below were verified against the live
-- database exactly as they already run today (2026-09-03 final merge
-- audit) — this file exists only so the repo can reproduce that state from
-- source, closing a gap where can_act_for(), the delegate-aware
-- performances policies, and both *_visible views' security_invoker
-- setting existed only live in Supabase with no tracked migration.
--
-- Every statement is written to be safe to replay against a database
-- already in the target state (CREATE OR REPLACE, DROP POLICY IF EXISTS +
-- CREATE POLICY, idempotent REVOKE/GRANT) — replaying this migration is a
-- no-op on production, not a behavior change.

-- ── can_act_for(): true if the caller IS target, or is an accepted
-- delegate acting for target. Used by delegation-aware RLS policies so a
-- delegate with an accepted artist_delegates row can act on the artist's
-- rows exactly as the artist could. ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_act_for(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    auth.uid() = target
    or exists (
      select 1
      from artist_delegates
      where artist_delegates.artist_id = target
        and artist_delegates.delegate_id = auth.uid()
        and artist_delegates.accepted_at is not null
    );
$function$;

-- ── performances policies: superseded from plain auth.uid() = user_id
-- (as tracked in 0001_baseline.sql) to can_act_for(user_id), so an
-- accepted delegate can read/write and insert performances on the
-- artist's behalf. Postgres has no CREATE OR REPLACE POLICY, so this is
-- the standard idempotent-safe drop-then-recreate pattern. ─────────────
DROP POLICY IF EXISTS "performances_own" ON performances;
CREATE POLICY "performances_own" ON performances
  FOR ALL USING (can_act_for(user_id));

DROP POLICY IF EXISTS "users_insert_own_performance" ON performances;
CREATE POLICY "users_insert_own_performance" ON performances
  FOR INSERT WITH CHECK (can_act_for(user_id));

-- ── performances_visible: security_invoker=on so the view enforces RLS
-- as the calling role, not the view owner — copied verbatim from the
-- verified live definition, no columns added/removed/reordered. ────────
CREATE OR REPLACE VIEW public.performances_visible
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  venue_id,
  venue_name,
  city,
  country,
  artist_name,
  performance_date,
  start_time,
  set_duration_minutes,
  auto_close_buffer_minutes,
  status,
  started_at,
  ended_at,
  notes,
  created_at,
  updated_at,
  show_id,
  setlist_id,
  artist_id,
  submitted_to_pro,
  submitted_at,
  submission_notes,
  submission_status,
  captured_by,
  captured_by_name,
  latitude,
  longitude,
  data_source,
  show_number,
  photo_url,
  recording_path,
  setlist_path,
  setlist_photo_url,
  deleted_at,
  venue_latitude,
  venue_longitude,
  location_distance_from_venue,
  location_verified
FROM performances
WHERE deleted_at IS NULL;

-- Defensive/explicit re-assertion, redundant with the WITH clause above
-- but harmless and idempotent — makes the invariant this migration exists
-- to protect impossible to miss on read.
ALTER VIEW public.performances_visible SET (security_invoker = on);

-- Preserve the verified live grant state exactly: anon has no privileges,
-- authenticated has SELECT only (explicitly revoked-then-granted so this
-- is the actual state, not an assumption about what CREATE OR REPLACE
-- VIEW happened to preserve), postgres/service_role are untouched by this
-- migration entirely. REVOKE/GRANT are idempotent — safe to replay
-- against a database already in this state.
REVOKE ALL ON public.performances_visible FROM anon;
REVOKE ALL ON public.performances_visible FROM authenticated;
GRANT SELECT ON public.performances_visible TO authenticated;

-- ── performance_songs_visible: same security_invoker=on treatment,
-- copied verbatim from the verified live definition. ────────────────────
CREATE OR REPLACE VIEW public.performance_songs_visible
WITH (security_invoker = on) AS
SELECT
  ps.id,
  ps.performance_id,
  ps.title,
  ps.artist,
  ps."position",
  ps.duration_seconds,
  ps.notes,
  ps.created_at,
  ps.isrc,
  ps.composer,
  ps.publisher,
  ps.source,
  ps.was_planned,
  ps.was_skipped,
  ps.inclusion_reason,
  ps.threshold,
  ps.score,
  ps.confusion_matrix_result,
  ps.artist_removed,
  ps.artist_modified,
  ps.artist_save_complete
FROM performance_songs ps
JOIN performances p ON p.id = ps.performance_id
WHERE ps.artist_removed IS NOT TRUE
  AND p.deleted_at IS NULL;

ALTER VIEW public.performance_songs_visible SET (security_invoker = on);

-- Preserve the verified live grant state exactly — same rationale and
-- idempotency as performances_visible above: anon has no privileges,
-- authenticated has SELECT only, postgres/service_role are untouched by
-- this migration entirely.
REVOKE ALL ON public.performance_songs_visible FROM anon;
REVOKE ALL ON public.performance_songs_visible FROM authenticated;
GRANT SELECT ON public.performance_songs_visible TO authenticated;

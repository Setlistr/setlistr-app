-- ⚠ LOCAL-ONLY. DO NOT APPLY TO PRODUCTION. ⚠
-- This file targets the disposable local Docker fixture
-- (supabase_db_setlistr-security-test) exclusively. It is not a
-- migration, is not reviewed as one, and must never be run against any
-- production or shared database.
--
-- recognition_logs and recognition_results below (like audio_captures,
-- recognition_jobs, detection_events, user_songs, and
-- user_song_performances before them, added earlier in this same test
-- arc via ad hoc docker exec psql — not captured in this file) were
-- RECONSTRUCTED here purely to unblock local testing: their DDL is
-- inferred solely from the exact fields app/api/identify/route.ts and
-- app/api/upload-identify/route.ts write via .insert({...}), nothing
-- more. Production's ACTUAL constraints, defaults, grants, and RLS
-- policies for these two tables have NOT been verified against live
-- schema metadata (no information_schema query, no live grant/policy
-- read, unlike the artist_id finding below, which WAS confirmed live).
-- Treat every column here as "known to exist, in some form" and nothing
-- about its production-side nullability, defaults, FKs, or access
-- control as confirmed.
--
-- Local-only Supabase Docker fixture corrections for the viewer-write-
-- containment / identify-authorization test arc. NOT a production
-- migration: performances.artist_id and performances_visible's tracked
-- 0005 definition already exist live (confirmed via information_schema.
-- columns — type uuid — and via a live join against setlists.artist_id:
-- 5 matches, 0 mismatches, 0 missing ids). This file only brings the
-- local Docker fixture (supabase_db_setlistr-security-test) into
-- agreement with what's already live, so local testing reflects the real
-- schema. Safe to replay — idempotent against a fixture database already
-- in the target state.
--
-- Apply via:
--   docker exec <container> psql -U postgres -d postgres -f - < scripts/local-fixture-setup.sql

-- performances.artist_id: nullable, matching the live finding that only
-- 5 of 482 non-deleted performances have it set.
ALTER TABLE public.performances ADD COLUMN IF NOT EXISTS artist_id uuid;

-- CORRECTION (2026-09-28): production confirmed
-- FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL —
-- superseding the earlier comment above (removed) that no FK was
-- confirmed live. Added here to match. Idempotent (DO block checks
-- pg_constraint first — Postgres has no ADD CONSTRAINT IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'performances_artist_id_fkey'
  ) THEN
    ALTER TABLE public.performances
      ADD CONSTRAINT performances_artist_id_fkey
      FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;
  END IF;
END $$;

-- performances_visible: appends artist_id to the LOCAL view's existing
-- column list. Postgres's CREATE OR REPLACE VIEW can only add columns at
-- the END of the list without dropping the view first — inserting it
-- mid-list to match 0005's exact column order would require DROP VIEW
-- ... CASCADE, which this file avoids per instruction. Security setting
-- and grants preserved exactly as already set locally / as tracked by
-- 0005_track_live_access_control.sql. The local view's pre-existing
-- column list otherwise deliberately unchanged here — full parity with
-- every other column 0005 lists (submitted_to_pro, latitude/longitude,
-- etc.) is out of scope: those columns don't exist on the local
-- `performances` table at all and aren't exercised by this test arc.
CREATE OR REPLACE VIEW public.performances_visible
WITH (security_invoker = on) AS
SELECT
  id, user_id, venue_id, venue_name, city, country, artist_name,
  performance_date, start_time, set_duration_minutes,
  auto_close_buffer_minutes, status, started_at, ended_at, created_at,
  show_id, setlist_id, submission_status, data_source,
  artist_id
FROM public.performances
WHERE deleted_at IS NULL;

ALTER VIEW public.performances_visible SET (security_invoker = on);

REVOKE ALL ON public.performances_visible FROM anon;
REVOKE ALL ON public.performances_visible FROM authenticated;
GRANT SELECT ON public.performances_visible TO authenticated;

-- recognition_logs / recognition_results: real tables app/api/identify/
-- route.ts and app/api/upload-identify/route.ts both write to (CLAUDE.md
-- lists both under "ACRCloud detection forensics"), discovered missing
-- from this local fixture entirely while running the focused
-- authorization suites — a fixture gap, not a code defect. Like
-- audio_captures/recognition_jobs/detection_events before them, no
-- tracked migration or supabase-schema.sql defines either table, so this
-- DDL is reconstructed directly from the exact fields both routes'
-- .insert({...}) calls use — nothing invented beyond that. No
-- constraints/FKs beyond a plain primary key are asserted, since none
-- were independently confirmed live for these two tables.
CREATE TABLE IF NOT EXISTS public.recognition_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid,
  rank integer,
  title text,
  artist_name text,
  score numeric,
  raw_data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recognition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performance_id uuid,
  audio_bytes integer,
  duration_seconds integer,
  acr_status_code integer,
  detected boolean,
  title text,
  artist text,
  isrc text,
  score numeric,
  source text,
  raw_response jsonb,
  user_agent text,
  acr_message text,
  created_at timestamptz DEFAULT now()
);

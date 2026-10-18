-- PROPOSED MIGRATION (separate) — NOT APPLIED.
-- Catalogue and setlist tables: remove administrative table privileges from client roles.
--
-- Preflight Run 3 (2026-10-18) found anon and authenticated holding TRUNCATE, TRIGGER and
-- REFERENCES on user_songs, user_song_performances and performance_songs. performances already
-- lacks them (0010_delegation_containment.sql removed them as "never intentionally granted").
-- This applies the same rule, unchanged, to these three tables. Reads and writes
-- (SELECT/INSERT/UPDATE/DELETE) are NOT touched; they stay governed by RLS. service_role is
-- never named, so its grants are untouched.
--
-- Why: RLS doesn't apply to TRUNCATE (one statement empties the table for every artist), and
-- TRIGGER lets the holder attach a trigger that then runs in every other writer's session.
-- REFERENCES lets the holder create a foreign key that can block deletes. No app code uses
-- any of the three; PostgREST and GraphQL expose none of them.
BEGIN;

REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON public.user_songs, public.user_song_performances, public.performance_songs
  FROM PUBLIC, anon, authenticated;

-- MAINTAIN exists only on PostgreSQL 17+ (same gate as 0010).
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON public.user_songs, public.user_song_performances, public.performance_songs FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

COMMIT;

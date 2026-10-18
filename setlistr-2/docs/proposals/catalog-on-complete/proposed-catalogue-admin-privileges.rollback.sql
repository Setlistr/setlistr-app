-- Rollback for proposed-catalogue-admin-privileges.sql: restores the grants production had before
-- the change (preflight Run 3, 2026-10-18 15:06Z; Run 4, 15:32Z, PostgreSQL 17.6): TRUNCATE, TRIGGER,
-- REFERENCES and MAINTAIN for anon and authenticated on the three tables. Privileges only; no data change.
BEGIN;
GRANT TRUNCATE, TRIGGER, REFERENCES
  ON public.user_songs, public.user_song_performances, public.performance_songs
  TO anon, authenticated;
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'GRANT MAINTAIN ON public.user_songs, public.user_song_performances, public.performance_songs TO anon, authenticated';
  END IF;
END $$;
COMMIT;

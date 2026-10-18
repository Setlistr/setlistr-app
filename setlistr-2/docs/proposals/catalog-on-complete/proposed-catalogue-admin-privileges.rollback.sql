-- Rollback for proposed-catalogue-admin-privileges.sql: restores the grants preflight Run 3
-- found (2026-10-18). Privileges only; no data change. MAINTAIN is restored only if Run 4
-- showed it granted before the change (run_4: M_maintain); otherwise leave that block out.
BEGIN;
GRANT TRUNCATE, TRIGGER, REFERENCES
  ON public.user_songs, public.user_song_performances, public.performance_songs
  TO anon, authenticated;
-- DO $$ BEGIN IF current_setting('server_version_num')::int >= 170000 THEN
--   EXECUTE 'GRANT MAINTAIN ON public.user_songs, public.user_song_performances, public.performance_songs TO anon, authenticated'; END IF; END $$;
COMMIT;

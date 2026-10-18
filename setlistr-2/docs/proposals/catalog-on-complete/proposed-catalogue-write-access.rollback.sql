-- Rollback for proposed-catalogue-write-access.sql: restores production's policies as found in
-- preflight Run 1 (2026-10-17) and removes the ownership locks. Permissions only; no data change.
DROP TRIGGER IF EXISTS user_songs_lock_owner ON public.user_songs;
DROP TRIGGER IF EXISTS user_song_performances_lock_owner ON public.user_song_performances;
DROP FUNCTION IF EXISTS public.reject_catalogue_owner_change();
DROP POLICY IF EXISTS user_songs_read ON public.user_songs;
DROP POLICY IF EXISTS user_songs_insert ON public.user_songs;
DROP POLICY IF EXISTS user_songs_update ON public.user_songs;
DROP POLICY IF EXISTS user_songs_delete ON public.user_songs;
DROP POLICY IF EXISTS user_song_performances_read ON public.user_song_performances;
DROP POLICY IF EXISTS user_song_performances_insert ON public.user_song_performances;
DROP POLICY IF EXISTS user_song_performances_update ON public.user_song_performances;
DROP POLICY IF EXISTS user_song_performances_delete ON public.user_song_performances;
CREATE POLICY user_songs_self ON public.user_songs FOR ALL USING (can_act_for(user_id));
CREATE POLICY user_song_performances_self ON public.user_song_performances FOR ALL USING (can_act_for(user_id));

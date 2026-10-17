-- 2/3: production has RLS on the catalogue tables (supabase/migrations/0001_baseline.sql policies);
-- the local schema doesn't. Without this, the test would not reflect production authorization.
ALTER TABLE public.user_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_song_performances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_song_performances_self" ON user_song_performances FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_songs_self" ON user_songs FOR ALL USING (user_id = auth.uid());

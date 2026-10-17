-- 2/3: production objects the local schema lacks, so the test reflects production:
--  * RLS on the catalogue tables with the baseline policies (supabase/migrations/0001_baseline.sql);
--  * performances_status_check (supabase-schema.sql), which rejects the 'completed' that main writes.
ALTER TABLE public.user_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_song_performances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_song_performances_self" ON user_song_performances FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_songs_self" ON user_songs FOR ALL USING (user_id = auth.uid());
ALTER TABLE public.performances ADD CONSTRAINT performances_status_check CHECK (status IN ('draft', 'live', 'processing', 'review', 'complete'));

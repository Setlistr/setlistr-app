-- 2/3 (revision 2): production objects the local schema lacks or shapes differently,
-- taken from the production preflight of 2026-10-17 (Run 1), so the test reflects production.

-- user_song_performances: performance_id is TEXT; user_id nullable; created_at; the extra lookup index.
ALTER TABLE public.user_song_performances ALTER COLUMN performance_id TYPE text USING performance_id::text;
ALTER TABLE public.user_song_performances ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.user_song_performances ADD COLUMN created_at timestamptz DEFAULT now();
CREATE INDEX idx_usp_lookup ON public.user_song_performances USING btree (user_id, performance_id, normalized_title);

-- user_songs: UNIQUE (user_id, song_title); user_id nullable; production's extra columns
-- (defaults not yet confirmed by the preflight; none of them is written by the app or the migration).
ALTER TABLE public.user_songs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.user_songs ADD COLUMN composer text, ADD COLUMN corrected_to_count integer, ADD COLUMN created_at timestamptz DEFAULT now(),
  ADD COLUMN isrc text, ADD COLUMN publisher text, ADD COLUMN rejected_count integer, ADD COLUMN source text;
ALTER TABLE public.user_songs ADD CONSTRAINT user_songs_user_id_song_title_key UNIQUE (user_id, song_title);

-- performance_songs: production's recording_id index.
ALTER TABLE public.performance_songs ADD COLUMN IF NOT EXISTS recording_id uuid;
CREATE INDEX IF NOT EXISTS performance_songs_recording_id_idx ON public.performance_songs USING btree (recording_id);

-- RLS on both catalogue tables, with production's policies exactly: FOR ALL, roles public,
-- USING can_act_for(user_id), no WITH CHECK (so the USING expression also checks writes).
-- can_act_for admits every accepted, unrevoked delegate, including Viewers.
ALTER TABLE public.user_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_song_performances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_song_performances_self" ON public.user_song_performances FOR ALL USING (can_act_for(user_id));
CREATE POLICY "user_songs_self" ON public.user_songs FOR ALL USING (can_act_for(user_id));
-- Table grants: the local schema's GRANT ALL to anon/authenticated (Supabase's default) is kept;
-- production's grants are confirmed by preflight Run 3.

-- performances_status_check, as in production (rejects the 'completed' that main writes).
ALTER TABLE public.performances ADD CONSTRAINT performances_status_check CHECK (status IN ('draft', 'live', 'processing', 'review', 'complete'));

-- notion_show_count: production's AFTER UPDATE webhook trigger on performances, reproduced with
-- the same function and timeout but pointed at a closed local port, so nothing leaves the machine.
-- It sorts before performances_record_catalog, so it fires first, as in production.
CREATE EXTENSION IF NOT EXISTS pg_net;   -- production's webhook trigger needs it
CREATE TRIGGER notion_show_count AFTER UPDATE ON public.performances FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request('http://127.0.0.1:9/notion-sync-disposable', 'POST', '{"Content-type":"application/json"}', '{}', '5000');

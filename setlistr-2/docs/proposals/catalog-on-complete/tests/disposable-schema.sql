\set ON_ERROR_STOP 1
-- Minimal copy of the production shapes these tests touch.
CREATE TABLE public.artist_delegates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), artist_id uuid NOT NULL, delegate_id uuid, role text, accepted_at timestamptz, revoked_at timestamptz);
CREATE TABLE public.performances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, artist_name text, venue_name text, status text, submission_status text, data_source text DEFAULT 'captured', started_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
CREATE TABLE public.performance_songs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), performance_id uuid NOT NULL REFERENCES public.performances(id), title text, artist text, position int, source text, artist_removed boolean DEFAULT false, artist_save_complete boolean DEFAULT false);
CREATE TABLE public.user_songs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, song_title text NOT NULL, canonical_artist text, confirmed_count integer DEFAULT 0, last_confirmed_at timestamptz);
CREATE TABLE public.user_song_performances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, performance_id uuid NOT NULL, normalized_title text NOT NULL, UNIQUE (user_id, performance_id, normalized_title));

-- 0015 / 0016 access functions, verbatim
CREATE OR REPLACE FUNCTION public.can_act_for(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  select auth.uid() = target or exists (select 1 from artist_delegates where artist_delegates.artist_id = target and artist_delegates.delegate_id = auth.uid() and artist_delegates.accepted_at is not null and artist_delegates.revoked_at is null);
$f$;
CREATE OR REPLACE FUNCTION public.can_write_for(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  select auth.uid() = target or exists (select 1 from artist_delegates where artist_delegates.artist_id = target and artist_delegates.delegate_id = auth.uid() and artist_delegates.accepted_at is not null and artist_delegates.revoked_at is null and artist_delegates.role in ('manager', 'tour_manager', 'band_member'));
$f$;

ALTER TABLE public.performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_song_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_delegates ENABLE ROW LEVEL SECURITY;
-- 0016 performances + performance_songs policies, verbatim
CREATE POLICY "performances_read" ON public.performances FOR SELECT USING (can_act_for(user_id));
CREATE POLICY "performances_insert" ON public.performances FOR INSERT WITH CHECK (can_write_for(user_id));
CREATE POLICY "performances_write" ON public.performances FOR UPDATE USING (can_write_for(user_id)) WITH CHECK (can_write_for(user_id));
CREATE POLICY "songs_read" ON public.performance_songs FOR SELECT USING (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_act_for(performances.user_id)));
CREATE POLICY "songs_insert" ON public.performance_songs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id)));
CREATE POLICY "songs_write" ON public.performance_songs FOR UPDATE USING (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id)));
-- 0001 baseline catalogue policies, verbatim
CREATE POLICY "user_song_performances_self" ON user_song_performances FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_songs_self" ON user_songs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "delegates_read" ON public.artist_delegates FOR SELECT USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performances, public.performance_songs, public.user_songs, public.user_song_performances TO authenticated;
GRANT SELECT ON public.artist_delegates TO authenticated;

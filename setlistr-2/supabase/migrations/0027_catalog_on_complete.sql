-- PROPOSED MIGRATION (revision 2, matched to the production preflight of 2026-10-17) — NOT APPLIED.
-- Intended as supabase/migrations/0025_catalog_on_complete.sql once approved.
-- Apply BEFORE deploying the app candidate (see ROLLOUT.md). Once applied, it stays.
--
-- Changes from revision 1, each from a production finding:
--  * user_song_performances.performance_id is TEXT in production (performance ids are uuid):
--    markers are written as p_performance_id::text, the form the app writes.
--  * user_songs has UNIQUE (user_id, song_title) in production: the count is an atomic
--    INSERT … ON CONFLICT DO UPDATE. Revision 1 updated, then inserted if nothing matched;
--    against the unique key, a concurrent writer creating the row in between made the
--    insert fail with 23505, which the page would have reported as a permanent failure.
--  * The per-artist advisory lock is removed: the unique key and the upsert serialize
--    writers of the same song; songs are written in key order, so two saves can't deadlock.
--  * The migration first checks the production shape it depends on and aborts, changing
--    nothing, if any part differs.

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'user_song_performances' AND column_name = 'performance_id') IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'catalog_on_complete: expected user_song_performances.performance_id to be text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_songs'::regclass AND contype = 'u'
                   AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, song_title)') THEN
    RAISE EXCEPTION 'catalog_on_complete: expected UNIQUE (user_id, song_title) on user_songs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_song_performances'::regclass AND contype = 'u'
                   AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, performance_id, normalized_title)') THEN
    RAISE EXCEPTION 'catalog_on_complete: expected UNIQUE (user_id, performance_id, normalized_title) on user_song_performances';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performances_status_check'
                   AND conrelid = 'public.performances'::regclass) THEN
    RAISE EXCEPTION 'catalog_on_complete: expected performances_status_check';
  END IF;
END $$;

-- Same key as lib/reconciliation/normalize.ts normalizeSongKey() (checked on a corpus).
CREATE OR REPLACE FUNCTION public.song_catalog_key(title text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    btrim(lower(title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
$$;

-- Counts each kept song of one performance into the artist's catalogue once.
-- Idempotent: the per-show marker decides; marker and count are written in
-- the same transaction, so neither can exist without the other.
CREATE OR REPLACE FUNCTION public.record_performance_catalog(p_performance_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  r record;
  v_added integer := 0;
BEGIN
  SELECT user_id INTO v_user FROM performances WHERE id = p_performance_id;
  IF v_user IS NULL THEN RETURN 0; END IF;
  FOR r IN
    SELECT DISTINCT ON (song_catalog_key(ps.title))
           song_catalog_key(ps.title) AS k, ps.title AS title, nullif(btrim(ps.artist), '') AS artist
    FROM performance_songs ps
    WHERE ps.performance_id = p_performance_id
      AND NOT coalesce(ps.artist_removed, false)
      AND coalesce(ps.source, '') <> 'planned'          -- planned, never marked played
      AND nullif(btrim(ps.title), '') IS NOT NULL
    ORDER BY song_catalog_key(ps.title), ps.position   -- a fixed order: concurrent saves can't deadlock
  LOOP
    CONTINUE WHEN r.k = '';
    INSERT INTO user_song_performances (user_id, performance_id, normalized_title)
    VALUES (v_user, p_performance_id::text, r.k)
    ON CONFLICT (user_id, performance_id, normalized_title) DO NOTHING;
    CONTINUE WHEN NOT FOUND;                            -- already counted for this show
    INSERT INTO user_songs AS us (user_id, song_title, canonical_artist, confirmed_count, last_confirmed_at)
    VALUES (v_user, r.title, r.artist, 1, now())
    ON CONFLICT (user_id, song_title) DO UPDATE
      SET confirmed_count = coalesce(us.confirmed_count, 0) + 1,
          canonical_artist = EXCLUDED.canonical_artist,
          last_confirmed_at = EXCLUDED.last_confirmed_at;
    v_added := v_added + 1;
  END LOOP;
  RETURN v_added;
END $$;
-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default (confirmed in production's default ACL), so revoking from PUBLIC alone
-- is not enough. Only the trigger may run this.
REVOKE EXECUTE ON FUNCTION public.record_performance_catalog(uuid) FROM PUBLIC, anon, authenticated;

-- The review save's final required write sets status = 'complete' (the only
-- writer of that value). The catalogue is recorded inside that statement, so
-- a confirmed save always has its catalogue, and any failure rejects the
-- final write (earlier save requests stay saved; retrying is safe).
--
-- A failure is re-raised with its ORIGINAL error code, tagged with the hint
-- 'setlistr:song-catalogue', so the app can tell a catalogue failure from
-- any other and still tell permanent (22/23/42/P0…) from temporary
-- (40001, 40P01, 55P03…). A statement timeout (57014) can't be caught in
-- PL/pgSQL and reaches the app untagged; the app treats it as temporary.
CREATE OR REPLACE FUNCTION public.performances_record_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM record_performance_catalog(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = SQLSTATE, MESSAGE = 'song catalogue: ' || SQLERRM, HINT = 'setlistr:song-catalogue';
  END;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.performances_record_catalog() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS performances_record_catalog ON public.performances;
CREATE TRIGGER performances_record_catalog
  AFTER UPDATE OF status ON public.performances
  FOR EACH ROW WHEN (NEW.status = 'complete')
  EXECUTE FUNCTION public.performances_record_catalog();

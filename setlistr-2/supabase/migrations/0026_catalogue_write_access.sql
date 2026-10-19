-- PROPOSED MIGRATION (separate from the catalogue repair) — NOT APPLIED.
-- Catalogue write access: only the artist and currently authorized writing delegates.
-- Intended as its own numbered migration once approved; independent of 0025_catalog_on_complete.
--
-- Production today (preflight Run 1, 2026-10-17):
--   user_songs_self              FOR ALL USING (can_act_for(user_id))   -- no WITH CHECK
--   user_song_performances_self  FOR ALL USING (can_act_for(user_id))   -- no WITH CHECK
-- can_act_for admits every accepted, unrevoked delegate, Viewers included, so any Viewer can
-- insert, change and delete the artist's catalogue rows and per-show markers.
--
-- After: reads unchanged (can_act_for); INSERT / UPDATE / DELETE need can_write_for, which admits
-- the artist and accepted, unrevoked managers, tour managers and band members (the same rule as
-- performances and performance_songs). A row's user_id can't be changed once written.
-- Service-role writers (identify, upload-identify, upload-reconcile, delete, undo, admin routes)
-- bypass RLS and are unaffected; none of them changes user_id.

-- Abort, changing nothing, if production's policies are no longer the ones this replaces.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_songs', 'user_song_performances'] LOOP
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) <> 1
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
                        AND policyname = t || '_self' AND cmd = 'ALL'
                        AND qual = 'can_act_for(user_id)' AND with_check IS NULL) THEN
      RAISE EXCEPTION 'catalogue_write_access: %''s policies differ from the reviewed production state', t;
    END IF;
  END LOOP;
END $$;

DROP POLICY user_songs_self ON public.user_songs;
CREATE POLICY user_songs_read   ON public.user_songs FOR SELECT USING (can_act_for(user_id));
CREATE POLICY user_songs_insert ON public.user_songs FOR INSERT WITH CHECK (can_write_for(user_id));
CREATE POLICY user_songs_update ON public.user_songs FOR UPDATE USING (can_write_for(user_id)) WITH CHECK (can_write_for(user_id));
CREATE POLICY user_songs_delete ON public.user_songs FOR DELETE USING (can_write_for(user_id));

DROP POLICY user_song_performances_self ON public.user_song_performances;
CREATE POLICY user_song_performances_read   ON public.user_song_performances FOR SELECT USING (can_act_for(user_id));
CREATE POLICY user_song_performances_insert ON public.user_song_performances FOR INSERT WITH CHECK (can_write_for(user_id));
CREATE POLICY user_song_performances_update ON public.user_song_performances FOR UPDATE USING (can_write_for(user_id)) WITH CHECK (can_write_for(user_id));
CREATE POLICY user_song_performances_delete ON public.user_song_performances FOR DELETE USING (can_write_for(user_id));

-- Ownership can't move, even between two artists the same delegate can write for
-- (the same rule as performances_lock_owner).
CREATE OR REPLACE FUNCTION public.reject_catalogue_owner_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION '%.user_id cannot be changed after creation', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_songs_lock_owner BEFORE UPDATE ON public.user_songs
  FOR EACH ROW EXECUTE FUNCTION public.reject_catalogue_owner_change();
CREATE TRIGGER user_song_performances_lock_owner BEFORE UPDATE ON public.user_song_performances
  FOR EACH ROW EXECUTE FUNCTION public.reject_catalogue_owner_change();

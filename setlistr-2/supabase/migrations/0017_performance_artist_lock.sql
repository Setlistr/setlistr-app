-- Performance artist-attribution reassignment lock.
--
-- GAP, REPRODUCED against the disposable local fixture (not applied to
-- production by this file — proposal only): performances.artist_id is a
-- real, live column (confirmed this session via information_schema and a
-- live join against setlists.artist_id) but was never covered by 0011
-- (performances_lock_owner: user_id only) or 0013
-- (performances_lock_links: show_id/setlist_id only) — both predate this
-- column being part of the reviewed schema. Reproduced against the
-- disposable local fixture: an owner's
-- own authenticated session, via a direct PostgREST PATCH to
-- /rest/v1/performances (NOT through any Next.js route — no app code bug
-- is required), successfully reassigned artist_id from one artists row to
-- an unrelated one (200 OK, value changed in the DB). The identical
-- attempt against show_id in the same session was correctly rejected by
-- 0013's existing trigger (400, code 23514), confirming the mechanism
-- works and specifically excludes this column. performances_write DOES
-- have an explicit WITH CHECK (can_write_for(user_id)) (0016) — but that
-- expression only evaluates the caller's right to act for user_id; it
-- says nothing about artist_id, so any artist_id value passes as long as
-- user_id itself is left unchanged. Same class of blind spot 0011's own
-- header already gives for why RLS alone can't express "this specific
-- column must not change."
--
-- Repository-code finding (this proposal): no .update(...) call site
-- anywhere in app/ or lib/ currently sets performances.artist_id — a repo
-- grep finding, not proof no other path could reach it (matching this
-- codebase's own established caveat for findings of this shape). No
-- route change is required to close the reproduced gap; the trigger is
-- the sole enforcement point already, exactly as for user_id/show_id/
-- setlist_id.
--
-- Fix: extend the EXISTING reject_performance_link_change() function
-- (0013) with one more guarded column check, mirroring its own show_id/
-- setlist_id pattern exactly, including the same narrow non-null->null
-- exception (only when the OLD referenced artists row is actually gone).
-- CONFIRMED (not merely anticipated): production has
-- FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL —
-- the same local fixture correction 0011/0013 both required for
-- shows.created_by/performances.show_id/performances.setlist_id applies
-- here too (see scripts/local-fixture-setup.sql). Without this
-- exception, deleting an artists row still referenced by a performance
-- would fail exactly like the incident 0011's own header describes for
-- shows.created_by/auth.users. performances_lock_links already fires
-- BEFORE UPDATE on every row via 0013's own CREATE TRIGGER — redefining
-- the function body is sufficient; no new trigger is created or
-- attached here.
--
-- How the exception distinguishes a caller's PATCH from a real FK
-- cascade: there is no flag or special-cased caller identity — it is
-- purely "does public.artists still contain OLD.artist_id at the moment
-- this BEFORE UPDATE trigger evaluates." A caller's direct PATCH to null
-- (artists row still present) finds NOT EXISTS(...) = false, so the
-- exception's negated condition is true and it's rejected. Postgres's
-- ON DELETE SET NULL for artists implements the cascade via the FK's own
-- internal AFTER DELETE trigger on artists, which removes the artists
-- row FIRST and issues the UPDATE on performances as a consequence — so
-- by the time this BEFORE UPDATE trigger runs, NOT EXISTS(...) is
-- already true and the update is allowed through. Same mechanism
-- 0011/0013 already established and verified for the other locked
-- columns; not new reasoning, only a new column.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_performance_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.show_id IS DISTINCT FROM NEW.show_id THEN
    IF NOT (
      OLD.show_id IS NOT NULL AND NEW.show_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.shows WHERE public.shows.id = OLD.show_id)
    ) THEN
      RAISE EXCEPTION 'performances.show_id cannot be changed after creation'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.setlist_id IS DISTINCT FROM NEW.setlist_id THEN
    IF NOT (
      OLD.setlist_id IS NOT NULL AND NEW.setlist_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.setlists WHERE public.setlists.id = OLD.setlist_id)
    ) THEN
      RAISE EXCEPTION 'performances.setlist_id cannot be changed after creation'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.artist_id IS DISTINCT FROM NEW.artist_id THEN
    IF NOT (
      OLD.artist_id IS NOT NULL AND NEW.artist_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.artists WHERE public.artists.id = OLD.artist_id)
    ) THEN
      RAISE EXCEPTION 'performances.artist_id cannot be changed after creation'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

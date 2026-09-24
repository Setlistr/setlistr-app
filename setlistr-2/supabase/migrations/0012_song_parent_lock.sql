-- Song-parent reassignment lock.
--
-- Prevents any UPDATE from changing public.performance_songs.performance_id
-- or public.setlist_items.setlist_id — a row's parent record, once created,
-- cannot be moved to a different parent by any caller.
--
-- Confirmed live (this hotfix, read-only metadata query): both parent-
-- reference columns are directly writable today. songs_own (on
-- performance_songs) and setlist_items_self authorize UPDATE by checking
-- whether the caller can act for the CURRENT linked parent's owner, but
-- neither has an explicit WITH CHECK narrowing what the NEW value of the
-- parent-reference column may be — so Postgres applies the same USING
-- expression as an implicit WITH CHECK, evaluated against the NEW row.
-- That means a caller who can act for BOTH the old and the new parent's
-- owner (an accepted delegate/manager of two different artists is the
-- ordinary, legitimate case for this — not a hypothetical) passes the
-- check on both sides of a reparenting UPDATE. Reproduced directly against
-- these exact live policies, locally, before writing this migration: a
-- manager holding an accepted delegation for two different artists could
-- move a performance_songs row from one artist's performance to the
-- other's, and a setlist_items row from one artist's setlist to the
-- other's, with no error. Checking permission against both the old and
-- new parent never establishes the row didn't move — the same principle
-- 0011 already applied to performances.user_id and shows.created_by.
--
-- Reparenting-path check (this hotfix): every .update()/.insert() call
-- site against performance_songs and setlist_items was read in full,
-- across app/, lib/ (including lib/reconciliation/, and the protected,
-- read-only-checked app/api/identify/route.ts), and scripts/. Both parent-
-- reference columns are set exactly once, at INSERT, and never appear in
-- any UPDATE payload anywhere. There is no legitimate reparenting
-- workflow to except, and this migration adds none.
--
-- Scope and design, matching 0011's conventions:
--   - Rejects the UPDATE outright (RAISE EXCEPTION), not a silent revert.
--   - BEFORE UPDATE only — every INSERT path (including inserting a new
--     song/item under its correct parent) is completely unaffected.
--   - No unconditional service-role bypass: service_role is checked by
--     the exact same rule as every other caller. Verified locally.
--   - Not a self-referencing RLS WITH CHECK; does not modify can_act_for(),
--     songs_own, setlist_items_self, role capabilities, or any other
--     existing RLS policy.
--   - No narrow SET-NULL-style exception, unlike shows.created_by in 0011:
--     both parent-reference columns are confirmed live (this hotfix's
--     read-only metadata queries) NOT NULL REFERENCES ... ON DELETE
--     CASCADE — performance_songs.performance_id -> performances(id), and
--     setlist_items.setlist_id -> setlists(id). Deleting either parent
--     issues a DELETE against the child rows, not an UPDATE, so neither
--     ever reaches this BEFORE UPDATE trigger and neither needs an
--     exception.
--
-- Out of scope, explicitly not addressed here: the /api/performance-songs
-- setlist_items fallback branch itself is known to reference columns that
-- do not exist in the live setlists table (no performance_id column) and
-- is not functional as written — its repair or removal is a separate,
-- focused follow-up, not expanded by this patch. This migration also does
-- not address performances.show_id, performances.setlist_id, or
-- setlists.show_id/artist_id consistency on INSERT/UPDATE, and does not
-- complete role-capability enforcement.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_performance_song_reparent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.performance_id IS DISTINCT FROM NEW.performance_id THEN
    RAISE EXCEPTION 'performance_songs.performance_id cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS performance_songs_lock_parent ON public.performance_songs;
CREATE TRIGGER performance_songs_lock_parent
  BEFORE UPDATE ON public.performance_songs
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_performance_song_reparent();

CREATE OR REPLACE FUNCTION public.reject_setlist_item_reparent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.setlist_id IS DISTINCT FROM NEW.setlist_id THEN
    RAISE EXCEPTION 'setlist_items.setlist_id cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS setlist_items_lock_parent ON public.setlist_items;
CREATE TRIGGER setlist_items_lock_parent
  BEFORE UPDATE ON public.setlist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_setlist_item_reparent();

COMMIT;

-- Show/artist link reassignment lock.
--
-- Prevents any UPDATE from changing public.performances.show_id,
-- public.performances.setlist_id, public.setlists.show_id, or
-- public.setlists.artist_id — once a row links to a show/setlist/artist,
-- that link cannot be moved to a different one by any caller. Matches the
-- same pattern as 0011 (performances.user_id, shows.created_by) and 0012
-- (performance_songs.performance_id, setlist_items.setlist_id).
--
-- WHAT THIS DOES NOT DO, DELIBERATELY: it does not assert that a show's
-- creator must equal every performing artist attached to it, and it does
-- not require setlists.artist_id's owner to match performances.user_id
-- or shows.created_by. setlists.artist_id -> artists(id) with
-- UNIQUE(show_id, artist_id) structurally supports more than one artist
-- per show, and the confirmed product decision (see below) is that this
-- is intentional: shared events are supported, and the event creator is
-- not required to equal every participating artist. An ownership-
-- equality constraint here would directly contradict that decision, so
-- this migration adds none. This migration takes no position on what
-- INSERT-time validation implementing that decision should look like —
-- it only prevents an EXISTING link from being silently moved after
-- creation, which is compatible with whatever that future rule turns out
-- to be. artists.user_id has no FK to auth.users/profiles, per this
-- codebase's own comment (app/api/account/delete/route.ts) — a
-- repository-code finding, not independently confirmed against live
-- schema metadata. That comment also describes the relationship as
-- "one-to-one in practice, coded generally," which this migration does
-- not rely on being true, fully populated, or currently enforced.
--
-- Reproduced locally before writing this migration, against the actual
-- live-shaped policies: a manager holding accepted delegations for two
-- different artists could freely reassign an existing performances.
-- show_id, performances.setlist_id, or setlists.artist_id to point at
-- the other artist's show/setlist, and could reassign setlists.show_id
-- to an entirely different show — all with no error. performances_own
-- and setlists_self have no explicit WITH CHECK, so Postgres applies
-- their USING expression to the NEW row as an implicit WITH CHECK —
-- which DOES check that the caller can act for the NEW target (e.g.
-- setlists_self's implicit WITH CHECK genuinely verifies the caller is
-- authorized for the show_id being written to), it just does not check
-- that the value is unchanged from before. Those are different
-- properties: RLS does real authorization work on the destination, and
-- separately, nothing stops that destination from differing from the
-- original. The same reproduction also found that INSERT-time mismatches
-- (e.g. a performances row insert with user_id for one artist but
-- show_id pointing to a different artist's show) are ALSO currently
-- allowed — a separate, still-open question this migration does not
-- address, since implementing the confirmed shared-event decision
-- correctly (authorization for the specific artist AND a validated
-- relationship to the event, with no cross-artist access from shared
-- membership) is its own task.
--
-- Write-path check (this hotfix): no UPDATE call site anywhere in
-- app/, lib/, or scripts/ sets performances.show_id, performances.
-- setlist_id, setlists.show_id, or setlists.artist_id — both tables'
-- linkage columns are only ever set once, at INSERT (performances.
-- show_id/setlist_id — though setlist_id specifically was not found
-- assigned at insert either, only read). No INSERT into setlists or
-- artists exists anywhere in this repository's tracked code at all. This
-- is a repository-code finding, not proof that no external process (an
-- admin tool, a separate service, manual seeding) writes to these tables
-- directly — absence of a repo-tracked write path does not establish
-- that such a workflow cannot exist or cannot be broken by this change.
-- What IS true regardless of that: a BEFORE UPDATE trigger structurally
-- never fires for an INSERT statement, so locking UPDATE only, exactly
-- as here, cannot interfere with row creation through any path, tracked
-- or not.
--
-- CORRECTION (live metadata, this hotfix): performances.show_id and
-- performances.setlist_id are both confirmed ON DELETE SET NULL —
-- setlists.show_id and setlists.artist_id are both confirmed ON DELETE
-- CASCADE. A first draft of this migration rejected ALL four columns
-- unconditionally, exactly like 0011's first draft did for
-- shows.created_by. Reproduced locally before fixing this: deleting a
-- shows row still referenced by an existing performances.show_id failed
-- outright with THIS TRIGGER's own exception message (not a generic FK
-- error) — proving the FK's internal SET NULL cascade issues an UPDATE
-- against performances that performances_lock_links was rejecting,
-- exactly the same failure mode as the shows.created_by/auth.users
-- incident. The show survived, the performance's show_id was left
-- pointing at an undeletable row.
--
-- The fix is narrowly scoped to that one legitimate case per column:
-- allow non-NULL -> NULL specifically on performances.show_id/
-- setlist_id, and only when the OLD referenced row has actually,
-- verifiably stopped existing — checked directly (NOT EXISTS), not
-- inferred from pg_trigger_depth() or any other incidental signal.
-- setlists.show_id/artist_id get NO such exception and remain
-- unconditional: their FKs are CASCADE, so deleting the parent issues a
-- DELETE against setlists, never an UPDATE — that DELETE never reaches
-- this BEFORE UPDATE trigger at all, so there is nothing for it to
-- reject, and no exception is needed there. Verified directly against
-- this local Postgres, not assumed: (1) deleting a referenced show/
-- setlist now succeeds and leaves the matching performances column NULL,
-- with every other column on that row unchanged; (2) a direct NULL
-- write to either performances column, by an owner, an accepted
-- delegate, or service_role, while the referenced row still exists, is
-- still rejected with the same message as before; (3) deleting a shows
-- row referenced by setlists.show_id, or an artists row referenced by
-- setlists.artist_id, still CASCADE-deletes the setlists row exactly as
-- before this migration, unaffected by setlists_lock_links.
--
-- The existence checks run SECURITY DEFINER with search_path pinned to
-- '' and shows/setlists fully schema-qualified — the same reasoning as
-- 0011's auth.users check: an ordinary caller's own RLS-scoped visibility
-- into shows/setlists is incomplete ("no row visible" is not proof "no
-- row exists" for that caller), and the FK's own cascade action runs as
-- the system, not as a session with a meaningful auth.uid(). This is
-- narrowly scoped to these two EXISTS checks inside the trigger
-- function — not a blanket service-role bypass; service_role is still
-- checked by the exact same rule as every other caller, and a direct
-- service_role attempt to null out either column while the parent still
-- exists is still rejected (verified locally).
--
-- Design, matching 0011/0012:
--   - Rejects the UPDATE outright (RAISE EXCEPTION), not a silent revert.
--   - BEFORE UPDATE only — INSERT is completely unaffected.
--   - No unconditional service-role bypass: service_role is checked by
--     the exact same rule as every other caller. Verified locally.
--   - Not a self-referencing RLS WITH CHECK; does not modify
--     can_act_for(), performances_own, setlists_self, role capabilities,
--     or any other existing RLS policy.
--
-- CONFIRMED PRODUCT DECISION (recorded here, not yet implemented): shared
-- events are intentionally supported — separate artist-owned performance
-- records and setlists may legitimately attach to the same event, and
-- the event creator is not required to equal every participating artist.
-- Shared-event membership must never grant cross-artist private access,
-- and linking an artist's record requires both authorization for that
-- specific artist AND a validated relationship to the event. This
-- migration still takes no position on INSERT-time relationship
-- validation implementing that decision — it remains a separate,
-- explicitly open task (see docs/show-artist-link-handoff.md). This
-- migration only prevents an EXISTING link from being silently moved
-- after creation, which is compatible with any future INSERT-time rule
-- shaped by that decision.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_performance_link_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Checked independently — an allowed change to one column must never
  -- bypass validation of the other. Both can legitimately go NULL in the
  -- same UPDATE (e.g. the referenced show AND its setlist were both
  -- deleted in the same transaction, and the FK cascade nulls both
  -- columns in one statement) — each branch verifies its OWN column's
  -- referenced row is actually gone, independent of the other's outcome.
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

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_performance_link_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS performances_lock_links ON public.performances;
CREATE TRIGGER performances_lock_links
  BEFORE UPDATE ON public.performances
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_performance_link_change();

CREATE OR REPLACE FUNCTION public.reject_setlist_link_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.show_id IS DISTINCT FROM NEW.show_id THEN
    RAISE EXCEPTION 'setlists.show_id cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.artist_id IS DISTINCT FROM NEW.artist_id THEN
    RAISE EXCEPTION 'setlists.artist_id cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS setlists_lock_links ON public.setlists;
CREATE TRIGGER setlists_lock_links
  BEFORE UPDATE ON public.setlists
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_setlist_link_change();

COMMIT;

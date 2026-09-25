-- Interim containment: require performances.show_id to match its own
-- performer at INSERT time. PROPOSAL — not yet reviewed/released.
--
-- SCOPE: this is a temporary restriction on NEW performances.show_id
-- attachments only. It is not a redesign of shared events and is not a
-- claim that shared events require show-owner equality. It exists
-- because there is currently no live mechanism (see recon below) that
-- can distinguish "artist B legitimately participates in artist A's
-- event" from "artist B's manager also happens to manage artist A."
-- Until an approved participation mechanism exists, this migration
-- closes that one gap the only way that's actually verifiable today.
--
-- Every live performances INSERT call site was traced directly:
-- app/app/show/new/page.tsx (x2), app/app/show/upload/page.tsx,
-- app/app/new/page.tsx (x2), app/api/upload-performance/route.ts POST.
-- Every one of them creates a fresh shows row and a fresh performances
-- row in the same request, with shows.created_by and performances.
-- user_id set to the exact same targetUserId (= actingAsArtistId ||
-- user.id). Requiring that equality here costs nothing against any
-- confirmed live flow and is a plain DROP TRIGGER away from being
-- lifted once a real participation mechanism ships.
--
-- WHY THIS IS NOT "SUBSTITUTING SHOW-OWNER EQUALITY" FOR AUTHORIZATION:
-- the check below answers "does the show's owner match the performance's
-- performer" — a DATA CONSISTENCY question about the two rows being
-- inserted together. It is evaluated in addition to, not instead of,
-- the existing performances RLS INSERT policy `users_insert_own_
-- performance` (WITH CHECK can_act_for(user_id)), which is what
-- actually answers the AUTHORIZATION question: is this caller allowed
-- to act for that user_id at all. Two supplied identities matching each
-- other proves nothing about the caller unless the caller's right to
-- supply that user_id is checked independently — which the existing RLS
-- policy already does, unchanged and untouched by this migration.
--
-- SERVICE ROLE: this is a BEFORE INSERT TABLE TRIGGER, not an RLS
-- policy — triggers fire for every role including service_role, so
-- unlike RLS WITH CHECK (which service_role bypasses entirely), this
-- check also covers app/api/upload-performance/route.ts's two
-- service-role inserts (POST /api/upload-performance). That route was
-- read in full: it already independently verifies caller authorization
-- for targetUserId (exact owner match, or an accepted artist_delegates
-- row via isAuthorizedFor()) BEFORE any service-role write, and it
-- already only ever sets both shows.created_by and performances.user_id
-- to that same verified targetUserId. This trigger changes nothing
-- about that route's behavior today; it adds a database-level backstop
-- against a future code change silently breaking that invariant at the
-- application layer without this comment being updated to match.
--
-- NULL show_id is untouched — every currently-legitimate NULL case
-- (drafts, uploads that never link a show) remains permitted exactly as
-- today. This trigger only constrains a NON-NULL show_id.
--
-- performances.setlist_id: confirmed via exhaustive grep that ZERO live
-- INSERT call site anywhere in app/ or lib/ ever sets this column — the
-- only places it is ever populated are the test scripts written for
-- 0012/0013. There is also no confirmed relationship anywhere between
-- performances.user_id (-> profiles.id) and artists.id/artists.user_id
-- (the table setlists.artist_id actually references), so "this setlist
-- belongs to the intended artist and event" cannot be validated today
-- without either guessing at that relationship or standing up the
-- membership mechanism this task was explicitly scoped to not build.
-- Rather than leave this silently unenforced, this migration rejects
-- ANY non-NULL setlist_id at performances INSERT time, unconditionally,
-- until that question is resolved (see the companion read-only metadata
-- request for legacy artists/setlists). This costs nothing against
-- confirmed live behavior (nothing sets it today) and is, like the
-- show_id check, a plain DROP TRIGGER away from being lifted.
--
-- Deliberately NOT touched by this migration: artists' or setlists' own
-- RLS/grants (their current production policy/grant state is
-- unconfirmed — see the separate read-only metadata request), the 0013
-- reassignment locks (UPDATE-time, unaffected — this trigger is BEFORE
-- INSERT only), and no historical row of any kind is read, modified, or
-- backfilled by this migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_unauthorized_performance_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Checked independently of the setlist_id branch below, and in
  -- addition to (not instead of) the caller-authorization check already
  -- enforced by the existing users_insert_own_performance RLS policy.
  IF NEW.show_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.shows
      WHERE public.shows.id = NEW.show_id
        AND public.shows.created_by = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'performances.show_id must reference a show created by the same performer (performances.user_id)'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.setlist_id IS NOT NULL THEN
    RAISE EXCEPTION 'performances.setlist_id cannot be set at creation until a validated artist/event participation mechanism exists'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_unauthorized_performance_creation() FROM PUBLIC;

DROP TRIGGER IF EXISTS performances_require_authorized_creation ON public.performances;
CREATE TRIGGER performances_require_authorized_creation
  BEFORE INSERT ON public.performances
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_unauthorized_performance_creation();

COMMIT;

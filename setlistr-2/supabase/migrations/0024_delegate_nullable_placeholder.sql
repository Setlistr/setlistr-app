-- Fixes a real collision found while building the Team page: every
-- pending artist-sent invite to an email with no Setlistr account used
-- delegate_id = artist_id as a placeholder, because delegate_id was
-- NOT NULL and had no other way to represent "no real delegate yet."
-- Every such row for the same artist collapses onto the identical
-- (artist_id, artist_id) key under UNIQUE(artist_id, delegate_id), so an
-- artist can have at most ONE outstanding invite to an unregistered
-- email at a time, regardless of which email. Reproduced live.
--
-- Fix: make delegate_id nullable. UNIQUE(artist_id, delegate_id) is
-- INTENTIONALLY left untouched — NULL never collides with anything
-- under standard unique-constraint semantics, so rows sharing an
-- artist_id with delegate_id = NULL already coexist without violating
-- it, while it continues to enforce, completely unchanged, that any two
-- rows sharing the same REAL delegate_id for the same artist collide.
-- That's what makes a rebind in app/api/team/accept/route.ts (writing a
-- real user id into delegate_id) still correctly rejected if that real
-- (artist_id, delegate_id) pair already exists elsewhere (an existing
-- accepted connection, or an opposing pending request) — no new logic
-- needed for that case, and no reason to touch this constraint.
--
-- The one real gap nullability alone leaves open: nothing stops two
-- rows with the SAME artist_id, delegate_id = NULL, and the SAME
-- invited_email (NULL doesn't collide with NULL either). This migration
-- adds exactly one new, purely additive partial unique index for that
-- case — no DROP CONSTRAINT, no data moved, no existing row touched.
--
-- Scoped to delegate_id IS NULL, so this index matches ZERO rows that
-- exist today (nothing has ever written NULL yet) — this migration has
-- no effect on any current row or on the currently-deployed app code,
-- which never queries or relies on it. Case-insensitive, matching the
-- existing artist_delegates_invited_email_idx convention from migration
-- 0009.
--
-- Deliberately NOT included here, per the approved rollout plan:
--   - No backfill of existing delegate_id = artist_id rows to NULL.
--     That must wait until dual-recognition app code (which understands
--     BOTH the legacy artist_id placeholder and the new NULL one) is
--     already deployed — backfilling first would break any in-flight
--     invitation link the currently-deployed, single-convention code
--     still expects to find as delegate_id = artist_id.
--   - No DROP CONSTRAINT on artist_delegates_artist_id_delegate_id_key —
--     retained exactly as-is; see the design note above.

BEGIN;

ALTER TABLE public.artist_delegates
  ALTER COLUMN delegate_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS artist_delegates_pending_email_key
  ON public.artist_delegates (artist_id, lower(invited_email))
  WHERE delegate_id IS NULL AND accepted_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL;

COMMIT;

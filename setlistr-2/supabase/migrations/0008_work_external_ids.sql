-- Phase 1B.1: authority-specific work identifiers + MLC-candidate provenance.
--
-- Builds on 0007_recording_work_identity.sql. Two independent, additive
-- changes:
--   1. A new work_external_ids table for identifiers that are one
--      authority's opinion of a work (MLC Song Code, BMI Work #, ASCAP
--      Work ID, SOCAN work number, PRS tunecode, SESAC/GMR IDs) — as
--      opposed to ISWC, which stays on works.iswc because it is the single
--      international standard identifier, not one authority's internal ID.
--   2. Extending recording_works.source with 'mlc_candidate', so an
--      MLC-derived recording->work suggestion is distinguishable from a
--      generic 'auto_isrc'/'auto_title' guess — without ever letting it
--      carry more trust than those guesses do today.
--
-- Deliberately NOT included here (see the Phase 1B design pass this
-- migration implements a slice of): work_writers, work_publishers (rights
-- metadata — a materially higher-stakes surface, staged separately), and
-- recordings.mlc_last_queried_at (provider-specific backoff/caching state,
-- deferred until real MLC rate limits and retry semantics are confirmed —
-- adding it now would be guessing at operational behavior we don't know
-- yet). No resolver code, no UI, no MLC calls, no application code changes
-- ship in this migration. The live capture path (app/api/identify,
-- app/app/live/[id]), lib/reconciliation, user_songs, and the orphaned V2
-- tables are untouched.

-- ── work_external_ids: one row per (work, authority, identifier) fact.
-- Deliberately NOT unique on (work_id, authority) — a work may carry more
-- than one registration at the same authority over time (correction,
-- re-registration, territory split), mirroring the same reasoning already
-- applied to recording_works in the Phase 1A review. It IS unique on
-- (authority, identifier): a real identifier value should never point at
-- two different Setlistr works rows — an attempted second insert with an
-- identifier already claimed by another work is a signal to merge, not a
-- genuine new registration, so this constraint doubles as a duplicate-work
-- detector. work_id keeps the same bare REFERENCES (NO ACTION on delete)
-- Phase 1A already uses for recording_works.recording_id/work_id and
-- performance_songs.recording_id — blocking a works delete while
-- identifiers still reference it, rather than silently orphaning them. ──
CREATE TABLE IF NOT EXISTS public.work_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES public.works(id),
  authority TEXT NOT NULL,
  identifier TEXT NOT NULL,
  identifier_type TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_external_ids_authority_check
    CHECK (authority IN ('mlc', 'bmi', 'ascap', 'socan', 'prs', 'sesac', 'gmr'))
);

-- One identifier value maps to at most one work. Also serves as the
-- lookup index for (authority, identifier) — no separate index needed.
CREATE UNIQUE INDEX IF NOT EXISTS work_external_ids_authority_identifier_uidx
  ON public.work_external_ids (authority, identifier);

CREATE INDEX IF NOT EXISTS work_external_ids_work_id_idx
  ON public.work_external_ids (work_id);

-- ── RLS — identical posture to recordings/works in 0007: shared, global
-- reference data, safe to read for any authenticated user, not safe to
-- write from the client (no resolver exists yet to decide when a write is
-- legitimate; the established pattern for trusted writes in this codebase
-- is a service-role server route, e.g. app/api/identify). ───────────────
ALTER TABLE public.work_external_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_external_ids_read" ON public.work_external_ids
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.work_external_ids FROM anon;
REVOKE ALL ON public.work_external_ids FROM authenticated;
GRANT SELECT ON public.work_external_ids TO authenticated;

-- ── recording_works: add 'mlc_candidate' as a distinguishable source for
-- MLC-derived recording->work suggestions.
--
-- Trust reasoning, traced against every existing CHECK constraint in
-- 0007 before touching anything (per review requirement — this section
-- documents that trace so a reviewer doesn't have to redo it):
--
--   A (recording_works_confirmed_requires_trusted_source) already blocks
--   'mlc_candidate' from ever being confirmed, with NO change needed: A
--   requires confidence='confirmed' to imply source IN
--   ('user_confirmed','trusted_external'). Since 'mlc_candidate' is not
--   in that list, any row with source='mlc_candidate' AND
--   confidence='confirmed' already fails A today, the moment
--   'mlc_candidate' becomes a legal source value below.
--
--   D (recording_works_global_scope_shape) already blocks 'mlc_candidate'
--   from ever reaching scope='global', with NO change needed: D requires
--   scope='global' to imply source='trusted_external'. An 'mlc_candidate'
--   row attempting scope='global' already fails D today, for the same
--   reason.
--
--   E (recording_works_user_scope_shape) already blocks 'mlc_candidate'
--   from ever reaching scope='user', with NO change needed: E requires
--   scope='user' to imply source='user_confirmed'. An 'mlc_candidate' row
--   attempting scope='user' already fails E today, for the same reason.
--
--   B and C only fire for source='user_confirmed' and
--   source='trusted_external' respectively — both are no-ops for
--   'mlc_candidate' rows regardless of any other column, so they impose
--   no restriction and need no change.
--
--   F (recording_works_auto_source_shape) is the ONE constraint that
--   actually needs to change. As written today it only fires for
--   source IN ('auto_isrc','auto_title') — for 'mlc_candidate' its
--   condition `source NOT IN (...)` is trivially true, so F currently
--   imposes ZERO restriction on 'mlc_candidate' rows. Without extending
--   it, a row shaped (source='mlc_candidate', confidence='candidate',
--   scope=NULL, scope_owner_id=NULL, confirmed_by=<someone>,
--   confirmed_at=<sometime>) would satisfy every other constraint — the
--   exact class of state-space hole constraint G was added to close for
--   trusted_external+candidate rows in 0007's own review. Extending F's
--   source list to include 'mlc_candidate' closes the same hole here:
--   it pins every mlc_candidate row to confidence='candidate' AND
--   scope IS NULL AND scope_owner_id IS NULL AND confirmed_by IS NULL
--   AND confirmed_at IS NULL — never confirmed, never owned, never
--   carrying confirmation audit fields it has no right to.
--
--   G (recording_works_trusted_external_candidate_shape) only fires for
--   source='trusted_external' — a no-op for 'mlc_candidate', no change
--   needed.
--
-- Net effect: two ALTERs below (source_check widened to allow the new
-- value; F widened to constrain it the same way auto_isrc/auto_title
-- already are). Both are strictly widening changes — every row that
-- satisfied the old constraints still satisfies the new ones — so this is
-- safe to apply regardless of recording_works' current population.
-- Postgres has no ALTER CONSTRAINT to redefine a CHECK's expression in
-- place; DROP + ADD is the only way, hence the two statement pairs below
-- rather than a single ALTER. ────────────────────────────────────────────
ALTER TABLE public.recording_works
  DROP CONSTRAINT IF EXISTS recording_works_source_check;
ALTER TABLE public.recording_works
  ADD CONSTRAINT recording_works_source_check
    CHECK (source IN ('user_confirmed', 'trusted_external', 'auto_isrc', 'auto_title', 'mlc_candidate'));

ALTER TABLE public.recording_works
  DROP CONSTRAINT IF EXISTS recording_works_auto_source_shape;
ALTER TABLE public.recording_works
  ADD CONSTRAINT recording_works_auto_source_shape
    CHECK (
      source NOT IN ('auto_isrc', 'auto_title', 'mlc_candidate')
      OR (
        confidence = 'candidate'
        AND scope IS NULL
        AND scope_owner_id IS NULL
        AND confirmed_by IS NULL
        AND confirmed_at IS NULL
      )
    );

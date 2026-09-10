-- Phase 1A: recording/work identity layer for PRO claim matching.
--
-- Context: today "a song" in Setlistr is a title+artist string on
-- performance_songs, opportunistically enriched with recording-level
-- MusicBrainz metadata (ISRC, a composer/label guess). There is no
-- reusable work (composition) identity anywhere in the live schema — see
-- the Phase 1 recon. An orphaned V2 sketch (compositions, songs,
-- setlist_songs, artists, show_artists, pro_reports) exists in production
-- with zero live app-code references and is deliberately NOT reused here
-- (per-artist-scoped where it should be global, ISWC mislabeled on a
-- recording-shaped table, and its one FK — setlist_songs.composition_id —
-- has never been populated). This migration is a clean-room, additive-only
-- layer instead, designed so a human's confirmation that "this recording is
-- that work" is captured once and reused automatically on every future
-- detection of the same recording, without ever silently promoting an
-- unverified guess into something another artist's claim relies on.
--
-- Schema only. No matching/resolution code, no UI, and no data migration
-- ship in this change — performance_songs.recording_id starts NULL on every
-- existing row and stays NULL until a later, separate resolution step
-- populates it. The live capture path (app/api/identify,
-- app/app/live/[id]), user_songs, and every existing table are untouched.
--
-- ── recordings: a specific commercial (or self-released) recording,
-- global across all artists — not scoped to the artist who happened to
-- detect it first. Two different bands covering the same commercial
-- recording should resolve to the same row, since ACRCloud/MusicBrainz
-- identify the master recording being fingerprinted, not the live
-- performer. Identity strength is derived, never stored: isrc IS NOT NULL
-- is a strong (externally verifiable) identity; isrc IS NULL is a weak
-- (title+artist only) identity that a future resolver falls back to.
-- normalized_title/normalized_artist_name are supplied by the caller (the
-- existing lib/song-utils.ts normalization, not reimplemented here in SQL)
-- so weak-identity lookups and the concurrency-safe unique index below use
-- the same normalization the app already applies elsewhere. ─────────────
CREATE TABLE IF NOT EXISTS public.recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isrc TEXT,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  normalized_artist_name TEXT NOT NULL,
  source TEXT NOT NULL,
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recordings_source_check
    CHECK (source IN ('musicbrainz', 'acrcloud', 'manual'))
);

-- Strong-identity uniqueness: at most one recordings row per real ISRC.
CREATE UNIQUE INDEX IF NOT EXISTS recordings_isrc_uidx
  ON public.recordings (isrc)
  WHERE isrc IS NOT NULL;

-- Weak-identity uniqueness: at most one recordings row per normalized
-- title+artist among rows with no ISRC. Required so two concurrent
-- find-or-create calls for the same untagged recording cannot each insert
-- a duplicate "reusable" identity that then silently splits future
-- confirmations across two rows.
CREATE UNIQUE INDEX IF NOT EXISTS recordings_weak_identity_uidx
  ON public.recordings (normalized_title, normalized_artist_name)
  WHERE isrc IS NULL;

-- General lookup index covering all rows (the two indexes above are
-- partial and won't serve a title+artist search across ISRC-bearing rows).
CREATE INDEX IF NOT EXISTS recordings_normalized_lookup_idx
  ON public.recordings (normalized_title, normalized_artist_name);

-- ── works: a musical composition, independent of any particular
-- recording of it. Deliberately minimal in Phase 1A — no writers,
-- publishers, or per-society work IDs yet (Phase 1B). ───────────────────
CREATE TABLE IF NOT EXISTS public.works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_title TEXT NOT NULL,
  iswc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS works_iswc_uidx
  ON public.works (iswc)
  WHERE iswc IS NOT NULL;

-- ── recording_works: the trust-bearing link between a recording and the
-- work it performs. This table, not recordings or works themselves, is
-- where "is this mapping safe to reuse, and for whom" is decided.
--
-- Two independent axes, both required to reason about a row:
--   confidence — 'confirmed' (authoritative enough to resolve future
--     lookups) vs 'candidate' (a suggestion, never auto-applied).
--   source — where the mapping claim came from. Only a human
--     ('user_confirmed') or an external source that asserted the
--     recording-to-work relationship itself ('trusted_external' — e.g. a
--     verified PRO API response or MusicBrainz recording->work relation,
--     NOT merely "we separately know both IDs") may ever be 'confirmed'.
--     'auto_isrc'/'auto_title' are system guesses and can only ever be
--     'candidate' — knowing a recording's ISRC and a work's ISWC
--     separately says nothing about whether this recording performs that
--     work; that fact needs its own trust basis, not proximity.
--   scope — who a 'confirmed' row is trusted for. 'global' (trusted for
--     every Setlistr artist) is reserved for source='trusted_external'
--     only — a single human confirming a mapping for their own catalog
--     must never silently become authoritative for every other artist's
--     claims. 'user' scopes the mapping to scope_owner_id's catalog only;
--     scope_owner_id is ON DELETE CASCADE — if the owning profile is
--     deleted, their scoped mappings go with it, since there's no catalog
--     left to be scoped to. confirmed_by records who actually clicked
--     confirm (e.g. a delegate acting for the artist) for audit only —
--     resolution only ever checks scope_owner_id, never confirmed_by, so
--     a delegate's confirmation correctly applies to the artist's own
--     catalog regardless of who performed it. confirmed_by is ON DELETE
--     SET NULL (not CASCADE, and not a permanent NOT NULL invariant): the
--     future confirmation server route is responsible for always setting
--     it to the authenticated actor when a row is first created, but the
--     schema itself does not require it to stay non-null forever, because
--     the confirming delegate's own profile may later be deleted without
--     that deletion being allowed to destroy — or even block deleting —
--     the artist's still-valid scoped mapping.
--
-- Every CHECK below is self-contained (references only columns on this
-- row) per Postgres CHECK-constraint limitations — none of them need to
-- query another table. ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recording_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES public.recordings(id),
  work_id UUID NOT NULL REFERENCES public.works(id),
  confidence TEXT NOT NULL,
  source TEXT NOT NULL,
  scope TEXT,
  scope_owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recording_works_confidence_check
    CHECK (confidence IN ('confirmed', 'candidate')),
  CONSTRAINT recording_works_source_check
    CHECK (source IN ('user_confirmed', 'trusted_external', 'auto_isrc', 'auto_title')),
  CONSTRAINT recording_works_scope_check
    CHECK (scope IS NULL OR scope IN ('global', 'user')),

  -- A: only a human or a trusted external assertion may be 'confirmed'.
  CONSTRAINT recording_works_confirmed_requires_trusted_source
    CHECK (confidence <> 'confirmed' OR source IN ('user_confirmed', 'trusted_external')),

  -- B: a human confirmation is always personally scoped, with an owner
  -- and a confirmation timestamp. confirmed_by is deliberately NOT
  -- required here — it's populated at creation by the trusted server
  -- write path (never enforced by this CHECK), and must be allowed to go
  -- NULL later via ON DELETE SET NULL if the confirming actor's profile
  -- is deleted, without that ever invalidating an otherwise-valid
  -- confirmed mapping. Never global, no exception based on recording
  -- identity strength.
  CONSTRAINT recording_works_user_confirmed_shape
    CHECK (
      source <> 'user_confirmed'
      OR (
        confidence = 'confirmed'
        AND scope = 'user'
        AND scope_owner_id IS NOT NULL
        AND confirmed_at IS NOT NULL
      )
    ),

  -- C: a confirmed trusted-external mapping is always global and unowned.
  CONSTRAINT recording_works_trusted_external_confirmed_shape
    CHECK (
      NOT (source = 'trusted_external' AND confidence = 'confirmed')
      OR (scope = 'global' AND scope_owner_id IS NULL)
    ),

  -- D: global scope is reserved for confirmed, trusted-external rows —
  -- restated from the recipient side so this invariant holds even if a
  -- future migration adds another source value that satisfies C loosely.
  CONSTRAINT recording_works_global_scope_shape
    CHECK (
      scope <> 'global'
      OR (confidence = 'confirmed' AND source = 'trusted_external' AND scope_owner_id IS NULL)
    ),

  -- E: user scope always carries a confirmed, human-sourced, owned row.
  -- confirmed_by is intentionally not required here, for the same reason
  -- as B above — it's provenance only, set at creation by the server
  -- write path, and allowed to become NULL later (ON DELETE SET NULL)
  -- without invalidating the mapping. Resolution keys exclusively on
  -- scope_owner_id, never confirmed_by.
  CONSTRAINT recording_works_user_scope_shape
    CHECK (
      scope <> 'user'
      OR (
        confidence = 'confirmed'
        AND source = 'user_confirmed'
        AND scope_owner_id IS NOT NULL
      )
    ),

  -- F: system guesses are always unconfirmed, unowned candidates — never
  -- auto-applied, never attributed to a person who didn't act.
  CONSTRAINT recording_works_auto_source_shape
    CHECK (
      source NOT IN ('auto_isrc', 'auto_title')
      OR (
        confidence = 'candidate'
        AND scope IS NULL
        AND scope_owner_id IS NULL
        AND confirmed_by IS NULL
        AND confirmed_at IS NULL
      )
    ),

  -- G: an unconfirmed trusted-external candidate carries no confirmation
  -- audit fields either — those only apply once a row is actually
  -- confirmed (via C, into 'global' scope). Closes the state-space gap
  -- found in review: without this, a 'trusted_external'+'candidate' row
  -- could carry a scope_owner_id/confirmed_by/confirmed_at despite not
  -- being confirmed or scoped to anyone.
  CONSTRAINT recording_works_trusted_external_candidate_shape
    CHECK (
      NOT (source = 'trusted_external' AND confidence = 'candidate')
      OR (
        scope IS NULL
        AND scope_owner_id IS NULL
        AND confirmed_by IS NULL
        AND confirmed_at IS NULL
      )
    )
);

-- At most one global, authoritative mapping per recording.
CREATE UNIQUE INDEX IF NOT EXISTS recording_works_global_confirmed_uidx
  ON public.recording_works (recording_id)
  WHERE confidence = 'confirmed' AND scope = 'global';

-- At most one confirmed mapping per (recording, owning artist) — keyed on
-- scope_owner_id (whose catalog), not confirmed_by (who clicked confirm),
-- so different delegates confirming on the same artist's behalf correctly
-- collide on one row, while two unrelated artists never collide with each
-- other even for the identical recording.
CREATE UNIQUE INDEX IF NOT EXISTS recording_works_user_confirmed_uidx
  ON public.recording_works (recording_id, scope_owner_id)
  WHERE confidence = 'confirmed' AND scope = 'user';

CREATE INDEX IF NOT EXISTS recording_works_recording_id_idx
  ON public.recording_works (recording_id);
CREATE INDEX IF NOT EXISTS recording_works_work_id_idx
  ON public.recording_works (work_id);
CREATE INDEX IF NOT EXISTS recording_works_scope_owner_id_idx
  ON public.recording_works (scope_owner_id)
  WHERE scope_owner_id IS NOT NULL;

-- ── performance_songs: one new nullable pointer into the recording
-- registry. Purely additive — every existing row stays NULL, and every
-- existing write to performance_songs (capture, enrich-song, the Phase 0
-- claim-sheet edits) is unaffected, since none of them set this column.
-- Population is deferred to a separate, later resolution step, not part
-- of this migration. recording_id intentionally keeps the default
-- ON DELETE (NO ACTION) — see FK review — blocking a recordings delete
-- while historical performance data still references it is the safe
-- default here. ─────────────────────────────────────────────────────────
ALTER TABLE public.performance_songs
  ADD COLUMN IF NOT EXISTS recording_id UUID REFERENCES public.recordings(id);

CREATE INDEX IF NOT EXISTS performance_songs_recording_id_idx
  ON public.performance_songs (recording_id);

-- ── RLS ───────────────────────────────────────────────────────────────
--
-- recordings/works are shared, global reference data — read access for
-- any authenticated user is safe and matches existing precedent
-- (catalogue_fallback, compositions_read, venues_read all grant
-- unscoped SELECT to authenticated). Write access is deliberately NOT
-- granted to authenticated on either table in Phase 1A: no matching/
-- resolution code exists yet to decide when a "find-or-create" is
-- legitimate, and this codebase's established pattern for trusted writes
-- is a service-role server route (see app/api/identify and CLAUDE.md's
-- "Service role: API routes that write trusted data... instantiate
-- createClient(URL, SUPABASE_SERVICE_ROLE_KEY)... this bypasses RLS") —
-- the future resolver should follow that same pattern rather than this
-- migration inventing an under-specified client-side insert policy.
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recordings_read" ON public.recordings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "works_read" ON public.works
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.recordings FROM anon;
REVOKE ALL ON public.recordings FROM authenticated;
GRANT SELECT ON public.recordings TO authenticated;

REVOKE ALL ON public.works FROM anon;
REVOKE ALL ON public.works FROM authenticated;
GRANT SELECT ON public.works TO authenticated;

-- recording_works is the trust boundary this whole migration exists to
-- protect (see the table comment above). No authenticated policy is
-- created for it at all in Phase 1A — not even SELECT — deliberately more
-- conservative than "no writes": a correct SELECT policy needs to
-- distinguish global-confirmed rows (safe for anyone to read), an
-- artist's own user-scoped rows (safe for that artist and their accepted
-- delegates via can_act_for), and unowned candidate rows (arguably safe
-- for anyone, since they're non-authoritative), and no UI or resolver
-- exists yet to exercise any of that. Rather than encode an
-- under-exercised, easy-to-get-subtly-wrong SELECT policy now, this table
-- is fully service-role-only until the confirmation UI and its read
-- access pattern are actually designed together. This also makes the
-- hard requirement trivially true rather than merely intended: no policy
-- anywhere on this table lets an authenticated client write (or read)
-- source='trusted_external' or scope='global' rows.
ALTER TABLE public.recording_works ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recording_works FROM anon;
REVOKE ALL ON public.recording_works FROM authenticated;

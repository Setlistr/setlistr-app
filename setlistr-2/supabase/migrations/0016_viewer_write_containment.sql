-- Applied to production manually via Supabase SQL Editor on 2026-09-28.
-- Retained as a record. Do not reapply.

-- Viewer-write containment (DB layer). NOT full capability enforcement —
-- a single coarse boundary: an accepted, non-revoked delegate whose role
-- is 'manager', 'tour_manager', or 'band_member' may write; one whose
-- role is 'viewer' (or anything not in that explicit allowlist) may only
-- read. Finer-grained capability differentiation (schedule vs. submit vs.
-- view_financial, etc.) is explicitly out of scope for this patch.
--
-- can_write_for() is an EXPLICIT RECOGNIZED-ROLE ALLOWLIST
-- (role IN (...)), not role <> 'viewer'. This matters: a NOT-EQUAL test
-- would let an unrecognized future role string through by accident; an
-- IN-list denies anything not explicitly named, including NULL (NULL IN
-- (...) evaluates to NULL/not-true inside this function's WHERE-scoped
-- EXISTS, which is correctly treated as no-match — this is a WHERE
-- predicate, not a table CHECK constraint, so the NULL-passthrough
-- behavior CHECK constraints have does not apply here).

BEGIN;
CREATE OR REPLACE FUNCTION public.can_write_for(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    auth.uid() = target
    or exists (
      select 1
      from artist_delegates
      where artist_delegates.artist_id = target
        and artist_delegates.delegate_id = auth.uid()
        and artist_delegates.accepted_at is not null
        and artist_delegates.revoked_at is null
        and artist_delegates.role in ('manager', 'tour_manager', 'band_member')
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.can_write_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_for(uuid) TO authenticated, service_role;

-- ── performances ─────────────────────────────────────────────────────────
-- Splits the verified performances_own (FOR ALL) and
-- users_insert_own_performance (INSERT) policies. Every overlapping
-- permissive policy on this table is replaced, not supplemented — leaving
-- performances_own in place alongside a new write-restricted policy would
-- do nothing, since Postgres ORs permissive policies together.
DROP POLICY IF EXISTS "performances_own" ON public.performances;
DROP POLICY IF EXISTS "users_insert_own_performance" ON public.performances;

CREATE POLICY "performances_read" ON public.performances
  FOR SELECT USING (can_act_for(user_id));
CREATE POLICY "performances_insert" ON public.performances
  FOR INSERT WITH CHECK (can_write_for(user_id));
CREATE POLICY "performances_write" ON public.performances
  FOR UPDATE USING (can_write_for(user_id)) WITH CHECK (can_write_for(user_id));
CREATE POLICY "performances_delete" ON public.performances
  FOR DELETE USING (can_write_for(user_id));

-- ── shows ────────────────────────────────────────────────────────────────
-- Splits the verified shows_self (FOR ALL) and users_insert_own_show
-- (INSERT) policies.
DROP POLICY IF EXISTS "shows_self" ON public.shows;
DROP POLICY IF EXISTS "users_insert_own_show" ON public.shows;

CREATE POLICY "shows_read" ON public.shows
  FOR SELECT USING (can_act_for(created_by));
CREATE POLICY "shows_insert" ON public.shows
  FOR INSERT WITH CHECK (can_write_for(created_by));
CREATE POLICY "shows_write" ON public.shows
  FOR UPDATE USING (can_write_for(created_by)) WITH CHECK (can_write_for(created_by));
CREATE POLICY "shows_delete" ON public.shows
  FOR DELETE USING (can_write_for(created_by));

-- ── setlists ─────────────────────────────────────────────────────────────
-- Splits the verified setlists_self (FOR ALL) policy, which had no
-- separate INSERT policy of its own — INSERT was governed only by this
-- FOR ALL policy's implicit WITH CHECK. That implicit check constrained
-- only show_id, never artist_id — an existing, separate, already-
-- identified gap (a caller who can act for the show's owner can insert a
-- setlists row naming ANY artist_id, matched to no real relationship).
-- This split does NOT close that gap and does not claim to: the new
-- setlists_insert policy below preserves exactly the same show_id-only
-- check, minus viewer access. The artist_id mismatch remains open,
-- tracked separately (show-artist-link-consistency work), pending the
-- shared-participation mechanism that task identified as missing.
DROP POLICY IF EXISTS "setlists_self" ON public.setlists;

CREATE POLICY "setlists_read" ON public.setlists
  FOR SELECT USING (show_id IN (SELECT shows.id FROM public.shows WHERE can_act_for(shows.created_by)));
CREATE POLICY "setlists_insert" ON public.setlists
  FOR INSERT WITH CHECK (show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by)));
CREATE POLICY "setlists_write" ON public.setlists
  FOR UPDATE
  USING (show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by)))
  WITH CHECK (show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by)));
CREATE POLICY "setlists_delete" ON public.setlists
  FOR DELETE USING (show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by)));

-- ── performance_songs ────────────────────────────────────────────────────
-- Splits the verified songs_own (FOR ALL) policy — same shape as
-- performances/shows, via the performances subquery.
DROP POLICY IF EXISTS "songs_own" ON public.performance_songs;

CREATE POLICY "songs_read" ON public.performance_songs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_act_for(performances.user_id)));
CREATE POLICY "songs_insert" ON public.performance_songs
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id)));
CREATE POLICY "songs_write" ON public.performance_songs
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id)));
CREATE POLICY "songs_delete" ON public.performance_songs
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.performances WHERE performances.id = performance_songs.performance_id AND can_write_for(performances.user_id)));

-- ── setlist_items ────────────────────────────────────────────────────────
-- Splits setlist_items_self (FOR ALL), whose live predicate mirrors
-- setlists_self one level deeper (setlist_id -> setlists.show_id ->
-- shows.created_by, via can_act_for). Included explicitly: this table is
-- actively written by live capture/review flows (app/app/live/[id],
-- app/app/review/[id], app/api/identify), unlike setlists itself — leaving
-- its child-item writes on the unsplit FOR ALL policy would let a viewer
-- edit/delete a setlist's songs even after performances/setlists/
-- performance_songs were all correctly contained, undermining the point
-- of this patch.
DROP POLICY IF EXISTS "setlist_items_self" ON public.setlist_items;

CREATE POLICY "setlist_items_read" ON public.setlist_items
  FOR SELECT USING (setlist_id IN (SELECT setlists.id FROM public.setlists WHERE setlists.show_id IN (SELECT shows.id FROM public.shows WHERE can_act_for(shows.created_by))));
CREATE POLICY "setlist_items_insert" ON public.setlist_items
  FOR INSERT WITH CHECK (setlist_id IN (SELECT setlists.id FROM public.setlists WHERE setlists.show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by))));
CREATE POLICY "setlist_items_write" ON public.setlist_items
  FOR UPDATE
  USING (setlist_id IN (SELECT setlists.id FROM public.setlists WHERE setlists.show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by))))
  WITH CHECK (setlist_id IN (SELECT setlists.id FROM public.setlists WHERE setlists.show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by))));
CREATE POLICY "setlist_items_delete" ON public.setlist_items
  FOR DELETE USING (setlist_id IN (SELECT setlists.id FROM public.setlists WHERE setlists.show_id IN (SELECT shows.id FROM public.shows WHERE can_write_for(shows.created_by))));

-- ── Explicitly NOT touched by this migration ────────────────────────────
-- artist_delegates (0010 already closed direct writes; team revocation
-- stays owner-only, unchanged), can_act_for() itself, grants, submission
-- rules, financial access, shared-event semantics, the 0011-0014
-- ownership/relationship triggers (they don't call can_act_for() or
-- can_write_for() and are unaffected by either).

COMMIT;

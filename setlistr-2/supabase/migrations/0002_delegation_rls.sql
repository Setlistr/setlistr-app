-- ============================================================
-- DELEGATION-AWARE RLS — REVIEW ONLY, NOT RUN THIS SESSION
--
-- Every policy body below is a direct edit of the corresponding
-- policy's exact text in supabase/migrations/0001_baseline.sql —
-- nothing here was inferred from application code or re-derived
-- from scratch. Only the innermost `auth.uid() = <col>` (or
-- `<col> = auth.uid()`) comparison in each policy was replaced
-- with a call to can_act_for(<col>); every surrounding EXISTS/IN
-- join, policy name, command, and role list is unchanged.
--
-- Do not run this file. Do not connect to any database. This is
-- a text artifact for review.
-- ============================================================


-- ============================================================
-- PART 1 — predicate function
-- ============================================================

-- SECURITY DEFINER is required here, not optional: this function's
-- own body queries artist_delegates, and artist_delegates has its
-- own RLS policies (artist_delegates_select, etc., in
-- 0001_baseline.sql) that themselves call auth.uid(). If this
-- function ran with the caller's normal (non-definer) privileges,
-- its internal SELECT against artist_delegates would be subject to
-- artist_delegates' own RLS at the same time this function is being
-- used to help satisfy RLS on some *other* table — which is either
-- circular or simply blocks legitimate delegates from ever reading
-- their own delegation row in the first place. SECURITY DEFINER
-- makes this function run as its owner, bypassing RLS on the one
-- table it touches internally.
--
-- This is safe to do specifically because the function's surface
-- area is minimal by construction: it takes exactly one argument
-- (a uuid), returns exactly one thing (a boolean), and contains no
-- dynamic SQL, no side effects, and no path for the caller to
-- influence what gets queried beyond that single uuid comparison.
-- It cannot be used to exfiltrate arbitrary rows from
-- artist_delegates — it can only ever answer "yes" or "no" for the
-- specific target passed in, evaluated against whoever auth.uid()
-- currently is.
create or replace function public.can_act_for(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    auth.uid() = target
    or exists (
      select 1 from artist_delegates
      where artist_delegates.artist_id = target
        and artist_delegates.delegate_id = auth.uid()
        and artist_delegates.accepted_at is not null
    );
$$;

revoke all on function public.can_act_for(uuid) from public;
grant execute on function public.can_act_for(uuid) to authenticated;


-- ============================================================
-- PART 2 — policy rewrites
-- ============================================================

-- ── performances ───────────────────────────────────────────────

DROP POLICY IF EXISTS "performances_own" ON performances;
CREATE POLICY "performances_own" ON performances
  FOR ALL
  USING (can_act_for(user_id));

DROP POLICY IF EXISTS "users_insert_own_performance" ON performances;
CREATE POLICY "users_insert_own_performance" ON performances
  FOR INSERT
  WITH CHECK (can_act_for(user_id));

-- ── shows ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "shows_self" ON shows;
CREATE POLICY "shows_self" ON shows
  FOR ALL
  USING (can_act_for(created_by));

DROP POLICY IF EXISTS "users_insert_own_show" ON shows;
CREATE POLICY "users_insert_own_show" ON shows
  FOR INSERT
  WITH CHECK (can_act_for(created_by));

-- ── performance_songs ──────────────────────────────────────────

DROP POLICY IF EXISTS "songs_own" ON performance_songs;
CREATE POLICY "songs_own" ON performance_songs
  FOR ALL
  USING (EXISTS ( SELECT 1
   FROM performances
  WHERE ((performances.id = performance_songs.performance_id) AND can_act_for(performances.user_id))));

-- ── attachments ────────────────────────────────────────────────

DROP POLICY IF EXISTS "attachments_own" ON attachments;
CREATE POLICY "attachments_own" ON attachments
  FOR ALL
  USING (EXISTS ( SELECT 1
   FROM performances
  WHERE ((performances.id = attachments.performance_id) AND can_act_for(performances.user_id))));

-- ── capture_sessions ───────────────────────────────────────────

DROP POLICY IF EXISTS "capture_sessions_own" ON capture_sessions;
CREATE POLICY "capture_sessions_own" ON capture_sessions
  FOR ALL
  USING (EXISTS ( SELECT 1
   FROM performances
  WHERE ((performances.id = capture_sessions.performance_id) AND can_act_for(performances.user_id))));

-- ── detection_events ───────────────────────────────────────────

DROP POLICY IF EXISTS "detection_events_own" ON detection_events;
CREATE POLICY "detection_events_own" ON detection_events
  FOR SELECT
  TO authenticated
  USING (EXISTS ( SELECT 1
   FROM performances
  WHERE ((performances.id = detection_events.performance_id) AND can_act_for(performances.user_id))));

-- ── setlist_songs ──────────────────────────────────────────────

DROP POLICY IF EXISTS "setlist_songs_self" ON setlist_songs;
CREATE POLICY "setlist_songs_self" ON setlist_songs
  FOR ALL
  USING (performance_id IN ( SELECT performances.id
   FROM performances
  WHERE can_act_for(performances.user_id)));

-- ── setlists ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "setlists_self" ON setlists;
CREATE POLICY "setlists_self" ON setlists
  FOR ALL
  USING (show_id IN ( SELECT shows.id
   FROM shows
  WHERE can_act_for(shows.created_by)));

-- ── setlist_items ──────────────────────────────────────────────

DROP POLICY IF EXISTS "setlist_items_self" ON setlist_items;
CREATE POLICY "setlist_items_self" ON setlist_items
  FOR ALL
  USING (setlist_id IN ( SELECT setlists.id
   FROM setlists
  WHERE (setlists.show_id IN ( SELECT shows.id
           FROM shows
          WHERE can_act_for(shows.created_by)))));

-- ── show_artists ───────────────────────────────────────────────

DROP POLICY IF EXISTS "show_artists_self" ON show_artists;
CREATE POLICY "show_artists_self" ON show_artists
  FOR ALL
  USING (show_id IN ( SELECT shows.id
   FROM shows
  WHERE can_act_for(shows.created_by)));

-- ── pro_reports ────────────────────────────────────────────────

DROP POLICY IF EXISTS "pro_reports_self" ON pro_reports;
CREATE POLICY "pro_reports_self" ON pro_reports
  FOR ALL
  USING (show_id IN ( SELECT shows.id
   FROM shows
  WHERE can_act_for(shows.created_by)));

-- ── planned_setlists ───────────────────────────────────────────

DROP POLICY IF EXISTS "Users can manage their own planned setlists" ON planned_setlists;
CREATE POLICY "Users can manage their own planned setlists" ON planned_setlists
  FOR ALL
  USING (can_act_for(user_id))
  WITH CHECK (can_act_for(user_id));

-- ── planned_setlist_songs ──────────────────────────────────────

DROP POLICY IF EXISTS "Users can manage their own planned setlist songs" ON planned_setlist_songs;
CREATE POLICY "Users can manage their own planned setlist songs" ON planned_setlist_songs
  FOR ALL
  USING (EXISTS ( SELECT 1
   FROM planned_setlists
  WHERE ((planned_setlists.id = planned_setlist_songs.planned_setlist_id) AND can_act_for(planned_setlists.user_id))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM planned_setlists
  WHERE ((planned_setlists.id = planned_setlist_songs.planned_setlist_id) AND can_act_for(planned_setlists.user_id))));

-- ── user_songs ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "user_songs_self" ON user_songs;
CREATE POLICY "user_songs_self" ON user_songs
  FOR ALL
  USING (can_act_for(user_id));

-- ── user_song_performances ─────────────────────────────────────

DROP POLICY IF EXISTS "user_song_performances_self" ON user_song_performances;
CREATE POLICY "user_song_performances_self" ON user_song_performances
  FOR ALL
  USING (can_act_for(user_id));

-- ── user_song_rejections ───────────────────────────────────────

DROP POLICY IF EXISTS "user_song_rejections_self" ON user_song_rejections;
CREATE POLICY "user_song_rejections_self" ON user_song_rejections
  FOR ALL
  USING (can_act_for(user_id));

-- ── manual_song_events ─────────────────────────────────────────

DROP POLICY IF EXISTS "Users see own manual events" ON manual_song_events;
CREATE POLICY "Users see own manual events" ON manual_song_events
  FOR ALL
  USING (can_act_for(user_id));


-- ============================================================
-- PART 3 — coverage notes
-- ============================================================

-- ── Policies from 0001_baseline.sql NOT modified, with reason ──
--
-- artist_delegates_delete   (artist_delegates) — this table IS the
--   ownership primitive can_act_for() reads from. Rewriting its own
--   policies to call can_act_for() would point the function back at
--   the table it exists to protect: can_act_for() is SECURITY
--   DEFINER specifically to bypass this table's RLS from the
--   outside, so having this table's own policies call it would be
--   circular. Left on its direct auth.uid() = artist_id /
--   delegate_id checks.
-- artist_delegates_insert   (artist_delegates) — same reason.
-- artist_delegates_select   (artist_delegates) — same reason.
-- artist_delegates_update   (artist_delegates) — same reason.
-- service_role_all          (beta_invites) — TO service_role only;
--   no auth.uid() ownership comparison exists in this policy to
--   replace.
-- users_accept_own_invite   (beta_invites) — ownership check is
--   `email = auth.jwt() ->> 'email'`, not a uuid column comparable
--   to can_act_for(uuid); also not obviously something a delegate
--   should be able to do on an artist's behalf.
-- users_read_own_invite     (beta_invites) — same reason, email-
--   keyed, not uuid-keyed.
-- "Authenticated users can read catalogue_fallback" (catalogue_fallback)
--   — USING (true); shared reference table, no ownership check to
--   replace.
-- compositions_read         (compositions) — USING (auth.role() =
--   'authenticated'); a role check, not an ownership comparison.
-- "Service role can insert profiles" (profiles) — TO service_role
--   only; no auth.uid() ownership comparison to replace.
-- profiles_self             (profiles) — not in the requested table
--   list; left untouched as instructed.
-- publisher_accounts_admin  (publisher_accounts) — not in the
--   requested table list; also role-based (profiles.role='admin'),
--   not an ownership comparison.
-- publisher_accounts_own    (publisher_accounts) — not in the
--   requested table list.
-- publisher_invites_admin   (publisher_invites) — not in the
--   requested table list; role-based.
-- publisher_invites_own     (publisher_invites) — not in the
--   requested table list.
-- publisher_roster_admin    (publisher_roster) — not in the
--   requested table list; role-based.
-- publisher_roster_own      (publisher_roster) — not in the
--   requested table list.
-- rd_log_superadmin_all     (rd_log) — hardcoded email allowlist,
--   not a uuid ownership comparison; also not in the requested list.
-- venues_insert              (venues) — WITH CHECK (auth.uid() IS
--   NOT NULL); a non-null check, not an ownership comparison.
-- venues_read                (venues) — USING (true); public read,
--   no ownership check to replace.
-- waitlist_insert             (waitlist) — WITH CHECK (true); public
--   insert, no ownership check to replace.
--
-- ── Ambiguities in the rewrite itself ──
--
-- 1. planned_setlists / planned_setlist_songs WITH CHECK semantics:
--    can_act_for(user_id) in a WITH CHECK clause permits a delegate
--    to INSERT a row where user_id is set to whatever value they're
--    authorized to act for — but that only extends delegate write
--    access in practice if the application actually sets user_id to
--    the target artist's id when a delegate is acting. An earlier
--    audit this session (docs/delegation-audit.md) found that
--    app/app/show/new/page.tsx's insert paths write user_id: user.id
--    (the session/delegate's own id) regardless of acting-as
--    context for at least the performances table. If the same
--    pattern holds for planned_setlists, this WITH CHECK rewrite is
--    correct but functionally inert for delegate-initiated inserts
--    — can_act_for(delegate's own id) is trivially true via the
--    auth.uid() = target branch, whether or not the delegation
--    branch was ever needed. Whether that's the intended scope here
--    (loosen reads/updates on existing rows, leave insert-time
--    attribution as-is) or an open gap (inserts still get attributed
--    to the delegate, not the artist) isn't something this file can
--    resolve — it depends on application code not covered by this
--    migration.
--
-- 2. detection_events_own has no INSERT/UPDATE/DELETE counterpart:
--    0001_baseline.sql contains only a SELECT policy for
--    detection_events; there is no write-side policy at all (writes
--    to this table go through the service-role client per
--    docs/api-auth-audit.md, bypassing RLS entirely). So this
--    rewrite only ever affects what a delegate can read, never what
--    they can write — flagging in case the intent was broader
--    delegate write access to detection history, which doesn't
--    exist to extend here.
--
-- 3. user_song_performances_self / user_song_rejections_self are
--    FOR ALL policies on what earlier audits (docs/rls-coverage-audit.md,
--    the API-auth review of app/api/identify) characterized as
--    guard/dedup and rejection-tracking tables, not content tables.
--    Extending can_act_for() to FOR ALL here means a delegate can
--    also UPDATE/DELETE these rows, not just read them — which may
--    have different implications than delegate access to visible
--    content (e.g. a delegate clearing a rejection or dedup-guard
--    row is invisible to the artist and could silently change
--    detection/memory-bias behavior on their account). The task
--    asked to preserve each policy's command (FOR ALL) exactly, so
--    that's what this file does — flagging the write-access
--    implication rather than narrowing the command myself.
--
-- 4. Two separate ownership hierarchies get the same treatment:
--    performances/performance_songs/attachments/capture_sessions/
--    detection_events key off performances.user_id, while
--    shows/setlists/setlist_items/show_artists/pro_reports key off
--    shows.created_by. can_act_for() takes a bare uuid so it works
--    identically against either column, but this file has no way to
--    confirm from SQL alone that performances.user_id and
--    shows.created_by are always populated with the same value for
--    what the application treats as one logical performance/show —
--    if they ever diverge for the same row, can_act_for() would
--    give a different answer depending on which hierarchy a given
--    policy checks.

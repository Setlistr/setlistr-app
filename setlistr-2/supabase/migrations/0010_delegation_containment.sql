-- Delegation containment hotfix — Patch 1: database boundary.
--
-- Live introspection (Supabase SQL Editor, read-only catalog query) confirmed
-- what the tracked artist_delegates_update policy's text already implied:
-- authenticated users hold UPDATE on every column of their own
-- artist_delegates row, with no WITH CHECK narrowing it. Combined with
-- artist_delegates_insert (WITH CHECK auth.uid() = artist_id, which permits
-- a self-referential row where delegate_id also equals the inserting user),
-- this is a complete, no-prior-invitation-required exploit chain: a user can
-- INSERT a row naming themselves as both artist_id and delegate_id, then
-- UPDATE that same row's artist_id to any other real artist, and set
-- role/accepted_at in the same statement — manufacturing a self-accepted
-- delegation (of any role) for an artist who never invited them.
--
-- An exhaustive search across every .ts/.tsx file referencing
-- artist_delegates (not just the team/ routes) found every write to this
-- table going through a service-role client: app/api/team/invite,
-- app/api/team/accept, app/api/team/delegates (DELETE), app/api/admin/
-- assign-delegate, app/api/account/delete. None of them rely on the
-- authenticated client having direct INSERT/UPDATE/DELETE on this table.
-- That repository-code finding is why this patch removes that access —
-- real-database and route-integration testing against the change itself
-- remains outstanding and is not represented as complete here.
--
-- Scope, deliberately narrow (Patch 1 only):
--   - artist_delegates: remove the three direct-write RLS policies, revoke
--     non-SELECT table privileges from PUBLIC/anon/authenticated.
--   - performances: revoke only the administrative privileges (TRUNCATE,
--     TRIGGER, REFERENCES, and MAINTAIN where the server version supports
--     it) that were never intentionally granted for any delegation purpose.
--     DML (SELECT/INSERT/UPDATE/DELETE) is UNTOUCHED — that remains
--     entirely governed by the existing performances_own RLS policy
--     (can_act_for(user_id)), unchanged by this migration.
--   - Explicitly NOT touched: can_act_for() itself, artist_delegates_select,
--     performances_own, songs_own, shows_self, or any other data policy.
--     performances.user_id reassignment and shows.created_by reassignment
--     remain open — out of scope for this patch, tracked separately.
--
-- service_role is never named below, so no REVOKE here touches it. Two
-- separate facts, not one: service_role bypasses RLS (a policy-evaluation
-- property, unrelated to table grants), and separately holds its own
-- explicit table-level grants, confirmed present via this session's live
-- introspection — those grants are untouched because this migration never
-- revokes anything from that role, not because service_role is exempt
-- from grants in general. Matches this repo's own existing convention
-- (see 0005_track_live_access_control.sql, 0006_product_events.sql).

BEGIN;

-- ── artist_delegates: remove direct-client write access ────────────────────
-- SELECT (artist_delegates_select) is untouched — legitimately used by
-- Settings and the team-management UI to read delegate lists.
DROP POLICY IF EXISTS "artist_delegates_insert" ON public.artist_delegates;
DROP POLICY IF EXISTS "artist_delegates_update" ON public.artist_delegates;
DROP POLICY IF EXISTS "artist_delegates_delete" ON public.artist_delegates;

-- Table-level: every non-SELECT privilege, not only DML. TRUNCATE/TRIGGER/
-- REFERENCES were never intentionally granted for any delegation purpose,
-- same reasoning already applied to performances below — symmetric
-- treatment for both tables in this patch.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.artist_delegates FROM PUBLIC, anon, authenticated;

-- Revoking a table-level privilege also revokes any corresponding
-- column-level grant on that table (PostgreSQL REVOKE documentation) — no
-- separate column-level statement is needed.

-- MAINTAIN, same version gate as performances below — PostgreSQL 17+ only.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON public.artist_delegates FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ── performances: remove unused administrative privileges only ─────────────
-- DML privileges (SELECT/INSERT/UPDATE/DELETE) are deliberately NOT touched
-- here — those remain fully governed by performances_own's existing
-- can_act_for(user_id) RLS check, exactly as before this migration.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.performances FROM PUBLIC, anon, authenticated;

-- MAINTAIN is only a valid privilege on PostgreSQL 17+ — gated behind a
-- runtime version check and executed as dynamic SQL so this migration does
-- not fail to PARSE on an older server (a REVOKE MAINTAIN statement written
-- directly would be a syntax error pre-17, not just a runtime no-op).
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON public.performances FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

COMMIT;

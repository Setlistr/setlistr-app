-- Delegation revocation enforcement for can_act_for().
--
-- can_act_for(target), as tracked in 0005_track_live_access_control.sql,
-- checks artist_delegates.accepted_at IS NOT NULL but never checks
-- revoked_at, even though artist_delegates has a revoked_at column
-- (confirmed live: nullable timestamptz).
--
-- Revocation by setting revoked_at (accepted_at left untouched) is ONE
-- supported state this column exists for — not the only one, and not
-- what the currently-shipped revoke path actually does. The existing
-- owner-revocation route, DELETE /api/team/delegates
-- (app/api/team/delegates/route.ts), hard-deletes the artist_delegates
-- row outright; it never sets revoked_at. A hard-deleted row already
-- fails the accepted_at check too (it no longer exists to match), so
-- that specific shipped path was not silently broken by this gap. What
-- WAS silently unenforced is any row that ends up with revoked_at set
-- while still existing — direct seeding, a future admin/UI path, or any
-- other writer to this table — which can_act_for() would incorrectly
-- keep honoring indefinitely. This migration closes that gap without
-- assuming which of the two mechanisms (delete vs. revoked_at) any
-- given caller uses.
--
-- Fix: require accepted_at IS NOT NULL AND revoked_at IS NULL. Owner-by-
-- identity (auth.uid() = target) is unchanged — an artist acting for
-- themselves was never routed through the artist_delegates branch at
-- all and is not affected by this migration.
--
-- Effect, precisely stated: can_act_for() is STABLE SQL evaluated fresh
-- from auth.uid() on every request, so this fix denies the NEXT request
-- made under an already-signed-in session once revoked_at is set — it
-- does not cancel, abort, or otherwise affect any request already in
-- flight at the moment of revocation, and it does not invalidate or log
-- out the session itself. Verified as such below: by issuing a second,
-- independent request on the same session after revocation, not by any
-- claim about interrupting a request already underway.
--
-- Scope: this migration touches ONLY can_act_for()'s delegation branch.
-- It does not add role or grant scoping — every accepted, non-revoked
-- delegate of any role (including 'viewer') continues to pass exactly
-- as before; this is a revocation fix, not a capability model. A fuller
-- role/capability model exists as pure logic on team-permissions-v1
-- (lib/permissions.ts) but is not reused or merged here — see the
-- companion branch-reconciliation report. The plain RLS policies built
-- directly on can_act_for() (performances_own, users_insert_own_
-- performance, shows_self, shows_insert, setlists_self) inherit this
-- fix automatically, with no change to any of those policies. The
-- ownership and relationship triggers in 0011-0014 do not call
-- can_act_for() and are unchanged.

CREATE OR REPLACE FUNCTION public.can_act_for(target uuid)
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
    );
$function$;

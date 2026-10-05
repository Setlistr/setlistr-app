-- Manager recruitment + artist-initiated-by-manager connection requests.
--
-- Additive only. No RLS policy changes: both new write paths (creating a
-- request, and the artist approving/declining it) go through a
-- service-role route with its own explicit authorization check — the
-- same established pattern app/api/team/invite and app/api/team/accept
-- already use, confirmed by reading both before writing this.
--
-- Verified directly against information_schema.table_privileges on both
-- local and production: authenticated/anon hold SELECT only on
-- artist_delegates — no INSERT/UPDATE/DELETE grant exists for those
-- roles, so the artist_delegates_insert/_update RLS policies can never
-- actually be exercised via PostgREST regardless of their text (Postgres
-- checks the table-level grant before RLS is even consulted). The real
-- and only enforcement boundary for these writes is the service-role
-- route's explicit authorization check, not any RLS policy.
--
-- Directionality reuses the existing invited_by column rather than a new
-- one — confirmed via grep that it is only ever written as artist_id
-- today and never read for branching logic anywhere, so this convention
-- is additive, not a behavior change for any existing row:
--   invited_by = artist_id    -> artist-initiated invite (existing)
--   invited_by = delegate_id  -> manager-initiated request (new)

BEGIN;

-- Artist's explicit decline of a manager-initiated request. Distinct from
-- revoked_at (which only ever follows a prior accepted_at) and from a
-- silently-still-pending row (both NULL).
ALTER TABLE public.artist_delegates ADD COLUMN IF NOT EXISTS declined_at timestamptz;

-- Recruiter's stated intent at invite time — selects which onboarding/
-- workspace a brand-new user with zero delegations lands on. Grants
-- nothing by itself; can_act_for()/can_write_for() never consult it, and
-- every existing authorization path is unchanged.
ALTER TABLE public.beta_invites ADD COLUMN IF NOT EXISTS invited_role text NOT NULL DEFAULT 'artist';

ALTER TABLE public.beta_invites DROP CONSTRAINT IF EXISTS beta_invites_invited_role_check;
ALTER TABLE public.beta_invites ADD CONSTRAINT beta_invites_invited_role_check
  CHECK (invited_role IN ('artist', 'manager'));

COMMIT;

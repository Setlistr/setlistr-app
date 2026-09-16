-- Track already-live production schema state in source control: invited_email,
-- grants, and revoked_at were added directly in the Supabase SQL Editor (same
-- pattern already used for can_act_for()/performances_visible in
-- 0005_track_live_access_control.sql) ahead of the invite-binding fix in
-- app/api/team/invite/route.ts and app/api/team/accept/route.ts — a delegate
-- invite sent to someone without a Setlistr account inserted a placeholder
-- row (delegate_id = artist_id) with the invited email recorded nowhere,
-- which meant that person could never satisfy accept/route.ts's
-- `delegate_id === user.id` check and could never accept.
--
-- This file exists only so the repo can reproduce that already-live state
-- from source — it changes nothing about production schema behavior.
-- invite_token's existing default (encode(gen_random_bytes(16),'hex')) is
-- untouched. No RLS policies added, can_act_for() untouched, 0001-0008
-- untouched.
--
-- Every statement below is written to be safe to replay against a database
-- already in the target state (IF NOT EXISTS throughout) — replaying this
-- migration is a no-op on production, not a schema change.
alter table public.artist_delegates
  add column if not exists invited_email text,
  add column if not exists grants text[],
  add column if not exists revoked_at timestamptz;

create index if not exists artist_delegates_invited_email_idx
  on public.artist_delegates (lower(invited_email))
  where invited_email is not null;

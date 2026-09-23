-- Ownership reassignment lock.
--
-- Prevents any UPDATE from changing public.performances.user_id or
-- public.shows.created_by, independent of who is otherwise authorized to
-- write to the row.
--
-- Why a trigger, not RLS: can_act_for(target) permits both the record's
-- current owner (auth.uid() = target) and any of that owner's accepted
-- delegates. performances_own and shows_self have no explicit WITH CHECK,
-- so Postgres applies their USING expression as the implicit WITH CHECK
-- too — evaluated against the NEW row. That means an accepted delegate of
-- artist A, who is *also* an accepted delegate of artist B (or is simply
-- reassigning to themselves — trivially true, since acting for yourself is
-- always allowed), passes can_act_for() against BOTH the old owner and the
-- new one. Checking permission on both sides of a change never establishes
-- that the value didn't move — RLS alone cannot express "this specific
-- column must not change," only "the actor must be allowed to act for
-- whatever value ends up in it." A BEFORE UPDATE trigger comparing
-- OLD IS DISTINCT FROM NEW directly is what actually verifies non-transfer,
-- independent of who is authorized to act.
--
-- Code-path finding (this hotfix, repository grep across app/api, app/app,
-- lib): every .update(...) call site against performances or shows was
-- read in full. Neither user_id nor created_by is ever assigned inside an
-- update() payload anywhere in the app — both are only ever set at INSERT
-- time (including the delegated-creation path, where an accepted manager
-- creates a show/performance with user_id/created_by set to the artist
-- they represent — that's a new row, not a reassignment of an existing
-- one). No admin/reassignment feature exists for either table. There is
-- therefore no known legitimate ownership-transfer workflow to except, and
-- this migration adds none.
--
-- This migration:
--   - Rejects the UPDATE outright (RAISE EXCEPTION) rather than silently
--     restoring the old value, so a caller attempting reassignment gets a
--     clear, loud error instead of a write that silently did nothing to
--     the one field it tried to change.
--   - Only fires BEFORE UPDATE — INSERT is completely untouched, so every
--     legitimate creation path (including delegated creation) is
--     unaffected.
--   - Adds no unconditional service-role bypass. No write path needs one
--     (see above) — service_role is checked by the exact same rule as
--     every other caller (see the shows correction below for the one
--     narrow, evidence-verified exception, which applies identically
--     regardless of caller).
--   - Is not a self-referencing RLS WITH CHECK, and does not modify
--     can_act_for(), role capabilities, or any existing RLS policy on
--     either table.
--
-- CORRECTION (live metadata, this hotfix): shows.created_by is nullable
-- and REFERENCES auth.users(id) ON DELETE SET NULL — not NOT NULL /
-- profiles(id) ON DELETE CASCADE, which the first draft's local fixture
-- had wrong. That FK's own ON DELETE SET NULL action is itself an UPDATE
-- (Postgres implements it via an internal AFTER DELETE trigger on
-- auth.users that runs `UPDATE shows SET created_by = NULL ...`), and a
-- BEFORE UPDATE trigger fires for that UPDATE exactly like any other —
-- there is no built-in way to tell it apart from an ordinary write.
-- Reproduced locally against the exact live FK before fixing this: the
-- first draft's unconditional rejection made auth.admin.deleteUser() on
-- any user who still owned a show fail outright (500 "Database error
-- deleting user"), the auth.users row survived, and the show's
-- created_by was left unchanged — the whole account-deletion transaction
-- aborted because the FK's own cascade got rejected by this trigger.
--
-- The fix is narrowly scoped to that one legitimate case: allow
-- non-NULL -> NULL specifically, and only when the OLD owner's
-- auth.users row has actually, verifiably stopped existing — checked
-- directly (NOT EXISTS on auth.users), not inferred from pg_trigger_depth()
-- or any other incidental signal of "this looks like it came from a
-- cascade." Every other change is rejected exactly as before, including
-- a direct NULL write by the owner, an accepted delegate, or service_role
-- while the referenced auth.users row still exists, and including
-- NULL -> non-NULL (an already-orphaned show can never be reassigned to
-- a new owner this way).
--
-- The auth.users lookup runs SECURITY DEFINER (owned by postgres) with
-- search_path pinned to '' and auth.users fully schema-qualified. Two
-- distinct mechanisms could otherwise make this check wrong, and they
-- fail differently: a caller with no GRANT on auth.users at all gets a
-- hard permission-denied ERROR the moment it queries the table — that
-- failure is loud, not silently misread as "the row doesn't exist."  The
-- real hazard is Row Level Security: auth.users has RLS enabled in this
-- local instance (confirmed: relrowsecurity = true), and RLS filtering
-- is silent — a caller whose policy hides a row gets a successful query
-- with zero rows back, indistinguishable from that row genuinely not
-- existing. Confirmed separately that anon/authenticated hold no direct
-- table-level grant on auth.users at all here, so today's ordinary
-- caller would in fact hit the loud permission error first — but that's
-- an incidental fact about current grants, not something this function
-- should depend on. SECURITY DEFINER is what makes the check correct
-- regardless of either mechanism: the EXISTS/NOT EXISTS check always
-- runs with the function owner's (postgres) fixed visibility into
-- auth.users, not the calling role's, so it reflects the row's actual
-- existence independent of whatever grants or RLS policies apply to
-- whoever is making the request.
-- Verified directly against this local Postgres, not assumed: (1) the
-- exact FK-cascade scenario above now succeeds and leaves created_by
-- NULL; (2) service_role and an authenticated owner both still get the
-- same clean rejection, with the same message, when attempting a direct
-- NULL write while the referenced user still exists — no permission-
-- denied error leaking through or masking the rejection.
--
-- performances.user_id is NOT NULL and REFERENCES profiles(id) ON DELETE
-- CASCADE (not auth.users, and not SET NULL) — account deletion deletes
-- performances outright via that cascade (see app/api/account/delete/
-- route.ts, which also explicitly .delete()s performances by user_id
-- itself), never nulls user_id. That's a structurally different
-- relationship from shows.created_by -> auth.users ON DELETE SET NULL,
-- so performances has no equivalent case and its trigger is unchanged
-- below.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_performance_owner_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'performances.user_id cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS performances_lock_owner ON public.performances;
CREATE TRIGGER performances_lock_owner
  BEFORE UPDATE ON public.performances
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_performance_owner_change();

CREATE OR REPLACE FUNCTION public.reject_show_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    -- Narrow exception: non-NULL -> NULL, and only when the OLD owner's
    -- auth.users row has actually stopped existing (not merely invisible
    -- to the caller — this function's own privileges decide that, not
    -- the caller's). Everything else falls through to the rejection
    -- below, including a direct NULL write while the user still exists
    -- and any NULL -> non-NULL reassignment of an already-orphaned show.
    IF OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = OLD.created_by)
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'shows.created_by cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_show_owner_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS shows_lock_owner ON public.shows;
CREATE TRIGGER shows_lock_owner
  BEFORE UPDATE ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_show_owner_change();

COMMIT;

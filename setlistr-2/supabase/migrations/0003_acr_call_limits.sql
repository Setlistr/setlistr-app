-- Per-profile ACRCloud call quota.
--
-- Two counters on `profiles`:
--   acr_calls_today    — resets at 5am America/Chicago (Nashville)
--   acr_calls_lifetime — never resets
--
-- The daily reset is derived, not scheduled. Storing the window this counter
-- belongs to and comparing it on each call means there is no cron job to fail
-- silently, and 'America/Chicago' keeps it correct across DST changes.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS acr_calls_today    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acr_calls_lifetime BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acr_window_start   DATE;

COMMENT ON COLUMN profiles.acr_calls_today IS
  'ACRCloud calls in the current 5am-Chicago window. See increment_acr_usage().';
COMMENT ON COLUMN profiles.acr_calls_lifetime IS
  'ACRCloud calls ever made by this profile. Never reset.';
COMMENT ON COLUMN profiles.acr_window_start IS
  'Which 5am-Chicago day acr_calls_today belongs to; a mismatch means roll over.';

-- Atomic check-and-increment.
--
-- Must be one statement: live capture fires every 20s and upload mode fires in
-- a burst, so a read-then-write from the application would race and undercount
-- exactly when the count matters most.
--
-- Returns allowed=false ONLY when the profile is genuinely over its limit. A
-- missing profile row returns allowed=true (fail-open): the row is created by
-- trigger at signup, so its absence is a data anomaly, and a quota lookup must
-- never be the reason a real show fails to capture.
CREATE OR REPLACE FUNCTION public.increment_acr_usage(p_user_id uuid, p_limit integer)
RETURNS TABLE (allowed boolean, calls_today integer, calls_lifetime bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Subtracting 5 hours makes the "day" run 5am→5am rather than midnight.
  v_window date := ((now() AT TIME ZONE 'America/Chicago') - interval '5 hours')::date;
BEGIN
  UPDATE profiles p
     SET acr_window_start   = v_window,
         acr_calls_today    = CASE WHEN p.acr_window_start IS DISTINCT FROM v_window
                                   THEN 1
                                   ELSE COALESCE(p.acr_calls_today, 0) + 1 END,
         acr_calls_lifetime = COALESCE(p.acr_calls_lifetime, 0) + 1
   WHERE p.id = p_user_id
     AND (p.acr_window_start IS DISTINCT FROM v_window
          OR COALESCE(p.acr_calls_today, 0) < p_limit)
  RETURNING true, p.acr_calls_today, p.acr_calls_lifetime
       INTO allowed, calls_today, calls_lifetime;

  IF FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- No row updated: either over the limit, or no such profile.
  SELECT false, COALESCE(p.acr_calls_today, 0), COALESCE(p.acr_calls_lifetime, 0)
    INTO allowed, calls_today, calls_lifetime
    FROM profiles p
   WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    allowed := true; calls_today := 0; calls_lifetime := 0;
  END IF;

  RETURN NEXT;
END;
$$;

-- Only the server may move these counters. The route calls this with the
-- service role; no browser client should be able to inflate or reset a count.
REVOKE ALL ON FUNCTION public.increment_acr_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_acr_usage(uuid, integer) TO service_role;

-- Fixes a real orphan-venue race in PATCH /api/shows/schedule/[id]: that
-- route pre-checked the show's status/updated_at, then (if introducing a
-- brand-new venue) INSERTed it, then ran the actual optimistic-concurrency
-- UPDATE. A concurrent change landing between the pre-check and the final
-- UPDATE — another edit, a cancel, or a schedule-start — made the
-- pre-check stale: the final UPDATE's own WHERE clause correctly affected
-- zero rows (no corrupt write), but the venue row created moments earlier
-- was never cleaned up. A pre-check alone cannot close that window; this
-- replaces it with one locked, single-transaction RPC so the venue insert
-- and the show update either both happen or neither does.
--
-- Additive only: no existing column, constraint, policy, or trigger on
-- shows/venues is altered or dropped — this only adds a new function the
-- PATCH route can call instead of its previous three separate round
-- trips. Reviewed against the real shows/venues/performances schema,
-- existing triggers (reject_unauthorized_performance_creation,
-- reject_show_owner_change, et al.), and can_write_for() before being
-- applied outside local dev — see the migration-review record for the
-- full compatibility check.

BEGIN;

CREATE OR REPLACE FUNCTION public.patch_scheduled_show_with_venue(
  p_show_id uuid,
  p_expected_updated_at timestamptz,
  p_venue_id uuid,          -- point at an existing venue, or NULL
  p_new_venue_name text,    -- create a new venue instead, or NULL
  p_new_venue_city text,
  p_new_venue_country text,
  p_patch jsonb             -- name/show_type/scheduled_at/timezone to set; a key's mere PRESENCE (jsonb ? operator) means "set it", even to null — same convention the route's own patch object already used
)
RETURNS public.shows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_show public.shows%ROWTYPE;
  v_final_venue_id uuid;
  v_row public.shows%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE holds this row for the rest of the transaction: once we've
  -- verified staleness/lock-status below, nothing else can change this
  -- row out from under us before we commit, so the venue insert and the
  -- show update that follow are guaranteed to apply against the exact
  -- state we just checked -- not a snapshot that can go stale mid-request.
  SELECT * INTO v_show FROM public.shows WHERE id = p_show_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHOW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF public.can_write_for(v_show.created_by) IS NOT TRUE THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF v_show.status != 'scheduled' THEN
    RAISE EXCEPTION 'SHOW_LOCKED' USING ERRCODE = '42501';
  END IF;

  IF v_show.updated_at != p_expected_updated_at THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
  END IF;

  IF p_venue_id IS NOT NULL THEN
    v_final_venue_id := p_venue_id;
  ELSIF p_new_venue_name IS NOT NULL THEN
    INSERT INTO public.venues (name, city, country)
    VALUES (p_new_venue_name, p_new_venue_city, p_new_venue_country)
    RETURNING id INTO v_final_venue_id;
  END IF;

  UPDATE public.shows SET
    venue_id     = COALESCE(v_final_venue_id, venue_id),
    name         = CASE WHEN p_patch ? 'name'         THEN (p_patch->>'name')                    ELSE name         END,
    show_type    = CASE WHEN p_patch ? 'show_type'    THEN (p_patch->>'show_type')               ELSE show_type    END,
    scheduled_at = CASE WHEN p_patch ? 'scheduled_at' THEN (p_patch->>'scheduled_at')::timestamptz ELSE scheduled_at END,
    timezone     = CASE WHEN p_patch ? 'timezone'     THEN (p_patch->>'timezone')                ELSE timezone     END
  WHERE id = p_show_id AND updated_at = p_expected_updated_at
  RETURNING * INTO v_row;

  -- Belt-and-suspenders: with the row locked and already verified above,
  -- this should be unreachable in practice, but a failed match here still
  -- means "don't apply the venue insert either" -- the RAISE rolls back
  -- the whole function, venue insert included.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_VERSION' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.patch_scheduled_show_with_venue(uuid, timestamptz, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patch_scheduled_show_with_venue(uuid, timestamptz, uuid, text, text, text, jsonb) TO authenticated;

COMMIT;

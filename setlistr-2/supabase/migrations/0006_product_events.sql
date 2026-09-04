-- Minimal, additive product-analytics event log for post-show friction
-- instrumentation (capture_end_to_show_locked_ms, review_duration_ms,
-- review_interaction_count, manual_correction_count, review_completion_rate,
-- capture_restart_count).
--
-- Read-only recon (2026-09-04) confirmed no first-party event/telemetry
-- infrastructure exists anywhere in the app: the only "analytics" present
-- is Google Analytics (components/GoogleAnalytics.tsx), which is
-- page-view-only, client-side, and has no join key back to
-- performance_id/user_id — it cannot answer any of the metrics above. This
-- is the smallest safe schema to close that gap without a third-party SDK.
--
-- Deliberately touches nothing outside this one new table: no change to
-- public.performances, performances_visible, its security_invoker setting,
-- or its grants. flow_source segmentation is instead derived by joining
-- back to each performance's canonical show_created row (exactly one per
-- performance, enforced below) rather than adding a column to performances.
--
-- Deliberately loose on most columns: no FK constraint on performance_id,
-- every column but event_name/occurred_at is nullable. Telemetry must
-- never fail or block a real user action because of a referential-integrity
-- or NOT NULL error — best-effort observability, not a system of record.
-- The one exception is the idempotency indexes below, which are a
-- deliberate, real constraint — see their comment.

CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  performance_id UUID,
  show_id UUID,
  flow_source TEXT,
  actor_type TEXT,
  action_type TEXT,
  song_count_current INTEGER,
  song_count_detected INTEGER,
  song_count_planned INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_performance_id_idx
  ON public.product_events (performance_id);
CREATE INDEX IF NOT EXISTS product_events_event_name_occurred_at_idx
  ON public.product_events (event_name, occurred_at);

-- Idempotency for single-fire lifecycle events, enforced in product_events
-- itself rather than by adding new state-transition guards to Live/Review
-- product code (that's a separate, not-yet-approved product-hardening
-- task). Each of these three is expected exactly once per performance_id:
--   show_created     — one performance is created once
--   capture_ended    — Live's "End Show" / Upload's processing-complete,
--                      each a one-way transition in the current UI
--   review_completed — the "Save & Complete" boundary
-- Deliberately NOT applied to capture_started, review_opened,
-- review_action, or export_generated — all four legitimately recur
-- (capture restarts, repeated review sessions, every correction, every
-- export tap) and must never be suppressed.
--
-- A partial unique index, not a table-level constraint, so it only
-- constrains these three event names — every other event_name is
-- unaffected. NULL performance_id rows don't conflict with each other
-- (standard NULL-distinct unique-index behavior) — harmless, since
-- performance_id is only ever null in a defensive/unresolved edge case.
-- A conflicting insert fails with a unique_violation (23505), which
-- lib/telemetry.ts's logProductEvent() swallows silently as expected
-- idempotency behavior, never surfaced to the product flow.
CREATE UNIQUE INDEX IF NOT EXISTS product_events_show_created_once
  ON public.product_events (performance_id)
  WHERE event_name = 'show_created';
CREATE UNIQUE INDEX IF NOT EXISTS product_events_capture_ended_once
  ON public.product_events (performance_id)
  WHERE event_name = 'capture_ended';
CREATE UNIQUE INDEX IF NOT EXISTS product_events_review_completed_once
  ON public.product_events (performance_id)
  WHERE event_name = 'review_completed';

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Insert-only from authenticated clients, scoped to the effective actor —
-- self, or an artist the caller is an accepted delegate for (same
-- can_act_for() already used by performances' own RLS policies, tracked in
-- 0005_track_live_access_control.sql). No SELECT policy: clients never
-- read this table back in this pass; only service_role (which bypasses
-- RLS) is expected to query it for analysis.
--
-- Deliberately requires a real user_id — no `user_id IS NULL OR` escape
-- hatch. That clause was an anonymous-write gap: the anon key is public
-- (ships in the client bundle), so a `user_id IS NULL` fallback let any
-- anon caller insert rows via a raw PostgREST request, gated by nothing.
-- Every real emission site (traced 2026-09-04) resolves a real, non-null
-- user_id before logging — see lib/telemetry.ts's call sites — so this is
-- not a functional restriction, only a closed hole.
CREATE POLICY "product_events_insert_own" ON public.product_events
  FOR INSERT
  WITH CHECK (can_act_for(user_id));

-- Explicit privileges — do not rely on default public-schema grants (the
-- same reasoning 0005_track_live_access_control.sql applied to
-- performances_visible/performance_songs_visible). anon gets nothing at
-- all; authenticated gets INSERT only (no SELECT/UPDATE/DELETE — RLS above
-- additionally scopes which rows an insert may target, but the table-level
-- grant is the first gate and must not be broader than that on its own).
-- service_role is untouched — it bypasses RLS and grants both, by Supabase
-- platform convention already relied on throughout this schema.
REVOKE ALL ON public.product_events FROM anon;
REVOKE ALL ON public.product_events FROM authenticated;
GRANT INSERT ON public.product_events TO authenticated;

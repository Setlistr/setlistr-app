-- Upload-only forensic evidence linkage: exact chunk ordering.
--
-- detection_events has no tracked CREATE TABLE (like performances_visible
-- and compositions, it was created directly in Supabase — see
-- 0002_geolocation_verification.sql's note on this same pattern). This is
-- the first tracked change to it.
--
-- Root cause this fixes: lib/reconciliation/evidence.ts matches
-- detection_events to recognition_jobs by TIMESTAMP PROXIMITY (5s/10s
-- tolerance), because there was no exact join key. At Upload concurrency 8,
-- recognition_jobs.completed_at (async ACR completion order) and
-- detection_events.detected_at (later, strictly chunk-ordered progressive
-- reconciliation) are two different clocks that can drift and interleave —
-- confirmed empirically (read-only diagnostic, 2026-09-03) to cause real
-- evidence (Phone Call From Home, Going Missing on a real Owen Riegling
-- Upload test) to be matched to the wrong observation and silently absorbed
-- into a neighboring song's CLUSTER slot, even though RESOLVE scores it
-- strongly (up to 1.0) when it does see it.
--
-- Nullable, no default beyond NULL, no backfill: existing rows (all Live
-- Capture and all pre-fix Upload rows) simply have chunk_index = NULL and
-- continue through the existing timestamp-proximity fallback in evidence.ts
-- completely unchanged. Only new Upload-originated detection_events rows,
-- written after this migration AND after app/api/upload-reconcile/route.ts
-- starts persisting it, will ever have chunk_index set.
--
-- No RLS policy change: detection_events' existing RLS is unaffected by a
-- new nullable column, and both the write path (upload-reconcile's
-- getSupabase()) and the read path (lib/reconciliation/db.ts's
-- getAdminClient()) already use the service-role key, which bypasses RLS
-- entirely regardless.

ALTER TABLE public.detection_events
  ADD COLUMN IF NOT EXISTS chunk_index integer;

COMMENT ON COLUMN public.detection_events.chunk_index IS
  'Upload-only. The 0-based chunk index this detection event corresponds '
  'to (see app/app/upload/new/page.tsx''s chunk scheduler and '
  'app/api/upload-reconcile/route.ts, which persists it). NULL for every '
  'Live Capture row and for any Upload row written before this column '
  'existed — those rows are matched to recognition evidence via '
  'lib/reconciliation/evidence.ts''s pre-existing timestamp-proximity '
  'fallback, unchanged. Never populated or read by app/api/identify or '
  'Live Capture.';

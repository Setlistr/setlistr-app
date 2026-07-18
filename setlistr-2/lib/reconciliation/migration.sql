-- ============================================
-- RECONCILIATION ENGINE — PHASE 1
-- Additive only. No FKs from existing tables point here; these tables only
-- read from performances / performance_songs / recognition_logs /
-- detection_events / recognition_jobs / audio_captures. Run manually.
-- ============================================

CREATE TABLE reconciliation_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('baseline', 'engine')),
  engine_version TEXT NOT NULL,
  params         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message  TEXT,
  scoring        JSONB,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_runs_performance_id ON reconciliation_runs(performance_id);

CREATE TABLE reconciliation_conclusions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  slot_index       INTEGER NOT NULL,
  slot_start       TIMESTAMPTZ,
  slot_end         TIMESTAMPTZ,
  concluded_title  TEXT,
  concluded_artist TEXT,
  concluded_isrc   TEXT,
  tier             TEXT NOT NULL CHECK (tier IN ('CONFIRMED', 'LIKELY', 'UNKNOWN')),
  score            NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  -- { log_row_ids: [...], priors_applied: [{name, weight, detail}, ...], source_tier: 'a'|'b'|'c' }
  -- source_tier is required per the approved RESOLVE ladder — enforced below,
  -- not just a code convention.
  evidence         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT evidence_has_source_tier CHECK (
    evidence ? 'source_tier' AND evidence->>'source_tier' IN ('a', 'b', 'c')
  )
);

CREATE INDEX idx_reconciliation_conclusions_run_id ON reconciliation_conclusions(run_id);

-- RLS enabled, no policies — anon/authenticated clients get zero access.
-- Only the service-role key (which bypasses RLS) can read/write these
-- tables. The engine runs exclusively as a CLI script with the service
-- role (scripts/reconcile.ts via lib/reconciliation/db.ts) — never from a
-- browser, never through an authenticated route in this phase.
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_conclusions ENABLE ROW LEVEL SECURITY;

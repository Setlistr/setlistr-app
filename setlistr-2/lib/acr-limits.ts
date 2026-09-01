// Per-profile ACRCloud call quota.
//
// Each live-capture chunk and each uploaded-audio chunk costs one metered
// ACRCloud call. Without a ceiling, a single account can run up an unbounded
// bill. The counters live on `profiles` and are incremented atomically by the
// `increment_acr_usage` Postgres function — see
// supabase/migrations/0003_acr_call_limits.sql.
//
// Sizing, for reference when changing the number below:
//   live capture      1 call / 20s  →  180 calls per hour
//   a 4-hour night    ~720 calls
//   a 60-min upload   ~180 calls, in a burst with no spacing
//   busy day (2 shows + an upload) ~1,500–2,000
// The default leaves headroom over the busiest realistic day.
//
// Lower this to a small number to exercise the limit-reached path, then raise
// it again. It is a plain constant, so changing it requires a redeploy.

export const ACR_DAILY_CALL_LIMIT = 1500

// Shown to the artist when the ceiling is hit. Capture deliberately keeps
// running — only the paid calls stop — so the show can still be saved by hand.
export const ACR_LIMIT_MESSAGE =
  'Song detection limit reached for today. You can still add songs manually'

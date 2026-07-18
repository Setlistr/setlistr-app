// Every tunable weight for the reconciliation engine lives here, named, in one place.
// Changing scoring behavior should never require touching cluster.ts/resolve.ts/conclude.ts.

export const RECONCILIATION_CONFIG = {
  // v2 (2026-07-18): CLUSTER's absorption cap can no longer swallow a
  // second real song into an anchor's slot — see the "CONFIRMED FAILURE
  // MODE" comment in cluster.ts (Scotiabank slot 7, "Dammit" absorbed into
  // "Old Apartment"). v1 runs predate this fix and reflect the old
  // absorb-everything-to-1.5x behavior.
  ENGINE_VERSION: 'phase1-v2',

  // ── CONCLUDE tiers ────────────────────────────────────────────────────
  CONFIRMED_THRESHOLD: 0.95,
  LIKELY_THRESHOLD: 0.6,

  // ── CLUSTER ───────────────────────────────────────────────────────────
  // A run of this many consecutive same-title auto-confirmed observations
  // anchors a slot outright (skips RESOLVE, scored at ANCHOR_BASE_SCORE).
  ANCHOR_MIN_CONSECUTIVE: 2,
  ANCHOR_BASE_SCORE: 0.97,
  // Song-duration prior: caps a slot at this multiple of the anchor
  // candidate's known duration (from ACR's duration_ms), since a slot
  // can't run longer than someone plausibly playing that song once.
  DURATION_PRIOR_MULTIPLIER: 1.5,
  // Fallback cap when no candidate carries a duration (tier c only, or
  // no anchor yet) — performance_songs.duration_seconds is never populated
  // in this schema, so there is no per-song fallback to reach for.
  DEFAULT_SLOT_MAX_SECONDS: 240,

  // ── RESOLVE weighted scoring ──────────────────────────────────────────
  // Per-rank decay applied to a candidate based on its own rank within a
  // single observation's candidate array (rank 1 = 1.0, rank 2 = this^1, ...).
  RANK_DECAY: 0.8,
  // Tier c candidates are a single collapsed guess synthesized in JS, not
  // ACRCloud's real ranked output — discount confidence accordingly.
  TIER_C_CONFIDENCE_MULTIPLIER: 0.6,
  // Reward the same normalized candidate reappearing across adjacent
  // observations within a slot (consistency across chunks).
  CONSISTENCY_BOOST_PER_OBSERVATION: 0.08,
  CONSISTENCY_BOOST_MAX: 0.24,

  // Priors, each a named additive boost applied once per candidate.
  PLANNED_SETLIST_MEMBERSHIP_BOOST: 0.20,
  // Extra boost when the candidate is also the next un-played planned song
  // in position order (order prior, not just membership).
  PLANNED_SETLIST_ORDER_BOOST: 0.10,
  ARTIST_CATALOGUE_MEMBERSHIP_BOOST: 0.12,
  // Boost scales with how many of the artist's other confirmed setlists
  // contained this song, capped at PRIOR_CONFIRMED_SETLIST_BOOST_MAX_SHOWS.
  PRIOR_CONFIRMED_SETLIST_BOOST_PER_SHOW: 0.03,
  PRIOR_CONFIRMED_SETLIST_BOOST_MAX_SHOWS: 5,

  // Multiplier applied when a candidate matches none of the priors above —
  // i.e. it's not planned, not in the artist's catalogue, and never played
  // before. Guards against ACR matching an unrelated global-catalogue track
  // (e.g. a humming runner-up for a completely different artist/song).
  UNKNOWN_SONG_SUPPRESSION: 0.5,
} as const

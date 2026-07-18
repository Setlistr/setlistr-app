// Benchmark performances for the harness. IDs and row counts verified
// against the live DB during Phase 1 diagnosis (2026-07-15/18).

export interface GoldenSetEntry {
  id: string
  label: string
  venue: string
  date: string
  note: string
}

export const GOLDEN_SET: GoldenSetEntry[] = [
  {
    id: '9301a409-7866-4564-9050-3434cefb6f7e',
    label: 'SMOKE TEST',
    venue: 'Scotiabank Arena',
    date: '2026-06-24',
    note: 'Only golden-set show with full audio_captures/recognition_jobs coverage (tier b available end to end).',
  },
  { id: 'cc2a2767-59f6-4450-9a0d-a34209707547', label: 'secondary', venue: 'Hollywood Bowl', date: '2026-06-23', note: '' },
  { id: '01fe637e-8d11-4506-a0e8-903ab6d3207e', label: 'secondary', venue: 'Hollywood Palladium', date: '2026-06-23', note: '' },
  { id: 'b6a90dd4-526d-496c-a669-457bc38d7ea7', label: 'secondary', venue: "Ranchman's", date: '2026-06-24', note: '' },
  { id: '943bdc6b-eb36-4e85-8b22-16adc6c13e29', label: 'secondary', venue: "Ranchman's", date: '2026-06-24', note: '' },
  { id: '1bef126b-5d3d-4208-a0e5-87db72c50c29', label: 'secondary', venue: "Ranchman's", date: '2026-06-24', note: '' },
  { id: '8991bf47-44d4-4590-a409-a591c6419d68', label: 'secondary', venue: "Ranchman's", date: '2026-06-24', note: '' },
  {
    id: '3b9529f7-e4a1-4c59-849a-e1f324fc674f',
    label: 'secondary',
    venue: "Ranchman's",
    date: '2026-06-24',
    note: 'Partial tier-b coverage (20 audio_captures against 105 detection_events).',
  },
  {
    id: 'ecd875ab-4264-4731-a37d-910b17642df5',
    label: 'secondary',
    venue: 'CMA Fest - Chevy Stage',
    date: '2026-06-29',
    note: 'Confirmed via SQL (2026-07-18): recording_path is null, real 7-minute started_at/ended_at span — this is a normal LIVE capture, not an upload, despite the venue name coincidence with the 2026-06-06 zero-row upload of the same venue name.',
  },
  {
    id: '907aa4f5-db3f-45b7-a826-ba0c18dfc93d',
    label: 'secondary-upload',
    venue: 'CMA Fest Test',
    date: '2026-06-29',
    note: 'Confirmed upload-path recording: recording_path set, started_at == ended_at (both 2026-06-29T00:00:00Z, no real span) — the case that exposed the CLUSTER degenerate-window bug, fixed 2026-07-18.',
  },
]

// Owen's real-world captures — Depot Park (2026-04-26, 29 recognition_logs
// rows) and Pickering Casino (2026-04-17, 31 rows + two fragment sessions
// of 2 and 4 rows). No performance_songs.artist_save_complete=true truth
// exists for these; ground truth is being obtained externally from the
// artist's team. Do not run these through the harness via performance_songs
// truth — wait for the external truth files and pass them with --truth-file.
// Performance IDs intentionally not hardcoded here yet; look them up by
// venue_name + performance_date + user when the truth files are ready.
export const PENDING_REAL_WORLD_SET_NOTE =
  "Depot Park (2026-04-26) and Pickering Casino (2026-04-17, two sessions) — " +
  "awaiting external ground-truth setlists from the artist's team before these can be scored."

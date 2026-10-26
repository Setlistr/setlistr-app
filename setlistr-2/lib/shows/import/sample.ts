// Sample records for the import review on Preview deployments (see mode.ts).
// Every line is labelled "Sample" so it can't be mistaken for real data.
import type { ImportContext } from './server'

export function sampleContext(): ImportContext {
  return {
    records: [
      { key: 'sample:1', venueId: null, venueName: "Lee's Palace", city: 'Toronto', country: 'Canada', localDate: '2025-02-14', instant: Date.parse('2025-02-15T02:40:00Z') },
      { key: 'sample:2', venueId: null, venueName: 'Massey Hall', city: 'Toronto', country: 'Canada', localDate: '2026-11-14', instant: Date.parse('2026-11-15T01:00:00Z') },
    ],
    summaries: {
      'sample:1': { date: '2025-02-14', venue: "Lee's Palace", city: 'Toronto', line: 'Sample record · captured · 9:40 PM EST' },
      'sample:2': { date: '2026-11-14', venue: 'Massey Hall', city: 'Toronto', line: 'Sample record · scheduled · 8:00 PM EST' },
    },
    knownVenues: { "lee's palace|toronto": 'America/Toronto', 'massey hall|toronto': 'America/Toronto' },
    imported: {},
    venueIds: {},
  }
}

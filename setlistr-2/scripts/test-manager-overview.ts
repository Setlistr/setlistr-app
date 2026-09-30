// Behavioral tests for lib/managerOverview.ts — the Manager workspace's
// pure aggregation logic. No Supabase client, no network calls, so this
// makes zero requests of any kind and has nothing to stub.
//
// Focus: exactly the failure modes this build was explicitly told to
// avoid — a busy artist crowding a quiet artist's data out of a shared
// result set, join-inflated row counts, and reimplementing "what counts as
// a real recorded show" instead of reusing isCapturedShow().
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-manager-overview.ts

import {
  dateRangeFor, countCapturedShows, countCapturedShowsByArtist, latestShowPerArtist,
  recentActivityFeed, countNotYetSubmitted, type ManagerPerformanceRow,
} from '../lib/managerOverview'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function row(over: Partial<ManagerPerformanceRow> & { id: string; user_id: string }): ManagerPerformanceRow {
  return {
    status: 'complete', submission_status: null, data_source: null, venue_name: 'The Venue',
    started_at: '2026-01-15T20:00:00Z', performance_date: '2026-01-15',
    ...over,
  }
}

// ── dateRangeFor: pure, injected "now" ────────────────────────────────────
{
  const now = new Date('2026-03-15T00:00:00Z')
  const r30 = dateRangeFor('30d', now)
  check('30d range labels correctly', r30.label === 'Last 30 days')
  check('30d range boundary is ~30 days before now', new Date(r30.fromISO).getUTCDate() === new Date('2026-02-13T00:00:00Z').getUTCDate())
  const ytd = dateRangeFor('ytd', now)
  check('ytd range starts Jan 1 of the injected year', ytd.fromISO.startsWith('2026-01-01'))
}

// ── countCapturedShows: dedup + canonical predicate, not a raw row count ─
{
  const rows = [
    row({ id: 'a', user_id: 'artist1' }),
    row({ id: 'a', user_id: 'artist1' }), // duplicate id — e.g. a join-inflated set
    row({ id: 'b', user_id: 'artist1', status: 'draft' }), // excluded by isCapturedShow
    row({ id: 'c', user_id: 'artist1', venue_name: '.' }), // placeholder venue — excluded
  ]
  check('duplicate ids are deduped, not double-counted', countCapturedShows(rows) === 1, `got ${countCapturedShows(rows)}`)
}

// ── countCapturedShowsByArtist: per-artist, not crowded by a busy artist ─
{
  const busy = Array.from({ length: 50 }, (_, i) => row({ id: `busy-${i}`, user_id: 'busyArtist' }))
  const quiet = [row({ id: 'quiet-1', user_id: 'quietArtist' })]
  const counts = countCapturedShowsByArtist([...busy, ...quiet])
  check('a busy artist\'s 50 shows do not affect a quiet artist\'s own count', counts.get('quietArtist') === 1)
  check('the busy artist\'s own count is still fully correct', counts.get('busyArtist') === 50)
}

// ── latestShowPerArtist: the actual crowding-out bug this build guards
//    against — a single global top-N would let a busy artist's many recent
//    rows push a quiet artist's own (older, but still their latest) row
//    out entirely. This function must return EVERY artist's own latest
//    from the given set, regardless of how many rows another artist has. ─
{
  const busy = Array.from({ length: 30 }, (_, i) =>
    row({ id: `busy-${i}`, user_id: 'busyArtist', started_at: `2026-03-${String(30 - i).padStart(2, '0')}T00:00:00Z` }))
  const quietOld = row({ id: 'quiet-old', user_id: 'quietArtist', started_at: '2025-06-01T00:00:00Z' })
  const latest = latestShowPerArtist([...busy, quietOld])
  check('the quiet artist\'s own (older) latest show is still found, not crowded out', latest.get('quietArtist')?.id === 'quiet-old')
  check('the busy artist\'s TRUE latest (most recent date) wins among their own rows', latest.get('busyArtist')?.id === 'busy-0')
  check('a non-captured row never wins as "latest" even if it has the newest date', (() => {
    const withFakeNewest = [...busy, quietOld, row({ id: 'fake', user_id: 'busyArtist', started_at: '2099-01-01T00:00:00Z', status: 'draft' })]
    return latestShowPerArtist(withFakeNewest).get('busyArtist')?.id === 'busy-0'
  })())
}

// ── recentActivityFeed: bounded, sorted, deduped — never claimed as a total
{
  const rows = Array.from({ length: 20 }, (_, i) =>
    row({ id: `r${i}`, user_id: 'a', started_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }))
  const feed = recentActivityFeed(rows, 5)
  check('feed respects the limit', feed.length === 5)
  check('feed is sorted newest-first', feed[0].id === 'r19' && feed[4].id === 'r15')
}

// ── countNotYetSubmitted: the one filing-adjacent signal this slice
//    surfaces — plain, DB-backed, no claimInputs/localStorage dependency ──
{
  const rows = [
    row({ id: 'a', user_id: 'x', submission_status: 'submitted' }),
    row({ id: 'b', user_id: 'x', submission_status: null }),
    row({ id: 'c', user_id: 'x', submission_status: 'pending' }),
    row({ id: 'd', user_id: 'x', status: 'draft', submission_status: null }), // not a captured show — excluded
  ]
  check('only captured, non-submitted shows count', countNotYetSubmitted(rows) === 2, `got ${countNotYetSubmitted(rows)}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

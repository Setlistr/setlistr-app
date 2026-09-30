// Behavioral tests for lib/managerAnalytics.ts. No Supabase client, no
// network calls — pure aggregation logic only, so this makes zero requests
// and has nothing to stub.
//
// Focus: exactly the failure modes this build was told to avoid — a
// misleading growth percentage from a zero previous period, merging two
// different songs because their titles happen to match, silently dropping
// shows with a missing city/venue instead of bucketing them explicitly,
// and an aggregate count that could ever disagree with its own
// drill-through list.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-manager-analytics.ts

import {
  monthBucketsInRange, groupCapturedShowsByMonth, equalPeriodComparison, comparePeriods,
  aggregateSongRotation, aggregateByCity, aggregateByVenue,
  type AnalyticsPerformanceRow, type SongRow,
} from '../lib/managerAnalytics'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function row(over: Partial<AnalyticsPerformanceRow> & { id: string; user_id: string }): AnalyticsPerformanceRow {
  return {
    status: 'complete', submission_status: null, data_source: null, venue_name: 'The Venue', city: 'Portland',
    started_at: '2026-01-15T20:00:00Z', performance_date: '2026-01-15',
    ...over,
  }
}

// ── monthBucketsInRange / groupCapturedShowsByMonth ───────────────────────
{
  const now = new Date('2026-03-15T00:00:00Z') // mid-March — current month is partial
  const buckets = monthBucketsInRange('2026-01-01T00:00:00Z', now.toISOString(), now)
  check('produces one bucket per month in range (Jan, Feb, Mar)', buckets.length === 3, `got ${buckets.length}`)
  check('only the bucket containing "now" is marked partial', buckets.filter(b => b.isPartial).length === 1 && buckets[2].isPartial === true)
  check('earlier, fully-elapsed months are not marked partial', buckets[0].isPartial === false && buckets[1].isPartial === false)

  const rows = [
    row({ id: 'a', user_id: 'u', started_at: '2026-01-05T00:00:00Z' }),
    row({ id: 'b', user_id: 'u', started_at: '2026-01-20T00:00:00Z' }),
    row({ id: 'c', user_id: 'u', started_at: '2026-03-02T00:00:00Z' }),
    row({ id: 'd', user_id: 'u', started_at: '2025-12-01T00:00:00Z' }), // outside range — must not leak into Jan
  ]
  const counts = groupCapturedShowsByMonth(rows, buckets)
  check('Jan bucket counts only Jan shows', counts.get('2026-01') === 2)
  check('Feb bucket present with 0, not missing, when no shows fall in it', counts.get('2026-02') === 0)
  check('a show outside the range never leaks into an in-range bucket', counts.get('2026-01') === 2 && !Array.from(counts.values()).includes(3))
}

// ── comparePeriods: the zero-previous case must never produce a percent ──
{
  const zero = comparePeriods(12, 0)
  check('previous=0 yields percentChange: null, never a percentage', zero.percentChange === null)
  check('current/previous counts are still exposed as plain numbers', zero.current === 12 && zero.previous === 0)

  const bothZero = comparePeriods(0, 0)
  check('0 vs 0 is also null, not 0% or NaN', bothZero.percentChange === null)

  const real = comparePeriods(150, 100)
  check('a real previous period computes an actual percent', real.percentChange === 50)

  const pair = equalPeriodComparison('2026-02-01T00:00:00Z', new Date('2026-03-03T00:00:00Z'))
  check('equalPeriodComparison produces a previous period of the same length as current', (() => {
    const curMs = new Date(pair.current.toISO).getTime() - new Date(pair.current.fromISO).getTime()
    const prevMs = new Date(pair.previous.toISO).getTime() - new Date(pair.previous.fromISO).getTime()
    return Math.abs(curMs - prevMs) < 1000 // equal to the millisecond, modulo rounding
  })())
}

// ── aggregateSongRotation: title+artist keyed — same title, different
//    artist, must NOT merge ────────────────────────────────────────────
{
  const rows: SongRow[] = [
    { performance_id: 'p1', title: 'Home', artist: 'Artist One' },
    { performance_id: 'p2', title: 'Home', artist: 'Artist One' },
    { performance_id: 'p3', title: 'Home', artist: 'Artist Two' }, // same title, different artist
    { performance_id: 'p4', title: 'Home (Live)', artist: 'Artist One' }, // version-suffix variant — should merge with p1/p2 via normalization
  ]
  const agg = aggregateSongRotation(rows)
  const artistOneHome = agg.find(e => e.title === 'Home' && e.artist === 'Artist One')
  const artistTwoHome = agg.find(e => e.artist === 'Artist Two')
  check('two different songs sharing a title do NOT merge just because titles match', !!artistOneHome && !!artistTwoHome && artistOneHome.key !== artistTwoHome.key)
  check('a version-suffix variant of the SAME song by the SAME artist does merge (via normalizeSongKey)', artistOneHome?.distinctShowCount === 3, `got ${artistOneHome?.distinctShowCount}`)
  check('the drill-through performance ids match the reported count exactly', artistOneHome?.performanceIds.length === artistOneHome?.distinctShowCount)

  const dup = aggregateSongRotation([
    { performance_id: 'p1', title: 'Encore', artist: 'X' },
    { performance_id: 'p1', title: 'Encore', artist: 'X' }, // same song listed twice in the same show — must count as 1 show, not 2
  ])
  check('the same song appearing twice in one show counts as ONE distinct show', dup[0].distinctShowCount === 1)
}

// ── aggregateByCity / aggregateByVenue: explicit "unknown" bucket, never
//    silently dropped, and count === drill-through list length always ────
{
  const rows: AnalyticsPerformanceRow[] = [
    row({ id: 'a', user_id: 'u', city: 'Portland' }),
    row({ id: 'b', user_id: 'u', city: 'Portland' }),
    row({ id: 'c', user_id: 'u', city: '' }),
    row({ id: 'd', user_id: 'u', city: null }),
    row({ id: 'e', user_id: 'u', city: '  ' }), // whitespace-only — also unknown
  ]
  const byCity = aggregateByCity(rows)
  const portland = byCity.find(e => e.label === 'Portland')
  const unknown = byCity.find(e => e.isUnknown)
  check('known-city shows group correctly', portland?.showCount === 2)
  check('missing/blank/whitespace-only city is an explicit "Unknown city" bucket, not dropped', unknown?.label === 'Unknown city' && unknown?.showCount === 3, `got ${unknown?.showCount}`)
  check('total shows across all city buckets equals the input count (nothing silently lost)', byCity.reduce((s, e) => s + e.showCount, 0) === rows.length)
  check('every bucket\'s count matches its own drill-through row list length', byCity.every(e => e.showCount === e.rows.length))

  // Unlike city, a blank venue_name can never actually reach an "Unknown
  // venue" bucket here — isCapturedShow() (reused via dedupeCaptured)
  // already requires isRealVenue(venue_name), so a blank-venue row is
  // excluded from being a "captured show" at all, upstream of this
  // function, everywhere in the app (Overview, Roster, this page). The
  // Unknown-venue bucket logic still exists in aggregateByVenue (correct,
  // defensive, matches aggregateByCity's shape) but is unreachable through
  // this shared predicate by construction — proven here by confirming the
  // blank-venue row is excluded entirely, not silently mis-bucketed.
  const venueRows: AnalyticsPerformanceRow[] = [
    row({ id: 'a', user_id: 'u', venue_name: 'The Venue' }),
    row({ id: 'b', user_id: 'u', venue_name: '' }),
  ]
  const byVenue = aggregateByVenue(venueRows)
  check('a blank venue_name is excluded entirely (fails isCapturedShow upstream), not mis-bucketed', byVenue.reduce((s, e) => s + e.showCount, 0) === 1)
  check('no phantom "Unknown venue" bucket appears when nothing reaches it', !byVenue.some(e => e.isUnknown))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

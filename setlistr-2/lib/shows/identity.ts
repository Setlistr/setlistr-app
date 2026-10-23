// Show identity for the Schedule timeline (docs/schedule-timeline-plan.md).
// Pure; no I/O.
//
// - Only a stored performances.show_id link groups records (lib/shows/timeline.ts
//   builds those groups). Everything here produces candidate PAIRS for a
//   person to check: never a merge, never a hidden record.
// - Pairs are judged one at a time. If A–B and B–C are candidates, A and C
//   are not grouped.
// - A venue matches only on the same venue id, or the same normalised name
//   in a compatible place. Same-named venues in different cities or
//   countries, and different festival stages, never match. A missing city
//   leaves the pair possible, never certain.
// - The two-hour window only narrows the search. Records farther apart
//   aren't flagged, and that is not a finding that they are separate.
// - Stored dates are compared as stored. The previous or next date is
//   considered only when both records have a real start time AND a reliable
//   time zone, so a midnight crossing can actually be established. Missing
//   time-zone data never widens matching to another date.

import { cityKey, normaliseText, placeContext } from '../proof/place'

export type IdentityRecord = {
  key: string                     // timeline entry key
  venueId: string | null
  venueName: string | null
  city: string | null
  country: string | null
  localDate: string | null        // YYYY-MM-DD in the record's own zone, or as stored
  instant: number | null          // epoch ms when a real start time is known
  // The stored value has a time but no time zone is recorded: its date is
  // kept as stored, and it is never compared with another date.
  dateUncertain?: boolean
}

export type VenueRelation = 'same-venue' | 'same-name-place' | 'same-name-no-place' | 'different'
export type TimeRelation = 'times-close' | 'time-unknown' | 'across-midnight'
export type Candidate = { a: string; b: string; venue: Exclude<VenueRelation, 'different'>; time: TimeRelation }

export const CANDIDATE_WINDOW_MS = 2 * 60 * 60 * 1000

export function venueKey(name: string | null | undefined): string {
  return normaliseText(name || '').replace(/^the /, '')
}

function cityOf(city: string | null): string | null {
  const c = (city || '').split(',')[0].trim()
  return c ? cityKey(c) : null
}

// Countries a record's place can be in, from its city and country fields.
function countriesOf(r: IdentityRecord): Set<string> {
  return new Set(placeContext(r.city, r.country).readings.map(x => x.country))
}

export function venueRelation(a: IdentityRecord, b: IdentityRecord): VenueRelation {
  if (a.venueId && b.venueId && a.venueId === b.venueId) return 'same-venue'
  const na = venueKey(a.venueName), nb = venueKey(b.venueName)
  if (!na || !nb || na !== nb) return 'different'
  const ca = cityOf(a.city), cb = cityOf(b.city)
  if (ca && cb && ca !== cb) return 'different'
  const xa = countriesOf(a), xb = countriesOf(b)
  if (xa.size && xb.size && !Array.from(xa).some(c => xb.has(c))) return 'different'
  return ca && cb ? 'same-name-place' : 'same-name-no-place'
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

export function timeRelation(a: IdentityRecord, b: IdentityRecord): TimeRelation | null {
  if (!a.localDate || !b.localDate) return null
  const days = Math.abs(dayDiff(a.localDate, b.localDate))
  const both = a.instant !== null && b.instant !== null
  const close = both && Math.abs(a.instant! - b.instant!) <= CANDIDATE_WINDOW_MS
  if (days === 0) return both ? (close ? 'times-close' : null) : 'time-unknown'
  // A show that crosses midnight: only with two real times close together.
  // A show that crosses midnight: two real times close together, each read
  // in a known time zone.
  if (days === 1 && close && !a.dateUncertain && !b.dateUncertain) return 'across-midnight'
  return null
}

// Every candidate pair, each judged on its own. Records are bucketed by date
// so only the same and adjacent dates are compared.
export function findCandidates(records: IdentityRecord[]): Candidate[] {
  const byDate = new Map<string, IdentityRecord[]>()
  for (const r of records) if (r.localDate) byDate.set(r.localDate, [...(byDate.get(r.localDate) || []), r])
  const next = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10) }
  const out: Candidate[] = []
  byDate.forEach((list, date) => {
    const later = byDate.get(next(date)) || []
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      for (const b of [...list.slice(i + 1), ...later]) {
        if (a.key === b.key) continue
        const venue = venueRelation(a, b)
        if (venue === 'different') continue
        const time = timeRelation(a, b)
        if (!time) continue
        out.push(a.key < b.key ? { a: a.key, b: b.key, venue, time } : { a: b.key, b: a.key, venue, time })
      }
    }
  })
  return out
}

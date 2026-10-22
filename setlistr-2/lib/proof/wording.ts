// Proof of Performance wording, shared by the page and the PDF so they say
// the same thing from the same summary (docs/proof-of-performance-plan.md).
// Pure; no React, no I/O.

import { isRealTimeZone } from '../show-date'
import type { DateFields, Method, ProofShow, ProofCounts } from './summary'

export const METHOD: Record<Method, { label: string; short: string }> = {
  live: { label: 'Recognised live', short: 'Live' },
  recording: { label: 'From a recording', short: 'Recording' },
  hand: { label: 'Entered by hand', short: 'By hand' },
  unknown: { label: 'Method not recorded', short: 'Not recorded' },
  none: { label: 'No songs on file', short: 'No songs' },
}
export const SOURCE_LINE: [Method, string][] = [['live', 'recognised live'], ['recording', 'from recordings'], ['hand', 'entered by hand'], ['unknown', 'method not recorded'], ['none', 'with no songs on file']]

export const pl = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

// ── Dates ───────────────────────────────────────────────────────────────────
// The show's calendar day, as lib/show-date showDay() reads it, but with the
// viewer's zone passed in rather than taken from the machine, so the server
// (PDF) and the browser (page) agree. Order: a date-only value as is; an
// instant in the show's own zone; an instant in the viewer's zone.
export type Day = { y: number; m: number; d: number }

function dayInZone(t: Date, zone: string | null | undefined): Day {
  const tz = zone && isRealTimeZone(zone) ? zone : zone === 'UTC' ? 'UTC' : undefined
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t)
  const get = (k: string) => Number(parts.find(x => x.type === k)?.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

export function proofDay(f: DateFields, viewerZone: string | null): Day | null {
  const raw = f.performance_date || f.started_at || f.created_at
  if (!raw) return null
  const datePart = raw.split('T')[0].split(' ')[0]
  if (datePart === raw || /T00:00:00(\.0+)?(Z|\+00:?00)?$/.test(raw)) {
    const [y, m, d] = datePart.split('-').map(Number)
    return y && m && d ? { y, m, d } : null
  }
  const t = new Date(raw)
  if (isNaN(t.getTime())) return null
  return dayInZone(t, isRealTimeZone(f.timezone) ? f.timezone : viewerZone)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthYear = (d: Day) => `${MONTHS[d.m - 1]} ${d.y}`
export const shortDate = (d: Day | null) => d ? `${MONTHS[d.m - 1].slice(0, 3)} ${String(d.d).padStart(2, '0')}` : '—'
export const dayValue = (d: Day | null) => d ? d.y * 10000 + d.m * 100 + d.d : 0

export function periodText(shows: ProofShow[], zone: string | null): string | null {
  const days = shows.map(s => proofDay(s.date, zone)).filter((d): d is Day => !!d)
  if (!days.length) return null
  const sorted = days.sort((a, b) => dayValue(a) - dayValue(b))
  const a = monthYear(sorted[0]), b = monthYear(sorted[sorted.length - 1])
  return a === b ? a : `${a} – ${b}`
}

export function importedYears(first: DateFields | null, last: DateFields | null, zone: string | null): string {
  const f = first && proofDay(first, zone), l = last && proofDay(last, zone)
  if (!f || !l) return ''
  return f.y === l.y ? ` from ${f.y}` : ` from ${f.y} to ${l.y}`
}

// ── Lines ───────────────────────────────────────────────────────────────────
export function relationText(c: ProofCounts): string {
  const base = c.awaiting > 0
    ? `The live record on the Dashboard counts ${c.liveRecord.toLocaleString('en-US')}: these ${c.confirmed.toLocaleString('en-US')}, plus ${c.awaiting.toLocaleString('en-US')} awaiting confirmation.`
    : 'The live record on the Dashboard counts the same shows.'
  const legacy = c.legacyConfirmation > 0 ? ` ${pl(c.legacyConfirmation, 'show was', 'shows were')} marked complete by an earlier version of Setlistr; their review wasn’t recorded.` : ''
  return base + legacy
}

export type Coverage = { noLocation: number; unresolved: number; lookupFailed: number }

// Never reads as complete when it isn't.
export function coverageText(mapped: number, confirmed: number, cov: Coverage): string {
  if (mapped >= confirmed && cov.noLocation + cov.unresolved + cov.lookupFailed === 0) return `All ${confirmed.toLocaleString('en-US')} shows mapped`
  const parts = [
    cov.noLocation ? `${cov.noLocation.toLocaleString('en-US')} with no location on file` : '',
    cov.unresolved ? `${cov.unresolved.toLocaleString('en-US')} in a city that couldn’t be identified exactly` : '',
    cov.lookupFailed ? `${cov.lookupFailed.toLocaleString('en-US')} not located: the place lookup was unavailable` : '',
  ].filter(Boolean)
  return [`${mapped.toLocaleString('en-US')} of ${confirmed.toLocaleString('en-US')} shows mapped`, ...parts].join(' · ')
}

// Shows that couldn't be placed at all, for the places-in-type fallback.
export function unplacedText(cov: Coverage): string | null {
  return cov.noLocation ? `${pl(cov.noLocation, 'show has', 'shows have')} no location on file.` : null
}

export function factsText(sh: ProofShow): string {
  return [sh.recognised > 0 ? `${sh.recognised} of ${sh.songs} recognised` : '', sh.nearVenue ? 'phone near venue' : ''].filter(Boolean).join(' · ')
}

export function evidenceRows(sh: ProofShow): [string, string, string][] {
  const added = sh.songs - sh.recognised
  const rows: [string, string, string][] = []
  if (sh.method === 'hand') rows.push(['Setlist', 'Entered by hand', `All ${pl(sh.songs, 'song', 'songs')} added by hand.`])
  else if (sh.method === 'none') rows.push(['Setlist', 'No songs on file', 'No songs are recorded as played at this confirmed show.'])
  else if (sh.recognised === 0) rows.push(['Setlist', 'Method not recorded', `${pl(sh.songs, 'song', 'songs')}, with no record of how they were entered.`])
  else {
    const counted = `${sh.recognised} of ${pl(sh.songs, 'song', 'songs')} recognised${added > 0 ? `; ${added} not recognised` : ''}.`
    rows.push(['Setlist', sh.method === 'live' ? 'Recognised live in Setlistr' : sh.method === 'recording' ? 'Recognised from a recording' : 'Method not recorded',
      sh.method === 'unknown' ? `${counted} How the show was captured wasn’t recorded.` : `${counted} Recognition identifies the recording of a song, not who performed it.`])
  }
  if (sh.nearVenue) rows.push(['Location', 'Phone near the venue when capture began', 'Within 500 m of the venue.'])
  rows.push(sh.confirmation === 'review'
    ? ['Confirmation', 'Confirmed in review', 'By the artist or their team.']
    : ['Confirmation', 'Marked complete', 'By an earlier version of Setlistr; a review wasn’t recorded.'])
  return rows
}

// "How this record is made", for the page disclosure and the PDF's last page.
export const HOW_MADE: [string, string][] = [
  ['Confirmed shows', 'Shows captured or uploaded in Setlistr whose setlist the artist or their team confirmed in review. It’s their confirmation, not an independent check.'],
  ['Song performances', 'Songs kept in confirmed setlists, counted once per show. Songs removed in review, and planned songs not marked played, aren’t counted.'],
  ['How each setlist was recorded', 'Recognised live, or from a recording, when Setlistr holds evidence of how the show was captured. Entered by hand only when every song is recorded as added by the artist or their team. Method not recorded when Setlistr holds no evidence either way: songs recognised without a record of how the show was captured, or songs with no record of how they were entered. Recognition identifies the recording of a song, not who performed it.'],
  ['Location', '“Phone near the venue when capture began” appears only when the phone’s reading was within 500 m of the venue. Location is optional; a missing reading changes nothing.'],
  ['Not counted', 'Shows awaiting confirmation and imported history are listed separately.'],
]

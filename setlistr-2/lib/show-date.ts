// The calendar day a show happened, from the most authoritative information
// stored for it. Display code formats the returned Date with
// toLocaleDateString() and no timeZone option: it is the local midnight of
// that calendar day.
//
// Sources, in order:
//   1. A date-only value (or UTC midnight): uploads store the date the artist
//      picked this way, and starting a scheduled show stores its date in the
//      show's own zone this way (0020_shared_show_scheduling.sql). That
//      calendar day is used as is.
//   2. An instant, with the linked show's IANA zone (shows.timezone, set when a
//      show is scheduled): the day in that zone.
//   3. An instant with no real zone: the day in the viewer's zone.
//      shows.timezone defaults to 'UTC' as a placeholder, so 'UTC' is not
//      treated as evidence. UNRESOLVED: an unscheduled capture stores no venue
//      zone, so a show viewed from another zone can read as the neighbouring
//      day near midnight.
import { showDate } from './record-summary'

export type ShowDateFields = { performance_date?: string | null; started_at?: string | null; created_at?: string | null }

export function isRealTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || tz === 'UTC' || tz === 'Etc/UTC') return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

export function showDay(p: ShowDateFields, timezone?: string | null): Date | null {
  const raw = p.performance_date || p.started_at || p.created_at
  if (!raw) return null
  const d = showDate({ performance_date: p.performance_date ?? null, started_at: p.started_at ?? '', created_at: p.created_at ?? '' } as Parameters<typeof showDate>[0])
  if (!d) return null
  // showDate() already returns a date-only value as its local calendar day.
  const datePart = raw.split('T')[0].split(' ')[0]
  if (datePart === raw || /T00:00:00(\.0+)?(Z|\+00:?00)?$/.test(raw)) return d
  if (isRealTimeZone(timezone)) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
    const get = (t: string) => Number(parts.find(x => x.type === t)?.value)
    return new Date(get('year'), get('month') - 1, get('day'))
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

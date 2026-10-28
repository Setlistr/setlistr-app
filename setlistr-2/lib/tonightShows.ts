// "Tonight's show, one tap" (docs/tonight-show-one-tap-plan.md): which
// still-scheduled shows the Dashboard's Tonight row and the gold capture
// button offer to start, and how each is labelled. Pure, for unit tests
// (scripts/test-tonight-shows.ts).
//
// Input: /api/shows/schedule's list for one artist, which returns status
// 'scheduled' only (cancelled, completed, live and imported past listings
// are never included) through row-level security (revoked access returns
// nothing).
//
// Eligibility is a discoverability rule, not evidence that a show is
// happening. Every date comes from the show's own stored evidence in its
// own time zone (scheduled_at + timezone, or local_date). A missing or
// invalid time zone is never inferred from the phone: such a show is left
// out here and stays on Schedule.
import { compareScheduled, utcToZonedParts, zonedToday } from './scheduleTime'

export const LOOK_BACK_MS = 6 * 60 * 60 * 1000    // the Dashboard's existing live window (LIVE_WINDOW_MIN = 360)
export const LOOK_AHEAD_MS = 12 * 60 * 60 * 1000  // a set just after local midnight

export type TonightShowInput = { scheduled_at: string | null; timezone: string | null; local_date?: string | null }
export type TonightItem<T> = {
  show: T
  kind: 'startable' | 'needs_time'
  // "Today", "Tomorrow", or the show's actual local date ("Wed, Oct 28")
  dayText: string
  // "8:00 PM", plus the venue's zone ("8:00 PM EDT") whenever it could be
  // misread: the zone differs from the device's, or the day isn't today.
  timeText: string | null
}

export function isValidZone(zone: string | null | undefined): zone is string {
  if (!zone) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true } catch { return false }
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

// "Wed, Oct 28", with the year only when it isn't the current one.
export function localDateText(dateStr: string, todayStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(String(y) !== todayStr.slice(0, 4) ? { year: 'numeric' } : {}) })
}

export function clockText(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function zoneAbbr(instant: Date, zone: string): string {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(instant).find(p => p.type === 'timeZoneName')?.value || '' } catch { return '' }
}
function offsetLabel(instant: Date, zone: string): string {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(instant).find(p => p.type === 'timeZoneName')?.value || '' } catch { return '' }
}

// deviceZone: the viewer's IANA zone, used only to decide whether to SHOW
// the venue's zone — never to decide a show's date.
export function tonightShows<T extends TonightShowInput>(shows: T[], now: Date, deviceZone: string | null): TonightItem<T>[] {
  const out: TonightItem<T>[] = []
  const valid = shows.filter(s => isValidZone(s.timezone)) as (T & { timezone: string })[]
  for (const s of [...valid].sort((a, b) => compareScheduled(a, b))) {
    const today = zonedToday(now, s.timezone)
    const tomorrow = addDays(today, 1)
    if (s.scheduled_at) {
      const t = Date.parse(s.scheduled_at)
      if (Number.isNaN(t)) continue
      const { dateStr, timeStr } = utcToZonedParts(new Date(t), s.timezone)
      const since = now.getTime() - t
      const eligible = dateStr === today || (since >= 0 && since <= LOOK_BACK_MS) || (since < 0 && -since <= LOOK_AHEAD_MS)
      if (!eligible) continue
      const dayText = dateStr === today ? 'Today' : dateStr === tomorrow ? 'Tomorrow' : localDateText(dateStr, today)
      const instant = new Date(t)
      const zoneDiffers = !deviceZone || !isValidZone(deviceZone) || offsetLabel(instant, s.timezone) !== offsetLabel(instant, deviceZone)
      const abbr = zoneAbbr(instant, s.timezone)
      const timeText = `${clockText(timeStr)}${abbr && (zoneDiffers || dayText !== 'Today') ? ` ${abbr}` : ''}`
      out.push({ show: s, kind: 'startable', dayText, timeText })
    } else if (s.local_date && s.local_date === today) {
      out.push({ show: s, kind: 'needs_time', dayText: 'Today', timeText: null })
    }
  }
  return out
}

// The local date/time text the existing start confirmation uses:
// "Wed, Oct 28 (today), 8:00 PM CDT".
export function confirmWhenText(scheduledAtIso: string, zone: string, now: Date = new Date()): string {
  const { dateStr, timeStr } = utcToZonedParts(new Date(scheduledAtIso), zone)
  const today = zonedToday(now, zone)
  const rel = dateStr === today ? 'today' : dateStr === addDays(today, 1) ? 'tomorrow' : dateStr === addDays(today, -1) ? 'yesterday' : ''
  return `${localDateText(dateStr, today)}${rel ? ` (${rel})` : ''}, ${clockText(timeStr)} ${zoneAbbr(new Date(scheduledAtIso), zone)}`.trim()
}

// Spreadsheet import, server side (docs/spreadsheet-import-plan.md): the
// artist's existing records as the review's duplicate check and zone
// lookup see them. Reads with the service role; callers authorise first.
import type { SupabaseClient } from '@supabase/supabase-js'
import tzLookup from 'tz-lookup'
import { buildEntries, identityRecords, entryState, timeText, asWrittenTime, type PerfRow, type ShowRow } from '../timeline'
import { showLocalDate, isShowUpcoming } from '../../scheduleTime'
import { venueKey, type IdentityRecord } from '../identity'
import type { Context } from './review'

const PAGE = 1000
async function readAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) return out
  }
}

const SHOW_COLS = 'id, status, scheduled_at, timezone, venue_id, name, show_type, created_by, scheduled_by, scheduled_by_name, started_at, updated_at, local_date, local_time, import_batch_id, source_row, venues(name, city, country, latitude, longitude), show_import_batches(file_name, created_at)'
const PERF_COLS = 'id, show_id, status, submission_status, data_source, venue_id, venue_name, city, country, performance_date, started_at, created_at, venue_latitude, venue_longitude'

export type ImportContext = Context & { venueIds: Record<string, string> }

export async function loadImportContext(service: SupabaseClient, artistId: string, now = new Date()): Promise<ImportContext> {
  const shows = await readAll<ShowRow>((f, t) => service.from('shows').select(SHOW_COLS).eq('created_by', artistId).order('id').range(f, t) as any)
  const perfs = await readAll<PerfRow>((f, t) => service.from('performances').select(PERF_COLS).eq('user_id', artistId).is('deleted_at', null).order('id').range(f, t) as any)
  const entries = buildEntries(shows, perfs, now)
  const records: IdentityRecord[] = identityRecords(entries)
  const summaries: Context['summaries'] = {}
  const imported: Context['imported'] = {}
  for (const e of entries) {
    const src = e.show?.import_batch_id ? `Imported from ${e.show.show_import_batches?.file_name || 'a spreadsheet'}` : e.kind === 'import' ? 'Imported from setlist.fm' : e.kind === 'capture' || e.kind === 'show' ? 'Captured' : 'Scheduled in Setlistr'
    summaries[e.key] = { date: e.localDate || '', venue: e.venue, city: e.city, line: [src, entryState(e)?.label, timeText(e.instant, e.zone) ?? asWrittenTime(e)].filter(Boolean).join(' · ') }
    if (e.show?.import_batch_id) imported[e.key] = { file: e.show.show_import_batches?.file_name || 'a spreadsheet', at: e.show.show_import_batches?.created_at || '', time: e.show.local_time ? e.show.local_time.slice(0, 5) : null }
  }
  // Upcoming scheduled shows aren't in history entries; the matcher needs them too.
  const inEntries = new Set(entries.map(e => e.key))
  for (const s of shows) {
    const key = `s:${s.id}`
    if (inEntries.has(key) || s.status !== 'scheduled') continue
    const sch = { scheduled_at: s.scheduled_at, timezone: s.timezone || 'UTC', local_date: s.local_date }
    if (!isShowUpcoming(sch, now)) continue
    const date = showLocalDate(sch)
    records.push({ key, venueId: s.venue_id, venueName: s.venues?.name || null, city: s.venues?.city || null, country: s.venues?.country || null, localDate: date, instant: s.scheduled_at ? Date.parse(s.scheduled_at) : null })
    summaries[key] = { date: date || '', venue: s.venues?.name || 'Venue not recorded', city: s.venues?.city || null, line: [s.import_batch_id ? `Imported from ${s.show_import_batches?.file_name || 'a spreadsheet'}` : 'Scheduled in Setlistr', s.scheduled_at ? timeText(Date.parse(s.scheduled_at), s.timezone) : s.local_time ? 'time as written' : 'date only'].filter(Boolean).join(' · ') }
    if (s.import_batch_id) imported[key] = { file: s.show_import_batches?.file_name || 'a spreadsheet', at: s.show_import_batches?.created_at || '', time: s.local_time ? s.local_time.slice(0, 5) : null }
  }
  // Venues already in this artist's records: their zone (from stored
  // coordinates) and id, by normalised name and city.
  const knownVenues: Record<string, string> = {}, venueIds: Record<string, string> = {}
  const add = (id: string | null, name: string | null | undefined, city: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined) => {
    if (!name || !city) return
    const k = `${venueKey(name)}|${venueKey(city)}`
    if (id && !venueIds[k]) venueIds[k] = id
    if (typeof lat === 'number' && typeof lng === 'number' && !(lat === 0 && lng === 0) && !knownVenues[k]) { try { knownVenues[k] = tzLookup(lat, lng) } catch { /* out of range */ } }
  }
  for (const s of shows) add(s.venue_id, s.venues?.name, s.venues?.city, s.venues?.latitude, s.venues?.longitude)
  for (const p of perfs) add(p.venue_id, p.venue_name, p.city, p.venue_latitude, p.venue_longitude)
  return { records, summaries, knownVenues, imported, venueIds }
}

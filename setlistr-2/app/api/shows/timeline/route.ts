import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { authoriseProof, ProofError } from '@/lib/proof/load'
import { isMissingImportSchema } from '@/lib/shows/importSchema'
import { setlistMethod, isRecognisedSource, isManualSource, UNPLAYED_SOURCE, type Method } from '@/lib/proof/summary'
import {
  buildEntries, candidatesFor, pageOf, captureInstant, decodeCursor, entryState, sourceLine, addedBy, timeText, captureState, captureLink, methodText, asWrittenTime,
  LIVE_WINDOW_MIN, VENUE_REASON, TIME_REASON, type Entry, type PerfRow, type ShowRow,
} from '@/lib/shows/timeline'

export const dynamic = 'force-dynamic'

// GET /api/shows/timeline?artist_id=&section=active|history&cursor=&limit=
// Read-only (docs/schedule-timeline-plan.md). The caller must be the artist
// or an accepted, non-revoked delegate of any role, checked on every request
// as Proof does. Reads with the service role; returns summaries only.
//   section=active  — a capture in progress (the Dashboard's rejoin rule). Cheap.
//   section=history — past shows, newest first, 25 per page, with possible
//                     duplicates. Loaded separately so it never delays
//                     upcoming shows or their actions.
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
async function readForIds<T>(ids: string[], q: (g: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await q(ids.slice(i, i + 150))
    if (error) throw new Error(error.message)
    out.push(...(data || []))
  }
  return out
}

type PerfFull = PerfRow & { latitude: number | null; recording_path: string | null }
const PERF_COLS = 'id, show_id, status, submission_status, data_source, venue_id, venue_name, city, country, performance_date, started_at, created_at, venue_latitude, venue_longitude, latitude, recording_path'
const SHOW_BASE = 'id, status, scheduled_at, timezone, venue_id, name, show_type, created_by, scheduled_by, scheduled_by_name, started_at, updated_at, venues(name, city, country, latitude, longitude)'
const SHOW_COLS = `${SHOW_BASE}, local_date, local_time, import_batch_id, source_row, show_import_batches(file_name, created_at)`

// How each capture's setlist was recorded, by Proof's evidence rules
// (lib/proof/summary setlistMethod): never assumed.
async function methodsFor(service: SupabaseClient, perfs: PerfFull[]): Promise<Record<string, Method>> {
  const ids = perfs.filter(p => p.data_source !== 'setlistfm_imported').map(p => p.id)
  if (!ids.length) return {}
  const songs = await readForIds<{ performance_id: string; source: string | null }>(ids, g => service.from('performance_songs_visible').select('performance_id, source').in('performance_id', g))
  let flows: { performance_id: string; flow_source: string | null }[] = [], dets: { performance_id: string; chunk_index: number | null }[] = []
  try { flows = await readForIds(ids, g => service.from('product_events').select('performance_id, flow_source').eq('event_name', 'show_created').in('performance_id', g)) } catch { /* evidence unavailable: not recorded */ }
  try { dets = await readForIds(ids, g => service.from('detection_events').select('performance_id, chunk_index').eq('auto_confirmed', true).in('performance_id', g)) } catch { /* as above */ }
  const n: Record<string, number> = {}, r: Record<string, number> = {}, m: Record<string, number> = {}
  for (const s of songs) {
    if (s.source === UNPLAYED_SOURCE) continue
    n[s.performance_id] = (n[s.performance_id] || 0) + 1
    if (isRecognisedSource(s.source)) r[s.performance_id] = (r[s.performance_id] || 0) + 1
    else if (isManualSource(s.source)) m[s.performance_id] = (m[s.performance_id] || 0) + 1
  }
  const flow: Record<string, string | null> = {}
  for (const f of flows) if (!(f.performance_id in flow)) flow[f.performance_id] = f.flow_source
  const chunked = new Set(dets.filter(d => d.chunk_index !== null && d.chunk_index !== undefined).map(d => d.performance_id))
  const out: Record<string, Method> = {}
  for (const p of perfs) {
    if (p.data_source === 'setlistfm_imported') continue
    out[p.id] = setlistMethod({
      songs: n[p.id] || 0, recognised: r[p.id] || 0, manual: m[p.id] || 0,
      uploadEvidence: flow[p.id] === 'upload' || chunked.has(p.id) || !!p.recording_path,
      liveEvidence: flow[p.id] === 'live' || (p.latitude !== null && p.latitude !== undefined),
    })
  }
  return out
}

// Said when a record's time can't be read in any zone it belongs to.
function zoneNote(e: Entry): string | null {
  return !e.zone && (e.instant !== null || e.dateUncertain || !!asWrittenTime(e)) ? 'Time zone not recorded' : null
}

export async function GET(req: NextRequest) {
  const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }
  const sp = req.nextUrl.searchParams
  const artistId = sp.get('artist_id')
  if (!artistId || !/^[0-9a-f-]{36}$/i.test(artistId)) return NextResponse.json({ error: 'artist_id required' }, { status: 400, headers: noStore })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  const service = createClient(url, key)

  try {
    await authoriseProof(service, user.id, artistId)

    if (sp.get('section') === 'active') {
      const { data, error } = await service.from('performances').select('id, venue_name, started_at, created_at, status, data_source, user_id, started_by, captured_by, captured_by_name')
        .eq('user_id', artistId).is('deleted_at', null).in('status', ['live', 'pending']).order('started_at', { ascending: false }).limit(5)
      if (error) throw new Error(error.message)
      const since = (d: string) => (Date.now() - new Date(d).getTime()) / 60000
      const a = (data || []).find(p => p.data_source !== 'setlistfm_imported' && since(p.started_at || p.created_at) < LIVE_WINDOW_MIN)
      // Who is capturing, from the attribution every live-capture path
      // records: started_by (set by every Schedule start), else captured_by
      // (a teammate's New show), else the artist (an owner's own capture is
      // recorded with both empty). "own" lets the caller rejoin their own
      // capture; anyone else's is shown as status only, so a second device
      // is never invited to start listening on it. Nothing here says which
      // device is listening.
      let own = false, by: 'you' | 'artist' | 'teammate' = 'teammate', byName: string | null = null
      if (a) {
        const capturer = a.started_by || a.captured_by || a.user_id
        own = capturer === user.id
        by = own ? 'you' : capturer === a.user_id ? 'artist' : 'teammate'
        byName = by === 'teammate' && a.captured_by && a.captured_by === capturer ? a.captured_by_name : null
      }
      return NextResponse.json({ active: a ? { id: a.id, venue: a.venue_name, started_at: a.started_at || a.created_at, own, by, byName } : null }, { headers: noStore })
    }

    const limit = Math.max(1, Math.min(50, Number(sp.get('limit')) || 25))
    const cursorParam = sp.get('cursor')
    const cursor = decodeCursor(cursorParam)
    if (cursorParam && !cursor) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400, headers: noStore })

    // Without the import columns (0028 not applied), read the columns every schema has.
    let shows: ShowRow[]
    try { shows = await readAll<ShowRow>((f, t) => service.from('shows').select(SHOW_COLS).eq('created_by', artistId).order('id').range(f, t) as any) }
    catch (e) {
      const probe = await service.from('shows').select(SHOW_COLS).limit(1)
      if (!isMissingImportSchema(probe.error)) throw e
      shows = await readAll<ShowRow>((f, t) => service.from('shows').select(SHOW_BASE).eq('created_by', artistId).order('id').range(f, t) as any)
    }
    const perfs = await readAll<PerfFull>((f, t) => service.from('performances').select(PERF_COLS).eq('user_id', artistId).is('deleted_at', null).order('id').range(f, t) as any)
    const entries = buildEntries(shows, perfs)
    const { page, next } = pageOf(entries, cursor, limit)

    // Possible duplicates, judged across the whole history, so a pair that
    // straddles a page edge is found on both pages.
    const byKey = new Map(entries.map(e => [e.key, e]))
    const pairs = candidatesFor(entries)
    const onPage = new Set(page.map(e => e.key))
    const partnerKeys = new Set<string>()
    for (const c of pairs) { if (onPage.has(c.a)) partnerKeys.add(c.b); if (onPage.has(c.b)) partnerKeys.add(c.a) }
    const needMethods = [...page, ...Array.from(partnerKeys).map(k => byKey.get(k)!).filter(Boolean)].flatMap(e => e.perfs) as PerfFull[]
    const methods = await methodsFor(service, needMethods)

    const summary = (e: Entry) => ({ key: e.key, localDate: e.localDate, venue: e.venue, city: e.city, state: entryState(e), source: sourceLine(e, methods), time: timeText(e.instant, e.zone) ?? asWrittenTime(e) })
    const items = page.map(e => ({
      ...summary(e),
      kind: e.kind,
      country: e.country,
      zoneNote: zoneNote(e),
      addedBy: addedBy(e),
      importedFrom: e.show?.import_batch_id ? { batchId: e.show.import_batch_id, file: e.show.show_import_batches?.file_name || 'a spreadsheet', row: e.show.source_row } : null,
      show: e.show && (e.kind === 'no-capture') && e.show.status === 'scheduled' ? {
        id: e.show.id, name: e.show.name, show_type: e.show.show_type, scheduled_at: e.show.scheduled_at, timezone: e.show.timezone, status: e.show.status,
        created_by: e.show.created_by, updated_at: e.show.updated_at, venue_id: e.show.venue_id, scheduled_by: e.show.scheduled_by, scheduled_by_name: e.show.scheduled_by_name,
        venues: e.show.venues ? { name: e.show.venues.name, city: e.show.venues.city, country: e.show.venues.country } : null,
      } : null,
      captures: e.perfs.map(p => ({ id: p.id, state: captureState(p), method: p.data_source === 'setlistfm_imported' || p.status === 'live' || p.status === 'pending' ? null : methodText(methods[p.id]), time: timeText(captureInstant(p), e.zone), link: captureLink(p) })),
      partners: pairs.filter(c => c.a === e.key || c.b === e.key).map(c => {
        const other = byKey.get(c.a === e.key ? c.b : c.a)!
        return { ...summary(other), reason: `${VENUE_REASON[c.venue]}; ${TIME_REASON[c.time]}` }
      }),
    }))
    return NextResponse.json({ items, next, total: entries.length }, { headers: noStore })
  } catch (e) {
    if (e instanceof ProofError) return NextResponse.json({ error: e.status === 403 ? 'Access denied' : e.message }, { status: e.status, headers: noStore })
    console.error('[shows/timeline] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Past shows could not be loaded' }, { status: 500, headers: noStore })
  }
}

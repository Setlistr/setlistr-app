// Proof of Performance: the server loader (docs/proof-of-performance-plan.md).
// Authorises the caller for the artist's workspace, reads with the service
// role, and builds the one summary the page (and, once approved, the PDF)
// renders. Only summaries leave this module: no recognition logs, scores,
// coordinates, legal name or IPI.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isWriteCapableRole } from '../writeCapableRoles'
import {
  buildProofCore, cityName, imageExportable,
  type PerfRow, type SongRow, type FlowRow, type DetectionRow, type ProofCore,
} from './summary'
import { frameView, acceptGeocode, VIEWS, MIN_MAPPED_PLACES, type MapView, type ViewName, type GeoFeature } from './map'

export type ProofAccess = { role: 'owner' | string; canExport: boolean }

export type ProofSummary = Omit<ProofCore, 'places' | 'showsWithoutPlace'> & {
  artist: { id: string; name: string; imageUrl: string | null; imageExportable: boolean }
  access: ProofAccess
  map: {
    // 'map': draw views; 'type': too few mapped places, set them in type;
    // 'none': no confirmed shows.
    mode: 'map' | 'type' | 'none'
    mappedShows: number
    unmappedShows: number
    // Places a lookup couldn't confirm (or that hit the lookup bound).
    notLocated: number
    views: Partial<Record<ViewName, MapView>>
    // For the typeset fallback: every place of a small record, by shows.
    placeNames: { name: string; shows: number }[]
  }
}

export class ProofError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// Same check as /api/performance-songs: the owner, or an accepted,
// non-revoked delegate (any role) may read; export needs a write-capable role.
export async function authoriseProof(service: SupabaseClient, callerId: string, artistId: string): Promise<ProofAccess> {
  if (callerId === artistId) return { role: 'owner', canExport: true }
  const { data, error } = await service
    .from('artist_delegates')
    .select('role')
    .eq('artist_id', artistId)
    .eq('delegate_id', callerId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw new ProofError(500, 'Authorization check failed')
  if (!data) throw new ProofError(403, 'Access denied')
  return { role: data.role || 'unknown', canExport: isWriteCapableRole(data.role) }
}

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
// Reads for a list of ids, in groups small enough for a URL, every page.
async function readForIds<T>(ids: string[], q: (group: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const group = ids.slice(i, i + 150)
    out.push(...await readAll<T>((from, to) => q(group, from, to)))
  }
  return out
}

// ── Place lookups: bounded, concurrent, cached briefly ─────────────────────
export const GEOCODE_LIMIT = 150
const GEOCODE_CONCURRENCY = 4
const memo = new Map<string, { at: number; value: { lat: number; lng: number } | null }>()
const MEMO_MS = 60 * 60 * 1000

async function geocodeCity(city: string, iso: string, token: string, referer: string | null): Promise<{ lat: number; lng: number } | null> {
  const key = `${city.toLowerCase()}|${iso}`
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city)}.json?types=place&country=${iso.toLowerCase()}&limit=2&access_token=${encodeURIComponent(token)}`
  try {
    const res = await fetch(url, { headers: referer ? { Referer: referer } : {}, next: { revalidate: 3600 } } as RequestInit)
    if (!res.ok) return null
    const json = await res.json() as { features?: GeoFeature[] }
    const value = acceptGeocode(city, iso, json.features || [])
    memo.set(key, { at: Date.now(), value })
    return value
  } catch { return null }
}

async function locatePlaces(places: ProofCore['places'], token: string | null, referer: string | null): Promise<{ located: Map<string, { lat: number; lng: number }>; notLocated: number }> {
  const located = new Map<string, { lat: number; lng: number }>()
  const pending: { key: string; city: string; iso: string }[] = []
  let notLocated = 0
  for (const p of places) {
    if (p.coords) { located.set(p.key, p.coords); continue }
    const city = cityName(p.name)
    if (!city || !p.countryCode || !token) { notLocated++; continue }
    pending.push({ key: p.key, city, iso: p.countryCode })
  }
  const work = pending.slice(0, GEOCODE_LIMIT)
  notLocated += pending.length - work.length
  let next = 0
  await Promise.all(Array.from({ length: Math.min(GEOCODE_CONCURRENCY, work.length) }, async () => {
    while (next < work.length) {
      const item = work[next++]
      const c = await geocodeCity(item.city, item.iso, token!, referer)
      if (c) located.set(item.key, c); else notLocated++
    }
  }))
  return { located, notLocated }
}

// ── The summary ─────────────────────────────────────────────────────────────
export async function loadProofSummary(opts: {
  service: SupabaseClient; callerId: string; artistId: string
  mapboxToken: string | null; referer: string | null; supabaseUrl: string | null
}): Promise<ProofSummary> {
  const { service, callerId, artistId } = opts
  const access = await authoriseProof(service, callerId, artistId)

  const { data: profile, error: profileErr } = await service
    .from('profiles').select('artist_name, full_name, avatar_url').eq('id', artistId).maybeSingle()
  if (profileErr) throw new Error(profileErr.message)

  const raw = await readAll<any>((from, to) => service
    .from('performances')
    .select('id, status, data_source, venue_name, city, country, performance_date, started_at, created_at, latitude, location_verified, recording_path, venue_latitude, venue_longitude, venues(latitude, longitude), shows(timezone)')
    .eq('user_id', artistId).is('deleted_at', null)
    .order('created_at', { ascending: true }).range(from, to))

  const perfs: PerfRow[] = raw.map(p => {
    const vLat = p.venue_latitude ?? p.venues?.latitude ?? null
    const vLng = p.venue_longitude ?? p.venues?.longitude ?? null
    return {
      id: p.id, status: p.status, data_source: p.data_source, venue_name: p.venue_name, city: p.city, country: p.country,
      performance_date: p.performance_date ?? null, started_at: p.started_at ?? null, created_at: p.created_at ?? null,
      timezone: p.shows?.timezone ?? null,
      has_capture_location: p.latitude !== null && p.latitude !== undefined,
      location_verified: p.location_verified ?? null,
      has_recording_path: !!p.recording_path,
      venue_lat: vLat === null ? null : Number(vLat), venue_lng: vLng === null ? null : Number(vLng),
    }
  })

  // Songs, flows and recognition evidence for the shows on the live record.
  const ids = perfs.filter(p => p.data_source !== 'setlistfm_imported').map(p => p.id)
  const songs = await readForIds<SongRow>(ids, (g, from, to) => service
    .from('performance_songs_visible').select('performance_id, source').in('performance_id', g).order('id').range(from, to))

  // Evidence reads degrade to "not recorded" rather than failing the record.
  let flows: FlowRow[] = [], detections: DetectionRow[] = []
  try {
    flows = await readForIds<FlowRow>(ids, (g, from, to) => service
      .from('product_events').select('performance_id, flow_source').eq('event_name', 'show_created').in('performance_id', g).order('id').range(from, to))
  } catch (e) { console.error('[proof] flow evidence unavailable:', (e as Error).message) }
  try {
    detections = await readForIds<DetectionRow>(ids, (g, from, to) => service
      .from('detection_events').select('performance_id, chunk_index').eq('auto_confirmed', true).in('performance_id', g).order('id').range(from, to))
  } catch (e) { console.error('[proof] recognition evidence unavailable:', (e as Error).message) }

  const core = buildProofCore(perfs, songs, flows, detections)

  // Map: confirmed places only.
  let mode: ProofSummary['map']['mode'] = core.counts.confirmed === 0 ? 'none' : 'type'
  const views: ProofSummary['map']['views'] = {}
  let mappedShows = 0, notLocated = 0
  if (core.counts.confirmed > 0) {
    const { located, notLocated: nl } = await locatePlaces(core.places, opts.mapboxToken, opts.referer)
    notLocated = nl
    const mapped = core.places.filter(p => located.has(p.key)).map(p => ({ name: p.name, shows: p.shows, ...located.get(p.key)! }))
    mappedShows = mapped.reduce((s, p) => s + p.shows, 0)
    if (mapped.length >= MIN_MAPPED_PLACES && opts.mapboxToken) {
      mode = 'map'
      for (const name of Object.keys(VIEWS) as ViewName[]) {
        const v = frameView(mapped, VIEWS[name])
        if (v) views[name] = v
      }
    }
  }

  const { places: _p, showsWithoutPlace: _s, ...rest } = core
  const imageUrl = profile?.avatar_url || null
  return {
    ...rest,
    artist: {
      id: artistId,
      name: profile?.artist_name || profile?.full_name || 'Artist',
      imageUrl,
      imageExportable: imageExportable(imageUrl, opts.supabaseUrl, artistId),
    },
    access,
    map: {
      mode, mappedShows, unmappedShows: core.counts.confirmed - mappedShows, notLocated, views,
      placeNames: core.places.map(p => ({ name: p.name, shows: p.shows })),
    },
  }
}

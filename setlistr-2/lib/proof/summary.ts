// Proof of Performance: the record's rules, as pure functions.
// docs/proof-of-performance-plan.md §2. No I/O here: lib/proof/load.ts reads
// the rows and this turns them into the one summary the page and the
// export both use, so their figures can't drift.
//
// Counting rules are the existing ones (lib/performance-status.ts):
//   live record = isCapturedShow (the Dashboard's figure)
//   confirmed   = live record ∧ isCompleteStage
//   awaiting    = live record − confirmed
//   imported    = setlist.fm imports, listed separately, never counted

import { isCapturedShow, isCompleteStage, isRealVenue } from '../performance-status'
import { showDay } from '../show-date'

export type DateFields = { performance_date: string | null; started_at: string | null; created_at: string | null; timezone: string | null }

export type PerfRow = DateFields & {
  id: string
  status: string | null
  data_source: string | null
  venue_name: string | null
  city: string | null
  country: string | null
  // Evidence only; never returned to the client.
  has_capture_location: boolean
  location_verified: boolean | null
  has_recording_path: boolean
  venue_lat: number | null
  venue_lng: number | null
}
export type SongRow = { performance_id: string; source: string | null }
// The canonical show_created event (lib/telemetry.ts): how the show began.
export type FlowRow = { performance_id: string; flow_source: string | null }
// Recognition events that added a song (auto_confirmed). chunk_index is set
// only by uploads since it existed; null is ambiguous.
export type DetectionRow = { performance_id: string; chunk_index: number | null }

export type Method = 'live' | 'recording' | 'hand' | 'unknown' | 'none'
export type Confirmation = 'review' | 'legacy'

export type ProofShow = {
  id: string
  date: DateFields
  venue: string
  city: string | null
  songs: number
  recognised: number
  method: Method
  nearVenue: boolean
  confirmation: Confirmation
}

// Song sources that mean the song was matched by audio recognition, including
// the names earlier versions wrote: live capture saved 'detected' (March
// 2026) and early recognition 'music' (app/api/identify history).
export const RECOGNISED_SOURCES = new Set(['fingerprint', 'humming', 'recognized', 'combined', 'detected', 'music'])
// The one source that positively records entry by the artist or their team.
// It includes planned songs the artist marked played (review stores them as
// 'manual' with was_planned). Anything else — null, 'unidentified',
// 'transcript', 'cloned' (never written by any version; meaning unknown),
// unknown values — is no evidence either way.
export const MANUAL_SOURCES = new Set(['manual'])
// A planned song never marked played: on the plan only. Live capture saves
// unplayed planned songs this way and review leaves them unless the artist
// marks them played (→ 'manual') or removes them, so they aren't songs
// performed and are left out of every count and of provenance.
export const UNPLAYED_SOURCE = 'planned'

export function isRecognisedSource(source: string | null | undefined): boolean {
  return !!source && RECOGNISED_SOURCES.has(source)
}
export function isManualSource(source: string | null | undefined): boolean {
  return !!source && MANUAL_SOURCES.has(source)
}

// How the setlist got into Setlistr, from positive evidence only. Missing or
// ambiguous evidence is 'unknown' (method not recorded): never 'live', and
// never 'hand' unless every kept song is recorded as entered by hand.
export function setlistMethod(e: { songs: number; recognised: number; manual?: number; uploadEvidence: boolean; liveEvidence: boolean }): Method {
  if (e.songs === 0) return 'none'
  if (e.recognised === 0) return (e.manual ?? 0) === e.songs ? 'hand' : 'unknown'
  if (e.uploadEvidence && !e.liveEvidence) return 'recording'
  if (e.liveEvidence && !e.uploadEvidence) return 'live'
  return 'unknown'
}

// 'complete' is written only by Review save (plan §2). Legacy values that
// isCompleteStage still counts never claim a review.
export function confirmationKind(status: string | null): Confirmation {
  return status === 'complete' ? 'review' : 'legacy'
}

// ── Places ──────────────────────────────────────────────────────────────────

const COUNTRY: Record<string, string> = {
  canada: 'CA', 'united states': 'US', 'united states of america': 'US', usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  ireland: 'IE', australia: 'AU', 'new zealand': 'NZ', germany: 'DE', deutschland: 'DE', france: 'FR', netherlands: 'NL', 'the netherlands': 'NL', holland: 'NL',
  belgium: 'BE', spain: 'ES', españa: 'ES', italy: 'IT', italia: 'IT', portugal: 'PT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', iceland: 'IS',
  switzerland: 'CH', austria: 'AT', poland: 'PL', czechia: 'CZ', 'czech republic': 'CZ', hungary: 'HU', greece: 'GR', mexico: 'MX', méxico: 'MX', brazil: 'BR',
  argentina: 'AR', chile: 'CL', colombia: 'CO', japan: 'JP', 'south korea': 'KR', korea: 'KR', china: 'CN', india: 'IN', 'south africa': 'ZA', singapore: 'SG',
}

export function normaliseText(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// An ISO 3166 alpha-2 code when the free-text country can be read as one;
// null when it can't (then a city lookup would be ambiguous).
export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null
  const t = country.trim()
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase() === 'UK' ? 'GB' : t.toUpperCase()
  const k = t.toLowerCase().replace(/\s+/g, ' ')
  return COUNTRY[k] ?? COUNTRY[normaliseText(t)] ?? null
}

// The city part of a free-text city field ("Toronto, ON" → "Toronto").
export function cityName(city: string | null | undefined): string | null {
  if (!city) return null
  const c = city.split(',')[0].trim()
  return c || null
}

export function placeKey(city: string | null, country: string | null): string | null {
  const c = cityName(city)
  if (!c) return null
  return `${normaliseText(c)}|${countryCode(country) ?? normaliseText(country || '')}`
}

// ── Summary ─────────────────────────────────────────────────────────────────

export type ProofCounts = {
  liveRecord: number
  confirmed: number
  awaiting: number
  imported: number
  cities: number
  countries: number
  songPerformances: number
  legacyConfirmation: number
}

export type ProofCore = {
  counts: ProofCounts
  methods: Record<Method, number>
  shows: ProofShow[]
  awaiting: { id: string; date: DateFields; venue: string; city: string | null }[]
  imported: { count: number; first: DateFields | null; last: DateFields | null }
  // Places of confirmed shows, for the map and the places set in type.
  places: { key: string; name: string; countryCode: string | null; shows: number; coords: { lat: number; lng: number } | null }[]
  // Confirmed shows with no city on file and no stored venue coordinates.
  showsWithoutPlace: number
}

const dateOf = (p: DateFields): DateFields => ({ performance_date: p.performance_date, started_at: p.started_at, created_at: p.created_at, timezone: p.timezone })

export function dayValue(d: DateFields): number {
  const t = showDay(d, d.timezone)
  return t ? t.getTime() : 0
}

export function buildProofCore(perfs: PerfRow[], songs: SongRow[], flows: FlowRow[], detections: DetectionRow[]): ProofCore {
  const live = perfs.filter(p => isCapturedShow(p))
  const confirmed = live.filter(p => isCompleteStage(p))
  const awaiting = live.filter(p => !isCompleteStage(p))
  const imported = perfs.filter(p => p.data_source === 'setlistfm_imported' && isRealVenue(p.venue_name))

  const songCount = new Map<string, number>(), recCount = new Map<string, number>(), manCount = new Map<string, number>()
  for (const s of songs) {
    if (s.source === UNPLAYED_SOURCE) continue
    songCount.set(s.performance_id, (songCount.get(s.performance_id) || 0) + 1)
    if (isRecognisedSource(s.source)) recCount.set(s.performance_id, (recCount.get(s.performance_id) || 0) + 1)
    else if (isManualSource(s.source)) manCount.set(s.performance_id, (manCount.get(s.performance_id) || 0) + 1)
  }
  const flowOf = new Map<string, string | null>()
  for (const f of flows) if (!flowOf.has(f.performance_id)) flowOf.set(f.performance_id, f.flow_source)
  const chunked = new Set<string>()
  for (const d of detections) if (d.chunk_index !== null && d.chunk_index !== undefined) chunked.add(d.performance_id)

  const methods: Record<Method, number> = { live: 0, recording: 0, hand: 0, unknown: 0, none: 0 }
  const shows: ProofShow[] = confirmed.map(p => {
    const n = songCount.get(p.id) || 0, r = recCount.get(p.id) || 0
    const flow = flowOf.get(p.id)
    const method = setlistMethod({
      songs: n, recognised: r, manual: manCount.get(p.id) || 0,
      uploadEvidence: flow === 'upload' || chunked.has(p.id) || p.has_recording_path,
      liveEvidence: flow === 'live' || p.has_capture_location,
    })
    methods[method]++
    return {
      id: p.id, date: dateOf(p), venue: (p.venue_name || '').trim(), city: p.city?.trim() || null,
      songs: n, recognised: r, method, nearVenue: p.location_verified === true, confirmation: confirmationKind(p.status),
    }
  }).sort((a, b) => dayValue(b.date) - dayValue(a.date))

  const cityKeys = new Set<string>(), countryKeys = new Set<string>()
  const placeMap = new Map<string, ProofCore['places'][number]>()
  let showsWithoutPlace = 0
  for (const p of confirmed) {
    const key = placeKey(p.city, p.country)
    if (key) cityKeys.add(key)
    if (p.country?.trim()) countryKeys.add(countryCode(p.country) ?? normaliseText(p.country))
    const coords = p.venue_lat !== null && p.venue_lng !== null && Number.isFinite(p.venue_lat) && Number.isFinite(p.venue_lng) && !(p.venue_lat === 0 && p.venue_lng === 0)
      ? { lat: p.venue_lat, lng: p.venue_lng } : null
    const k = key ?? (coords ? `@${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : null)
    if (!k) { showsWithoutPlace++; continue }
    const cur = placeMap.get(k)
    if (cur) { cur.shows++; if (!cur.coords && coords) cur.coords = coords }
    else placeMap.set(k, { key: k, name: cityName(p.city) || (p.venue_name || '').trim(), countryCode: countryCode(p.country), shows: 1, coords })
  }

  const firstLast = (rows: PerfRow[]) => {
    if (!rows.length) return { first: null, last: null }
    const sorted = [...rows].sort((a, b) => dayValue(a) - dayValue(b))
    return { first: dateOf(sorted[0]), last: dateOf(sorted[sorted.length - 1]) }
  }

  return {
    counts: {
      liveRecord: live.length, confirmed: confirmed.length, awaiting: awaiting.length, imported: imported.length,
      cities: cityKeys.size, countries: countryKeys.size,
      songPerformances: shows.reduce((s, x) => s + x.songs, 0),
      legacyConfirmation: shows.filter(s => s.confirmation === 'legacy').length,
    },
    methods,
    shows,
    awaiting: awaiting.map(p => ({ id: p.id, date: dateOf(p), venue: (p.venue_name || '').trim(), city: p.city?.trim() || null }))
      .sort((a, b) => dayValue(b.date) - dayValue(a.date)),
    imported: { count: imported.length, ...firstLast(imported) },
    places: Array.from(placeMap.values()).sort((a, b) => b.shows - a.shows || a.name.localeCompare(b.name)),
    showsWithoutPlace,
  }
}

// The artist's image may go into the export only when Setlistr stores it:
// the artist's own upload in the avatars bucket. Externally hosted images
// (the Spotify import) are left out until their terms are confirmed.
export function imageExportable(url: string | null | undefined, supabaseUrl: string | null | undefined, artistId: string): boolean {
  if (!url || !supabaseUrl) return false
  try {
    const u = new URL(url), s = new URL(supabaseUrl)
    return u.origin === s.origin && u.pathname.startsWith(`/storage/v1/object/public/avatars/${artistId}/`)
  } catch { return false }
}

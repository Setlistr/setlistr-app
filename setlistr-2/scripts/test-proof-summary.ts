// DB-free tests for lib/proof/summary.ts and lib/proof/map.ts. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-proof-summary.ts
import { buildProofCore, setlistMethod, confirmationKind, countryCode, placeKey, imageExportable, isRecognisedSource, isManualSource, type PerfRow, type SongRow } from '../lib/proof/summary'
import { frameView, dotSize, VIEWS, staticMapUrl } from '../lib/proof/map'
import { placeContext, acceptPlace, cityKey, countryReadings, type GeoFeature } from '../lib/proof/place'
import { geographyCounts } from '../lib/proof/summary'
import { locatePlaces } from '../lib/proof/load'
import { isCapturedShow } from '../lib/performance-status'

let pass = 0, fail = 0
function check(name: string, ok: boolean, got?: unknown) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`, got === undefined ? '' : JSON.stringify(got)) } }

const P = (id: string, o: Partial<PerfRow> = {}): PerfRow => ({
  id, status: 'complete', data_source: 'captured', venue_name: `Venue ${id}`, city: 'Toronto', country: 'CA',
  performance_date: '2026-05-01', started_at: null, created_at: '2026-05-01T20:00:00Z', timezone: null,
  has_capture_location: false, location_verified: null, has_recording_path: false, venue_lat: null, venue_lng: null, ...o,
})
const songs = (id: string, recognised: number, manual: number): SongRow[] => [
  ...Array.from({ length: recognised }, () => ({ performance_id: id, source: 'fingerprint' })),
  ...Array.from({ length: manual }, () => ({ performance_id: id, source: 'manual' })),
]

console.log('— setlist method (positive evidence only)')
check('no songs → none', setlistMethod({ songs: 0, recognised: 0, uploadEvidence: true, liveEvidence: true }) === 'none')
check('every song recorded as manual → entered by hand', setlistMethod({ songs: 5, recognised: 0, manual: 5, uploadEvidence: false, liveEvidence: true }) === 'hand')
check('no recognised songs but no manual evidence → method not recorded, not hand', setlistMethod({ songs: 5, recognised: 0, manual: 0, uploadEvidence: false, liveEvidence: false }) === 'unknown')
check('partly manual, rest unknown → method not recorded', setlistMethod({ songs: 5, recognised: 0, manual: 3, uploadEvidence: false, liveEvidence: false }) === 'unknown')
check('upload evidence only → recording', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: true, liveEvidence: false }) === 'recording')
check('live evidence only → live', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: false, liveEvidence: true }) === 'live')
check('no evidence → method not recorded (never live)', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: false, liveEvidence: false }) === 'unknown')
check('conflicting evidence → method not recorded', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: true, liveEvidence: true }) === 'unknown')
check('recognised sources, including historical names (detected, music)', ['fingerprint', 'humming', 'recognized', 'combined', 'detected', 'music'].every(isRecognisedSource) && !['manual', 'planned', 'unidentified', 'cloned', 'transcript', null].some(isRecognisedSource))
check('manual evidence: manual only (planned is unplayed; cloned is unknown)', isManualSource('manual') && !['planned', 'cloned', 'unidentified', 'transcript', 'auto', 'upload', null, undefined, ''].some(isManualSource))

console.log('— confirmation')
check("'complete' → confirmed in review", confirmationKind('complete') === 'review')
check("legacy 'completed'/'exported' never claim a review", confirmationKind('completed') === 'legacy' && confirmationKind('exported') === 'legacy')

console.log('— summary')
const perfs: PerfRow[] = [
  P('a', { has_capture_location: true, location_verified: true, venue_lat: 43.66, venue_lng: -79.41 }),
  P('b', { city: 'Vancouver', country: 'Canada', venue_lat: 49.28, venue_lng: -123.12, performance_date: '2026-06-01' }),
  P('c', { city: 'London', country: 'UK', performance_date: '2026-04-01' }),
  P('d', { city: 'London, ON', country: 'Canada', performance_date: '2026-03-01' }),
  P('e', { status: 'review', performance_date: '2026-07-01' }),                 // awaiting
  P('f', { status: 'processing', performance_date: '2026-07-02' }),             // awaiting
  P('g', { status: 'draft' }),                                                 // not on the live record
  P('h', { status: 'live' }),                                                  // not on the live record
  P('i', { venue_name: '..' }),                                                // placeholder venue
  P('j', { data_source: 'setlistfm_imported', status: 'complete', performance_date: '2019-02-02' }),
  P('k', { data_source: 'setlistfm_imported', status: 'complete', performance_date: '2021-09-09' }),
  P('l', { status: 'exported', city: null, country: null, performance_date: '2026-02-01' }), // legacy, no place
  P('m', { has_recording_path: true, location_verified: false, performance_date: '2026-01-15' }),
  P('n', { performance_date: '2026-01-10' }),
  P('o', { performance_date: '2026-01-08' }),   // historical 'detected' songs, no capture evidence
  P('q', { performance_date: '2026-01-06' }),   // songs with null / unidentified sources
  P('r', { performance_date: '2026-01-05' }),   // only unplayed planned songs
  P('s', { performance_date: '2026-01-04' }),   // planned songs marked played, plus unplayed planned
  P('t', { performance_date: '2026-01-03' }),   // mixed: recognised + manual + unplayed planned, live flow
  P('u', { performance_date: '2026-01-02' }),   // copied ('cloned') songs only
  P('w', { performance_date: '2026-01-01' }),   // cloned alongside manual
]
const legacy: SongRow[] = [...Array.from({ length: 6 }, () => ({ performance_id: 'o', source: 'detected' })), { performance_id: 'q', source: null }, { performance_id: 'q', source: 'unidentified' }, { performance_id: 'q', source: 'manual' }]
const S = (id: string, source: string | null, n: number): SongRow[] => Array.from({ length: n }, () => ({ performance_id: id, source }))
const planned = [...S('r', 'planned', 3), ...S('s', 'manual', 4), ...S('s', 'planned', 2), ...S('t', 'fingerprint', 3), ...S('t', 'manual', 2), ...S('t', 'planned', 2), ...S('u', 'cloned', 2), ...S('w', 'cloned', 1), ...S('w', 'manual', 3)]
const songRows = [...legacy, ...planned, ...songs('a', 12, 2), ...songs('b', 0, 8), ...songs('c', 9, 1), ...songs('d', 5, 0), ...songs('e', 3, 0), ...songs('l', 4, 0), ...songs('m', 6, 1), ...songs('n', 7, 0), ...songs('j', 0, 10)]
const core = buildProofCore(perfs, songRows, [{ performance_id: 'c', flow_source: 'upload' }, { performance_id: 'd', flow_source: 'live' }, { performance_id: 't', flow_source: 'live' }], [{ performance_id: 'n', chunk_index: null }])
const live = perfs.filter(p => isCapturedShow(p)).length
check('live record equals the Dashboard rule (isCapturedShow)', core.counts.liveRecord === live && live === 16, core.counts)
check('confirmed = live record ∧ complete stage', core.counts.confirmed === 14, core.counts)
check('awaiting = live record − confirmed', core.counts.awaiting === 2 && core.counts.confirmed + core.counts.awaiting === core.counts.liveRecord)
check('imported counted separately, with first and last', core.imported.count === 2 && core.imported.first?.performance_date === '2019-02-02' && core.imported.last?.performance_date === '2021-09-09')
check('song performances = kept songs on confirmed shows only', core.counts.songPerformances === 14 + 8 + 10 + 5 + 4 + 7 + 7 + 6 + 3 + 0 + 4 + 5 + 2 + 4, core.counts.songPerformances)
const by = Object.fromEntries(core.shows.map(s => [s.id, s]))
check('a: live (capture location), near venue, 12 of 14', by.a.method === 'live' && by.a.nearVenue && by.a.recognised === 12 && by.a.songs === 14)
check('b: entered by hand', by.b.method === 'hand')
check('c: upload flow → from a recording', by.c.method === 'recording')
check('d: live flow → recognised live', by.d.method === 'live')
check('l: no evidence → method not recorded; legacy status → not "in review"', by.l.method === 'unknown' && by.l.confirmation === 'legacy')
check('m: recording path → recording; location_verified false → not near venue', by.m.method === 'recording' && !by.m.nearVenue)
check('n: recognition event without chunk_index alone stays method not recorded', by.n.method === 'unknown')
check('o: historical “detected” songs count as recognised; no capture evidence → method not recorded', by.o.recognised === 6 && by.o.method === 'unknown')
check('q: null/unidentified sources alongside manual → method not recorded, never entered by hand', by.q.method === 'unknown' && by.q.recognised === 0)
check('r: only unplayed planned songs → 0 songs, no songs on file (not entered by hand), confirmed show still counted', by.r.songs === 0 && by.r.method === 'none')
check('s: planned songs marked played count (stored manual); unplayed planned excluded → 4 songs, entered by hand', by.s.songs === 4 && by.s.method === 'hand')
check('t: mixed setlist → unplayed planned out of total and denominator: 3 of 5 recognised, live', by.t.songs === 5 && by.t.recognised === 3 && by.t.method === 'live')
check('u: copied songs only → method not recorded, never entered by hand', by.u.songs === 2 && by.u.method === 'unknown')
check('w: copied + manual → method not recorded', by.w.songs === 4 && by.w.method === 'unknown')
check('method counts sum to confirmed', Object.values(core.methods).reduce((a, b) => a + b, 0) === core.counts.confirmed, core.methods)
check('legacy confirmation counted for the note', core.counts.legacyConfirmation === 1)
check('register newest first', core.shows[0].id === 'b' && core.shows[core.shows.length - 1].id === 'w', core.shows.map(s => s.id))
check('London UK and London ON are different cities', core.counts.cities === 4, core.counts.cities)
check('Canada and CA are one country', core.counts.countries === 2, core.counts.countries)
check('a show with no city and no coordinates has no place', core.showsWithoutPlace === 1)
const toronto = core.places.find(p => p.key === placeKey('Toronto', 'CA'))
check('places group by city; stored venue coordinates kept', !!toronto && toronto.shows === 10 && !!toronto.coords, toronto)

console.log('— countries')
check('names read as countries', countryCode('Canada') === 'CA' && countryCode('United States') === 'US' && countryCode('UK') === 'GB' && countryCode('England') === 'GB' && countryCode('México') === 'MX' && countryCode('FR') === 'FR' && countryCode('DE') === null /* Delaware */)
check('unknown country is not guessed', countryCode('Atlantis') === null && countryCode('') === null && countryCode(null) === null && countryCode('XQ') === null)
check('TN is never Tunisia on its own: both readings kept', countryCode('TN') === null && JSON.stringify(countryReadings('TN').map(r => r.country + (r.region ? '-' + r.region.code : ''))) === '["TN","US-TN"]')
check('CA is Canada or California until evidence settles it', countryCode('CA') === null && countryReadings('CA').length === 2)
check('a state or province in the country field is a subdivision, not a country', JSON.stringify(countryReadings('Texas')) === JSON.stringify([{ country: 'US', region: { country: 'US', code: 'TX', name: 'Texas' } }]) && countryReadings('ON')[0].region?.code === 'ON')

console.log('— place context')
const rd = (c: ReturnType<typeof placeContext>) => c.readings.map(r => r.country + (r.region ? '-' + r.region.code : '')).join(',')
check('Austin, TX with US → Texas', rd(placeContext('Austin, TX', 'US')) === 'US-TX')
check('Austin, TX with no country → Texas (explicit state)', rd(placeContext('Austin, TX', null)) === 'US-TX')
check('Toronto, ON with CA → Ontario (province settles CA)', rd(placeContext('Toronto, ON', 'CA')) === 'CA-ON')
check('Toronto, ON with United States → conflict, unresolved', placeContext('Toronto, ON', 'United States').conflict && rd(placeContext('Toronto, ON', 'United States')) === '')
check('Austin, TX with Canada → conflict', placeContext('Austin, TX', 'Canada').conflict)
check('Nashville with TN → Tunisia or Tennessee, to be settled by lookup', rd(placeContext('Nashville', 'TN')) === 'TN,US-TN')
check('Ottawa with no country → insufficient (no conflict, nothing to look up)', rd(placeContext('Ottawa', null)) === '' && !placeContext('Ottawa', null).conflict)
check('NYC → New York, NY', placeContext('NYC', 'US').query === 'New York' && rd(placeContext('NYC', 'US')) === 'US-NY')
check('Québec City with CA → Québec, QC', placeContext('Québec City', 'CA').query === 'Québec' && rd(placeContext('Québec City', 'CA')) === 'CA-QC')
check('New York City with Canada → conflict', placeContext('New York City', 'Canada').conflict)
check('Saint/St. are one name; Saint John and St. John’s are not', cityKey('Saint Louis') === cityKey('St. Louis') && cityKey('Saint John') !== cityKey('St. John’s'))

console.log('— lookup acceptance (never the top result on rank alone)')
const F = (text: string, cc: string, region: string, lng = -97.7, lat = 30.3): GeoFeature => ({ text, place_type: ['place'], relevance: 1, center: [lng, lat], context: [{ id: 'region.1', short_code: `${cc}-${region}` }, { id: 'country.1', short_code: cc.toLowerCase() }] })
const austinUS = placeContext('Austin', 'US'), austinTX = placeContext('Austin, TX', 'US')
check('Austin (US) with Austin TX and Austin MN → ambiguous, unresolved', acceptPlace(austinUS, austinUS.readings[0], [F('Austin', 'US', 'TX'), F('Austin', 'US', 'MN')]) === null)
check('Austin, TX → the Texas result, wherever it ranks', !!acceptPlace(austinTX, austinTX.readings[0], [F('Austin', 'US', 'MN', -92.9, 43.6), F('Austin', 'US', 'TX')]) && acceptPlace(austinTX, austinTX.readings[0], [F('Austin', 'US', 'MN', -92.9, 43.6), F('Austin', 'US', 'TX')])!.lng === -97.7)
check('a single place of the name in the country → accepted', !!acceptPlace(placeContext('Halifax', 'Canada'), placeContext('Halifax', 'Canada').readings[0], [F('Halifax', 'CA', 'NS')]))
check('state given but no result in that state → unresolved', acceptPlace(austinTX, austinTX.readings[0], [F('Austin', 'US', 'MN')]) === null)
check('different name (Saint John vs St. John’s) → unresolved', acceptPlace(placeContext('Saint John', 'Canada'), placeContext('Saint John', 'Canada').readings[0], [F('St. John’s', 'CA', 'NL')]) === null)
check('St. Louis written “Saint Louis” → accepted', !!acceptPlace(placeContext('Saint Louis', 'US'), placeContext('Saint Louis', 'US').readings[0], [F('St. Louis', 'US', 'MO')]))
check('result in another country → unresolved', acceptPlace(placeContext('London', 'Canada'), placeContext('London', 'Canada').readings[0], [F('London', 'GB', 'ENG')]) === null)
console.log('— map framing')
const places = [{ name: 'Vancouver', shows: 7, lat: 49.28, lng: -123.12 }, { name: 'Toronto', shows: 16, lat: 43.65, lng: -79.38 }, { name: 'Berlin', shows: 1, lat: 52.52, lng: 13.40 }]
for (const name of ['phone', 'wide', 'cover'] as const) {
  const v = frameView(places, VIEWS[name])!
  check(`${name}: every dot inside the image`, v.dots.every(d => d.x > 0 && d.x < 100 && d.y > 0 && d.y < 100), v.dots)
}
const v = frameView(places, VIEWS.wide)!
const xs = v.dots.map(d => d.x)
check('framing is tight: places span most of the width', Math.max(...xs) - Math.min(...xs) > 80, xs)
check('gentle sizes: 1 show smallest, 16 shows larger but < 2.5×', dotSize(1, VIEWS.phone) === 6 && dotSize(16, VIEWS.phone) < 15)
check('smaller dots drawn last', v.dots[v.dots.length - 1].shows === 1)
check('single place is framed without error', !!frameView([places[0]], VIEWS.phone))
check('static URL has no marker overlay and keeps logo/attribution defaults', /\/static\/-?[\d.]+,-?[\d.]+,[\d.]+,0\/1000x338@2x\?access_token=/.test(staticMapUrl(v, 'tok')) && !/attribution=false|logo=false/.test(staticMapUrl(v, 'tok')))

console.log('— combining readings (lib/proof/load.ts locatePlaces)')
;(async () => {
  type Pl = Parameters<typeof locatePlaces>[0][number]
  const pl = (key: string, city: string, country: string | null, coords: { lat: number; lng: number } | null = null): Pl => ({ key, name: city, ctx: placeContext(city, country), shows: 1, coords })
  const geo = (map: Record<string, 'ok' | 'unresolved' | 'failed'>) => async (p: Pl, r: { country: string; region: { code: string } | null }) => {
    const st = map[`${p.key}:${r.country}${r.region ? '-' + r.region.code : ''}`] ?? 'unresolved'
    return st === 'ok' ? { status: 'ok' as const, coords: { lat: 1, lng: 2 } } : { status: st } as { status: 'unresolved' | 'failed' }
  }
  const run = (places: Pl[], m: Record<string, 'ok' | 'unresolved' | 'failed'>, token: string | null = 'tok') => locatePlaces(places, token, null, geo(m) as any)
  let r = await run([pl('n', 'Nashville', 'TN')], { 'n:US-TN': 'ok' })
  check('TN: only Tennessee identifies Nashville → located, settled US', r.located.has('n') && r.settled.get('n')?.country === 'US')
  r = await run([pl('n', 'Nashville', 'TN')], { 'n:US-TN': 'ok', 'n:TN': 'ok' })
  check('both readings identify a place → unresolved (no guess)', r.unresolved.has('n') && !r.located.has('n'))
  r = await run([pl('n', 'Nashville', 'TN')], { 'n:US-TN': 'ok', 'n:TN': 'failed' })
  check('one reading found, the other failed → lookup failed (not a guess)', r.failed.has('n') && !r.located.has('n'))
  r = await run([pl('t', 'Toronto', 'CA', { lat: 43.6, lng: -79.4 })], { 't:CA': 'ok' })
  check('stored coordinates kept; ambiguous CA settled to Canada by lookup', r.located.get('t')?.lat === 43.6 && r.settled.get('t')?.country === 'CA')
  r = await run([pl('a', 'Austin', 'US')], { 'a:US': 'failed' })
  check('lookup failure reported as failed, not unresolved', r.failed.has('a'))
  r = await run([pl('a', 'Austin', 'US')], {}, null)
  check('no token → failed', r.failed.has('a'))
  r = await run([pl('o', 'Ottawa', null), pl('x', 'Toronto, ON', 'United States')], {})
  check('missing or conflicting context → unresolved without a lookup', r.unresolved.has('o') && r.unresolved.has('x'))

  console.log('— geographic counts')
  const g = (city: string, country: string | null, settled: string | null = null) => {
    const ctx = placeContext(city, country)
    return { ctx, settled: settled ? ctx.readings.find(x => `${x.country}${x.region ? '-' + x.region.code : ''}` === settled) ?? null : null }
  }
  check('Portland, OR and Portland, ME → 2 cities, 1 country', JSON.stringify(geographyCounts([g('Portland, OR', 'US'), g('Portland, ME', 'US')])) === '{"cities":2,"countries":1}')
  check('Austin, TX and Austin (US) → 1 city', geographyCounts([g('Austin, TX', 'US'), g('Austin', 'US')]).cities === 1)
  check('unsettled TN not counted as a country; settled one is', geographyCounts([g('Nashville', 'TN')]).countries === 0 && geographyCounts([g('Nashville', 'TN', 'US-TN')]).countries === 1)
  check('London (UK) and London, ON → 2 cities, 2 countries', JSON.stringify(geographyCounts([g('London', 'UK'), g('London, ON', 'Canada')])) === '{"cities":2,"countries":2}')
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()

console.log('— export image')
const supa = 'https://abc.supabase.co'
check('artist upload in avatars bucket → may be embedded', imageExportable(`${supa}/storage/v1/object/public/avatars/artist-1/avatar.jpg`, supa, 'artist-1'))
check('another account’s folder → not embedded', !imageExportable(`${supa}/storage/v1/object/public/avatars/other/avatar.jpg`, supa, 'artist-1'))
check('external image (Spotify) → not embedded', !imageExportable('https://i.scdn.co/image/abc', supa, 'artist-1'))



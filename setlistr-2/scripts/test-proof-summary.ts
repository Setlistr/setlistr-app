// DB-free tests for lib/proof/summary.ts and lib/proof/map.ts. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-proof-summary.ts
import { buildProofCore, setlistMethod, confirmationKind, countryCode, placeKey, imageExportable, isRecognisedSource, type PerfRow, type SongRow } from '../lib/proof/summary'
import { frameView, acceptGeocode, dotSize, VIEWS, staticMapUrl } from '../lib/proof/map'
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
check('no recognised songs → entered by hand', setlistMethod({ songs: 5, recognised: 0, uploadEvidence: false, liveEvidence: true }) === 'hand')
check('upload evidence only → recording', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: true, liveEvidence: false }) === 'recording')
check('live evidence only → live', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: false, liveEvidence: true }) === 'live')
check('no evidence → method not recorded (never live)', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: false, liveEvidence: false }) === 'unknown')
check('conflicting evidence → method not recorded', setlistMethod({ songs: 5, recognised: 3, uploadEvidence: true, liveEvidence: true }) === 'unknown')
check('recognised sources', ['fingerprint', 'humming', 'recognized', 'combined'].every(isRecognisedSource) && !['manual', 'planned', 'unidentified', 'cloned', 'transcript', null].some(isRecognisedSource))

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
]
const songRows = [...songs('a', 12, 2), ...songs('b', 0, 8), ...songs('c', 9, 1), ...songs('d', 5, 0), ...songs('e', 3, 0), ...songs('l', 4, 0), ...songs('m', 6, 1), ...songs('n', 7, 0), ...songs('j', 0, 10)]
const core = buildProofCore(perfs, songRows, [{ performance_id: 'c', flow_source: 'upload' }, { performance_id: 'd', flow_source: 'live' }], [{ performance_id: 'n', chunk_index: null }])
const live = perfs.filter(p => isCapturedShow(p)).length
check('live record equals the Dashboard rule (isCapturedShow)', core.counts.liveRecord === live && live === 9, core.counts)
check('confirmed = live record ∧ complete stage', core.counts.confirmed === 7, core.counts)
check('awaiting = live record − confirmed', core.counts.awaiting === 2 && core.counts.confirmed + core.counts.awaiting === core.counts.liveRecord)
check('imported counted separately, with first and last', core.imported.count === 2 && core.imported.first?.performance_date === '2019-02-02' && core.imported.last?.performance_date === '2021-09-09')
check('song performances = kept songs on confirmed shows only', core.counts.songPerformances === 14 + 8 + 10 + 5 + 4 + 7 + 7, core.counts.songPerformances)
const by = Object.fromEntries(core.shows.map(s => [s.id, s]))
check('a: live (capture location), near venue, 12 of 14', by.a.method === 'live' && by.a.nearVenue && by.a.recognised === 12 && by.a.songs === 14)
check('b: entered by hand', by.b.method === 'hand')
check('c: upload flow → from a recording', by.c.method === 'recording')
check('d: live flow → recognised live', by.d.method === 'live')
check('l: no evidence → method not recorded; legacy status → not "in review"', by.l.method === 'unknown' && by.l.confirmation === 'legacy')
check('m: recording path → recording; location_verified false → not near venue', by.m.method === 'recording' && !by.m.nearVenue)
check('n: recognition event without chunk_index alone stays method not recorded', by.n.method === 'unknown')
check('method counts sum to confirmed', Object.values(core.methods).reduce((a, b) => a + b, 0) === core.counts.confirmed, core.methods)
check('legacy confirmation counted for the note', core.counts.legacyConfirmation === 1)
check('register newest first', core.shows[0].id === 'b' && core.shows[core.shows.length - 1].id === 'n', core.shows.map(s => s.id))
check('London UK and London ON are different cities', core.counts.cities === 4, core.counts.cities)
check('Canada and CA are one country', core.counts.countries === 2, core.counts.countries)
check('a show with no city and no coordinates has no place', core.showsWithoutPlace === 1)
const toronto = core.places.find(p => p.key === placeKey('Toronto', 'CA'))
check('places group by city; stored venue coordinates kept', !!toronto && toronto.shows === 3 && !!toronto.coords, toronto)

console.log('— countries')
check('codes and names', countryCode('ca') === 'CA' && countryCode('United States') === 'US' && countryCode('UK') === 'GB' && countryCode('England') === 'GB' && countryCode('México') === 'MX')
check('unknown country is not guessed', countryCode('Atlantis') === null && countryCode('') === null && countryCode(null) === null)

console.log('— geocode acceptance (unambiguous only)')
const f = (text: string, cc: string, rel = 1, type = 'place') => ({ text, place_type: [type], relevance: rel, center: [-79.38, 43.65] as [number, number], context: [{ id: 'country.1', short_code: cc }] })
check('city in the requested country → accepted', !!acceptGeocode('Toronto', 'CA', [f('Toronto', 'ca')]))
check('wrong country → rejected', acceptGeocode('London', 'CA', [f('London', 'gb')]) === null)
check('different name → rejected', acceptGeocode('Kitchener', 'CA', [f('Waterloo', 'ca')]) === null)
check('two equally good places of the same name → rejected', acceptGeocode('Springfield', 'US', [f('Springfield', 'us', 1), f('Springfield', 'us', 0.99)]) === null)
check('low relevance → rejected', acceptGeocode('Toronto', 'CA', [f('Toronto', 'ca', 0.6)]) === null)
check('not a city-level place → rejected', acceptGeocode('Ontario', 'CA', [f('Ontario', 'ca', 1, 'region')]) === null)
check('accents and case ignored in the name check', !!acceptGeocode('montreal', 'CA', [f('Montréal', 'ca')]))

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

console.log('— export image')
const supa = 'https://abc.supabase.co'
check('artist upload in avatars bucket → may be embedded', imageExportable(`${supa}/storage/v1/object/public/avatars/artist-1/avatar.jpg`, supa, 'artist-1'))
check('another account’s folder → not embedded', !imageExportable(`${supa}/storage/v1/object/public/avatars/other/avatar.jpg`, supa, 'artist-1'))
check('external image (Spotify) → not embedded', !imageExportable('https://i.scdn.co/image/abc', supa, 'artist-1'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

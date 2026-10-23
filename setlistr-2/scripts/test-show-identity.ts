// DB-free tests for lib/shows/identity.ts and lib/shows/timeline.ts. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-show-identity.ts
import { findCandidates, venueRelation, type IdentityRecord } from '../lib/shows/identity'
import { buildEntries, pageOf, decodeCursor, entryState, sourceLine, addedBy, scheduledAhead, captureDate, captureInstant, candidatesFor, type ShowRow, type PerfRow } from '../lib/shows/timeline'

let pass = 0, fail = 0
function check(name: string, ok: boolean, got?: unknown) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`, got === undefined ? '' : JSON.stringify(got)) } }

const R = (key: string, o: Partial<IdentityRecord> = {}): IdentityRecord => ({ key, venueId: null, venueName: 'Danforth Music Hall', city: 'Toronto', country: 'CA', localDate: '2026-10-15', instant: null, ...o })
const T = (iso: string) => Date.parse(iso)
const pairs = (rs: IdentityRecord[]) => findCandidates(rs).map(c => `${c.a}-${c.b}:${c.venue}/${c.time}`).sort()

console.log('— venues')
check('same venue id → same venue, even with different typed names', venueRelation(R('a', { venueId: 'v1', venueName: 'Danforth' }), R('b', { venueId: 'v1' })) === 'same-venue')
check('same name, same city → same name and place', venueRelation(R('a'), R('b', { venueName: 'the danforth music hall' })) === 'same-name-place')
check('same name, different city → different', venueRelation(R('a', { venueName: 'Metro', city: 'Chicago', country: 'US' }), R('b', { venueName: 'Metro', city: 'Sydney', country: 'Australia' })) === 'different')
check('same name and city, different country → different', venueRelation(R('a', { venueName: 'Union Hall', city: 'Brooklyn', country: 'US' }), R('b', { venueName: 'Union Hall', city: 'Brooklyn', country: 'Canada' })) === 'different')
check('festival stages are different venues', venueRelation(R('a', { venueName: 'Osheaga – Main Stage' }), R('b', { venueName: 'Osheaga – Green Stage' })) === 'different')
check('one record missing its city → possible, not certain', venueRelation(R('a'), R('b', { city: null })) === 'same-name-no-place')
check('different venue ids but the same name and city → still a candidate (venue rows can repeat)', venueRelation(R('a', { venueId: 'v1' }), R('b', { venueId: 'v2' })) === 'same-name-place')

console.log('— dates and times')
check('same date, times 38 minutes apart → times close', pairs([R('a', { instant: T('2026-10-16T01:02:00Z') }), R('b', { instant: T('2026-10-16T01:40:00Z') })])[0] === 'a-b:same-name-place/times-close')
check('same date, one time unknown → time unknown', pairs([R('a', { instant: T('2026-10-16T01:02:00Z') }), R('b')])[0] === 'a-b:same-name-place/time-unknown')
check('same date, times 3 hours apart → not flagged (heuristic only)', pairs([R('a', { instant: T('2026-10-15T18:00:00Z') }), R('b', { instant: T('2026-10-15T21:00:00Z') })]).length === 0)
check('known-zone midnight crossing (close real times, zones known) → candidate', pairs([R('a', { localDate: '2026-10-15', instant: T('2026-10-16T03:40:00Z') }), R('b', { localDate: '2026-10-16', instant: T('2026-10-16T04:10:00Z') })])[0] === 'a-b:same-name-place/across-midnight')
check('adjacent dates without times → never paired', pairs([R('a', { localDate: '2026-10-15' }), R('b', { localDate: '2026-10-16' })]).length === 0)
check('two dates apart → never paired', pairs([R('a', { localDate: '2026-10-13' }), R('b')]).length === 0)
check('no recorded zone: a timestamped capture is NOT paired with a date-only upload on the previous date', pairs([R('a', { localDate: '2026-10-16', instant: T('2026-10-16T01:02:00Z'), dateUncertain: true }), R('b', { localDate: '2026-10-15' })]).length === 0)
check('no recorded zone: not paired across dates even with close real times', pairs([R('a', { localDate: '2026-10-16', instant: T('2026-10-16T01:02:00Z'), dateUncertain: true }), R('b', { localDate: '2026-10-15', instant: T('2026-10-16T01:30:00Z') })]).length === 0)
check('no recorded zone: still compared on its stored date', pairs([R('a', { localDate: '2026-10-16', instant: T('2026-10-16T01:02:00Z'), dateUncertain: true }), R('b', { localDate: '2026-10-16' })])[0] === 'a-b:same-name-place/time-unknown')
check('date-only imports on adjacent dates → never paired', pairs([R('a', { localDate: '2026-10-15', instant: null }), R('b', { localDate: '2026-10-16', instant: null })]).length === 0)
check('a record with no date → never paired', pairs([R('a', { localDate: null }), R('b')]).length === 0)
check('same city, different venue, same date → separate', pairs([R('a', { venueName: 'Metro' }), R('b', { venueName: 'Empty Bottle' })]).length === 0)
check('overlapping times at different venues → separate', pairs([R('a', { venueName: 'Main Stage', instant: T('2026-10-16T01:00:00Z') }), R('b', { venueName: 'Tent Stage', instant: T('2026-10-16T01:00:00Z') })]).length === 0)

console.log('— pairwise only (no transitive grouping)')
const chain = pairs([R('a', { instant: T('2026-10-16T00:00:00Z') }), R('b', { instant: T('2026-10-16T01:45:00Z') }), R('c', { instant: T('2026-10-16T03:30:00Z') })])
check('A–B and B–C are pairs; A–C is not', JSON.stringify(chain) === JSON.stringify(['a-b:same-name-place/times-close', 'b-c:same-name-place/times-close']), chain)

console.log('— stored dates (never the viewer’s zone)')
const P = (id: string, o: Partial<PerfRow> = {}): PerfRow => ({ id, show_id: null, status: 'complete', submission_status: null, data_source: 'captured', venue_id: null, venue_name: 'Danforth Music Hall', city: 'Toronto', country: 'CA', performance_date: '2026-10-15', started_at: null, created_at: '2026-10-15T23:00:00Z', venue_latitude: null, venue_longitude: null, ...o })
check('date-only value kept as stored', captureDate(P('a', { performance_date: '2026-10-15' }), 'America/Vancouver') === '2026-10-15')
check('midnight-UTC value kept as a date', captureDate(P('a', { performance_date: '2026-10-15T00:00:00+00:00' }), 'America/Vancouver') === '2026-10-15')
check('timestamp read in the record’s zone (9 PM Toronto = next day UTC)', captureDate(P('a', { performance_date: '2026-10-16T01:00:00Z' }), 'America/Toronto') === '2026-10-15')
check('timestamp with no zone kept as stored (UTC), not shifted', captureDate(P('a', { performance_date: '2026-10-16T01:00:00Z' }), null) === '2026-10-16')
check('a midnight-UTC started_at is not a start time', captureInstant(P('a', { started_at: '2026-10-15T00:00:00Z' })) === null && captureInstant(P('b', { started_at: '2026-10-16T01:02:00Z' })) !== null)
check('imports have no start time', captureInstant(P('a', { data_source: 'setlistfm_imported', started_at: '2026-10-16T01:02:00Z' })) === null)

console.log('— grouping, states and wording')
const NOW = new Date('2026-10-22T22:00:00Z')
const S = (id: string, o: Partial<ShowRow> = {}): ShowRow => ({ id, status: 'completed', scheduled_at: '2026-10-19T00:00:00Z', timezone: 'America/Toronto', venue_id: 'v1', name: null, show_type: 'single', created_by: 'artist', scheduled_by: null, scheduled_by_name: null, started_at: null, updated_at: '2026-10-01T00:00:00Z', venues: { name: 'Massey Hall', city: 'Toronto', country: 'CA', latitude: null, longitude: null }, ...o })
const entries = buildEntries([
  S('linked', { scheduled_by: 'jordan', scheduled_by_name: 'Jordan' }),
  S('two', { venues: { name: 'The Rivoli', city: 'Toronto', country: 'CA', latitude: null, longitude: null }, scheduled_at: '2026-09-21T00:00:00Z' }),
  S('future', { status: 'scheduled', scheduled_at: '2026-10-29T00:00:00Z' }),
  S('pastsched', { status: 'scheduled', scheduled_at: '2026-10-12T00:00:00Z', venues: { name: "Lee's Palace", city: 'Toronto', country: 'CA', latitude: null, longitude: null } }),
  S('cancel', { status: 'cancelled', scheduled_at: '2026-10-10T02:00:00Z', venues: { name: 'Bovine', city: 'Toronto', country: 'CA', latitude: null, longitude: null } }),
  S('cancelfuture', { status: 'cancelled', scheduled_at: '2026-11-02T01:00:00Z' }),
], [
  P('p1', { show_id: 'linked', venue_name: 'Massey Hall', performance_date: '2026-10-18', started_at: '2026-10-19T00:07:00Z' }),
  P('p2a', { show_id: 'two', venue_name: 'The Rivoli', performance_date: '2026-09-20', started_at: '2026-09-20T23:00:00Z' }),
  P('p2b', { show_id: 'two', venue_name: 'The Rivoli', performance_date: '2026-09-20', started_at: '2026-09-21T02:00:00Z', status: 'review' }),
  P('cap', { performance_date: '2026-10-15', started_at: '2026-10-16T01:02:00Z', status: 'review' }),
  P('up', { performance_date: '2026-10-15', started_at: '2026-10-15T00:00:00Z', submission_status: 'submitted' }),
  P('imp', { data_source: 'setlistfm_imported', venue_name: 'Union Hall', city: 'Edmonton', performance_date: '2026-09-12' }),
  P('draft', { status: 'draft' }),
], NOW)
const by = Object.fromEntries(entries.map(e => [e.key, e]))
check('a linked scheduled show and its capture are one entry', !!by['s:linked'] && by['s:linked'].perfs.length === 1 && !by['p:p1'])
check('several captures linked to one show are all kept', by['s:two'].perfs.length === 2 && entryState(by['s:two'])?.label === '2 captures')
check('a future scheduled show is left to Upcoming', !by['s:future'])
check('a past scheduled show with no capture → "No capture linked"', entryState(by['s:pastsched'])?.label === 'No capture linked')
check('cancelled → "Cancelled"; a cancelled show still ahead is left out, as Schedule does today', entryState(by['s:cancel'])?.label === 'Cancelled' && !by['s:cancelfuture'])
check('submitted → "Marked submitted"', entryState(by['p:up'])?.label === 'Marked submitted')
check('imported has no workflow state; provenance in the source line', entryState(by['p:imp']) === null && sourceLine(by['p:imp'], {}) === 'Imported from setlist.fm')
check('drafts are not records', !by['p:draft'])
check('method only from evidence: unknown method reads "Method not recorded", never "Captured live"', sourceLine(by['p:cap'], {}) === 'Method not recorded' && sourceLine(by['p:cap'], { cap: 'live' }) === 'Recognised live')
check('"Scheduled" from the record, not from knowing who: stored actor, or created well before it started', sourceLine(by['s:linked'], { p1: 'live' }) === 'Scheduled · recognised live' && !/Scheduled/.test(sourceLine(by['s:two'], {})))
check('a delayed unscheduled start (show record made long before capture, no scheduling evidence) is NOT "Scheduled"', !scheduledAhead({ ...S('y', { scheduled_by: null, status: 'completed', started_at: '2026-10-19T00:07:00Z' }), created_at: '2026-10-01T12:00:00Z' } as any))
check('explicit evidence only: stored actor, or a scheduled/cancelled status', scheduledAhead(S('a', { scheduled_by: 'u1' })) && scheduledAhead(S('b', { status: 'scheduled' })) && scheduledAhead(S('c', { status: 'cancelled' })) && !scheduledAhead(S('d', { status: 'live' })))
check('a past scheduled show reads "Scheduled in Setlistr" whether or not the person is known', sourceLine(by['s:pastsched'], {}) === 'Scheduled in Setlistr' && addedBy(by['s:pastsched']) === null)
check('"Added by" only for a stored teammate attribution', addedBy(by['s:linked']) === 'Jordan' && addedBy(by['s:two']) === null)
const cs = candidatesFor(entries).map(c => `${c.a}|${c.b}`)
check('capture + upload at the same venue on the same date → one possible-duplicate pair', cs.includes('p:cap|p:up'), cs)
check('two linked sets of one show aren’t paired with each other', !cs.some(c => c.includes('s:two') && c.split('|').every(k => k === 's:two')))

console.log('— pagination')
const many = buildEntries([], Array.from({ length: 60 }, (_, i) => P(`m${String(i).padStart(2, '0')}`, { venue_name: `Venue ${i % 7}`, performance_date: i < 30 ? '2026-10-01' : `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`, started_at: i % 3 === 0 ? null : `2026-10-01T2${i % 4}:00:00Z` })), NOW)
const seen: string[] = []
let cur: string | null = null, guard = 0
do { const pg = pageOf(many, decodeCursor(cur), 25); seen.push(...pg.page.map(e => e.key)); cur = pg.next; guard++ } while (cur && guard < 10)
check('every record exactly once across pages (30 on one date)', seen.length === 60 && new Set(seen).size === 60, { n: seen.length, u: new Set(seen).size })
check('same order every time (unique tie-breaker)', JSON.stringify(seen) === JSON.stringify(pageOf(many, null, 100).page.map(e => e.key)))
check('a tampered cursor is rejected', decodeCursor('not-a-cursor') === null && decodeCursor(Buffer.from('[1,2]').toString('base64url')) === null)
const pairEdge = buildEntries([], [...Array.from({ length: 24 }, (_, i) => P(`f${i}`, { venue_name: `Filler ${i}`, performance_date: '2026-10-20' })), P('x1', { performance_date: '2026-10-19' }), P('x2', { performance_date: '2026-10-19' })], NOW)
const p1 = pageOf(pairEdge, null, 25), p2 = pageOf(pairEdge, decodeCursor(p1.next), 25)
const edgePairs = candidatesFor(pairEdge).filter(c => c.a.startsWith('p:x'))
check('a pair split across a page edge is still found', p1.page.some(e => e.key.startsWith('p:x')) && p2.page.some(e => e.key.startsWith('p:x')) && edgePairs.length === 1, { p1: p1.page.map(e => e.key).slice(-2), p2: p2.page.map(e => e.key) })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

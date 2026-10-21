// DB-free tests for lib/writer-credits.ts. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-writer-credits.ts
// Fixtures are the composer/writer/lyricist relations MusicBrainz returned on
// 2026-10-21 (work lookups with inc=artist-rels), trimmed to type and artist.
import { writerCredit, writerNames } from '../lib/writer-credits'

let pass = 0, fail = 0
function check(name: string, ok: boolean, got?: unknown) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`, got ?? '') } }

const bohemianRhapsody = [
  { type: 'composer', artist: { id: '022589ac-7177-460d-a178-9976cf70e29f', name: 'Freddie Mercury' } },
  { type: 'lyricist', artist: { id: '022589ac-7177-460d-a178-9976cf70e29f', name: 'Freddie Mercury' } },
]
const rollingInTheDeep = [
  { type: 'writer', artist: { id: 'cc2c9c3c-b7bc-4b8b-84d8-4fbd8779e493', name: 'Adele' } },
  { type: 'writer', artist: { id: '65380f7e-cb7a-4594-ae44-28ff55160746', name: 'Paul Epworth' } },
]
const shapeOfYou = [
  { type: 'writer', artist: { id: '785a76e3-02db-4a36-bc13-9369d53be151', name: 'Kevin “She’kspere” Briggs' } },
  { type: 'writer', artist: { id: 'e90b2067-fa0e-4fa1-b20d-6fb9bace77ca', name: 'Tameka “Tiny” Cottle' } },
  { type: 'writer', artist: { id: '888f7e18-2a96-4f2e-8320-08ff4330b442', name: 'Kandi' } },
  { type: 'writer', artist: { id: '84580595-7fe2-4a6e-975c-066cb7cdb187', name: 'Steve Mac' } },
  { type: 'writer', artist: { id: '7c9c8018-bae6-4d06-b201-643f5eb1c39f', name: 'Johnny McDaid' } },
  { type: 'writer', artist: { id: 'b8a7c51f-362c-4dcb-a259-bc6e0095f0a6', name: 'Ed Sheeran' } },
]
const join = (rels: { artist?: { name?: string } }[]) => rels.map(x => x.artist?.name).filter(Boolean).join(', ')

check('the released join repeats a composer who is also the lyricist', join(bohemianRhapsody) === 'Freddie Mercury, Freddie Mercury')
check('composer and lyricist, same person: one credit', writerCredit(bohemianRhapsody) === 'Freddie Mercury', writerCredit(bohemianRhapsody))
check('two writers: both, in order', writerCredit(rollingInTheDeep) === 'Adele, Paul Epworth')
check('six writers: all six, in order', writerCredit(shapeOfYou) === join(shapeOfYou) && writerNames(shapeOfYou).length === 6)
check('several people, each in several roles: one credit each, first-role order',
  writerCredit([rollingInTheDeep[0], rollingInTheDeep[1], { ...rollingInTheDeep[1], type: 'lyricist' }, { ...rollingInTheDeep[0], type: 'lyricist' }]) === 'Adele, Paul Epworth')
check('two different people with the same name keep a credit each',
  writerCredit([{ artist: { id: 'a-1', name: 'John Smith' } }, { artist: { id: 'a-2', name: 'John Smith' } }]) === 'John Smith, John Smith')
check('a relation without an id is kept, never merged by name',
  writerCredit([{ artist: { id: 'a-1', name: 'Jo Lee' } }, { artist: { name: 'Jo Lee' } }]) === 'Jo Lee, Jo Lee')
check('relations without a name are skipped', writerCredit([{ artist: null }, { artist: { id: 'x' } }, { artist: { id: 'a-1', name: 'Kandi' } }]) === 'Kandi')
check('no relations: empty, so callers keep their fallback', writerCredit([]) === '')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

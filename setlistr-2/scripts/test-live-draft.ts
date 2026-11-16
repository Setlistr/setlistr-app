// DB-free tests for lib/live-draft.ts (the device copy of a live capture list
// that survives the page being thrown away). Browser-level checks are in the
// PR description. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-live-draft.ts
import { readLiveDraft, writeLiveDraft, clearLiveDraft, mergeLiveDraft, LIVE_DRAFT_MAX_AGE_MS } from '../lib/live-draft'

let pass = 0, fail = 0
function check(name: string, ok: boolean) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

type S = { row_id?: string; title: string; artist: string; source?: string }
const song = (row_id: string | undefined, title: string, artist = 'Juniper Hale'): S => ({ row_id, title, artist })

// A stand-in for window.localStorage.
const store = new Map<string, string>()
let throwOnSet = false
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => store.has(k) ? store.get(k)! : null,
    setItem: (k: string, v: string) => { if (throwOnSet) throw new Error('QuotaExceededError'); store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  },
}

console.log('Merge')
{
  const saved = [song('a', 'Northbound'), song('b', 'Dry County')]
  const r = mergeLiveDraft(saved, [song('a', 'Northbound'), song('b', 'Dry County'), song('c', 'Added Offline')])
  check('song only in the draft is added after the saved ones', r.songs.map(s => s.title).join('|') === 'Northbound|Dry County|Added Offline')
  check('counted as one recovered change', r.recovered === 1)
}
{
  const r = mergeLiveDraft([song('a', 'Nortbound')], [song('a', 'Northbound')])
  check('draft edit applies to the row saved under the same id', r.songs.length === 1 && r.songs[0].title === 'Northbound' && r.recovered === 1)
}
{
  const r = mergeLiveDraft([song('a', 'Northbound'), song('x', 'Recorded Elsewhere')], [song('a', 'Northbound')])
  check('saved row the draft lacks is kept (never dropped)', r.songs.map(s => s.title).join('|') === 'Northbound|Recorded Elsewhere' && r.recovered === 0)
}
{
  const r = mergeLiveDraft([song('a', 'Northbound')], [song('a', 'Northbound')])
  check('draft equal to the server: nothing recovered, no duplicates', r.songs.length === 1 && r.recovered === 0)
}
{
  const r = mergeLiveDraft([], [song('c', 'One'), song('d', 'Two')])
  check('nothing saved yet: whole draft restored in order', r.songs.map(s => s.title).join('|') === 'One|Two' && r.recovered === 2)
}

console.log('Storage')
{
  writeLiveDraft('perf-1', [song('a', 'Northbound'), song(undefined, 'No id yet')])
  const d = readLiveDraft<S>('perf-1')
  check('written and read back', !!d && d.songs.length === 1 && d.songs[0].title === 'Northbound')
  check('songs without a row id are not stored (they get one at once)', !!d && d.songs.every(s => !!s.row_id))
  check('drafts are per show', readLiveDraft('perf-2') === null)
  clearLiveDraft('perf-1')
  check('cleared', readLiveDraft('perf-1') === null)
}
{
  writeLiveDraft('perf-old', [song('a', 'Northbound')])
  const d = readLiveDraft<S>('perf-old', Date.now() + LIVE_DRAFT_MAX_AGE_MS + 1000)
  check('draft older than the limit is dropped', d === null && !store.has('sl_live_draft:perf-old'))
}
{
  store.set('sl_live_draft:perf-bad', '{not json')
  check('corrupt draft reads as none', readLiveDraft('perf-bad') === null)
  store.set('sl_live_draft:perf-bad', JSON.stringify({ savedAt: Date.now(), songs: [null, { title: 'x' }, { row_id: 'r', title: 'Ok', artist: '' }] }))
  const d = readLiveDraft<S>('perf-bad')
  check('malformed entries skipped', !!d && d.songs.length === 1 && d.songs[0].title === 'Ok')
}
{
  throwOnSet = true
  let threw = false
  try { writeLiveDraft('perf-3', [song('a', 'Northbound')]) } catch { threw = true }
  check('full or blocked storage never throws into capture', !threw)
  throwOnSet = false
}
{
  const saved = (globalThis as any).window
  delete (globalThis as any).window
  let ok = true
  try { writeLiveDraft('p', [song('a', 'x')]); ok = readLiveDraft('p') === null; clearLiveDraft('p') } catch { ok = false }
  check('no window (server render): silent no-op', ok)
  ;(globalThis as any).window = saved
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

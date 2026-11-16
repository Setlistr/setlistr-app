// DB-free tests for lib/live-draft.ts (the device copy of a live capture list
// that survives the page being thrown away). Browser-level checks are in the
// PR description. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-live-draft.ts
import { readLiveDraft, writeLiveDraft, clearLiveDraft, mergeLiveDraft, songFingerprint, LIVE_DRAFT_MAX_AGE_MS, type LiveDraft } from '../lib/live-draft'

let pass = 0, fail = 0
function check(name: string, ok: boolean) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

type S = { row_id?: string; title: string; artist: string; source?: string }
const song = (row_id: string | undefined, title: string, source = 'manual'): S => ({ row_id, title, artist: 'Juniper Hale', source })
const baseOf = (rows: S[]) => Object.fromEntries(rows.map(r => [r.row_id as string, songFingerprint(r)]))
const draft = (songs: S[], base: Record<string, string>): LiveDraft<S> => ({ savedAt: Date.now(), songs, base })
const titles = (l: S[]) => l.map(s => s.title).join('|')

// A stand-in for window.localStorage.
const store = new Map<string, string>()
let throwOnSet = false, throwOnGet = false
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => { if (throwOnGet) throw new Error('SecurityError'); return store.has(k) ? store.get(k)! : null },
    setItem: (k: string, v: string) => { if (throwOnSet) throw new Error('QuotaExceededError'); store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  },
}

console.log('Merge: unsaved work comes back')
{
  const saved = [song('a', 'Northbound'), song('b', 'Dry County')]
  const r = mergeLiveDraft(saved, draft([...saved, song('c', 'Added Offline')], baseOf(saved)))
  check('never-saved song added after the saved ones', titles(r.songs) === 'Northbound|Dry County|Added Offline' && r.recovered === 1)
}
{
  const saved = [song('a', 'Nortbound')]
  const r = mergeLiveDraft(saved, draft([song('a', 'Northbound')], baseOf(saved)))
  check('edit made here applies when the server row is unchanged since', titles(r.songs) === 'Northbound' && r.recovered === 1)
}
{
  const r = mergeLiveDraft([], draft([song('c', 'One'), song('d', 'Two')], {}))
  check('nothing saved yet: whole copy restored in order', titles(r.songs) === 'One|Two' && r.recovered === 2)
}

console.log('Merge: newer server work wins')
{
  const seen = [song('a', 'Nortbound')]
  const server = [song('a', 'Northbound (Acoustic)')]           // edited elsewhere after this device saw it
  const r = mergeLiveDraft(server, draft([song('a', 'Northbound')], baseOf(seen)))
  check('row changed elsewhere since: server version kept', titles(r.songs) === 'Northbound (Acoustic)' && r.recovered === 0 && r.keptServer === 1)
}
{
  const r = mergeLiveDraft([song('a', 'Server Title')], draft([song('a', 'Copy Title')], {}))
  check('no base for the row: server version kept', titles(r.songs) === 'Server Title' && r.keptServer === 1)
}
{
  const seen = [song('a', 'Northbound'), song('b', 'Deleted Elsewhere')]
  const r = mergeLiveDraft([song('a', 'Northbound')], draft(seen, baseOf(seen)))
  check('saved row removed elsewhere since: not brought back', titles(r.songs) === 'Northbound' && r.keptServer === 1)
}
{
  const r = mergeLiveDraft([song('x', 'Northbound', 'fingerprint')], draft([song('y', 'northbound')], {}))
  check('same title already on the server under another id: not duplicated', titles(r.songs) === 'Northbound' && r.recovered === 0)
}
{
  const r = mergeLiveDraft([song('p', 'Encore Song', 'planned')], draft([song('y', 'Encore Song')], {}))
  check('unconfirmed planned entry does not block the played song', titles(r.songs) === 'Encore Song|Encore Song' && r.recovered === 1)
}
{
  const saved = [song('a', 'Northbound'), song('x', 'Recorded Elsewhere')]
  const r = mergeLiveDraft(saved, draft([song('a', 'Northbound')], baseOf([song('a', 'Northbound')])))
  check('server row the copy lacks is kept', titles(r.songs) === 'Northbound|Recorded Elsewhere')
}
{
  const saved = [song('a', 'Northbound'), song('b', 'Deleted Offline')]
  const r = mergeLiveDraft(saved, draft([song('a', 'Northbound')], baseOf(saved)))
  check('documented limit: song deleted here offline comes back', titles(r.songs) === 'Northbound|Deleted Offline')
}
{
  const saved = [song('a', 'Northbound')]
  const r = mergeLiveDraft(saved, draft(saved, baseOf(saved)))
  check('copy equal to the server: nothing recovered, no duplicates', r.songs.length === 1 && r.recovered === 0 && r.keptServer === 0)
}

console.log('Storage: scoped to account and show')
{
  check('written', writeLiveDraft('user-a', 'perf-1', [song('a', 'Northbound'), song(undefined, 'No id yet')], {}) === true)
  const d = readLiveDraft<S>('user-a', 'perf-1')
  check('read back by the same account and show', !!d && d.songs.length === 1 && d.songs[0].title === 'Northbound')
  check('another account on this device cannot read it', readLiveDraft('user-b', 'perf-1') === null)
  check('another show cannot read it', readLiveDraft('user-a', 'perf-2') === null)
  clearLiveDraft('user-b', 'perf-1')
  check('another account cannot clear it', readLiveDraft('user-a', 'perf-1') !== null)
  check('no account: nothing read or written', readLiveDraft(null, 'perf-1') === null && writeLiveDraft(null, 'perf-1', [song('a', 'x')], {}) === false)
  clearLiveDraft('user-a', 'perf-1')
  check('cleared by its owner', readLiveDraft('user-a', 'perf-1') === null)
}
{
  writeLiveDraft('user-a', 'perf-old', [song('a', 'Northbound')], {})
  check('copy older than the limit is dropped', readLiveDraft('user-a', 'perf-old', Date.now() + LIVE_DRAFT_MAX_AGE_MS + 1000) === null && !Array.from(store.keys()).some(k => k.endsWith(":perf-old")))
}
{
  store.set('sl_live_draft:v2:user-a:perf-bad', '{not json')
  check('corrupt copy reads as none', readLiveDraft('user-a', 'perf-bad') === null)
  store.set('sl_live_draft:v2:user-a:perf-bad', JSON.stringify({ savedAt: Date.now(), songs: [song('a', 'x')] }))
  check('copy without a base reads as none', readLiveDraft('user-a', 'perf-bad') === null)
  store.set('sl_live_draft:v2:user-a:perf-bad', JSON.stringify({ savedAt: Date.now(), base: {}, songs: [null, { title: 'x' }, { row_id: 'r', title: 'Ok', artist: '' }] }))
  const d = readLiveDraft<S>('user-a', 'perf-bad')
  check('malformed entries skipped', !!d && d.songs.length === 1 && d.songs[0].title === 'Ok')
}

console.log('Storage failures')
{
  throwOnSet = true
  let threw = false, ok = true
  try { ok = writeLiveDraft('user-a', 'perf-3', [song('a', 'Northbound')], {}) } catch { threw = true }
  check('full storage: no throw, reports not stored', !threw && ok === false)
  throwOnSet = false
}
{
  writeLiveDraft('user-a', 'perf-4', [song('a', 'Northbound')], {})
  throwOnGet = true
  let threw = false, d: unknown = 'x'
  try { d = readLiveDraft('user-a', 'perf-4') } catch { threw = true }
  check('unreadable storage: no throw, reads as none', !threw && d === null)
  throwOnGet = false
}
{
  const saved = (globalThis as any).window
  delete (globalThis as any).window
  let ok = true
  try { ok = writeLiveDraft('user-a', 'p', [song('a', 'x')], {}) === false && readLiveDraft('user-a', 'p') === null; clearLiveDraft('user-a', 'p') } catch { ok = false }
  check('no storage at all (server render): reports not stored', ok)
  ;(globalThis as any).window = saved
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

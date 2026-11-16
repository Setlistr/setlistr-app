// DB-free tests for lib/live-finalize.ts (ending a live capture without losing
// songs), against an in-memory stand-in for the few Supabase queries it makes.
// The browser-level checks (real Supabase, injected failures, double taps,
// autosave race) are in the PR description. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-live-finalize.ts
import { finalizeLiveCapture, type FinalSongRow } from '../lib/live-finalize'

let pass = 0, fail = 0
function check(name: string, ok: boolean) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

type Perf = { id: string; status: string; ended_at?: string; set_duration_minutes?: number | null }
type Song = { id: string; performance_id: string; title: string | null }
type Op = 'read' | 'upsert' | 'delete' | 'verify' | 'update'

// A tiny in-memory database with the query shapes finalizeLiveCapture uses.
// failOn: make one operation fail. onBeforeUpdate: run something just before
// the status update (another device finishing the show first).
function fakeDb(perf: Perf, songs: Song[], opts: { failOn?: Op; extraRowOnVerify?: boolean; onBeforeUpdate?: () => void } = {}) {
  const db = { perf: { ...perf }, songs: songs.map(s => ({ ...s })), ops: [] as Op[] }
  const result = (op: Op, data: unknown) => {
    db.ops.push(op)
    return opts.failOn === op ? { data: null, error: { message: `injected ${op} failure` } } : { data, error: null }
  }
  const client = {
    from(table: string) {
      const filters: Array<(r: any) => boolean> = []
      let mode: 'select' | 'delete' | 'update' = 'select', cols = '', patch: any = null, wantsRows = false
      const b: any = {
        select(c: string) { if (mode === 'update') wantsRows = true; else cols = c; return b },
        eq(k: string, v: unknown) { filters.push(r => r[k] === v); return b },
        in(k: string, vs: unknown[]) { filters.push(r => vs.includes(r[k])); return b },
        not(k: string, _op: string, list: string) { const ids = list.replace(/[()]/g, '').split(','); filters.push(r => !ids.includes(r[k])); return b },
        delete() { mode = 'delete'; return b },
        update(p: any) { mode = 'update'; patch = p; return b },
        upsert(rows: Song[]) {
          const r = result('upsert', null)
          if (!r.error) for (const row of rows) { const i = db.songs.findIndex(s => s.id === row.id); if (i >= 0) db.songs[i] = { ...db.songs[i], ...row }; else db.songs.push({ ...row }) }
          return Promise.resolve(r)
        },
        single() { return b.then((r: any) => ({ data: r.data?.[0] ?? null, error: r.error })) },
        then(resolve: (v: any) => void, reject?: (e: unknown) => void) {
          try {
            if (table === 'performances' && mode === 'select') {
              const rows = [db.perf].filter(r => filters.every(f => f(r)))
              return Promise.resolve(result('read', rows.map(r => ({ status: r.status })))).then(resolve, reject)
            }
            if (table === 'performances' && mode === 'update') {
              opts.onBeforeUpdate?.()
              const hit = filters.every(f => f(db.perf))
              const r = result('update', hit ? [{ id: db.perf.id }] : [])
              if (!r.error && hit) Object.assign(db.perf, patch)
              return Promise.resolve(wantsRows ? r : { error: r.error }).then(resolve, reject)
            }
            if (table === 'performance_songs' && mode === 'delete') {
              const r = result('delete', null)
              if (!r.error) db.songs = db.songs.filter(s => !filters.every(f => f(s)))
              return Promise.resolve(r).then(resolve, reject)
            }
            if (table === 'performance_songs' && mode === 'select') {
              let rows = db.songs.filter(s => filters.every(f => f(s))).map(s => ({ id: s.id }))
              if (opts.extraRowOnVerify) rows = [...rows, { id: 'written-by-someone-else' }]
              return Promise.resolve(result('verify', rows)).then(resolve, reject)
            }
            throw new Error(`unexpected query on ${table} (${mode}, ${cols})`)
          } catch (e) { return Promise.reject(e).then(resolve, reject) }
        },
      }
      return b
    },
  }
  return { db, client }
}

const P = 'perf-1'
const row = (id: string, title: string, position: number): FinalSongRow => ({
  id, performance_id: P, title, artist: 'Juniper Hale', position, isrc: null, composer: null, publisher: null,
  source: 'fingerprint', was_planned: false, inclusion_reason: null, threshold: null, score: null, confusion_matrix_result: 'TBD',
})
// Saved during capture: a, b, c. Final list: a (retitled), c, d (new). b was deleted on stage.
const saved: Song[] = [{ id: 'a', performance_id: P, title: 'A' }, { id: 'b', performance_id: P, title: 'B' }, { id: 'c', performance_id: P, title: 'C' }]
const final = [row('a', 'A (retitled)', 1), row('c', 'C', 2), row('d', 'D', 3)]
const args = { performanceId: P, rows: final, endedAt: '2026-11-13T23:00:00Z', durationMinutes: 72 }
const titles = (s: Song[]) => s.map(x => x.title).sort().join(',')

;(async () => {
  console.log('Happy path')
  {
    const { db, client } = fakeDb({ id: P, status: 'live' }, saved)
    const r = await finalizeLiveCapture(client, args)
    check('finishes and reports it did', r.ok && r.transitioned)
    check('show is in review with its end and duration', db.perf.status === 'review' && db.perf.ended_at === args.endedAt && db.perf.set_duration_minutes === 72)
    check('songs are exactly the final list', titles(db.songs) === 'A (retitled),C,D')
    check('order: read, upsert, delete, verify, update', db.ops.join(',') === 'read,upsert,delete,verify,update')
  }

  console.log('A failure at any step keeps the show live and loses no saved song')
  for (const step of ['read', 'upsert', 'delete', 'verify', 'update'] as Op[]) {
    const { db, client } = fakeDb({ id: P, status: 'live' }, saved, { failOn: step })
    const r = await finalizeLiveCapture(client, args)
    check(`${step}: reported as a failure`, !r.ok)
    check(`${step}: show still live`, db.perf.status === 'live')
    const kept = ['A', 'A (retitled)'].some(t => db.songs.some(s => s.title === t)) && db.songs.some(s => s.title === 'C')
    check(`${step}: every song still on stage is still saved`, kept)
    // Retrying from the same state with the failure gone completes cleanly.
    const again = fakeDb(db.perf, db.songs)
    const retry = await finalizeLiveCapture(again.client, args)
    check(`${step}: retry finishes with the exact final list`, retry.ok && titles(again.db.songs) === 'A (retitled),C,D' && again.db.perf.status === 'review')
  }

  console.log('Read-back mismatch blocks finishing')
  {
    const { db, client } = fakeDb({ id: P, status: 'live' }, saved, { extraRowOnVerify: true })
    const r = await finalizeLiveCapture(client, args)
    check('mismatch is a failure at verify', !r.ok && r.step === 'verify')
    check('show not marked finished', db.perf.status === 'live')
  }

  console.log('Already finished (another tap or device)')
  {
    const { db, client } = fakeDb({ id: P, status: 'review' }, [{ id: 'a', performance_id: P, title: 'Edited in Review' }])
    const r = await finalizeLiveCapture(client, args)
    check('ok without finishing again', r.ok && !r.transitioned)
    check('Review edits are not overwritten', titles(db.songs) === 'Edited in Review')
    check('no writes at all', db.ops.join(',') === 'read')
  }
  {
    // Finished by someone else between the checks and the status update.
    let fake: ReturnType<typeof fakeDb>
    fake = fakeDb({ id: P, status: 'live' }, saved, { onBeforeUpdate: () => { fake.db.perf.status = 'review' } })
    const r = await finalizeLiveCapture(fake.client, args)
    check('lost race is ok, not a second finish', r.ok && !r.transitioned)
  }
  {
    // A show that can't be read (deleted, or not visible to this account).
    const { db, client } = fakeDb({ id: P, status: 'live' }, saved)
    const r = await finalizeLiveCapture(client, { ...args, performanceId: 'other' })
    check('unreadable show is a failure, and nothing is written', !r.ok && r.step === 'read' && db.ops.join(',') === 'read')
  }

  console.log('Empty final list')
  {
    const { db, client } = fakeDb({ id: P, status: 'live' }, saved)
    const r = await finalizeLiveCapture(client, { ...args, rows: [] })
    check('every song deleted on stage: finishes with none saved', r.ok && db.songs.length === 0 && db.perf.status === 'review')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()


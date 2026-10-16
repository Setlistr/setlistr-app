// notion-sync counts a performance toward Notion's "Shows Captured" only when
// it moves INTO 'complete'. Runs the real route handler against the local
// Supabase fixture; every api.notion.com request is answered by an in-memory
// stand-in (no request leaves the machine), so repeated counting is visible.
// Webhook payloads are built from the row before/after each real update.
//
// npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-notion-sync-events.ts
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
const Module = require('module')
const ROOT = path.join(__dirname, '..')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (req: string, ...rest: any[]) {
  return origResolve.call(this, req.startsWith('@/') ? path.join(ROOT, req.slice(2)) : req, ...rest)
}
dotenv.config({ path: path.join(ROOT, '.env.local') })
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) { console.error('REFUSING: not a local Supabase'); process.exit(1) }
process.env.SUPABASE_WEBHOOK_SECRET = 'test-secret'
process.env.NOTION_API_KEY = 'not-a-real-key'

let pass = 0, fail = 0
const ok = (n: string, c: boolean, d = '') => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  FAIL', n, c ? '' : d) }

// In-memory Notion: one artist page whose counter the handler reads and writes.
const notion = { count: 0, patches: 0, creates: 0, other: 0 }
const realFetch = global.fetch
;(global as any).fetch = async (input: any, init?: any) => {
  const u = typeof input === 'string' ? input : input.url
  if (u.startsWith('https://api.notion.com/')) {
    if (u.includes('/databases/') && u.endsWith('/query')) return new Response(JSON.stringify({ results: [{ id: 'page-1', properties: { 'Shows Captured': { number: notion.count } } }] }), { status: 200 })
    if (u.includes('/pages/page-1') && init?.method === 'PATCH') { notion.patches++; notion.count = JSON.parse(init.body).properties['Shows Captured'].number; return new Response('{}', { status: 200 }) }
    if (u.endsWith('/v1/pages') && init?.method === 'POST') { notion.creates++; return new Response('{}', { status: 200 }) }
    notion.other++; return new Response('{}', { status: 200 })
  }
  if (!u.startsWith(URL_)) throw new Error('unexpected external request: ' + u)
  return realFetch(input, init)
}

;(async () => {
  const { POST } = require('../app/api/notion-sync/route')
  const { isPerformanceCompletion } = require('../lib/notion-sync-events')
  const { NextRequest } = require('next/server')
  const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const email = 'notion-sync-test@example.test'
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const old = list.users.find(u => u.email === email); if (old) { await svc.from('performances').delete().eq('user_id', old.id); await svc.auth.admin.deleteUser(old.id) }
  const { data: created, error: ue } = await svc.auth.admin.createUser({ email, password: 'Pw-notion-' + Date.now() + 'Aa1', email_confirm: true })
  if (ue) throw ue
  const uid = created.user.id
  const deliver = async (payload: any) => {
    const res = await POST(new NextRequest('http://localhost/api/notion-sync', { method: 'POST', headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return { status: res.status, body: await res.json() }
  }
  const row = async (id: string) => (await svc.from('performances').select('*').eq('id', id).single()).data
  // Apply a real update and return the webhook payload Supabase would send.
  const update = async (id: string, patch: Record<string, any>) => {
    const before = await row(id)
    const { error } = await svc.from('performances').update(patch).eq('id', id); if (error) throw error
    return { type: 'UPDATE', table: 'performances', schema: 'public', record: await row(id), old_record: before }
  }
  const legacy = (p: any) => p.table === 'performances' && p.type === 'UPDATE' && p.record?.status === 'complete'   // the previous rule

  try {
    const { data: perf, error } = await svc.from('performances').insert({ user_id: uid, artist_name: 'Test', venue_name: 'Room', city: 'Toronto', country: 'Canada', status: 'review', data_source: 'captured', started_at: new Date().toISOString(), performance_date: new Date().toISOString().slice(0, 10) }).select('id').single()
    if (error) throw error
    const steps: [string, any, number][] = []
    const completion = await update(perf.id, { status: 'complete' })
    steps.push(['completion (review → complete)', completion, 1])
    steps.push(['duplicate delivery of the same completion event', completion, 1])
    steps.push(['re-save of a complete show', await update(perf.id, { status: 'complete' }), 0])
    steps.push(['submission', await update(perf.id, { submission_status: 'submitted' }), 0])
    const before = await row(perf.id)
    steps.push(['photo update', { type: 'UPDATE', table: 'performances', record: { ...before, photo_url: 'https://example.test/p.jpg' }, old_record: before }, 0])  // photo_url is not in the local schema
    steps.push(['delete', await update(perf.id, { deleted_at: new Date().toISOString() }), 0])
    steps.push(['undo delete', await update(perf.id, { deleted_at: null }), 0])
    steps.push(['missing old_record', { ...completion, old_record: undefined }, 0])
    steps.push(['old_record without status (only changed columns sent)', { ...completion, old_record: { id: perf.id } }, 0])

    let expected = 0
    for (const [label, payload, adds] of steps) {
      const beforeCount = notion.count
      const r = await deliver(payload)
      const added = notion.count - beforeCount
      expected += adds
      const tag = label.startsWith('duplicate') ? 'UNRESOLVED (webhook idempotency): ' : ''
      ok(`${tag}${label}: adds ${adds} (added ${added}; previous rule would add ${legacy(payload) ? 1 : 0})`, added === adds && r.status === 200, JSON.stringify(r))
    }
    ok(`counter after the whole sequence = ${expected} (was ${notion.count}) — a duplicate delivery is still counted twice`, notion.count === expected)
    ok('predicate: completion yes; same status / other table / INSERT no', isPerformanceCompletion(completion) && !isPerformanceCompletion({ ...completion, old_record: { status: 'complete' } }) && !isPerformanceCompletion({ ...completion, table: 'shows' }) && !isPerformanceCompletion({ ...completion, type: 'INSERT', old_record: null }))

    // Unchanged behaviour: an imported show arrives as an INSERT and is not counted;
    // a new profile still creates its Notion page.
    const c0 = notion.count, p0 = notion.creates
    const imp = await deliver({ type: 'INSERT', table: 'performances', record: { ...(await row(perf.id)), status: 'complete', data_source: 'setlistfm_imported' }, old_record: null })
    ok('INSERT of an imported complete show: skipped, as before', imp.body.skipped === true && notion.count === c0)
    const prof = await deliver({ type: 'INSERT', table: 'profiles', record: { id: uid, full_name: 'Test', email, created_at: new Date().toISOString() }, old_record: null })
    ok('INSERT of a profile: Notion page created, as before', prof.status === 200 && notion.creates === p0 + 1)
    ok('no unrecognised Notion requests', notion.other === 0)
  } finally {
    await svc.from('performances').delete().eq('user_id', uid)
    await svc.auth.admin.deleteUser(uid)
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(1) })

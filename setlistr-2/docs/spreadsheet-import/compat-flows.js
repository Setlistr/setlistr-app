// Capture/upload/live/review flows of the DEPLOYED app against the disposable stack. DISPOSABLE ONLY.
// node compat-flows.js <base> <outdir> <label>
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, OUT, LABEL] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true })
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING'); process.exit(1) }
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
let pass = 0, fail = 0
const ok = (n, c, g) => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  FAIL', n, c ? '' : JSON.stringify(g ?? '').slice(0, 400)) }
const A = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
const snap = () => { const [us, usp, notion, det] = SQL(`select (select count(*) from user_songs where user_id = '${A}') || '|' || (select count(*) from user_song_performances where user_id = '${A}') || '|' || ((select count(*) from net.http_request_queue) + (select count(*) from net._http_response)) || '|' || (select count(*) from detection_events)`).split('|').map(Number); return { us, usp, notion, det } }
const delta = (a, b) => ({ user_songs: b.us - a.us, user_song_performances: b.usp - a.usp, notion_requests: b.notion - a.notion, detection_events: b.det - a.det })
const row = id => JSON.parse(SQL(`select json_build_object('perf_status', p.status, 'show_id', p.show_id, 'show_status', s.status, 'show_import_fields', (s.local_date is not null or s.import_batch_id is not null), 'ended', p.ended_at is not null, 'songs', (select coalesce(json_agg(title order by position), '[]') from performance_songs where performance_id = p.id)) from performances p left join shows s on s.id = p.show_id where p.id = '${id}'`.replace('(s.local_date is not null or s.import_batch_id is not null)', process.env.HAS0028 === '1' ? '(s.local_date is not null or s.import_batch_id is not null)' : 'false')))
const wav = () => { const sr = 8000, n = sr * 2, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(3000 * Math.sin(i / 10)), 44 + i * 2); return b }
const summary = {}
;(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] })
  const pg = await ctx.newPage(); const errors = []
  pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.accept())
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|getwarmly|CORS|reb2b|licdn|contentsquare|googletagmanager|mapbox/.test(m.text())) errors.push(m.text().slice(0, 300)) })
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', 'pp-imp@example.test'); await pg.fill('#auth-password', 'Pw-pp-imp-Aa1x9'); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 60000 })

  console.log('— 1. New show → start capture (UI)')
  let s0 = snap()
  await pg.goto(BASE + '/app/show/new'); await pg.waitForTimeout(2000)
  await pg.getByText('Start Live Capture').click(); await pg.waitForTimeout(1200)
  await pg.fill('input[placeholder="Venue or room name..."]', `Compat Room ${LABEL} ${Date.now().toString(36)}`); await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: '+ more options' }).click(); await pg.waitForTimeout(400)
  await pg.fill('input[placeholder="City..."]', 'Toronto'); await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: 'NEXT' }).click(); await pg.waitForTimeout(1200)
  await pg.getByRole('button', { name: 'SKIP FOR NOW' }).click(); await pg.waitForTimeout(800)
  await pg.getByRole('button', { name: 'Skip anyway' }).click()
  await pg.waitForURL(u => u.pathname.startsWith('/app/live/'), { timeout: 30000 })
  const perf1 = pg.url().split('/app/live/')[1].split('?')[0]
  await pg.waitForTimeout(4000)
  let r = row(perf1)
  ok('show and performance created and linked; both live; no import fields', r.perf_status === 'live' && r.show_id && r.show_status === 'live' && !r.show_import_fields, r)
  summary.start = { ...r, show_id: !!r.show_id, ...delta(s0, snap()) }

  console.log('— 3. Live capture → end show (UI, fake microphone, stubbed recognition)')
  await pg.waitForTimeout(8000)                                   // let a few audio chunks reach /api/identify (stub)
  for (const t of ['Compat Opener', 'Compat Closer']) {
    if (!(await pg.locator('input[placeholder="Search or type a song title..."]').count())) { await pg.locator('button', { hasText: 'Add a song' }).first().click({ timeout: 10000 }); await pg.waitForTimeout(300) }
    await pg.fill('input[placeholder="Search or type a song title..."]', t); await pg.press('input[placeholder="Search or type a song title..."]', 'Enter'); await pg.waitForTimeout(500)
  }
  await pg.screenshot({ path: path.join(OUT, `live-${LABEL}.png`) })
  s0 = snap()
  await pg.locator('button', { hasText: /End Show/i }).last().click()
  await pg.waitForURL(u => u.pathname.startsWith('/app/review/'), { timeout: 60000 }); await pg.waitForTimeout(3000)
  r = row(perf1)
  ok('end show: performance review, ended; show completed; songs kept', r.perf_status === 'review' && r.ended && r.show_status === 'completed' && r.songs.includes('Compat Opener') && r.songs.includes('Compat Closer'), r)
  summary.end = { ...r, show_id: !!r.show_id, ...delta(s0, snap()) }

  console.log('— 4a. Review → Save & Complete (UI)')
  s0 = snap()
  const before = r.songs
  await pg.getByRole('button', { name: /Save & Complete/ }).click(); await pg.waitForTimeout(6000)
  r = row(perf1)
  const d = delta(s0, snap())
  ok('complete: performance complete, show completed, same songs', r.perf_status === 'complete' && r.show_status === 'completed' && JSON.stringify(r.songs) === JSON.stringify(before), { r, before })
  ok('catalogue recorded once per song (user_song_performances = songs)', d.user_song_performances === before.length, d)
  summary.complete = { ...r, show_id: !!r.show_id, ...d }

  console.log('— 2. Recording upload → saved performance (the upload page’s route sequence)')
  const ck = (await ctx.cookies()).filter(c => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map(c => c.value).join('')
  const token = JSON.parse(Buffer.from(ck.replace(/^base64-/, ''), 'base64').toString()).access_token
  s0 = snap()
  const cr = await ctx.request.post(BASE + '/api/upload-performance', { data: { targetUserId: A } })
  const { performance_id: perf2 } = await cr.json()
  ok('upload: created (performance draft, show completed, linked)', cr.ok() && row(perf2).perf_status === 'draft' && row(perf2).show_status === 'completed', row(perf2))
  const results = []
  for (let i = 0; i < 6; i++) {
    const rr = await ctx.request.post(BASE + '/api/upload-recognize', { headers: { Authorization: `Bearer ${token}` }, multipart: { audio: { name: 'sample.wav', mimeType: 'audio/wav', buffer: wav() }, performance_id: perf2, chunk_index: String(i) } })
    const j = await rr.json(); if (i === 0) console.log('   · recognize[0]:', rr.status(), JSON.stringify(j).slice(0, 500)); if (rr.ok() && !j.error) results.push(j)
  }
  const rec = await ctx.request.post(BASE + '/api/upload-reconcile', { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, data: { performance_id: perf2, results } })
  const recJ = await rec.json(); console.log('   · reconcile:', rec.status(), JSON.stringify(recJ).slice(0, 400)); const songs = recJ.songs || []
  ok('upload: recognition (stubbed) and reconciliation produce songs', results.length === 6 && songs.length > 0, { results: results.length, songs: songs.length })
  const fin = await ctx.request.patch(BASE + '/api/upload-performance', { data: { performance_id: perf2, venue_name: `Compat Upload ${LABEL} ${Date.now().toString(36)}`, venue_city: 'Toronto', performance_date: new Date(Date.now() - 86400000).toISOString(), start_time: '20:00', show_type: 'single', songs, setlist_photo_url: null } })
  r = row(perf2)
  ok('upload saved: performance review, show completed and linked, songs saved', fin.ok() && r.perf_status === 'review' && r.show_status === 'completed' && r.songs.length === songs.length, { status: fin.status(), r })
  summary.upload = { ...r, show_id: !!r.show_id, ...delta(s0, snap()) }

  console.log('— 4b. Review the upload → Save & Complete (UI)')
  s0 = snap()
  await pg.goto(`${BASE}/app/review/${perf2}?source=upload`); await pg.waitForTimeout(3500)
  const before2 = row(perf2).songs
  await pg.getByRole('button', { name: /Save & Complete/ }).click(); await pg.waitForTimeout(6000)
  r = row(perf2); const d2 = delta(s0, snap())
  // Uploads record the catalogue during reconciliation; completion must not add it again.
  ok('upload complete: performance complete, show completed, same songs; catalogue once per song across the upload', r.perf_status === 'complete' && r.show_status === 'completed' && JSON.stringify(r.songs) === JSON.stringify(before2) && summary.upload.user_song_performances + d2.user_song_performances === before2.length, { r, d2, upload: summary.upload })
  summary.upload_complete = { ...r, show_id: !!r.show_id, ...d2 }

  ok('no page errors', errors.length === 0, errors)
  fs.writeFileSync(path.join(OUT, `summary-${LABEL}.json`), JSON.stringify(summary, null, 1))
  await pg.screenshot({ path: path.join(OUT, `last-${LABEL}.png`) })
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })

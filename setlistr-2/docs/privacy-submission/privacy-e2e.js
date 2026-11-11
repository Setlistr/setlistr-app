// Privacy candidate: AI permission for setlist photos + account deletion. DISPOSABLE stack only; storage, Resend
// and Anthropic are local stubs (no external calls). Prints no keys or tokens.
// node privacy-e2e.js <base> <app.env> <stub-dir> [only=C,D]
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, ENVF, DIR, ONLY] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING base'); process.exit(1) }
const REPO = '/Users/jesseslack/setlistr-release/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621$/.test(env.NEXT_PUBLIC_SUPABASE_URL)) { console.error('REFUSING: not the disposable stack'); process.exit(1) }
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
const FIXTURE = q => SQL(`begin; set local session_replication_role = replica; ${q} commit;`)
const one = q => FIXTURE(q).split('\n').find(l => /^[0-9a-f-]{36}$/.test(l))
const admin = createClient(SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const want = s => !ONLY || ONLY.split(',').includes(s)
let pass = 0, fail = 0
const check = (sec, name, got, expect, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} [${sec}] ${name} → ${got}${ok ? '' : `   (expected ${expect})`}`) }
const T0 = Date.now().toString(36), PW = 'Pw-privacy-Aa1x9'
const STATE = path.join(DIR, 'svc-state.json'), LOG = path.join(DIR, 'svc.log')
const state = () => JSON.parse(fs.readFileSync(STATE, 'utf8'))
const setState = patch => fs.writeFileSync(STATE, JSON.stringify({ ...state(), ...patch }, null, 1))
const logLines = () => fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const count = svc => logLines().filter(e => e.svc === svc).length

async function person(label, artist) {
  const email = `privacy-${label}-${T0}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error
  const id = data.user.id
  SQL(`insert into profiles (id, email, full_name, artist_name, role) values ('${id}', '${email}', '${label} person', ${artist ? `'${artist}'` : 'null'}, 'artist') on conflict (id) do update set artist_name = excluded.artist_name, full_name = excluded.full_name`)
  SQL(`insert into beta_invites (email) values ('${email}')`)
  return { id, email, artist, name: `${label} person` }
}
let browser
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pg = await ctx.newPage()
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', who.email); await pg.fill('#auth-password', PW); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 120000 })
  return { ctx, pg }
}
const DIALOG = 'Send this setlist to AI to read it?'
async function upload(pg, selector, file, { decide = null } = {}) {
  const reqs = [], statuses = []
  const onReq = r => { if (r.url().includes('/api/parse-setlist')) reqs.push(1) }
  const onRes = r => { if (r.url().includes('/api/parse-setlist')) statuses.push(r.status()) }
  pg.on('request', onReq); pg.on('response', onRes)
  await pg.locator(selector).first().setInputFiles(file)
  const dialog = pg.getByText(DIALOG)
  const shown = await dialog.waitFor({ timeout: 4000 }).then(() => true, () => false)
  if (shown && decide === 'allow') await pg.getByRole('button', { name: 'Allow', exact: true }).click()
  if (shown && decide === 'decline') await pg.getByRole('button', { name: /Not now/ }).click()
  await sleep(3500)
  pg.off('request', onReq); pg.off('response', onRes)
  // The server refuses an image without the permission flag (403, see C1), so 200 for an image means it was sent.
  return { shown, requests: reqs.length, withConsent: statuses.length > 0 && statuses.every(x => x === 200), dialogGone: !(await dialog.isVisible().catch(() => false)) }
}

;(async () => {
  browser = await chromium.launch()
  const JPG = path.join(DIR, 'setlist.jpg'), TXT = path.join(DIR, 'setlist.txt')
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).jpeg().toFile(JPG)
  fs.writeFileSync(TXT, '1. Alpha Song\n2. Bravo Song\n')

  if (want('C')) {
    console.log('— C. AI permission for setlist photos and PDFs')
    const C = await person('consent', `Consent Artist ${T0}`)
    const s = await session(C)
    const api = async (file, type, withField) => {
      const fields = { file: { name: path.basename(file), mimeType: type, buffer: fs.readFileSync(file) } }
      if (withField) fields.ai_consent = 'granted'
      const r = await s.ctx.request.post(BASE + '/api/parse-setlist', { multipart: fields, failOnStatusCode: false })
      let j = null; try { j = await r.json() } catch {}
      return { status: r.status(), j }
    }
    let a0 = count('anthropic'), u0 = logLines().filter(e => e.op === 'upload').length
    let r = await api(JPG, 'image/jpeg', false)
    check('C1', 'photo without permission is refused by the server', `${r.status} ${r.j && r.j.code}`, '403 ai_consent_required', r.status === 403 && r.j.code === 'ai_consent_required')
    check('C1', 'nothing sent to Anthropic or stored', `anthropic +${count('anthropic') - a0}, uploads +${logLines().filter(e => e.op === 'upload').length - u0}`, '+0, +0', count('anthropic') === a0 && logLines().filter(e => e.op === 'upload').length === u0)
    r = await api(TXT, 'text/plain', false)
    check('C2', 'typed (.txt) setlist needs no permission and never reaches Anthropic', `${r.status} songs=${r.j && r.j.count} anthropic +${count('anthropic') - a0}`, '200 songs=2 +0', r.status === 200 && r.j.count === 2 && count('anthropic') === a0)
    r = await api(JPG, 'image/jpeg', true)
    check('C3', 'photo with permission is read (stubbed Anthropic)', `${r.status} songs=${r.j && r.j.count} anthropic +${count('anthropic') - a0}`, '200 songs=2 +1', r.status === 200 && r.j.count === 2 && count('anthropic') === a0 + 1)

    // New Show (main entry point)
    await s.pg.goto(BASE + '/app/show/new', { waitUntil: 'domcontentloaded' }); await sleep(3000)
    a0 = count('anthropic')
    let u = await upload(s.pg, 'input[capture="environment"]', JPG, { decide: 'decline' })
    check('C4', 'New Show: camera photo asks first; declining sends nothing', `asked=${u.shown} requests=${u.requests} closed=${u.dialogGone}`, 'asked=true requests=0 closed=true', u.shown && u.requests === 0 && u.dialogGone && count('anthropic') === a0)
    u = await upload(s.pg, 'input[type=file][accept*="application/pdf"]', TXT)
    check('C4', 'New Show: .txt from the file picker is not asked about', `asked=${u.shown} requests=${u.requests}`, 'asked=false requests=1', !u.shown && u.requests === 1)
    u = await upload(s.pg, 'input[type=file][accept*="application/pdf"]', JPG, { decide: 'allow' })
    check('C5', 'New Show: library photo asks; Allow sends it with the permission flag', `asked=${u.shown} requests=${u.requests} flag=${u.withConsent} anthropic +${count('anthropic') - a0}`, 'asked=true requests=1 flag=true +1', u.shown && u.requests === 1 && u.withConsent && count('anthropic') === a0 + 1)
    u = await upload(s.pg, 'input[capture="environment"]', JPG)
    check('C5', 'New Show: permission is remembered on this device', `asked=${u.shown} requests=${u.requests} flag=${u.withConsent}`, 'asked=false requests=1 flag=true', !u.shown && u.requests === 1 && u.withConsent)

    // Settings: withdraw
    await s.pg.goto(BASE + '/app/settings', { waitUntil: 'domcontentloaded' }); await sleep(3500)
    const allowedShown = await s.pg.getByText('Allowed on this device').isVisible().catch(() => false)
    await s.pg.getByRole('button', { name: 'Withdraw permission' }).click(); await sleep(500)
    const withdrawn = await s.pg.getByText(/Withdrawn\. You.ll be asked again/).isVisible().catch(() => false)
    const stored = await s.pg.evaluate(id => localStorage.getItem(`setlistr_ai_setlist_consent:${id}`), C.id)
    check('C6', 'Settings shows the permission and withdraws it', `shown=${allowedShown} withdrawn=${withdrawn} stored=${stored}`, 'shown=true withdrawn=true stored=null', allowedShown && withdrawn && stored === null)

    // Legacy New page and Upload page
    await s.pg.goto(BASE + '/app/new', { waitUntil: 'domcontentloaded' }); await sleep(3000)
    a0 = count('anthropic')
    u = await upload(s.pg, 'input[capture="environment"]', JPG, { decide: 'decline' })
    check('C7', 'legacy New: asks again after withdrawal; declining sends nothing', `asked=${u.shown} requests=${u.requests}`, 'asked=true requests=0', u.shown && u.requests === 0 && count('anthropic') === a0)
    const quick = await s.pg.getByPlaceholder('Search your songs...').isVisible().catch(() => false)
    check('C7', 'legacy New: manual entry opens after declining', quick, true, quick)
    await s.pg.goto(BASE + '/app/upload/new', { waitUntil: 'domcontentloaded' }); await sleep(3000)
    u = await upload(s.pg, 'input[capture="environment"]', JPG, { decide: 'allow' })
    check('C8', 'Upload: setlist photo asks; Allow sends it with the flag', `asked=${u.shown} requests=${u.requests} flag=${u.withConsent}`, 'asked=true requests=1 flag=true', u.shown && u.requests === 1 && u.withConsent)
    await s.ctx.close()
  }

  if (want('D')) {
    console.log('— D. Account deletion: files, ownership boundaries, honest failures, records')
    const A = await person('deleted', `Deletion Artist ${T0}`), B = await person('other', `Other Artist ${T0}`), M = await person('manager', null)
    SQL(`insert into artist_delegates (artist_id, delegate_id, role, invited_by, invited_email, accepted_at) values ('${B.id}', '${A.id}', 'manager', '${B.id}', '${A.email}', now()), ('${A.id}', '${M.id}', 'manager', '${A.id}', '${M.email}', now())`)
    const pub = p => `${SB}/storage/v1/object/public/performance-photos/${p}`
    const IB1 = one(`insert into show_import_batches (id, artist_id, imported_by, file_name, file_sha256, date_order, row_count, imported_count, request_hash) values (gen_random_uuid(), '${A.id}', '${A.id}', 'a.csv', repeat('a', 64), 'MDY', 1, 1, 'h1') returning id;`)
    const IB2 = one(`insert into show_import_batches (id, artist_id, imported_by, undone_by, file_name, file_sha256, date_order, row_count, imported_count, request_hash) values (gen_random_uuid(), '${B.id}', '${A.id}', '${A.id}', 'b.csv', repeat('b', 64), 'MDY', 1, 1, 'h2') returning id;`)
    const S1 = one(`insert into shows (name, status, created_by, scheduled_by, scheduled_by_name, import_batch_id, source_row) values ('A show', 'completed', '${A.id}', '${A.id}', '${A.name}', '${IB1}', 2) returning id;`)
    const S2 = one(`insert into shows (name, status, created_by, scheduled_by, scheduled_by_name, import_batch_id, source_row) values ('B show', 'completed', '${B.id}', '${B.id}', '${B.name}', '${IB2}', 2) returning id;`)
    const P1 = one(`insert into performances (user_id, artist_id, show_id, artist_name, venue_name, status, recording_path, setlist_path, setlist_photo_url) values ('${A.id}', '${A.id}', '${S1}', '${A.artist}', 'A Hall', 'review', '${A.id}/r1.m4a', '${M.id}/s1.pdf', '${pub(`setlists/${A.id}/p1.jpg`)}') returning id;`)
    FIXTURE(`update performances set photo_url = '${pub(`${P1}.jpg`)}' where id = '${P1}';`)
    const P2 = one(`insert into performances (user_id, artist_id, show_id, artist_name, venue_name, status, recording_path, setlist_photo_url, captured_by, captured_by_name, started_by) values ('${B.id}', '${B.id}', '${S2}', '${B.artist}', 'B Hall', 'review', '${A.id}/b-rec.m4a', '${pub(`setlists/${A.id}/b-photo.jpg`)}', '${A.id}', '${A.name}', '${A.id}') returning id;`)
    const capA = one(`insert into audio_captures (show_id, artist_id, duration_seconds, file_size_bytes, mime_type) values ('${S1}', '${A.id}', 14, 100, 'audio/webm') returning id;`)
    const capB = one(`insert into audio_captures (show_id, artist_id, duration_seconds, file_size_bytes, mime_type) values ('${S2}', '${B.id}', 14, 100, 'audio/webm') returning id;`)
    const jobA = one(`insert into recognition_jobs (audio_capture_id, vendor, status, raw_request) values ('${capA}', 'acrcloud', 'completed', '{"performance_id":"${P1}"}') returning id;`)
    const jobA2 = one(`insert into recognition_jobs (audio_capture_id, vendor, status, raw_request) values (null, 'acrcloud', 'completed', '{"performance_id":"${P1}"}') returning id;`)
    const jobB = one(`insert into recognition_jobs (audio_capture_id, vendor, status, raw_request) values ('${capB}', 'acrcloud', 'completed', '{"performance_id":"${P2}"}') returning id;`)
    FIXTURE(`insert into recognition_results (job_id, rank, title) values ('${jobA}', 1, 'x'), ('${jobA2}', 1, 'x'), ('${jobB}', 1, 'y');
      insert into recognition_logs (performance_id, user_agent, title) values ('${P1}', 'UA-A', 'x'), ('${P2}', 'UA-B', 'y');
      insert into product_events (event_name, user_id, performance_id) values ('show_created', '${A.id}', '${P1}'), ('review_opened', '${A.id}', null), ('capture_started', '${M.id}', '${P1}'), ('show_created', '${B.id}', '${P2}');`)
    const A_FILES = [`show-recordings/${A.id}/r1.m4a`, `show-recordings/${M.id}/s1.pdf`, `performance-photos/setlists/${A.id}/p1.jpg`, `performance-photos/${P1}.jpg`, `performance-photos/setlists/${A.id}/orphan.jpg`, `avatars/${A.id}/avatar.png`]
    const B_FILES = [`show-recordings/${A.id}/b-rec.m4a`, `performance-photos/setlists/${A.id}/b-photo.jpg`, `show-recordings/${B.id}/own.m4a`]
    const objects = {}; for (const k of [...A_FILES, ...B_FILES]) objects[k] = { size: 1 }
    fs.writeFileSync(STATE, JSON.stringify({ objects }, null, 1))
    const present = keys => keys.filter(k => state().objects[k]).length
    const n = q => Number(SQL(q))
    const aRecords = () => `perf=${n(`select count(*) from performances where user_id='${A.id}'`)} profile=${n(`select count(*) from profiles where id='${A.id}'`)} events=${n(`select count(*) from product_events where user_id='${A.id}'`)}`

    {
      const A2 = await person('scheduler', `Scheduler ${T0}`)
      FIXTURE(`insert into shows (name, status, created_by, scheduled_by, scheduled_by_name) values ('B booking by member', 'completed', '${B.id}', '${A2.id}', '${A2.name}');`)
      const o = { [`avatars/${A2.id}/avatar.png`]: { size: 1 } }; setState({ objects: { ...state().objects, ...o } })
      const s0 = await session(A2)
      const r0 = await s0.ctx.request.post(BASE + '/api/account/delete', { failOnStatusCode: false }); let j0 = {}; try { j0 = await r0.json() } catch {}
      check('D0', 'member named on another artist\'s booking: routed to support before anything is removed', `${r0.status()} ${j0.code} profile=${n(`select count(*) from profiles where id='${A2.id}'`)} avatar=${!!state().objects[`avatars/${A2.id}/avatar.png`]}`, '409 needs_support profile=1 avatar=true',
        r0.status() === 409 && j0.code === 'needs_support' && n(`select count(*) from profiles where id='${A2.id}'`) === 1 && !!state().objects[`avatars/${A2.id}/avatar.png`])
      await s0.ctx.close()
    }
    const s = await session(A)
    const del = async () => { const r = await s.ctx.request.post(BASE + '/api/account/delete', { failOnStatusCode: false }); let j = {}; try { j = await r.json() } catch {} return { status: r.status(), j } }

    // D1: a file can't be removed → nothing else removed; message shown in Settings
    setState({ failRemove: [`show-recordings/${A.id}/r1.m4a`] })
    let e0 = count('resend')
    await s.pg.goto(BASE + '/app/settings', { waitUntil: 'domcontentloaded' }); await sleep(3000)
    await s.pg.getByPlaceholder('DELETE').fill('DELETE'); await s.pg.getByRole('button', { name: /Permanently Delete Account/ }).click(); await sleep(5000)
    const msg = await s.pg.getByText(/couldn.t delete all of your files/).isVisible().catch(() => false)
    check('D1', 'remove failure: Settings says files weren\'t all deleted and the account wasn\'t', msg, true, msg)
    check('D1', 'remove failure: account records untouched; no Notion request', `${aRecords()} emails+${count('resend') - e0}`, 'perf=1 profile=1 events=2 emails+0', aRecords() === 'perf=1 profile=1 events=2' && count('resend') === e0)

    // D2: removal "succeeds" but a file is still there → caught by verification
    setState({ failRemove: [], keepAfterRemove: [`performance-photos/setlists/${A.id}/orphan.jpg`] })
    let r = await del()
    check('D2', 'file still present after removal is caught', `${r.status} ${r.j.code}`, '500 files_not_deleted', r.status === 500 && r.j.code === 'files_not_deleted')
    check('D2', 'account records untouched', aRecords(), 'perf=1 profile=1 events=2', aRecords() === 'perf=1 profile=1 events=2')

    // D3: files go, but the internal Notion request can't be sent → stops before any record is deleted
    setState({ keepAfterRemove: [], resendFail: true })
    r = await del()
    check('D3', 'Notion request failure: honest message', `${r.status} ${r.j.code} "${(r.j.error || '').slice(0, 45)}…"`, '500 deletion_incomplete "Your uploaded files were deleted…"', r.status === 500 && r.j.code === 'deletion_incomplete' && /files were deleted/.test(r.j.error))
    check('D3', 'all of the account\'s files are gone (incl. a team member\'s upload for it and an orphan)', `${A_FILES.length - present(A_FILES)}/${A_FILES.length} removed`, `${A_FILES.length}/${A_FILES.length}`, present(A_FILES) === 0)
    check('D3', 'other artist\'s files kept, even in the deleted account\'s folders', `${present(B_FILES)}/${B_FILES.length} kept`, `${B_FILES.length}/${B_FILES.length}`, present(B_FILES) === B_FILES.length)
    check('D3', 'account records still intact', aRecords(), 'perf=1 profile=1 events=2', aRecords() === 'perf=1 profile=1 events=2')

    // D4: retry succeeds
    setState({ resendFail: false }); e0 = count('resend')
    r = await del()
    check('D4', 'retry completes', `${r.status} ${JSON.stringify(r.j)}`, '200 {"success":true}', r.status === 200 && r.j.success === true)
    const mail = logLines().filter(e => e.svc === 'resend' && e.ok).slice(-1)[0] || {}
    check('D4', 'one internal Notion removal request, with name, email and sign-up date', `emails+${count('resend') - e0} to=${mail.to} name=${(mail.text || '').includes(A.name)} email=${(mail.text || '').includes(A.email)}`, 'emails+1 to=info@setlistr.ai name=true email=true', count('resend') === e0 + 1 && mail.to === 'info@setlistr.ai' && mail.text.includes(A.name) && mail.text.includes(A.email))
    const gone = {
      auth: n(`select count(*) from auth.users where id='${A.id}'`), profile: n(`select count(*) from profiles where id='${A.id}'`),
      perfs: n(`select count(*) from performances where user_id='${A.id}'`), shows: n(`select count(*) from shows where created_by='${A.id}'`),
      batches: n(`select count(*) from show_import_batches where artist_id='${A.id}'`), events: n(`select count(*) from product_events where user_id='${A.id}' or performance_id='${P1}'`),
      logs: n(`select count(*) from recognition_logs where performance_id='${P1}'`), jobs: n(`select count(*) from recognition_jobs where id in ('${jobA}','${jobA2}')`),
      results: n(`select count(*) from recognition_results where job_id in ('${jobA}','${jobA2}')`), captures: n(`select count(*) from audio_captures where id='${capA}'`),
      invite: n(`select count(*) from beta_invites where email='${A.email}'`),
    }
    check('D4', 'deleted: sign-in, profile, shows, bookings, imports, usage events, recognition logs/jobs/results/captures, invitation', JSON.stringify(gone), 'all 0', Object.values(gone).every(v => v === 0))
    const p2 = SQL(`select coalesce(captured_by::text,'∅')||'|'||coalesce(captured_by_name,'∅')||'|'||coalesce(started_by::text,'∅') from performances where id='${P2}'`)
    const s2 = SQL(`select (scheduled_by='${B.id}')::text||'|'||coalesce(scheduled_by_name,'∅') from shows where id='${S2}'`)
    const ib2 = SQL(`select (imported_by='${B.id}')::text||'|'||coalesce(undone_by::text,'∅') from show_import_batches where id='${IB2}'`)
    check('D4', 'other artist\'s show kept, deleted member anonymised', `perf ${p2} · booking ${s2} · import ${ib2}`, `perf ∅|Former team member|∅ · booking true|${B.name} · import true|∅`,
      p2 === '∅|Former team member|∅' && s2 === `true|${B.name}` && ib2 === 'true|∅')
    const keptB = `perf=${n(`select count(*) from performances where id='${P2}'`)} log=${n(`select count(*) from recognition_logs where performance_id='${P2}'`)} job=${n(`select count(*) from recognition_jobs where id='${jobB}'`)} capture=${n(`select count(*) from audio_captures where id='${capB}'`)} event=${n(`select count(*) from product_events where user_id='${B.id}'`)} files=${present(B_FILES)}`
    check('D4', 'other artist\'s records untouched', keptB, 'perf=1 log=1 job=1 capture=1 event=1 files=3', keptB === 'perf=1 log=1 job=1 capture=1 event=1 files=3')
    const anon = createClient(SB, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { error: signInErr } = await anon.auth.signInWithPassword({ email: A.email, password: PW })
    check('D4', 'deleted account can no longer sign in', signInErr ? 'refused' : 'allowed', 'refused', !!signInErr)
    await s.ctx.close()
  }

  const ext = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).svc)
  console.log(`\nstubbed service calls: ${ext.length} (${[...new Set(ext)].join(', ')}); real external calls: 0 by construction`)
  console.log(`${pass} passed, ${fail} failed`)
  await browser.close(); process.exit(fail ? 1 : 0)
})().catch(async e => { console.error('ERROR', String(e && e.stack || e).slice(0, 900)); try { await browser.close() } catch {} process.exit(2) })

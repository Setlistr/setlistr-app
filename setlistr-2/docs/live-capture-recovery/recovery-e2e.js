// Live capture persistence/recovery on the DISPOSABLE stack only. Recognition is answered by
// scripts/acr-stub-preload.js (no external calls). Prints no keys or tokens.
// node recovery-e2e.js <base> <app.env> <stub-state.json> [only=S1,S2,...]
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, ENVF, STATE, ONLY] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING base'); process.exit(1) }
const REPO = '/Users/jesseslack/setlistr-live-recovery/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621$/.test(env.NEXT_PUBLIC_SUPABASE_URL)) { console.error('REFUSING: not the disposable stack'); process.exit(1) }
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
const FIXTURE = q => SQL(`begin; set local session_replication_role = replica; ${q} commit;`)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const want = s => !ONLY || ONLY.split(',').includes(s)
let pass = 0, fail = 0
const check = (sec, name, got, expect, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} [${sec}] ${name} → ${got}${ok ? '' : `   (expected ${expect})`}`) }
const T0 = Date.now().toString(36), PW = 'Pw-recovery-Aa1x9'
const TITLES = ['Alpha Song', 'Bravo Song', 'Charlie Song', 'Delta Song', 'Echo Song', 'Late Song']

// ── stubbed recognition: what the next ACR call answers ──
const stub = (title, artist) => fs.writeFileSync(STATE, JSON.stringify(title
  ? { response: { status: { code: 0, msg: 'Success' }, metadata: { music: [{ title, artists: [{ name: artist }], score: 100, external_ids: {} }] } } }
  : { response: { status: { code: 1001, msg: 'No result' } } }))

async function person(label, artist) {
  const email = `recovery-${label}-${T0}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error
  const id = data.user.id
  SQL(`insert into profiles (id, email, full_name, artist_name, role) values ('${id}', '${email}', '${label} ${T0}', ${artist ? `'${artist}'` : 'null'}, 'artist') on conflict (id) do update set artist_name = excluded.artist_name, full_name = excluded.full_name`)
  SQL(`insert into beta_invites (email) values ('${email}')`)
  return { id, email, artist }
}
const member = (artist, who, role) => SQL(`insert into artist_delegates (artist_id, delegate_id, role, invited_by, invited_email, accepted_at) values ('${artist.id}', '${who.id}', '${role}', '${artist.id}', '${who.email}', now())`)
const seedCatalogue = who => SQL(TITLES.map(t => `insert into user_songs (user_id, song_title, canonical_artist, confirmed_count) values ('${who.id}', '${t}', '${who.artist}', 1);`).join('\n'))
function newPerformance(who, label) {
  const show = FIXTURE(`insert into shows (name, show_type, started_at, status, created_by) values ('${label} ${T0}', 'single', now(), 'live', '${who.id}') returning id;`).split('\n').find(l => /^[0-9a-f-]{36}$/.test(l))
  return FIXTURE(`insert into performances (show_id, performance_date, artist_name, venue_name, status, started_at, user_id, artist_id) values ('${show}', now(), '${who.artist}', '${label} Hall ${T0}', 'live', now(), '${who.id}', '${who.id}') returning id;`).split('\n').find(l => /^[0-9a-f-]{36}$/.test(l))
}
const dbSongs = perf => SQL(`select coalesce(string_agg(title || ':' || source, ' | ' order by position, created_at), '') from performance_songs where performance_id = '${perf}'`)
const dbCount = (perf, title) => Number(SQL(`select count(*) from performance_songs where performance_id = '${perf}' and title = '${title}'`))
const detections = perf => Number(SQL(`select count(*) from detection_events where performance_id = '${perf}' and auto_confirmed`))
const catalogue = who => SQL(`select coalesce(string_agg(song_title || '=' || confirmed_count, ', ' order by song_title), '') from user_songs where user_id = '${who.id}'`)
const markers = who => SQL(`select count(*) from user_song_performances where user_id = '${who.id}'`)
const labels = perf => SQL(`select coalesce(string_agg(title || '=' || coalesce(inclusion_reason, '∅'), ' | ' order by position), '') from performance_songs where performance_id = '${perf}'`)

let browser
async function session(who, { actingAs = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] })
  const pg = await ctx.newPage()
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', who.email); await pg.fill('#auth-password', PW); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 120000 })
  if (actingAs) await pg.evaluate(([k, v]) => localStorage.setItem(k, v), [`setlistr_acting_as:${who.id}`, JSON.stringify({ artist_id: actingAs.id, artist_name: actingAs.artist })])
  return { ctx, pg }
}
const openLive = async (s, perf, autostart = true) => { await s.pg.goto(`${BASE}/app/live/${perf}${autostart ? '?autostart=1' : ''}`, { waitUntil: 'domcontentloaded' }); await s.pg.getByText('End Show').waitFor({ timeout: 120000 }); await sleep(2500) }
const listTitles = async pg => (await pg.locator('p').evaluateAll(ps => ps.map(p => p.textContent.trim()))).filter(t => TITLES.includes(t) || /^Manual /.test(t) || /^Edited /.test(t))
const waitTitle = (pg, t, ms = 70000) => pg.getByText(t, { exact: true }).first().waitFor({ timeout: ms }).then(() => true, () => false)
let invalid = 0
async function detect(pg, title, artist) { stub(title, artist); const ok = await waitTitle(pg, title); stub(null); if (!ok) { invalid++; throw new Error(`PRECONDITION: "${title}" was not recognised within 70s (capture produced no recognition); scenario invalid`) } return ok }
async function addManual(pg, title) { if (!(await pg.getByPlaceholder('Search or type a song title...').isVisible())) await pg.getByRole('button', { name: /Add a song/ }).click(); await pg.getByPlaceholder('Search or type a song title...').fill(title); await pg.keyboard.press('Enter'); await waitTitle(pg, title, 5000); await pg.getByRole('button', { name: /cancel/ }).click(); await sleep(300) }
async function editTitle(pg, from, to) { if (!(await pg.getByText(from, { exact: true }).first().isVisible().catch(() => false))) { console.log(`  note cannot edit "${from}": not on screen`); return } await pg.getByText(from, { exact: true }).first().click(); const i = pg.getByPlaceholder('Song title', { exact: true }); await i.fill(to); await pg.getByRole('button', { name: /Save/ }).click(); await waitTitle(pg, to, 5000) }
async function deleteRow(pg, title) { if (!(await pg.getByText(title, { exact: true }).first().isVisible().catch(() => false))) { console.log(`  note cannot delete "${title}": not on screen`); return } const row = pg.locator('div', { has: pg.getByText(title, { exact: true }) }).filter({ has: pg.getByRole('button', { name: '✕' }) }).last(); await row.getByRole('button', { name: '✕' }).click(); await pg.getByRole('button', { name: '✕ Delete?' }).click(); await sleep(500) }
async function end(pg, perf) { await pg.getByRole('button', { name: /End Show/ }).click(); await pg.waitForURL(u => u.pathname.startsWith(`/app/review/${perf}`), { timeout: 60000 }); await sleep(1500) }
const settleSave = () => sleep(2500)   // longer than any autosave coalescing

;(async () => {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  stub(null)
  const A = await person('artist', `Recovery Artist ${T0}`), B = await person('other', `Other Artist ${T0}`), M = await person('manager', null)
  member(A, M, 'manager'); seedCatalogue(A); seedCatalogue(B)
  const art = A.artist

  if (want('S1')) {
    console.log('— S1. Normal End (no interruption)')
    const P = newPerformance(A, 'S1'); const s = await session(A); await openLive(s, P)
    check('S1', 'recognised song appears', await detect(s.pg, 'Alpha Song', art), true, true)
    await addManual(s.pg, 'Manual One'); await settleSave()
    await end(s.pg, P)
    const got = dbSongs(P)
    check('S1', 'saved at End, once each', got, 'Alpha Song:fingerprint | Manual One:manual', got === 'Alpha Song:fingerprint | Manual One:manual')
    check('S1', 'End labels unchanged', labels(P), 'Alpha Song=artist catalogue | Manual One=added mid-show - not detected', labels(P) === 'Alpha Song=artist catalogue | Manual One=added mid-show - not detected')
    console.log(`  info [S1] catalogue after End: ${catalogue(A)}; markers=${markers(A)}`)
    await s.ctx.close()
  }

  if (want('S2')) {
    console.log('— S2. Reload mid-capture')
    const P = newPerformance(A, 'S2'); const s = await session(A); await openLive(s, P)
    await detect(s.pg, 'Alpha Song', art); await addManual(s.pg, 'Manual Two'); await editTitle(s.pg, 'Manual Two', 'Edited Two'); await settleSave()
    const det = detections(P)
    await s.pg.reload({ waitUntil: 'domcontentloaded' }); await s.pg.getByText('End Show').waitFor({ timeout: 120000 }); await sleep(3000)
    const after = await listTitles(s.pg)
    check('S2', 'server holds the recognition record', det, '≥1', det >= 1)
    check('S2', 'list after reload', after.join(', ') || '(empty)', 'Alpha Song, Edited Two', after.join(', ') === 'Alpha Song, Edited Two')
    await end(s.pg, P)
    check('S2', 'saved after End', dbSongs(P), 'Alpha Song:fingerprint | Edited Two:manual', dbSongs(P) === 'Alpha Song:fingerprint | Edited Two:manual')
    await s.ctx.close()
  }

  if (want('S3')) {
    console.log('— S3. Interruption (page closed without End), reopen, continue, repeat detection')
    const P = newPerformance(A, 'S3'); let s = await session(A); await openLive(s, P)
    await detect(s.pg, 'Alpha Song', art); console.log(`  dbg [S3] after detect: ${dbSongs(P)}`); await settleSave(); console.log(`  dbg [S3] after settle: ${dbSongs(P)} | screen: ${(await listTitles(s.pg)).join(', ')}`); await addManual(s.pg, 'Manual Three'); await settleSave(); console.log(`  dbg [S3] before close: ${dbSongs(P)} | screen: ${(await listTitles(s.pg)).join(', ')}`)
    await s.ctx.close()                                                  // like a force-quit: no End, no unload work awaited
    s = await session(A); await openLive(s, P, false)
    const restored = await listTitles(s.pg)
    check('S3', 'list after reopen', restored.join(', ') || '(empty)', 'Alpha Song, Manual Three', restored.join(', ') === 'Alpha Song, Manual Three')
    await s.pg.getByRole('button', { name: /resume|tap to start/i }).click()
    check('S3', 'new recognition after reopen', await detect(s.pg, 'Bravo Song', art), true, true)
    stub('Alpha Song', art); await sleep(25000); stub(null)            // Alpha heard again after recovery
    await settleSave()
    const visible = (await listTitles(s.pg)).filter(t => t === 'Alpha Song').length
    check('S3', 'repeat of a restored song is not duplicated on screen', visible, 1, visible === 1)
    await end(s.pg, P)
    const got = dbSongs(P)
    check('S3', 'saved after End', got, 'Alpha Song:fingerprint | Manual Three:manual | Bravo Song:fingerprint', got === 'Alpha Song:fingerprint | Manual Three:manual | Bravo Song:fingerprint')
    await s.ctx.close()
  }

  if (want('S4')) {
    console.log('— S4. Repeated recovery with edits and deletes in between')
    const P = newPerformance(A, 'S4'); let s = await session(A); await openLive(s, P)
    await detect(s.pg, 'Charlie Song', art); await addManual(s.pg, 'Manual Four'); await addManual(s.pg, 'Manual Gone'); await settleSave()
    await s.pg.reload({ waitUntil: 'domcontentloaded' }); await s.pg.getByText('End Show').waitFor({ timeout: 120000 }); await sleep(3000)
    await deleteRow(s.pg, 'Manual Gone'); await editTitle(s.pg, 'Charlie Song', 'Edited Charlie'); await settleSave()
    await s.ctx.close(); s = await session(A); await openLive(s, P, false)
    const second = await listTitles(s.pg)
    check('S4', 'after second recovery: edit kept, delete kept', second.join(', ') || '(empty)', 'Edited Charlie, Manual Four', second.join(', ') === 'Edited Charlie, Manual Four')
    await s.pg.reload({ waitUntil: 'domcontentloaded' }); await s.pg.getByText('End Show').waitFor({ timeout: 120000 }); await sleep(3000)
    const third = await listTitles(s.pg)
    check('S4', 'after third recovery, unchanged', third.join(', ') || '(empty)', 'Edited Charlie, Manual Four', third.join(', ') === 'Edited Charlie, Manual Four')
    await end(s.pg, P)
    check('S4', 'saved after End', dbSongs(P), 'Edited Charlie:fingerprint | Manual Four:manual', dbSongs(P) === 'Edited Charlie:fingerprint | Manual Four:manual')
    await s.ctx.close()
  }

  if (want('S5')) {
    for (const variant of ['during End', 'after End']) {
      console.log(`— S5. Late recognition response (${variant})`)
      const P = newPerformance(A, `S5${variant[0]}`); const s = await session(A)
      let hold = false, held = null, release
      const gate = new Promise(r => { release = r })
      await s.pg.route('**/api/identify', async route => {
        if (!hold) return route.continue()
        hold = false; const resp = await route.fetch(); held = true; await gate; await route.fulfill({ response: resp }).catch(() => {})
      })
      await openLive(s, P)
      await detect(s.pg, 'Delta Song', art); await settleSave(); console.log(`  dbg [S5] after Delta: ${dbSongs(P)} | screen: ${(await listTitles(s.pg)).join(', ')}`)
      hold = true; stub('Late Song', art)
      for (let i = 0; i < 60 && !held; i++) await sleep(1000)       // server has answered; the page hasn't received it
      stub(null)
      check('S5', `late response held (${variant})`, !!held, true, !!held)
      const click = s.pg.getByRole('button', { name: /End Show/ }).click()
      if (variant === 'during End') { await click; release() }
      else { await click; await s.pg.waitForURL(u => u.pathname.startsWith(`/app/review/${P}`), { timeout: 60000 }); release() }
      await s.pg.waitForURL(u => u.pathname.startsWith(`/app/review/${P}`), { timeout: 60000 }); await sleep(4000)
      const got = dbSongs(P)
      check('S5', `saved record has no duplicate and no write after End (${variant})`, got, 'Delta Song:fingerprint (Late Song at most once)',
        dbCount(P, 'Delta Song') === 1 && dbCount(P, 'Late Song') <= 1 && /^Delta Song:fingerprint( \| Late Song:fingerprint)?$/.test(got))
      await sleep(3000)
      check('S5', `record stable after the late response settles (${variant})`, dbSongs(P), got, dbSongs(P) === got)
      await s.ctx.close()
    }
  }

  if (want('S6')) {
    console.log('— S6. Scope: same show for a workspace manager; nothing for another account')
    const P = newPerformance(A, 'S6'); const P2 = newPerformance(A, 'S6b'); let s = await session(A); await openLive(s, P)
    await detect(s.pg, 'Echo Song', art); await addManual(s.pg, 'Manual Six'); await settleSave(); await s.ctx.close()
    const m = await session(M, { actingAs: A }); await openLive(m, P, false)
    const seen = await listTitles(m.pg)
    check('S6', 'manager acting for the artist sees the recovered list', seen.join(', ') || '(empty)', 'Echo Song, Manual Six', seen.join(', ') === 'Echo Song, Manual Six')
    await m.ctx.close()
    check('S6', 'other show of the same artist untouched', dbSongs(P2) || '(none)', '(none)', dbSongs(P2) === '')
    const other = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    await other.auth.signInWithPassword({ email: B.email, password: PW })
    const { data: rd } = await other.from('performance_songs_visible').select('title').eq('performance_id', P)
    const { error: wr } = await other.from('performance_songs').insert({ performance_id: P, title: 'Intruder', position: 99, source: 'manual' })
    check('S6', 'another account reads none of it', (rd || []).length, 0, (rd || []).length === 0)
    check('S6', 'another account cannot write to it', wr ? 'refused' : 'allowed', 'refused', !!wr)
    const o = await session(B); await o.pg.goto(`${BASE}/app/live/${P}`, { waitUntil: 'domcontentloaded' }); await sleep(6000)
    const leak = await listTitles(o.pg)
    check('S6', 'another account opening the show sees no songs', leak.join(', ') || '(none)', '(none)', leak.length === 0)
    await o.ctx.close()
  }

  const calls = fs.readFileSync(path.join(path.dirname(STATE), 'acr-calls.log'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).hostname)
  console.log(`\nprovider calls answered by the stub: ${calls.length} (${[...new Set(calls)].join(', ') || 'none'}); real external calls: 0 by construction`)
  console.log(`${pass} passed, ${fail} failed`)
  await browser.close(); process.exit(fail ? 1 : 0)
})().catch(async e => { console.error('ERROR', String(e && e.stack || e).slice(0, 800)); try { await browser.close() } catch {} process.exit(2) })

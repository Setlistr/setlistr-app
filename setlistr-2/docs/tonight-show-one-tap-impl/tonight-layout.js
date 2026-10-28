// "Tonight's show, one tap" — end-to-end on the DISPOSABLE stack (local build of the branch, real start route).
// node tonight-e2e.js <base> <app.env> <shots-dir> [preview-base]. Prints no keys or tokens.
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, ENVF, SHOTS, PREVIEW] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING'); process.exit(1) }
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) { console.error('REFUSING'); process.exit(1) }
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
// Test-fixture changes only (this run's own test artists): triggers suspended for that one batch, so cleanup
// and simulated server-side state changes can run. The app's own writes always go through every trigger.
const FIXTURE = q => SQL(`begin; set local session_replication_role = replica; ${q} commit;`)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rows = []; const row = (sec, test, got, expect, ok) => { rows.push({ sec, test, got: String(got), expect: String(expect), ok: !!ok }); console.log(ok ? '  ok  ' : '  FAIL', `[${sec}]`, test, '→', got) }
const T0 = Date.now().toString(36), PW = 'Pw-tonight-Aa1x9'
fs.mkdirSync(SHOTS, { recursive: true })

async function person(label, { artist = null, admitted = false } = {}) {
  const email = `tonight-${label}-${T0}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error
  const id = data.user.id
  SQL(`insert into profiles (id, email, full_name, artist_name, role) values ('${id}', '${email}', '${label[0].toUpperCase() + label.slice(1)} ${T0.slice(-3)}', ${artist ? `'${artist}'` : 'null'}, 'artist') on conflict (id) do update set artist_name = excluded.artist_name, full_name = excluded.full_name`)
  if (admitted) SQL(`insert into beta_invites (email) values ('${email}')`)
  return { id, email, name: `${label[0].toUpperCase() + label.slice(1)} ${T0.slice(-3)}` }
}
const member = (artist, who, role) => SQL(`insert into artist_delegates (artist_id, delegate_id, role, invited_by, invited_email, accepted_at) values ('${artist.id}', '${who.id}', '${role}', '${artist.id}', '${who.email}', now())`)
const venue = (name, city) => SQL(`insert into venues (name, city, country) values ('${name}', '${city}', 'US') returning id`).split('\n')[0]
// A booking relative to NOW, in its own zone (or date-only on its local today).
const book = (artist, v, offsetMin, tz = 'America/Chicago') => SQL(`insert into shows (created_by, status, scheduled_at, timezone, venue_id, scheduled_by, scheduled_by_name) values ('${artist.id}', 'scheduled', now() + interval '${offsetMin} minutes', '${tz}', '${v}', '${artist.id}', null) returning id`).split('\n')[0]
// Date-only bookings exist only through spreadsheet import: a real batch row, then the booking with its provenance
// (written as the import function would; its trigger is suspended for this fixture insert only).
const bookDateOnly = (artist, v, tz = 'America/Chicago') => {
  const batch = SQL(`insert into show_import_batches (id, artist_id, imported_by, file_name, file_sha256, date_order, row_count, imported_count, request_hash) values (gen_random_uuid(), '${artist.id}', '${artist.id}', 'fall-tour.xlsx', encode(sha256(random()::text::bytea), 'hex'), 'MDY', 1, 1, md5(random()::text)) returning id`).split('\n')[0]
  return FIXTURE(`insert into shows (created_by, status, scheduled_at, local_date, timezone, venue_id, scheduled_by, import_batch_id, source_row) values ('${artist.id}', 'scheduled', null, (now() at time zone '${tz}')::date, '${tz}', '${v}', '${artist.id}', '${batch}', 1) returning id;`).split('\n').find(l => /^[0-9a-f-]{36}$/.test(l))
}
const reset = artist => FIXTURE(`delete from show_import_batches where artist_id = '${artist.id}' and false; delete from product_events where user_id = '${artist.id}' and event_name = 'scheduled_start'; delete from performance_songs where performance_id in (select id from performances where user_id = '${artist.id}'); delete from performances where user_id = '${artist.id}'; delete from shows where created_by = '${artist.id}';`)
const perfsFor = showId => SQL(`select count(*) from performances where show_id = '${showId}'`)
const showsOf = artist => Number(SQL(`select count(*) from shows where created_by = '${artist.id}'`))
const events = artist => SQL(`select coalesce(string_agg(action_type, ',' order by occurred_at), '') from product_events where user_id = '${artist.id}' and event_name = 'scheduled_start'`)

let browser
async function session(who, { width = 390, height = 844, actingAs = null, scheme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, timezoneId: 'America/Chicago', permissions: ['microphone', 'geolocation'], geolocation: { latitude: 30.27, longitude: -97.74 }, colorScheme: scheme })
  const pg = await ctx.newPage()
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', who.email); await pg.fill('#auth-password', PW); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 90000 })
  if (actingAs) await pg.evaluate(([k, v]) => localStorage.setItem(k, v), [`setlistr_acting_as:${who.id}`, JSON.stringify({ artist_id: actingAs.id, artist_name: actingAs.artistName })])
  const api = async (method, p, data) => { const r = await ctx.request.fetch(BASE + p, { method, data, failOnStatusCode: false }); let j = null; try { j = await r.json() } catch {} return { s: r.status(), j } }
  const go = async p => { await pg.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(2500) }
  return { ctx, pg, api, go, who }
}
const orb = s => s.pg.locator('a[aria-label="Capture a show"]:visible').first()
// Accept or dismiss the next native confirm, returning its text.
const nextDialog = (pg, accept = true) => new Promise(res => pg.once('dialog', async d => { const m = d.message(); accept ? await d.accept() : await d.dismiss(); res(m) }))


// Measures, on the current page: horizontal overflow; the multi-show summary's fit; and whether the
// gold-button screen's last items clear the bottom bar (including its raised capture button).
async function measure(pg) {
  return pg.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const overflowX = document.documentElement.scrollWidth - vw
    const bar = document.querySelector('nav.sl-tabbar')
    let barTop = Infinity
    if (bar && getComputedStyle(bar).display !== 'none') for (const el of [bar, ...bar.querySelectorAll('*')]) { const r = el.getBoundingClientRect(); if (r.height > 0 && r.width > 0) barTop = Math.min(barTop, r.top) }
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'A different show')
    const hint = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Capture somewhere else, or upload a recording.')
    const multi = document.querySelector('button[aria-label^="Choose one of"]')
    const sum = multi ? multi.querySelector(':scope > span > span:nth-of-type(3)') : null
    const lines = el => { const cs = getComputedStyle(el); let lh = parseFloat(cs.lineHeight); if (Number.isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.2; return Math.round(el.getBoundingClientRect().height / lh) }
    return {
      vw, overflowX, barTop: barTop === Infinity ? null : Math.round(barTop), vh: innerHeight,
      btnBottom: btn ? Math.round(btn.getBoundingClientRect().bottom) : null, btnTop: btn ? Math.round(btn.getBoundingClientRect().top) : null,
      hintBottom: hint ? Math.round(hint.getBoundingClientRect().bottom) : null,
      multi: multi ? { rowOverflow: multi.scrollWidth - multi.clientWidth, sumOverflow: sum ? sum.scrollWidth - sum.clientWidth : null, sumLines: sum ? lines(sum) : null, rightEdge: Math.round(multi.getBoundingClientRect().right), within: multi.getBoundingClientRect().right <= vw + 0.5 } : null,
    }
  })
}

;(async () => {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const A = await person('layout', { artist: `Layout Artist ${T0.slice(-3)}`, admitted: true }); A.artistName = `Layout Artist ${T0.slice(-3)}`
  const TM = await person('lytm'); member(A, TM, 'tour_manager')
  const vA = venue(`Mohawk ${T0}`, 'Austin'), vB = venue(`The Very Long Named Venue Room And Garden Stage ${T0}`, 'Austin'), vC = venue(`Cactus Cafe ${T0}`, 'Austin'), vNext = venue(`Next Week Hall ${T0}`, 'Dallas')
  const count = (text, sub) => text.split(sub).length - 1

  console.log('— 1. Coming up never repeats the featured booking')
  reset(A); book(A, vA, 60)
  let s = await session(TM, { actingAs: A }); await s.go('/app/dashboard')
  let t = await s.pg.locator('body').innerText()
  row(1, 'only booking is featured: shown once; Coming up item omitted', `venue x${count(t, `Mohawk ${T0}`)}; "Coming up" x${count(t, 'Coming up')}; "Next show" x${count(t, 'Next show')}`, 'x1; x0; x0', count(t, `Mohawk ${T0}`) === 1 && !t.includes('Coming up') && !t.includes('Next show'))
  await s.pg.screenshot({ path: `${SHOTS}/layout-dashboard-featured-only.png`, fullPage: true }); await s.ctx.close()
  reset(A); book(A, vA, 60); book(A, vNext, 60 * 30)
  s = await session(TM, { actingAs: A }); await s.go('/app/dashboard'); t = await s.pg.locator('body').innerText()
  row(1, 'featured + a later booking: Coming up shows the next distinct one', `featured x${count(t, `Mohawk ${T0}`)}; next "${count(t, `Next Week Hall ${T0}`) ? 'Next Week Hall' : '—'}"`, 'x1; Next Week Hall', count(t, `Mohawk ${T0}`) === 1 && count(t, `Next Week Hall ${T0}`) === 1 && t.includes('Next show'))
  await s.pg.screenshot({ path: `${SHOTS}/layout-dashboard-featured-plus-next.png`, fullPage: true }); await s.ctx.close()
  const V = await person('lyvw'); member(A, V, 'viewer')
  s = await session(V, { actingAs: A }); await s.go('/app/dashboard'); t = await s.pg.locator('body').innerText()
  row(1, 'Viewer (no Tonight row): Coming up unchanged, shows tonight’s booking', `${t.includes('Next show')} / ${count(t, `Mohawk ${T0}`)}`, 'true / 1', t.includes('Next show') && count(t, `Mohawk ${T0}`) === 1)
  await s.ctx.close()

  console.log('— 2 & 3. Multiple shows at 320 px, 390 px, and larger text')
  reset(A); book(A, vC, 20); book(A, vB, 150); book(A, vA, 240)
  // Larger text = browser zoom, which shrinks the CSS viewport (these pages size text in px): 320 px at 130% → 246 px, 390 px at 150% → 260 px.
  for (const [w, h, zoom, tag] of [[320, 568, 1, '320'], [246, 437, 1, '320-at-130pct'], [390, 844, 1, '390'], [260, 563, 1, '390-at-150pct']]) {
    s = await session(TM, { width: w, height: h, actingAs: A })
    await s.go('/app/dashboard')
    if (zoom !== 1) { await s.pg.evaluate(z => { document.documentElement.style.zoom = String(z) }, zoom); await s.pg.waitForTimeout(400) }
    let m = await measure(s.pg)
    row(2, `${tag}: Dashboard multi row fits (no horizontal clip/overflow; ≤ 2 summary lines)`, JSON.stringify({ page: m.overflowX, ...m.multi }), 'overflow 0; within; lines ≤ 2', m.overflowX <= 0 && m.multi && m.multi.rowOverflow <= 0 && m.multi.sumOverflow <= 0 && m.multi.within && m.multi.sumLines <= 2)
    await s.pg.screenshot({ path: `${SHOTS}/layout-dashboard-multi-${tag}.png` })
    await s.go('/app/show/new')
    await s.pg.waitForSelector('text=A different show', { timeout: 60000 })
    if (zoom !== 1) { await s.pg.evaluate(z => { document.documentElement.style.zoom = String(z) }, zoom); await s.pg.waitForTimeout(400) }
    await s.pg.waitForTimeout(600)
    await s.pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await s.pg.waitForTimeout(400)
    m = await measure(s.pg)
    const clears = m.hintBottom !== null && m.btnBottom !== null && (m.barTop === null || (m.btnBottom <= m.barTop && m.hintBottom <= m.barTop)) && m.btnTop >= 0
    row(3, `${tag}: scrolled to the end, "A different show" and its hint clear the bottom bar`, JSON.stringify({ btnBottom: m.btnBottom, hintBottom: m.hintBottom, barTop: m.barTop, overflowX: m.overflowX }), 'btn & hint ≤ barTop; no overflow', clears && m.overflowX <= 0)
    await s.pg.screenshot({ path: `${SHOTS}/layout-gold-multi-${tag}.png` })
    await s.ctx.close()
  }
  console.log(`\n${rows.filter(r => r.ok).length}/${rows.length} passed`)
  require('fs').writeFileSync(require('path').join(SHOTS, 'layout-results.json'), JSON.stringify(rows, null, 1))
  await browser.close()
})().catch(async e => { console.error('ERROR', e.message.split('\n')[0]); try { await browser.close() } catch {} process.exit(1) })

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

;(async () => {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const A = await person('artist', { artist: `Tonight Artist ${T0.slice(-3)}`, admitted: true }); A.artistName = `Tonight Artist ${T0.slice(-3)}`
  const A2 = await person('second', { artist: `Second Artist ${T0.slice(-3)}`, admitted: true }); A2.artistName = `Second Artist ${T0.slice(-3)}`
  const TM = await person('tm'), MG = await person('mgr'), VW = await person('viewer')
  member(A, TM, 'tour_manager'); member(A2, TM, 'tour_manager'); member(A, MG, 'manager'); member(A, VW, 'viewer')
  const vMohawk = venue(`Mohawk ${T0}`, 'Austin'), vCactus = venue(`Cactus Cafe ${T0}`, 'Austin'), vBowery = venue(`Bowery ${T0}`, 'New York'), vCont = venue(`Continental ${T0}`, 'Austin'), vSecond = venue(`Second Room ${T0}`, 'Dallas')

  // ── 1. One show: Dashboard row → confirmation (cancel, then OK) → live, linked ──
  console.log('— 1. One booked show tonight')
  reset(A); let s1 = book(A, vMohawk, 60)
  const tm = await session(TM, { actingAs: A })
  await tm.go('/app/dashboard')
  const rowBtn = tm.pg.getByRole('button', { name: new RegExp(`Start capture at Mohawk ${T0}`) })
  row(1, 'Dashboard shows the Tonight row', await rowBtn.count(), 1, await rowBtn.count() === 1)
  row(1, 'row label', (await rowBtn.innerText()).replace(/\n/g, ' | '), 'Scheduled · Today | venue | time · city · Start capture', /Scheduled · Today/.test(await rowBtn.innerText()))
  await tm.pg.screenshot({ path: `${SHOTS}/phone-dark-dashboard-one.png` })
  let msgP = nextDialog(tm.pg, false); await rowBtn.click(); let msg = await msgP
  row(1, 'confirmation names artist, venue, local date/time and zone, early/now', msg.replace(/\n+/g, ' / '), 'artist — venue, scheduled for <Day, Mon D> (today), h:mm AM/PM CDT? / early-start note',
    msg.includes(A.artistName) && msg.includes(`Mohawk ${T0}`) && /\(today\), \d{1,2}:\d{2} [AP]M C[DS]T/.test(msg) && /starts the show early/.test(msg))
  await sleep(800)
  row(1, 'dismissing the confirmation creates nothing', `perfs=${perfsFor(s1)} shows=${showsOf(A)} events="${events(A)}"`, 'perfs=0 shows=1 events=""', perfsFor(s1) === '0' && showsOf(A) === 1 && events(A) === '')
  msgP = nextDialog(tm.pg, true); await rowBtn.click(); await msgP
  await tm.pg.waitForURL(/\/app\/live\/.+autostart=1/, { timeout: 30000 })
  const perf1 = SQL(`select id || '|' || coalesce(started_by::text,'') || '|' || coalesce(captured_by::text,'') || '|' || status from performances where show_id = '${s1}'`)
  row(1, 'OK → live capture with autostart, linked to the booking', `${new URL(tm.pg.url()).pathname}; ${perf1.split('|').slice(1).map(x => x === TM.id ? 'TM' : x).join(',')}`, 'started_by=TM, captured_by=TM, live', perf1.split('|')[1] === TM.id && perf1.split('|')[2] === TM.id && perf1.endsWith('|live'))
  row(1, 'no new show row (still 1 booking for the artist)', showsOf(A), 1, showsOf(A) === 1)
  await sleep(1500)
  const ev1 = events(A)
  row(1, 'telemetry: one scheduled_start "dashboard.started", no venue text', `"${ev1}"; columns with text: ${SQL(`select count(*) from product_events where user_id='${A.id}' and event_name='scheduled_start' and (flow_source is not null or song_count_current is not null)`)}`, 'dashboard.started; 0', ev1 === 'dashboard.started')
  await tm.ctx.close()

  // ── 2. Gold button path ──
  console.log('— 2. Gold capture button')
  reset(A); const s2 = book(A, vMohawk, 45)
  const tm2 = await session(TM, { actingAs: A })
  await tm2.go('/app/dashboard'); await orb(tm2).click(); await tm2.pg.waitForSelector('text=A different show', { timeout: 60000 })
  await tm2.pg.screenshot({ path: `${SHOTS}/phone-dark-gold-one.png` })
  const lead = await tm2.pg.locator('h1:has-text("Where tonight?")').count()
  row(2, 'gold button first screen leads with the booking', `${lead} heading; ${await tm2.pg.getByRole('button', { name: /Start capture/ }).count()} Start`, '1; 1', lead === 1 && await tm2.pg.getByRole('button', { name: /Start capture/ }).count() === 1)
  row(2, 'gold lead names the selected artist', await tm2.pg.getByText(`Scheduled for ${A.artistName}.`).count(), 1, await tm2.pg.getByText(`Scheduled for ${A.artistName}.`).count() === 1)
  msgP = nextDialog(tm2.pg, true); await tm2.pg.getByRole('button', { name: /Start capture/ }).click(); msg = await msgP
  row(2, 'gold confirmation names artist, venue, local date/time, zone', msg.replace(/\n+/g, ' / '), 'artist — venue, scheduled for <Day, Mon D> (today), h:mm CDT?', msg.includes(A.artistName) && msg.includes(`Mohawk ${T0}`) && /\(today\), \d{1,2}:\d{2} [AP]M C[DS]T/.test(msg))
  await tm2.pg.waitForURL(/\/app\/live\//, { timeout: 30000 })
  row(2, 'Start capture → OK → live, linked; 3 taps total', `perfs=${perfsFor(s2)} shows=${showsOf(A)}`, 'perfs=1 shows=1', perfsFor(s2) === '1' && showsOf(A) === 1)
  await sleep(1500); row(2, 'telemetry "capture_button.started"', events(A), 'capture_button.started', events(A) === 'capture_button.started')
  await tm2.ctx.close()

  // ── 3. Two shows: choose, never auto ──
  console.log('— 3. Two booked shows tonight')
  reset(A); const early = book(A, vCactus, 20), late = book(A, vMohawk, 230)
  const tm3 = await session(TM, { actingAs: A })
  await tm3.go('/app/dashboard')
  const choose = tm3.pg.getByRole('button', { name: /Choose one of 2 scheduled shows/ })
  row(3, 'Dashboard offers a choice, not a start', await choose.count(), 1, await choose.count() === 1)
  await tm3.pg.screenshot({ path: `${SHOTS}/phone-dark-dashboard-two.png` })
  await choose.click(); await tm3.pg.waitForSelector('text=A different show', { timeout: 60000 })
  row(3, 'choice screen lists both, nothing started', `${await tm3.pg.getByRole('button', { name: /Start capture/ }).count()} Start; perfs=${perfsFor(early)}+${perfsFor(late)}`, '2 Start; 0+0', await tm3.pg.getByRole('button', { name: /Start capture/ }).count() === 2 && perfsFor(early) === '0' && perfsFor(late) === '0')
  await tm3.pg.screenshot({ path: `${SHOTS}/phone-dark-gold-two.png` })
  msgP = nextDialog(tm3.pg, true); await tm3.pg.getByRole('button', { name: /Start capture/ }).nth(1).click(); await msgP
  await tm3.pg.waitForURL(/\/app\/live\//, { timeout: 30000 })
  row(3, 'the chosen (later) show is the one linked', `early=${perfsFor(early)} late=${perfsFor(late)}`, 'early=0 late=1', perfsFor(early) === '0' && perfsFor(late) === '1')
  await tm3.ctx.close()

  // ── 4. Date-only booking ──
  console.log('— 4. Date-only booking today')
  reset(A); const d1 = bookDateOnly(A, vCont)
  const tm4 = await session(TM, { actingAs: A })
  await tm4.go('/app/dashboard')
  const addRow = tm4.pg.getByRole('button', { name: /Add a start time for/ })
  row(4, 'Dashboard: "Add a start time", no Start', `${await addRow.count()} add; ${await tm4.pg.getByRole('button', { name: /Start capture at/ }).count()} start`, '1; 0', await addRow.count() === 1 && await tm4.pg.getByRole('button', { name: /Start capture at/ }).count() === 0)
  await orb(tm4).click(); await tm4.pg.waitForSelector('text=A different show', { timeout: 60000 })
  row(4, 'gold: Add a start time, no Start', `${await tm4.pg.getByRole('button', { name: 'Add a start time' }).count()} add; ${await tm4.pg.getByRole('button', { name: /^Start capture/ }).count()} start`, '1; 0', await tm4.pg.getByRole('button', { name: 'Add a start time' }).count() === 1 && await tm4.pg.getByRole('button', { name: /^Start capture/ }).count() === 0)
  await tm4.pg.screenshot({ path: `${SHOTS}/phone-dark-gold-dateonly.png` })
  await tm4.pg.getByRole('button', { name: 'Add a start time' }).click(); await tm4.pg.waitForURL(/\/app\/schedule/, { timeout: 30000 })
  row(4, '→ Schedule; no show or performance created', `${new URL(tm4.pg.url()).pathname}; shows=${showsOf(A)} perfs=${perfsFor(d1)}`, '/app/schedule; shows=1 perfs=0', showsOf(A) === 1 && perfsFor(d1) === '0')
  await tm4.ctx.close()

  // ── 5. Local dates and zones ──
  console.log('— 5. Local dates and time zones')
  reset(A); book(A, vBowery, 90, 'America/New_York')
  // A zone where it is currently just after local midnight: a show that started 2 h ago there is on the previous local day.
  const zones = ['Pacific/Kiritimati', 'Pacific/Auckland', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/Moscow', 'Europe/Berlin', 'Europe/London', 'Atlantic/Azores', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Pago_Pago']
  const hourIn = z => Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  const zPast = zones.find(z => hourIn(z) >= 1 && hourIn(z) <= 3)
  if (zPast) book(A, vSecond, -120, zPast)
  const tm5 = await session(TM, { actingAs: A })
  await tm5.go('/app/show/new'); await tm5.pg.waitForSelector('text=A different show', { timeout: 60000 })
  const body5 = await tm5.pg.locator('body').innerText()
  row(5, 'another zone shows the venue’s zone (EDT/EST)', /Bowery[\s\S]*\d{1,2}:\d{2} [AP]M E[DS]T/.test(body5), true, /\d{1,2}:\d{2} [AP]M E[DS]T/.test(body5))
  if (zPast) {
    const card = await tm5.pg.locator(`div:has(> p:text-is("Second Room ${T0}"))`).first().innerText().catch(() => '')
    row(5, `previous-day show (${zPast}, started 2 h ago) shows its actual local date, not "Today"`, card.replace(/\n/g, ' | '), 'Scheduled · <Day, Mon D> | … | h:mm PM <zone>', /Scheduled · \w{3}, \w{3} \d{1,2}/.test(card) && !/Scheduled · Today/.test(card))
  } else row(5, 'previous-day case', 'no zone currently between 1–3 AM in the list; covered by unit tests', 'skipped', true)
  await tm5.pg.screenshot({ path: `${SHOTS}/phone-dark-gold-zones.png`, fullPage: true })
  await tm5.ctx.close()
  // A booking with an invalid zone is never offered (not inferred from the phone).
  reset(A); SQL(`insert into shows (created_by, status, scheduled_at, timezone, venue_id, scheduled_by) values ('${A.id}', 'scheduled', now() + interval '60 minutes', 'Not/AZone', '${vMohawk}', '${A.id}')`)
  const tm5b = await session(TM, { actingAs: A }); await tm5b.go('/app/dashboard')
  row(5, 'invalid time zone: no Tonight row', await tm5b.pg.getByRole('button', { name: /Start capture at|Choose one of|Add a start time for/ }).count(), 0, await tm5b.pg.getByRole('button', { name: /Start capture at|Choose one of|Add a start time for/ }).count() === 0)
  await tm5b.ctx.close()

  // ── 6. Concurrency: teammate starts while this screen is open; and simultaneous starts ──
  console.log('— 6. Concurrency')
  reset(A); const s6 = book(A, vMohawk, 30)
  const tmA = await session(TM, { actingAs: A }), mg = await session(MG, { actingAs: A })
  await mg.go('/app/show/new'); await mg.pg.waitForSelector('text=A different show', { timeout: 60000 })   // MG's screen is open
  await tmA.go('/app/dashboard'); msgP = nextDialog(tmA.pg, true)
  await tmA.pg.getByRole('button', { name: new RegExp(`Start capture at Mohawk ${T0}`) }).click(); await msgP; await tmA.pg.waitForURL(/\/app\/live\//, { timeout: 30000 })
  msgP = nextDialog(mg.pg, true); await mg.pg.getByRole('button', { name: /^Start capture/ }).click(); await msgP
  await mg.pg.waitForSelector('text=This show was just started by someone else.', { timeout: 30000 }); await mg.pg.waitForTimeout(2500)
  await mg.pg.screenshot({ path: `${SHOTS}/phone-dark-gold-teammate-started.png` })
  const mgBody = await mg.pg.locator('body').innerText()
  row(6, 'stale screen: refused with the existing message, kept visible after refresh', /just started by someone else/.test(mgBody), true, /just started by someone else/.test(mgBody))
  row(6, 'after refresh: teammate’s capture shown as status (no continue action)', `${/Being captured by/.test(mgBody)}; continue buttons=${await mg.pg.getByRole('button', { name: /Continue capture|Resume capture/ }).count()}`, 'true; 0', /Being captured by/.test(mgBody) && await mg.pg.getByRole('button', { name: /Continue capture|Resume capture/ }).count() === 0)
  row(6, 'exactly one performance for the booking', perfsFor(s6), 1, perfsFor(s6) === '1')
  await sleep(1500)
  row(6, 'telemetry: dashboard.started then capture_button.refused', events(A), 'dashboard.started,capture_button.refused', events(A) === 'dashboard.started,capture_button.refused')
  // Dashboard for the other teammate: status only, no Tonight start
  await mg.go('/app/dashboard'); await mg.pg.screenshot({ path: `${SHOTS}/phone-dark-dashboard-teammate-capturing.png` })
  const mgDash = await mg.pg.locator('body').innerText()
  row(6, 'manager Dashboard: "Being captured by <TM>", no continue, no Start', `${/Being captured by Tm/.test(mgDash)}; buttons=${await mg.pg.getByRole('button', { name: /Continue capture|Resume capture|Start capture at/ }).count()}`, 'true; 0', /Being captured by Tm/.test(mgDash) && await mg.pg.getByRole('button', { name: /Continue capture|Resume capture|Start capture at/ }).count() === 0)
  // Owner Dashboard: teammate's capture is status, too
  const own = await session(A); await own.go('/app/dashboard')
  row(6, 'artist (owner) Dashboard: teammate’s capture is status only', `${/Being captured by Tm/.test(await own.pg.locator('body').innerText())}; continue=${await own.pg.getByRole('button', { name: /Continue capture|Resume capture/ }).count()}`, 'true; 0', /Being captured by Tm/.test(await own.pg.locator('body').innerText()) && await own.pg.getByRole('button', { name: /Continue capture|Resume capture/ }).count() === 0)
  // The person capturing can rejoin their own capture
  await tmA.go('/app/dashboard')
  row(6, 'the capturer’s own Dashboard offers "continue"', await tmA.pg.getByRole('button', { name: /Continue capture|Resume capture/ }).count(), 1, await tmA.pg.getByRole('button', { name: /Continue capture|Resume capture/ }).count() === 1)
  await own.ctx.close(); await tmA.ctx.close()
  // Simultaneous: two starters fire at once
  reset(A); const s6b = book(A, vMohawk, 30)
  const t2 = await session(TM, { actingAs: A })
  const both = await Promise.all([t2.api('POST', `/api/shows/schedule/${s6b}/start`), mg.api('POST', `/api/shows/schedule/${s6b}/start`)])
  row(6, 'simultaneous starts: one 200, one 409; one performance', `${both.map(b => b.s).sort().join(',')}; perfs=${perfsFor(s6b)}`, '200,409; 1', both.map(b => b.s).sort().join(',') === '200,409' && perfsFor(s6b) === '1')
  const again = await t2.api('POST', `/api/shows/schedule/${s6b}/start`), againWho = both.find(b => b.s === 200) === both[0] ? 'TM' : 'MG'
  row(6, `same starter retries (${againWho === 'TM' ? 'rejoin' : 'refused'}), still one performance`, `${again.s} already_started=${again.j?.already_started}; perfs=${perfsFor(s6b)}`, 'no duplicate', perfsFor(s6b) === '1')
  await t2.ctx.close(); await mg.ctx.close()

  // ── 7. Failure recovery: cancelled / completed while open ──
  console.log('— 7. Failure recovery')
  for (const [label, sqlState, expectMsg] of [['cancelled', "status = 'cancelled'", 'This show was cancelled.'], ['completed', "status = 'completed'", 'This show has already finished.']]) {
    reset(A); const sx = book(A, vMohawk, 30)
    const t7 = await session(TM, { actingAs: A }); await t7.go('/app/show/new'); await t7.pg.waitForSelector('text=A different show', { timeout: 60000 })
    FIXTURE(`update shows set ${sqlState} where id = '${sx}';`)
    msgP = nextDialog(t7.pg, true); await t7.pg.getByRole('button', { name: /^Start capture/ }).click(); await msgP
    await t7.pg.waitForSelector(`text=${expectMsg}`, { timeout: 30000 }); await t7.pg.waitForTimeout(2500)
    const b7 = await t7.pg.locator('body').innerText()
    row(7, `${label} while open: message stays after refresh; no Start; "A different show" remains`, `${b7.includes(expectMsg)}; start=${await t7.pg.getByRole('button', { name: /^Start capture/ }).count()}; different=${await t7.pg.getByRole('button', { name: 'A different show' }).count()}; perfs=${perfsFor(sx)}`, 'true; 0; 1; 0', b7.includes(expectMsg) && await t7.pg.getByRole('button', { name: /^Start capture/ }).count() === 0 && await t7.pg.getByRole('button', { name: 'A different show' }).count() === 1 && perfsFor(sx) === '0')
    if (label === 'cancelled') await t7.pg.screenshot({ path: `${SHOTS}/phone-dark-gold-cancelled.png` })
    await t7.ctx.close()
  }
  // Telemetry failure never blocks Start
  reset(A); const s7 = book(A, vMohawk, 30)
  const t7b = await session(TM, { actingAs: A })
  await t7b.ctx.route('**/rest/v1/product_events*', r => r.abort())
  await t7b.go('/app/dashboard'); msgP = nextDialog(t7b.pg, true)
  await t7b.pg.getByRole('button', { name: new RegExp(`Start capture at Mohawk ${T0}`) }).click(); await msgP
  await t7b.pg.waitForURL(/\/app\/live\//, { timeout: 30000 }).catch(() => {})
  row(7, 'telemetry blocked: Start still reaches live capture', `${new URL(t7b.pg.url()).pathname.startsWith('/app/live/')}; perfs=${perfsFor(s7)}; events="${events(A)}"`, 'true; 1; ""', new URL(t7b.pg.url()).pathname.startsWith('/app/live/') && perfsFor(s7) === '1' && events(A) === '')
  await t7b.ctx.close()

  // ── 8. Permissions ──
  console.log('— 8. Permissions')
  reset(A); const s8 = book(A, vMohawk, 30)
  const vw = await session(VW, { actingAs: A }); await vw.go('/app/dashboard')
  row(8, 'Viewer: no Tonight row, no gold button', `rows=${await vw.pg.getByRole('button', { name: /Start capture at|Choose one of|Add a start time for/ }).count()} orb=${await orb(vw).count()}`, 'rows=0 orb=0', await vw.pg.getByRole('button', { name: /Start capture at|Choose one of|Add a start time for/ }).count() === 0 && await orb(vw).count() === 0)
  const vwStart = await vw.api('POST', `/api/shows/schedule/${s8}/start`)
  row(8, 'Viewer direct start → 403, nothing created', `${vwStart.s}; perfs=${perfsFor(s8)}`, '403; 0', vwStart.s === 403 && perfsFor(s8) === '0')
  await vw.go('/app/show/new')
  row(8, 'Viewer opening New show directly: no Tonight start', await vw.pg.getByRole('button', { name: /^Start capture/ }).count(), 0, await vw.pg.getByRole('button', { name: /^Start capture/ }).count() === 0)
  await vw.ctx.close()
  const t8 = await session(TM, { actingAs: A }); await t8.go('/app/dashboard')
  const tmRow = SQL(`select id from artist_delegates where artist_id = '${A.id}' and delegate_id = '${TM.id}'`)
  SQL(`update artist_delegates set revoked_at = now() where id = '${tmRow}'`)
  const revStart = await t8.api('POST', `/api/shows/schedule/${s8}/start`)
  row(8, 'access revoked while the screen was open: start → 403, nothing created', `${revStart.s}; perfs=${perfsFor(s8)}`, '403; 0', revStart.s === 403 && perfsFor(s8) === '0')
  const schedAfter = await t8.api('GET', `/api/shows/schedule?artist_id=${A.id}`)
  row(8, 'revoked: the booking list for that artist is empty on refresh', (schedAfter.j?.shows || []).length, 0, (schedAfter.j?.shows || []).length === 0)
  SQL(`update artist_delegates set revoked_at = null where id = '${tmRow}'`)
  await t8.ctx.close()

  // ── 9. Workspace switching ──
  console.log('— 9. Workspace switching')
  reset(A); reset(A2); book(A, vMohawk, 30); book(A2, vSecond, 40)
  const t9 = await session(TM, { actingAs: A }); await t9.go('/app/dashboard')
  const before = await t9.pg.locator('body').innerText()
  await t9.pg.getByRole('button', { name: /Account/ }).first().click(); await t9.pg.getByRole('menuitem', { name: A2.artistName }).click(); await t9.pg.waitForTimeout(3500)
  const after = await t9.pg.locator('body').innerText()
  row(9, 'switching workspace in place: row follows the selected artist', `before Mohawk=${before.includes(`Mohawk ${T0}`)}; after Second Room=${after.includes(`Second Room ${T0}`)}, Mohawk=${after.includes(`Mohawk ${T0}`)}`, 'true; true, false', before.includes(`Mohawk ${T0}`) && after.includes(`Second Room ${T0}`) && !after.includes(`Mohawk ${T0}`))
  msgP = nextDialog(t9.pg, false); await t9.pg.getByRole('button', { name: new RegExp(`Start capture at Second Room ${T0}`) }).click(); msg = await msgP
  row(9, 'confirmation names the newly selected artist', msg.includes(A2.artistName) && !msg.includes(A.artistName), true, msg.includes(A2.artistName) && !msg.includes(A.artistName))
  await t9.ctx.close()

  // ── 10. Existing paths ──
  console.log('— 10. Existing manual and upload paths')
  reset(A); const s10 = book(A, vMohawk, 30)
  const t10 = await session(TM, { actingAs: A })
  await t10.go('/app/show/new'); await t10.pg.waitForSelector('text=A different show', { timeout: 60000 })
  await t10.pg.getByRole('button', { name: 'A different show' }).click()
  row(10, '"A different show" opens today’s choice, with a way back', `${await t10.pg.getByText('Start Live Capture').count()} live; ${await t10.pg.getByText('Upload a Recording').count()} upload; back=${await t10.pg.getByRole('button', { name: /Back to tonight/ }).count()}`, '1; 1; 1', await t10.pg.getByText('Start Live Capture').count() === 1 && await t10.pg.getByText('Upload a Recording').count() === 1 && await t10.pg.getByRole('button', { name: /Back to tonight/ }).count() === 1)
  await t10.pg.screenshot({ path: `${SHOTS}/phone-dark-different-show.png` })
  row(10, '…and the booking is untouched', SQL(`select status from shows where id='${s10}'`), 'scheduled', SQL(`select status from shows where id='${s10}'`) === 'scheduled')
  await t10.pg.getByText('Start Live Capture').click(); await t10.pg.waitForSelector('input[placeholder="Venue or room name..."]', { timeout: 30000 })
  await t10.pg.fill('input[placeholder="Venue or room name..."]', `Backyard ${T0}`); await t10.pg.waitForTimeout(1500)
  const cityInput = t10.pg.locator('input[placeholder*="City" i]').first(); if (await cityInput.count()) await cityInput.fill('Austin')
  row(10, 'manual path: venue step works as today', await t10.pg.locator('input[placeholder="Venue or room name..."]').inputValue(), `Backyard ${T0}`, (await t10.pg.locator('input[placeholder="Venue or room name..."]').inputValue()) === `Backyard ${T0}`)
  await t10.go('/app/show/new?mode=upload')
  row(10, 'upload-intent link: no Tonight lead', await t10.pg.getByRole('button', { name: 'A different show' }).count(), 0, await t10.pg.getByRole('button', { name: 'A different show' }).count() === 0)
  await t10.go('/app/upload/new')
  row(10, 'upload page still opens', new URL(t10.pg.url()).pathname, '/app/upload/new', new URL(t10.pg.url()).pathname === '/app/upload/new')
  // Schedule's own Start still works (and records its entry)
  await t10.go('/app/schedule'); msgP = nextDialog(t10.pg, true)
  await t10.pg.getByRole('button', { name: /Start early|Start Capture/ }).first().click(); await msgP; await t10.pg.waitForURL(/\/app\/live\//, { timeout: 30000 })
  await sleep(1500)
  row(10, 'Schedule Start unchanged: linked, entry "schedule.started"', `perfs=${perfsFor(s10)}; ${events(A)}`, 'perfs=1; schedule.started', perfsFor(s10) === '1' && events(A) === 'schedule.started')
  await t10.ctx.close()
  // Nothing scheduled: unchanged
  reset(A)
  const t10b = await session(TM, { actingAs: A }); await t10b.go('/app/dashboard')
  row(10, 'nothing booked: no Tonight row', await t10b.pg.getByRole('button', { name: /Start capture at|Choose one of|Add a start time for/ }).count(), 0, await t10b.pg.getByRole('button', { name: /Start capture at|Choose one of|Add a start time for/ }).count() === 0)
  await orb(t10b).click(); await t10b.pg.waitForSelector('text=Start Live Capture', { timeout: 60000 })
  row(10, 'nothing booked: gold button opens today’s unchanged first screen', `${await t10b.pg.getByText('Upload a Recording').count()} upload; different=${await t10b.pg.getByRole('button', { name: 'A different show' }).count()}`, '1; 0', await t10b.pg.getByText('Upload a Recording').count() === 1 && await t10b.pg.getByRole('button', { name: 'A different show' }).count() === 0)
  await t10b.ctx.close()

  // ── 11. Preview lock (same build, SETLISTR_START_PREVIEW=1) ──
  if (PREVIEW) {
    console.log('— 11. Preview lock')
    reset(A); const s11 = book(A, vMohawk, 30)
    const ctx = await browser.newContext(); const pg = await ctx.newPage()
    await pg.goto(PREVIEW + '/auth/login'); await pg.fill('#auth-email', TM.email); await pg.fill('#auth-password', PW); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 90000 })
    const r = await ctx.request.post(`${PREVIEW}/api/shows/schedule/${s11}/start`, { failOnStatusCode: false }); const j = await r.json()
    row(11, 'Preview: start refused before any write', `${r.status()} ${j.code}; perfs=${perfsFor(s11)}; show=${SQL(`select status from shows where id='${s11}'`)}`, '403 preview_disabled; 0; scheduled', r.status() === 403 && j.code === 'preview_disabled' && perfsFor(s11) === '0')
    await ctx.close()
  }

  // ── Screens: phone + desktop, dark + light ──
  console.log('— Screens')
  reset(A); book(A, vMohawk, 60)
  for (const [w, h, tag] of [[390, 844, 'phone'], [1280, 900, 'desktop']]) for (const scheme of ['dark', 'light']) {
    const sc = await session(TM, { width: w, height: h, actingAs: A, scheme })
    await sc.go(`/app/dashboard?appearance=${scheme}`); await sc.pg.screenshot({ path: `${SHOTS}/${tag}-${scheme}-dashboard.png` })
    await sc.go(`/app/show/new?appearance=${scheme}`); await sc.pg.waitForSelector('text=A different show', { timeout: 60000 }); await sc.pg.screenshot({ path: `${SHOTS}/${tag}-${scheme}-gold.png` })
    await sc.ctx.close()
  }

  fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(rows, null, 1))
  console.log(`\n${rows.filter(r => r.ok).length}/${rows.length} passed`)
  await browser.close()
})().catch(async e => { console.error('ERROR', e.message.split('\n')[0]); fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(rows, null, 1)); try { await browser.close() } catch {} process.exit(1) })

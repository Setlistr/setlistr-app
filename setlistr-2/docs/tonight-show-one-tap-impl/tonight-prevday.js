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
  const A = await person('pday', { artist: `Prevday Artist ${T0.slice(-3)}`, admitted: true }); A.artistName = `Prevday Artist ${T0.slice(-3)}`
  const TM = await person('pdtm'); member(A, TM, 'tour_manager')
  const v = venue(`Late Room ${T0}`, 'Somewhere')
  const zones = Intl.supportedValuesOf('timeZone')
  const hourIn = z => Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  const z = zones.find(z => hourIn(z) >= 1 && hourIn(z) <= 3)
  const show = book(A, v, -120, z)
  const local = new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.now() - 120 * 60000))
  const tm = await session(TM, { actingAs: A })
  await tm.go('/app/dashboard')
  const rowText = (await tm.pg.getByRole('button', { name: new RegExp(`Start capture at Late Room ${T0}`) }).innerText()).replace(/\n/g, ' | ')
  row(5, `previous-day show in ${z} (started 2 h ago, local ${local}): actual local date + zone, not Today/Yesterday`, rowText, `Scheduled · ${local} | …`, rowText.includes(`Scheduled · ${local}`) && !/Today|Yesterday/.test(rowText))
  await tm.pg.screenshot({ path: `${SHOTS}/phone-dark-dashboard-previous-day.png` })
  const msgP = nextDialog(tm.pg, false); await tm.pg.getByRole('button', { name: new RegExp(`Start capture at Late Room ${T0}`) }).click(); const msg = await msgP
  row(5, 'confirmation: actual local date "(yesterday)", zone, and "starts the show now"', msg.replace(/\n+/g, ' / '), `${local} (yesterday), h:mm <zone> / This starts the show now.`, msg.includes(`${local} (yesterday)`) && /This starts the show now/.test(msg))
  row(5, 'dismissed: nothing created', perfsFor(show), 0, perfsFor(show) === '0')
  console.log(`\n${rows.filter(r => r.ok).length}/${rows.length} passed`)
  await browser.close()
})().catch(async e => { console.error('ERROR', e.message.split('\n')[0]); try { await browser.close() } catch {} process.exit(1) })

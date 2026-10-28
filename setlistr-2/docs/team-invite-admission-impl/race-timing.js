// Team invitation + admission candidate, tested against the DISPOSABLE stack only
// (local build of feature/team-invite-admission, Supabase Auth + Mailpit).
// node invite-accept.js <base> <app.env> <shots-dir>. Prints no keys, tokens or codes.
const path = require('path'), fs = require('fs'), { execSync, spawn } = require('child_process')
const [BASE, ENVF, SHOTS] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING'); process.exit(1) }
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) { console.error('REFUSING'); process.exit(1) }
const PSQL = 'docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1'
const SQL = q => execSync(PSQL, { input: q }).toString().trim()
const MP = 'http://127.0.0.1:54625/api/v1'
// Every mail-catcher request is bounded, so a stalled response can't hang the run.
const mpGet = async u => { try { return await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json() } catch { return {} } }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rows = []; const row = (sec, test, got, expect, ok) => { rows.push({ sec, test, got: String(got), expect: String(expect), ok: !!ok }); console.log(ok ? '  ok  ' : '  FAIL', test, '→', got) }
const secrets = new Set() // every token and code used, to check the server log never contains them
const T0 = Date.now().toString(36), PW = 'Pw-inv-Aa1x9-cand'
const LENA = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
const OTHER = SQL(`select id from profiles where artist_name = 'Harbour Front'`)
const OTHER_EMAIL = SQL(`select email from profiles where id = '${OTHER}'`)

async function account(label, { admitted = false } = {}) {
  const email = `${label}-${T0}@example.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error
  if (admitted) SQL(`insert into beta_invites (email) values ('${email}')`)
  return { id: data.user.id, email }
}
async function session(b, email, pw = PW, viewport) {
  const ctx = await b.newContext(viewport ? { viewport, deviceScaleFactor: 2 } : {}); const pg = await ctx.newPage()
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', pw); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 60000 })
  const api = async (method, p, data) => { const r = await ctx.request.fetch(BASE + p, { method, data, failOnStatusCode: false }); let j = null; try { j = await r.json() } catch {} return { s: r.status(), j } }
  return { ctx, pg, api, page: async p => { await pg.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1200); return new URL(pg.url()).pathname } }
}
// A second, independent "device": its own password sign-in, never touching the browser.
async function device(email) { const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const { data, error } = await sb.auth.signInWithPassword({ email, password: PW }); if (error) throw error; return { sb, refresh: data.session.refresh_token } }
async function mailCode(to, after) {
  for (let i = 0; i < 60; i++) {
    // Mailpit's message list (newest first), not its search, which can lag behind delivery.
    const m = await mpGet(`${MP}/messages?limit=100`)
    const fresh = (m.messages || []).filter(x => x.To?.some(t => t.Address.toLowerCase() === to.toLowerCase()) && new Date(x.Created).getTime() >= after)
    if (fresh.length) { const full = await mpGet(`${MP}/message/${fresh[0].ID}`); const c = ((full.Text || '').match(/\b(\d{8})\b/) || [])[1]; if (c) secrets.add(c); return { code: c, count: fresh.length } }
    await sleep(300)
  }
  return { code: null, count: 0 }
}
const mailCount = async to => ((await mpGet(`${MP}/search?query=to:${encodeURIComponent(to)}`)).messages || []).length
const tokFor = e => { const t = SQL(`select invite_token from artist_delegates where invited_email = '${e}' and artist_id = '${LENA}'`); if (t) secrets.add(t); return t }
const rowFor = e => SQL(`select coalesce(delegate_id::text,'null') || '|' || (accepted_at is not null) || '|' || (revoked_at is not null) from artist_delegates where invited_email = '${e}' and artist_id = '${LENA}'`)
const sessionsOf = id => Number(SQL(`select count(*) from auth.sessions where user_id = '${id}'`))
const wrongCode = c => String((Number(c) + 1) % 100000000).padStart(8, '0')
// Opens the accept page first, as the real flow does (the /app layout also ensures the profile row,
// which the disposable stack's auth schema has no signup trigger for).
async function codeFor(s, who, token) { await s.page(`/app/accept-invite?token=${token}`); const t = Date.now() - 1000; const r = await s.api('POST', '/api/team/accept/code', { token }); const m = await mailCode(who.email, t); return { r, code: m.code } }
// Holds a row lock while changing the row, so an accept already past its read
// blocks on the guarded UPDATE and must re-evaluate it after this commits.
// Direct connection to the disposable database (not docker exec, which can stall under load).
const { Client: PgClient } = require('/private/tmp/claude-501/-Users-jesseslack/5f62ecc6-cca6-4bad-a244-5d37e786fd65/scratchpad/pgmod/node_modules/pg')
async function lockedChange(setClause, id, holdSec = 3) {
  const c = new PgClient({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54622/postgres' }); await c.connect()
  await c.query('begin'); await c.query(`update artist_delegates set ${setClause} where id = $1`, [id])
  // Wrapped, so awaiting lockedChange waits only until the lock is held, not for its release.
  return { done: (async () => { await sleep(holdSec * 1000); await c.query('commit'); await c.end() })() }
}


;(async () => {
  const b = await chromium.launch()
  const owner = await session(b, 'pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  const invite = async (email, role = 'tour_manager') => { const r = await owner.api('POST', '/api/team/invite', { artist_id: LENA, delegate_email: email, role }); if (!r.j?.success) throw new Error(`invite failed ${r.s}`); return r }
  for (const [label, setClause] of [['resend', `invite_token = md5(random()::text), invited_at = now()`], ['revoke', `revoked_at = now()`], ['expiry', `invited_at = now() - interval '15 days'`]]) {
    const t0 = Date.now(); const ms = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
    const X = await account('timing' + label); await invite(X.email); const XT = tokFor(X.email); const xs = await session(b, X.email)
    const cx = await codeFor(xs, X, XT); const id = SQL(`select id from artist_delegates where invited_email = '${X.email}'`)
    console.log(label, 'code ready', !!cx.code, ms())
    const lockStart = Date.now(); const lock = (await lockedChange(setClause, id, 5)).done.then(() => console.log(label, 'lock released after', ((Date.now() - lockStart) / 1000).toFixed(1) + 's'))
    await sleep(300); const ps = Date.now()
    const res = await xs.api('POST', '/api/team/accept', { token: XT, code: cx.code })
    console.log(label, 'accept', res.s, res.j?.code || res.j?.error, 'took', ((Date.now() - ps) / 1000).toFixed(1) + 's'); await lock
  }
  await b.close()
})().catch(e => { console.error('ERROR', e.message.split('\n')[0]); process.exit(1) })

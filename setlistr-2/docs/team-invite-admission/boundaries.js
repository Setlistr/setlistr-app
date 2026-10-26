// Access boundaries and invitation behaviour of the PRODUCTION app code (rc build) on the DISPOSABLE stack.
// node boundaries.js <base> <app.env>. Prints no tokens or keys.
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { execSync } = require('child_process')
const [BASE, ENVF] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING'); process.exit(1) }
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) { console.error('REFUSING'); process.exit(1) }
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const rows = []; const row = (who, test, got, expect, ok) => { rows.push({ who, test, got, expect, ok }); console.log(ok ? '  ok  ' : '  FIND', who.padEnd(10), test, '→', got) }
const T0 = Date.now().toString(36), PW = 'Pw-bound-Aa1x9-spike'
const LENA = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
const OTHER = SQL(`select id from profiles where artist_name = 'Harbour Front'`)
const OTHER_SHOW = SQL(`select id from shows where created_by = '${OTHER}' and status = 'scheduled' limit 1`)
const LENA_SHOW = SQL(`select id from shows where created_by = '${LENA}' and status = 'scheduled' and scheduled_at is not null order by scheduled_at limit 1`)
async function account(label) { const email = `${label}-${T0}@example.test`; const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error; return { id: data.user.id, email } }
async function session(b, email, pw) {
  const ctx = await b.newContext(); const pg = await ctx.newPage()
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', pw); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 60000 })
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); await sb.auth.signInWithPassword({ email, password: pw })
  const api = async (method, p, data) => { const r = await ctx.request.fetch(BASE + p, { method, data, failOnStatusCode: false }); let j = null; try { j = await r.json() } catch {} return { s: r.status(), j } }
  return { ctx, pg, sb, api, page: async p => { await pg.goto(BASE + p); await pg.waitForTimeout(800); return new URL(pg.url()).pathname } }
}
;(async () => {
  const b = await chromium.launch()
  const owner = await session(b, 'pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  const T = await account('team'), U = await account('plain'), V = await account('race')
  // T: a tour manager for Lena with NO beta admission ("team-only"), produced with today's flow plus a temporary beta row.
  for (const who of [T, V]) { const r = await owner.api('POST', '/api/team/invite', { artist_id: LENA, delegate_email: who.email, role: 'tour_manager' }); if (!r.j?.success) throw new Error('invite failed ' + r.s) }
  const tok = e => SQL(`select invite_token from artist_delegates where invited_email = '${e}'`)
  const TT = tok(T.email)
  SQL(`insert into beta_invites (email) values ('${T.email}')`)
  const t = await session(b, T.email, PW)
  const acc = await t.api('POST', '/api/team/accept', { token: TT }); if (!acc.j?.success) throw new Error('accept failed')
  SQL(`delete from beta_invites where email = '${T.email}'`)
  const u = await session(b, U.email, PW)

  console.log('— Pages (middleware is the only beta gate)')
  for (const [who, s] of [['team-only', t], ['plain', u]]) row(who, 'GET /app/dashboard', await s.page('/app/dashboard'), '/beta', (await s.page('/app/dashboard')) === '/beta')

  console.log('— Artist setup')
  for (const [who, s, id] of [['team-only', t, T.id], ['plain', u, U.id]]) {
    const cur = (await s.sb.from('profiles').select('updated_at').eq('id', id).maybeSingle()).data
    const r = await s.api('POST', '/api/profile/update', { subjectId: id, expectedUpdatedAt: cur?.updated_at ?? null, fields: { artist_name: `Self Setup ${who}` } })
    row(who, 'POST /api/profile/update {artist_name}', r.s, 'today: allowed for any signed-in account', true)
  }
  console.log('— Requesting to manage another artist')
  const otherEmail = SQL(`select email from profiles where id = '${OTHER}'`)
  for (const [who, s] of [['team-only', t], ['plain', u]]) { const r = await s.api('POST', '/api/team/request', { artist_email: otherEmail }); row(who, 'POST /api/team/request (Harbour Front)', `${r.s} ${r.j?.error || (r.j?.success ? 'request created' : '')}`, 'today: allowed for any signed-in account', true) }

  console.log('— Unrelated workspace (Harbour Front)')
  for (const [who, s] of [['team-only', t], ['plain', u]]) {
    row(who, 'GET /api/shows/timeline other', (await s.api('GET', `/api/shows/timeline?artist_id=${OTHER}&section=history`)).s, 403, (await s.api('GET', `/api/shows/timeline?artist_id=${OTHER}&section=history`)).s === 403)
    const sch = await s.api('GET', `/api/shows/schedule?artist_id=${OTHER}`); const n = (sch.j?.shows || sch.j?.upcoming || []).length; row(who, 'GET /api/shows/schedule other', `${sch.s} ${n} shows; keys=${Object.keys(sch.j || {}).join(',')}`, '403, or 200 with nothing', sch.s === 403 || (sch.s === 200 && n === 0))
    const pf = await s.sb.from('performances').select('id').eq('user_id', OTHER); row(who, 'REST performances other', `${pf.data?.length} rows`, '0 rows', pf.data?.length === 0)
    const up = await s.api('POST', '/api/upload-performance', { targetUserId: OTHER }); row(who, 'POST /api/upload-performance for other', up.s, '403', up.s === 403)
    const st = await s.sb.rpc('start_scheduled_show', { p_show_id: OTHER_SHOW }); row(who, 'rpc start_scheduled_show other', st.error?.message?.slice(0, 40) || 'STARTED', 'NOT_AUTHORIZED', /NOT_AUTHORIZED|SHOW_NOT_FOUND/.test(st.error?.message || ''))
    const pd = await s.api('GET', `/api/proof/summary?artist_id=${OTHER}`); row(who, 'GET /api/proof/summary other', pd.s, '403', pd.s === 403)
  }
  console.log('— Privileged operations')
  for (const [who, s] of [['team-only', t], ['plain', u]]) {
    for (const [m, p, d] of [['GET', '/api/admin/waitlist'], ['POST', '/api/admin/beta-invite', { email: `x-${T0}@example.test` }], ['GET', '/api/publisher/dashboard'], ['GET', '/api/rd-log'], ['POST', '/api/team/invite', { artist_id: LENA, delegate_email: `y-${T0}@example.test`, role: 'manager' }], ['DELETE', '/api/team/delegates', { delegate_id: V.id, artist_id: LENA }]]) {
      const r = await s.api(m, p, d); row(who, `${m} ${p}`, r.s, '401/403', r.s === 401 || r.s === 403)
    }
  }
  console.log('— Assigned role (team-only tour manager for Lena)')
  row('team-only', 'GET timeline Lena', (await t.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 200, (await t.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 200)
  row('team-only', 'GET schedule Lena', (await t.api('GET', `/api/shows/schedule?artist_id=${LENA}`)).s, 200, (await t.api('GET', `/api/shows/schedule?artist_id=${LENA}`)).s === 200)
  const upL = await t.api('POST', '/api/upload-performance', { targetUserId: LENA }); row('team-only', 'POST upload-performance for Lena', upL.s, 200, upL.s === 200)
  const own = await t.sb.from('performances').insert({ user_id: T.id, venue_name: 'Own Workspace Probe', status: 'draft', performance_date: '2026-10-26' }).select('id')
  row('team-only', 'REST insert performance for SELF', own.error ? own.error.message.slice(0, 50) : 'inserted', 'today: allowed for any account', true)

  console.log('— Revocation, same session, no reload')
  const TROW = SQL(`select id from artist_delegates where delegate_id = '${T.id}' and artist_id = '${LENA}'`)
  const rv = await owner.api('DELETE', '/api/team/delegates', { delegate_id: TROW, artist_id: LENA }); row('owner', 'remove T (Team page action)', `${rv.s} revoked=${SQL(`select revoked_at is not null from artist_delegates where id = '${TROW}'`)}`, '200 revoked=t', rv.s === 200 && SQL(`select revoked_at is not null from artist_delegates where id = '${TROW}'`) === 't')
  row('team-only', 'GET timeline Lena (after revoke)', (await t.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 403, (await t.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 403)
  const rp = await t.sb.from('performances').select('id').eq('user_id', LENA); row('team-only', 'REST performances Lena (after revoke)', `${rp.data?.length} rows`, '0', rp.data?.length === 0)
  const ru = await t.api('POST', '/api/upload-performance', { targetUserId: LENA }); row('team-only', 'upload-performance Lena (after revoke)', ru.s, 403, ru.s === 403)
  const rs = await t.sb.rpc('start_scheduled_show', { p_show_id: LENA_SHOW }); row('team-only', 'rpc start Lena show (after revoke)', rs.error?.message?.slice(0, 40) || 'STARTED', 'NOT_AUTHORIZED', /NOT_AUTHORIZED/.test(rs.error?.message || ''))
  const rg = await t.api('GET', `/api/team/accept?token=${TT}`); row('team-only', 'GET accept with revoked token', rg.s, 404, rg.s === 404)
  SQL(`insert into beta_invites (email) values ('${T.email}')`)
  const ra = await t.api('POST', '/api/team/accept', { token: TT }); row('team-only', 'POST accept revoked (admitted)', `${ra.s} ${ra.j?.error || ''}`, '404 no longer valid', ra.s === 404)
  SQL(`delete from beta_invites where email = '${T.email}'`)

  console.log('— Invitations')
  const r1 = await owner.api('POST', '/api/team/invite', { artist_id: LENA, delegate_email: V.email, role: 'tour_manager' })
  row('owner', 'resend pending invite', r1.j?.invite_url?.endsWith(tok(V.email)) ? 'same token reused' : 'new token', 'today: same token', true)
  SQL(`insert into beta_invites (email) values ('${V.email}')`)
  const v = await session(b, V.email, PW)
  const old = tok(V.email), fresh = crypto.randomBytes(16).toString('hex')
  SQL(`update artist_delegates set invite_token = '${fresh}', invited_at = now() where invited_email = '${V.email}'`)
  row('race', 'old token after rotation (GET)', (await v.api('GET', `/api/team/accept?token=${old}`)).s, 404, (await v.api('GET', `/api/team/accept?token=${old}`)).s === 404)
  const par = await Promise.all([1, 2, 3].map(() => v.api('POST', '/api/team/accept', { token: fresh })))
  const stamps = SQL(`select count(*) || ' row(s), accepted=' || bool_and(accepted_at is not null) from artist_delegates where invited_email = '${V.email}'`)
  row('race', '3 concurrent accepts', `${par.map(p => p.s).join(',')}; ${stamps}`, 'all 200; one row', par.every(p => p.s === 200) && stamps.startsWith('1 row'))
  const rep = await v.api('POST', '/api/team/accept', { token: fresh }); row('race', 'repeat accept', `${rep.s} ${JSON.stringify(rep.j)}`, '200 already_accepted', rep.j?.already_accepted === true)
  SQL(`update artist_delegates set invited_at = now() - interval '30 days' where invited_email = '${V.email}'`)
  row('race', 'membership after its invite is 30 days old', (await v.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 200, (await v.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 200)
  const other2 = await account('wrong'); SQL(`insert into beta_invites (email) values ('${other2.email}')`)
  const w = await session(b, other2.email, PW); const wa = await w.api('POST', '/api/team/accept', { token: fresh }); row('wrong', 'accept someone else’s accepted invite', `${wa.s} ${wa.j?.error || JSON.stringify(wa.j)}`, '403', wa.s === 403)
  const wt = await w.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`); row('wrong', '…and does that grant access? timeline Lena', wt.s, 403, wt.s === 403)

  fs.writeFileSync(path.join(path.dirname(process.argv[1]), 'boundaries-results.json'), JSON.stringify(rows, null, 1))
  await b.close()
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })

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
  return { ctx, pg, api, page: async p => { await pg.goto(BASE + p); await pg.waitForTimeout(700); return new URL(pg.url()).pathname } }
}
// A second, independent "device": its own password sign-in, never touching the browser.
async function device(email) { const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); const { data, error } = await sb.auth.signInWithPassword({ email, password: PW }); if (error) throw error; return { sb, refresh: data.session.refresh_token } }
async function mailCode(to, after) {
  for (let i = 0; i < 30; i++) {
    const m = await (await fetch(`${MP}/search?query=to:${encodeURIComponent(to)}`)).json()
    const fresh = (m.messages || []).filter(x => new Date(x.Created).getTime() >= after)
    if (fresh.length) { const full = await (await fetch(`${MP}/message/${fresh[0].ID}`)).json(); const c = ((full.Text || '').match(/\b(\d{6})\b/) || [])[1]; if (c) secrets.add(c); return { code: c, count: fresh.length } }
    await sleep(300)
  }
  return { code: null, count: 0 }
}
const mailCount = async to => ((await (await fetch(`${MP}/search?query=to:${encodeURIComponent(to)}`)).json()).messages || []).length
const tokFor = e => { const t = SQL(`select invite_token from artist_delegates where invited_email = '${e}' and artist_id = '${LENA}'`); if (t) secrets.add(t); return t }
const rowFor = e => SQL(`select coalesce(delegate_id::text,'null') || '|' || (accepted_at is not null) || '|' || (revoked_at is not null) from artist_delegates where invited_email = '${e}' and artist_id = '${LENA}'`)
const sessionsOf = id => Number(SQL(`select count(*) from auth.sessions where user_id = '${id}'`))
const wrongCode = c => String((Number(c) + 1) % 1000000).padStart(6, '0')
// Opens the accept page first, as the real flow does (the /app layout also ensures the profile row,
// which the disposable stack's auth schema has no signup trigger for).
async function codeFor(s, who, token) { await s.page(`/app/accept-invite?token=${token}`); const t = Date.now() - 1000; const r = await s.api('POST', '/api/team/accept/code', { token }); const m = await mailCode(who.email, t); return { r, code: m.code } }
// Holds a row lock while changing the row, so an accept already past its read
// blocks on the guarded UPDATE and must re-evaluate it after this commits.
function lockedChange(setClause, id, holdSec = 3) {
  const p = spawn('sh', ['-c', `${PSQL}`]); p.stdin.end(`begin; update artist_delegates set ${setClause} where id = '${id}'; select pg_sleep(${holdSec}); commit;`)
  return new Promise(r => p.on('close', r))
}

;(async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await fetch(`${MP}/messages`, { method: 'DELETE' })
  const b = await chromium.launch()
  const owner = await session(b, 'pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  const invite = async (email, role = 'tour_manager') => { const r = await owner.api('POST', '/api/team/invite', { artist_id: LENA, delegate_email: email, role }); if (!r.j?.success) throw new Error(`invite failed ${r.s} ${r.j?.error}`); return r }

  // ── 1. Fresh inbox code, placeholder invite (no account when invited) ──
  console.log('— 1. Inbox-code acceptance, unadmitted recipient')
  const rEmail = `recip-${T0}@example.test`
  await invite(rEmail)
  const TOK = tokFor(rEmail)
  const R = await account('recip')
  const r = await session(b, R.email)
  row(1, 'unadmitted recipient opens the accept page', await r.page(`/app/accept-invite?token=${TOK}`), '/app/accept-invite (not /beta)', new URL(r.pg.url()).pathname === '/app/accept-invite')
  const g = await r.api('GET', `/api/team/accept?token=${TOK}`)
  row(1, 'GET shows masked address to the recipient', `${g.s} ${g.j?.recipient_email}`, 'r•••@example.test', g.j?.recipient_email === 'r•••@example.test' && g.j?.is_intended_recipient)
  const noCode = await r.api('POST', '/api/team/accept', { token: TOK })
  row(1, 'accept without a code', `${noCode.s} ${noCode.j?.code}; row ${rowFor(rEmail)}`, '400 code_required; still pending', noCode.s === 400 && noCode.j?.code === 'code_required' && rowFor(rEmail) === 'null|false|false')
  const devB = await device(R.email)
  const sessBefore = sessionsOf(R.id)
  const c1 = await codeFor(r, R, TOK)
  row(1, 'send code', `${c1.r.s} sent=${c1.r.j?.sent} to ${c1.r.j?.email}; email arrived=${!!c1.code}`, '200, masked, arrives', c1.r.s === 200 && c1.r.j?.email === 'r•••@example.test' && !!c1.code)
  const again = await r.api('POST', '/api/team/accept/code', { token: TOK })
  row(1, 'second code within 60 s', `${again.s} ${again.j?.code}`, '429 too_soon (Supabase Auth throttle)', again.s === 429 && again.j?.code === 'too_soon')
  const bad = await r.api('POST', '/api/team/accept', { token: TOK, code: wrongCode(c1.code) })
  row(1, 'wrong code', `${bad.s} ${bad.j?.code}; row ${rowFor(rEmail)}`, '400 bad_code; still pending', bad.s === 400 && bad.j?.code === 'bad_code' && rowFor(rEmail) === 'null|false|false')
  const ok = await r.api('POST', '/api/team/accept', { token: TOK, code: c1.code })
  row(1, 'correct code', `${ok.s} ${JSON.stringify(ok.j)}; bound to recipient=${rowFor(rEmail).startsWith(R.id)}`, '200; accepted, bound', ok.s === 200 && ok.j?.success && rowFor(rEmail) === `${R.id}|true|false`)
  const reuse = await r.api('POST', '/api/team/accept/code', { token: TOK })
  row(1, 'code route after acceptance', `${reuse.s} ${JSON.stringify(reuse.j)}`, 'already_accepted, nothing sent', reuse.j?.already_accepted === true)

  console.log('— 1b. Temporary session cleanup (scope local only)')
  const sessAfter = sessionsOf(R.id)
  row('1b', 'auth sessions for the recipient, before → after acceptance', `${sessBefore} → ${sessAfter}`, 'unchanged (verification session revoked)', sessAfter === sessBefore)
  row('1b', 'caller’s browser session still signed in (API)', (await r.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 200, (await r.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 200)
  const gu = await devB.sb.auth.getUser(); const rf = await devB.sb.auth.refreshSession({ refresh_token: devB.refresh })
  row('1b', 'other device still signed in (getUser + refresh)', `${gu.data.user?.id === R.id} / ${!rf.error}`, 'true / true', gu.data.user?.id === R.id && !rf.error)
  const pwDevice = await device(R.email); row('1b', 'password sign-in still works', !!pwDevice, true, !!pwDevice)

  console.log('— 1c. Repeat acceptance by the authorized recipient')
  const rep = await r.api('POST', '/api/team/accept', { token: TOK })
  row('1c', 'repeat accept, no code', `${rep.s} ${JSON.stringify(rep.j)}`, '200 already_accepted', rep.s === 200 && rep.j?.already_accepted === true)
  const repPage = await r.page(`/app/accept-invite?token=${TOK}`); await r.pg.waitForTimeout(800)
  row('1c', 'reopening the link shows the workspace, no code step', `${repPage} "${(await r.pg.textContent('h1').catch(() => ''))}"`, 'You’re in', /You're in/.test(await r.pg.textContent('h1').catch(() => '')))

  // ── 2. Workspace-only admission ──
  console.log('— 2. Workspace-only admission and page allowlist')
  // The workspace pages; the client then lands on Manager or on the selected artist's Dashboard.
  const HOME = ['/app/manager', '/app/dashboard']
  for (const [p, want] of [['/app/dashboard', HOME], ['/app/manager', '/app/manager'], ['/app/team', '/app/team'], ['/app/schedule', '/app/schedule'], ['/app/settings', '/app/settings'], [`/app/artist/${LENA}`, `/app/artist/${LENA}`], ['/app/onboarding', '/app/manager'], ['/app/admin', '/app/manager'], ['/app/new', '/app/manager'], ['/beta', HOME], ['/', HOME]]) {
    const got = await r.page(p); await r.pg.waitForTimeout(600); const final = new URL(r.pg.url()).pathname
    row(2, `team-only GET ${p}`, final, [].concat(want).join(' or '), [].concat(want).includes(final))
  }
  row(2, 'assigned role kept: timeline Lena', (await r.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 200, (await r.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 200)
  row(2, 'assigned role kept: upload for Lena (tour manager)', (await r.api('POST', '/api/upload-performance', { targetUserId: LENA })).s, 200, (await r.api('POST', '/api/upload-performance', { targetUserId: LENA })).s === 200)
  row(2, 'unrelated workspace: timeline Harbour Front', (await r.api('GET', `/api/shows/timeline?artist_id=${OTHER}&section=history`)).s, 403, (await r.api('GET', `/api/shows/timeline?artist_id=${OTHER}&section=history`)).s === 403)

  console.log('— 3. Full admission on restricted actions')
  const req = await r.api('POST', '/api/team/request', { artist_email: OTHER_EMAIL })
  row(3, 'team-only: request to manage another artist', `${req.s} ${req.j?.code}`, '403 admission_required', req.s === 403 && req.j?.code === 'admission_required')
  const prof = SQL(`select updated_at from profiles where id = '${R.id}'`)
  const setup = await r.api('POST', '/api/profile/update', { subjectId: R.id, expectedUpdatedAt: prof, fields: { artist_name: 'Self Setup' } })
  row(3, 'team-only: artist setup through the API', `${setup.s} ${setup.j?.code}`, '403 admission_required', setup.s === 403 && setup.j?.code === 'admission_required')
  const fn = await r.api('POST', '/api/profile/update', { subjectId: R.id, expectedUpdatedAt: prof, fields: { full_name: 'Recipient Person' } })
  row(3, 'team-only: other profile fields still save', fn.s, 200, fn.s === 200)
  SQL(`update profiles set artist_name = 'Direct REST Name' where id = '${R.id}'`) // the database-API bypass, simulated
  const own = await r.api('POST', '/api/team/invite', { artist_id: R.id, delegate_email: `chain-${T0}@example.test`, role: 'manager' })
  row(3, 'team-only with a self-set artist name: invite into own workspace', `${own.s} ${own.j?.code}`, '403 admission_required', own.s === 403 && own.j?.code === 'admission_required')
  row(3, '…artist name kept, not erased', SQL(`select artist_name from profiles where id = '${R.id}'`), 'Direct REST Name', SQL(`select artist_name from profiles where id = '${R.id}'`) === 'Direct REST Name')
  const keep = await r.page('/app/onboarding'); await r.pg.waitForTimeout(500)
  row(3, '…artist name grants no pages: /app/onboarding', new URL(r.pg.url()).pathname, 'not onboarding', new URL(r.pg.url()).pathname !== '/app/onboarding')
  const admittedReq = await owner.api('POST', '/api/team/request', { artist_email: OTHER_EMAIL })
  row(3, 'fully admitted artist: request still works', `${admittedReq.s} ${admittedReq.j?.status}`, '200', admittedReq.s === 200)
  // A team-only MANAGER may invite into the managed artist's workspace (independently authorized).
  const mEmail = `mgr-${T0}@example.test`; await invite(mEmail, 'manager'); const MT = tokFor(mEmail)
  const M = await account('mgr'); const m = await session(b, M.email); const cm = await codeFor(m, M, MT); await m.api('POST', '/api/team/accept', { token: MT, code: cm.code })
  const mi = await m.api('POST', '/api/team/invite', { artist_id: LENA, delegate_email: `bymgr-${T0}@example.test`, role: 'viewer' })
  row(3, 'team-only manager invites into the managed artist’s workspace', `${mi.s} ${mi.j?.success}`, '200', mi.s === 200 && mi.j?.success)

  // ── 4. No exemptions ──
  console.log('— 4. No exemptions')
  const A = await account('admitted', { admitted: true }); await invite(A.email); const AT = tokFor(A.email)
  const a = await session(b, A.email)
  const an = await a.api('POST', '/api/team/accept', { token: AT })
  row(4, 'already beta-admitted existing account, no code', `${an.s} ${an.j?.code}`, '400 code_required', an.s === 400 && an.j?.code === 'code_required')

  // ── 5. Identity before "already accepted" ──
  console.log('— 5. Someone else holding an accepted invite’s token')
  const W = await account('wrong', { admitted: true }); const w = await session(b, W.email)
  const wa = await w.api('POST', '/api/team/accept', { token: TOK })
  row(5, 'POST accept', `${wa.s} ${wa.j?.error}`, '403 different account (not already_accepted)', wa.s === 403 && !wa.j?.already_accepted)
  const wc = await w.api('POST', '/api/team/accept/code', { token: AT })
  row(5, 'request a code for someone else’s pending invite', `${wc.s}; emails to caller=${await mailCount(W.email)}`, '403; none sent', wc.s === 403 && (await mailCount(W.email)) === 0)
  // Bound to A's account (as when the address already had an account), then the invited address differs from A's session.
  SQL(`update artist_delegates set delegate_id = '${A.id}', invited_email = 'changed-${T0}@example.test' where invited_email = '${A.email}'`)
  const em = await a.api('POST', '/api/team/accept/code', { token: AT })
  row(5, 'bound recipient whose session email ≠ invited address', `${em.s} ${em.j?.code}`, '403 email_mismatch', em.s === 403 && em.j?.code === 'email_mismatch')
  SQL(`update artist_delegates set delegate_id = null, invited_email = '${A.email}' where invited_email = 'changed-${T0}@example.test'`)

  // ── 6. Expiry, resend rotation ──
  console.log('— 6. Expiry and resend')
  const E = await account('expire'); await invite(E.email); const ET = tokFor(E.email); const e = await session(b, E.email)
  SQL(`update artist_delegates set invited_at = now() - interval '15 days' where invited_email = '${E.email}'`)
  const eg = await e.api('GET', `/api/team/accept?token=${ET}`)
  row(6, 'GET 15-day-old invite', `${eg.s} expired=${eg.j?.expired}`, 'expired=true', eg.j?.expired === true)
  const ec = await e.api('POST', '/api/team/accept/code', { token: ET })
  row(6, 'code for expired invite', `${ec.s} ${ec.j?.code}; emails=${await mailCount(E.email)}`, '410 expired; none sent', ec.s === 410 && (await mailCount(E.email)) === 0)
  const ea = await e.api('POST', '/api/team/accept', { token: ET, code: '123456' })
  row(6, 'accept expired', `${ea.s} ${ea.j?.error}`, '410 "…expired. Ask … to send it again."', ea.s === 410 && /expired\. Ask .* to send it again\./.test(ea.j?.error || ''))
  const dl = await owner.api('GET', `/api/team/delegates?artist_id=${LENA}`)
  row(6, 'owner Team data still lists it (UI marks Expired)', (dl.j?.outgoing || []).some(o => o.email === E.email), true, (dl.j?.outgoing || []).some(o => o.email === E.email))
  const rs = await invite(E.email)
  const ET2 = tokFor(E.email)
  row(6, 'resend rotates token and refreshes invited_at', `new token=${ET2 !== ET}; fresh=${SQL(`select invited_at > now() - interval '1 minute' from artist_delegates where invited_email = '${E.email}'`)}; url uses new=${rs.j?.invite_url?.endsWith(ET2)}`, 'true; t; true', ET2 !== ET && rs.j?.invite_url?.endsWith(ET2))
  row(6, 'old link after resend: GET', (await e.api('GET', `/api/team/accept?token=${ET}`)).s, 404, (await e.api('GET', `/api/team/accept?token=${ET}`)).s === 404)
  row(6, 'old link after resend: send code', (await e.api('POST', '/api/team/accept/code', { token: ET })).s, 404, (await e.api('POST', '/api/team/accept/code', { token: ET })).s === 404)
  const ce = await codeFor(e, E, ET2); const eo = await e.api('POST', '/api/team/accept', { token: ET2, code: ce.code })
  row(6, 'new link accepts with a code', `${eo.s} ${eo.j?.success}`, '200', eo.s === 200 && eo.j?.success)
  SQL(`update artist_delegates set invited_at = now() - interval '30 days' where invited_email = '${E.email}'`)
  row(6, 'accepted membership whose invite is 30 days old', (await e.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 200, (await e.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 200)
  const er = await e.api('POST', '/api/team/accept', { token: ET2 }); row(6, '…and repeat accept still harmless', `${er.s} ${er.j?.already_accepted}`, '200 already_accepted', er.j?.already_accepted === true)
  const rsAcc = await owner.api('POST', '/api/team/invite', { artist_id: LENA, delegate_email: E.email, role: 'tour_manager' })
  row(6, 'resend to an accepted member', `${rsAcc.s}; token unchanged=${tokFor(E.email) === ET2}`, '409; unchanged', rsAcc.s === 409 && tokFor(E.email) === ET2)

  // ── 7. Races inside the guarded write ──
  console.log('— 7. Resend / revoke / expiry racing acceptance (row lock held while the change commits)')
  for (const [label, setClause, want] of [
    ['resend (token rotated)', `invite_token = md5(random()::text), invited_at = now()`, s => s.s === 410 && s.j?.code === 'superseded'],
    ['revoke', `revoked_at = now()`, s => s.s === 404],
    ['expiry (invited_at pushed back)', `invited_at = now() - interval '15 days'`, s => s.s === 410 && s.j?.code === 'expired'],
  ]) {
    const X = await account('race' + label.split(' ')[0]); await invite(X.email); const XT = tokFor(X.email); const xs = await session(b, X.email)
    const cx = await codeFor(xs, X, XT); const id = SQL(`select id from artist_delegates where invited_email = '${X.email}'`)
    const lock = lockedChange(setClause, id, 5); await sleep(1500)
    const res = await xs.api('POST', '/api/team/accept', { token: XT, code: cx.code }); await lock
    row(7, `${label} commits while accept is in flight`, `${res.s} ${res.j?.code || res.j?.error || ''}; accepted=${SQL(`select accepted_at is not null from artist_delegates where id = '${id}'`)}`, 'refused; not accepted', want(res) && SQL(`select accepted_at is not null from artist_delegates where id = '${id}'`) === 'f')
  }
  const Y = await account('dbl'); await invite(Y.email); const YT = tokFor(Y.email); const ys = await session(b, Y.email); const cy = await codeFor(ys, Y, YT)
  const par = await Promise.all([1, 2, 3].map(() => ys.api('POST', '/api/team/accept', { token: YT, code: cy.code })))
  row(7, '3 concurrent accepts with one code', `${par.map(p => p.s).join(',')}; ${SQL(`select count(*) || ' row, accepted=' || bool_and(accepted_at is not null) from artist_delegates where invited_email = '${Y.email}'`)}`, 'all 200; one row', par.every(p => p.s === 200) && par.every(p => p.j?.success))

  // ── 8. Attempt bounds ──
  console.log('— 8. Send throttling and bounded verification')
  const Z = await account('bound'); await invite(Z.email); const ZT = tokFor(Z.email); const zs = await session(b, Z.email)
  const sends = []; for (let i = 0; i < 6; i++) sends.push(await zs.api('POST', '/api/team/accept/code', { token: ZT }))
  row(8, '6 code requests in a row', sends.map(s => `${s.s}${s.j?.code ? ':' + s.j.code : ''}`).join(', '), '200, then too_soon ×4, then too_many_codes', sends[0].s === 200 && sends.slice(1, 5).every(s => s.j?.code === 'too_soon') && sends[5].j?.code === 'too_many_codes')
  const zc = (await mailCode(Z.email, 0)).code
  const burst = await Promise.all(Array.from({ length: 15 }, () => zs.api('POST', '/api/team/accept', { token: ZT, code: wrongCode(zc) })))
  const n400 = burst.filter(x => x.j?.code === 'bad_code').length, n429 = burst.filter(x => x.j?.code === 'too_many_attempts').length
  row(8, '15 concurrent wrong codes', `${n400} checked, ${n429} refused`, 'at most 10 checked', n400 <= 10 && n400 + n429 === 15)
  const right = await zs.api('POST', '/api/team/accept', { token: ZT, code: zc })
  row(8, 'correct code after the limit', `${right.s} ${right.j?.code}; accepted=${rowFor(Z.email).includes('|true|')}`, '429; not accepted', right.s === 429 && !rowFor(Z.email).includes('|true|'))

  // ── 9. Revocation on the next request ──
  console.log('— 9. Revocation')
  const RROW = SQL(`select id from artist_delegates where delegate_id = '${R.id}' and artist_id = '${LENA}'`)
  const rv = await owner.api('DELETE', '/api/team/delegates', { delegate_id: RROW, artist_id: LENA })
  row(9, 'owner removes the recipient', rv.s, 200, rv.s === 200)
  row(9, 'next API request (same session)', (await r.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s, 403, (await r.api('GET', `/api/shows/timeline?artist_id=${LENA}&section=history`)).s === 403)
  await r.page('/app/schedule'); row(9, 'next page load', new URL(r.pg.url()).pathname, '/beta', new URL(r.pg.url()).pathname === '/beta')
  const ra = await r.api('POST', '/api/team/accept', { token: TOK }); row(9, 'repeat accept after removal', `${ra.s} ${ra.j?.error}`, '404 no longer valid', ra.s === 404)

  // ── 10. Screens (390 px) ──
  console.log('— 10. Screens')
  const U = await account('screen'); await invite(U.email, 'manager'); const UT = tokFor(U.email); const us = await session(b, U.email, PW, { width: 390, height: 844 })
  await us.page(`/app/accept-invite?token=${UT}`); await us.pg.waitForSelector('text=Confirm it’s you'); await us.pg.screenshot({ path: `${SHOTS}/1-accept-before-code.png`, fullPage: true })
  const t1 = Date.now() - 1000; await us.pg.click('button:has-text("Send code")'); await us.pg.waitForSelector('input[autocomplete="one-time-code"]'); const uc = (await mailCode(U.email, t1)).code
  await us.pg.screenshot({ path: `${SHOTS}/2-code-sent.png`, fullPage: true })
  await us.pg.fill('input[autocomplete="one-time-code"]', wrongCode(uc)); await us.pg.click('button:has-text("Accept")'); await us.pg.waitForSelector('text=That code didn’t work'); await us.pg.screenshot({ path: `${SHOTS}/3-wrong-code.png`, fullPage: true })
  await us.pg.fill('input[autocomplete="one-time-code"]', uc); await us.pg.click('button:has-text("Accept")'); await us.pg.waitForSelector('text=You\'re in'); await us.pg.screenshot({ path: `${SHOTS}/4-accepted.png`, fullPage: true })
  row(10, 'UI: send code → wrong code → right code → You’re in', 'done', 'done', true)
  const V = await account('expview'); await invite(V.email); SQL(`update artist_delegates set invited_at = now() - interval '15 days' where invited_email = '${V.email}'`); const VT = tokFor(V.email)
  const vs = await session(b, V.email, PW, { width: 390, height: 844 }); await vs.page(`/app/accept-invite?token=${VT}`); await vs.pg.waitForSelector('text=Invitation expired'); await vs.pg.screenshot({ path: `${SHOTS}/5-expired.png`, fullPage: true })
  const ow = await session(b, 'pp-imp@example.test', 'Pw-pp-imp-Aa1x9', { width: 390, height: 844 }); await ow.page('/app/team'); await ow.pg.waitForSelector('text=Outgoing Invitations'); const ex = ow.pg.locator(`text=${V.email}`).first(); await ex.scrollIntoViewIfNeeded(); await ow.pg.waitForTimeout(300)
  const card = ow.pg.locator('div', { has: ow.pg.locator(`text=${V.email}`) }).filter({ hasText: 'Expired' }).last(); await card.screenshot({ path: `${SHOTS}/6-team-expired.png` })
  row(10, 'Team page marks the 15-day-old invite Expired', await card.isVisible(), true, await card.isVisible())

  // ── 11. Logs ──
  await sleep(500)
  const log = fs.readFileSync(path.join(path.dirname(ENVF), '..', 'invbuild-server.log'), 'utf8')
  const leaked = [...secrets].filter(s => s && log.includes(s))
  row(11, `server log contains none of the ${secrets.size} tokens/codes used`, `${leaked.length} found`, 0, leaked.length === 0)

  fs.writeFileSync(path.join(path.dirname(process.argv[1]), 'invite-accept-results.json'), JSON.stringify(rows, null, 1))
  console.log(`\n${rows.filter(x => x.ok).length}/${rows.length} passed`)
  await b.close()
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })

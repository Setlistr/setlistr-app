// Shared verification limit through the app, auth server at production's limits
// (verify 30 / 5 min per IP, keyed by X-Forwarded-For; the app server is one IP). Disposable only; prints no codes.
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, ENVF] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) process.exit(1)
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) process.exit(1)
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At', { input: q }).toString().trim()
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const MP = 'http://127.0.0.1:54625/api/v1', sleep = ms => new Promise(r => setTimeout(r, ms))
const out = {}
;(async () => {
  const b = await chromium.launch(), PW = 'Pw-inv-Aa1x9-cand', T0 = Date.now().toString(36)
  const LENA = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
  const login = async email => { const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', email.startsWith('pp-imp') ? 'Pw-pp-imp-Aa1x9' : PW); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth')); return { ctx, pg, post: async (p, d) => { const r = await ctx.request.post(BASE + p, { data: d, failOnStatusCode: false }); return { s: r.status(), j: await r.json() } } } }
  const owner = await login('pp-imp@example.test')
  const person = async label => { const email = `${label}-${T0}@example.test`; await owner.post('/api/team/invite', { artist_id: LENA, delegate_email: email, role: 'viewer' }); await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); const s = await login(email); const token = SQL(`select invite_token from artist_delegates where invited_email = '${email}'`); await s.pg.goto(`${BASE}/app/accept-invite?token=${token}`); return { ...s, email, token } }
  const tally = rs => { const g = {}; for (const r of rs) { const k = `${r.s} ${r.j.code || (r.j.success ? 'success' : '')}`; g[k] = (g[k] || 0) + 1 } return g }
  await sleep(310000) // let the probe's bucket refill
  // 1. Exact sequential bound for one account: 11 wrong codes in a row.
  const a = await person('seq'); const seq = []; for (let i = 0; i < 11; i++) seq.push(await a.post('/api/team/accept', { token: a.token, code: '00000001' }))
  out['1. one account, 11 sequential wrong codes'] = seq.map(r => r.j.code).join(',')
  // 2. Three accounts use 30 verifications between them (10 each, the app's cap) in under a minute.
  const others = [await person('ex1'), await person('ex2')]
  for (const o of others) for (let i = 0; i < 10; i++) await o.post('/api/team/accept', { token: o.token, code: '00000001' })
  // 3. A legitimate recipient then submits a correct code.
  const d = await person('legit'); const t = Date.now() - 1000
  await d.post('/api/team/accept/code', { token: d.token })
  let code = null; for (let i = 0; i < 30 && !code; i++) { const m = await (await fetch(`${MP}/search?query=to:${encodeURIComponent(d.email)}`)).json(); const msg = (m.messages || []).find(x => new Date(x.Created).getTime() >= t); if (msg) code = (((await (await fetch(`${MP}/message/${msg.ID}`)).json()).Text || '').match(/\b(\d{8})\b/) || [])[1]; if (!code) await sleep(300) }
  const first = await d.post('/api/team/accept', { token: d.token, code })
  out['3. legitimate correct code right after (shared bucket empty)'] = `${first.s} ${first.j.code || ''} "${first.j.error || ''}"`
  let waited = 0, later = first
  while (later.s === 429 && waited < 120) { await sleep(12000); waited += 12; later = await d.post('/api/team/accept', { token: d.token, code }) }
  out['4. same code retried'] = `${later.s} ${later.j.success ? 'accepted' : later.j.code} after ${waited}s`
  out['   accepted in DB'] = SQL(`select accepted_at is not null from artist_delegates where invited_email = '${d.email}'`)
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(__dirname, 'shared-limit-results.json'), JSON.stringify(out, null, 1))
  await b.close()
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })

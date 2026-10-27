// App messages for send refusals at production limits. Disposable only; prints no codes.
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, ENVF] = process.argv.slice(2)
const { createClient } = require(path.join('/Users/jesseslack/setlistr-manager-workspace/setlistr-2', 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) process.exit(1)
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At', { input: q }).toString().trim()
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
;(async () => {
  const b = await chromium.launch(), PW = 'Pw-inv-Aa1x9-cand', T0 = Date.now().toString(36), out = {}
  const LENA = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
  const login = async (email, pw) => { const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', pw); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth')); return { ctx, pg, post: async (p, d) => { const r = await ctx.request.post(BASE + p, { data: d, failOnStatusCode: false }); return { s: r.status(), j: await r.json() } } } }
  const owner = await login('pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  const email = `sendmsg-${T0}@example.test`; await owner.post('/api/team/invite', { artist_id: LENA, delegate_email: email, role: 'viewer' }); await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  const s = await login(email, PW); const token = SQL(`select invite_token from artist_delegates where invited_email = '${email}'`); await s.pg.goto(`${BASE}/app/accept-invite?token=${token}`)
  const a = await s.post('/api/team/accept/code', { token }), b2 = await s.post('/api/team/accept/code', { token })
  out['first send'] = `${a.s} ${a.j.sent ? 'sent' : a.j.code}`; out['same person again within 60 s'] = `${b2.s} ${b2.j.code}: "${b2.j.error}"`
  // Use up the shared per-IP send allowance with other addresses, then this person asks again after their 60 s.
  const email2 = `sendmsg2-${T0}@example.test`; await owner.post('/api/team/invite', { artist_id: LENA, delegate_email: email2, role: 'viewer' }); await admin.auth.admin.createUser({ email: email2, password: PW, email_confirm: true })
  const s2 = await login(email2, PW); const token2 = SQL(`select invite_token from artist_delegates where invited_email = '${email2}'`); await s2.pg.goto(`${BASE}/app/accept-invite?token=${token2}`)
  for (let i = 0; i < 32; i++) { const e = `filler-${i}-${T0}@example.test`; await admin.auth.admin.createUser({ email: e, password: PW, email_confirm: true }); await anon().auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } }) }
  const c = await s2.post('/api/team/accept/code', { token: token2 })
  out['another person, right after the shared allowance is used up'] = `${c.s} ${c.j.code}: "${c.j.error}"`
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(__dirname, 'send-msg-results.json'), JSON.stringify(out, null, 1)); await b.close()
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })

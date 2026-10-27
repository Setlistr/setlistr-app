// Concurrent wrong-code burst, grouped by which limit refused it. Disposable only; prints no codes.
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const [BASE, ENVF, N] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) process.exit(1)
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) process.exit(1)
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At', { input: q }).toString().trim()
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
;(async () => {
  const b = await chromium.launch(), PW = 'Pw-inv-Aa1x9-cand', T0 = Date.now().toString(36)
  const login = async (email, pw) => { const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', pw); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth')); return { ctx, pg } }
  const LENA = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
  const owner = await login('pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  const email = `burst-${T0}@example.test`
  await owner.ctx.request.post(BASE + '/api/team/invite', { data: { artist_id: LENA, delegate_email: email, role: 'viewer' } })
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  const z = await login(email, PW); const tok = SQL(`select invite_token from artist_delegates where invited_email = '${email}'`)
  await z.pg.goto(`${BASE}/app/accept-invite?token=${tok}`)
  const res = await Promise.all(Array.from({ length: Number(N) }, () => z.ctx.request.post(BASE + '/api/team/accept', { data: { token: tok, code: '000001' }, failOnStatusCode: false }).then(r => r.json())))
  const g = {}; for (const r of res) g[r.error] = (g[r.error] || 0) + 1
  console.log(JSON.stringify(g, null, 1))
  await b.close()
})()

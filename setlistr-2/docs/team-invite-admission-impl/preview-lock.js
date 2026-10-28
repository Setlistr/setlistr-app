// Preview lock: the same build started with SETLISTR_INVITE_PREVIEW=1. Disposable only; prints no tokens.
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
const MP = 'http://127.0.0.1:54625/api/v1'
;(async () => {
  const b = await chromium.launch(), PW = 'Pw-inv-Aa1x9-cand', T0 = Date.now().toString(36)
  const login = async (email, pw) => { const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', pw); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth')); return { ctx, pg, post: async (p, d) => { const r = await ctx.request.post(BASE + p, { data: d, failOnStatusCode: false }); return { s: r.status(), j: await r.json() } } } }
  const LENA = SQL(`select id from auth.users where email = 'pp-imp@example.test'`)
  const mails = async () => (await (await fetch(`${MP}/messages?limit=1`)).json()).messages_count
  const owner = await login('pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  // An existing pending invite (created directly, as one made on production would be).
  const email = `prevlock-${T0}@example.test`
  SQL(`insert into artist_delegates (artist_id, delegate_id, role, invited_by, invited_email) values ('${LENA}', null, 'viewer', '${LENA}', '${email}')`)
  const before = SQL(`select invite_token || invited_at from artist_delegates where invited_email = '${email}'`)
  await admin.auth.admin.createUser({ email, password: PW, email_confirm: true })
  const m0 = await mails()
  const inv = await owner.post('/api/team/invite', { artist_id: LENA, delegate_email: `prevnew-${T0}@example.test`, role: 'viewer' })
  const res = await owner.post('/api/team/invite', { artist_id: LENA, delegate_email: email, role: 'viewer' })
  const z = await login(email, PW); const tok = SQL(`select invite_token from artist_delegates where invited_email = '${email}'`)
  await z.pg.goto(`${BASE}/app/accept-invite?token=${tok}`)
  const code = await z.post('/api/team/accept/code', { token: tok })
  const acc = await z.post('/api/team/accept', { token: tok, code: '12345678' })
  const out = {
    'new invite': `${inv.s} ${inv.j.code}`, 'resend existing': `${res.s} ${res.j.code}`, 'send code': `${code.s} ${code.j.code}`, 'accept with code': `${acc.s} ${acc.j.code}`,
    'emails sent': (await mails()) - m0, 'existing invite unchanged (token, invited_at, pending)': SQL(`select invite_token || invited_at from artist_delegates where invited_email = '${email}' and accepted_at is null`) === before,
    'no new invite row': SQL(`select count(*) from artist_delegates where invited_email = 'prevnew-${T0}@example.test'`) === '0',
  }
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(__dirname, 'preview-lock-results.json'), JSON.stringify(out, null, 1))
  await b.close()
})()

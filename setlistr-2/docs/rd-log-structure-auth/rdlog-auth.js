// rd-log/structure authorization against a local mock Anthropic (counts calls). Disposable only.
const path = require('path'), fs = require('fs')
const [ENVF, ...BASES] = process.argv.slice(2)
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL) || !/^http:\/\/127\.0\.0\.1:54627/.test(env.ANTHROPIC_BASE_URL)) { console.error('REFUSING'); process.exit(1) }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const calls = async () => (await (await fetch('http://127.0.0.1:54627/count')).json()).n
;(async () => {
  const b = await chromium.launch(), PW = 'Pw-rd-Aa1x9-mock', T0 = Date.now().toString(36)
  const made = []
  const mk = async email => { const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw error; made.push(data.user.id) }
  await mk(`rd-plain-${T0}@example.test`); await mk('jesse.slack.music@gmail.com')
  const out = {}
  for (const BASE of BASES) {
    const login = async email => { const ctx = await b.newContext(); const pg = await ctx.newPage(); await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', PW); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth')); return ctx }
    const body = { description: 'Tuned recognition thresholds', member: 'Jesse', hours: 1 }
    const call = async ctx => { const before = await calls(); const r = await (ctx ? ctx.request : (await b.newContext()).request).post(BASE + '/api/rd-log/structure', { data: body, failOnStatusCode: false }); return `${r.status()}, provider calls +${(await calls()) - before}` }
    out[BASE] = { 'signed out': await call(null), 'signed in, not admin': await call(await login(`rd-plain-${T0}@example.test`)), 'admin (the R&D Log page’s user)': await call(await login('jesse.slack.music@gmail.com')) }
    const ctx = await login('jesse.slack.music@gmail.com'); const pg = await ctx.newPage(); await pg.goto(BASE + '/app/admin/rd-log'); await pg.waitForTimeout(800)
    out[BASE]['admin page loads'] = new URL(pg.url()).pathname
  }
  for (const id of made) await admin.auth.admin.deleteUser(id)
  out['temporary accounts deleted'] = made.length
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(__dirname, 'rdlog-auth-results.json'), JSON.stringify(out, null, 1))
  await b.close()
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })

// Team invite journey on the deployed app's code (3ce4833 = 577dd3d for every team file), disposable stack only.
const path = require('path'), { execSync } = require('child_process')
const [BASE, OUT] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error('REFUSING'); process.exit(1) }
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
const EMAIL = `crew-${Date.now().toString(36)}@example.test`, PW = 'Pw-crew-Aa1x9-walk'
let n = 0; const shot = async (pg, name) => { await pg.waitForTimeout(1200); await pg.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) }); console.log('shot', n, name, '→', new URL(pg.url()).pathname) }
const login = async (pg, email, pw) => { await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', email); await pg.fill('#auth-password', pw); await pg.press('#auth-password', 'Enter'); await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 60000 }) }
;(async () => {
  const b = await chromium.launch(); const vp = { viewport: { width: 390, height: 844 } }
  // Owner invites a tour manager by email.
  const owner = await (await b.newContext(vp)).newPage()
  await login(owner, 'pp-imp@example.test', 'Pw-pp-imp-Aa1x9')
  await owner.goto(BASE + '/app/team'); await owner.waitForTimeout(2500)
  await owner.getByRole('button', { name: 'Tour Manager', exact: true }).first().click().catch(() => console.log('role button not found; default role kept'))
  await owner.fill('input[placeholder="teammate@email.com"]', EMAIL)
  await owner.press('input[placeholder="teammate@email.com"]', 'Enter')
  await owner.getByText('Copy Invite Link').first().waitFor({ timeout: 20000 })
  await owner.getByText('Copy Invite Link').first().scrollIntoViewIfNeeded(); await shot(owner, 'owner-invite-sent')
  const row = SQL(`select invite_token || '|' || role || '|' || (delegate_id is null) from artist_delegates where invited_email = '${EMAIL}'`).split('|')
  const TOKEN = row[0]; console.log('invite role', row[1], 'placeholder', row[2])
  // Invitee: opens the link with no account.
  const ctx = await b.newContext(vp); const pg = await ctx.newPage()
  await pg.goto(`${BASE}/app/accept-invite?token=${TOKEN}`); await shot(pg, 'invitee-link-signed-out')
  await pg.getByRole('button', { name: /Create account/i }).first().click(); await pg.waitForTimeout(500)
  await pg.fill('#auth-email', EMAIL); await pg.fill('#auth-password', PW); await pg.fill('#auth-confirm', PW)
  await pg.locator('label.sl-terms').first().click()
  await pg.locator('form button[type="submit"]').first().click()
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 60000 }); await shot(pg, 'invitee-after-signup-blocked')
  const accept = await pg.evaluate(async t => { const r = await fetch('/api/team/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }); return { status: r.status, body: await r.json() } }, TOKEN)
  console.log('direct accept while unadmitted:', JSON.stringify(accept))
  await pg.goto(BASE + '/app/dashboard'); console.log('dashboard while unadmitted →', new URL(pg.url()).pathname)
  // Admin approval, simulated on the disposable stack by the row Grant access would insert.
  SQL(`insert into beta_invites (email) values ('${EMAIL}')`)
  await pg.goto(BASE + '/beta'); await pg.waitForTimeout(1500); console.log('after approval, /beta →', new URL(pg.url()).pathname)
  if (!pg.url().includes('accept-invite')) await pg.goto(`${BASE}/app/accept-invite?token=${TOKEN}`)
  await shot(pg, 'invitee-accept-screen')
  await pg.locator('button', { hasText: /^Accept/ }).first().click(); await shot(pg, 'invitee-youre-in')
  await pg.locator('button', { hasText: /Go to Dashboard/i }).first().click(); await pg.waitForTimeout(3000); await shot(pg, 'invitee-artist-workspace')
  console.log('delegation:', SQL(`select role || ' accepted=' || (accepted_at is not null) || ' bound=' || (delegate_id is not null) from artist_delegates where invited_email = '${EMAIL}'`))
  console.log('repeat accept:', JSON.stringify(await pg.evaluate(async t => { const r = await fetch('/api/team/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }); return { status: r.status, body: await r.json() } }, TOKEN)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })

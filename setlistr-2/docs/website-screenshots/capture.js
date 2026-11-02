// Captures current app screens for the website from the LOCAL dev server, signed in as the
// seeded fictional artist. Phone frame 380×823 at 2× = 760×1647 (the existing screenshot size).
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const fs = require('fs'), path = require('path')
const BASE = 'http://localhost:3123'
const L = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-login.json'), 'utf8'))
const step = process.argv[2] || 'all'
;(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const ctx = await b.newContext({ viewport: { width: 380, height: 823 }, deviceScaleFactor: 2, colorScheme: 'dark', permissions: ['microphone', 'geolocation'], geolocation: { latitude: 36.16, longitude: -86.78 } })
  const p = await ctx.newPage(), errs = []
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)))
  await p.goto(BASE + '/auth/login')
  await p.fill('#auth-email', L.email); await p.fill('#auth-password', L.password)
  await p.keyboard.press('Enter')
  await p.waitForURL(/\/app\//, { timeout: 30000 })
  const shot = async (name) => { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(__dirname, name + '.png') }); console.log('shot', name, p.url()) }
  if (step === 'all' || step === 'live') {
    // No recognition calls leave the machine: the page's /api/identify requests get a local "no match" answer.
    let identifyCalls = 0
    await p.route('**/api/identify', r => { identifyCalls++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ detected: false }) }) })
    await p.goto(BASE + '/app/live/' + L.live); await p.waitForTimeout(3000)
    await p.getByText(/^resume$/i).first().click().catch(e => console.log('no resume button', e.message.slice(0, 80)))
    await p.waitForTimeout(6000); await shot('live-raw'); console.log('identify calls answered locally:', identifyCalls)
  }
  if (step === 'all' || step === 'file') { await p.goto(BASE + '/app/file'); await p.waitForTimeout(3000); await shot('file-raw') }
  if (step === 'all' || step === 'review') {
    await p.goto(BASE + '/app/review/' + L.review); await p.waitForTimeout(3000)
    await p.getByRole('button', { name: /Save & Complete/i }).click()
    await p.waitForTimeout(6000)
    const cards = p.getByText(/^Your cards$/).first()
    await cards.scrollIntoViewIfNeeded()
    const y = await cards.evaluate(el => el.getBoundingClientRect().top + window.scrollY)
    await p.evaluate(top => window.scrollTo(0, top - 72), y); await p.waitForTimeout(2500)
    await shot('share-raw')
  }
  console.log('errors:', errs)
  await b.close()
})().catch(e => { console.error(e.message); process.exit(1) })

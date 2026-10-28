// Prototype walkthrough on the local scratch build (disposable stack, mocked shows). Screenshots + tap counts.
const fs = require('fs')
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const [BASE, OUT] = process.argv.slice(2)
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) process.exit(1)
const log = []
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  await pg.goto(BASE + '/auth/login'); await pg.fill('#auth-email', 'pp-imp@example.test'); await pg.fill('#auth-password', 'Pw-pp-imp-Aa1x9'); await pg.press('#auth-password', 'Enter')
  await pg.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 60000 })
  const shot = async name => { await pg.waitForTimeout(500); await pg.screenshot({ path: `${OUT}/${name}.png` }) }
  const dash = async id => { await pg.goto(`${BASE}/app/dashboard?proto=${id}`, { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('select[aria-label="Prototype scenario"]', { timeout: 30000 }); await pg.waitForTimeout(2500) }
  const orb = () => pg.locator('a[aria-label="Capture a show"]:visible').first()

  // 1. One show: Dashboard row → confirm → live (2 taps)
  await dash('one'); await shot('one-1-dashboard')
  let taps = 0
  await pg.getByRole('button', { name: /Start capture at Mohawk/ }).click(); taps++; await shot('one-2-confirm')
  await pg.getByRole('button', { name: 'OK' }).click(); taps++
  await pg.waitForURL(/proto-live/); await shot('one-3-live'); log.push(`one show, Dashboard: ${taps} taps to recording`)
  // gold button: orb → Start capture → confirm → live (3 taps)
  await dash('one'); taps = 0
  await orb().click(); taps++; await pg.waitForSelector('text=A different show', { timeout: 60000 }); await shot('one-4-gold-lead')
  await pg.getByRole('button', { name: /Start capture/ }).click(); taps++; await shot('one-5-gold-confirm')
  await pg.getByRole('button', { name: 'OK' }).click(); taps++; await pg.waitForURL(/proto-live/); log.push(`one show, gold button: ${taps} taps to recording`)
  // A different show → existing choice unchanged
  await dash('one'); await orb().click(); await pg.waitForSelector('text=A different show', { timeout: 60000 }); await pg.getByRole('button', { name: 'A different show' }).click()
  await pg.waitForSelector('text=Start Live Capture', { timeout: 60000 }); await shot('one-6-different-show'); log.push('A different show: existing choice (Start Live Capture / Upload a Recording) shown unchanged')

  // 2. Two shows: Dashboard row → choice → Start → confirm (3 taps)
  await dash('two'); await shot('two-1-dashboard'); taps = 0
  await pg.getByRole('button', { name: /Choose one of 2 shows/ }).click(); taps++; await pg.waitForSelector('text=A different show', { timeout: 60000 }); await shot('two-2-choose')
  await pg.getByRole('button', { name: /Start capture/ }).nth(1).click(); taps++; await shot('two-3-confirm')
  await pg.getByRole('button', { name: 'OK' }).click(); taps++; await pg.waitForURL(/proto-live/); log.push(`two shows, Dashboard: ${taps} taps (row, choose, OK); never auto-chosen`)

  // 3. Date-only booking
  await dash('dateonly'); await shot('dateonly-1-dashboard')
  await orb().click(); await pg.waitForSelector('text=A different show', { timeout: 60000 }); await shot('dateonly-2-gold')
  log.push(`date-only: Start offered = ${await pg.getByRole('button', { name: /^Start capture/ }).count()}; Add a start time = ${await pg.getByRole('button', { name: 'Add a start time' }).count()}`)

  // 4. After midnight, and another zone
  await dash('midnight'); await shot('midnight-1-dashboard')
  await dash('zone'); await shot('zone-1-dashboard')

  // 5. Capture already in progress
  await dash('live'); await shot('live-1-dashboard')
  log.push(`in progress: Tonight Start rows on Dashboard = ${await pg.getByRole('button', { name: /Start capture at/ }).count()}`)
  await orb().click(); await pg.waitForSelector('text=A different show', { timeout: 60000 }); await shot('live-2-gold')

  // 6. Teammate starts first
  await dash('teammate'); await pg.getByRole('button', { name: /Start capture at Mohawk/ }).click(); await pg.getByRole('button', { name: 'OK' }).click()
  await pg.waitForSelector('text=This show was just started by someone else.'); await shot('teammate-1-after')
  log.push(`teammate first: URL stays on ${new URL(pg.url()).pathname}; in-progress row shown = ${await pg.getByText('Show in progress').count() > 0}`)

  // 7. Cancelled while open
  await dash('cancelled'); await orb().click(); await pg.waitForSelector('text=A different show', { timeout: 60000 })
  await pg.getByRole('button', { name: /Start capture/ }).click(); await pg.getByRole('button', { name: 'OK' }).click()
  await pg.waitForSelector('text=This show was cancelled.'); await shot('cancelled-1-after')
  log.push(`cancelled: Start buttons left = ${await pg.getByRole('button', { name: /^Start capture/ }).count()}`)

  // 8. Viewer
  await dash('viewer'); await shot('viewer-1-dashboard')
  log.push(`viewer: gold button = ${await orb().count()}; Start rows = ${await pg.getByRole('button', { name: /Start capture/ }).count()}`)

  // 9. Nothing scheduled
  await dash('none'); await shot('none-1-dashboard'); await orb().click(); await pg.waitForSelector('text=Start Live Capture', { timeout: 60000 }); await shot('none-2-gold')
  log.push('nothing scheduled: gold button opens today\'s unchanged first screen')

  fs.writeFileSync(`${OUT}/walk-log.txt`, log.join('\n')); console.log(log.join('\n'))
  await b.close()
})().catch(e => { console.error('ERROR', e.message.split('\n')[0]); fs.writeFileSync(`${OUT}/walk-log.txt`, log.join('\n')); process.exit(1) })

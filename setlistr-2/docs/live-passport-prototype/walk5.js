const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const url = 'file://' + __dirname + '/passport-loop.html'
;(async () => {
  const b = await chromium.launch(), errs = []
  async function page(w, h, scheme) { const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); await p.goto(url); await p.waitForTimeout(700); return p }
  const shot = (p, n, full) => p.screenshot({ path: 'shots5/' + n + '.png', fullPage: !!full })
  const text = async p => (await p.textContent('main')).replace(/\s+/g, ' ').slice(0, 900)
  for (const [scheme, tag] of [['dark', 'dark'], ['light', 'light']]) {
    const p = await page(400, 860, scheme)
    await shot(p, `01-today-first-viewport-${tag}`)
    if (tag === 'light') { await p.close(); continue }
    await shot(p, '02-today-full', true); console.log('TODAY:', await text(p))
    await p.click('#go'); await p.waitForTimeout(200); await shot(p, '03-plan-start')
    await p.click('[data-bring]'); await p.waitForTimeout(150); await shot(p, '04-plan-choose')
    await p.click('[data-swap="2"]'); await p.waitForTimeout(150); await shot(p, '05-plan-compare', true)
    await p.click('#go'); await p.waitForTimeout(150); await shot(p, '06-show-day')
    await p.click('#go'); await p.waitForTimeout(500); await shot(p, '07-photo-reading')
    await p.waitForTimeout(1200); await shot(p, '08-confirm-questions', true); console.log('CONFIRM:', await text(p))
    await p.click('[data-ans="x"][data-v="skip"]'); await p.click('[data-ans="add"][data-v="song"]'); await p.waitForTimeout(150)
    await p.click('[data-tog="6"]'); await p.click('[data-edit="1"]'); await p.selectOption('[data-fix="1"]', 'Jolene')
    await p.locator('#interp').scrollIntoViewIfNeeded(); await shot(p, '08b-interpreted-set'); console.log('ACT:', await p.textContent('#act'))
    await p.click('#go')
    await p.waitForTimeout(500); await shot(p, '09-transform-midway')
    await p.waitForTimeout(2600); await shot(p, '10-done-payoff', true); console.log('DONE:', await text(p))
    await p.click('#go'); await p.waitForTimeout(300); await shot(p, '11-next-quebec'); console.log('NEXT:', (await text(p)).slice(0, 400))
    console.log('overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  }
  const n = await page(400, 860, 'dark'); await n.click('[data-scn=new]'); await n.waitForTimeout(200); await shot(n, '12-new-today', true); console.log('NEW:', await text(n))
  await n.click('#go'); await n.click('[data-bring]'); await n.click('[data-swap="7"]'); await n.click('#go'); await n.click('#go'); await n.waitForTimeout(1700)
  await n.click('[data-ans="x"][data-v="played"]'); await n.click('[data-ans="add"][data-v="none"]'); await n.click('#go'); await n.waitForTimeout(3000)
  await shot(n, '13-new-done', true); console.log('NEW DONE:', await text(n))
  await n.click('#go'); await n.waitForTimeout(200); await shot(n, '14-new-after'); 
  const q = await page(400, 860, 'dark'); await q.click('[data-photo]'); await q.waitForTimeout(1700); await shot(q, '17-direct-photo-no-plan', true)
  await q.click('[data-ans="x"][data-v="played"]'); await q.click('[data-ans="add"][data-v="song"]'); await q.click('#go'); await q.waitForTimeout(3000); await shot(q, '18-direct-done', true); console.log('DIRECT DONE:', await text(q))
  const u = await page(400, 860, 'dark'); await u.click('#go'); await u.waitForTimeout(150); await shot(u, '19-set-unchanged'); console.log('UNCHANGED act:', await u.textContent('#act'))
  const d = await page(1280, 900, 'dark'); await shot(d, '15-desktop-dark'); const l = await page(1280, 900, 'light'); await shot(l, '16-desktop-light')
  console.log('errors:', errs); await b.close()
})()

const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const url = 'file://' + __dirname + '/live-passport.html'
;(async () => {
  const b = await chromium.launch(), errs = []
  async function page(w, h, scheme) { const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2 }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); await p.goto(url); await p.waitForTimeout(700); return p }
  let p = await page(400, 860, 'dark')
  await p.screenshot({ path: 'shots/1-phone-first-dark.png' })
  console.log('overflow phone:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  await p.click('#go'); await p.waitForTimeout(800)
  await p.screenshot({ path: 'shots/2-phone-montreal-payoff-dark.png' })
  console.log('insight:', await p.textContent('.insight'))
  await p.click('.night summary'); await p.waitForTimeout(300)
  await p.screenshot({ path: 'shots/3-phone-night-evidence-dark.png' })
  console.log('action now:', await p.textContent('#act'))
  p = await page(400, 860, 'light'); await p.screenshot({ path: 'shots/4-phone-first-light.png' })
  p = await page(400, 860, 'dark'); await p.click('[data-scn=new]'); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/5-phone-new-artist-dark.png' })
  await p.click('[data-city="Hamilton"]'); await p.waitForTimeout(600); console.log('new insight:', await p.textContent('.insight')); await p.screenshot({ path: 'shots/6-phone-new-artist-city.png' })
  p = await page(1280, 900, 'dark'); await p.click('#go'); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/7-desktop-montreal-dark.png' })
  p = await page(1280, 900, 'light'); await p.click('#go'); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/8-desktop-montreal-light.png' })
  for (const c of ['Toronto', 'Kingston', 'Halifax']) { const q = await page(400, 860, 'dark'); await q.click('[data-all]').catch(() => {}); await q.click(`[data-city="${c}"]`); console.log(c, '→', await q.textContent('.insight')); await q.close() }
  console.log('errors:', errs); await b.close()
})()

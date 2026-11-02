const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
;(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1200, height: 1000 } })
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
  await p.goto('file://' + __dirname + '/before-tonight.html'); await p.waitForTimeout(400)
  const shot = n => p.screenshot({ path: __dirname + '/shots/' + n + '.png', fullPage: true })
  for (const sc of ['rich', 'low', 'gap']) {
    await p.click('#sc-' + sc); await shot(sc + '-1-before')
    if (sc === 'rich') { const chips = await p.$$('.chip'); for (const c of chips.slice(0, 3)) await (await p.$$('.chip'))[chips.indexOf(c)].click(); await p.click('#savePlan'); await shot(sc + '-1b-plan') }
    await p.click('#st-after'); await p.click('#addPhoto'); await p.waitForTimeout(1600)
    if (sc === 'gap') { await shot(sc + '-2-unreadable'); await p.click('#retake'); await p.waitForTimeout(1600) }
    await shot(sc + '-2-after'); await p.click('#toConfirm')
    await p.click('[data-h="yes"]'); await p.click('[data-o="yes"]')
    for (let k = 0; k < 12; k++) { const open = await p.$('.q:not(.done) [data-q]'); if (!open) break; await open.click() }
    await shot(sc + '-3-confirm'); await p.click('#doConfirm'); await p.waitForTimeout(1400); await shot(sc + '-4-reward')
    console.log(sc, 'reward text:', (await p.textContent('#discs')).replace(/\s+/g, ' ').slice(0, 300))
  }
  console.log('errors:', JSON.stringify(errs)); await b.close()
})()

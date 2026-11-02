// Renders fixtures/truth.json into stage-setlist "photos" (fixtures/img/<id>.jpg) with Playwright,
// and records which lines are visible in the frame (fixtures/visibility.json). Local only.
const fs = require('fs'), path = require('path')
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const DIR = path.join(__dirname, 'fixtures'), IMG = path.join(DIR, 'img'); fs.mkdirSync(IMG, { recursive: true })
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'truth.json'), 'utf8'))
const FONTS = { typed: '800 1em "Helvetica Neue", Helvetica, sans-serif', marker: '400 1em "Marker Felt"', hand_bradley: '700 1em "Bradley Hand"',
  hand_noteworthy: '400 1em "Noteworthy"', hand_chalk: '400 1em "Chalkboard SE"', hand_snell: '700 1em "Snell Roundhand"' }
const W = 1100, H = 1466
function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) }
function rnd(seed) { let x = seed; return () => (x = (x * 9301 + 49297) % 233280) / 233280 }

function html(f, i) {
  const r = rnd(i + 7), songs = f.lines.length
  const size = Math.min(78, Math.floor(1180 / (songs + 1.2)))
  const typed = f.style === 'typed'
  const rows = f.lines.map((l, k) => {
    const jitter = typed ? 0 : (r() - 0.5) * 2.2
    const indent = typed ? 0 : Math.round(r() * 18)
    let inner = esc(l.text)
    if (l.kind === 'header') return `<div class="ln hdr" data-k="${k}">${inner}</div>`
    if (l.kind === 'section') return `<div class="ln sec" data-k="${k}">${inner}</div>`
    let cls = 'ln', extra = ''
    if (l.mark === 'crossed') {
      extra = (k % 2) ? `<i class="strike" style="transform:rotate(${(r() - 0.5) * 6}deg)"></i>` : `<i class="scrib"></i>`
    }
    if (l.mark === 'added') { cls += ' add'; inner = '^ ' + inner }
    return `<div class="${cls}" data-k="${k}" style="transform:rotate(${jitter}deg);padding-left:${indent}px"><span class="t">${inner}${extra}</span></div>`
  }).join('')
  const c = f.condition
  const paperTf = { angle: `perspective(1400px) rotateX(9deg) rotate(${i % 2 ? -6 : 5}deg)`, crop_bottom: 'translateY(170px) rotate(1.5deg)' }[c] || `rotate(${(r() - 0.5) * 2}deg)`
  const filter = { lowlight: 'brightness(0.42) contrast(0.85) saturate(0.7)', unreadable_dark: 'brightness(0.1) contrast(0.6)', unreadable_blur: 'blur(7px)', glare: 'none' }[c] || 'none'
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(circle at 30% 20%,#3a332b,#121010 70%)}
  .stage{position:absolute;inset:0;filter:${filter}}
  .paper{position:absolute;left:90px;top:70px;width:${W - 180}px;min-height:${H - 140}px;background:linear-gradient(170deg,#fbfaf6,#efebe2);box-shadow:0 18px 40px rgba(0,0,0,.6);padding:56px 64px;box-sizing:border-box;transform:${paperTf};transform-origin:50% 40%}
  .ln{font:${FONTS[f.style]};font-size:${size}px;line-height:1.22;color:${f.style === 'marker' || typed ? '#111' : '#1b1b1b'};white-space:nowrap;position:relative}
  .t{position:relative;display:inline-block}
  .hdr{font-size:${Math.round(size * 0.55)}px;color:#444;margin-bottom:${Math.round(size * 0.3)}px;letter-spacing:.04em}
  .sec{font-size:${Math.round(size * 0.6)}px;color:#333;border-top:3px solid #222;margin:${Math.round(size * 0.2)}px 0;padding-top:4px;width:40%}
  .add{font:700 ${Math.round(size * 0.85)}px "Bradley Hand";color:#1f3fa8;margin-left:120px}
  .strike{position:absolute;left:-10px;right:-10px;top:52%;height:${Math.max(4, size / 12)}px;background:#111;border-radius:3px}
  .scrib{position:absolute;left:-6px;right:-6px;top:20%;bottom:20%;background:repeating-linear-gradient(115deg,transparent 0 9px,#111 9px 13px);opacity:.85}
  .tape{position:absolute;width:190px;height:56px;background:rgba(70,70,72,.92);top:40px}
  .glare{position:absolute;inset:0;background:radial-gradient(ellipse at 62% 38%,rgba(255,255,255,.93),rgba(255,255,255,.55) 16%,rgba(255,255,255,0) 34%)}
  .shadow{position:absolute;inset:0;background:linear-gradient(100deg,rgba(0,0,0,.55),rgba(0,0,0,0) 45%)}
  </style><div class="stage"><div class="paper">${rows}</div>
  ${c === 'tape_shadow' ? '<div class="tape" style="left:40px;transform:rotate(-30deg)"></div><div class="tape" style="right:40px;transform:rotate(28deg)"></div><div class="shadow"></div>' : ''}
  ${c === 'glare' ? '<div class="glare"></div>' : ''}</div>`
}

async function fit(page) {
    // Shrink the whole sheet's text until every line fits the paper's width (as a writer would).
  await page.evaluate(() => {
      const paper = document.querySelector('.paper'), inner = paper.clientWidth - 128
      for (let n = 0; n < 30; n++) {
        const wide = [...document.querySelectorAll('.ln')].some(l => (l.querySelector('.t') || l).scrollWidth + (parseFloat(l.style.paddingLeft) || 0) + (l.classList.contains('add') ? 120 : 0) > inner)
        if (!wide) break
        document.querySelectorAll('.ln').forEach(l => { l.style.fontSize = (parseFloat(getComputedStyle(l).fontSize) * 0.94) + 'px' })
      }
    })
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const vis = {}
  for (const [i, f] of T.fixtures.entries()) {
    await page.setContent(html(f, i)); await page.evaluate(() => document.fonts.ready)
    await fit(page)
    vis[f.id] = await page.$$eval('.ln', (els, [W, H]) => els.map(e => { const t = e.querySelector('.t') || e; const b = t.getBoundingClientRect(); return { k: +e.dataset.k, visible: b.bottom <= H - 6 && b.top >= 0 && b.right <= W - 4 && b.left >= 0 } }), [W, H])
    await page.screenshot({ path: path.join(IMG, f.id + '.jpg'), type: 'jpeg', quality: 80 })
    if (f.expect_unreadable) {  // the customer's retake after "Couldn't read this photo"
      await page.setContent(html({ ...f, condition: 'angle' }, i)); await page.evaluate(() => document.fonts.ready); await fit(page)
      await page.screenshot({ path: path.join(IMG, f.id + '_retake.jpg'), type: 'jpeg', quality: 80 })
    }
  }
  fs.writeFileSync(path.join(DIR, 'visibility.json'), JSON.stringify(vis, null, 1))
  await browser.close()
  const cut = Object.entries(vis).map(([id, v]) => [id, v.filter(x => !x.visible).length]).filter(x => x[1])
  console.log('rendered', T.fixtures.length, 'lines out of frame:', JSON.stringify(cut))
})()

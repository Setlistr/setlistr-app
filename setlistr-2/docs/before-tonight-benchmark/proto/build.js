// Builds proto/before-tonight.html from the template plus benchmark images and cached outputs.
const fs = require('fs'), path = require('path')
const sharp = require('/Users/jesseslack/setlistr-manager-workspace/setlistr-2/node_modules/sharp')
const B = path.join(__dirname, '..'), T = JSON.parse(fs.readFileSync(path.join(B, 'fixtures/truth.json'), 'utf8'))
const { candMatch } = require(path.join(B, 'lib.js'))(T.catalogue)
const ORACLE = process.env.ORACLE === '1'
function out(id) {
  const f = path.join(B, 'out/candidate', id + '.json')
  if (!ORACLE && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  return null
}
async function draft(id) {
  const img = 'data:image/jpeg;base64,' + (await sharp(path.join(B, 'fixtures/img', id + '.jpg')).resize({ width: 640 }).jpeg({ quality: 72 }).toBuffer()).toString('base64')
  const o = out(id)
  let lines, ms = 0, attempts = 0, readable
  if (o) {
    const p = o.parsed || {}
    readable = !!(p.readable !== false && Array.isArray(p.lines) && p.lines.some(l => l.kind === 'song' && l.text))
    lines = (p.lines || []).filter(l => l.kind === 'song')
    ms = o.attempts.reduce((s, a) => s + (a.ms || 0), 0); attempts = o.attempts.length
  } else {  // placeholder only until the paid run exists: truth lines, clearly labelled
    const fx = T.fixtures.find(f => f.id === id.replace('_retake', ''))
    readable = !(fx.expect_unreadable && !id.endsWith('_retake'))
    lines = readable ? fx.lines.filter(l => l.kind === 'song').map(l => ({ text: l.title_text, note: '', mark: l.mark, legibility: 'clear' })) : []
    ms = 9000; attempts = 1
  }
  lines = lines.map(l => ({ ...l, match: candMatch(l.text || '', l.note || '') }))
  return { image: img, readable, lines, ms, attempts }
}
;(async () => {
  const main = await draft('f03'), unreadable = await draft('f38'), retake = await draft('f38_retake')
  const flagged = main.lines.filter(l => l.mark !== 'none' || l.legibility !== 'clear' || l.match.some(m => m.flag)).length
  main.flagNote = `${main.lines.length} lines read, ${flagged} with a question.`
  retake.flagNote = `${retake.lines.length} lines read from the retake.`
  const ledger = fs.existsSync(path.join(B, 'ledger.json')) ? JSON.parse(fs.readFileSync(path.join(B, 'ledger.json'), 'utf8')) : null
  const real = !ORACLE && fs.existsSync(path.join(B, 'out/candidate/f03.json'))
  const DATA = { drafts: { main, unreadable, retake },
    source: real ? 'claude-sonnet-4-5, run 2026-10-30' : 'PLACEHOLDER: ground-truth lines, not a model reading',
    benchNote: real ? `Benchmark images f03, f38 and f38_retake; readings are cached model outputs. Total benchmark spend $${ledger.actual_usd.toFixed(2)} of the $5 cap.` : 'Placeholder data: replace with the benchmark run before review.' }
  const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8').replace('/*__DATA__*/null', JSON.stringify(DATA).replace(/</g, '\\u003c'))
  fs.writeFileSync(path.join(__dirname, 'before-tonight.html'), html)
  console.log('built', (html.length / 1024).toFixed(0) + ' KB', DATA.source)
})()

// Free step: scores cached extraction outputs, layer by layer, per split. No network.
// Layers: (1) transcription, (2) song identification + composition, (3) event association,
// (4) confirmation effort and residual errors; plus cost. Writes results.json and prints tables.
const fs = require('fs'), path = require('path')
const DIR = __dirname
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/truth.json'), 'utf8'))
const VIS = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/visibility.json'), 'utf8'))
const LEDGER = fs.existsSync(path.join(DIR, 'ledger.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'ledger.json'), 'utf8')) : { calls: [] }
const CAT = T.catalogue, byId = Object.fromEntries(CAT.map(c => [c.id, c]))

const { normalize, similarity, prodFuzzy, candMatch, strip } = require('./lib.js')(CAT)

// ── Alignment helpers ──
function lev(a, b) { const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c } return p[n] }
const ratio = (a, b) => { a = normalize(strip(a)); b = normalize(strip(b)); return 1 - lev(a, b) / Math.max(a.length, b.length, 1) }
function align(truthLines, outLines, min = 0.8) {
  const pairs = []; truthLines.forEach((t, i) => outLines.forEach((o, j) => { const r = ratio(t.title_text, o.text); if (r >= min) pairs.push({ i, j, r }) }))
  pairs.sort((a, b) => b.r - a.r); const ti = new Set(), oj = new Set(), m = []
  for (const p of pairs) if (!ti.has(p.i) && !oj.has(p.j)) { ti.add(p.i); oj.add(p.j); m.push(p) }
  return m
}
function kendall(m) { let c = 0, d = 0; for (let x = 0; x < m.length; x++) for (let y = x + 1; y < m.length; y++) { const s = Math.sign(m[x].i - m[y].i) * Math.sign(m[x].j - m[y].j); s > 0 ? c++ : d++ } return c + d ? (c - d) / (c + d) : 1 }

function outputLines(prompt, rec) {
  if (!rec || !rec.parsed) return null
  if (prompt === 'baseline') return Array.isArray(rec.parsed) ? rec.parsed.filter(s => s && s.title).map(s => ({ text: s.title, note: '', mark: 'none', legibility: 'clear', kind: 'song' })) : null
  const p = rec.parsed; if (!p || !Array.isArray(p.lines)) return null
  return p.lines.filter(l => l.kind === 'song').map(l => ({ text: l.text || '', note: l.note || '', mark: l.mark || 'none', legibility: l.legibility || 'clear', kind: 'song' }))
}
const ORACLE = process.env.ORACLE === '1'
function oracle(prompt, id) {
  const f = T.fixtures.find(x => x.id === id.replace('_retake', '')); if (!f) return null
  if (f.expect_unreadable && !id.endsWith('_retake')) return { parsed: prompt === 'baseline' ? [] : { readable: false, lines: [] } }
  const vis = VIS[f.id], lines = f.lines.map((l, k) => ({ ...l, k })).filter(l => l.kind === 'song' && vis.find(v => v.k === l.k)?.visible !== false)
  if (prompt === 'baseline') return { parsed: lines.map(l => ({ title: l.text, artist: '' })) }
  const hdr = f.lines.find(l => l.kind === 'header')
  return { parsed: { header: hdr ? hdr.text : '', readable: true, lines: lines.map(l => ({ text: l.title_text, note: l.text.slice(l.title_text.length).trim(), kind: 'song', mark: l.mark, legibility: 'clear' })) } }
}
const load = (prompt, id) => { if (ORACLE) return oracle(prompt, id); const f = path.join(DIR, 'out', prompt, id + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null }

// ── Event association (deterministic; candidates only, never automatic) ──
function photoTime(f, b) {
  const d = new Date(b.local_date + 'T12:00:00Z'), next = new Date(d.getTime() + 864e5).toISOString().slice(0, 10)
  return { loadout: { date: b.local_date, hour: 23 }, after_midnight: { date: next, hour: 0 }, next_morning: { date: next, hour: 9 }, none: null }[f.photo_time]
}
function headerMatches(header, bk) {
  const h = normalize(header || ''); if (!h) return 0
  let s = 0; if (h.includes(normalize(bk.venue))) s += 2; else if (normalize(bk.venue).split(' ').some(w => w.length > 4 && h.includes(w))) s += 1
  if (h.includes(normalize(bk.city))) s += 1
  const md = bk.local_date.slice(5).split('-').map(Number); if (new RegExp(`\\b${md[0]}\\s*[./]\\s*${md[1]}\\b`).test(header || '')) s += 2
  return s
}
function associate(f, header) {
  const b = T.bookings.find(x => x.id === f.booking), pt = photoTime(f, b)
  let cands = T.bookings
  if (pt) { const prev = new Date(new Date(pt.date + 'T12:00:00Z').getTime() - 864e5).toISOString().slice(0, 10); cands = cands.filter(x => x.local_date === pt.date || x.local_date === prev) }
  else cands = cands.filter(x => headerMatches(header, x) > 0)
  const ranked = cands.map(x => {
    let s = headerMatches(header, x) * 2 + (x.status === 'cancelled' ? -3 : 0)
    if (pt) s += (pt.hour >= 18 ? x.local_date === pt.date : x.local_date !== pt.date) ? 2 : 0
    if (pt && pt.hour >= 18 && x.time) s += Number(x.time.slice(0, 2)) >= 18 ? 1 : 0
    return { id: x.id, s }
  }).sort((a, c) => c.s - a.s)
  return { truth: b.id, cands: ranked.map(r => r.id), top: ranked[0] && ranked[0].id, tie: ranked.length > 1 && ranked[0].s === ranked[1].s }
}

// ── Score one prompt on one split ──
function score(prompt, split) {
  const fx = T.fixtures.filter(f => f.split === split)
  const L1 = { fixtures: 0, missing_output: 0, truth_lines: 0, matched: 0, exact: 0, spurious: 0, out_lines: 0, crossed_total: 0, crossed_returned_unmarked: 0, crossed_marked: 0, crossed_omitted: 0, added_total: 0, added_captured: 0, added_marked: 0, tau_sum: 0, tau_n: 0, unreadable_total: 0, unreadable_refused: 0, unreadable_hallucinated_lines: 0, out_of_frame_lines: 0, out_of_frame_read: 0, wrong_lines_flagged: 0, wrong_lines: 0, right_lines_flagged: 0 }
  const L2 = { from_truth: blank2(), from_ocr: blank2() }
  const L3 = { n: 0, in_cands: 0, top_correct: 0, top_wrong: 0, no_cands: 0, ties: 0, by_photo_time: {} }
  const L4 = { n: 0, items: 0, decisions: 0, residual_silent: 0, off_paper: 0, typed_songs: 0, modeled_seconds: [], abandoned: 0, retake_ok: 0 }
  for (const f of fx) {
    const rec = load(prompt, f.id), out = outputLines(prompt, rec)
    const vis = VIS[f.id]; const visible = k => vis.find(v => v.k === k)?.visible !== false
    if (f.expect_unreadable) {
      L1.unreadable_total++
      const refused = !out || out.length === 0 || (prompt === 'candidate' && rec?.parsed?.readable === false)
      if (refused) L1.unreadable_refused++; else L1.unreadable_hallucinated_lines += out.length
      const rt = load(prompt, f.id + '_retake'), rto = outputLines(prompt, rt)
      if (rto && rto.length) L4.retake_ok++; else L4.abandoned++
      continue
    }
    if (!rec) { L1.missing_output++; continue }
    L1.fixtures++
    const tl = f.lines.map((l, k) => ({ ...l, k })).filter(l => l.kind === 'song')
    const tv = tl.filter(l => visible(l.k)), tInv = tl.filter(l => !visible(l.k))
    const o = out || []
    const m = align(tv, o)
    L1.truth_lines += tv.length; L1.out_lines += o.length; L1.matched += m.length; L1.exact += m.filter(p => p.r >= 0.999).length
    L1.out_of_frame_lines += tInv.length
    const om = new Set(m.map(p => p.j)), extra = o.map((x, j) => j).filter(j => !om.has(j))
    L1.out_of_frame_read += align(tInv, extra.map(j => o[j])).length
    L1.spurious += extra.length - align(tInv, extra.map(j => o[j])).length
    if (m.length > 1) { L1.tau_sum += kendall(m); L1.tau_n++ }
    for (const p of m) {
      const t = tv[p.i], x = o[p.j]
      if (t.mark === 'crossed') { L1.crossed_total++; x.mark === 'crossed' ? L1.crossed_marked++ : L1.crossed_returned_unmarked++ }
      if (t.mark === 'added') { L1.added_total++; L1.added_captured++; if (x.mark === 'added') L1.added_marked++ }
      const wrong = p.r < 0.999; const flagged = x.legibility && x.legibility !== 'clear'
      if (wrong) { L1.wrong_lines++; if (flagged) L1.wrong_lines_flagged++ } else if (flagged) L1.right_lines_flagged++
    }
    for (const t of tv) if (!m.find(p => tv[p.i] === t)) { if (t.mark === 'crossed') { L1.crossed_total++; L1.crossed_omitted++ } if (t.mark === 'added') L1.added_total++ }

    // Layer 2: expected identities for visible, not-crossed lines.
    const expectOf = t => t.medley ? t.medley.map(id => ({ id })) : t.song_id ? [{ id: t.song_id }] : [{ id: null, new: t.new }]
    for (const t of tv.filter(t => t.mark !== 'crossed')) {
      const exp = expectOf(t)
      tally2(L2.from_truth, exp, predict(prompt, t.title_text, ''))
      const p = m.find(p => tv[p.i] === t)
      if (!p) { exp.forEach(() => L2.from_ocr.missing_line++); L2.from_ocr.expected += exp.length; continue }
      tally2(L2.from_ocr, exp, predict(prompt, o[p.j].text, o[p.j].note))
    }

    // Layer 3
    const hdr = prompt === 'candidate' ? (rec.parsed?.header || '') : ''
    const a = associate(f, hdr); L3.n++
    const bt = (L3.by_photo_time[f.photo_time] ||= { n: 0, top_correct: 0, top_wrong: 0, no_cands: 0 }); bt.n++
    if (a.cands.includes(a.truth)) L3.in_cands++
    if (!a.cands.length) { L3.no_cands++; bt.no_cands++ } else if (a.top === a.truth && !a.tie) { L3.top_correct++; bt.top_correct++ } else { L3.top_wrong++; bt.top_wrong++ }
    if (a.tie) L3.ties++

    // Layer 4: what the confirmer faces, against what was actually performed (incl. off-paper changes).
    L4.n++
    const draft = []; let decisions = 2  // "Did this show happen?" + "Played in this order?"
    o.forEach((x, j) => {
      if (x.mark === 'crossed') { decisions++; return }               // "Crossed out: played?" (default no)
      const preds = predict(prompt, x.text, x.note)
      if (x.mark === 'added' || x.legibility !== 'clear') decisions++
      preds.forEach(pp => { if (pp.flag) decisions++; draft.push(pp) })
    })
    const truthIds = f.performed.map(p => p.song_id || ('new:' + p.new.title))
    const draftIds = draft.map(d => d.id || ('new:' + d.text))
    // Residual = differences that remain if every flagged decision is resolved correctly.
    const flaggedWrong = draft.filter((d, i) => d.flag).length
    const tC = countMap(truthIds), dC = countMap(draft.filter(d => !d.flag).map(d => d.id || ('new:' + d.text)))
    let silentExtra = 0, missingAfter = 0
    for (const [k, v] of Object.entries(dC)) silentExtra += Math.max(0, v - (tC[k] || 0))
    const resolved = countMap(draftIds)
    for (const [k, v] of Object.entries(tC)) missingAfter += Math.max(0, v - (resolved[k] || 0))
    const offPaper = f.off_paper ? 1 : 0
    L4.items += truthIds.length; L4.decisions += decisions; L4.residual_silent += silentExtra + missingAfter; L4.off_paper += offPaper; L4.typed_songs += missingAfter
    // Modeled seconds [unmeasured assumptions]: 1.5 s read per item; 4 s per decision; 15 s per silent fix; 10 s per typed song.
    L4.modeled_seconds.push(1.5 * draft.length + 4 * decisions + 15 * silentExtra + 10 * missingAfter)
  }
  return { L1, L2, L3, L4 }
}
function blank2() { return { expected: 0, correct: 0, correct_new: 0, wrong_id_silent: 0, wrong_id_flagged: 0, should_match_got_new: 0, new_got_matched_silent: 0, new_got_matched_flagged: 0, missing_line: 0, composition_correct: 0, composition_wrong: 0, composition_unknown_stated: 0, flagged_correct: 0 } }
function predict(prompt, text, note) {
  if (prompt === 'baseline') { const s = prodFuzzy(text); return [{ id: s ? s.id : null, flag: null, text }] }
  return candMatch(text, note)
}
function tally2(acc, exp, preds) {
  exp.forEach((e, i) => {
    acc.expected++
    const p = preds[i]
    if (!p) { acc.missing_line++; return }
    if (e.id === null) { if (p.id === null) { acc.correct_new++; acc.correct++; acc.composition_unknown_stated++ } else { p.flag ? acc.new_got_matched_flagged++ : acc.new_got_matched_silent++; acc.composition_wrong++ } return }
    if (p.id === e.id) { acc.correct++; if (p.flag) acc.flagged_correct++; acc.composition_correct++ }
    else if (p.id === null) { acc.should_match_got_new++; acc.composition_unknown_stated++ }
    else { p.flag ? acc.wrong_id_flagged++ : acc.wrong_id_silent++; JSON.stringify(byId[p.id].writers) === JSON.stringify(byId[e.id].writers) ? acc.composition_correct++ : acc.composition_wrong++ }
  })
}
function countMap(a) { const m = {}; a.forEach(x => m[x] = (m[x] || 0) + 1); return m }

function cost(prompt, ids) {
  const calls = LEDGER.calls.filter(c => c.prompt === prompt && ids.includes(c.id.replace('_retake', '')))
  const ok = calls.filter(c => !c.error)
  const usd = calls.reduce((s, c) => s + (c.usd || 0), 0), ms = ok.map(c => c.ms).sort((a, b) => a - b)
  return { calls: calls.length, photos: new Set(calls.map(c => c.id)).size, usd: +usd.toFixed(4), usd_per_photo: calls.length ? +(usd / new Set(calls.map(c => c.id)).size).toFixed(4) : null,
    retries: calls.filter(c => c.attempt > 0).length, latency_ms_median: ms[Math.floor(ms.length / 2)] || null, latency_ms_max: ms[ms.length - 1] || null,
    errored_calls: calls.length - ok.length, in_tokens_mean: ok.length ? Math.round(ok.reduce((s, c) => s + c.in, 0) / ok.length) : null, out_tokens_mean: ok.length ? Math.round(ok.reduce((s, c) => s + c.out, 0) / ok.length) : null, out_tokens_max: ok.length ? Math.max(...ok.map(c => c.out)) : null }
}

const results = { generated: new Date().toISOString(), actual_usd_total: +(LEDGER.actual_usd || 0).toFixed(4), splits: {} }
for (const split of ['dev', 'heldout']) {
  results.splits[split] = { fixtures: T.fixtures.filter(f => f.split === split).length }
  for (const prompt of ['baseline', 'candidate']) {
    const ids = T.fixtures.filter(f => f.split === split).map(f => f.id)
    results.splits[split][prompt] = { ...score(prompt, split), cost: cost(prompt, ids) }
  }
}
fs.writeFileSync(path.join(DIR, ORACLE ? 'results-oracle.json' : 'results.json'), JSON.stringify(results, null, 1))
console.log(JSON.stringify(results, null, 1).slice(0, 6000))

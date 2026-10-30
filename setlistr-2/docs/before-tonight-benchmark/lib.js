// NOTE: the candidate matcher below was designed with knowledge of how the synthetic fixtures were generated
// (abbreviation, "St"/"Saint", artist-hint and medley rules). Its scores are DEVELOPMENT EVIDENCE, not independent validation.
// Matchers shared by score.js and the prototype build. CAT = the artist's catalogue.
module.exports = function (CAT) {
// ── Production matcher, verbatim logic from app/api/parse-setlist/route.ts ──
function normalize(str) { return str.toLowerCase().replace(/[''`]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim() }
function similarity(a, b) {
  const na = normalize(a), nb = normalize(b)
  if (na === nb) return 1.0
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2)), wordsB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0; wordsA.forEach(w => { if (wordsB.has(w)) overlap++ })
  const score = (overlap * 2) / (wordsA.size + wordsB.size)
  if (na.includes(nb) || nb.includes(na)) return Math.max(score, 0.85)
  return score
}
function prodFuzzy(title) { let best = null; for (const s of CAT) { const sc = similarity(title, s.title); if (sc > 0.65 && (!best || sc > best.score)) best = { score: sc, song: s } } return best ? best.song : null }

// ── Candidate matcher: scored suggestions, never silent substitution ──
const strip = t => (t || '').replace(/^\s*\^\s*/, '').replace(/\s*\([^)]*\)/g, '').replace(/\s+-\s+[A-G][b#]?m?\s*$/i, '').replace(/[*]+/g, '').trim()
const initials = s => normalize(s).split(' ').filter(Boolean).map(w => w[0]).join('')
function candScores(text, hint) {
  const t = strip(text), nt = normalize(t)
  return CAT.map(c => {
    let s = similarity(t, c.title)
    if (/^[A-Z]{2,4}$/.test(t.replace(/\./g, '')) && initials(c.title) === t.replace(/\./g, '').toLowerCase()) s = Math.max(s, 0.9)
    if (nt.length >= 4 && normalize(c.title).startsWith(nt)) s = Math.max(s, 0.88)
    if (nt.replace(/^st /, 'saint ') === normalize(c.title)) s = Math.max(s, 0.95)
    if (hint && s >= 0.65) { const h = normalize(hint).replace(/\s/g, ''); if (h && (initials(c.artist) === h || normalize(c.artist).replace(/\s/g, '').includes(h))) s += 0.05 }
    return { c, s }
  }).sort((a, b) => b.s - a.s)
}
function candMatch(text, note) {
  const parts = strip(text).replace(/^medley:\s*/i, '').split(/\s*(?:>|\/|\+)\s*/).filter(Boolean)
  const hint = ((text.match(/\(([^)]*)\)/) || [])[1] || '') + ' ' + ((note || '').match(/\(?([A-Za-z]{2,})\)?/) || [, ''])[1]
  return parts.map(p => {
    const sc = candScores(p, hint.trim())
    const [a, b] = sc
    if (!a || a.s < 0.65) return { id: null, flag: 'new_song', text: p }
    const sameTitle = b && normalize(b.c.title) === normalize(a.c.title) && Math.abs(a.s - b.s) < 0.04
    const close = b && b.s >= 0.65 && a.s - b.s < 0.1
    return { id: a.c.id, title: a.c.title, flag: sameTitle || close ? 'ambiguous' : a.s < 0.9 ? 'weak' : null, text: p, score: +a.s.toFixed(2),
      alts: sc.filter(x => x.s >= 0.65 && a.s - x.s < 0.1).slice(0, 3).map(x => ({ id: x.c.id, title: x.c.title, label: x.c.title + ' · ' + x.c.artist })) }
  })
}

  return { normalize, similarity, prodFuzzy, candMatch, strip }
}

// The one paid step: sends the SYNTHETIC fixture images (fixtures/img, rendered locally from
// fixtures/truth.json) to Claude vision, in a fixed order: dev, then held-out, then retakes.
// Usage: node run.js <keyFile>
//
// Guarantees:
// - Key: read once into memory, and the file is deleted immediately (and again on any exit).
//   It is never printed, logged or written anywhere. Errors print only an HTTP status or error name.
// - Data: only files listed from truth.json, inside fixtures/img, exactly 1100×1466, ≤ 1.5 MB. No other input.
// - Model pinned to a dated snapshot. Output bounded by max_tokens. Input bounded by IN_MAX (checked
//   against the reported usage after every call; the run aborts if it is ever exceeded).
// - At most 2 attempts per image (1 retry), only for 429/5xx/network errors or unparseable output.
//   Any other 4xx (e.g. a bad model id or key) aborts the whole run.
// - Spend: before EVERY call, the full worst case of that call (IN_MAX input + max_tokens output,
//   +10% margin) must fit under CAP with everything already committed. Successful calls commit their
//   reported usage +10%; errored calls commit their full worst case. So the total stays under CAP
//   ($4.50, under the owner's $5) even if every call uses its whole output allowance.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const KEYFILE = process.argv[2]
const unlinkKey = () => { try { if (KEYFILE && fs.existsSync(KEYFILE)) fs.unlinkSync(KEYFILE) } catch {} }
process.on('exit', unlinkKey); for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { unlinkKey(); process.exit(130) })
process.on('uncaughtException', e => { unlinkKey(); console.error('aborted:', e && (e.status || e.name || 'error')); process.exit(1) })
let key = ''
try { key = fs.readFileSync(KEYFILE, 'utf8').trim() } catch { console.error('No key file.'); process.exit(2) } finally { unlinkKey() }
if (!/^sk-ant-/.test(key)) { console.error('The key file does not contain an Anthropic API key (it has been deleted).'); process.exit(2) }

const Anthropic = require('/Users/jesseslack/setlistr-manager-workspace/setlistr-2/node_modules/@anthropic-ai/sdk').default
const sharp = require('/Users/jesseslack/setlistr-manager-workspace/setlistr-2/node_modules/sharp')
const anthropic = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 120000 })
key = ''

const MODEL = 'claude-sonnet-4-5-20250929'   // pinned snapshot; production calls the alias 'claude-sonnet-4-5'
const PRICE_IN = 3 / 1e6, PRICE_OUT = 15 / 1e6, MARGIN = 1.10   // Sonnet 4.5 list price; +10% margin
const IN_MAX = 4000                             // one ≤1.61 MP image (~1,600 tokens) + ≤2,500-char prompt, with room
const MAX_OUT = { baseline: 1024, candidate: 1500 }
const CAP = 4.50, ATTEMPTS = 2
const worst = p => (IN_MAX * PRICE_IN + MAX_OUT[p] * PRICE_OUT) * MARGIN

const DIR = __dirname, IMG = path.join(DIR, 'fixtures', 'img')
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/truth.json'), 'utf8'))
const LEDGER = path.join(DIR, 'ledger.json')
const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { committed_usd: 0, actual_usd: 0, calls: [] }
const save = () => fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1))

// Verbatim from app/api/parse-setlist/route.ts at 21d2b63.
const BASELINE = `This is a musician's setlist. Extract every song title in order, exactly as written.

Return ONLY a JSON array like this:
[{"title": "Song Title", "artist": "Artist or empty string"}]

Rules:
- Keep exact order
- Strip numbering (1. 2. etc)
- Strip timing notes like (3:45)
- Skip section headers like "Set 1" or "Encore"
- Return valid JSON only, no markdown
- CRITICAL: Only return songs you can directly read from the image or document. If the text is unclear, blurry, or you cannot confidently read a title, omit it. If you cannot read any songs at all, return an empty array []. Do NOT guess, infer, or generate song titles that are not visibly present.`
const CANDIDATE = `This is a photo of a band's stage setlist. Transcribe it exactly as written. Do not identify, correct, expand or complete song titles: abbreviations stay abbreviated.

Return ONLY JSON, no markdown:
{"header": "any venue/city/date text at the top, or empty string",
 "readable": true or false (false if you cannot read the list at all),
 "lines": [{"text": "the title text exactly as written, without performance notes",
            "note": "performance notes on that line, e.g. capo 2, key, *, (solo); or empty",
            "kind": "song" | "section" (e.g. ENCORE, E:, Set 2) | "other",
            "mark": "none" | "crossed" (struck through or scribbled out) | "added" (written in a different pen/hand or inserted with a caret/arrow),
            "legibility": "clear" | "uncertain" | "illegible"}]}

Rules:
- Top-to-bottom order; place an inserted line where its caret or arrow points.
- Include crossed-out lines with mark "crossed"; do not drop them.
- Keep a line with several titles (e.g. "A > B", "Medley: A / B") as one line, exactly as written.
- Lines cut off by the photo's edge or unreadable: legibility "illegible", text as far as you can read it, or empty.
- Never invent text you cannot see.`
const PROMPTS = { baseline: BASELINE, candidate: CANDIDATE }
if (Object.values(PROMPTS).some(p => p.length > 2500)) throw new Error('prompt too long')

const items = split => split === 'retakes'
  ? T.fixtures.filter(f => f.expect_unreadable).map(f => f.id + '_retake')
  : T.fixtures.filter(f => f.split === split).map(f => f.id)
const PLAN = [['dev', 'baseline'], ['dev', 'candidate'], ['heldout', 'baseline'], ['heldout', 'candidate'], ['retakes', 'baseline'], ['retakes', 'candidate']]

// Diagnostic only (added after the first 400): the API error type, a redacted message and the request ID.
// Never the full response, headers or request body. Anything key-like or long and token-like is redacted.
function sanitize(e) {
  const body = e && e.error && e.error.error
  const type = String((body && body.type) || (e && e.name) || 'unknown').slice(0, 60)
  const message = String((body && body.message) || '')
    .replace(/sk-ant-[A-Za-z0-9_\-]*/g, '[redacted-key]')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]')
    .replace(/\s+/g, ' ').slice(0, 200)
  let request_id = (e && e.request_id) || null
  if (!request_id && e && e.headers) { try { request_id = typeof e.headers.get === 'function' ? e.headers.get('request-id') : e.headers['request-id'] } catch {} }
  request_id = request_id && /^[A-Za-z0-9_\-]{1,80}$/.test(String(request_id)) ? String(request_id) : null
  return { type, message, request_id }
}

async function image(id) {
  const file = path.join(IMG, id + '.jpg')
  if (path.dirname(file) !== IMG || !/^f\d\d(_retake)?$/.test(id)) throw new Error('not a fixture')
  const buf = fs.readFileSync(file), meta = await sharp(buf).metadata()
  if (meta.width !== 1100 || meta.height !== 1466 || buf.length > 1.5e6) throw new Error('fixture out of bounds')
  return buf.toString('base64')
}

;(async () => {
  const first = PLAN.reduce((s, [sp, p]) => s + items(sp).length * worst(p), 0)
  console.log(`model ${MODEL}; cap $${CAP}; worst case of every first attempt $${first.toFixed(2)}; already committed $${ledger.committed_usd.toFixed(4)}`)
  // Freeze record: prompts, matcher and scorer are fixed before any output is seen.
  fs.mkdirSync(path.join(DIR, 'out'), { recursive: true })
  const h = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, f))).digest('hex').slice(0, 16)
  if (!fs.existsSync(path.join(DIR, 'out/freeze.json'))) fs.writeFileSync(path.join(DIR, 'out/freeze.json'), JSON.stringify({ at: new Date().toISOString(), model: MODEL, run_js: h('run.js'), lib_js: h('lib.js'), score_js: h('score.js'), truth: h('fixtures/truth.json') }, null, 1))
  for (const [split, prompt] of PLAN) {
    const outDir = path.join(DIR, 'out', prompt); fs.mkdirSync(outDir, { recursive: true })
    for (const id of items(split)) {
      const outFile = path.join(outDir, id + '.json')
      if (fs.existsSync(outFile)) continue
      const data = await image(id), attempts = []
      let result = null
      for (let a = 0; a < ATTEMPTS && !result; a++) {
        const w = worst(prompt)
        if (ledger.committed_usd + w > CAP) { save(); console.error(`CAP reached: committed $${ledger.committed_usd.toFixed(4)}; stopping before ${id}/${prompt}`); process.exit(3) }
        const t0 = Date.now()
        try {
          const r = await anthropic.messages.create({ model: MODEL, max_tokens: MAX_OUT[prompt], messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }, { type: 'text', text: PROMPTS[prompt] }] }] })
          const u = r.usage, ms = Date.now() - t0, usd = u.input_tokens * PRICE_IN + u.output_tokens * PRICE_OUT
          if (u.input_tokens > IN_MAX || u.output_tokens > MAX_OUT[prompt]) { ledger.committed_usd += Math.max(usd * MARGIN, w); save(); console.error('Token bound exceeded; aborting.'); process.exit(4) }
          ledger.committed_usd += usd * MARGIN; ledger.actual_usd += usd
          ledger.calls.push({ id, prompt, split, attempt: a, ms, in: u.input_tokens, out: u.output_tokens, usd, stop: r.stop_reason })
          const raw = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
          let parsed = null
          try { parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()) } catch {}
          attempts.push({ ms, usd, in: u.input_tokens, out: u.output_tokens, parse_ok: !!parsed, stop: r.stop_reason })
          if (parsed || a === ATTEMPTS - 1) result = { raw, parsed }
        } catch (e) {
          const status = e && e.status
          const diag = sanitize(e)
          ledger.committed_usd += w   // an errored call is counted at its full worst case
          ledger.calls.push({ id, prompt, split, attempt: a, ms: Date.now() - t0, error: String(status || (e && e.name) || 'error'), ...diag, usd: 0 })
          attempts.push({ ms: Date.now() - t0, error: String(status || (e && e.name) || 'error'), ...diag })
          save()
          console.error(`API error ${status || '-'}: type=${diag.type} request_id=${diag.request_id} message="${diag.message}"`)
          if (status && status >= 400 && status < 500 && status !== 429) { console.error(`API refused (${status}); aborting the run.`); process.exit(5) }
          await new Promise(r => setTimeout(r, 3000 * (a + 1)))
        }
        save()
      }
      fs.writeFileSync(outFile, JSON.stringify({ id, prompt, model: MODEL, attempts, ...(result || { raw: null, parsed: null }) }, null, 1))
      const last = attempts[attempts.length - 1]
      console.log(`${split}/${prompt} ${id}: ${attempts.length} attempt(s), ${last.error ? 'error ' + last.error : last.ms + ' ms'}; committed $${ledger.committed_usd.toFixed(4)}`)
    }
  }
  console.log(`done; actual $${ledger.actual_usd.toFixed(4)}, committed (with margin and errors) $${ledger.committed_usd.toFixed(4)} of $${CAP}`)
})()

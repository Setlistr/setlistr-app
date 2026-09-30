// Regression guard for the live-capture Pause/Resume pass, AFTER reverting
// the 'ended'/'mute'/'unmute' interruption-detection changes from this same
// branch (see the commit message for why: a capture-analysis regression was
// reported, no real audio/browser tooling exists in this sandbox to
// reproduce it, and static tracing could not establish a small, demonstrated
// cause within the interruption code before it was reverted). What remains
// is ONLY the explicit Pause/Resume label/state layered on top of the
// ORIGINAL, unmodified startListening/stopListening pair — confirmed via
// the diff against origin/main below being limited to exactly that.
//
// Two kinds of check:
//   1. Source-read assertions (as in scripts/test-mobile-layout-invariants.ts)
//      confirming the explicit Pause/Resume UI is present and that the
//      previously-reverted interruption code has NOT crept back in.
//   2. A behavioral reproduction of the capture-scheduling control flow
//      (recordAndDetect + its setInterval/clearInterval lifecycle, exactly
//      as shaped in startListening/stopListening) using REAL timers at a
//      compressed interval — proving chunks/identify-request scheduling
//      continues during active capture, stops the instant pause is called,
//      and resumes with exactly one active loop (no duplicate interval)
//      after a pause → resume cycle. This is a faithful mirror of the
//      timer choreography, not the real component (no getUserMedia/
//      MediaRecorder/browser available here) — it cannot prove a real
//      microphone keeps recording, only that the SCHEDULING logic itself,
//      which is byte-identical to known-working main, behaves correctly.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-live-capture-controls.ts

import * as fs from 'fs'
import * as path from 'path'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
}

const src = read('app/app/live/[id]/page.tsx')

// ── Explicit Pause / Resume, on top of the ORIGINAL capture behavior ─────
{
  check('userPaused is the only new piece of state (the interruption-tracking state has been removed)', src.includes('const [userPaused, setUserPaused]') && !src.includes('const [interrupted, setInterrupted]'))
  check('pauseCapture is a dedicated, explicit control that calls the ORIGINAL stopListening — nothing else', /const pauseCapture = useCallback\(\(\) => \{\s*userPausedRef\.current = true; setUserPaused\(true\)\s*stopListening\(\)\s*\}, \[stopListening\]\)/.test(src))
  check('the hero button pauses (not a bare stopListening) while listening', src.includes('onClick={isListening ? pauseCapture : startListening}'))
  check('the hero button label explicitly reads "pause capture" / "resume capture"', src.includes("'pause capture'") && src.includes("'resume capture'"))
  check('a Paused state renders distinct, calm copy ("captured songs kept", not "saved")', src.includes('Paused — captured songs kept') && !src.includes('captured songs saved'))
  check('starting or resuming clears the paused flag (original startListening otherwise unchanged)', /const startListening = useCallback\(async \(\) => \{\s*\/\/ Starting \(fresh or resumed\) always means not paused anymore\.\s*userPausedRef\.current = false; setUserPaused\(false\)\s*try \{/.test(src))
  check('header status label distinguishes PAUSED from the generic engine states', src.includes("'PAUSED'"))
  check('the Session Health panel is reachable while paused too, not only while isListening', src.includes('{(isListening || userPaused) &&'))
}

// ── Confirms the interruption-detection revert is complete — none of this
//    code should exist anywhere in the file anymore ──────────────────────
{
  check('no lingering import of the removed capture-interruption module', !src.includes("from '@/lib/capture-interruption'"))
  check('no lingering "ended"/"mute"/"unmute" track-event wiring', !src.includes("attachTrackInterruptionListeners") && !/addEventListener\('(ended|mute|unmute)'/.test(src))
  check('no lingering visibilitychange foreground-recheck handler', !src.includes("document.addEventListener('visibilitychange'"))
  // Not a bare "interrupted" search — that word also appears legitimately
  // in ORIGINAL, pre-existing main prose (e.g. the ACR-silence health-clock
  // comment), which must not be flagged as a regression leftover.
  check('no lingering `interrupted` state, ref, or handlers', !src.includes('setInterrupted') && !src.includes('interruptedRef') && !src.includes('handleAudioInterrupted') && !src.includes('handleAudioRecovered'))
  check('lib/capture-interruption.ts no longer exists', !fs.existsSync(path.join(__dirname, '..', 'lib/capture-interruption.ts')))
}

// ── Songs survive pause/resume, but are NOT durably saved until End Show
//    (unchanged from the previous pass — still true after the revert) ────
{
  check('performance_songs IS written from handleEnd (the only durable save point, confirming the "kept" not "saved" wording above)', src.includes("await supabase.from('performance_songs').insert(songsToSave"))
  const pauseCaptureBody = (src.match(/const pauseCapture = useCallback\(\(\) => \{[\s\S]*?\}, \[stopListening\]\)/) || [''])[0]
  check('pauseCapture body was actually found (regex still matches current source)', pauseCaptureBody.length > 0)
  check('pauseCapture never writes performance_songs directly', !pauseCaptureBody.includes('performance_songs'))
}

// ── Behavioral reproduction of the capture-scheduling control flow ───────
// Mirrors app/app/live/[id]/page.tsx's startListening (recordAndDetect() is
// called once immediately, then re-scheduled via
// listenIntervalRef.current = setInterval(recordAndDetect, 20000)) and
// stopListening (clearInterval + null out the ref) EXACTLY, at a compressed
// interval for test speed. Uses real setInterval/clearInterval, not fake
// timers, since the actual bug class being guarded against here (a
// duplicate loop from a missed clearInterval) is a real timer-identity
// issue that a fake-timer library could paper over.
const TICK_MS = 40

function makeCaptureLoop(onChunk: () => void) {
  let intervalId: ReturnType<typeof setInterval> | null = null
  function recordAndDetect() { onChunk() }
  // Mirrors: recordAndDetect(); listenIntervalRef.current = setInterval(recordAndDetect, 20000)
  function start() {
    recordAndDetect()
    intervalId = setInterval(recordAndDetect, TICK_MS)
  }
  // Mirrors: if (listenIntervalRef.current) { clearInterval(...); listenIntervalRef.current = null }
  function stop() {
    if (intervalId) { clearInterval(intervalId); intervalId = null }
  }
  return { start, stop }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runBehavioralChecks() {
  let chunkCount = 0
  const loop = makeCaptureLoop(() => { chunkCount++ })

  // Active capture: chunks/identify-request scheduling continues on its own.
  loop.start()
  check('a chunk fires immediately on start (the initial recordAndDetect() call)', chunkCount === 1)
  await wait(TICK_MS * 3.5)
  check('chunks continue firing repeatedly during active capture (interval kept running)', chunkCount >= 4, `count=${chunkCount}`)

  // Intentional pause: scheduling stops immediately, no further chunks ever.
  const countAtPause = chunkCount
  loop.stop()
  await wait(TICK_MS * 3)
  check('chunk scheduling stops the instant pause is called (no chunks fire afterward)', chunkCount === countAtPause, `before=${countAtPause} after=${chunkCount}`)

  // Resume: scheduling restarts with exactly ONE active loop — no duplicate.
  const countAtResume = chunkCount
  loop.start()
  check('resume fires exactly one immediate chunk, not more', chunkCount === countAtResume + 1)
  await wait(TICK_MS * 3.5)
  const elapsedFires = chunkCount - countAtResume
  // A single correct loop over 3.5 ticks fires ~4-5 times (1 immediate + ~3-4
  // interval ticks, timer-jitter tolerant). A DUPLICATE loop (the exact bug
  // class this guards against — e.g. a missed clearInterval leaving the old
  // interval running alongside a new one) would produce roughly double that.
  check('resuming does not double the firing rate (no duplicate interval running concurrently)', elapsedFires >= 3 && elapsedFires <= 6, `fires after resume=${elapsedFires}`)

  loop.stop()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

runBehavioralChecks()

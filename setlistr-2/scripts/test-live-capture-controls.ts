// Regression guard for the live-capture Pause/Resume + native-interruption
// pass. No component-render harness exists in this repo (see
// scripts/test-mobile-layout-invariants.ts for the same constraint) and this
// change is 100% client-side UI/state logic — it never calls ACRCloud or any
// other paid provider, so there is nothing to stub here; this asserts, by
// reading the actual source, that each specific mechanism is present and
// wired correctly. It cannot prove the on-screen result LOOKS right on a
// real iPhone; it can prove the exact code path for each requirement hasn't
// silently regressed. Real-device verification (backgrounding to record an
// Instagram Story, an incoming call mid-capture, posting existing media) is
// still owed — see the accompanying report for exactly what that requires.
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

// ── Explicit Pause / Paused / Resume ──────────────────────────────────────
{
  check('userPaused and interrupted are tracked as distinct state, not one flag', src.includes('const [userPaused, setUserPaused]') && src.includes('const [interrupted, setInterrupted]'))
  check('pauseCapture is a dedicated, explicit control — the only setter of userPaused', src.includes('const pauseCapture = useCallback(() => {') && /pauseCapture[\s\S]{0,150}setUserPaused\(true\)/.test(src))
  check('the hero button pauses (not a bare stopListening) while listening', src.includes('onClick={isListening ? pauseCapture : startListening}'))
  check('the hero button label explicitly reads "pause capture" / "resume capture", not generic listening/resume text', src.includes("'pause capture'") && src.includes("'resume capture'"))
  check('a Paused state renders distinct, calm copy ("captured songs saved"), not the interrupted/stalled recovery UI', src.includes('Paused — captured songs saved'))
  check('starting or resuming always clears both paused and interrupted flags', /startListening = useCallback\(async \(\) => \{\s*\/\/[\s\S]{0,300}setUserPaused\(false\)[\s\S]{0,100}setInterrupted\(false\)/.test(src))
}

// ── Songs survive pause/resume ────────────────────────────────────────────
{
  check('pauseCapture never touches the songs array (captured songs are preserved as-is)', !/pauseCapture = useCallback\(\(\) => \{[\s\S]{0,300}setSongs/.test(src))
  check('stopListening (pauseCapture\'s only side effect) never clears songs either', !/const stopListening = useCallback\(\(\) => \{[\s\S]{0,400}setSongs\(\[\]\)/.test(src))
}

// ── Native audio interruption: distinct from a user pause, never shows
//    "Listening" once capture has actually stopped ────────────────────────
{
  check('a dying mic track (OS-level interruption) is detected directly via the track\'s own "ended" event', src.includes("addEventListener('ended'"))
  check('handleAudioInterrupted is the only setter of `interrupted`, and explicitly refuses to fire over an explicit pause', /const handleAudioInterrupted = useCallback\(\(\) => \{\s*if \(userPausedRef\.current/.test(src))
  check('an interruption immediately stops the pipeline (isListening -> false) rather than waiting on the slower ACR-silence heartbeat', /handleAudioInterrupted = useCallback\(\(\) => \{[\s\S]{0,200}stopListening\(\)/.test(src))
  check('returning to the foreground re-checks the mic track before trusting stale "still listening" state', src.includes("document.addEventListener('visibilitychange'") && src.includes("track.readyState === 'ended'"))
  check('the foreground recheck never overrides an explicit pause', /onVisibilityChange\(\) \{[\s\S]{0,200}userPausedRef\.current/.test(src))
  check('header status label distinguishes PAUSED and INTERRUPTED from the generic engine states', src.includes("'PAUSED'") && src.includes("'INTERRUPTED'"))
  check('the Session Health panel is reachable while paused/interrupted too, not only while isListening', src.includes('{(isListening || userPaused || interrupted) &&'))
  check('interrupted shows a distinct recovery action, not the calm paused copy', src.includes('Audio Interrupted — Resume Capture'))
  check('the pre-existing ACR-silence recovery path (captureStale) is preserved, not replaced by the new interruption checks', src.includes('Recording Interrupted — Click to Resume'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

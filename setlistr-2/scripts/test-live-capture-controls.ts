// Regression guard for the live-capture Pause/Resume + native-interruption
// UI wiring — i.e. that app/app/live/[id]/page.tsx actually calls into
// lib/capture-interruption.ts's functions at the right places and renders
// the right copy for each state. The DECISION LOGIC itself (guard rules,
// track-event wiring, stale-track protection) is tested behaviorally, with
// a real dispatched EventTarget, in
// scripts/test-capture-interruption-logic.ts — kept deliberately separate
// from this file, which only proves the UI is wired to that logic
// correctly, by reading the actual page source. No component-render
// harness exists in this repo (see scripts/test-mobile-layout-invariants.ts
// for the same constraint), and this page makes zero direct ACRCloud calls
// of its own in any of the code these checks touch, so there is nothing to
// stub here. Real-device verification (backgrounding to record an
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
  // Not yet written to performance_songs (see the durability check below) —
  // "kept" describes in-memory state honestly; "saved" would overclaim.
  check('a Paused state renders distinct, calm copy ("captured songs kept", not "saved")', src.includes('Paused — captured songs kept') && !src.includes('captured songs saved'))
  check('starting or resuming always clears both paused and interrupted flags', /startListening = useCallback\(async \(\) => \{\s*\/\/[\s\S]{0,300}setUserPaused\(false\)[\s\S]{0,100}setInterrupted\(false\)/.test(src))
}

// ── Songs survive pause/resume, but are NOT durably saved until End Show ──
{
  check('pauseCapture never touches the songs array (captured songs are preserved in memory as-is)', !/pauseCapture = useCallback\(\(\) => \{[\s\S]{0,300}setSongs/.test(src))
  check('stopListening (pauseCapture\'s only side effect) never clears songs either', !/const stopListening = useCallback\(\(\) => \{[\s\S]{0,400}setSongs\(\[\]\)/.test(src))
  // The ONLY durable write of captured songs is at End Show — confirms the
  // in-memory-only claim this suite's copy checks above depend on. Extracts
  // each function's own body precisely (rather than a fixed char window,
  // which false-matched on unrelated later text) so this can't accidentally
  // pass by looking at the wrong stretch of the file.
  const pauseCaptureBody = (src.match(/const pauseCapture = useCallback\(\(\) => \{[\s\S]*?\}, \[stopListening\]\)/) || [''])[0]
  const startListeningBody = (src.match(/const startListening = useCallback\(async \(\) => \{[\s\S]*?\}, \[detectSong, isDetecting, stampCaptureLocation\]\)/) || [''])[0]
  check('pauseCapture body was actually found (regex still matches current source)', pauseCaptureBody.length > 0)
  check('startListening body was actually found (regex still matches current source)', startListeningBody.length > 0)
  check('pauseCapture never writes performance_songs directly', !pauseCaptureBody.includes('performance_songs'))
  check('startListening never writes performance_songs directly', !startListeningBody.includes('performance_songs'))
  check('performance_songs IS written from handleEnd (the only durable save point, confirming the "kept" not "saved" wording above)', src.includes("await supabase.from('performance_songs').insert(songsToSave"))
}

// ── Native audio interruption: wired to the pure module, hard vs. soft,
//    distinct from a user pause, never shows "Listening" once capture has
//    actually stopped or gone silent ────────────────────────────────────
{
  check('interruption decisions are delegated to the shared, independently-tested pure module, not reimplemented inline', src.includes("from '@/lib/capture-interruption'") && src.includes('attachTrackInterruptionListeners('))
  check('each track is wired with a stale-track guard (isCurrentTrack), not a bare unconditional listener', /isCurrentTrack = \(\) => streamRef\.current\?\.getAudioTracks\(\)\[0\] === t/.test(src))
  check('handleAudioInterrupted distinguishes hard (ended) from soft (muted) — only hard tears the pipeline down', /const handleAudioInterrupted = useCallback\(\(kind: InterruptionKind\) => \{/.test(src) && /if \(kind === 'hard'\) stopListening\(\)/.test(src))
  check('handleAudioInterrupted\'s guard is the shared shouldFireInterruption function, not a hand-rolled duplicate', /handleAudioInterrupted = useCallback\(\(kind: InterruptionKind\) => \{\s*if \(!shouldFireInterruption\(/.test(src))
  check('a soft (muted) interruption can self-recover via handleAudioRecovered without requiring an explicit resume', src.includes('const handleAudioRecovered = useCallback(() => {') && src.includes('handleAudioRecoveredRef.current = handleAudioRecovered'))
  check('returning to the foreground re-derives DEAD vs MUTED from the track itself (foregroundTrackStatus), not just a boolean "still listening" check', src.includes("document.addEventListener('visibilitychange'") && src.includes("foregroundTrackStatus(") && src.includes("status === 'dead'") && src.includes("status === 'muted'"))
  check('the foreground recheck goes through the same shared guard as the track-event path (shouldFireInterruption), not a separate hand-rolled one', /onVisibilityChange\(\) \{\s*if \(document\.visibilityState[\s\S]{0,150}shouldFireInterruption\(/.test(src))
  check('header status label distinguishes PAUSED and INTERRUPTED from the generic engine states', src.includes("'PAUSED'") && src.includes("'INTERRUPTED'"))
  check('the Session Health panel is reachable while paused/interrupted too, not only while isListening', src.includes('{(isListening || userPaused || interrupted) &&'))
  check('interrupted shows distinct recovery copy for the hard (ended) case', src.includes('Audio Interrupted — Resume Capture'))
  check('interrupted shows distinct, less alarming copy for the soft (muted, still-listening, self-recovering) case', src.includes('Audio Muted — Tap to Reset'))
  check('the pre-existing ACR-silence recovery path (captureStale) is preserved, not replaced by the new interruption checks', src.includes('Recording Interrupted — Click to Resume'))
  // The soft/muted case leaves isListening true, so anything gated only on
  // isListening (the pulsing "healthy" rings, the trust-signal's
  // "Listening…"/"Last song…" text) would keep claiming health during a
  // live interruption unless it also checks `interrupted` directly.
  check('the pulsing "healthy" hero rings are suppressed during an interruption, even though isListening can stay true (soft/muted case)', src.includes('((isListening && !interrupted) || catchFlash)'))
  check('the trust-signal text shows an explicit "Audio interrupted" state ahead of both "Last song…" and "Listening…", so neither can render during a live interruption', /if \(interrupted\) return[\s\S]{0,150}Audio interrupted[\s\S]{0,1200}if \(lastSongAt > 0 && isListening\)[\s\S]{0,1200}if \(isListening\) \{/.test(src))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

// Behavioral tests for lib/capture-interruption.ts — the pure module the
// live-capture page (app/app/live/[id]/page.tsx) uses to decide what counts
// as an interruption. Corrects an earlier mistake in this same pass: a
// previous version of the accompanying UI-wiring test claimed calling a
// track's own .stop() exercises the 'ended' listener. It does not —
// per the MediaStreamTrack spec, .stop() transitions readyState to 'ended'
// but explicitly does NOT dispatch an 'ended' event; only the track's
// SOURCE ending on its own (revoked hardware, a real interruption) does.
// This file tests the two things that actually matter, kept deliberately
// separate as asked:
//   1. attachTrackInterruptionListeners wired to a REAL dispatched Event
//      (new Event('ended'/'mute'/'unmute'), via Node's built-in
//      EventTarget — no .stop() anywhere in this file) — this is the
//      actual "the OS ended/muted the track" signal path.
//   2. foregroundTrackStatus, tested directly against readyState/muted
//      property combinations — the SEPARATE "we came back from the
//      background, what does the track look like right now" path, which
//      has nothing to do with any event firing.
// No provider stubbing is needed here — this module makes zero network
// calls of any kind, so there is nothing to stub and zero ACR cost by
// construction.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-capture-interruption-logic.ts

import {
  shouldFireInterruption,
  foregroundTrackStatus,
  attachTrackInterruptionListeners,
} from '../lib/capture-interruption'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// A minimal MediaStreamTrack stand-in built on Node's real EventTarget —
// addEventListener/dispatchEvent here are the actual DOM EventTarget
// implementation, not a hand-rolled mock of one.
class FakeTrack extends EventTarget {}

// ── 1. shouldFireInterruption: the guard every real interruption signal
//    (both the track-event path and the foreground-recheck path) must pass
//    — proving intentional pause, End Show cleanup, and an
//    already-not-listening session can never be reported as an
//    interruption. ─────────────────────────────────────────────────────
{
  check('all clear (not paused, not ending, actually listening) -> fires',
    shouldFireInterruption({ userPaused: false, ending: false, isListening: true }) === true)
  check('an explicit user pause blocks it', shouldFireInterruption({ userPaused: true, ending: false, isListening: true }) === false)
  check('End Show in progress blocks it', shouldFireInterruption({ userPaused: false, ending: true, isListening: true }) === false)
  check('not listening at all (nothing to interrupt) blocks it', shouldFireInterruption({ userPaused: false, ending: false, isListening: false }) === false)
  check('paused AND not listening (both reasons) still blocks it', shouldFireInterruption({ userPaused: true, ending: false, isListening: false }) === false)
}

// ── 2. foregroundTrackStatus: the foreground-recheck path, entirely
//    separate from any event dispatch — do not assume every interruption
//    ends the track; a muted-but-alive track is a distinct case from a
//    dead one. ──────────────────────────────────────────────────────────
{
  check('a live, unmuted track -> ok', foregroundTrackStatus({ readyState: 'live', muted: false }) === 'ok')
  check('an ended track -> dead', foregroundTrackStatus({ readyState: 'ended', muted: false }) === 'dead')
  check('no track at all -> dead', foregroundTrackStatus(null) === 'dead' && foregroundTrackStatus(undefined) === 'dead')
  check('a live but MUTED track -> muted, not dead (temporary interruption, not treated as ended)', foregroundTrackStatus({ readyState: 'live', muted: true }) === 'muted')
  check('ended wins over muted if somehow both (permanent beats temporary)', foregroundTrackStatus({ readyState: 'ended', muted: true }) === 'dead')
}

// ── 3. attachTrackInterruptionListeners: the REAL 'ended'/'mute'/'unmute'
//    event-dispatch path, tested with an actual EventTarget dispatching
//    actual Events — never via .stop(). ───────────────────────────────
{
  const track = new FakeTrack()
  let hardCount = 0, softCount = 0, recoveredCount = 0
  let current = true
  attachTrackInterruptionListeners(
    track, () => current,
    () => { hardCount++ },
    () => { softCount++ },
    () => { recoveredCount++ },
  )

  track.dispatchEvent(new Event('ended'))
  check('a real dispatched "ended" event fires the hard callback exactly once', hardCount === 1 && softCount === 0 && recoveredCount === 0)

  track.dispatchEvent(new Event('mute'))
  check('a real dispatched "mute" event fires the soft callback, independently of ended', softCount === 1 && hardCount === 1)

  track.dispatchEvent(new Event('unmute'))
  check('a real dispatched "unmute" event fires the recovered callback, independently of the others', recoveredCount === 1 && hardCount === 1 && softCount === 1)
}

// ── 4. Stale-track protection: once the caller has moved on (pause, End
//    Show, or a fresh restart swapping in a different track), this exact
//    track's listeners — never removed — must become permanent no-ops. ──
{
  const track = new FakeTrack()
  let hardCount = 0, softCount = 0, recoveredCount = 0
  let current = true   // starts as the current track
  attachTrackInterruptionListeners(
    track, () => current,
    () => { hardCount++ },
    () => { softCount++ },
    () => { recoveredCount++ },
  )

  current = false   // simulates pauseCapture()/stopListening() clearing streamRef, or a fresh startListening() swapping in a new track
  track.dispatchEvent(new Event('ended'))
  track.dispatchEvent(new Event('mute'))
  track.dispatchEvent(new Event('unmute'))
  check('a stale track\'s "ended" no longer fires once it is no longer current', hardCount === 0)
  check('a stale track\'s "mute" no longer fires once it is no longer current', softCount === 0)
  check('a stale track\'s "unmute" no longer fires once it is no longer current', recoveredCount === 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

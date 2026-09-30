// Pure, framework-free decision logic for live-capture pause/interruption
// handling — extracted out of app/app/live/[id]/page.tsx specifically so it
// can be exercised with plain objects and a real EventTarget in an
// automated test, without a browser/DOM rendering harness. The live-capture
// page is the only real caller; scripts/test-capture-interruption-logic.ts
// is the only test caller.
//
// A note on what "interruption" covers here, since real iOS/WKWebView
// behavior was not assumed: a mic track can leave a healthy state in more
// than one way. `ended` is permanent — the OS revoked the track entirely
// (device disconnected, or in some cases a hard interruption) and recovery
// means reacquiring the mic from scratch. `mute`/`unmute` is TEMPORARY —
// the track object is still alive and usually self-resumes (e.g. many
// AVAudioSession interruptions on iOS mute the input rather than ending the
// track) — treating every interruption as if it ended the track would miss
// this case and its self-recovery entirely.

export type InterruptionKind = 'hard' | 'soft'

export interface InterruptionGuardState {
  userPaused: boolean
  ending: boolean
  isListening: boolean
}

// The single guard every interruption signal (the real track events below,
// and the foreground revisit check) must pass before it's allowed to flag
// anything. An explicit pause, an End Show in progress, or a session that
// isn't even supposed to be listening right now must never be reported as
// an interruption — those are three different reasons "isListening" can be
// false, and only "interruption" is not one of them.
export function shouldFireInterruption(state: InterruptionGuardState): boolean {
  return !state.userPaused && !state.ending && state.isListening
}

// What to conclude about a track's health at the moment we return to the
// foreground, without assuming a resumed tab was told about everything that
// happened while backgrounded/frozen.
export function foregroundTrackStatus(
  track: { readyState: string; muted?: boolean } | null | undefined
): 'dead' | 'muted' | 'ok' {
  if (!track || track.readyState === 'ended') return 'dead'
  if (track.muted) return 'muted'
  return 'ok'
}

// Minimal shape MediaStreamTrack satisfies — kept narrow on purpose so a
// test can hand this a plain EventTarget standing in for a real track,
// without needing a real MediaStreamTrack (unavailable outside a browser).
export interface InterruptibleTrack {
  addEventListener(type: 'ended' | 'mute' | 'unmute', listener: () => void): void
}

// Wires a track's own real 'ended' / 'mute' / 'unmute' events to the three
// interruption callbacks. The STALE-TRACK guard is `isCurrentTrack`,
// re-evaluated at the moment each event actually fires (not when this
// function runs) — so once the caller has moved on to a different track or
// no track at all (an explicit pause, an End Show, or a fresh restart that
// acquired a new stream), this track's own listeners become permanent
// no-ops for the rest of its life, even though they're never explicitly
// removed. `ended` is hard (permanent, requires an explicit resume); `mute`
// is soft (temporary, self-recoverable) — never conflated with `ended`.
export function attachTrackInterruptionListeners(
  track: InterruptibleTrack,
  isCurrentTrack: () => boolean,
  onHard: () => void,
  onSoft: () => void,
  onRecovered: () => void,
): void {
  track.addEventListener('ended', () => { if (isCurrentTrack()) onHard() })
  track.addEventListener('mute', () => { if (isCurrentTrack()) onSoft() })
  track.addEventListener('unmute', () => { if (isCurrentTrack()) onRecovered() })
}

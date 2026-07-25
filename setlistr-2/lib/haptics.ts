/**
 * haptics.ts
 *
 * Thin wrapper over @capacitor/haptics.
 *
 * Every call is safe to make from anywhere: on web, and on native builds that
 * predate the plugin being compiled in, these are silent no-ops. The app WebView
 * loads https://setlistr.ai (see capacitor.config.ts), so JS ships ahead of the
 * native binary — a user on an older TestFlight build will run this code without
 * the Haptics plugin registered. Hence the isNativePlatform gate + catch.
 *
 * iOS respects the system haptics setting on its own; nothing to handle here.
 *
 * Two different mechanisms live here, and the split matters:
 *
 * - impact() maps to UIImpactFeedbackGenerator and fires effectively instantly.
 *   This is what anything tapped frequently must use. Weight comes from stacking
 *   pulses: perceived responsiveness is the time to the FIRST pulse, which is
 *   always immediate, so follow-ups add heft at no latency cost.
 *
 * - vibrate() renders a CoreHaptics continuous event — the only way to get a
 *   sustained buzz rather than a tap. It costs more: iOS builds a fresh
 *   CHHapticEngine per call on the main thread, and engine startup runs tens of
 *   milliseconds. Reserved for rare, deliberate, one-per-show actions. Never use
 *   it for anything tapped repeatedly, and always lead with an impact so the
 *   onset is instant regardless of how long the engine takes to spin up.
 */

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

function canVibrate(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Haptics')
}

/** Fire-and-forget — haptics are never worth failing a user action over. */
function impact(style: ImpactStyle): void {
  if (!canVibrate()) return
  Haptics.impact({ style }).catch(() => {})
}

/**
 * A burst of impacts at the given millisecond offsets. Offset 0 fires
 * synchronously so onset is never delayed by a timer tick.
 */
function burst(style: ImpactStyle, offsetsMs: number[]): void {
  if (!canVibrate()) return
  for (const offset of offsetsMs) {
    if (offset === 0) impact(style)
    else setTimeout(() => impact(style), offset)
  }
}

/** Subtle — selection changes, toggles, incremental steps. */
export function tapLight(): void {
  impact(ImpactStyle.Light)
}

/** Standard tap — secondary buttons. */
export function tapMedium(): void {
  impact(ImpactStyle.Medium)
}

/** Single heavy tap — the ceiling for one impact. */
export function tapHeavy(): void {
  impact(ImpactStyle.Heavy)
}

/** Bottom-nav tab — double heavy pulse: instant onset, reads much thicker than one tap. */
export function tapNav(): void {
  burst(ImpactStyle.Heavy, [0, 38])
}

/** Record button — triple heavy pulse, the weightiest thing in the app. */
export function tapRecord(): void {
  burst(ImpactStyle.Heavy, [0, 42, 84])
}

/**
 * Long sustained buzz for show start/stop — the two moments that bookend a
 * capture. Leads with a Heavy impact so onset is instant, then the continuous
 * event carries the weight. See the vibrate() note in the header before reusing
 * this anywhere that gets tapped more than once or twice a show.
 */
export function buzzLong(): void {
  if (!canVibrate()) return
  impact(ImpactStyle.Heavy)
  Haptics.vibrate({ duration: 420 }).catch(() => {})
}

/** Double-pulse confirmation — song confirmed, submission accepted. */
export function notifySuccess(): void {
  if (!canVibrate()) return
  Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}

/** Buzz — failed save, rejected submission. */
export function notifyError(): void {
  if (!canVibrate()) return
  Haptics.notification({ type: NotificationType.Error }).catch(() => {})
}

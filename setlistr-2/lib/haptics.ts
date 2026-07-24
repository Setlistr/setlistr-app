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

/** Subtle — selection changes, toggles, incremental steps. */
export function tapLight(): void {
  impact(ImpactStyle.Light)
}

/** Standard tap — navigation, primary buttons. */
export function tapMedium(): void {
  impact(ImpactStyle.Medium)
}

/** Weighty — consequential actions (start a show, submit to a PRO). */
export function tapHeavy(): void {
  impact(ImpactStyle.Heavy)
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

'use client'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

// Native app only: the launch splash (Setlistr logo on #0a0908) stays up
// while the WebView loads https://setlistr.ai, and this hides it once the
// page has mounted, so the user goes straight from the logo to the app with
// no blank screen between. capacitor.config.ts auto-hides it after 5s anyway
// in case this never runs.
//
// Safe everywhere: on the web, and on native builds that predate the plugin
// (JS ships ahead of the binary, see lib/haptics.ts), this is a no-op.
// Renders nothing.
export default function NativeSplashHide() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('SplashScreen')) return
    SplashScreen.hide().catch(() => {})
  }, [])

  return null
}

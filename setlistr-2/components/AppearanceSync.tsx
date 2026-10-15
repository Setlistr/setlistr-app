'use client'
import { useEffect, useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  APPEARANCE_CHANGE_EVENT, APPEARANCE_STORAGE_KEY, NATIVE_APPEARANCE_GRANT_KEY, THEME_COLOR,
  effectiveAppearance, isNativeApp, storedAppearancePreference,
} from '@/lib/appearance'

// Keeps <html data-appearance> right after the first paint (which the boot
// script in app/layout.tsx already got right): on client-side navigation
// between themed and always-Dark routes, when the OS switches appearance
// while the preference is System, when Settings saves a choice, and when
// another tab changes it. Renders nothing.
//
// Installed app: the preference applies only with the rollout grant (see
// lib/appearance.ts). The grant names the account that set it; if nobody
// or a different account is signed in, it is removed and the app is Dark.

function nativeGrant(): string | null {
  try { return localStorage.getItem(NATIVE_APPEARANCE_GRANT_KEY) } catch { return null }
}

function apply(pathname: string) {
  const light = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches
  const native = isNativeApp(window)
  const appearance = effectiveAppearance(pathname, storedAppearancePreference(), light, native, native && !!nativeGrant())
  const root = document.documentElement
  if (appearance === 'light') root.setAttribute('data-appearance', 'light')
  else root.removeAttribute('data-appearance')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[appearance])
}

export default function AppearanceSync() {
  const pathname = usePathname() || '/'

  // Layout effect: re-applied before the browser paints the new route, so a
  // Light page never shows for a frame on a Dark-only route (or vice versa).
  useLayoutEffect(() => { apply(pathname) }, [pathname])

  useEffect(() => {
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null
    const onChange = () => apply(window.location.pathname)
    const onStorage = (e: StorageEvent) => { if (e.key === APPEARANCE_STORAGE_KEY || e.key === NATIVE_APPEARANCE_GRANT_KEY) onChange() }
    mq?.addEventListener?.('change', onChange)
    window.addEventListener('storage', onStorage)
    window.addEventListener(APPEARANCE_CHANGE_EVENT, onChange)

    // Installed app only: the grant must belong to the signed-in account.
    let unsubscribe: (() => void) | undefined
    if (isNativeApp(window)) {
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        const grant = nativeGrant()
        if (grant && session?.user?.id !== grant) {
          try { localStorage.removeItem(NATIVE_APPEARANCE_GRANT_KEY) } catch {}
          onChange()
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }
    return () => {
      mq?.removeEventListener?.('change', onChange); window.removeEventListener('storage', onStorage); window.removeEventListener(APPEARANCE_CHANGE_EVENT, onChange)
      unsubscribe?.()
    }
  }, [])

  return null
}

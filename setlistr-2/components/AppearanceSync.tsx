'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE_PREFERENCE, THEME_COLOR,
  effectiveAppearance, isNativeApp, parsePreference, type AppearancePreference,
} from '@/lib/appearance'

// Keeps <html data-appearance> right after the first paint (which the boot
// script in app/layout.tsx already got right): on client-side navigation
// between themed and always-Dark routes, when the OS switches appearance
// while the preference is System, and when another tab changes the stored
// preference. Renders nothing; no selector is exposed. The installed app is
// always Dark (see isNativeApp in lib/appearance.ts).

function storedPreference(): AppearancePreference {
  try { return parsePreference(localStorage.getItem(APPEARANCE_STORAGE_KEY)) ?? DEFAULT_APPEARANCE_PREFERENCE }
  catch { return DEFAULT_APPEARANCE_PREFERENCE }
}

function apply(pathname: string) {
  const light = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches
  const appearance = effectiveAppearance(pathname, storedPreference(), light, isNativeApp(window))
  const root = document.documentElement
  if (appearance === 'light') root.setAttribute('data-appearance', 'light')
  else root.removeAttribute('data-appearance')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[appearance])
}

export default function AppearanceSync() {
  const pathname = usePathname() || '/'

  useEffect(() => { apply(pathname) }, [pathname])

  useEffect(() => {
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null
    const onChange = () => apply(window.location.pathname)
    const onStorage = (e: StorageEvent) => { if (e.key === APPEARANCE_STORAGE_KEY) onChange() }
    mq?.addEventListener?.('change', onChange)
    window.addEventListener('storage', onStorage)
    return () => { mq?.removeEventListener?.('change', onChange); window.removeEventListener('storage', onStorage) }
  }, [])

  return null
}

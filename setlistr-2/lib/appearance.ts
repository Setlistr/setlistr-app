// Appearance (Light / Dark / System) — scope, preference and the pre-paint
// boot script. Nothing here exposes a selector: until the readiness review,
// every visitor's preference is the default ('dark') unless one was stored
// (see APPEARANCE_REVIEW_PARAM below for Preview review).
//
// Scope: only screens converted to the --sl-* tokens follow the preference.
// Everything else — marketing, auth, beta, the public share page, admin and
// the screens still listed below — stays Dark whatever is stored, so a dark
// page never renders inside a light frame or vice versa.
//
// Applied as data-appearance="light" on <html>; Dark is the absence of the
// attribute (globals.css :root defaults).

export type AppearancePreference = 'light' | 'dark' | 'system'
export type Appearance = 'light' | 'dark'

export const APPEARANCE_STORAGE_KEY = 'sl-appearance'
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = 'dark'

// Review-only switch: ?appearance=light|dark|system stores that preference,
// but only off the production host (Vercel Preview, localhost) — the
// installed app and setlistr.ai never honour it.
export const APPEARANCE_REVIEW_PARAM = 'appearance'
export const PRODUCTION_HOSTS = ['setlistr.ai', 'www.setlistr.ai']

// Browser chrome / status-bar tint per appearance (<meta name="theme-color">).
export const THEME_COLOR: Record<Appearance, string> = { dark: '#1a1814', light: '#ffffff' }

// Path prefixes inside /app that are NOT themed yet and stay Dark.
export const UNTHEMED_APP_PREFIXES = [
  '/app/new',
  '/app/admin',
  '/app/share-preview',
  '/app/artist/',
  '/app/performances/',
]

// The installed app (Capacitor iOS/Android) is always Dark: its status bar is
// set natively and is not readable over a light page. This holds whatever
// preference is stored in the web view — a separately reviewed native
// change is needed before Light can apply there. Detection mirrors the
// native-iOS check in app/layout.tsx (the bridge Capacitor injects at
// document start), plus Android's bridge and Capacitor's own API.
export function isNativeApp(w: any): boolean {
  try {
    return !!(w?.webkit?.messageHandlers?.bridge) || !!w?.androidBridge
      || !!(w?.Capacitor?.isNativePlatform && w.Capacitor.isNativePlatform())
  } catch { return false }
}

// Installed app — temporary rollout gate (not a permission). The app's
// status bar is hidden (Info.plist), so Light needs no native change, but
// it is being verified on one installed build first. Only an account on
// NATIVE_APPEARANCE_PREVIEW_EMAILS (lib/admin-config) sees the Appearance
// control in the installed app; choosing Light or System there records
// that account's user id on the device (NATIVE_APPEARANCE_GRANT_KEY).
// Without a grant — or once a different account, or nobody, is signed
// in — the installed app is Dark. Choosing Dark removes the grant.
// Nothing here shows, hides or styles the native status bar.
export const NATIVE_APPEARANCE_GRANT_KEY = 'sl-appearance-native'
export const APPEARANCE_CHANGE_EVENT = 'sl-appearance-change'

export function isThemedPath(pathname: string): boolean {
  const p = pathname.split(/[?#]/)[0]
  if (p !== '/app' && !p.startsWith('/app/')) return false
  return !UNTHEMED_APP_PREFIXES.some(prefix =>
    prefix.endsWith('/') ? p.startsWith(prefix) : p === prefix || p.startsWith(prefix + '/'))
}

export function parsePreference(v: unknown): AppearancePreference | null {
  return v === 'light' || v === 'dark' || v === 'system' ? v : null
}

export function resolveAppearance(pref: AppearancePreference, systemPrefersLight: boolean): Appearance {
  if (pref === 'system') return systemPrefersLight ? 'light' : 'dark'
  return pref
}

// What a given page shows: out-of-scope pages are always Dark; inside the
// installed app the preference applies only with the rollout grant.
export function effectiveAppearance(pathname: string, pref: AppearancePreference, systemPrefersLight: boolean, nativeApp = false, nativeGranted = false): Appearance {
  if (!isThemedPath(pathname)) return 'dark'
  if (nativeApp && !nativeGranted) return 'dark'
  return resolveAppearance(pref, systemPrefersLight)
}

// The Settings control's write path: persists on this device and applies
// immediately (AppearanceSync listens for APPEARANCE_CHANGE_EVENT).
// grantUserId: in the installed app, the signed-in gated account's id for
// Light/System, null to remove the grant (Dark).
export function saveAppearancePreference(pref: AppearancePreference, nativeGrantUserId?: string | null) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, pref)
    if (nativeGrantUserId !== undefined) {
      if (nativeGrantUserId && pref !== 'dark') localStorage.setItem(NATIVE_APPEARANCE_GRANT_KEY, nativeGrantUserId)
      else localStorage.removeItem(NATIVE_APPEARANCE_GRANT_KEY)
    }
  } catch {}
  window.dispatchEvent(new Event(APPEARANCE_CHANGE_EVENT))
}

export function storedAppearancePreference(): AppearancePreference {
  try { return parsePreference(localStorage.getItem(APPEARANCE_STORAGE_KEY)) ?? DEFAULT_APPEARANCE_PREFERENCE }
  catch { return DEFAULT_APPEARANCE_PREFERENCE }
}

// Inline <head> script: runs before the body is parsed, so the first paint
// already has the right appearance (no Dark→Light flash). Self-contained —
// it can't import — so the scope list and keys are serialised into it.
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{
var K=${JSON.stringify(APPEARANCE_STORAGE_KEY)},GK=${JSON.stringify(NATIVE_APPEARANCE_GRANT_KEY)},P=${JSON.stringify(APPEARANCE_REVIEW_PARAM)},H=${JSON.stringify(PRODUCTION_HOSTS)},U=${JSON.stringify(UNTHEMED_APP_PREFIXES)},T=${JSON.stringify(THEME_COLOR)};
var ok=function(v){return v==='light'||v==='dark'||v==='system'};
var w=window,nat=!!(w.webkit&&w.webkit.messageHandlers&&w.webkit.messageHandlers.bridge)||!!w.androidBridge;try{nat=nat||!!(w.Capacitor&&w.Capacitor.isNativePlatform&&w.Capacitor.isNativePlatform())}catch(e){}
var pref=null;try{pref=localStorage.getItem(K)}catch(e){}
if(!nat&&H.indexOf(location.hostname)<0){var q=new URLSearchParams(location.search).get(P);if(ok(q)){pref=q;try{localStorage.setItem(K,q)}catch(e){}}}
if(!ok(pref))pref=${JSON.stringify(DEFAULT_APPEARANCE_PREFERENCE)};
var p=location.pathname,themed=(p==='/app'||p.indexOf('/app/')===0)&&!U.some(function(x){return x.charAt(x.length-1)==='/'?p.indexOf(x)===0:(p===x||p.indexOf(x+'/')===0)});
var osl=!!(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches),light=false;
var granted=false;if(nat){try{granted=!!localStorage.getItem(GK)}catch(e){}}
light=themed&&(!nat||granted)&&(pref==='light'||(pref==='system'&&osl));
var d=document.documentElement;if(light)d.setAttribute('data-appearance','light');else d.removeAttribute('data-appearance');
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',light?T.light:T.dark);
}catch(e){}})()`

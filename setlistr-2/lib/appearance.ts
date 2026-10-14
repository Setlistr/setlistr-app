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
// Live capture stays here until its styling proposal is approved.
export const UNTHEMED_APP_PREFIXES = [
  '/app/live/',
  '/app/new',
  '/app/admin',
  '/app/share-preview',
  '/app/artist/',
  '/app/performances/',
]

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

// What a given page shows: out-of-scope pages are always Dark.
export function effectiveAppearance(pathname: string, pref: AppearancePreference, systemPrefersLight: boolean): Appearance {
  return isThemedPath(pathname) ? resolveAppearance(pref, systemPrefersLight) : 'dark'
}

// Inline <head> script: runs before the body is parsed, so the first paint
// already has the right appearance (no Dark→Light flash). Self-contained —
// it can't import — so the scope list and keys are serialised into it.
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{
var K=${JSON.stringify(APPEARANCE_STORAGE_KEY)},P=${JSON.stringify(APPEARANCE_REVIEW_PARAM)},H=${JSON.stringify(PRODUCTION_HOSTS)},U=${JSON.stringify(UNTHEMED_APP_PREFIXES)},T=${JSON.stringify(THEME_COLOR)};
var ok=function(v){return v==='light'||v==='dark'||v==='system'};
var pref=null;try{pref=localStorage.getItem(K)}catch(e){}
if(H.indexOf(location.hostname)<0){var q=new URLSearchParams(location.search).get(P);if(ok(q)){pref=q;try{localStorage.setItem(K,q)}catch(e){}}}
if(!ok(pref))pref=${JSON.stringify(DEFAULT_APPEARANCE_PREFERENCE)};
var p=location.pathname,themed=(p==='/app'||p.indexOf('/app/')===0)&&!U.some(function(x){return x.charAt(x.length-1)==='/'?p.indexOf(x)===0:(p===x||p.indexOf(x+'/')===0)});
var light=themed&&(pref==='light'||(pref==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches));
var d=document.documentElement;if(light)d.setAttribute('data-appearance','light');else d.removeAttribute('data-appearance');
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',light?T.light:T.dark);
}catch(e){}})()`

// Appearance scope + preference + pre-paint boot script.
// npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-appearance.ts
import * as vm from 'vm'
import {
  APPEARANCE_BOOT_SCRIPT, APPEARANCE_STORAGE_KEY, THEME_COLOR,
  NATIVE_APPEARANCE_GRANT_KEY,
  effectiveAppearance, isNativeApp, isThemedPath, parsePreference, resolveAppearance,
} from '../lib/appearance'

let passed = 0, failed = 0
function check(name: string, ok: boolean) { if (ok) passed++; else { failed++; console.log('FAIL', name) } }

// ── Scope ────────────────────────────────────────────────────────────────
for (const p of ['/app', '/app/dashboard', '/app/history', '/app/review/abc', '/app/submit/abc', '/app/show/new', '/app/manager', '/app/manager/artists/x', '/app/settings', '/app/live/abc', '/app/newsletter-not-a-route'])
  check(`themed: ${p}`, isThemedPath(p))
for (const p of ['/', '/start', '/auth/login', '/auth/reset-password', '/beta', '/s/abc', '/publisher', '/privacy', '/app/new', '/app/new/x', '/app/admin', '/app/admin/rd-log', '/app/share-preview', '/app/artist/abc', '/app/performances/abc', '/app/performances/new', '/apple', '/application'])
  check(`always dark: ${p}`, !isThemedPath(p))
check('query string ignored', isThemedPath('/app/dashboard?x=1') && isThemedPath('/app/live/1?autostart=1') && !isThemedPath('/app/new?x=1'))

// ── Preference ───────────────────────────────────────────────────────────
check('parse valid', parsePreference('light') === 'light' && parsePreference('dark') === 'dark' && parsePreference('system') === 'system')
check('parse invalid → null', parsePreference('Light') === null && parsePreference(null) === null && parsePreference('') === null)
check('system follows OS', resolveAppearance('system', true) === 'light' && resolveAppearance('system', false) === 'dark')
check('explicit ignores OS', resolveAppearance('dark', true) === 'dark' && resolveAppearance('light', false) === 'light')
check('out of scope always dark', effectiveAppearance('/auth/login', 'light', true) === 'dark' && effectiveAppearance('/app/admin', 'light', true) === 'dark')
check('installed app always dark, whatever is stored', effectiveAppearance('/app/dashboard', 'light', true, true) === 'dark' && effectiveAppearance('/app/live/1', 'system', true, true) === 'dark')
check('native detection: iOS bridge, Android bridge, Capacitor API; plain browser is not native',
  isNativeApp({ webkit: { messageHandlers: { bridge: {} } } }) && isNativeApp({ androidBridge: {} }) && isNativeApp({ Capacitor: { isNativePlatform: () => true } })
  && !isNativeApp({}) && !isNativeApp({ Capacitor: { isNativePlatform: () => false } }) && !isNativeApp({ webkit: { messageHandlers: {} } }) && !isNativeApp(undefined))
check('in scope follows preference', effectiveAppearance('/app/dashboard', 'light', false) === 'light')

// ── Boot script (runs before first paint) ────────────────────────────────
function boot({ path = '/app/dashboard', search = '', host = 'localhost', stored = null as string | null, osLight = false, storageThrows = false, native = '' as '' | 'ios' | 'android' | 'capacitor', grant = null as string | null } = {}) {
  const attrs: Record<string, string> = {}
  const meta = { content: THEME_COLOR.dark, setAttribute(_k: string, v: string) { this.content = v } }
  const store: Record<string, string> = stored === null ? {} : { [APPEARANCE_STORAGE_KEY]: stored }
  if (grant !== null) store[NATIVE_APPEARANCE_GRANT_KEY] = grant
  const localStorage = {
    getItem: (k: string) => { if (storageThrows) throw new Error('blocked'); return k in store ? store[k] : null },
    setItem: (k: string, v: string) => { if (storageThrows) throw new Error('blocked'); store[k] = v },
  }
  const window: any = { matchMedia: (q: string) => ({ matches: q.includes('light') ? osLight : !osLight }) }
  if (native === 'ios') window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  if (native === 'android') window.androidBridge = {}
  if (native === 'capacitor') window.Capacitor = { isNativePlatform: () => true }
  const ctx: any = {
    window, localStorage, URLSearchParams,
    matchMedia: window.matchMedia,
    location: { pathname: path, search, hostname: host },
    document: {
      documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v }, removeAttribute: (k: string) => { delete attrs[k] } },
      querySelector: () => meta,
    },
  }
  ctx.window = Object.assign(window, { matchMedia: window.matchMedia })
  vm.runInNewContext(APPEARANCE_BOOT_SCRIPT, ctx)
  return { light: attrs['data-appearance'] === 'light', theme: meta.content, stored: store[APPEARANCE_STORAGE_KEY] }
}
check('boot: no preference → Dark (selector hidden, default unchanged)', !boot().light && boot().theme === THEME_COLOR.dark)
check('boot: stored light on themed page → Light + light theme-color', boot({ stored: 'light' }).light && boot({ stored: 'light' }).theme === THEME_COLOR.light)
check('boot: stored light on auth page → Dark', !boot({ stored: 'light', path: '/auth/login' }).light)
check('boot: stored light on live capture → Light (browser)', boot({ stored: 'light', path: '/app/live/1' }).light)
for (const n of ['ios', 'android', 'capacitor'] as const) {
  check(`boot: installed app (${n}) with stored Light → Dark`, !boot({ native: n, stored: 'light' }).light && boot({ native: n, stored: 'light' }).theme === THEME_COLOR.dark)
  check(`boot: installed app (${n}) with System + OS light → Dark`, !boot({ native: n, stored: 'system', osLight: true }).light)
  check(`boot: installed app (${n}) ignores and does not store ?appearance=light`, (() => { const r = boot({ native: n, search: '?appearance=light', host: 'localhost' }); return !r.light && r.stored === undefined })())
  check(`boot: installed app (${n}) on live capture stays Dark`, !boot({ native: n, stored: 'light', path: '/app/live/1' }).light)
}
check('boot: system + OS light → Light', boot({ stored: 'system', osLight: true }).light)
check('boot: system + OS dark → Dark', !boot({ stored: 'system', osLight: false }).light)
check('boot: garbage stored → Dark', !boot({ stored: 'purple' }).light)
check('boot: blocked storage → Dark, no throw', !boot({ storageThrows: true }).light)
check('boot: review param honoured off production and stored', (() => { const r = boot({ search: '?appearance=light', host: 'setlistr-app-git-x.vercel.app' }); return r.light && r.stored === 'light' })())
check('boot: review param ignored on setlistr.ai', (() => { const r = boot({ search: '?appearance=light', host: 'setlistr.ai' }); return !r.light && r.stored === undefined })())
check('boot: review param ignored on www.setlistr.ai', !boot({ search: '?appearance=light', host: 'www.setlistr.ai' }).light)
check('boot: invalid review param ignored', !boot({ search: '?appearance=sepia', host: 'localhost' }).light)

// ── Installed app: temporary rollout grant (account-bound, Dark otherwise) ──
check('browser: grant irrelevant, preference applies', effectiveAppearance('/app/dashboard', 'light', false, false, false) === 'light')
check('installed app without grant → Dark whatever the preference', effectiveAppearance('/app/dashboard', 'light', true, true, false) === 'dark' && effectiveAppearance('/app/dashboard', 'system', true, true, false) === 'dark')
check('installed app with grant → preference applies on themed routes only', effectiveAppearance('/app/live/1', 'light', false, true, true) === 'light' && effectiveAppearance('/auth/login', 'light', false, true, true) === 'dark' && effectiveAppearance('/app/admin', 'light', false, true, true) === 'dark')
check('installed app with grant + System follows the phone', effectiveAppearance('/app/dashboard', 'system', true, true, true) === 'light' && effectiveAppearance('/app/dashboard', 'system', false, true, true) === 'dark')
check('installed app with grant + Dark → Dark', effectiveAppearance('/app/dashboard', 'dark', true, true, true) === 'dark')
const G = '11111111-2222-4333-8444-555555555555'
check('boot: installed app + grant + Light → Light', boot({ native: 'ios', grant: G, stored: 'light' }).light)
check('boot: installed app + grant on auth/marketing → Dark', !boot({ native: 'ios', grant: G, stored: 'light', path: '/auth/login' }).light && !boot({ native: 'ios', grant: G, stored: 'light', path: '/' }).light)
check('boot: installed app + Light but no grant → Dark', !boot({ native: 'android', stored: 'light' }).light)
check('boot: installed app + grant + System → follows phone', boot({ native: 'ios', grant: G, stored: 'system', osLight: true }).light && !boot({ native: 'ios', grant: G, stored: 'system', osLight: false }).light)
check('boot: installed app + grant + Dark → Dark (instant switch back)', !boot({ native: 'ios', grant: G, stored: 'dark' }).light)
check('boot: installed app + grant, storage blocked → Dark', !boot({ native: 'ios', grant: G, stored: 'light', storageThrows: true }).light)
check('boot: installed app ignores ?appearance= even with a grant', (() => { const r = boot({ native: 'ios', grant: G, stored: 'dark', search: '?appearance=light' }); return !r.light && r.stored === 'dark' })())
check('boot: browser default (nothing stored) → Dark', !boot({}).light)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

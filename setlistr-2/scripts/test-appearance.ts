// Appearance scope + preference + pre-paint boot script.
// npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-appearance.ts
import * as vm from 'vm'
import {
  APPEARANCE_BOOT_SCRIPT, APPEARANCE_STORAGE_KEY, THEME_COLOR,
  effectiveAppearance, isThemedPath, parsePreference, resolveAppearance,
} from '../lib/appearance'

let passed = 0, failed = 0
function check(name: string, ok: boolean) { if (ok) passed++; else { failed++; console.log('FAIL', name) } }

// ── Scope ────────────────────────────────────────────────────────────────
for (const p of ['/app', '/app/dashboard', '/app/history', '/app/review/abc', '/app/submit/abc', '/app/show/new', '/app/manager', '/app/manager/artists/x', '/app/settings', '/app/newsletter-not-a-route'])
  check(`themed: ${p}`, isThemedPath(p))
for (const p of ['/', '/start', '/auth/login', '/auth/reset-password', '/beta', '/s/abc', '/publisher', '/privacy', '/app/live/abc', '/app/new', '/app/new/x', '/app/admin', '/app/admin/rd-log', '/app/share-preview', '/app/artist/abc', '/app/performances/abc', '/app/performances/new', '/apple', '/application'])
  check(`always dark: ${p}`, !isThemedPath(p))
check('query string ignored', isThemedPath('/app/dashboard?x=1') && !isThemedPath('/app/live/1?autostart=1'))

// ── Preference ───────────────────────────────────────────────────────────
check('parse valid', parsePreference('light') === 'light' && parsePreference('dark') === 'dark' && parsePreference('system') === 'system')
check('parse invalid → null', parsePreference('Light') === null && parsePreference(null) === null && parsePreference('') === null)
check('system follows OS', resolveAppearance('system', true) === 'light' && resolveAppearance('system', false) === 'dark')
check('explicit ignores OS', resolveAppearance('dark', true) === 'dark' && resolveAppearance('light', false) === 'light')
check('out of scope always dark', effectiveAppearance('/auth/login', 'light', true) === 'dark' && effectiveAppearance('/app/live/1', 'light', true) === 'dark')
check('in scope follows preference', effectiveAppearance('/app/dashboard', 'light', false) === 'light')

// ── Boot script (runs before first paint) ────────────────────────────────
function boot({ path = '/app/dashboard', search = '', host = 'localhost', stored = null as string | null, osLight = false, storageThrows = false } = {}) {
  const attrs: Record<string, string> = {}
  const meta = { content: THEME_COLOR.dark, setAttribute(_k: string, v: string) { this.content = v } }
  const store: Record<string, string> = stored === null ? {} : { [APPEARANCE_STORAGE_KEY]: stored }
  const localStorage = {
    getItem: (k: string) => { if (storageThrows) throw new Error('blocked'); return k in store ? store[k] : null },
    setItem: (k: string, v: string) => { if (storageThrows) throw new Error('blocked'); store[k] = v },
  }
  const window: any = { matchMedia: (q: string) => ({ matches: q.includes('light') ? osLight : !osLight }) }
  const ctx: any = {
    window, localStorage, URLSearchParams,
    matchMedia: window.matchMedia,
    location: { pathname: path, search, hostname: host },
    document: {
      documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v }, removeAttribute: (k: string) => { delete attrs[k] } },
      querySelector: () => meta,
    },
  }
  vm.runInNewContext(APPEARANCE_BOOT_SCRIPT, ctx)
  return { light: attrs['data-appearance'] === 'light', theme: meta.content, stored: store[APPEARANCE_STORAGE_KEY] }
}
check('boot: no preference → Dark (selector hidden, default unchanged)', !boot().light && boot().theme === THEME_COLOR.dark)
check('boot: stored light on themed page → Light + light theme-color', boot({ stored: 'light' }).light && boot({ stored: 'light' }).theme === THEME_COLOR.light)
check('boot: stored light on auth page → Dark', !boot({ stored: 'light', path: '/auth/login' }).light)
check('boot: stored light on live capture → Dark (pending approval)', !boot({ stored: 'light', path: '/app/live/1' }).light)
check('boot: system + OS light → Light', boot({ stored: 'system', osLight: true }).light)
check('boot: system + OS dark → Dark', !boot({ stored: 'system', osLight: false }).light)
check('boot: garbage stored → Dark', !boot({ stored: 'purple' }).light)
check('boot: blocked storage → Dark, no throw', !boot({ storageThrows: true }).light)
check('boot: review param honoured off production and stored', (() => { const r = boot({ search: '?appearance=light', host: 'setlistr-app-git-x.vercel.app' }); return r.light && r.stored === 'light' })())
check('boot: review param ignored on setlistr.ai', (() => { const r = boot({ search: '?appearance=light', host: 'setlistr.ai' }); return !r.light && r.stored === undefined })())
check('boot: review param ignored on www.setlistr.ai', !boot({ search: '?appearance=light', host: 'www.setlistr.ai' }).light)
check('boot: invalid review param ignored', !boot({ search: '?appearance=sepia', host: 'localhost' }).light)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

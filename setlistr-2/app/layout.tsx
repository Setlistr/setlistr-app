import type { Metadata, Viewport } from 'next'
import './globals.css'
import { organizationSchema, softwareApplicationSchema, websiteSchema } from '@/lib/schema'
import { APPEARANCE_BOOT_SCRIPT } from '@/lib/appearance'
import AppearanceSync from '@/components/AppearanceSync'
import NativeSplashHide from '@/components/NativeSplashHide'
import WebOnlyScripts from '@/components/WebOnlyScripts'
import { SENSITIVE_PATH_SOURCE, SENSITIVE_VALUE_SOURCE } from '@/lib/sensitive-url'

export const metadata: Metadata = {
  title: {
    default: 'Setlistr',
    template: '%s | Setlistr',
  },
  description: 'Track every show, keep a confirmed record of every setlist, and prepare the claims you file with your PRO. The live performance record for independent artists.',
  keywords: ['setlistr', 'setlister', 'setlist app', 'live performance royalties', 'setlist tracker', 'music royalty submission', 'SOCAN submission', 'ASCAP submission', 'BMI submission', 'live music tracking', 'artist royalties', 'performance rights'],
  authors: [{ name: 'Setlistr', url: 'https://setlistr.ai' }],
  creator: 'Setlistr',
  metadataBase: new URL('https://setlistr.ai'),
  // No site-wide canonical: each public page declares its own. A canonical
  // here was inherited by every page without one, telling search engines
  // that /start, /support, /privacy and others were copies of the homepage.
  // No placeholder verification tags either; Search Console and Bing
  // verification are account steps (DNS or a real token).
  openGraph: {
    type: 'website',
    siteName: 'Setlistr',
    title: 'Setlistr — Track Every Show. Keep Every Setlist.',
    description: 'The live performance record for independent artists.',
    url: 'https://setlistr.ai',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Setlistr — The live performance record' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — Track Every Show. Keep Every Setlist.',
    description: 'The live performance record for independent artists.',
    creator: '@setlistr',
    images: ['/og-image.jpg'],
  },
  // Indexing is the default; pages that shouldn't be indexed (sign-in, the
  // access waiting page, restricted tools) say noindex themselves. A
  // site-wide "index, follow" here contradicted the 404 page's noindex.
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No maximum scale: capping it at 1 disables pinch zoom wherever the cap is
  // honoured (the native app's WKWebView, Android). Focus zoom on small iOS
  // inputs is handled in globals.css instead.
  themeColor: '#1a1814',
}

// Native iOS app only (Capacitor WKWebView): opt the page into
// viewport-fit=cover so env(safe-area-inset-*) report the device's real
// insets. Capacitor's WKWebView uses contentInsetAdjustmentBehavior .never
// (its default; capacitor.config.ts doesn't override ios.contentInset), so
// the web view fills the screen under the Dynamic Island/home indicator,
// and without cover every env() inset is 0 — headers drew under the island.
// Safari is deliberately left on the default viewport: there the browser
// already keeps the page inside the safe area, and cover would hand that
// job to the page everywhere. Detection mirrors Capacitor's own iOS check
// (native-bridge.js getPlatformId: window.webkit.messageHandlers.bridge),
// which the native app injects at document start, before this runs.
// Runs before first paint: Next emits the viewport <meta> first in <head>.
// React then takes over <head>, so one observer keeps exactly ONE viewport
// <meta>, the one React owns, carrying viewport-fit=cover:
// - React matches head tags by their attributes, so once this script edits
//   the server tag React no longer recognises it: hydration inserts its own
//   fresh tag and abandons the edited one. The abandoned (non-React) tag is
//   removed and React's is edited; React never rewrites it afterwards
//   because its props don't change.
// - When hydration fails outside a Suspense boundary (the homepage's
//   existing style-text mismatch), React re-renders the whole document with
//   a fresh tag; this inline script doesn't run again, the observer does.
// The callback is one querySelectorAll — a no-op once applied. One script,
// one observer per document: client-side navigation doesn't re-run it.
const NATIVE_IOS_VIEWPORT_FIT = `(function(){try{var w=window;if(!(w.webkit&&w.webkit.messageHandlers&&w.webkit.messageHandlers.bridge)||w.androidBridge)return;function owned(m){return Object.keys(m).some(function(k){return k.indexOf('__react')===0})}function fit(){var ms=[].slice.call(document.querySelectorAll('meta[name="viewport"]'));if(ms.length>1){var keep=ms.filter(owned).pop()||ms[ms.length-1];ms.forEach(function(m){if(m!==keep&&!owned(m))m.parentNode.removeChild(m)});ms=[keep]}ms.forEach(function(m){if(m.content.indexOf('viewport-fit')<0)m.setAttribute('content',m.content+', viewport-fit=cover')})}fit();new MutationObserver(fit).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['content']})}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the appearance boot script sets
    // data-appearance on <html> before hydration (this element only).
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_IOS_VIEWPORT_FIT }} />
        {/* Before first paint: Light/Dark for themed /app screens (lib/appearance.ts). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema()) }}
        />
        <script dangerouslySetInnerHTML={{ __html: `!function(key) {var u=location.search+location.hash;try{u=decodeURIComponent(u)}catch(e){}if (window.reb2b || window.androidBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bridge) || new RegExp(${JSON.stringify(SENSITIVE_PATH_SOURCE)}).test(location.pathname) || new RegExp(${JSON.stringify(SENSITIVE_VALUE_SOURCE)}, "i").test(u)) return;window.reb2b = {loaded: true};var s = document.createElement("script");s.async = true;s.src = "https://ddwl4m2hdecbv.cloudfront.net/b/" + key + "/" + key + ".js.gz";document.getElementsByTagName("script")[0].parentNode.insertBefore(s, document.getElementsByTagName("script")[0]);}("1N5W0H7VG8O5");` }} />
      </head>
      <body>
        <AppearanceSync />
        <NativeSplashHide />
        <WebOnlyScripts />
        {children}
      </body>
    </html>
  )
}

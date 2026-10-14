import type { Metadata, Viewport } from 'next'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import Script from 'next/script'
import { organizationSchema, softwareApplicationSchema, websiteSchema } from '@/lib/schema'

export const metadata: Metadata = {
  title: {
    default: 'Setlistr',
    template: '%s | Setlistr',
  },
  description: 'Track every show. Submit every setlist. Collect every royalty. The verified live performance record for independent artists.',
  keywords: ['setlistr', 'setlister', 'setlist app', 'live performance royalties', 'setlist tracker', 'music royalty submission', 'SOCAN submission', 'ASCAP submission', 'BMI submission', 'live music tracking', 'artist royalties', 'performance rights'],
  authors: [{ name: 'Setlistr', url: 'https://setlistr.ai' }],
  creator: 'Setlistr',
  metadataBase: new URL('https://setlistr.ai'),
  alternates: { canonical: '/' },
  verification: {
    google: 'GOOGLE_TOKEN_PLACEHOLDER',
    other: { 'msvalidate.01': 'BING_TOKEN_PLACEHOLDER' },
  },
  openGraph: {
    type: 'website',
    siteName: 'Setlistr',
    title: 'Setlistr — Track Every Show. Collect Every Royalty.',
    description: 'The verified live performance record for independent artists.',
    url: 'https://setlistr.ai',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Setlistr — The verified live performance record' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — Track Every Show. Collect Every Royalty.',
    description: 'The verified live performance record for independent artists.',
    creator: '@setlistr',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
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
  maximumScale: 1,
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
// It also re-applies whenever the viewport <meta> is replaced or rewritten:
// when hydration fails outside a Suspense boundary (the homepage's existing
// style-text mismatch does this), React re-renders the whole document
// client-side with a fresh <meta>, and this inline script doesn't run again.
// The observer's callback is one querySelector, a no-op once applied.
const NATIVE_IOS_VIEWPORT_FIT = `(function(){try{var w=window;if(!(w.webkit&&w.webkit.messageHandlers&&w.webkit.messageHandlers.bridge)||w.androidBridge)return;function fit(){var m=document.querySelector('meta[name="viewport"]');if(m&&m.content.indexOf('viewport-fit')<0)m.setAttribute('content',m.content+', viewport-fit=cover')}fit();new MutationObserver(fit).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['content']})}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NATIVE_IOS_VIEWPORT_FIT }} />
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
        <script dangerouslySetInnerHTML={{ __html: `!function(key) {if (window.reb2b) return;window.reb2b = {loaded: true};var s = document.createElement("script");s.async = true;s.src = "https://ddwl4m2hdecbv.cloudfront.net/b/" + key + "/" + key + ".js.gz";document.getElementsByTagName("script")[0].parentNode.insertBefore(s, document.getElementsByTagName("script")[0]);}("1N5W0H7VG8O5");` }} />
      </head>
      <body>
        <GoogleAnalytics />
        <Script
          id="warmly-script-loader"
          src="https://opps-widget.getwarmly.com/warmly.js?clientId=6ec093d4295038808bea7174bdab7ee6"
          strategy="afterInteractive"
        />
        {children}
        <Script id="linkedin-insight" strategy="afterInteractive">
          {`
            _linkedin_partner_id = "9157938";
            window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
            window._linkedin_data_partner_ids.push(_linkedin_partner_id);
            (function(l) {
              if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
              window.lintrk.q=[]}
              var s = document.getElementsByTagName("script")[0];
              var b = document.createElement("script");
              b.type = "text/javascript";b.async = true;
              b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
              s.parentNode.insertBefore(b, s);})(window.lintrk);
          `}
        </Script>
        <Script
          id="contentsquare"
          src="https://t.contentsquare.net/uxa/a119ec66d2a69.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}

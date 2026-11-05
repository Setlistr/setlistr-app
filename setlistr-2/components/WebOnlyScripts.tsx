'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import { isSensitiveLocation } from '@/lib/sensitive-url'

// Analytics, marketing and session-recording scripts for the website only.
// They never load inside the native app (Capacitor WKWebView), nor in a page
// load that starts on an auth or invitation page (lib/sensitive-url.ts). Once
// loaded they can't be unloaded, so in a page load where they run, any
// navigation into an auth or invitation page becomes a full page load, which
// starts without them.
// Detection mirrors Capacitor's own (native-bridge.js getPlatformId), which
// the native app injects at document start. Rendered after mount, so the
// check runs in the browser; the root layout persists across client
// navigation, so this decides once per document.
export function isNativeShell(): boolean {
  const w = window as any
  return !!(w.androidBridge || w.webkit?.messageHandlers?.bridge)
}

function isSensitiveTarget(href: unknown): URL | null {
  let url: URL
  try { url = new URL(String(href), window.location.href) } catch { return null }
  return url.origin === window.location.origin && isSensitiveLocation(url) ? url : null
}

// Installed before any analytics script loads. Link clicks are caught on window
// in the capture phase, before the router's own handler; programmatic history
// changes (router.push/replace, redirect) are caught in pushState/replaceState.
// Either way the browser loads the destination as a new page instead.
let guardInstalled = false
function guardSensitiveNavigation() {
  if (guardInstalled) return
  guardInstalled = true
  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
    const url = isSensitiveTarget(a.href)
    if (!url) return
    e.preventDefault()
    e.stopImmediatePropagation()
    window.location.assign(url.href)
  }, true)
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method]
    window.history[method] = function (this: History, data: any, unused: string, href?: string | URL | null) {
      const url = href == null ? null : isSensitiveTarget(href)
      if (url) { window.location.assign(url.href); return }
      return original.call(this, data, unused, href)
    }
  }
}

export default function WebOnlyScripts() {
  const [web, setWeb] = useState(false)
  useEffect(() => {
    if (isNativeShell() || isSensitiveLocation(window.location)) return
    guardSensitiveNavigation()
    setWeb(true)
  }, [])
  if (!web) return null

  return (
    <>
      <GoogleAnalytics />
      <Script
        id="warmly-script-loader"
        src="https://opps-widget.getwarmly.com/warmly.js?clientId=6ec093d4295038808bea7174bdab7ee6"
        strategy="afterInteractive"
      />
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
    </>
  )
}

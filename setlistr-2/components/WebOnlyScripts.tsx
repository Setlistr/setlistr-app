'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'

// Marketing and session-recording scripts for the website only. Inside the
// native app (Capacitor WKWebView) they never load: the App Store privacy
// label declares no tracking, and these are advertising/identity tools.
// Detection mirrors Capacitor's own (native-bridge.js getPlatformId), which
// the native app injects at document start. Rendered after mount, so the
// check runs in the browser; the root layout persists across client
// navigation, so this decides once per document.
export function isNativeShell(): boolean {
  const w = window as any
  return !!(w.androidBridge || w.webkit?.messageHandlers?.bridge)
}

export default function WebOnlyScripts() {
  const [web, setWeb] = useState(false)
  useEffect(() => { if (!isNativeShell()) setWeb(true) }, [])
  if (!web) return null

  return (
    <>
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

import type { Metadata, Viewport } from 'next'
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Setlistr',
  description: 'Live Performance Registry',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1a1814',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
      </body>
    </html>
  )
}

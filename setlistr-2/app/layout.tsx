import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, DM_Sans, DM_Mono, DM_Serif_Display } from 'next/font/google'

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--f-bebas', display: 'swap' })
const dmSans = DM_Sans({ weight: ['300','400','500','600','700'], subsets: ['latin'], variable: '--f-dmsans', display: 'swap' })
const dmMono = DM_Mono({ weight: ['400','500'], subsets: ['latin'], variable: '--f-dmmono', display: 'swap' })
const dmSerif = DM_Serif_Display({ weight: '400', style: ['normal','italic'], subsets: ['latin'], variable: '--f-dmserif', display: 'swap' })
import './globals.css'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import Script from 'next/script'

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

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Setlistr',
  legalName: 'Setlistr, Inc.',
  url: 'https://setlistr.ai',
  logo: 'https://setlistr.ai/logo-white.png',
  description:
    'Setlistr is live performance data infrastructure that automatically captures verified setlists from live shows and routes them through royalty submission to SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR.',
}

const softwareAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Setlistr',
  applicationCategory: 'MusicApplication',
  operatingSystem: 'iOS, Web',
  url: 'https://setlistr.ai',
  description:
    'Setlistr automatically captures and verifies live performance setlists via audio recognition, then submits royalty claims to performing rights organizations on behalf of touring artists.',
  offers: {
    '@type': 'Offer',
    category: 'Early access — application required',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${dmSans.variable} ${dmMono.variable} ${dmSerif.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
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

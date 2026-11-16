import type { Metadata } from 'next'

// /start is a client page, so its metadata lives here.
export const metadata: Metadata = {
  title: 'Estimate your live performance royalties',
  description: 'See a rough estimate of the performance royalties your live shows may generate, and how Setlistr helps you keep the setlist record you need to file with your PRO.',
  alternates: { canonical: '/start' },
  openGraph: {
    title: 'Estimate your live performance royalties',
    description: 'A rough estimate of what your live shows may generate, and the setlist record you need to file with your PRO.',
    url: 'https://setlistr.ai/start',
  },
}

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children
}

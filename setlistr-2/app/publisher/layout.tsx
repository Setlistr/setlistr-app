import type { Metadata } from 'next'

// A restricted tool, not a public page: kept out of search results and the
// sitemap. Its access controls are unchanged (the page and its API remain
// admin-only).
export const metadata: Metadata = {
  title: 'Publisher',
  robots: { index: false, follow: false },
}

export default function PublisherLayout({ children }: { children: React.ReactNode }) {
  return children
}

import type { Metadata } from 'next'

// Sign-in, password reset and email confirmation: useful to people, not to
// search results. Crawlable (so this directive is seen) but not indexed.
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}

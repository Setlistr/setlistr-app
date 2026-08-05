// setlistr-2/lib/schema.ts
// Structured data (schema.org JSON-LD) builders. Organization + SoftwareApplication
// were migrated here from app/layout.tsx — see git history on that file for the
// pre-migration inline versions.

export const SITE_URL = 'https://setlistr.ai'
export const SETLISTR_NAME = 'Setlistr'
export const SETLISTR_LEGAL_NAME = 'Setlistr, Inc.'

export const SETLISTR_DESCRIPTION =
  'Setlistr is a live performance intelligence platform that helps artists, songwriters, and their teams capture what was played, build a verified performance record, and prepare eligible shows for royalty claims.'

export const SETLISTR_SHORT = 'The verified live performance record for independent artists.'

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SETLISTR_NAME,
    legalName: SETLISTR_LEGAL_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo-white.png`,
    description: SETLISTR_DESCRIPTION,
    disambiguatingDescription:
      'Setlistr, Inc. is a live performance royalty infrastructure company at setlistr.ai. It is unaffiliated with any similarly named consumer concert or playlist application.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Madison',
      addressRegion: 'TN',
      addressCountry: 'US',
    },
    founder: [
      { '@type': 'Person', name: 'Jesse Slack' },
      { '@type': 'Person', name: 'Daryl Scott' },
    ],
    // TODO: populate once available — LinkedIn company page, Crunchbase profile,
    // GitHub org URL. Do NOT add the App Store URL yet: app is still in review
    // and the link is dead until it's live.
    sameAs: [] as string[],
  }
}

export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SETLISTR_NAME,
    applicationCategory: 'MusicApplication',
    operatingSystem: 'iOS, Web',
    url: SITE_URL,
    description: `${SETLISTR_DESCRIPTION} Currently available by application during early access.`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/LimitedAvailability',
    },
    // Deliberately no aggregateRating / review — fabricating these is a Google
    // structured-data policy violation. Add only once real ratings exist.
  }
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SETLISTR_NAME,
    url: SITE_URL,
  }
}

export interface ArticleSchemaArgs {
  headline: string
  description: string
  slug: string
  datePublished: string
  dateModified?: string
  authorName?: string
}

export function articleSchema({
  headline,
  description,
  slug,
  datePublished,
  dateModified,
  authorName = 'Jesse Slack',
}: ArticleSchemaArgs) {
  const url = `${SITE_URL}${slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    author: { '@type': 'Person', name: authorName },
    publisher: {
      '@type': 'Organization',
      name: SETLISTR_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo-white.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

export interface BreadcrumbItem {
  name: string
  url: string
}

export function breadcrumbSchema({ items }: { items: BreadcrumbItem[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  }
}

export interface FaqItem {
  question: string
  answer: string
}

export function faqSchema({ items }: { items: FaqItem[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export function collectionPageSchema({
  name,
  description,
  slug,
}: {
  name: string
  description: string
  slug: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: `${SITE_URL}${slug}`,
  }
}

import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // /auth/ and /beta are crawlable on purpose: they carry noindex, which a
  // crawler can only read if it may fetch the page. Disallowing them kept the
  // URLs indexable from links with no way to see the directive.
  const disallow = ['/api/', '/app/']

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow,
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow,
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow,
      },
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow,
      },
    ],
    sitemap: 'https://setlistr.ai/sitemap.xml',
  }
}

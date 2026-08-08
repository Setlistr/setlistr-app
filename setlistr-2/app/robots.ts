import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const disallow = ['/api/', '/app/', '/auth/', '/beta']

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

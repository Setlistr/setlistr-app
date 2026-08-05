import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/app/', '/auth/', '/beta'],
      },
    ],
    sitemap: 'https://setlistr.ai/sitemap.xml',
  }
}

import type { MetadataRoute } from 'next';

const BLOG_POST_METADATA = [
  { slug: 'finding-web-clients-egypt', publishedAt: '2026-10-10T10:00:00.000Z' },
  { slug: 'pricing-websites-egypt', publishedAt: '2026-10-05T12:00:00.000Z' },
  { slug: 'cold-outreach-egypt', publishedAt: '2026-09-28T14:00:00.000Z' },
];

const PROGRAMMATIC_PAGES = [
  { city: 'cairo', category: 'medical' },
  { city: 'cairo', category: 'dental' },
  { city: 'cairo', category: 'other' },
  { city: 'giza', category: 'medical' },
  { city: 'giza', category: 'real-estate' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NODE_ENV === 'production'
    ? 'https://leads4dev.com'
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://leads4dev.com')).replace(/\/$/, '');

  const now = new Date();

  return [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}`,
          'en': `${baseUrl}/?locale=en`,
          'x-default': `${baseUrl}`,
        },
      },
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}/pricing`,
          'en': `${baseUrl}/pricing?locale=en`,
          'x-default': `${baseUrl}/pricing`,
        },
      },
    },
    {
      url: `${baseUrl}/leads`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}/leads`,
          'en': `${baseUrl}/leads?locale=en`,
          'x-default': `${baseUrl}/leads`,
        },
      },
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}/privacy`,
          'en': `${baseUrl}/privacy?locale=en`,
          'x-default': `${baseUrl}/privacy`,
        },
      },
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}/blog`,
          'en': `${baseUrl}/blog?locale=en`,
          'x-default': `${baseUrl}/blog`,
        },
      },
    },
    ...BLOG_POST_METADATA.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}/blog/${post.slug}`,
          'en': `${baseUrl}/blog/${post.slug}?locale=en`,
          'x-default': `${baseUrl}/blog/${post.slug}`,
        },
      },
    })),
    // Programmatic geo-category landing pages satisfying minimum threshold (>= 5 canonical leads)
    ...PROGRAMMATIC_PAGES.map((page) => ({
      url: `${baseUrl}/leads/${page.city}/${page.category}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
      alternates: {
        languages: {
          'ar-EG': `${baseUrl}/leads/${page.city}/${page.category}`,
          'en': `${baseUrl}/leads/${page.city}/${page.category}?locale=en`,
          'x-default': `${baseUrl}/leads/${page.city}/${page.category}`,
        },
      },
    })),
  ];
}

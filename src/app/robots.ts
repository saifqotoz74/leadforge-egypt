import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NODE_ENV === 'production'
    ? 'https://leads4dev.com'
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://leads4dev.com')).replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/my-leads',
          '/my-leads/',
          '/settings',
          '/settings/',
          '/subscription',
          '/subscription/',
          '/credits',
          '/credits/',
          '/pipeline',
          '/pipeline/',
          '/onboarding',
          '/onboarding/',
          '/admin',
          '/admin/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/design-system',
          '/design-system/',
          '/api/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: 'leads4dev.com',
  };
}

import type { MetadataRoute } from 'next';
import { SITE_URL, PRIMARY_HOST } from '@/lib/site-config';

export default function robots(): MetadataRoute.Robots {
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
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: PRIMARY_HOST,
  };
}

import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-config';
import { BLOG_POSTS } from '@/data/blog-posts';
import { prisma } from '@/lib/db';
import { resolveProgrammaticParams } from '@/lib/programmatic';
import { isProgrammaticPageEligible } from '@/lib/seo-config';

// Potential candidate programmatic landing pages to evaluate
const CANDIDATE_PROGRAMMATIC_PAGES = [
  { city: 'cairo', category: 'dental' },
  { city: 'cairo', category: 'medical' },
  { city: 'cairo', category: 'other' },
  { city: 'giza', category: 'medical' },
  { city: 'giza', category: 'real-estate' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const contentLastMod = new Date('2026-10-15T12:00:00.000Z');
  const latestBlogPostDate = BLOG_POSTS.length > 0 ? new Date(BLOG_POSTS[0].publishedAt) : contentLastMod;

  // Filter programmatic pages dynamically against indexability rules (>= 10 canonical leads, not 'other')
  const eligibleProgrammaticEntries: MetadataRoute.Sitemap = [];

  for (const page of CANDIDATE_PROGRAMMATIC_PAGES) {
    const { city, category } = resolveProgrammaticParams(page.city, page.category);
    if (!city || !category) continue;

    const [leadCount, latestLead] = await Promise.all([
      prisma.lead.count({
        where: {
          isCanonical: true,
          status: 'AVAILABLE',
          city: { in: city.dbValues },
          category: { in: category.dbValues },
        },
      }),
      prisma.lead.findFirst({
        where: {
          isCanonical: true,
          status: 'AVAILABLE',
          city: { in: city.dbValues },
          category: { in: category.dbValues },
        },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    if (isProgrammaticPageEligible({ leadCount, categorySlug: category.slug })) {
      eligibleProgrammaticEntries.push({
        url: `${SITE_URL}/leads/${page.city}/${page.category}`,
        lastModified: latestLead?.updatedAt || contentLastMod,
        alternates: {
          languages: {
            'ar-EG': `${SITE_URL}/leads/${page.city}/${page.category}`,
            'en': `${SITE_URL}/leads/${page.city}/${page.category}?locale=en`,
            'x-default': `${SITE_URL}/leads/${page.city}/${page.category}`,
          },
        },
      });
    }
  }

  return [
    {
      url: `${SITE_URL}`,
      lastModified: contentLastMod,
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}`,
          'en': `${SITE_URL}/?locale=en`,
          'x-default': `${SITE_URL}`,
        },
      },
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: contentLastMod,
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}/pricing`,
          'en': `${SITE_URL}/pricing?locale=en`,
          'x-default': `${SITE_URL}/pricing`,
        },
      },
    },
    {
      url: `${SITE_URL}/leads`,
      lastModified: contentLastMod,
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}/leads`,
          'en': `${SITE_URL}/leads?locale=en`,
          'x-default': `${SITE_URL}/leads`,
        },
      },
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: contentLastMod,
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}/privacy`,
          'en': `${SITE_URL}/privacy?locale=en`,
          'x-default': `${SITE_URL}/privacy`,
        },
      },
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: contentLastMod,
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}/terms`,
          'en': `${SITE_URL}/terms?locale=en`,
          'x-default': `${SITE_URL}/terms`,
        },
      },
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: latestBlogPostDate,
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}/blog`,
          'en': `${SITE_URL}/blog?locale=en`,
          'x-default': `${SITE_URL}/blog`,
        },
      },
    },
    ...BLOG_POSTS.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      alternates: {
        languages: {
          'ar-EG': `${SITE_URL}/blog/${post.slug}`,
          'en': `${SITE_URL}/blog/${post.slug}?locale=en`,
          'x-default': `${SITE_URL}/blog/${post.slug}`,
        },
      },
    })),
    ...eligibleProgrammaticEntries,
  ];
}

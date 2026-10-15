import React from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LeadDiscoveryClient, { LeadItem } from './LeadDiscoveryClient';
import { PublicLeadsHub, DirectoryCategoryItem } from './PublicLeadsHub';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/site-config';
import { getCachedPlatformStats } from '@/lib/stats';
import { resolveProgrammaticParams } from '@/lib/programmatic';
import { isProgrammaticPageEligible } from '@/lib/seo-config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('leads');
  const locale = await getLocale();

  const title = t('metaTitle');
  const description = t('metaDescription');
  const canonicalUrl = `${SITE_URL}/leads${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${SITE_URL}/leads`,
        'en': `${SITE_URL}/leads?locale=en`,
        'x-default': `${SITE_URL}/leads`,
      },
    },
    openGraph: {
      title: `${title} | Leads4dev`,
      description,
      url: canonicalUrl,
      siteName: 'Leads4dev',
      locale: locale === 'en' ? 'en_US' : 'ar_EG',
      alternateLocale: [locale === 'en' ? 'ar_EG' : 'en_US'],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Leads4dev`,
      description,
    },
  };
}

function maskBusinessName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) {
    return name.slice(0, 3) + '••••';
  }
  return parts[0] + ' ' + '••••••••';
}

const CANDIDATE_DIRECTORIES = [
  { city: 'cairo', category: 'dental' },
  { city: 'cairo', category: 'medical' },
  { city: 'giza', category: 'medical' },
  { city: 'giza', category: 'real-estate' },
];

export default async function LeadDiscoveryPage({
  searchParams,
}: {
  searchParams?: { search?: string };
}) {
  const session = await getSessionFromRequest();
  const isAuthenticated = Boolean(session);
  const locale = await getLocale();

  // If user is authenticated, render the full application explorer
  if (isAuthenticated) {
    return (
      <LeadDiscoveryClient
        initialSearch={searchParams?.search}
        isAuthenticated={true}
        initialLeads={[]}
      />
    );
  }

  // If logged out: render the fast, SEO-friendly Public Directory Hub
  const [stats, dbLeads] = await Promise.all([
    getCachedPlatformStats(),
    prisma.lead.findMany({
      where: {
        isCanonical: true,
        status: 'AVAILABLE',
      },
      take: 9,
      orderBy: { score: 'desc' },
    }),
  ]);

  const directoryItems: DirectoryCategoryItem[] = [];

  for (const item of CANDIDATE_DIRECTORIES) {
    const { city, category } = resolveProgrammaticParams(item.city, item.category);
    if (!city || !category) continue;

    const count = await prisma.lead.count({
      where: {
        isCanonical: true,
        status: 'AVAILABLE',
        city: { in: city.dbValues },
        category: { in: category.dbValues },
      },
    });

    if (isProgrammaticPageEligible({ leadCount: count, categorySlug: category.slug })) {
      directoryItems.push({
        citySlug: city.slug,
        cityNameAr: city.nameAr,
        cityNameEn: city.nameEn,
        categorySlug: category.slug,
        categoryNameAr: category.nameAr,
        categoryNameEn: category.nameEn,
        leadCount: count,
      });
    }
  }

  const sampleLeads: LeadItem[] = dbLeads.map((l) => ({
    id: l.id,
    businessName: maskBusinessName(l.businessName),
    category: l.category,
    governorate: l.governorate,
    city: l.city,
    area: l.area,
    address: null, // Masked
    phone: null, // Masked
    hasPhone: Boolean(l.phone),
    email: null, // Masked
    hasEmail: Boolean(l.email),
    website: l.website,
    websiteStatus: (l.websiteStatus as any) || 'UNKNOWN',
    facebook: null,
    hasFacebook: Boolean(l.facebook),
    instagram: null,
    hasInstagram: Boolean(l.instagram),
    rating: l.rating,
    reviewCount: l.reviewCount,
    branchCount: l.branchCount,
    estimatedBudget: l.estimatedBudget,
    score: l.score,
    temperature: (l.temperature as any) || 'HOT',
    classification: (l.temperature as any) || 'HOT',
    qualityScore: l.qualityScore,
    qualityStatus: l.qualityStatus,
    freshnessStatus: l.freshnessStatus,
    verificationStatus: l.verificationStatus,
    isVerified: l.isVerified,
    qualificationReasons: (l.qualificationReasons as string[]) || [],
    leadType: (l.leadType as any) || 'SHARED',
    exclusive: l.leadType === 'EXCLUSIVE',
    maxPurchasers: l.maxPurchasers,
    currentPurchasers: l.currentPurchasers,
    creditCost: l.leadType === 'EXCLUSIVE' ? 25 : (l.phone ? 5 : 1),
    lastVerifiedAt: (l.lastVerifiedAt || l.updatedAt).toISOString(),
  }));

  return (
    <PublicLeadsHub
      stats={stats}
      directoryItems={directoryItems}
      sampleLeads={sampleLeads}
      locale={locale}
    />
  );
}

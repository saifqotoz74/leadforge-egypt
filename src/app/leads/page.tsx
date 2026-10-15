import React from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LeadDiscoveryClient, { LeadItem } from './LeadDiscoveryClient';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('leads');
  const locale = await getLocale();
  const baseUrl = 'https://leads4dev.com';

  const title = t('metaTitle');
  const description = t('metaDescription');
  const canonicalUrl = `${baseUrl}/leads${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${baseUrl}/leads`,
        'en': `${baseUrl}/leads?locale=en`,
        'x-default': `${baseUrl}/leads`,
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

export default async function LeadDiscoveryPage({
  searchParams,
}: {
  searchParams?: { search?: string };
}) {
  const session = await getSessionFromRequest();
  const isAuthenticated = Boolean(session);

  let initialLeads: LeadItem[] = [];

  if (!isAuthenticated) {
    try {
      const dbLeads = await prisma.lead.findMany({
        where: {
          isCanonical: true,
          status: 'AVAILABLE',
        },
        take: 9,
        orderBy: { score: 'desc' },
      });

      initialLeads = dbLeads.map((l) => ({
        id: l.id,
        businessName: maskBusinessName(l.businessName),
        category: l.category,
        governorate: l.governorate,
        city: l.city,
        area: l.area,
        address: null, // Never expose street address on public pages
        phone: null, // Never expose phone on public pages
        hasPhone: Boolean(l.phone),
        email: null, // Never expose email on public pages
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
    } catch (e) {
      console.error('Failed to load public preview leads:', e);
      initialLeads = [];
    }
  }

  return (
    <LeadDiscoveryClient
      initialSearch={searchParams?.search}
      isAuthenticated={isAuthenticated}
      initialLeads={initialLeads}
    />
  );
}

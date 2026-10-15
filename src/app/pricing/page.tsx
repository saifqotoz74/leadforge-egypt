import React from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSessionFromRequest } from '@/lib/auth';
import { PricingClient } from './PricingClient';

import { SITE_URL } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricing');
  const locale = await getLocale();

  const title = t('metaTitle');
  const description = t('metaDescription');
  const canonicalUrl = `${SITE_URL}/pricing${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${SITE_URL}/pricing`,
        'en': `${SITE_URL}/pricing?locale=en`,
        'x-default': `${SITE_URL}/pricing`,
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

export default async function PricingPage() {
  const session = await getSessionFromRequest();
  const isLoggedIn = Boolean(session);
  const t = await getTranslations('pricing');

  const faqItems = [
    { q: t('faqQ1'), a: t('faqA1') },
    { q: t('faqQ2'), a: t('faqA2') },
    { q: t('faqQ3'), a: t('faqA3') },
    { q: t('faqQ4'), a: t('faqA4') },
    { q: t('faqQ5'), a: t('faqA5') },
    { q: t('faqQ6'), a: t('faqA6') },
    { q: t('faqQ7'), a: t('faqA7') },
    { q: t('faqQ8'), a: t('faqA8') },
    { q: t('faqQ9'), a: t('faqA9') },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a.replace(/<[^>]+>/g, ''),
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PricingClient initialIsLoggedIn={isLoggedIn} />
    </>
  );
}

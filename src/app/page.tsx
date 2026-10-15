import React from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LandingClient from './LandingClient';
import { getCachedPlatformStats } from '@/lib/stats';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  const locale = await getLocale();
  const baseUrl = 'https://leads4dev.com';

  const title = t('metaTitle');
  const description = t('metaDescription');
  const pageTitle = `${title} | Leads4dev`;
  const canonicalUrl = locale === 'en' ? `${baseUrl}/?locale=en` : baseUrl;

  return {
    metadataBase: null,
    title: pageTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': baseUrl,
        'en': `${baseUrl}/?locale=en`,
        'x-default': baseUrl,
      },
    },
    openGraph: {
      title: pageTitle,
      description,
      url: canonicalUrl,
      siteName: 'Leads4dev',
      locale: locale === 'en' ? 'en_US' : 'ar_EG',
      alternateLocale: [locale === 'en' ? 'ar_EG' : 'en_US'],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
    },
  };
}

export default async function HomePage() {
  const t = await getTranslations('landing');
  const locale = await getLocale();
  const stats = await getCachedPlatformStats();

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

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Leads4dev',
      url: 'https://leads4dev.com',
      logo: 'https://leads4dev.com/logo.png',
      description: t('metaDescription'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Leads4dev',
      url: 'https://leads4dev.com',
      inLanguage: locale === 'en' ? 'en' : 'ar',
    },
    {
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
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingClient stats={stats} />
    </>
  );
}

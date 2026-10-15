import React from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { AlertTriangle, Mail } from 'lucide-react';

import { SITE_URL } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms');
  const locale = await getLocale();

  const title = t('metaTitle');
  const description = t('metaDescription');
  const canonicalUrl = `${SITE_URL}/terms${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${SITE_URL}/terms`,
        'en': `${SITE_URL}/terms?locale=en`,
        'x-default': `${SITE_URL}/terms`,
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

export default async function TermsPage() {
  const t = await getTranslations('terms');
  const locale = await getLocale();

  const richIso = {
    iso: (chunks: React.ReactNode) => (
      <span className="ltr-iso font-semibold">{chunks}</span>
    ),
  };

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <PublicNavbar />

      <main className="flex-1 py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Prominent Legal Review Banner */}
          <div
            className="p-4 sm:p-5 rounded-xl border border-warning-border bg-warning-bg text-warning-text mb-8 flex items-start gap-3"
            role="alert"
          >
            <AlertTriangle className="h-5 w-5 text-warning-icon shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-bold text-body-sm sm:text-body">
                {t.rich('legalDraftBanner', richIso)}
              </span>
              <p className="text-caption text-warning-text">
                {locale === 'en'
                  ? 'Disclaimer: This document is an operational draft outlining technical platform rules, points policies, and refund guarantees. It does not replace a formal legal contract or legal counsel under the laws of the Arab Republic of Egypt.'
                  : 'إخلاء مسؤولية: توثق هذه الوثيقة القواعد التشغيلية، وسياسات استهلاك النقاط، وضمان الاسترداد. ولا تُعد بديلاً عن استشارة قانونية متخصصة أو عقداً مصدقاً وفقاً للقوانين المصرية السارية.'}
              </p>
            </div>
          </div>

          {/* Page Heading */}
          <div className="mb-8">
            <h1 className="text-display font-bold text-fg-primary">
              {t('title')}
            </h1>
            <p className="mt-3 text-body-lg text-fg-secondary">
              {t('subtitle')}
            </p>
            <p className="mt-2 text-caption text-fg-muted">
              {t.rich('lastUpdated', richIso)}
            </p>
          </div>

          {/* Terms Sections */}
          <div className="flex flex-col gap-6">
            {/* Section 1 */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section1Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section1Text')}
              </p>
            </section>

            {/* Section 2 */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section2Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section2Text')}
              </p>
            </section>

            {/* Section 3 */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section3Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section3Text')}
              </p>
            </section>

            {/* Section 4 */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section4Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section4Text')}
              </p>
            </section>

            {/* Section 5 */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section5Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section5Text')}
              </p>
              <div className="pt-2">
                <a
                  href="mailto:legal@leads4dev.com"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-subtle border border-line text-fg-brand font-semibold text-body-sm hover:border-line-strong transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  <span className="ltr-iso">legal@leads4dev.com</span>
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

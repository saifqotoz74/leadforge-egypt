import React from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PublicNavbar, PublicFooter } from '@/components/domain/PublicNavbar';
import { AlertTriangle, Mail } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  const locale = await getLocale();
  const baseUrl = 'https://leads4dev.com';

  const title = t('metaTitle');
  const description = t('metaDescription');
  const canonicalUrl = `${baseUrl}/privacy${locale === 'en' ? '?locale=en' : ''}`;

  return {
    title: `${title} | Leads4dev`,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'ar-EG': `${baseUrl}/privacy`,
        'en': `${baseUrl}/privacy?locale=en`,
        'x-default': `${baseUrl}/privacy`,
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

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
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
          {/* Prominent Legal Review Banner (Egypt Law 151/2020) */}
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
                  ? 'Disclaimer: This policy reflects our internal technical operations and deduplication algorithms. It does not constitute formal legal counsel or a statutory compliance certification under Egyptian Law No. 151 of 2020.'
                  : 'إخلاء مسؤولية: توثق هذه الوثيقة السياسات التشغيلية وخوارزميات تنقية وفحص البيانات، ولا تُعد استشارة قانونية رسمية أو شهادة اعتماد بامتثال كامل لأحكام القانون رقم 151 لسنة 2020.'}
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

          {/* Policy Sections */}
          <div className="flex flex-col gap-6">
            {/* Section 1: Data Collection Sources */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section1Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section1Text')}
              </p>
            </section>

            {/* Section 2: Technical Verification & Deduplication */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section2Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t('section2Text')}
              </p>
            </section>

            {/* Section 3: Data Freshness & Retention Policy */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-3 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section3Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t.rich('section3Text', richIso)}
              </p>
            </section>

            {/* Section 4: Business Owner Rights & Free Removal Requests */}
            <section className="rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col gap-4 shadow-xs">
              <h2 className="text-h2 font-bold text-fg-primary">
                {t('section4Title')}
              </h2>
              <p className="text-body text-fg-secondary leading-relaxed">
                {t.rich('section4Text', richIso)}
              </p>
              <div className="pt-2">
                <a
                  href="mailto:privacy@leads4dev.com"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-subtle border border-line text-fg-brand font-semibold text-body-sm hover:border-line-strong transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  <span className="ltr-iso">privacy@leads4dev.com</span>
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

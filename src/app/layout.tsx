import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { i18nFormats } from '@/i18n/request';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';
import { SITE_URL } from '@/lib/site-config';
import './globals.css';

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const metadataBase = new URL(SITE_URL);

  const title = tCommon('metaTitle');
  const description = tCommon('metaDescription');

  return {
    metadataBase,
    title: {
      default: title,
      template: '%s | Leads4dev',
    },
    description,
    applicationName: 'Leads4dev',
    openGraph: {
      title,
      description,
      url: SITE_URL,
      siteName: 'Leads4dev',
      locale: locale === 'en' ? 'en_US' : 'ar_EG',
      alternateLocale: [locale === 'en' ? 'ar_EG' : 'en_US'],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  const orgStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Leads4dev',
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
    description:
      locale === 'ar'
        ? 'منصة مصرية لتقييم ومطابقة فرص العملاء لمطوري ومصممي الويب بقواعد ثابتة وشفافة.'
        : 'Egyptian B2B platform for web developers and agencies to evaluate and match business leads using transparent, deterministic rules.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'EG',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'contact@leads4dev.com',
    },
  };

  const webSiteStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Leads4dev',
    url: SITE_URL,
    inLanguage: ['ar-EG', 'en'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/leads?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-density="comfortable"
      className={`${ibmPlexSansArabic.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgStructuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteStructuredData) }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} formats={i18nFormats}>
          <AnalyticsTracker />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}


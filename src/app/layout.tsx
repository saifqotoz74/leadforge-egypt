import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { i18nFormats } from '@/i18n/request';
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://leads4dev.com';
  const siteUrl = process.env.NODE_ENV === 'production' ? 'https://leads4dev.com' : appUrl;
  const metadataBase = new URL(siteUrl);

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
    alternates: {
      canonical: '/',
      languages: {
        'ar': '/?locale=ar',
        'en': '/?locale=en',
      },
    },
    openGraph: {
      title,
      description,
      url: 'https://leads4dev.com',
      siteName: 'Leads4dev',
      locale: 'ar_EG',
      alternateLocale: ['en_US'],
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

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      data-density="comfortable"
      className={`${ibmPlexSansArabic.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} formats={i18nFormats}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}


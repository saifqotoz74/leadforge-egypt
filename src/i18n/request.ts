import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export const i18nFormats = {
  number: {
    default: {
      numberingSystem: 'latn' as const,
    },
    integer: {
      numberingSystem: 'latn' as const,
      maximumFractionDigits: 0,
    },
  },
  dateTime: {
    short: {
      numberingSystem: 'latn' as const,
      day: 'numeric' as const,
      month: 'short' as const,
      year: 'numeric' as const,
    },
  },
};

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const headersList = headers();

  const localeHeader = headersList.get('x-lf-locale');
  const localeCookie = cookieStore.get('lf_locale')?.value;

  const rawLocale = localeHeader || localeCookie;
  const locale: Locale = rawLocale === 'en' ? 'en' : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    formats: i18nFormats,
  };
});


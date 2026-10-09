import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const localeCookie = cookieStore.get('lf_locale')?.value;
  const locale: Locale = localeCookie === 'en' ? 'en' : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

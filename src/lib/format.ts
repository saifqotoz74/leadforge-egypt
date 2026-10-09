/**
 * LeadForge Egypt — Unified Formatting Utilities (RTL & Western Arabic Numerals)
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md (Section 3.2)
 *
 * Locale-aware:
 * - Arabic uses 'ar-EG-u-nu-latn' (Western digits)
 * - English uses 'en-GB-u-nu-latn' for dates and 'en-US' for numbers
 */

export type SupportedLocale = 'ar' | 'en';

export const getNumberLocaleTag = (locale: SupportedLocale = 'ar'): string =>
  locale === 'en' ? 'en-US' : 'ar-EG-u-nu-latn';

export const getDateLocaleTag = (locale: SupportedLocale = 'ar'): string =>
  locale === 'en' ? 'en-GB-u-nu-latn' : 'ar-EG-u-nu-latn';

export const fmtNumber = (n: number, locale: SupportedLocale = 'ar'): string =>
  new Intl.NumberFormat(getNumberLocaleTag(locale)).format(n);

export const fmtDate = (d: Date | string | number, locale: SupportedLocale = 'ar'): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat(getDateLocaleTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateObj);
};

export const fmtDateTime = (d: Date | string | number, locale: SupportedLocale = 'ar'): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat(getDateLocaleTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
};

export const fmtRelative = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: SupportedLocale = 'ar'
): string =>
  new Intl.RelativeTimeFormat(getDateLocaleTag(locale), { numeric: 'auto' }).format(
    value,
    unit
  );

export const fmtTimeAgo = (d: Date | string | number, locale: SupportedLocale = 'ar'): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffSec < 60) {
    return locale === 'en' ? 'just now' : 'الآن';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return fmtRelative(-diffMin, 'minute', locale);
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return fmtRelative(-diffHours, 'hour', locale);
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return fmtRelative(-diffDays, 'day', locale);
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return fmtRelative(-diffMonths, 'month', locale);
  }
  const diffYears = Math.floor(diffDays / 365);
  return fmtRelative(-diffYears, 'year', locale);
};

export const formatNumber = fmtNumber;
export const formatDate = fmtDate;
export const formatRelativeTime = fmtTimeAgo;
export const formatEGP = (amount: number, locale: SupportedLocale = 'ar'): string =>
  locale === 'en' ? `${fmtNumber(amount, 'en')} EGP` : `${fmtNumber(amount, 'ar')} ج.م`;

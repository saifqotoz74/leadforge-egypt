/**
 * LeadForge Egypt — Unified Formatting Utilities (RTL & Western Arabic Numerals)
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md (Section 3.2) & Block 0.3
 *
 * Locale-aware:
 * - Arabic uses 'ar-EG-u-nu-latn' with numberingSystem: 'latn' (Western digits 0-9)
 * - English uses 'en-GB-u-nu-latn' for dates and 'en-US' for numbers
 */

export type SupportedLocale = 'ar' | 'en';

const EASTERN_ARABIC_DIGITS = /[٠-٩]/g;
const EXTENDED_ARABIC_DIGITS = /[۰-۹]/g;

/**
 * Guarantees Western digits (0-9) in any formatted string regardless of OS/browser ICU defaults.
 */
export const toWesternDigits = (input: string | number): string => {
  const str = String(input);
  return str
    .replace(EASTERN_ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0));
};

export const normalizeLocale = (locale?: string): SupportedLocale =>
  locale === 'en' ? 'en' : 'ar';

export const getNumberLocaleTag = (locale?: SupportedLocale | string): string =>
  normalizeLocale(locale) === 'en' ? 'en-US' : 'ar-EG-u-nu-latn';

export const getDateLocaleTag = (locale?: SupportedLocale | string): string =>
  normalizeLocale(locale) === 'en' ? 'en-GB' : 'ar-EG-u-nu-latn';

export const fmtNumber = (
  n: number,
  locale?: SupportedLocale | string,
  options?: Intl.NumberFormatOptions
): string => {
  if (!Number.isFinite(n)) return '0';
  const tag = getNumberLocaleTag(locale);
  const formatted = new Intl.NumberFormat(tag, {
    numberingSystem: 'latn',
    ...options,
  }).format(n);
  return toWesternDigits(formatted);
};

export const fmtDate = (d: Date | string | number, locale: SupportedLocale | string = 'ar'): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (Number.isNaN(dateObj.getTime())) return '';
  return toWesternDigits(
    new Intl.DateTimeFormat(getDateLocaleTag(locale), {
      numberingSystem: 'latn',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(dateObj)
  );
};

export const fmtDateTime = (d: Date | string | number, locale: SupportedLocale | string = 'ar'): string => {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (Number.isNaN(dateObj.getTime())) return '';
  return toWesternDigits(
    new Intl.DateTimeFormat(getDateLocaleTag(locale), {
      numberingSystem: 'latn',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj)
  );
};

export const fmtRelative = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: SupportedLocale | string = 'ar'
): string =>
  toWesternDigits(
    new Intl.RelativeTimeFormat(getDateLocaleTag(locale), {
      numeric: 'auto',
    }).format(value, unit)
  );

export const fmtTimeAgo = (d: Date | string | number, locale: SupportedLocale | string = 'ar'): string => {
  const loc = normalizeLocale(locale);
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  if (Number.isNaN(dateObj.getTime())) return '';
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (diffSec < 60) {
    return loc === 'en' ? 'just now' : 'الآن';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return fmtRelative(-diffMin, 'minute', loc);
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return fmtRelative(-diffHours, 'hour', loc);
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return fmtRelative(-diffDays, 'day', loc);
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return fmtRelative(-diffMonths, 'month', loc);
  }
  const diffYears = Math.floor(diffDays / 365);
  return fmtRelative(-diffYears, 'year', loc);
};

export const formatNumber = fmtNumber;
export const formatDate = fmtDate;
export const formatRelativeTime = fmtTimeAgo;
export const formatEGP = (amount: number, locale: SupportedLocale | string = 'ar'): string =>
  normalizeLocale(locale) === 'en'
    ? `${fmtNumber(amount, 'en')} EGP`
    : `${fmtNumber(amount, 'ar')} ج.م`;


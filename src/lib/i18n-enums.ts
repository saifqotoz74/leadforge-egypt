import { useTranslations } from 'next-intl';
import arMessages from '../messages/ar.json';
import enMessages from '../messages/en.json';

type MessagesType = typeof arMessages;
type EnumsCatalog = MessagesType['enums'];
type EnumName = keyof EnumsCatalog;

function humanizeEnumFallback(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Client hook to get translated enum label
 * Strictly enforces that raw enum keys are never displayed directly.
 */
export function useEnumLabel() {
  const t = useTranslations('enums');

  return function getLabel<T extends EnumName>(enumName: T, value: string | null | undefined): string {
    if (!value) return '';

    try {
      return (t as unknown as (key: string) => string)(`${enumName}.${value}`);
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `[i18n] Missing enum translation key for enums.${enumName}.${value}. Raw enums must never reach UI.`
        );
      }
      console.warn(`[i18n] Missing translation for enum: enums.${enumName}.${value}`);
      return humanizeEnumFallback(value);
    }
  };
}

/**
 * Server / pure utility function to get translated enum label
 */
export function getEnumLabel<T extends EnumName>(
  enumName: T,
  value: string | null | undefined,
  locale: 'ar' | 'en' = 'ar'
): string {
  if (!value) return '';

  const messages = locale === 'en' ? enMessages : arMessages;
  const enumGroup = (messages.enums as Record<string, Record<string, string>>)[enumName];

  if (enumGroup && enumGroup[value]) {
    return enumGroup[value];
  }

  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      `[i18n] Missing enum translation key for enums.${enumName}.${value} in locale "${locale}". Raw enums must never reach UI.`
    );
  }

  console.warn(`[i18n] Missing translation for enum: enums.${enumName}.${value}`);
  return humanizeEnumFallback(value);
}

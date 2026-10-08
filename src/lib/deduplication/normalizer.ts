import { SourceType } from '@prisma/client';
import { BUSINESS_CATEGORIES, EGYPT_LOCATIONS } from '../constants';
import {
  ParsedAddressComponents,
  ParsedPhoneInfo,
  ParsedSocialIdentity,
  PhoneLineType,
  SocialPlatform,
} from './types';

export const SOCIAL_DOMAINS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'instagr.am',
  'tiktok.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'wa.me',
  'whatsapp.com',
];

const PLACEHOLDER_STRINGS = new Set([
  'none',
  'n/a',
  'na',
  'null',
  'undefined',
  '-',
  '--',
  'لا يوجد',
  'غير متوفر',
]);

/**
 * Converts Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to standard ASCII digits (0-9).
 */
export function convertArabicDigitsToAscii(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Extracts an extension from a raw phone string if present (e.g. "02-25251234 ext. 105", "#105", "تحويلة 105")
 * and returns the base phone string without the extension plus the extracted extension.
 */
function splitPhoneExtension(raw: string): { basePhone: string; extension: string | null } {
  const ascii = convertArabicDigitsToAscii(raw.trim());
  const extMatch = ascii.match(
    /(?:(?:\b(?:ext\.?|extension|x|تحويله|تحويلة|داخلي)\s*[:.-]?\s*)|(?:#\s*))(\d{1,6})\s*$/i
  );
  if (extMatch && extMatch.index !== undefined) {
    return {
      basePhone: ascii.slice(0, extMatch.index).trim(),
      extension: extMatch[1],
    };
  }
  return { basePhone: ascii, extension: null };
}

/**
 * Parses and normalizes a single phone number into structured metadata:
 * - normalized: canonical digit format ("201012345678")
 * - e164: E.164 format ("+201012345678")
 * - type: 'MOBILE' | 'LANDLINE' | 'HOTLINE' | 'INTERNATIONAL'
 * - extension: preserved extension if any
 */
export function parsePhoneDetails(rawPhone?: string | null): ParsedPhoneInfo | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  const trimmed = rawPhone.trim();
  if (!trimmed || PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) return null;

  // If multiple phones were passed in a single string, parse the first valid segment
  const segments = trimmed
    .split(/[/,;|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    for (const seg of segments) {
      const parsed = parseSinglePhoneSegment(seg);
      if (parsed) return parsed;
    }
    return null;
  }

  return parseSinglePhoneSegment(trimmed);
}

function parseSinglePhoneSegment(segment: string): ParsedPhoneInfo | null {
  const { basePhone, extension } = splitPhoneExtension(segment);
  const digits = basePhone.replace(/[^\d]/g, '');
  if (!digits || digits.length < 8 || digits.length > 15) return null;

  let cleaned = digits;
  if (cleaned.startsWith('0020')) {
    cleaned = '20' + cleaned.slice(4);
  } else if (cleaned.startsWith('00') && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }

  // Handle +20 (0) 10... or +20 (0) 2... where a trunk zero follows country code 20
  if (cleaned.startsWith('200') && (cleaned.length === 13 || cleaned.length === 12)) {
    cleaned = '20' + cleaned.slice(3);
  }

  // Handle 10-digit Egyptian mobile numbers where leading 0 was stripped (e.g. Excel CSV export)
  if (cleaned.length === 10 && /^1[0125]\d{8}$/.test(cleaned)) {
    cleaned = '20' + cleaned;
  } else if (cleaned.startsWith('0') && cleaned.length >= 9 && cleaned.length <= 11) {
    cleaned = '20' + cleaned.slice(1);
  }

  // Validate Egyptian number length if starting with 20
  if (cleaned.startsWith('20')) {
    if (cleaned.length < 10 || cleaned.length > 12) {
      return null;
    }
  }

  let type: PhoneLineType = 'INTERNATIONAL';
  let carrierOrAreaCode: string | null = null;

  if (/^201[0125]\d{8}$/.test(cleaned)) {
    type = 'MOBILE';
    carrierOrAreaCode = '0' + cleaned.slice(2, 4); // 010, 011, 012, 015
  } else if (/^20([23]\d{7,8}|[45689]\d{7,8})$/.test(cleaned)) {
    type = 'LANDLINE';
    carrierOrAreaCode =
      cleaned[2] === '2' || cleaned[2] === '3'
        ? '0' + cleaned[2]
        : '0' + cleaned.slice(2, 4);
  }

  return {
    raw: segment,
    normalized: cleaned,
    e164: `+${cleaned}`,
    type,
    extension,
    carrierOrAreaCode,
  };
}

/**
 * Normalizes Egyptian and international phone numbers to a canonical digit string.
 * Examples:
 * "+20 100 123 4567" -> "201001234567"
 * "01001234567"      -> "201001234567"
 * "00201001234567"   -> "201001234567"
 * "02-25251234"      -> "20225251234"
 */
export function normalizePhone(rawPhone?: string | null): string | null {
  const parsed = parsePhoneDetails(rawPhone);
  return parsed ? parsed.normalized : null;
}

/**
 * Parses and normalizes multiple phone numbers (from an array or delimiter-separated string).
 */
export function parsePhonesDetails(
  input?: string | (string | null | undefined)[] | null
): ParsedPhoneInfo[] {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();
  const results: ParsedPhoneInfo[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'string') continue;
    const segments = item
      .split(/[/,;|\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const seg of segments) {
      const parsed = parseSinglePhoneSegment(seg);
      if (parsed && !seen.has(parsed.normalized)) {
        seen.add(parsed.normalized);
        results.push(parsed);
      }
    }
  }

  return results;
}

/**
 * Normalizes multiple phone numbers into a deduplicated list of canonical phone strings.
 */
export function normalizePhones(
  input?: string | (string | null | undefined)[] | null
): string[] {
  return parsePhonesDetails(input).map((p) => p.normalized);
}

/**
 * Normalizes an email address to lowercase trimmed format without altering mailbox semantics.
 */
export function normalizeEmail(rawEmail?: string | null): string | null {
  if (!rawEmail || typeof rawEmail !== 'string') return null;
  let cleaned = rawEmail
    .trim()
    .replace(/^mailto:/i, '')
    .replace(/^[<"'(\s]+|[>"')\s,;]+$/g, '')
    .trim()
    .toLowerCase();

  if (!cleaned || PLACEHOLDER_STRINGS.has(cleaned)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Extracts and normalizes the root/host domain from a URL or domain string.
 * Returns null if empty or if it is a social media link rather than a standalone website.
 */
export function normalizeDomain(rawWebsite?: string | null): string | null {
  if (!rawWebsite || typeof rawWebsite !== 'string') return null;
  let cleaned = rawWebsite.trim().toLowerCase();
  if (!cleaned || PLACEHOLDER_STRINGS.has(cleaned)) {
    return null;
  }

  try {
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = 'https://' + cleaned;
    }
    const url = new URL(cleaned);
    const host = url.hostname
      .replace(/^www\./, '')
      .replace(/\.$/, '')
      .trim();
    if (!host || !host.includes('.')) return null;

    if (SOCIAL_DOMAINS.some((social) => host === social || host.endsWith('.' + social))) {
      return null;
    }
    return host;
  } catch {
    const fallback = cleaned
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .split(':')[0]
      .replace(/\.$/, '')
      .trim();
    if (!fallback || !fallback.includes('.')) return null;
    if (
      SOCIAL_DOMAINS.some((social) => fallback === social || fallback.endsWith('.' + social))
    ) {
      return null;
    }
    return fallback;
  }
}

/**
 * Parses and normalizes a social media URL (Facebook, Instagram, LinkedIn, TikTok, X/Twitter, YouTube)
 * into a deterministic identity representation (e.g. "facebook.com/example").
 */
export function parseSocialIdentity(
  rawUrl?: string | null,
  defaultPlatform?: SocialPlatform
): ParsedSocialIdentity | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let cleaned = rawUrl.trim();
  if (!cleaned || PLACEHOLDER_STRINGS.has(cleaned.toLowerCase())) return null;

  // Handle @handle shorthand if defaultPlatform is provided
  if (!cleaned.includes('/') && !cleaned.includes('.') && defaultPlatform) {
    const handle = cleaned.replace(/^@/, '').trim().toLowerCase();
    if (!handle || handle.length < 2) return null;
    const host =
      defaultPlatform === 'FACEBOOK'
        ? 'facebook.com'
        : defaultPlatform === 'INSTAGRAM'
          ? 'instagram.com'
          : defaultPlatform === 'TIKTOK'
            ? 'tiktok.com'
            : defaultPlatform === 'LINKEDIN'
              ? 'linkedin.com'
              : defaultPlatform === 'TWITTER'
                ? 'x.com'
                : 'facebook.com';
    return {
      platform: defaultPlatform,
      handle,
      normalizedUrl: `${host}/${handle}`,
      canonicalUrl: `https://${host}/${handle}`,
    };
  }

  try {
    if (!/^https?:\/\//i.test(cleaned)) {
      cleaned = 'https://' + cleaned;
    }
    const url = new URL(cleaned);
    const rawHost = url.hostname.toLowerCase().replace(/^(www|m|web|touch|business)\./, '');

    let platform: SocialPlatform = 'OTHER';
    let canonicalHost = rawHost;

    if (rawHost === 'facebook.com' || rawHost === 'fb.com' || rawHost.endsWith('.facebook.com')) {
      platform = 'FACEBOOK';
      canonicalHost = 'facebook.com';
    } else if (
      rawHost === 'instagram.com' ||
      rawHost === 'instagr.am' ||
      rawHost.endsWith('.instagram.com')
    ) {
      platform = 'INSTAGRAM';
      canonicalHost = 'instagram.com';
    } else if (rawHost === 'linkedin.com' || rawHost.endsWith('.linkedin.com')) {
      platform = 'LINKEDIN';
      canonicalHost = 'linkedin.com';
    } else if (rawHost === 'tiktok.com' || rawHost.endsWith('.tiktok.com')) {
      platform = 'TIKTOK';
      canonicalHost = 'tiktok.com';
    } else if (
      rawHost === 'twitter.com' ||
      rawHost === 'x.com' ||
      rawHost.endsWith('.twitter.com')
    ) {
      platform = 'TWITTER';
      canonicalHost = 'x.com';
    } else if (rawHost === 'youtube.com' || rawHost === 'youtu.be') {
      platform = 'YOUTUBE';
      canonicalHost = 'youtube.com';
    } else if (rawHost === 'wa.me' || rawHost === 'whatsapp.com') {
      platform = 'WHATSAPP';
      canonicalHost = 'wa.me';
    } else {
      return null;
    }

    // Special case: Facebook profile.php?id=...
    if (platform === 'FACEBOOK' && url.pathname.toLowerCase().replace(/\/+$/, '') === '/profile.php') {
      const id = url.searchParams.get('id')?.trim();
      if (!id) return null;
      const handle = `profile.php?id=${id}`;
      return {
        platform,
        handle,
        normalizedUrl: `${canonicalHost}/${handle}`,
        canonicalUrl: `https://${canonicalHost}/${handle}`,
      };
    }

    const segments = url.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length === 0) return null;

    let handle = '';
    if (platform === 'FACEBOOK' && segments[0].toLowerCase() === 'pages' && segments.length >= 2) {
      handle = segments
        .slice(1)
        .join('/')
        .toLowerCase();
    } else if (
      platform === 'LINKEDIN' &&
      (segments[0].toLowerCase() === 'company' || segments[0].toLowerCase() === 'in') &&
      segments.length >= 2
    ) {
      handle = `${segments[0].toLowerCase()}/${segments[1].toLowerCase()}`;
    } else {
      handle = segments[0].toLowerCase();
    }

    if (!handle || ['sharer', 'sharer.php', 'share.php', 'login', 'watch', 'reel'].includes(handle)) {
      return null;
    }

    const normalizedUrl = `${canonicalHost}/${handle}`;
    return {
      platform,
      handle,
      normalizedUrl,
      canonicalUrl: `https://${normalizedUrl}`,
    };
  } catch {
    return null;
  }
}

/**
 * Normalizes a social media URL to its canonical host/handle string (e.g. "facebook.com/example").
 */
export function normalizeSocialUrl(
  rawUrl?: string | null,
  defaultPlatform?: SocialPlatform
): string | null {
  const parsed = parseSocialIdentity(rawUrl, defaultPlatform);
  return parsed ? parsed.normalizedUrl : null;
}

/**
 * Normalizes Arabic and English business names for deterministic deduplication.
 * Unifies Arabic Alef variants, Taa Marbouta, Yaa, removes Tashkeel, Tatweel, & punctuation.
 * Does NOT perform aggressive Arabic-Latin transliteration.
 */
export function normalizeBusinessName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') return '';
  let cleaned = convertArabicDigitsToAscii(rawName)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Remove Arabic Tashkeel & Tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip trailing corporate/legal entity suffixes repeatedly
  const suffixPattern =
    /(?:\s+(?:ش\s+م\s+م|ذ\s+م\s+م|شركه\s+مساهمه\s+مصريه|ذات\s+مسؤوليه\s+محدوده|ذات\s+مسئوليه\s+محدوده|للمسؤوليه\s+محدوده|للمسئوليه\s+محدوده|llc|l\s+l\s+c|ltd|limited|inc|incorporated|corp|corporation|co|s\s+a\s+e|sae))+$/i;
  cleaned = cleaned.replace(suffixPattern, '').trim();

  return cleaned;
}

const GENERIC_BUSINESS_STOP_WORDS = new Set([
  'dr',
  'doctor',
  'prof',
  'eng',
  'د',
  'دكتور',
  'دكتوره',
  'م',
  'مهندس',
  'clinic',
  'clinics',
  'center',
  'centers',
  'centre',
  'dental',
  'dentist',
  'medical',
  'hospital',
  'labs',
  'lab',
  'pharmacy',
  'restaurant',
  'restaurants',
  'cafe',
  'coffee',
  'company',
  'group',
  'agency',
  'store',
  'shop',
  'salon',
  'spa',
  'academy',
  'school',
  'egypt',
  'eg',
  'cairo',
  'giza',
  'alexandria',
  'alex',
  'عياده',
  'عيادات',
  'مركز',
  'مراكز',
  'مستشفي',
  'لطب',
  'طب',
  'وتجميل',
  'تجميل',
  'الاسنان',
  'اسنان',
  'الطبي',
  'طبي',
  'التخصصي',
  'تخصصي',
  'مطعم',
  'مطاعم',
  'كافيه',
  'شركه',
  'مجموعه',
  'معرض',
  'محل',
  'اكاديميه',
  'مصر',
  'القاهره',
  'الجيزه',
  'الاسكندريه',
]);

/**
 * Extracts the distinctive brand tokens from a business name by stripping common honorifics,
 * generic category terms, and city suffixes when doing so leaves at least one brand token.
 * Used as a supporting signal (never used alone to auto-merge).
 */
export function extractCoreBusinessName(rawOrNormalizedName?: string | null): string {
  const norm = normalizeBusinessName(rawOrNormalizedName);
  if (!norm) return '';
  const tokens = norm.split(' ').filter(Boolean);
  const coreTokens = tokens.filter((t) => !GENERIC_BUSINESS_STOP_WORDS.has(t));
  return coreTokens.length > 0 ? coreTokens.join(' ') : norm;
}

/**
 * Normalizes street addresses while preserving building number, street name, and district.
 */
export function normalizeAddress(rawAddress?: string | null): string | null {
  if (!rawAddress || typeof rawAddress !== 'string') return null;
  const trimmed = rawAddress.trim();
  if (!trimmed || PLACEHOLDER_STRINGS.has(trimmed.toLowerCase())) return null;

  const normalized = normalizeBusinessName(trimmed)
    .replace(/\b(street|st|road|rd|avenue|ave|building|bldg|floor|fl|apt)\b/g, ' ')
    .replace(
      /(?:^|\s)(شارع|ش|ميدان|عماره|عمارة|برج|بجوار|امام|أمام|المنطقه|الحى|الحي)(?=\s|$)/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

/**
 * Extracts an explicit leading or street building number from an address if present,
 * so neighboring businesses on the same street (e.g. "10 Abbas El Akkad" vs "25 Abbas El Akkad")
 * are never conflated.
 */
export function extractAddressBuildingNumber(rawAddress?: string | null): string | null {
  if (!rawAddress || typeof rawAddress !== 'string') return null;
  const ascii = convertArabicDigitsToAscii(rawAddress.trim().toLowerCase());
  // Match leading building number (e.g. "42 شارع مكرم عبيد" or "15 Makram Ebeid St")
  // Avoid matching "6 october" / "6 اكتوبر" or "10th of ramadan" / "شارع 9"
  const leadingMatch = ascii.match(
    /^(\d{1,5})\s+(?!(?:اكتوبر|أكتوبر|october|th\s+of\s+ramadan|من\s+رمضان)\b)/i
  );
  if (leadingMatch) {
    return leadingMatch[1];
  }
  const explicitBldgMatch = ascii.match(
    /(?:\b(?:عقار|عمارة|عماره|برج|مبنى|مبني|building|bldg|no\.?|رقم)\s*)(\d{1,5})\b/i
  );
  if (explicitBldgMatch) {
    return explicitBldgMatch[1];
  }
  return null;
}

/**
 * Checks if two addresses have explicit DIFFERENT building numbers on the same street.
 */
export function doAddressesConflictOnBuildingNumber(
  addressA?: string | null,
  addressB?: string | null
): boolean {
  const numA = extractAddressBuildingNumber(addressA);
  const numB = extractAddressBuildingNumber(addressB);
  if (numA && numB && numA !== numB) {
    return true;
  }
  return false;
}

export function parseAddressComponents(
  rawAddress?: string | null,
  district?: string | null,
  city?: string | null,
  governorate?: string | null
): ParsedAddressComponents | null {
  const normalized = normalizeAddress(rawAddress);
  if (!normalized) return null;
  const buildingNumber = extractAddressBuildingNumber(rawAddress);
  const streetCore = buildingNumber
    ? normalized.replace(new RegExp(`^${buildingNumber}\\b\\s*`), '').trim()
    : normalized;

  return {
    raw: rawAddress || '',
    normalized,
    buildingNumber,
    streetCore: streetCore || normalized,
    district: district?.trim() || null,
    city: city?.trim() || null,
    governorate: governorate?.trim() || null,
  };
}

/**
 * Normalizes category strings from English or Arabic into one of the canonical categories.
 */
export function normalizeCategory(rawCategory?: string | null): string {
  if (!rawCategory) return 'Other';
  const trimmed = rawCategory.trim().toLowerCase();

  const mapping: Record<string, string> = {
    dental: 'Dental',
    'dental clinic': 'Dental',
    'dental clinics': 'Dental',
    dentist: 'Dental',
    اسنان: 'Dental',
    أسنان: 'Dental',
    'عيادة أسنان': 'Dental',
    'عيادة اسنان': 'Dental',
    'عيادات أسنان': 'Dental',

    medical: 'Medical',
    clinic: 'Medical',
    hospital: 'Medical',
    pharmacy: 'Medical',
    طبي: 'Medical',
    عيادة: 'Medical',
    'مركز طبي': 'Medical',
    مستشفى: 'Medical',

    restaurant: 'Restaurant',
    restaurants: 'Restaurant',
    cafe: 'Restaurant',
    coffee: 'Restaurant',
    food: 'Restaurant',
    مطعم: 'Restaurant',
    مطاعم: 'Restaurant',
    كافيه: 'Restaurant',

    'real estate': 'Real Estate',
    realestate: 'Real Estate',
    property: 'Real Estate',
    construction: 'Real Estate',
    عقارات: 'Real Estate',
    'تطوير عقاري': 'Real Estate',
    مقاولات: 'Real Estate',

    education: 'Education',
    school: 'Education',
    academy: 'Education',
    training: 'Education',
    تعليم: 'Education',
    أكاديمية: 'Education',
    اكاديمية: 'Education',
    مدرسة: 'Education',
    'مركز تدريب': 'Education',

    retail: 'Retail',
    store: 'Retail',
    shop: 'Retail',
    supermarket: 'Retail',
    تجارة: 'Retail',
    محل: 'Retail',
    معرض: 'Retail',

    beauty: 'Beauty',
    salon: 'Beauty',
    spa: 'Beauty',
    cosmetics: 'Beauty',
    تجميل: 'Beauty',
    بيوتي: 'Beauty',
    صالون: 'Beauty',

    automotive: 'Automotive',
    car: 'Automotive',
    cars: 'Automotive',
    auto: 'Automotive',
    سيارات: 'Automotive',
    'صيانة سيارات': 'Automotive',
    'معرض سيارات': 'Automotive',
  };

  if (mapping[trimmed]) return mapping[trimmed];

  const found = BUSINESS_CATEGORIES.find(
    (c) => c.value.toLowerCase() === trimmed || c.labelAr === rawCategory.trim()
  );
  if (found) return found.value;

  if (trimmed.includes('dental') || trimmed.includes('اسنان') || trimmed.includes('أسنان'))
    return 'Dental';
  if (trimmed.includes('restaur') || trimmed.includes('مطعم') || trimmed.includes('كافيه'))
    return 'Restaurant';
  if (trimmed.includes('estate') || trimmed.includes('عقار')) return 'Real Estate';
  if (
    trimmed.includes('educat') ||
    trimmed.includes('أكاديم') ||
    trimmed.includes('اكاديم') ||
    trimmed.includes('مدرس')
  )
    return 'Education';
  if (trimmed.includes('medic') || trimmed.includes('طبي') || trimmed.includes('عياد'))
    return 'Medical';
  if (trimmed.includes('retail') || trimmed.includes('متجر') || trimmed.includes('معرض'))
    return 'Retail';
  if (trimmed.includes('beaut') || trimmed.includes('تجميل') || trimmed.includes('صالون'))
    return 'Beauty';
  if (trimmed.includes('auto') || trimmed.includes('سيار')) return 'Automotive';

  return 'Other';
}

/**
 * Normalizes city and resolves its Egyptian governorate.
 */
export function normalizeCityAndGovernorate(
  rawCity?: string | null,
  rawGovernorate?: string | null
): { city: string; governorate: string } {
  const cityMap: Record<string, { city: string; governorate: string }> = {
    cairo: { city: 'القاهرة', governorate: 'القاهرة' },
    القاهرة: { city: 'القاهرة', governorate: 'القاهرة' },
    القاهره: { city: 'القاهرة', governorate: 'القاهرة' },
    'new cairo': { city: 'القاهرة الجديدة', governorate: 'القاهرة' },
    'القاهرة الجديدة': { city: 'القاهرة الجديدة', governorate: 'القاهرة' },
    helwan: { city: 'حلوان', governorate: 'القاهرة' },
    حلوان: { city: 'حلوان', governorate: 'القاهرة' },
    giza: { city: 'الجيزة', governorate: 'الجيزة' },
    الجيزة: { city: 'الجيزة', governorate: 'الجيزة' },
    الجيزه: { city: 'الجيزة', governorate: 'الجيزة' },
    'sheikh zayed': { city: 'الشيخ زايد', governorate: 'الجيزة' },
    zayed: { city: 'الشيخ زايد', governorate: 'الجيزة' },
    'الشيخ زايد': { city: 'الشيخ زايد', governorate: 'الجيزة' },
    '6 october': { city: '6 أكتوبر', governorate: 'الجيزة' },
    '6th of october': { city: '6 أكتوبر', governorate: 'الجيزة' },
    october: { city: '6 أكتوبر', governorate: 'الجيزة' },
    '6 أكتوبر': { city: '6 أكتوبر', governorate: 'الجيزة' },
    '6 اكتوبر': { city: '6 أكتوبر', governorate: 'الجيزة' },
    alexandria: { city: 'الإسكندرية', governorate: 'الإسكندرية' },
    alex: { city: 'الإسكندرية', governorate: 'الإسكندرية' },
    الإسكندرية: { city: 'الإسكندرية', governorate: 'الإسكندرية' },
    الاسكندرية: { city: 'الإسكندرية', governorate: 'الإسكندرية' },
    الاسكندريه: { city: 'الإسكندرية', governorate: 'الإسكندرية' },
    mansoura: { city: 'المنصورة', governorate: 'الدقهلية' },
    المنصورة: { city: 'المنصورة', governorate: 'الدقهلية' },
    المنصوره: { city: 'المنصورة', governorate: 'الدقهلية' },
    tanta: { city: 'طنطا', governorate: 'الغربية' },
    طنطا: { city: 'طنطا', governorate: 'الغربية' },
    mahalla: { city: 'المحلة الكبرى', governorate: 'الغربية' },
    'المحلة الكبرى': { city: 'المحلة الكبرى', governorate: 'الغربية' },
    zagazig: { city: 'الزقازيق', governorate: 'الشرقية' },
    الزقازيق: { city: 'الزقازيق', governorate: 'الشرقية' },
    '10th of ramadan': { city: 'العاشر من رمضان', governorate: 'الشرقية' },
    'العاشر من رمضان': { city: 'العاشر من رمضان', governorate: 'الشرقية' },
    banha: { city: 'بنها', governorate: 'القليوبية' },
    بنها: { city: 'بنها', governorate: 'القليوبية' },
    obour: { city: 'العبور', governorate: 'القليوبية' },
    العبور: { city: 'العبور', governorate: 'القليوبية' },
    assiut: { city: 'أسيوط', governorate: 'أسيوط' },
    asyut: { city: 'أسيوط', governorate: 'أسيوط' },
    أسيوط: { city: 'أسيوط', governorate: 'أسيوط' },
    اسيوط: { city: 'أسيوط', governorate: 'أسيوط' },
    hurghada: { city: 'الغردقة', governorate: 'البحر الأحمر' },
    الغردقة: { city: 'الغردقة', governorate: 'البحر الأحمر' },
    'port said': { city: 'بورسعيد', governorate: 'بورسعيد' },
    بورسعيد: { city: 'بورسعيد', governorate: 'بورسعيد' },
  };

  const cleanedCity = (rawCity || '').trim().toLowerCase();
  if (cityMap[cleanedCity]) {
    return cityMap[cleanedCity];
  }

  for (const gov of EGYPT_LOCATIONS) {
    for (const c of gov.cities) {
      if (c.name === rawCity?.trim()) {
        return { city: c.name, governorate: gov.governorate };
      }
    }
  }

  const finalCity = rawCity?.trim() || 'القاهرة';
  const finalGov = rawGovernorate?.trim() || 'القاهرة';
  return { city: finalCity, governorate: finalGov };
}

/**
 * Normalizes an external source identifier (e.g. Google Place ID, directory listing ID, CRM row ID).
 */
export function normalizeSourceExternalId(rawExternalId?: string | number | null): string | null {
  if (rawExternalId === undefined || rawExternalId === null) return null;
  const cleaned = String(rawExternalId).trim();
  if (!cleaned || PLACEHOLDER_STRINGS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

/**
 * Resolves a canonical SourceType enum value from a source name or type string.
 */
export function resolveSourceType(
  sourceTypeOrName?: string | SourceType | null
): SourceType {
  if (!sourceTypeOrName) return 'MANUAL';
  const upper = String(sourceTypeOrName).trim().toUpperCase();
  if (
    ['MANUAL', 'CSV_IMPORT', 'OPEN_DATA', 'DIRECTORY', 'WEBSITE', 'GOOGLE_BUSINESS'].includes(
      upper
    )
  ) {
    return upper as SourceType;
  }
  const lower = String(sourceTypeOrName).trim().toLowerCase();
  if (lower.includes('google')) return 'GOOGLE_BUSINESS';
  if (lower.includes('csv')) return 'CSV_IMPORT';
  if (lower.includes('open') || lower.includes('registry')) return 'OPEN_DATA';
  if (lower.includes('directory') || lower.includes('yellow')) return 'DIRECTORY';
  if (lower.includes('website') || lower.includes('domain')) return 'WEBSITE';
  return 'MANUAL';
}

/**
 * Calculates deterministic Estimated Project Budget (in EGP) based on rules:
 * Base budget from category + bonus for multiple branches + bonus for high reviews.
 */
export function calculateEstimatedBudget(params: {
  category: string;
  reviewCount: number;
  branchCount: number;
  rating?: number | null;
}): number {
  const catObj = BUSINESS_CATEGORIES.find((c) => c.value === params.category);
  let budget = catObj ? catObj.defaultEstimatedBudget : 8000;

  if (params.branchCount > 1) {
    budget += Math.min((params.branchCount - 1) * 3500, 15000);
  }
  if (params.reviewCount >= 200) {
    budget += 5000;
  } else if (params.reviewCount >= 50) {
    budget += 2500;
  }
  if (params.rating && params.rating >= 4.5) {
    budget += 1500;
  }

  return budget;
}

export const extractCoreBrandName = extractCoreBusinessName;
export const parseAddressDetails = parseAddressComponents;

export function compareBusinessNames(
  nameA?: string | null,
  nameB?: string | null
): {
  exactNormalizedMatch: boolean;
  coreBrandMatch: boolean;
} {
  const normA = normalizeBusinessName(nameA);
  const normB = normalizeBusinessName(nameB);
  const coreA = extractCoreBusinessName(nameA);
  const coreB = extractCoreBusinessName(nameB);

  return {
    exactNormalizedMatch: Boolean(normA && normB && normA === normB),
    coreBrandMatch: Boolean(coreA && coreB && coreA.length >= 4 && coreA === coreB),
  };
}

export function compareAddresses(
  addrA?: string | null,
  addrB?: string | null
): {
  exactMatch: boolean;
  buildingConflict: boolean;
} {
  const normA = normalizeAddress(addrA);
  const normB = normalizeAddress(addrB);
  const buildingConflict = doAddressesConflictOnBuildingNumber(addrA, addrB);
  return {
    exactMatch: Boolean(normA && normB && normA === normB && !buildingConflict),
    buildingConflict,
  };
}

/**
 * Centralized NormalizationService exposing all deterministic field normalizers.
 */
export class NormalizationService {
  static normalizeBusinessName = normalizeBusinessName;
  static extractCoreBusinessName = extractCoreBusinessName;
  static extractCoreBrandName = extractCoreBusinessName;
  static compareBusinessNames = compareBusinessNames;
  static normalizePhone = normalizePhone;
  static normalizePhones = normalizePhones;
  static parsePhoneDetails = parsePhoneDetails;
  static parsePhonesDetails = parsePhonesDetails;
  static normalizeEmail = normalizeEmail;
  static normalizeDomain = normalizeDomain;
  static normalizeSocialUrl = normalizeSocialUrl;
  static parseSocialIdentity = parseSocialIdentity;
  static normalizeAddress = normalizeAddress;
  static parseAddressComponents = parseAddressComponents;
  static parseAddressDetails = parseAddressComponents;
  static extractAddressBuildingNumber = extractAddressBuildingNumber;
  static doAddressesConflictOnBuildingNumber = doAddressesConflictOnBuildingNumber;
  static compareAddresses = compareAddresses;
  static normalizeCategory = normalizeCategory;
  static normalizeCityAndGovernorate = normalizeCityAndGovernorate;
  static normalizeSourceExternalId = normalizeSourceExternalId;
  static resolveSourceType = resolveSourceType;
  static calculateEstimatedBudget = calculateEstimatedBudget;
}

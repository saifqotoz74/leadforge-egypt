import { BusinessOperationalStatus, WebsiteStatus } from '@prisma/client';
import { BUSINESS_CATEGORIES, EGYPT_LOCATIONS } from '../constants';
import {
  convertArabicDigitsToAscii,
  normalizeBusinessName,
  normalizeDomain,
  parsePhoneDetails,
} from '../normalizer';
import { analyzeWebsiteStatic, WebsiteAnalysisResult } from '../website-analyzer';
import {
  EmailValidationState,
  PhoneValidationState,
  VerificationErrorType,
  WebsiteVerificationState,
} from './types';

export interface PhoneValidationResult {
  status: PhoneValidationState;
  normalizedPhone: string | null;
  phoneType: 'MOBILE' | 'LANDLINE' | 'HOTLINE' | 'NONE';
  reason: string;
}

const BOGUS_PHONE_PATTERNS = [
  /^201[0125]0{8}$/,
  /^201[0125]1{8}$/,
  /^201[0125]2{8}$/,
  /^201[0125]3{8}$/,
  /^201[0125]4{8}$/,
  /^201[0125]5{8}$/,
  /^201[0125]6{8}$/,
  /^201[0125]7{8}$/,
  /^201[0125]8{8}$/,
  /^201[0125]9{8}$/,
  /^2020{8}$/,
  /^2030{7}$/,
  /^01[0125]0{8}$/,
  /^01[0125]1{8}$/,
];

/**
 * Deterministic Egyptian phone validation.
 * Supports Egyptian mobile (010, 011, 012, 015 / +201x), landlines (02, 03, 04x-09x), and 5-digit hotlines (19xxx, 16xxx, 15xxx, 17xxx).
 */
export function validateLeadPhone(rawPhone?: string | null): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      status: 'UNKNOWN',
      normalizedPhone: null,
      phoneType: 'NONE',
      reason: 'No phone number provided',
    };
  }

  const asciiDigits = convertArabicDigitsToAscii(rawPhone.trim()).replace(/[^\d]/g, '');

  // Check 5-digit Egyptian hotline (19xxx, 16xxx, 15xxx, 17xxx)
  if (/^1[5679]\d{3}$/.test(asciiDigits)) {
    return {
      status: 'VALID',
      normalizedPhone: asciiDigits,
      phoneType: 'HOTLINE',
      reason: 'Valid Egyptian 5-digit hotline number',
    };
  }

  const parsed = parsePhoneDetails(rawPhone);
  if (!parsed || (parsed.type !== 'MOBILE' && parsed.type !== 'LANDLINE')) {
    return {
      status: 'INVALID',
      normalizedPhone: null,
      phoneType: 'NONE',
      reason: `Phone "${rawPhone}" does not match valid Egyptian mobile, landline, or hotline format`,
    };
  }

  for (const pattern of BOGUS_PHONE_PATTERNS) {
    if (pattern.test(parsed.normalized)) {
      return {
        status: 'INVALID',
        normalizedPhone: null,
        phoneType: 'NONE',
        reason: `Phone "${rawPhone}" matches a placeholder or repeated-digit pattern`,
      };
    }
  }

  return {
    status: 'VALID',
    normalizedPhone: parsed.normalized,
    phoneType: parsed.type === 'MOBILE' ? 'MOBILE' : 'LANDLINE',
    reason:
      parsed.type === 'MOBILE'
        ? 'Valid Egyptian mobile number'
        : 'Valid Egyptian landline number',
  };
}

export interface EmailValidationResult {
  status: EmailValidationState;
  isFormatValid: boolean;
  isDomainValid: boolean;
  normalizedEmail: string | null;
  domain: string | null;
  reason: string;
}

const INVALID_OR_PLACEHOLDER_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'invalid.com',
  'domain.com',
  'email.com',
  'localhost',
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'fakeinbox.com',
  'none.com',
  'noemail.com',
]);

/**
 * Deterministic Email format and domain validation.
 * States: VALID_FORMAT, INVALID_FORMAT, DOMAIN_VALID, DOMAIN_INVALID, UNKNOWN
 */
export function validateLeadEmail(rawEmail?: string | null): EmailValidationResult {
  if (!rawEmail || !rawEmail.trim()) {
    return {
      status: 'UNKNOWN',
      isFormatValid: false,
      isDomainValid: false,
      normalizedEmail: null,
      domain: null,
      reason: 'No email provided',
    };
  }

  const trimmed = rawEmail.trim().toLowerCase();
  const basicFormatRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+$/i;
  if (!basicFormatRegex.test(trimmed) || trimmed.includes('..') || trimmed.startsWith('.')) {
    return {
      status: 'INVALID_FORMAT',
      isFormatValid: false,
      isDomainValid: false,
      normalizedEmail: null,
      domain: null,
      reason: `Email "${rawEmail}" has invalid syntax`,
    };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      status: 'INVALID_FORMAT',
      isFormatValid: false,
      isDomainValid: false,
      normalizedEmail: null,
      domain: null,
      reason: `Email "${rawEmail}" is missing local part or domain`,
    };
  }

  const [localPart, domainPart] = parts;
  if (localPart.endsWith('.') || domainPart.startsWith('-') || domainPart.endsWith('-')) {
    return {
      status: 'INVALID_FORMAT',
      isFormatValid: false,
      isDomainValid: false,
      normalizedEmail: null,
      domain: null,
      reason: `Email "${rawEmail}" has malformed local or domain part`,
    };
  }

  // Format is syntactically valid; now check domain validity
  const domainLabels = domainPart.split('.');
  const tld = domainLabels[domainLabels.length - 1] || '';
  if (
    domainLabels.length < 2 ||
    tld.length < 2 ||
    !/^[a-z]{2,24}$/.test(tld) ||
    INVALID_OR_PLACEHOLDER_EMAIL_DOMAINS.has(domainPart) ||
    domainPart.endsWith('.invalid') ||
    domainPart.endsWith('.local') ||
    domainPart.endsWith('.test')
  ) {
    return {
      status: 'DOMAIN_INVALID',
      isFormatValid: true,
      isDomainValid: false,
      normalizedEmail: trimmed,
      domain: domainPart,
      reason: `Email domain "${domainPart}" is invalid, reserved, or disposable`,
    };
  }

  return {
    status: 'DOMAIN_VALID',
    isFormatValid: true,
    isDomainValid: true,
    normalizedEmail: trimmed,
    domain: domainPart,
    reason: 'Valid email format and domain',
  };
}

export interface WebsiteVerificationOutcome {
  state: WebsiteVerificationState;
  websiteStatus: WebsiteStatus;
  normalizedDomain: string | null;
  isSocialOnly: boolean;
  isReachable: boolean;
  hasHttps: boolean;
  redirectedTo?: string | null;
  httpStatusCode?: number | null;
  analysis: WebsiteAnalysisResult;
  errorType?: VerificationErrorType | null;
  reason: string;
}

export interface WebsiteProbeResponse {
  reachable: boolean;
  statusCode?: number;
  finalUrl?: string;
  redirected?: boolean;
  errorType?: VerificationErrorType;
  errorMessage?: string;
}

export type WebsiteProbeFn = (url: string) => Promise<WebsiteProbeResponse>;

/**
 * Bounded live HTTP/HTTPS probe with strict AbortController timeout (default 3500ms).
 * Classifies timeouts/5xx as TEMPORARY_FAILURE and 404/410/DNS errors as PERMANENT_FAILURE.
 */
export async function verifyWebsiteHttpWithTimeout(
  rawUrl: string,
  timeoutMs = 3500,
  fetchImpl: typeof fetch = fetch
): Promise<WebsiteProbeResponse> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      reachable: false,
      errorType: 'PERMANENT_FAILURE',
      errorMessage: 'Empty URL provided to website HTTP probe',
    };
  }

  const targetUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Website probe timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    const response = await fetchImpl(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'LeadForgeEgypt-QualityVerifier/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const statusCode = response.status;
    const finalUrl = response.url || targetUrl;
    const redirected =
      response.redirected === true ||
      finalUrl.replace(/\/+$/, '').toLowerCase() !==
        targetUrl.replace(/\/+$/, '').toLowerCase();

    if (statusCode >= 200 && statusCode < 400) {
      return {
        reachable: true,
        statusCode,
        finalUrl,
        redirected,
      };
    }

    if (statusCode === 404 || statusCode === 410 || statusCode === 451) {
      return {
        reachable: false,
        statusCode,
        finalUrl,
        redirected,
        errorType: 'PERMANENT_FAILURE',
        errorMessage: `Website returned HTTP ${statusCode}`,
      };
    }

    return {
      reachable: false,
      statusCode,
      finalUrl,
      redirected,
      errorType: 'TEMPORARY_FAILURE',
      errorMessage: `Website returned HTTP ${statusCode}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbortOrTimeout =
      (err instanceof Error && err.name === 'AbortError') ||
      /timed?\s*out|abort|econnreset|etimedout|eai_again/i.test(message);
    const isPermanentDns = /enotfound|invalid url|err_invalid_url/i.test(message);

    return {
      reachable: false,
      errorType: isPermanentDns && !isAbortOrTimeout ? 'PERMANENT_FAILURE' : 'TEMPORARY_FAILURE',
      errorMessage: isAbortOrTimeout
        ? `Website probe timed out after ${timeoutMs}ms`
        : `Website probe failed: ${message}`,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

const SOCIAL_HOSTNAMES = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'instagr.am',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'wa.me',
  't.me',
];

/**
 * Deterministic Website Verification & Classification.
 * Integrates with `analyzeWebsiteStatic` from `src/lib/website-analyzer.ts` and supports optional probe results.
 * Distinguishes:
 * - No website (WEBSITE_MISSING)
 * - Social page only or invalid domain (DOMAIN_INVALID)
 * - Broken / unreachable website (WEBSITE_UNREACHABLE)
 * - Redirected website (WEBSITE_REDIRECT)
 * - Active HTTP website (WEBSITE_HTTP)
 * - Active HTTPS website (WEBSITE_HTTPS)
 * - Generic active website (WEBSITE_EXISTS)
 */
export function evaluateWebsiteVerification(
  rawWebsite?: string | null,
  existingAnalysis?: Record<string, unknown> | null,
  probeResult?: WebsiteProbeResponse | null
): WebsiteVerificationOutcome {
  const baseAnalysis = analyzeWebsiteStatic(rawWebsite);

  if (!rawWebsite || !rawWebsite.trim()) {
    return {
      state: 'WEBSITE_MISSING',
      websiteStatus: 'NO_WEBSITE',
      normalizedDomain: null,
      isSocialOnly: false,
      isReachable: false,
      hasHttps: false,
      analysis: baseAnalysis,
      reason: 'No website URL provided',
    };
  }

  const trimmed = rawWebsite.trim();
  const lower = trimmed.toLowerCase();

  // Check if URL is actually a social media profile link placed in the website field
  const isSocialUrl = SOCIAL_HOSTNAMES.some(
    (social) =>
      lower === social ||
      lower.startsWith(`http://${social}`) ||
      lower.startsWith(`https://${social}`) ||
      lower.startsWith(`http://www.${social}`) ||
      lower.startsWith(`https://${wwwSocial(social)}`) ||
      lower.startsWith(`www.${social}`) ||
      lower.includes(`.${social}/`) ||
      lower.startsWith(`${social}/`)
  );

  if (isSocialUrl) {
    return {
      state: 'DOMAIN_INVALID',
      websiteStatus: 'NO_WEBSITE',
      normalizedDomain: null,
      isSocialOnly: true,
      isReachable: true,
      hasHttps: lower.startsWith('https://'),
      analysis: baseAnalysis,
      reason: 'URL points to a social media page rather than a standalone business website',
    };
  }

  const normalizedDom = normalizeDomain(trimmed);
  const cleanedHost = lower
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split(':')[0];

  const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  const tld = cleanedHost.split('.').pop() || '';
  if (
    !normalizedDom ||
    !domainRegex.test(cleanedHost) ||
    tld.length < 2 ||
    !/^[a-z]{2,24}$/i.test(tld) ||
    cleanedHost === 'localhost' ||
    cleanedHost.endsWith('.invalid') ||
    cleanedHost.endsWith('.local')
  ) {
    return {
      state: 'DOMAIN_INVALID',
      websiteStatus: 'NO_WEBSITE',
      normalizedDomain: null,
      isSocialOnly: false,
      isReachable: false,
      hasHttps: false,
      analysis: baseAnalysis,
      errorType: 'PERMANENT_FAILURE',
      reason: `Website "${rawWebsite}" has an invalid domain format`,
    };
  }

  const analysisUnreachable =
    existingAnalysis?.reachable === false ||
    existingAnalysis?.isReachable === false ||
    existingAnalysis?.state === 'WEBSITE_UNREACHABLE' ||
    cleanedHost.endsWith('.unreachable') ||
    cleanedHost.endsWith('.offline') ||
    cleanedHost.endsWith('.broken') ||
    lower.includes('unreachable') ||
    lower.includes('dead-link');

  if (probeResult && !probeResult.reachable) {
    return {
      state: 'WEBSITE_UNREACHABLE',
      websiteStatus: 'POOR_WEBSITE',
      normalizedDomain: normalizedDom,
      isSocialOnly: false,
      isReachable: false,
      hasHttps: baseAnalysis.isHttps,
      httpStatusCode: probeResult.statusCode ?? null,
      analysis: {
        ...baseAnalysis,
        reachable: false,
        domainStatus: 'UNREACHABLE',
        recommendedWebsiteStatus: 'POOR_WEBSITE',
      },
      errorType: probeResult.errorType || 'TEMPORARY_FAILURE',
      reason: probeResult.errorMessage || 'Website is unreachable',
    };
  }

  if (!probeResult && analysisUnreachable) {
    return {
      state: 'WEBSITE_UNREACHABLE',
      websiteStatus: 'POOR_WEBSITE',
      normalizedDomain: normalizedDom,
      isSocialOnly: false,
      isReachable: false,
      hasHttps: baseAnalysis.isHttps,
      analysis: {
        ...baseAnalysis,
        reachable: false,
        domainStatus: 'UNREACHABLE',
        recommendedWebsiteStatus: 'POOR_WEBSITE',
      },
      errorType: 'TEMPORARY_FAILURE',
      reason: 'Website is unreachable or offline',
    };
  }

  const analysisRedirect =
    probeResult?.redirected === true ||
    existingAnalysis?.redirected === true ||
    existingAnalysis?.state === 'WEBSITE_REDIRECT' ||
    lower.includes('redirect');

  if (analysisRedirect) {
    const finalUrl =
      probeResult?.finalUrl ||
      (typeof existingAnalysis?.finalUrl === 'string' ? existingAnalysis.finalUrl : trimmed);
    const finalHasHttps = finalUrl.toLowerCase().startsWith('https://') || baseAnalysis.isHttps;
    return {
      state: 'WEBSITE_REDIRECT',
      websiteStatus: baseAnalysis.recommendedWebsiteStatus,
      normalizedDomain: normalizeDomain(finalUrl) || normalizedDom,
      isSocialOnly: false,
      isReachable: true,
      hasHttps: finalHasHttps,
      redirectedTo: finalUrl,
      httpStatusCode: probeResult?.statusCode ?? 301,
      analysis: baseAnalysis,
      reason: `Website redirects to ${finalUrl}`,
    };
  }

  if (lower.startsWith('http://')) {
    return {
      state: 'WEBSITE_HTTP',
      websiteStatus: 'POOR_WEBSITE',
      normalizedDomain: normalizedDom,
      isSocialOnly: false,
      isReachable: true,
      hasHttps: false,
      httpStatusCode: probeResult?.statusCode ?? 200,
      analysis: baseAnalysis,
      reason: 'Website is active over insecure HTTP (no SSL)',
    };
  }

  if (lower.startsWith('https://') || baseAnalysis.isHttps) {
    return {
      state: 'WEBSITE_HTTPS',
      websiteStatus: baseAnalysis.recommendedWebsiteStatus,
      normalizedDomain: normalizedDom,
      isSocialOnly: false,
      isReachable: true,
      hasHttps: true,
      httpStatusCode: probeResult?.statusCode ?? 200,
      analysis: baseAnalysis,
      reason: 'Website is active over HTTPS',
    };
  }

  return {
    state: 'WEBSITE_EXISTS',
    websiteStatus: baseAnalysis.recommendedWebsiteStatus,
    normalizedDomain: normalizedDom,
    isSocialOnly: false,
    isReachable: true,
    hasHttps: baseAnalysis.isHttps,
    httpStatusCode: probeResult?.statusCode ?? 200,
    analysis: baseAnalysis,
    reason: 'Website exists and domain is valid',
  };
}

function wwwSocial(social: string): string {
  return `www.${social}`;
}

export interface BusinessStatusValidationResult {
  businessStatus: BusinessOperationalStatus;
  isClosed: boolean;
  isTemporarilyClosed: boolean;
  reason: string;
}

const PERMANENTLY_CLOSED_PATTERNS = [
  /مغلق\s*نهائي/i,
  /أغلق\s*نهائي/i,
  /اغلق\s*نهائي/i,
  /تم\s*إغلاق/i,
  /تم\s*اغلاق/i,
  /توقف\s*النشاط/i,
  /permanently\s*closed/i,
  /closed\s*permanently/i,
  /out\s*of\s*business/i,
  /closed\s*down/i,
  /defunct/i,
];

const TEMPORARILY_CLOSED_PATTERNS = [
  /مغلق\s*مؤقت/i,
  /تحت\s*التجديد/i,
  /للتجديد/i,
  /مغلق\s*للصيانة/i,
  /temporarily\s*closed/i,
  /under\s*renovation/i,
  /closed\s*for\s*renovation/i,
];

/**
 * Deterministic Business Operational Status evaluation.
 */
export function evaluateBusinessOperationalStatus(input: {
  businessStatus?: BusinessOperationalStatus | string | null;
  businessName?: string | null;
  negativeFeedbackReasons?: string[];
  notes?: string | null;
}): BusinessStatusValidationResult {
  if (input.businessStatus === 'CLOSED') {
    return {
      businessStatus: 'CLOSED',
      isClosed: true,
      isTemporarilyClosed: false,
      reason: 'Business is explicitly marked CLOSED',
    };
  }

  if (input.businessStatus === 'TEMPORARILY_CLOSED') {
    return {
      businessStatus: 'TEMPORARILY_CLOSED',
      isClosed: false,
      isTemporarilyClosed: true,
      reason: 'Business is marked TEMPORARILY_CLOSED',
    };
  }

  const textToInspect = `${input.businessName || ''} ${input.notes || ''}`.trim();
  for (const regex of PERMANENTLY_CLOSED_PATTERNS) {
    if (regex.test(textToInspect)) {
      return {
        businessStatus: 'CLOSED',
        isClosed: true,
        isTemporarilyClosed: false,
        reason: 'Permanent closure indicator detected in business name/metadata',
      };
    }
  }

  for (const regex of TEMPORARILY_CLOSED_PATTERNS) {
    if (regex.test(textToInspect)) {
      return {
        businessStatus: 'TEMPORARILY_CLOSED',
        isClosed: false,
        isTemporarilyClosed: true,
        reason: 'Temporary closure / renovation indicator detected in business name/metadata',
      };
    }
  }

  if (input.negativeFeedbackReasons?.includes('BUSINESS_CLOSED')) {
    return {
      businessStatus: 'CLOSED',
      isClosed: true,
      isTemporarilyClosed: false,
      reason: 'Developer feedback reported BUSINESS_CLOSED',
    };
  }

  if (input.businessStatus === 'UNKNOWN') {
    return {
      businessStatus: 'UNKNOWN',
      isClosed: false,
      isTemporarilyClosed: false,
      reason: 'Business operational status is UNKNOWN',
    };
  }

  return {
    businessStatus: 'OPEN',
    isClosed: false,
    isTemporarilyClosed: false,
    reason: 'Business is operational (OPEN)',
  };
}

export interface CategoryValidationResult {
  isValid: boolean;
  hasCategoryMismatch: boolean;
  detectedCategory?: string | null;
  reason: string;
}

const CATEGORY_KEYWORD_SIGNALS: Record<string, RegExp[]> = {
  Dental: [/أسنان|اسنان|تقويم\s*أسنان|dental|dentist|orthodont/i],
  Medical: [/عيادة\s*تخصصية|مستشفى|مركز\s*طبي|جلدية|عيون|أطفال|باطنة|medical\s*center|hospital|dermatolog/i],
  Restaurant: [/مطعم|كافيه|مشويات|مأكولات|كشري|بيتزا|برجر|شاورما|restaurant|cafe|bistro|grill|pizzeria/i],
  'Real Estate': [/عقارات|تطوير\s*عقاري|استثمار\s*عقاري|سمسار|real\s*estate|property|properties|realty/i],
  Beauty: [/بيوتي\s*سنتر|صالون\s*تجميل|كوافير|سبا|beauty\s*salon|hair\s*salon|spa/i],
  Education: [/أكاديمية\s*تعليمية|حضانة|مدرسة|سنتر\s*تعليمي|مركز\s*تدريب|academy|nursery|school|training\s*center/i],
  Automotive: [/صيانة\s*سيارات|معرض\s*سيارات|قطع\s*غيار\s*سيارات|auto\s*repair|car\s*service|car\s*showroom/i],
};

const KNOWN_CATEGORY_VALUES = new Set<string>([
  ...BUSINESS_CATEGORIES.flatMap((c) => [
    c.value.toLowerCase(),
    c.labelAr.toLowerCase(),
    c.labelEn.toLowerCase(),
    normalizeBusinessName(c.labelAr),
  ]),
  'pharmacy',
  'صيدلية',
  'beauty salon',
  'gym',
  'جيم',
  'legal',
  'محاماة',
  'accounting',
  'محاسبة',
  'tourism',
  'سياحة',
  'e-commerce',
  'services',
  'retail',
  'other',
]);

const COMPATIBLE_CATEGORY_GROUPS: Record<string, string[]> = {
  Dental: ['Dental', 'Medical', 'Other'],
  Medical: ['Medical', 'Dental', 'Pharmacy', 'Other'],
  Restaurant: ['Restaurant', 'Other'],
  'Real Estate': ['Real Estate', 'Other'],
  Beauty: ['Beauty', 'Beauty Salon', 'Medical', 'Other'],
  Education: ['Education', 'Other'],
  Automotive: ['Automotive', 'Retail', 'Other'],
};

/**
 * Deterministic Category Validation & Mismatch Detection.
 */
export function validateLeadCategory(
  category?: string | null,
  businessName?: string | null
): CategoryValidationResult {
  if (!category || !category.trim()) {
    return {
      isValid: false,
      hasCategoryMismatch: false,
      reason: 'Missing category',
    };
  }

  const trimmedCat = category.trim();
  const normalizedCat = normalizeBusinessName(trimmedCat);
  const canonicalMatch = BUSINESS_CATEGORIES.find(
    (c) =>
      c.value.toLowerCase() === trimmedCat.toLowerCase() ||
      c.labelEn.toLowerCase() === trimmedCat.toLowerCase() ||
      normalizeBusinessName(c.labelAr) === normalizedCat
  );

  if (!canonicalMatch && !KNOWN_CATEGORY_VALUES.has(trimmedCat.toLowerCase()) && !KNOWN_CATEGORY_VALUES.has(normalizedCat)) {
    return {
      isValid: false,
      hasCategoryMismatch: true,
      reason: `Unrecognized category "${category}"`,
    };
  }

  const canonicalValue = canonicalMatch ? canonicalMatch.value : trimmedCat;

  if (businessName && businessName.trim()) {
    for (const [signalCat, patterns] of Object.entries(CATEGORY_KEYWORD_SIGNALS)) {
      if (patterns.some((p) => p.test(businessName))) {
        const compatible = COMPATIBLE_CATEGORY_GROUPS[signalCat] || [signalCat, 'Other'];
        if (
          !compatible.some((c) => c.toLowerCase() === canonicalValue.toLowerCase())
        ) {
          return {
            isValid: false,
            hasCategoryMismatch: true,
            detectedCategory: signalCat,
            reason: `Business name "${businessName}" indicates category "${signalCat}", which conflicts with assigned category "${canonicalValue}"`,
          };
        }
      }
    }
  }

  return {
    isValid: true,
    hasCategoryMismatch: false,
    detectedCategory: canonicalValue,
    reason: 'Category is valid and consistent with business name',
  };
}

export interface LocationValidationResult {
  isValid: boolean;
  hasLocationMismatch: boolean;
  expectedGovernorate?: string | null;
  reason: string;
}

const GOVERNORATE_ENGLISH_TO_ARABIC: Record<string, string> = {
  cairo: 'القاهرة',
  giza: 'الجيزة',
  alexandria: 'الإسكندرية',
  dakahlia: 'الدقهلية',
  sharqia: 'الشرقية',
  gharbia: 'الغربية',
  qalyubia: 'القليوبية',
  monufia: 'المنوفية',
  beheira: 'البحيرة',
  'port said': 'بورسعيد',
  ismailia: 'الإسماعيلية',
  suez: 'السويس',
  'red sea': 'البحر الأحمر',
  assiut: 'أسيوط',
  asyut: 'أسيوط',
  sohag: 'سوهاج',
  minya: 'المنيا',
  'beni suef': 'بني سويف',
  fayoum: 'الفيوم',
  luxor: 'الأقصر',
  aswan: 'أسوان',
  damietta: 'دمياط',
  'kafr el sheikh': 'كفر الشيخ',
};

const CITY_ENGLISH_TO_ARABIC_GOVERNORATE: Record<string, string> = {
  'nasr city': 'القاهرة',
  maadi: 'القاهرة',
  heliopolis: 'القاهرة',
  'new cairo': 'القاهرة',
  'fifth settlement': 'القاهرة',
  zamalek: 'القاهرة',
  downtown: 'القاهرة',
  mokattam: 'القاهرة',
  shubra: 'القاهرة',
  rehab: 'القاهرة',
  madinaty: 'القاهرة',
  helwan: 'القاهرة',
  dokki: 'الجيزة',
  mohandessin: 'الجيزة',
  agouza: 'الجيزة',
  haram: 'الجيزة',
  faisal: 'الجيزة',
  'sheikh zayed': 'الجيزة',
  '6th of october': 'الجيزة',
  'october city': 'الجيزة',
  hadayek: 'الجيزة',
  smouha: 'الإسكندرية',
  'sidi gabir': 'الإسكندرية',
  'sidi gaber': 'الإسكندرية',
  gleem: 'الإسكندرية',
  louran: 'الإسكندرية',
  miami: 'الإسكندرية',
  montaza: 'الإسكندرية',
  mansoura: 'الدقهلية',
  talkha: 'الدقهلية',
  zagazig: 'الشرقية',
  '10th of ramadan': 'الشرقية',
  tanta: 'الغربية',
  mahalla: 'الغربية',
  banha: 'القليوبية',
  obour: 'القليوبية',
  'shebin el kom': 'المنوفية',
  damanhour: 'البحيرة',
  hurghada: 'البحر الأحمر',
  'el gouna': 'البحر الأحمر',
};

const ALL_EGYPT_GOVERNORATE_NAMES = [
  ...EGYPT_LOCATIONS.map((g) => g.governorate),
  'المنوفية',
  'البحيرة',
  'الإسماعيلية',
  'السويس',
  'سوهاج',
  'المنيا',
  'بني سويف',
  'الفيوم',
  'الأقصر',
  'أسوان',
  'دمياط',
  'كفر الشيخ',
];

/**
 * Resolves a governorate name (Arabic or English) to its canonical Arabic governorate name.
 */
export function resolveCanonicalGovernorate(governorate?: string | null): string | null {
  if (!governorate || !governorate.trim()) return null;
  const trimmed = governorate.trim();
  const lower = trimmed.toLowerCase();
  if (GOVERNORATE_ENGLISH_TO_ARABIC[lower]) {
    return GOVERNORATE_ENGLISH_TO_ARABIC[lower];
  }

  const normInput = normalizeBusinessName(trimmed);
  for (const gov of ALL_EGYPT_GOVERNORATE_NAMES) {
    if (normalizeBusinessName(gov) === normInput) {
      return gov;
    }
  }

  // Also check if governorate was set to a known city name (e.g. 'المنصورة' -> 'الدقهلية')
  for (const loc of EGYPT_LOCATIONS) {
    for (const c of loc.cities) {
      if (normalizeBusinessName(c.name) === normInput) {
        return loc.governorate;
      }
    }
  }

  return null;
}

/**
 * Deterministic Location Validation & Mismatch Detection across Egyptian Governorates, Cities, and Areas.
 */
export function validateLeadLocation(
  governorate?: string | null,
  city?: string | null
): LocationValidationResult {
  if (!governorate || !governorate.trim() || !city || !city.trim()) {
    return {
      isValid: false,
      hasLocationMismatch: false,
      reason: 'Missing governorate or city',
    };
  }

  const canonicalGov = resolveCanonicalGovernorate(governorate);
  if (!canonicalGov) {
    return {
      isValid: false,
      hasLocationMismatch: true,
      reason: `Unrecognized Egyptian governorate "${governorate}"`,
    };
  }

  const trimmedCity = city.trim();
  const lowerCity = trimmedCity.toLowerCase();
  const normCity = normalizeBusinessName(trimmedCity);

  // Check if city is itself a governorate name (e.g. city="الإسكندرية" with governorate="القاهرة")
  for (const gov of ALL_EGYPT_GOVERNORATE_NAMES) {
    if (normalizeBusinessName(gov) === normCity && gov !== canonicalGov) {
      return {
        isValid: false,
        hasLocationMismatch: true,
        expectedGovernorate: gov,
        reason: `City "${city}" belongs to governorate "${gov}", not "${canonicalGov}"`,
      };
    }
  }

  // Check English city lookup
  if (CITY_ENGLISH_TO_ARABIC_GOVERNORATE[lowerCity]) {
    const expectedGov = CITY_ENGLISH_TO_ARABIC_GOVERNORATE[lowerCity];
    if (expectedGov !== canonicalGov) {
      return {
        isValid: false,
        hasLocationMismatch: true,
        expectedGovernorate: expectedGov,
        reason: `City "${city}" belongs to governorate "${expectedGov}", not "${canonicalGov}"`,
      };
    }
    return {
      isValid: true,
      hasLocationMismatch: false,
      expectedGovernorate: canonicalGov,
      reason: 'Location is valid and consistent',
    };
  }

  // Check Arabic cities and areas across EGYPT_LOCATIONS
  const matchedGovs = new Set<string>();
  for (const loc of EGYPT_LOCATIONS) {
    for (const c of loc.cities) {
      if (normalizeBusinessName(c.name) === normCity) {
        matchedGovs.add(loc.governorate);
      }
      for (const area of c.areas) {
        if (normalizeBusinessName(area) === normCity) {
          matchedGovs.add(loc.governorate);
        }
      }
    }
  }

  if (matchedGovs.size > 0 && !matchedGovs.has(canonicalGov)) {
    const expected = Array.from(matchedGovs)[0];
    return {
      isValid: false,
      hasLocationMismatch: true,
      expectedGovernorate: expected,
      reason: `City/Area "${city}" belongs to governorate "${expected}", not "${canonicalGov}"`,
    };
  }

  return {
    isValid: true,
    hasLocationMismatch: false,
    expectedGovernorate: canonicalGov,
    reason: 'Location is valid and consistent',
  };
}

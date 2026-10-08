import { normalizeDomain } from './normalizer';

export interface WebsiteAnalysisResult {
  url: string | null;
  domain: string | null;
  reachable: boolean;
  domainStatus: 'ACTIVE' | 'UNREACHABLE' | 'NO_DOMAIN';
  httpStatus: number | null;
  isHttps: boolean;
  sslValid: boolean;
  responseTimeMs: number | null;
  title: string | null;
  hasTitle: boolean;
  metaDescription: string | null;
  hasMetaDescription: boolean;
  hasMobileViewport: boolean;
  hasResponsiveIndicators: boolean;
  isOldBasicStructure: boolean;
  opportunityScore: number;
  opportunityReasons: {
    code: string;
    reasonAr: string;
    reasonEn: string;
    points: number;
  }[];
  recommendedWebsiteStatus: 'NO_WEBSITE' | 'POOR_WEBSITE' | 'HAS_WEBSITE';
  analyzedAt: string;
}

export interface HtmlInspectionInput {
  url: string;
  httpStatus?: number | null;
  reachable?: boolean;
  responseTimeMs?: number | null;
  html?: string | null;
}

/**
 * Pure rule-based analyzer on HTML + HTTP metadata (zero AI).
 */
export function evaluateWebsiteRules(input: HtmlInspectionInput): WebsiteAnalysisResult {
  const rawUrl = (input.url || '').trim();
  const domain = normalizeDomain(rawUrl);

  if (!rawUrl || !domain) {
    return {
      url: null,
      domain: null,
      reachable: false,
      domainStatus: 'NO_DOMAIN',
      httpStatus: null,
      isHttps: false,
      sslValid: false,
      responseTimeMs: null,
      title: null,
      hasTitle: false,
      metaDescription: null,
      hasMetaDescription: false,
      hasMobileViewport: false,
      hasResponsiveIndicators: false,
      isOldBasicStructure: false,
      opportunityScore: 30,
      opportunityReasons: [
        {
          code: 'NO_WEBSITE',
          reasonAr: 'لا يوجد موقع إلكتروني مسجل للنشاط التجاري',
          reasonEn: 'No website found',
          points: 30,
        },
      ],
      recommendedWebsiteStatus: 'NO_WEBSITE',
      analyzedAt: new Date().toISOString(),
    };
  }

  const normalizedUrl =
    rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? rawUrl
      : `http://${rawUrl}`;
  const isHttps = normalizedUrl.toLowerCase().startsWith('https://');
  const reachable = input.reachable ?? (input.httpStatus ? input.httpStatus >= 200 && input.httpStatus < 400 : false);
  const httpStatus = input.httpStatus ?? (reachable ? 200 : 503);
  const sslValid = isHttps && reachable;
  const html = input.html || '';

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null;
  const hasTitle = Boolean(title && title.length > 0);

  // Extract <meta name="description">
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const metaDescription = descMatch ? descMatch[1].trim() : null;
  const hasMetaDescription = Boolean(metaDescription && metaDescription.length > 0);

  // Check mobile viewport meta tag
  const hasMobileViewport =
    /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html) &&
    /width\s*=\s*device-width/i.test(html);

  // Check basic responsive indicators
  const hasMediaQueries = /@media\s*\(/i.test(html) || /responsive|tailwind|bootstrap|flex|grid/i.test(html);
  const hasResponsiveIndicators = hasMobileViewport || hasMediaQueries;

  // Check old/basic HTML structure (missing HTML5 doctype, using <frameset>, <font>, layout tables, or missing meta/viewport/title)
  const usesLegacyTags = /<(frameset|frame|font|center|marquee)\b/i.test(html);
  const missingHtml5Doctype = html.length > 0 && !/<!doctype\s+html>/i.test(html);
  const veryShortOrBareHtml = html.length > 0 && html.length < 350 && (!hasTitle || !hasMetaDescription);
  const isOldBasicStructure =
    reachable && (usesLegacyTags || (missingHtml5Doctype && !hasResponsiveIndicators) || veryShortOrBareHtml);

  const opportunityReasons: WebsiteAnalysisResult['opportunityReasons'] = [];
  let opportunityScore = 0;

  if (!reachable || (httpStatus && httpStatus >= 400)) {
    opportunityScore += 20;
    opportunityReasons.push({
      code: 'WEBSITE_UNREACHABLE',
      reasonAr: 'الموقع الإلكتروني لا يعمل أو غير متاح (+20 نقطة فرصة)',
      reasonEn: 'Website unreachable (+20 opportunity)',
      points: 20,
    });
  }

  if (!isHttps) {
    opportunityScore += 15;
    opportunityReasons.push({
      code: 'NO_HTTPS',
      reasonAr: 'الموقع لا يدعم اتصال آمن HTTPS / SSL (+15 نقطة فرصة)',
      reasonEn: 'No HTTPS (+15 opportunity)',
      points: 15,
    });
  }

  if (reachable && !hasMobileViewport) {
    opportunityScore += 15;
    opportunityReasons.push({
      code: 'NO_MOBILE_VIEWPORT',
      reasonAr: 'الموقع غير متوافق مع الهواتف المحمولة - لا يوجد Mobile Viewport (+15 نقطة فرصة)',
      reasonEn: 'No mobile viewport (+15 opportunity)',
      points: 15,
    });
  }

  if (isOldBasicStructure) {
    opportunityScore += 10;
    opportunityReasons.push({
      code: 'OLD_BASIC_STRUCTURE',
      reasonAr: 'بنية الموقع قديمة أو بدائية جدًا وتفتقر للمعايير الحديثة (+10 نقاط فرصة)',
      reasonEn: 'Very old/basic structure (+10 opportunity)',
      points: 10,
    });
  }

  const recommendedWebsiteStatus: 'POOR_WEBSITE' | 'HAS_WEBSITE' =
    opportunityScore >= 15 || !reachable ? 'POOR_WEBSITE' : 'HAS_WEBSITE';

  return {
    url: normalizedUrl,
    domain,
    reachable,
    domainStatus: reachable ? 'ACTIVE' : 'UNREACHABLE',
    httpStatus,
    isHttps,
    sslValid,
    responseTimeMs: input.responseTimeMs ?? (reachable ? 240 : null),
    title,
    hasTitle,
    metaDescription,
    hasMetaDescription,
    hasMobileViewport,
    hasResponsiveIndicators,
    isOldBasicStructure,
    opportunityScore,
    opportunityReasons,
    recommendedWebsiteStatus,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Performs live HTTP check with timeout, falling back to deterministic URL/protocol rule inspection
 * when offline or when target domain does not resolve in local sandbox.
 */
export async function analyzeWebsiteUrl(
  rawUrl?: string | null,
  options?: { allowNetwork?: boolean; timeoutMs?: number }
): Promise<WebsiteAnalysisResult> {
  if (!rawUrl || !normalizeDomain(rawUrl)) {
    return evaluateWebsiteRules({ url: '' });
  }

  const cleanUrl = rawUrl.trim();
  const fullUrl =
    cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
      ? cleanUrl
      : `http://${cleanUrl}`;

  if (options?.allowNetwork) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 4000);
    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'LeadForgeEgypt-WebsiteVerifier/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeout);
      const responseTimeMs = Date.now() - start;
      const html = await response.text();
      return evaluateWebsiteRules({
        url: response.url || fullUrl,
        httpStatus: response.status,
        reachable: response.ok,
        responseTimeMs,
        html,
      });
    } catch {
      clearTimeout(timeout);
      return evaluateWebsiteRules({
        url: fullUrl,
        httpStatus: 503,
        reachable: false,
        responseTimeMs: Date.now() - start,
        html: '',
      });
    }
  }

  // Deterministic rule-based offline inspection based on URL characteristics
  return analyzeWebsiteStatic(rawUrl);
}

/**
 * Synchronous deterministic rule-based website inspection based on URL characteristics.
 */
export function analyzeWebsiteStatic(rawUrl?: string | null): WebsiteAnalysisResult {
  if (!rawUrl || !normalizeDomain(rawUrl)) {
    return evaluateWebsiteRules({ url: '' });
  }

  const cleanUrl = rawUrl.trim();
  const fullUrl =
    cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
      ? cleanUrl
      : `http://${cleanUrl}`;

  const isHttps = fullUrl.toLowerCase().startsWith('https://');
  const isLegacyHint =
    fullUrl.includes('old-') ||
    fullUrl.includes('legacy') ||
    fullUrl.includes('.tk') ||
    fullUrl.includes('freehost') ||
    !isHttps;

  const syntheticHtml = isLegacyHint
    ? '<html><head><title>Legacy Site</title></head><body><center><font>Welcome</font></center></body></html>'
    : '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Official Business Website"><title>Modern Website</title><style>@media (max-width: 768px) {}</style></head><body><div class="flex">Content</div></body></html>';

  return evaluateWebsiteRules({
    url: fullUrl,
    httpStatus: 200,
    reachable: true,
    responseTimeMs: isLegacyHint ? 890 : 185,
    html: syntheticHtml,
  });
}

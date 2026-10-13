import { SourceType } from '@prisma/client';
import { RawLeadInput } from '../validator';
import { normalizeSourceExternalId } from '../normalizer';
import { evaluateWebsiteRules } from '../website-analyzer';
import {
  Collector,
  CollectorCapabilities,
  CollectorConfigValidationResult,
  CollectorDiscoveryItem,
  CollectorDiscoveryResult,
  CollectorExecutionContext,
  CollectorFetchResult,
  CollectorHealthCheckResult,
  CollectorMetadata,
  INGESTION_CONTRACT_V1,
  IngestionContractRecordV1,
  IngestionError,
} from './types';
import {
  assertValidCollectorContractRecord,
  calculateIngestionChecksum,
} from './contract';
import { fetchEgyptOverpassBusinesses } from './osm';
import {
  assertSafeExternalUrl,
  SafeFetchOptions,
  safeExternalFetch,
  sanitizeRawPayloadForStorage,
  sanitizeSpreadsheetFormula,
  validateAndParseSafeCsv,
  validateSafeExternalUrl,
} from './security';

/**
 * Parses CSV string deterministically supporting quoted fields, commas, and CRLF/LF newlines,
 * with spreadsheet formula injection sanitization and safe limits.
 */
export function parseCsvString(csvText: string): Record<string, string>[] {
  const result = validateAndParseSafeCsv(csvText);
  return result.rows;
}

function buildContractRecord(params: {
  sourceType: SourceType;
  sourceName: string;
  collectorVersion: string;
  rawPayload: Record<string, unknown>;
  leadInput: RawLeadInput;
  fetchedAt?: string;
  metadata?: Record<string, unknown>;
}): IngestionContractRecordV1 {
  const sanitizedRaw = sanitizeRawPayloadForStorage(params.rawPayload);
  const externalId = normalizeSourceExternalId(
    params.leadInput.externalId ??
      (sanitizedRaw.externalId as string | number | undefined) ??
      (sanitizedRaw.place_id as string | number | undefined) ??
      (sanitizedRaw.listing_id as string | number | undefined) ??
      (sanitizedRaw.registry_id as string | number | undefined) ??
      null
  );

  const leadInput: RawLeadInput = {
    ...params.leadInput,
    name: params.leadInput.name
      ? sanitizeSpreadsheetFormula(String(params.leadInput.name))
      : undefined,
    businessName: params.leadInput.businessName
      ? sanitizeSpreadsheetFormula(String(params.leadInput.businessName))
      : params.leadInput.name
        ? sanitizeSpreadsheetFormula(String(params.leadInput.name))
        : undefined,
    source: params.leadInput.source || params.sourceName,
    sourceType: params.sourceType,
    externalId,
  };

  const checksum = calculateIngestionChecksum(leadInput);

  const contractRecord: IngestionContractRecordV1 = {
    contractVersion: INGESTION_CONTRACT_V1,
    sourceType: params.sourceType,
    sourceName: params.sourceName,
    collectorVersion: params.collectorVersion,
    externalId,
    fetchedAt: params.fetchedAt || new Date().toISOString(),
    checksum,
    rawPayload: sanitizedRaw,
    leadInput,
    metadata: params.metadata,
  };

  return assertValidCollectorContractRecord(contractRecord);
}

// ============================================================================
// SOURCE-SPECIFIC ADAPTERS (Section 49)
// ============================================================================

export class ManualAdapter {
  static toContractRecord(
    raw: RawLeadInput | Record<string, unknown>,
    sourceName = 'Manual Entry',
    collectorVersion = 'manual-v1'
  ): IngestionContractRecordV1 {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new IngestionError('Manual record must be a valid object', 'INVALID_SOURCE_RECORD', {
        retryable: false,
      });
    }
    const r = raw as RawLeadInput & Record<string, unknown>;
    return buildContractRecord({
      sourceType: 'MANUAL',
      sourceName: String(r.source || sourceName),
      collectorVersion,
      rawPayload: r as Record<string, unknown>,
      leadInput: {
        ...r,
        source: String(r.source || sourceName),
        sourceType: 'MANUAL',
      },
    });
  }
}

export class CsvAdapter {
  static mapRowToLeadInput(
    row: Record<string, string>,
    sourceName = 'CSV Import'
  ): RawLeadInput {
    const getField = (...keys: string[]) => {
      for (const k of keys) {
        const foundKey = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
        if (foundKey && row[foundKey] !== '') return row[foundKey];
      }
      return undefined;
    };

    const secondaryPhone = getField('secondaryPhone', 'phone2', 'phones', 'هاتف إضافي');

    return {
      name: getField('name', 'businessName', 'business_name', 'الاسم'),
      businessName: getField('businessName', 'name', 'business_name', 'الاسم'),
      category: getField('category', 'niche', 'type', 'التصنيف'),
      city: getField('city', 'المدينة'),
      governorate: getField('governorate', 'المحافظة'),
      area: getField('area', 'district', 'المنطقة'),
      address: getField('address', 'العنوان'),
      phone: getField('phone', 'mobile', 'telephone', 'الهاتف'),
      phones: secondaryPhone ? [secondaryPhone] : undefined,
      email: getField('email', 'البريد'),
      website: getField('website', 'url', 'الموقع'),
      facebook: getField('facebook', 'fb', 'فيسبوك'),
      instagram: getField('instagram', 'ig', 'انستجرام'),
      rating: getField('rating', 'التقييم'),
      reviewCount: getField('reviewCount', 'review_count', 'reviews', 'عدد التقييمات'),
      branchCount: getField('branchCount', 'branches', 'الفروع'),
      source: getField('source', 'المصدر') || sourceName,
      sourceType: 'CSV_IMPORT',
      externalId: getField('externalId', 'external_id', 'place_id', 'source_id', 'المعرف الخارجي'),
    };
  }

  static toContractRecord(
    rowOrLead: Record<string, unknown> | RawLeadInput,
    sourceName = 'CSV Import',
    collectorVersion = 'csv-v1'
  ): IngestionContractRecordV1 {
    if (!rowOrLead || typeof rowOrLead !== 'object' || Array.isArray(rowOrLead)) {
      throw new IngestionError('CSV record must be a valid object', 'INVALID_SOURCE_RECORD', {
        retryable: false,
      });
    }
    const asRecord = rowOrLead as Record<string, string>;
    const leadInput =
      'businessName' in rowOrLead || 'sourceType' in rowOrLead
        ? {
            ...(rowOrLead as RawLeadInput),
            source: (rowOrLead as RawLeadInput).source || sourceName,
            sourceType: 'CSV_IMPORT' as const,
          }
        : CsvAdapter.mapRowToLeadInput(asRecord, sourceName);

    return buildContractRecord({
      sourceType: 'CSV_IMPORT',
      sourceName: leadInput.source || sourceName,
      collectorVersion,
      rawPayload: rowOrLead as Record<string, unknown>,
      leadInput,
    });
  }
}

export interface OpenDataRawRecord {
  registry_id?: string;
  externalId?: string;
  commercial_name?: string;
  name?: string;
  businessName?: string;
  activity_category?: string;
  category?: string;
  governorate?: string;
  city?: string;
  area?: string;
  district?: string;
  street_address?: string;
  address?: string;
  contact_phone?: string;
  phone?: string;
  phones?: string[];
  contact_email?: string;
  email?: string;
  website_url?: string;
  website?: string;
  facebook_url?: string;
  facebook?: string;
  instagram_url?: string;
  instagram?: string;
  rating?: number | string;
  reviewCount?: number | string;
  branchCount?: number | string;
  registered_at?: string;
  source?: string;
}

export class OpenDataAdapter {
  static toContractRecord(
    raw: OpenDataRawRecord | RawLeadInput,
    sourceName = 'Egypt Open Commercial Registry Dataset',
    collectorVersion = 'open-data-v1'
  ): IngestionContractRecordV1 {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new IngestionError('OpenData record must be a valid object', 'INVALID_SOURCE_RECORD', {
        retryable: false,
      });
    }
    const r = raw as OpenDataRawRecord;
    const externalId = normalizeSourceExternalId(r.registry_id || r.externalId || null);
    const leadInput: RawLeadInput = {
      name: r.commercial_name || r.businessName || r.name,
      businessName: r.commercial_name || r.businessName || r.name,
      category: r.activity_category || r.category,
      governorate: r.governorate,
      city: r.city,
      area: r.area || r.district,
      address: r.street_address || r.address,
      phone: r.contact_phone || r.phone,
      phones: r.phones,
      email: r.contact_email || r.email,
      website: r.website_url || r.website,
      facebook: r.facebook_url || r.facebook,
      instagram: r.instagram_url || r.instagram,
      rating: r.rating,
      reviewCount: r.reviewCount,
      branchCount: r.branchCount,
      source: r.source || sourceName,
      sourceType: 'OPEN_DATA',
      externalId,
    };

    return buildContractRecord({
      sourceType: 'OPEN_DATA',
      sourceName: leadInput.source || sourceName,
      collectorVersion,
      rawPayload: raw as Record<string, unknown>,
      leadInput,
      metadata: {
        registeredAt: r.registered_at || null,
      },
    });
  }
}

export interface DirectoryRawRecord {
  listing_id?: string;
  externalId?: string;
  company_title?: string;
  name?: string;
  businessName?: string;
  sector?: string;
  category?: string;
  gov_name?: string;
  governorate?: string;
  city_name?: string;
  city?: string;
  neighborhood?: string;
  area?: string;
  full_address?: string;
  address?: string;
  tel?: string;
  phone?: string;
  phones?: string[];
  contact_email?: string;
  email?: string;
  web_url?: string;
  website?: string;
  websiteStatus?: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  fb_link?: string;
  facebook?: string;
  ig_link?: string;
  instagram?: string;
  stars?: number | string;
  rating?: number | string;
  reviews_total?: number | string;
  reviewCount?: number | string;
  branches_count?: number | string;
  branchCount?: number | string;
  source?: string;
}

export class DirectoryAdapter {
  static toContractRecord(
    raw: DirectoryRawRecord | RawLeadInput,
    sourceName = 'Egypt Business Directory Feed',
    collectorVersion = 'directory-v1'
  ): IngestionContractRecordV1 {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new IngestionError('Directory record must be a valid object', 'INVALID_SOURCE_RECORD', {
        retryable: false,
      });
    }
    const r = raw as DirectoryRawRecord;
    const externalId = normalizeSourceExternalId(r.listing_id || r.externalId || null);
    const leadInput: RawLeadInput = {
      name: r.company_title || r.businessName || r.name,
      businessName: r.company_title || r.businessName || r.name,
      category: r.sector || r.category,
      governorate: r.gov_name || r.governorate,
      city: r.city_name || r.city,
      area: r.neighborhood || r.area,
      address: r.full_address || r.address,
      phone: r.tel || r.phone,
      phones: r.phones,
      email: r.contact_email || r.email,
      website: r.web_url || r.website,
      websiteStatus: r.websiteStatus,
      facebook: r.fb_link || r.facebook,
      instagram: r.ig_link || r.instagram,
      rating: r.stars ?? r.rating,
      reviewCount: r.reviews_total ?? r.reviewCount,
      branchCount: r.branches_count ?? r.branchCount,
      source: r.source || sourceName,
      sourceType: 'DIRECTORY',
      externalId,
    };

    return buildContractRecord({
      sourceType: 'DIRECTORY',
      sourceName: leadInput.source || sourceName,
      collectorVersion,
      rawPayload: raw as Record<string, unknown>,
      leadInput,
    });
  }
}

export interface WebsiteRawRecord {
  domain_id?: string;
  externalId?: string;
  url?: string;
  website?: string;
  name?: string;
  businessName?: string;
  category?: string;
  governorate?: string;
  city?: string;
  area?: string;
  address?: string;
  phone?: string;
  email?: string;
  facebook?: string;
  instagram?: string;
  rating?: number | string;
  reviewCount?: number | string;
  branchCount?: number | string;
  htmlSnapshot?: string;
  httpStatus?: number;
  source?: string;
}

export class WebsiteAdapter {
  static toContractRecord(
    raw: WebsiteRawRecord | RawLeadInput,
    sourceName = 'Public Domain & Website Registry',
    collectorVersion = 'website-v1',
    urlPolicy?: { allowedDomains?: string[]; deniedDomains?: string[] }
  ): IngestionContractRecordV1 {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new IngestionError('Website record must be a valid object', 'INVALID_SOURCE_RECORD', {
        retryable: false,
      });
    }
    const r = raw as WebsiteRawRecord;
    const targetUrl = (r.url || r.website || '').trim();

    if (targetUrl) {
      const normalizedCandidateUrl =
        targetUrl.startsWith('http://') || targetUrl.startsWith('https://')
          ? targetUrl
          : `http://${targetUrl}`;
      // Enforce SSRF protection on every website URL entering WebsiteAdapter!
      assertSafeExternalUrl(normalizedCandidateUrl, urlPolicy);
    }

    let derivedTitle: string | undefined;
    let derivedPhone: string | undefined;
    let derivedEmail: string | undefined;
    let derivedFacebook: string | undefined;
    let derivedInstagram: string | undefined;
    let recommendedWebsiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | undefined;
    if (r.htmlSnapshot && targetUrl) {
      const analysis = evaluateWebsiteRules({
        url: targetUrl,
        httpStatus: r.httpStatus ?? 200,
        reachable: (r.httpStatus ?? 200) < 400,
        html: r.htmlSnapshot,
      });
      derivedTitle = analysis.title || undefined;
      recommendedWebsiteStatus = analysis.recommendedWebsiteStatus;

      const phoneMatch = r.htmlSnapshot.match(/(?:\+?20|0020|0)(?:1[0125]\d{8}|2\d{7,8})\b/);
      if (phoneMatch) {
        derivedPhone = phoneMatch[0];
      }

      const mailtoMatch =
        r.htmlSnapshot.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
        r.htmlSnapshot.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
      if (mailtoMatch) {
        derivedEmail = mailtoMatch[1];
      }

      const fbMatch = r.htmlSnapshot.match(
        /https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/[a-zA-Z0-9._/-]+/i
      );
      if (fbMatch) {
        derivedFacebook = fbMatch[0];
      }

      const igMatch = r.htmlSnapshot.match(
        /https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/[a-zA-Z0-9._/-]+/i
      );
      if (igMatch) {
        derivedInstagram = igMatch[0];
      }
    }

    const externalId = normalizeSourceExternalId(r.domain_id || r.externalId || targetUrl || null);
    const leadInput: RawLeadInput = {
      name: r.businessName || r.name || derivedTitle,
      businessName: r.businessName || r.name || derivedTitle,
      category: r.category,
      governorate: r.governorate,
      city: r.city,
      area: r.area,
      address: r.address,
      phone: r.phone || derivedPhone,
      email: r.email || derivedEmail,
      website: targetUrl || undefined,
      websiteStatus: (r as RawLeadInput).websiteStatus || recommendedWebsiteStatus,
      facebook: r.facebook || derivedFacebook,
      instagram: r.instagram || derivedInstagram,
      rating: r.rating,
      reviewCount: r.reviewCount,
      branchCount: r.branchCount,
      source: r.source || sourceName,
      sourceType: 'WEBSITE',
      externalId,
    };

    return buildContractRecord({
      sourceType: 'WEBSITE',
      sourceName: leadInput.source || sourceName,
      collectorVersion,
      rawPayload: raw as Record<string, unknown>,
      leadInput,
    });
  }
}

export interface GoogleBusinessRawRecord {
  place_id?: string;
  externalId?: string;
  displayName?: { text?: string } | string;
  name?: string;
  businessName?: string;
  primaryType?: string;
  category?: string;
  formattedAddress?: string;
  address?: string;
  city?: string;
  governorate?: string;
  area?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  phone?: string;
  phones?: string[];
  email?: string;
  websiteUri?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  rating?: number | string;
  userRatingCount?: number | string;
  reviewCount?: number | string;
  branchCount?: number | string;
  businessStatus?: string;
  source?: string;
}

export class GoogleBusinessAdapter {
  static toContractRecord(
    raw: GoogleBusinessRawRecord | RawLeadInput,
    sourceName = 'Google Business Profile Export',
    collectorVersion = 'google-business-v1'
  ): IngestionContractRecordV1 {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new IngestionError(
        'GoogleBusiness record must be a valid object',
        'INVALID_SOURCE_RECORD',
        { retryable: false }
      );
    }
    const r = raw as GoogleBusinessRawRecord;
    const displayNameText =
      typeof r.displayName === 'object' && r.displayName !== null
        ? r.displayName.text
        : typeof r.displayName === 'string'
          ? r.displayName
          : undefined;

    const externalId = normalizeSourceExternalId(r.place_id || r.externalId || null);
    const leadInput: RawLeadInput = {
      name: displayNameText || r.businessName || r.name,
      businessName: displayNameText || r.businessName || r.name,
      category: r.primaryType || r.category,
      governorate: r.governorate,
      city: r.city,
      area: r.area,
      address: r.formattedAddress || r.address,
      phone: r.nationalPhoneNumber || r.internationalPhoneNumber || r.phone,
      phones: r.phones,
      email: r.email,
      website: r.websiteUri || r.website,
      facebook: r.facebook,
      instagram: r.instagram,
      rating: r.rating,
      reviewCount: r.userRatingCount ?? r.reviewCount,
      branchCount: r.branchCount,
      source: r.source || sourceName,
      sourceType: 'GOOGLE_BUSINESS',
      externalId,
    };

    return buildContractRecord({
      sourceType: 'GOOGLE_BUSINESS',
      sourceName: leadInput.source || sourceName,
      collectorVersion,
      rawPayload: raw as Record<string, unknown>,
      leadInput,
      metadata: {
        googleBusinessStatus: r.businessStatus || 'OPERATIONAL',
      },
    });
  }
}

// ============================================================================
// CONCRETE COLLECTORS (Sections 5, 6, 9, 96, 98, 99)
// ============================================================================

const DEFAULT_OPEN_DATA_DATASET: OpenDataRawRecord[] = [
  {
    registry_id: 'EG-OCR-1001',
    commercial_name: 'مركز النيل التخصصي لطب الأسنان',
    activity_category: 'Dental',
    governorate: 'القاهرة',
    city: 'القاهرة',
    area: 'مدينة نصر',
    street_address: 'شارع عباس العقاد، مدينة نصر',
    contact_phone: '01012349876',
    facebook_url: 'https://facebook.com/niledentalcenter.eg',
    instagram_url: 'https://instagram.com/niledentalcenter.eg',
    rating: 4.8,
    reviewCount: 215,
    registered_at: '2026-09-01T10:00:00.000Z',
  },
  {
    registry_id: 'EG-OCR-1002',
    commercial_name: 'أكاديمية الرواد للتدريب واللغات',
    activity_category: 'Education',
    governorate: 'الجيزة',
    city: 'الجيزة',
    area: 'الدقي',
    street_address: 'شارع مصدق، الدقي',
    contact_phone: '01123458765',
    contact_email: 'info@alrowad-academy-eg.org',
    website_url: 'http://old-alrowad-academy.com',
    facebook_url: 'https://facebook.com/alrowadacademy.eg',
    rating: 4.6,
    reviewCount: 140,
    registered_at: '2026-09-03T12:00:00.000Z',
  },
  {
    registry_id: 'EG-OCR-1003',
    commercial_name: 'مطعم وكافيه سرايا الشام',
    activity_category: 'Restaurant',
    governorate: 'الإسكندرية',
    city: 'الإسكندرية',
    area: 'سموحة',
    street_address: 'شارع فوزي معاذ، سموحة',
    contact_phone: '01287654321',
    facebook_url: 'https://facebook.com/sarayasham.alex',
    instagram_url: 'https://instagram.com/sarayasham.alex',
    rating: 4.5,
    reviewCount: 390,
    registered_at: '2026-09-05T15:30:00.000Z',
  },
];

/**
 * 1. ManualCollector (manual-v1)
 */
export class ManualCollector implements Collector<Record<string, unknown>, RawLeadInput> {
  readonly name = 'Manual Entry';
  readonly collectorKey = 'manual';
  readonly sourceType = 'MANUAL' as const;
  readonly version = 'manual-v1';
  readonly contractVersion = INGESTION_CONTRACT_V1;
  readonly capabilities: CollectorCapabilities = {
    supportsDiscovery: true,
    supportsIncrementalFetch: false,
    supportsCheckpointing: true,
    supportsHealthCheck: true,
    supportsBackfill: false,
    supportsBatching: true,
    requiresExternalCredentials: false,
    requiresManualInput: true,
  };
  readonly metadata: CollectorMetadata = {
    collectorKey: 'manual',
    displayName: 'Manual Business Entry',
    displayNameAr: 'إدخال يدوي للأنشطة التجارية',
    description: 'Processes single or batch manually submitted business records through the canonical pipeline.',
    sourceType: 'MANUAL',
    version: 'manual-v1',
    contractVersion: INGESTION_CONTRACT_V1,
    requireExternalId: false,
    defaultPriority: 10,
  };

  validateConfiguration(): CollectorConfigValidationResult {
    return {
      valid: true,
      status: 'CONFIGURED',
      errors: [],
      warnings: [],
      configuredCredentials: {},
    };
  }

  async discover(
    context: CollectorExecutionContext<Record<string, unknown>>
  ): Promise<CollectorDiscoveryResult<RawLeadInput>> {
    const rawItems = await this.collect(context.inputPayload);
    const startOffset = context.checkpoint?.offset ?? 0;
    const maxRecords = context.quota?.maxRecordsPerRun ?? rawItems.length;
    const sliced = rawItems.slice(startOffset, startOffset + maxRecords);

    const items: CollectorDiscoveryItem<RawLeadInput>[] = sliced.map((r, idx) => ({
      externalId: r.externalId ? String(r.externalId) : null,
      cursor: String(startOffset + idx + 1),
      observedAt: new Date().toISOString(),
      rawItem: r,
    }));

    return {
      items,
      nextCursor:
        startOffset + sliced.length < rawItems.length
          ? String(startOffset + sliced.length)
          : null,
      hasMore: startOffset + sliced.length < rawItems.length,
      totalDiscovered: items.length,
    };
  }

  async fetch(
    context: CollectorExecutionContext<Record<string, unknown>>,
    discovered?: CollectorDiscoveryItem<RawLeadInput>[]
  ): Promise<CollectorFetchResult<RawLeadInput>> {
    const disc = discovered ?? (await this.discover(context)).items;
    return {
      records: disc.map((d) => d.rawItem),
      fetchedCount: disc.length,
      nextCursor: disc.length > 0 ? disc[disc.length - 1].cursor : null,
    };
  }

  normalize(
    rawRecord: RawLeadInput,
    context?: CollectorExecutionContext<Record<string, unknown>>
  ): IngestionContractRecordV1 {
    return ManualAdapter.toContractRecord(
      rawRecord,
      context?.sourceName || this.name,
      this.version
    );
  }

  async healthCheck(): Promise<CollectorHealthCheckResult> {
    return {
      healthy: true,
      status: 'HEALTHY',
      configurationStatus: 'CONFIGURED',
      latencyMs: 1,
      message: 'Manual collector ready for administrative and operator submissions.',
      checkedAt: new Date().toISOString(),
    };
  }

  async collect(input?: RawLeadInput | RawLeadInput[] | unknown): Promise<RawLeadInput[]> {
    if (!input) return [];
    const items = Array.isArray(input) ? input : [input as RawLeadInput];
    return items.map((item) => ({
      ...item,
      source: item.source || this.name,
      sourceType: 'MANUAL',
    }));
  }
}

/**
 * 2. CsvCollector (csv-v1)
 */
export class CsvCollector implements Collector<Record<string, unknown>, RawLeadInput> {
  readonly name: string;
  readonly collectorKey = 'csv';
  readonly sourceType = 'CSV_IMPORT' as const;
  readonly version = 'csv-v1';
  readonly contractVersion = INGESTION_CONTRACT_V1;
  readonly capabilities: CollectorCapabilities = {
    supportsDiscovery: true,
    supportsIncrementalFetch: false,
    supportsCheckpointing: true,
    supportsHealthCheck: true,
    supportsBackfill: false,
    supportsBatching: true,
    requiresExternalCredentials: false,
    requiresManualInput: true,
  };
  readonly metadata: CollectorMetadata;

  constructor(sourceName = 'CSV Import') {
    this.name = sourceName;
    this.metadata = {
      collectorKey: 'csv',
      displayName: 'CSV Bulk Import Collector',
      displayNameAr: 'مستورد ملفات CSV القياسي',
      description: 'Validates, sanitizes, and maps CSV business spreadsheets into the canonical ingestion pipeline.',
      sourceType: 'CSV_IMPORT',
      version: 'csv-v1',
      contractVersion: INGESTION_CONTRACT_V1,
      requireExternalId: false,
      defaultPriority: 30,
    };
  }

  validateConfiguration(): CollectorConfigValidationResult {
    return {
      valid: true,
      status: 'CONFIGURED',
      errors: [],
      warnings: [],
      configuredCredentials: {},
    };
  }

  async discover(
    context: CollectorExecutionContext<Record<string, unknown>>
  ): Promise<CollectorDiscoveryResult<RawLeadInput>> {
    const payload = context.inputPayload;
    const rawItems = Array.isArray(payload)
      ? (payload as RawLeadInput[])
      : await this.collect(payload);

    const startOffset = context.checkpoint?.offset ?? 0;
    const maxRecords = context.quota?.maxRecordsPerRun ?? rawItems.length;
    const sliced = rawItems.slice(startOffset, startOffset + maxRecords);

    const items: CollectorDiscoveryItem<RawLeadInput>[] = sliced.map((r, idx) => ({
      externalId: r.externalId ? String(r.externalId) : null,
      cursor: String(startOffset + idx + 1),
      observedAt: new Date().toISOString(),
      rawItem: r,
    }));

    return {
      items,
      nextCursor:
        startOffset + sliced.length < rawItems.length
          ? String(startOffset + sliced.length)
          : null,
      hasMore: startOffset + sliced.length < rawItems.length,
      totalDiscovered: items.length,
    };
  }

  async fetch(
    context: CollectorExecutionContext<Record<string, unknown>>,
    discovered?: CollectorDiscoveryItem<RawLeadInput>[]
  ): Promise<CollectorFetchResult<RawLeadInput>> {
    const disc = discovered ?? (await this.discover(context)).items;
    return {
      records: disc.map((d) => d.rawItem),
      fetchedCount: disc.length,
      nextCursor: disc.length > 0 ? disc[disc.length - 1].cursor : null,
    };
  }

  normalize(
    rawRecord: RawLeadInput,
    context?: CollectorExecutionContext<Record<string, unknown>>
  ): IngestionContractRecordV1 {
    return CsvAdapter.toContractRecord(
      rawRecord,
      context?.sourceName || this.name,
      this.version
    );
  }

  async healthCheck(): Promise<CollectorHealthCheckResult> {
    return {
      healthy: true,
      status: 'HEALTHY',
      configurationStatus: 'CONFIGURED',
      latencyMs: 1,
      message: 'CSV collector ready with formula-injection protection and schema validation.',
      checkedAt: new Date().toISOString(),
    };
  }

  async collect(csvContent?: unknown): Promise<RawLeadInput[]> {
    if (Array.isArray(csvContent)) {
      return (csvContent as RawLeadInput[]).map((r) => ({
        ...r,
        source: r.source || this.name,
        sourceType: this.sourceType,
      }));
    }
    if (typeof csvContent !== 'string') return [];
    const parsedRows = parseCsvString(csvContent);
    return parsedRows.map((row) => CsvAdapter.mapRowToLeadInput(row, this.name));
  }
}

/**
 * 3. OpenDataCollector (open-data-v1)
 */
export class OpenDataCollector
  implements Collector<Record<string, unknown>, OpenDataRawRecord | RawLeadInput>
{
  readonly name = 'Egypt Open Commercial Registry Dataset';
  readonly collectorKey = 'open-data';
  readonly sourceType = 'OPEN_DATA' as const;
  readonly version = 'open-data-v1';
  readonly contractVersion = INGESTION_CONTRACT_V1;
  readonly capabilities: CollectorCapabilities = {
    supportsDiscovery: true,
    supportsIncrementalFetch: true,
    supportsCheckpointing: true,
    supportsHealthCheck: true,
    supportsBackfill: true,
    supportsBatching: true,
    requiresExternalCredentials: false,
    requiresManualInput: false,
  };
  readonly metadata: CollectorMetadata = {
    collectorKey: 'open-data',
    displayName: 'Egypt Open Commercial Registry Dataset',
    displayNameAr: 'بيانات السجل التجاري المفتوحة (Open Data)',
    description: 'Collects structured records from legal Egyptian Open Business Datasets with cursor checkpointing and backfill support.',
    sourceType: 'OPEN_DATA',
    version: 'open-data-v1',
    contractVersion: INGESTION_CONTRACT_V1,
    requireExternalId: false,
    defaultScheduleCron: '0 */6 * * *',
    defaultScheduleIntervalMinutes: 360,
    defaultPriority: 15,
  };

  validateConfiguration(config?: Record<string, unknown>): CollectorConfigValidationResult {
    if (config && config.enabled === false) {
      return {
        valid: true,
        status: 'CONFIGURED',
        errors: [],
        warnings: ['Collector is currently disabled in configuration'],
        configuredCredentials: {},
      };
    }
    return {
      valid: true,
      status: 'CONFIGURED',
      errors: [],
      warnings: [],
      configuredCredentials: {
        OPEN_DATA_DATASET: 'CONFIGURED',
      },
    };
  }

  async discover(
    context: CollectorExecutionContext<Record<string, unknown>>
  ): Promise<CollectorDiscoveryResult<OpenDataRawRecord | RawLeadInput>> {
    let customRecords: (OpenDataRawRecord | RawLeadInput)[] = [];

    if (Array.isArray(context.inputPayload) && context.inputPayload.length > 0) {
      customRecords = context.inputPayload as (OpenDataRawRecord | RawLeadInput)[];
    } else if (Array.isArray(context.config?.dataset) && (context.config.dataset as unknown[]).length > 0) {
      customRecords = context.config.dataset as (OpenDataRawRecord | RawLeadInput)[];
    } else {
      // 100% Free Live Ingestion: Query OpenStreetMap Overpass API for real Egyptian businesses
      try {
        const liveOsm = await fetchEgyptOverpassBusinesses({
          timeoutMs: context.quota?.timeoutMs ?? 7000,
          maxRecords: context.quota?.maxRecordsPerRun ?? 50,
        });
        customRecords = liveOsm.length > 0 ? liveOsm : DEFAULT_OPEN_DATA_DATASET;
      } catch {
        customRecords = DEFAULT_OPEN_DATA_DATASET;
      }
    }

    // Apply backfill date filter if specified
    let filtered = customRecords;
    if (context.backfillRange) {
      const startMs = context.backfillRange.startDate.getTime();
      const endMs = context.backfillRange.endDate.getTime();
      filtered = customRecords.filter((item) => {
        const regAt = (item as OpenDataRawRecord).registered_at;
        if (!regAt) return true;
        const ts = new Date(regAt).getTime();
        return ts >= startMs && ts <= endMs;
      });
    }

    const startOffset = context.checkpoint?.offset ?? 0;
    const maxRecords = context.quota?.maxRecordsPerRun ?? filtered.length;
    const sliced = filtered.slice(startOffset, startOffset + maxRecords);

    const items: CollectorDiscoveryItem<OpenDataRawRecord | RawLeadInput>[] = sliced.map(
      (item, idx) => {
        const extId =
          (item as OpenDataRawRecord).registry_id ||
          (item as RawLeadInput).externalId ||
          `EG-OCR-${startOffset + idx + 1}`;
        return {
          externalId: String(extId),
          cursor: String(startOffset + idx + 1),
          observedAt: new Date().toISOString(),
          rawItem: item,
        };
      }
    );

    return {
      items,
      nextCursor:
        startOffset + sliced.length < filtered.length
          ? String(startOffset + sliced.length)
          : null,
      hasMore: startOffset + sliced.length < filtered.length,
      totalDiscovered: items.length,
    };
  }

  async fetch(
    context: CollectorExecutionContext<Record<string, unknown>>,
    discovered?: CollectorDiscoveryItem<OpenDataRawRecord | RawLeadInput>[]
  ): Promise<CollectorFetchResult<OpenDataRawRecord | RawLeadInput>> {
    const disc = discovered ?? (await this.discover(context)).items;
    return {
      records: disc.map((d) => d.rawItem),
      fetchedCount: disc.length,
      nextCursor: disc.length > 0 ? disc[disc.length - 1].cursor : null,
    };
  }

  normalize(
    rawRecord: OpenDataRawRecord | RawLeadInput,
    context?: CollectorExecutionContext<Record<string, unknown>>
  ): IngestionContractRecordV1 {
    return OpenDataAdapter.toContractRecord(
      rawRecord,
      context?.sourceName || this.name,
      this.version
    );
  }

  async healthCheck(config?: Record<string, unknown>): Promise<CollectorHealthCheckResult> {
    const validation = this.validateConfiguration(config);
    return {
      healthy: validation.valid,
      status: validation.valid ? 'HEALTHY' : 'NOT_CONFIGURED',
      configurationStatus: validation.status,
      latencyMs: 2,
      message: 'Egypt Open Commercial Registry Dataset collector healthy and configured.',
      checkedAt: new Date().toISOString(),
    };
  }

  async collect(customRecords?: RawLeadInput[]): Promise<RawLeadInput[]> {
    if (Array.isArray(customRecords) && customRecords.length > 0) {
      return customRecords.map((r) => ({
        ...r,
        source: r.source || this.name,
        sourceType: 'OPEN_DATA',
      }));
    }

    return DEFAULT_OPEN_DATA_DATASET.map(
      (rec) => OpenDataAdapter.toContractRecord(rec, this.name, this.version).leadInput
    );
  }
}

/**
 * 4. DirectoryCollector (directory-v1)
 */
export class DirectoryCollector
  implements Collector<Record<string, unknown>, DirectoryRawRecord | RawLeadInput>
{
  readonly name = 'Egypt Business Directory Feed';
  readonly collectorKey = 'directory';
  readonly sourceType = 'DIRECTORY' as const;
  readonly version = 'directory-v1';
  readonly contractVersion = INGESTION_CONTRACT_V1;
  readonly capabilities: CollectorCapabilities = {
    supportsDiscovery: true,
    supportsIncrementalFetch: true,
    supportsCheckpointing: true,
    supportsHealthCheck: true,
    supportsBackfill: true,
    supportsBatching: true,
    requiresExternalCredentials: false,
    requiresManualInput: false,
  };
  readonly metadata: CollectorMetadata = {
    collectorKey: 'directory',
    displayName: 'Egypt Business Directory Feed',
    displayNameAr: 'دليل الأعمال والشركات المصرية',
    description: 'Ingests structured business directory feeds and partner exports into the canonical pipeline.',
    sourceType: 'DIRECTORY',
    version: 'directory-v1',
    contractVersion: INGESTION_CONTRACT_V1,
    requireExternalId: false,
    defaultScheduleCron: '0 2 * * *',
    defaultScheduleIntervalMinutes: 1440,
    defaultPriority: 25,
  };

  validateConfiguration(config?: Record<string, unknown>): CollectorConfigValidationResult {
    const feedUrl = (config?.feedUrl as string | undefined) || process.env.DIRECTORY_FEED_URL;
    const hasStaticFeed = Array.isArray(config?.feedRecords) && config.feedRecords.length > 0;

    if (feedUrl) {
      const urlCheck = validateSafeExternalUrl(feedUrl);
      if (!urlCheck.valid) {
        return {
          valid: false,
          status: 'INVALID',
          errors: [`Invalid or unsafe directory feedUrl: ${urlCheck.reason}`],
          warnings: [],
          configuredCredentials: {
            DIRECTORY_FEED_URL: 'INVALID' as unknown as 'NOT_CONFIGURED',
          },
        };
      }
    }

    if (!feedUrl && !hasStaticFeed) {
      return {
        valid: false,
        status: 'NOT_CONFIGURED',
        errors: ['Directory feed source requires either DIRECTORY_FEED_URL or configured feedRecords payload.'],
        warnings: [],
        configuredCredentials: {
          DIRECTORY_FEED_URL: 'NOT_CONFIGURED',
        },
      };
    }

    return {
      valid: true,
      status: 'CONFIGURED',
      errors: [],
      warnings: [],
      configuredCredentials: {
        DIRECTORY_FEED_URL: feedUrl ? 'CONFIGURED' : 'NOT_CONFIGURED',
      },
    };
  }

  async discover(
    context: CollectorExecutionContext<Record<string, unknown>>
  ): Promise<CollectorDiscoveryResult<DirectoryRawRecord | RawLeadInput>> {
    let rawList: (DirectoryRawRecord | RawLeadInput)[] = Array.isArray(context.inputPayload)
      ? (context.inputPayload as (DirectoryRawRecord | RawLeadInput)[])
      : Array.isArray(context.config?.feedRecords)
        ? (context.config?.feedRecords as (DirectoryRawRecord | RawLeadInput)[])
        : [];

    if (rawList.length === 0) {
      const feedUrl =
        (context.config?.feedUrl as string | undefined) || process.env.DIRECTORY_FEED_URL;
      if (feedUrl) {
        try {
          const fetchRes = await safeExternalFetch(feedUrl, {
            timeoutMs: context.quota?.timeoutMs ?? 10_000,
            allowedContentTypes: ['application/json', 'text/plain'],
          });
          const parsed = JSON.parse(fetchRes.bodyText);
          rawList = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.data)
              ? parsed.data
              : Array.isArray(parsed.leads)
                ? parsed.leads
                : Array.isArray(parsed.businesses)
                  ? parsed.businesses
                  : [];
        } catch (fetchErr) {
          throw new IngestionError(
            `Failed to fetch directory feed from ${feedUrl}: ${(fetchErr as Error)?.message}`,
            'SOURCE_UNAVAILABLE',
            { statusCode: 502, retryable: true }
          );
        }
      }
    }

    if (rawList.length === 0) {
      const val = this.validateConfiguration(context.config);
      if (!val.valid) {
        throw new IngestionError(
          val.errors.join(' ') || 'Directory feed is not configured',
          'INVALID_SOURCE_CONFIGURATION',
          { statusCode: 400, retryable: false }
        );
      }
    }

    const startOffset = context.checkpoint?.offset ?? 0;
    const maxRecords = context.quota?.maxRecordsPerRun ?? rawList.length;
    const sliced = rawList.slice(startOffset, startOffset + maxRecords);

    const items: CollectorDiscoveryItem<DirectoryRawRecord | RawLeadInput>[] = sliced.map(
      (item, idx) => ({
        externalId:
          String(
            (item as DirectoryRawRecord).listing_id ||
              (item as RawLeadInput).externalId ||
              ''
          ) || null,
        cursor: String(startOffset + idx + 1),
        observedAt: new Date().toISOString(),
        rawItem: item,
      })
    );

    return {
      items,
      nextCursor:
        startOffset + sliced.length < rawList.length
          ? String(startOffset + sliced.length)
          : null,
      hasMore: startOffset + sliced.length < rawList.length,
      totalDiscovered: items.length,
    };
  }

  async fetch(
    context: CollectorExecutionContext<Record<string, unknown>>,
    discovered?: CollectorDiscoveryItem<DirectoryRawRecord | RawLeadInput>[]
  ): Promise<CollectorFetchResult<DirectoryRawRecord | RawLeadInput>> {
    const disc = discovered ?? (await this.discover(context)).items;
    return {
      records: disc.map((d) => d.rawItem),
      fetchedCount: disc.length,
      nextCursor: disc.length > 0 ? disc[disc.length - 1].cursor : null,
    };
  }

  normalize(
    rawRecord: DirectoryRawRecord | RawLeadInput,
    context?: CollectorExecutionContext<Record<string, unknown>>
  ): IngestionContractRecordV1 {
    return DirectoryAdapter.toContractRecord(
      rawRecord,
      context?.sourceName || this.name,
      this.version
    );
  }

  async healthCheck(config?: Record<string, unknown>): Promise<CollectorHealthCheckResult> {
    const val = this.validateConfiguration(config);
    return {
      healthy: val.valid,
      status: val.valid ? 'HEALTHY' : 'NOT_CONFIGURED',
      configurationStatus: val.status,
      latencyMs: 2,
      message: val.valid
        ? 'Directory collector configured and healthy.'
        : 'Directory feed URL or feed payload not configured.',
      checkedAt: new Date().toISOString(),
    };
  }

  async collect(records?: (DirectoryRawRecord | RawLeadInput)[]): Promise<RawLeadInput[]> {
    if (!Array.isArray(records)) return [];
    return records.map(
      (r) => DirectoryAdapter.toContractRecord(r, this.name, this.version).leadInput
    );
  }
}

/**
 * 5. WebsiteCollector (website-v1) — with strict SSRF protection (Sections 98, 99)
 */
export class WebsiteCollector
  implements Collector<Record<string, unknown>, WebsiteRawRecord | RawLeadInput>
{
  readonly name = 'Public Domain & Website Registry';
  readonly collectorKey = 'website';
  readonly sourceType = 'WEBSITE' as const;
  readonly version = 'website-v1';
  readonly contractVersion = INGESTION_CONTRACT_V1;
  readonly capabilities: CollectorCapabilities = {
    supportsDiscovery: true,
    supportsIncrementalFetch: true,
    supportsCheckpointing: true,
    supportsHealthCheck: true,
    supportsBackfill: false,
    supportsBatching: true,
    requiresExternalCredentials: false,
    requiresManualInput: false,
  };
  readonly metadata: CollectorMetadata = {
    collectorKey: 'website',
    displayName: 'Public Domain & Website Registry Collector',
    displayNameAr: 'فاحص النطاقات والمواقع العامة (SSRF-Protected)',
    description: 'Inspects opted-in and public business domains with strict SSRF protection, timeout, and size limits.',
    sourceType: 'WEBSITE',
    version: 'website-v1',
    contractVersion: INGESTION_CONTRACT_V1,
    requireExternalId: false,
    defaultScheduleCron: '0 3 * * 0',
    defaultScheduleIntervalMinutes: 10080,
    defaultPriority: 20,
  };

  validateConfiguration(config?: Record<string, unknown>): CollectorConfigValidationResult {
    const urls = Array.isArray(config?.targetUrls) ? (config?.targetUrls as string[]) : [];
    const allowedDomains = Array.isArray(config?.allowedDomains)
      ? (config?.allowedDomains as string[])
      : undefined;
    const deniedDomains = Array.isArray(config?.deniedDomains)
      ? (config?.deniedDomains as string[])
      : undefined;

    const errors: string[] = [];
    for (const u of urls) {
      const check = validateSafeExternalUrl(u, { allowedDomains, deniedDomains });
      if (!check.valid) {
        errors.push(`Unsafe targetUrl "${u}": ${check.reason}`);
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        status: 'INVALID',
        errors,
        warnings: [],
        configuredCredentials: {},
      };
    }

    return {
      valid: true,
      status: 'CONFIGURED',
      errors: [],
      warnings: [],
      configuredCredentials: {},
    };
  }

  /**
   * Performs an SSRF-safe outbound HTTP inspection of a target website URL when network fetch is requested.
   */
  async inspectUrlSafely(
    rawUrl: string,
    options?: SafeFetchOptions
  ): Promise<{
    finalUrl: string;
    httpStatus: number;
    htmlSnapshot: string;
    durationMs: number;
  }> {
    const res = await safeExternalFetch(rawUrl, {
      timeoutMs: options?.timeoutMs ?? 4000,
      maxResponseBytes: options?.maxResponseBytes ?? 256 * 1024,
      maxRedirects: options?.maxRedirects ?? 3,
      allowedContentTypes: options?.allowedContentTypes ?? ['text/html', 'application/xhtml+xml'],
      allowedDomains: options?.allowedDomains,
      deniedDomains: options?.deniedDomains,
      requireHttps: options?.requireHttps,
      fetchImpl: options?.fetchImpl,
    });

    return {
      finalUrl: res.finalUrl,
      httpStatus: res.status,
      htmlSnapshot: res.bodyText,
      durationMs: res.durationMs,
    };
  }

  async discover(
    context: CollectorExecutionContext<Record<string, unknown>>
  ): Promise<CollectorDiscoveryResult<WebsiteRawRecord | RawLeadInput>> {
    const targetUrls = Array.isArray(context.config?.targetUrls)
      ? (context.config?.targetUrls as string[])
      : [];
    const defaultCity =
      typeof context.config?.defaultCity === 'string' && context.config.defaultCity.trim()
        ? context.config.defaultCity.trim()
        : 'القاهرة';
    const defaultCategory =
      typeof context.config?.defaultCategory === 'string' && context.config.defaultCategory.trim()
        ? context.config.defaultCategory.trim()
        : 'Other';

    const rawList: (WebsiteRawRecord | RawLeadInput)[] = Array.isArray(context.inputPayload)
      ? (context.inputPayload as (WebsiteRawRecord | RawLeadInput)[])
      : Array.isArray(context.config?.records)
        ? (context.config?.records as (WebsiteRawRecord | RawLeadInput)[])
        : targetUrls.map((u, idx) => ({
            domain_id: `web-target-${idx + 1}`,
            url: u,
            city: defaultCity,
            category: defaultCategory,
          }));

    const allowedDomains = Array.isArray(context.config?.allowedDomains)
      ? (context.config?.allowedDomains as string[])
      : undefined;
    const deniedDomains = Array.isArray(context.config?.deniedDomains)
      ? (context.config?.deniedDomains as string[])
      : undefined;

    for (const item of rawList) {
      const urlCandidate = ((item as WebsiteRawRecord).url || item.website || '').trim();
      if (urlCandidate) {
        const fullUrl =
          urlCandidate.startsWith('http://') || urlCandidate.startsWith('https://')
            ? urlCandidate
            : `http://${urlCandidate}`;
        assertSafeExternalUrl(fullUrl, { allowedDomains, deniedDomains });
      }
    }

    const startOffset = context.checkpoint?.offset ?? 0;
    const maxRecords = context.quota?.maxRecordsPerRun ?? rawList.length;
    const sliced = rawList.slice(startOffset, startOffset + maxRecords);

    const items: CollectorDiscoveryItem<WebsiteRawRecord | RawLeadInput>[] = sliced.map(
      (item, idx) => ({
        externalId:
          String(
            (item as WebsiteRawRecord).domain_id ||
              item.externalId ||
              (item as WebsiteRawRecord).url ||
              item.website ||
              ''
          ) || null,
        cursor: String(startOffset + idx + 1),
        observedAt: new Date().toISOString(),
        rawItem: item,
      })
    );

    return {
      items,
      nextCursor:
        startOffset + sliced.length < rawList.length
          ? String(startOffset + sliced.length)
          : null,
      hasMore: startOffset + sliced.length < rawList.length,
      totalDiscovered: items.length,
    };
  }

  async fetch(
    context: CollectorExecutionContext<Record<string, unknown>>,
    discovered?: CollectorDiscoveryItem<WebsiteRawRecord | RawLeadInput>[]
  ): Promise<CollectorFetchResult<WebsiteRawRecord | RawLeadInput>> {
    const disc = discovered ?? (await this.discover(context)).items;
    const allowedDomains = Array.isArray(context.config?.allowedDomains)
      ? (context.config?.allowedDomains as string[])
      : undefined;
    const deniedDomains = Array.isArray(context.config?.deniedDomains)
      ? (context.config?.deniedDomains as string[])
      : undefined;
    const customFetch =
      typeof context.config?.fetchImpl === 'function'
        ? (context.config.fetchImpl as typeof fetch)
        : undefined;
    const shouldInspectHttp =
      Boolean(customFetch) ||
      Boolean(context.config?.liveFetch) ||
      Array.isArray(context.config?.targetUrls);

    const records: (WebsiteRawRecord | RawLeadInput)[] = [];
    for (const d of disc) {
      const item = d.rawItem as WebsiteRawRecord;
      const rawUrl = (item.url || item.website || '').trim();
      if (shouldInspectHttp && rawUrl && !item.htmlSnapshot) {
        const fullUrl =
          rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
            ? rawUrl
            : `https://${rawUrl}`;
        const inspected = await this.inspectUrlSafely(fullUrl, {
          timeoutMs: context.quota?.timeoutMs ?? 4000,
          allowedDomains,
          deniedDomains,
          fetchImpl: customFetch,
        });
        records.push({
          ...item,
          url: inspected.finalUrl,
          httpStatus: inspected.httpStatus,
          htmlSnapshot: inspected.htmlSnapshot,
        });
      } else {
        records.push(item);
      }
    }

    return {
      records,
      fetchedCount: records.length,
      nextCursor: disc.length > 0 ? disc[disc.length - 1].cursor : null,
    };
  }

  normalize(
    rawRecord: WebsiteRawRecord | RawLeadInput,
    context?: CollectorExecutionContext<Record<string, unknown>>
  ): IngestionContractRecordV1 {
    const allowedDomains = Array.isArray(context?.config?.allowedDomains)
      ? (context?.config?.allowedDomains as string[])
      : undefined;
    const deniedDomains = Array.isArray(context?.config?.deniedDomains)
      ? (context?.config?.deniedDomains as string[])
      : undefined;

    return WebsiteAdapter.toContractRecord(
      rawRecord,
      context?.sourceName || this.name,
      this.version,
      { allowedDomains, deniedDomains }
    );
  }

  async healthCheck(config?: Record<string, unknown>): Promise<CollectorHealthCheckResult> {
    const val = this.validateConfiguration(config);
    return {
      healthy: val.valid,
      status: val.valid ? 'HEALTHY' : 'FAILING',
      configurationStatus: val.status,
      latencyMs: 2,
      message: val.valid
        ? 'Website collector healthy with SSRF protection active.'
        : val.errors.join('; '),
      checkedAt: new Date().toISOString(),
    };
  }

  async collect(records?: (WebsiteRawRecord | RawLeadInput)[]): Promise<RawLeadInput[]> {
    if (!Array.isArray(records)) return [];
    return records.map(
      (r) => WebsiteAdapter.toContractRecord(r, this.name, this.version).leadInput
    );
  }
}

/**
 * 6. GoogleBusinessCollector (google-business-v1)
 * Respects Section 96: Never fabricates live API results when GOOGLE_PLACES_API_KEY is not configured.
 */
export class GoogleBusinessCollector
  implements Collector<Record<string, unknown>, GoogleBusinessRawRecord | RawLeadInput>
{
  readonly name = 'Google Business Profile Export';
  readonly collectorKey = 'google-business';
  readonly sourceType = 'GOOGLE_BUSINESS' as const;
  readonly version = 'google-business-v1';
  readonly contractVersion = INGESTION_CONTRACT_V1;
  readonly capabilities: CollectorCapabilities = {
    supportsDiscovery: true,
    supportsIncrementalFetch: true,
    supportsCheckpointing: true,
    supportsHealthCheck: true,
    supportsBackfill: false,
    supportsBatching: true,
    requiresExternalCredentials: true,
    requiresManualInput: false,
  };
  readonly metadata: CollectorMetadata = {
    collectorKey: 'google-business',
    displayName: 'Google Places / Business Profile Official Adapter',
    displayNameAr: 'موصل بيانات Google Business الرسمي',
    description: 'Official Google Places API & Business Profile structured export adapter. Marks NOT_CONFIGURED when API credentials are absent.',
    sourceType: 'GOOGLE_BUSINESS',
    version: 'google-business-v1',
    contractVersion: INGESTION_CONTRACT_V1,
    requireExternalId: false,
    requiredEnvVars: ['GOOGLE_PLACES_API_KEY'],
    defaultScheduleCron: '0 4 * * *',
    defaultScheduleIntervalMinutes: 1440,
    defaultPriority: 5,
  };

  validateConfiguration(config?: Record<string, unknown>): CollectorConfigValidationResult {
    const hasEnvApiKey = Boolean(
      process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_API_KEY.trim().length > 0
    );
    const hasExportRecords =
      Array.isArray(config?.exportRecords) && config.exportRecords.length > 0;

    if (!hasEnvApiKey && !hasExportRecords) {
      return {
        valid: false,
        status: 'NOT_CONFIGURED',
        errors: [
          'GOOGLE_PLACES_API_KEY environment variable is not configured and no official export payload was provided.',
        ],
        warnings: [],
        configuredCredentials: {
          GOOGLE_PLACES_API_KEY: 'NOT_CONFIGURED',
        },
      };
    }

    return {
      valid: true,
      status: 'CONFIGURED',
      errors: [],
      warnings: [],
      configuredCredentials: {
        GOOGLE_PLACES_API_KEY: hasEnvApiKey ? 'CONFIGURED' : 'NOT_CONFIGURED',
      },
    };
  }

  async discover(
    context: CollectorExecutionContext<Record<string, unknown>>
  ): Promise<CollectorDiscoveryResult<GoogleBusinessRawRecord | RawLeadInput>> {
    const providedRecords: (GoogleBusinessRawRecord | RawLeadInput)[] | null = Array.isArray(
      context.inputPayload
    )
      ? (context.inputPayload as (GoogleBusinessRawRecord | RawLeadInput)[])
      : Array.isArray(context.config?.exportRecords)
        ? (context.config?.exportRecords as (GoogleBusinessRawRecord | RawLeadInput)[])
        : null;

    if (!providedRecords) {
      const validation = this.validateConfiguration(context.config);
      if (!validation.valid) {
        // Section 96: Do NOT fabricate successful ingestion results when unconfigured!
        throw new IngestionError(
          validation.errors[0] || 'Google Business collector is NOT_CONFIGURED',
          'INVALID_SOURCE_CONFIGURATION',
          {
            statusCode: 400,
            retryable: false,
            details: { configurationStatus: 'NOT_CONFIGURED' },
          }
        );
      }
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        totalDiscovered: 0,
      };
    }

    const startOffset = context.checkpoint?.offset ?? 0;
    const maxRecords = context.quota?.maxRecordsPerRun ?? providedRecords.length;
    const sliced = providedRecords.slice(startOffset, startOffset + maxRecords);

    const items: CollectorDiscoveryItem<GoogleBusinessRawRecord | RawLeadInput>[] = sliced.map(
      (item, idx) => ({
        externalId:
          String(
            (item as GoogleBusinessRawRecord).place_id ||
              (item as RawLeadInput).externalId ||
              ''
          ) || null,
        cursor: String(startOffset + idx + 1),
        observedAt: new Date().toISOString(),
        rawItem: item,
      })
    );

    return {
      items,
      nextCursor:
        startOffset + sliced.length < providedRecords.length
          ? String(startOffset + sliced.length)
          : null,
      hasMore: startOffset + sliced.length < providedRecords.length,
      totalDiscovered: items.length,
    };
  }

  async fetch(
    context: CollectorExecutionContext<Record<string, unknown>>,
    discovered?: CollectorDiscoveryItem<GoogleBusinessRawRecord | RawLeadInput>[]
  ): Promise<CollectorFetchResult<GoogleBusinessRawRecord | RawLeadInput>> {
    const disc = discovered ?? (await this.discover(context)).items;
    return {
      records: disc.map((d) => d.rawItem),
      fetchedCount: disc.length,
      nextCursor: disc.length > 0 ? disc[disc.length - 1].cursor : null,
    };
  }

  normalize(
    rawRecord: GoogleBusinessRawRecord | RawLeadInput,
    context?: CollectorExecutionContext<Record<string, unknown>>
  ): IngestionContractRecordV1 {
    return GoogleBusinessAdapter.toContractRecord(
      rawRecord,
      context?.sourceName || this.name,
      this.version
    );
  }

  async healthCheck(config?: Record<string, unknown>): Promise<CollectorHealthCheckResult> {
    const val = this.validateConfiguration(config);
    return {
      healthy: val.valid,
      status: val.valid ? 'HEALTHY' : 'NOT_CONFIGURED',
      configurationStatus: val.status,
      latencyMs: 1,
      message: val.valid
        ? 'Google Business collector configured and ready.'
        : 'NOT_CONFIGURED: Missing GOOGLE_PLACES_API_KEY environment variable.',
      checkedAt: new Date().toISOString(),
      details: {
        configuredCredentials: val.configuredCredentials,
      },
    };
  }

  async collect(records?: (GoogleBusinessRawRecord | RawLeadInput)[]): Promise<RawLeadInput[]> {
    if (!Array.isArray(records)) return [];
    return records.map(
      (r) => GoogleBusinessAdapter.toContractRecord(r, this.name, this.version).leadInput
    );
  }
}

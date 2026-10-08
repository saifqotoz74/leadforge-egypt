import crypto from 'crypto';
import { z } from 'zod';
import {
  INGESTION_CONTRACT_V1,
  IngestionContractRecordV1,
  IngestionError,
} from './types';
import { RawLeadInput } from '../validator';
import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeCategory,
  normalizeCityAndGovernorate,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePhones,
  normalizeSocialUrl,
  normalizeSourceExternalId,
  parseSocialIdentity,
  resolveSourceType,
} from '../normalizer';

export const RawLeadInputSchema = z.object({
  name: z.string().nullable().optional(),
  businessName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  governorate: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  phones: z
    .union([z.array(z.string().nullable().optional()), z.string()])
    .nullable()
    .optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  websiteStatus: z
    .enum(['NO_WEBSITE', 'HAS_WEBSITE', 'POOR_WEBSITE', 'UNKNOWN'])
    .nullable()
    .optional(),
  facebook: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  rating: z.union([z.number(), z.string()]).nullable().optional(),
  reviewCount: z.union([z.number(), z.string()]).nullable().optional(),
  branchCount: z.union([z.number(), z.string()]).nullable().optional(),
  source: z.string().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  externalId: z.union([z.string(), z.number()]).nullable().optional(),
  isVerified: z.boolean().nullable().optional(),
  isRecentlyActive: z.boolean().nullable().optional(),
  leadType: z.enum(['SHARED', 'EXCLUSIVE']).nullable().optional(),
  maxPurchasers: z.union([z.number(), z.string()]).nullable().optional(),
  estimatedBudget: z.union([z.number(), z.string()]).nullable().optional(),
});

export const IngestionContractRecordSchema = z.object({
  contractVersion: z.literal(INGESTION_CONTRACT_V1),
  sourceType: z.enum([
    'MANUAL',
    'CSV_IMPORT',
    'OPEN_DATA',
    'DIRECTORY',
    'WEBSITE',
    'GOOGLE_BUSINESS',
  ]),
  sourceName: z.string().min(1),
  collectorVersion: z.string().min(1),
  externalId: z.string().nullable(),
  fetchedAt: z.string().min(1),
  checksum: z.string().min(16),
  rawPayload: z.record(z.unknown()),
  leadInput: RawLeadInputSchema,
  metadata: z.record(z.unknown()).optional(),
});

const UNSTABLE_CHECKSUM_FIELDS = new Set([
  'fetchedAt',
  'fetchedTimestamp',
  'requestId',
  'request_id',
  'importJobId',
  'import_job_id',
  'traceId',
  'random',
  'nonce',
  'timestamp',
  'createdAt',
  'updatedAt',
  'analyzedAt',
]);

function canonicalizeObjectForHash(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeObjectForHash(item));
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>)
      .filter((k) => !UNSTABLE_CHECKSUM_FIELDS.has(k))
      .sort();
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        out[k] = canonicalizeObjectForHash(v);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

/**
 * Calculates a deterministic SHA-256 checksum over the canonicalized business attributes
 * of a source observation. Excludes unstable fields such as fetchedAt, requestId, or random IDs.
 */
export function calculateIngestionChecksum(input: RawLeadInput | Record<string, unknown>): string {
  const raw = input as RawLeadInput & Record<string, unknown>;
  const rawName = String(raw.businessName || raw.name || '').trim();
  const normalizedName = normalizeBusinessName(rawName) || rawName.toLowerCase();
  const rawCity = String(raw.city || '').trim();
  const { city, governorate } = rawCity
    ? normalizeCityAndGovernorate(rawCity, raw.governorate ? String(raw.governorate) : null)
    : { city: '', governorate: String(raw.governorate || '').trim() };

  const combinedPhones: (string | null | undefined)[] = [];
  if (raw.phone) combinedPhones.push(String(raw.phone));
  if (Array.isArray(raw.phones)) {
    combinedPhones.push(...raw.phones.map((p) => (p != null ? String(p) : null)));
  } else if (typeof raw.phones === 'string') {
    combinedPhones.push(raw.phones);
  }
  if (Array.isArray(raw.normalizedPhones)) {
    combinedPhones.push(...raw.normalizedPhones.map((p) => (p != null ? String(p) : null)));
  }

  const normalizedPhones = normalizePhones(combinedPhones).sort();
  const normalizedPhone =
    normalizePhone(raw.phone ? String(raw.phone) : null) ||
    (typeof raw.normalizedPhone === 'string' ? normalizePhone(raw.normalizedPhone) : null) ||
    normalizedPhones[0] ||
    null;
  const normalizedEmail =
    normalizeEmail(raw.email ? String(raw.email) : null) ||
    (typeof raw.normalizedEmail === 'string' ? normalizeEmail(raw.normalizedEmail) : null);
  const normalizedDomain =
    normalizeDomain(raw.website ? String(raw.website) : null) ||
    (typeof raw.normalizedDomain === 'string' ? normalizeDomain(raw.normalizedDomain) : null);

  const websiteSocialIdentity =
    !normalizedDomain && raw.website ? parseSocialIdentity(String(raw.website)) : null;

  const rawFacebook =
    raw.facebook &&
    String(raw.facebook).trim() !== '' &&
    String(raw.facebook).trim().toLowerCase() !== 'none'
      ? String(raw.facebook).trim()
      : websiteSocialIdentity?.platform === 'FACEBOOK'
        ? String(raw.website).trim()
        : null;
  const normalizedFacebook =
    normalizeSocialUrl(rawFacebook, 'FACEBOOK') ||
    (typeof raw.normalizedFacebook === 'string'
      ? normalizeSocialUrl(raw.normalizedFacebook, 'FACEBOOK')
      : null);

  const rawInstagram =
    raw.instagram &&
    String(raw.instagram).trim() !== '' &&
    String(raw.instagram).trim().toLowerCase() !== 'none'
      ? String(raw.instagram).trim()
      : websiteSocialIdentity?.platform === 'INSTAGRAM'
        ? String(raw.website).trim()
        : null;
  const normalizedInstagram =
    normalizeSocialUrl(rawInstagram, 'INSTAGRAM') ||
    (typeof raw.normalizedInstagram === 'string'
      ? normalizeSocialUrl(raw.normalizedInstagram, 'INSTAGRAM')
      : null);

  let websiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN' = 'NO_WEBSITE';
  if (
    raw.websiteStatus &&
    ['NO_WEBSITE', 'HAS_WEBSITE', 'POOR_WEBSITE', 'UNKNOWN'].includes(String(raw.websiteStatus))
  ) {
    websiteStatus = raw.websiteStatus as 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  } else if (normalizedDomain) {
    websiteStatus = 'HAS_WEBSITE';
  }

  const normalizedAddr =
    normalizeAddress(raw.address ? String(raw.address) : null) ||
    (typeof raw.normalizedAddress === 'string' ? raw.normalizedAddress : null);
  const externalId = normalizeSourceExternalId(raw.externalId);
  const category = raw.category ? normalizeCategory(String(raw.category)) : 'Other';
  const sourceType = resolveSourceType(
    raw.sourceType ? String(raw.sourceType) : raw.source ? String(raw.source) : 'MANUAL'
  );

  const rating =
    raw.rating !== undefined && raw.rating !== null && String(raw.rating).trim() !== ''
      ? Math.round(Number(raw.rating) * 10) / 10
      : null;
  const reviewCount =
    raw.reviewCount !== undefined && raw.reviewCount !== null && String(raw.reviewCount).trim() !== ''
      ? Math.floor(Number(raw.reviewCount))
      : 0;
  const branchCount =
    raw.branchCount !== undefined && raw.branchCount !== null && String(raw.branchCount).trim() !== ''
      ? Math.max(1, Math.floor(Number(raw.branchCount)))
      : 1;

  const canonicalPayload = canonicalizeObjectForHash({
    sourceType,
    externalId: externalId || null,
    normalizedName,
    category,
    governorate,
    city,
    area: raw.area ? String(raw.area).trim() : null,
    normalizedAddress: normalizedAddr || null,
    normalizedPhone,
    normalizedPhones,
    normalizedEmail: normalizedEmail || null,
    normalizedDomain: normalizedDomain || null,
    websiteStatus,
    normalizedFacebook: normalizedFacebook || null,
    normalizedInstagram: normalizedInstagram || null,
    rating: Number.isNaN(rating as number) ? null : rating,
    reviewCount: Number.isNaN(reviewCount) ? 0 : reviewCount,
    branchCount: Number.isNaN(branchCount) ? 1 : branchCount,
  });

  const serialized = JSON.stringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

export interface ContractValidationOptions {
  requireExternalId?: boolean;
}

export interface ContractValidationOutcome {
  valid: boolean;
  errors: string[];
  record?: IngestionContractRecordV1;
}

/**
 * Validates a collector's normalized contract output against INGESTION_CONTRACT_V1 before entering
 * the canonical Phase 2/3/1/4/7 pipeline.
 */
export function validateCollectorContractRecord(
  candidate: unknown,
  options?: ContractValidationOptions
): ContractValidationOutcome {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      valid: false,
      errors: ['Collector output must be a non-null object matching INGESTION_CONTRACT_V1'],
    };
  }

  const parsed = IngestionContractRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (iss) => `${iss.path.join('.') || 'root'}: ${iss.message}`
    );
    return {
      valid: false,
      errors: issues,
    };
  }

  const record = parsed.data as IngestionContractRecordV1;

  if (options?.requireExternalId && (!record.externalId || !record.externalId.trim())) {
    return {
      valid: false,
      errors: [`Source "${record.sourceName}" requires a non-empty externalId on every record.`],
    };
  }

  // Verify leadInput has an object shape and valid primitive types
  const lead = record.leadInput;
  if (!lead || typeof lead !== 'object') {
    return {
      valid: false,
      errors: ['leadInput must be a valid object'],
    };
  }

  return {
    valid: true,
    errors: [],
    record,
  };
}

export function assertValidCollectorContractRecord(
  candidate: unknown,
  options?: ContractValidationOptions
): IngestionContractRecordV1 {
  const res = validateCollectorContractRecord(candidate, options);
  if (!res.valid || !res.record) {
    throw new IngestionError(
      `Collector contract validation failed: ${res.errors.join('; ')}`,
      'SCHEMA_VALIDATION_FAILED',
      {
        statusCode: 400,
        retryable: false,
        details: { errors: res.errors },
      }
    );
  }
  return res.record;
}

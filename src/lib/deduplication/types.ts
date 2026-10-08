import { Lead, SourceRecord, SourceType } from '@prisma/client';

export type PhoneLineType = 'MOBILE' | 'LANDLINE' | 'HOTLINE' | 'INTERNATIONAL';

export interface ParsedPhoneInfo {
  raw: string;
  normalized: string; // Canonical digits e.g. "201012345678"
  e164: string; // E.164 representation e.g. "+201012345678"
  type: PhoneLineType;
  extension: string | null;
  carrierOrAreaCode: string | null;
}

export type SocialPlatform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'LINKEDIN'
  | 'TIKTOK'
  | 'TWITTER'
  | 'YOUTUBE'
  | 'WHATSAPP'
  | 'OTHER';

export interface ParsedSocialIdentity {
  platform: SocialPlatform;
  handle: string;
  normalizedUrl: string; // e.g. "facebook.com/example"
  canonicalUrl: string; // e.g. "https://facebook.com/example"
}

export interface ParsedAddressComponents {
  raw: string;
  normalized: string;
  buildingNumber: string | null;
  streetCore: string;
  district?: string | null;
  city?: string | null;
  governorate?: string | null;
}

export type IdentityKeyType =
  | 'SOURCE'
  | 'DOMAIN'
  | 'PHONE'
  | 'EMAIL'
  | 'SOCIAL'
  | 'COMPOSITE_NAME_CITY'
  | 'COMPOSITE_NAME_ADDRESS_CITY';

export interface CanonicalIdentityKeyRecord {
  keyType: IdentityKeyType;
  keyValue: string;
  canonicalKey: string;
  isPrimary: boolean;
  isStrong: boolean;
}

export type IdentitySignalType =
  | 'SOURCE_EXTERNAL_ID'
  | 'DOMAIN'
  | 'PHONE'
  | 'EMAIL'
  | 'SOCIAL_URL'
  | 'BUSINESS_NAME'
  | 'ADDRESS'
  | 'CITY';

export type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICT';

export interface DeduplicationSignal {
  type: IdentitySignalType;
  match: boolean;
  strength: SignalStrength;
  existingValue?: string | null;
  incomingValue?: string | null;
  label?: string;
  labelAr?: string;
}

export type DeduplicationDecision =
  | 'UNIQUE'
  | 'DUPLICATE_CONFIRMED'
  | 'POSSIBLE_DUPLICATE'
  | 'CONFLICT';

export type DeduplicationMatchReason =
  | 'SOURCE_EXTERNAL_ID_MATCH'
  | 'PHONE_MATCH'
  | 'DOMAIN_MATCH'
  | 'EMAIL_MATCH'
  | 'SOCIAL_MATCH'
  | 'NAME_ADDRESS_CITY_MATCH'
  | 'NAME_AND_CITY_MATCH'
  | 'ADDRESS_SIMILARITY_MATCH'
  | 'AMBIGUOUS_NAME_CITY'
  | 'CONFLICTING_SIGNALS';

export interface FieldConflictRecord {
  field: string;
  existingValue: string | null;
  incomingValue: string | null;
  existingSource?: string;
  incomingSource?: string;
  resolution: 'KEPT_EXISTING' | 'UPDATED_BY_PRIORITY' | 'FLAGGED_FOR_REVIEW';
  detectedAt: string;
}

export interface FieldProvenanceEntry {
  value: unknown;
  source: string;
  sourceType?: SourceType | string;
  sourceRecordId?: string | null;
  externalId?: string | null;
  priority: number;
  firstSeenAt: string;
  verifiedAt: string;
  confirmedBySources: string[];
}

export type LeadFieldProvenanceMap = Record<string, FieldProvenanceEntry>;

export interface DeduplicationEvaluationResult {
  decision: DeduplicationDecision;
  isDuplicate: boolean;
  matchedLeadId: string | null;
  matchedLead?: Lead;
  matchReason?: DeduplicationMatchReason;
  matchedLevel?: 1 | 2 | 3 | 4 | 5 | null;
  signals: DeduplicationSignal[];
  conflicts: FieldConflictRecord[];
  hasConflicts: boolean;
  ambiguousCandidateIds: string[];
  durationMs: number;
}

export interface MergeExecutionResult {
  mergeId: string;
  lead: Lead;
  sourceRecord?: SourceRecord | null;
  fieldChanges: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    enrichedFields: string[];
    conflictedFields: FieldConflictRecord[];
  };
  scoreRecalculated: boolean;
  newScore: number;
}

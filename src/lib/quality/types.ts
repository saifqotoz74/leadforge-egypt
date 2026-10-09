import {
  BusinessOperationalStatus,
  FreshnessState,
  LeadAvailabilityStatus,
  QualityStatus,
  VerificationRecordStatus,
  VerificationStatus,
  VerificationType,
} from '@prisma/client';

export {
  BusinessOperationalStatus,
  FreshnessState,
  LeadAvailabilityStatus,
  QualityStatus,
  VerificationRecordStatus,
  VerificationStatus,
  VerificationType,
};

export type QualityFlagCode =
  | 'INVALID_PHONE'
  | 'INVALID_EMAIL'
  | 'INVALID_WEBSITE'
  | 'STALE_DATA'
  | 'CATEGORY_MISMATCH'
  | 'LOCATION_MISMATCH'
  | 'POSSIBLE_DUPLICATE'
  | 'CLOSED_BUSINESS'
  | 'MISSING_REQUIRED_DATA'
  | 'CONFLICTING_SOURCE_DATA';

export type PhoneValidationState = 'VALID' | 'INVALID' | 'UNKNOWN';

export type EmailValidationState =
  | 'VALID_FORMAT'
  | 'INVALID_FORMAT'
  | 'DOMAIN_VALID'
  | 'DOMAIN_INVALID'
  | 'UNKNOWN';

export type WebsiteVerificationState =
  | 'WEBSITE_EXISTS'
  | 'WEBSITE_MISSING'
  | 'WEBSITE_UNREACHABLE'
  | 'WEBSITE_REDIRECT'
  | 'WEBSITE_HTTP'
  | 'WEBSITE_HTTPS'
  | 'DOMAIN_INVALID'
  | 'UNKNOWN';

export type VerificationErrorType =
  | 'TEMPORARY_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'UNKNOWN';

export type CompletenessFieldRequirement = 'REQUIRED' | 'OPTIONAL' | 'UNKNOWN';
export type CompletenessFieldState = 'PRESENT' | 'MISSING' | 'INVALID' | 'UNKNOWN';

export interface CompletenessFieldEvaluation {
  field: string;
  requirement: CompletenessFieldRequirement;
  state: CompletenessFieldState;
  maxPoints: number;
  awardedPoints: number;
  reason: string;
}

export interface CompletenessEvaluationResult {
  completenessScore: number;
  requiredScore: number;
  requiredMax: number;
  optionalScore: number;
  optionalMax: number;
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  unknownFields: string[];
  fields: CompletenessFieldEvaluation[];
}

export interface QualityThresholdsConfig {
  veryLowMax: number;
  lowMin: number;
  lowMax: number;
  mediumMin: number;
  mediumMax: number;
  highMin: number;
  highMax: number;
  excellentMin: number;
  minSaleableQualityScore: number;
  phoneExpiryDays: number;
  emailExpiryDays: number;
  websiteExpiryDays: number;
  businessStatusExpiryDays: number;
  addressExpiryDays: number;
  identityExpiryDays: number;
}

export const DEFAULT_QUALITY_CONFIG: QualityThresholdsConfig = {
  veryLowMax: 24,
  lowMin: 25,
  lowMax: 49,
  mediumMin: 50,
  mediumMax: 69,
  highMin: 70,
  highMax: 84,
  excellentMin: 85,
  minSaleableQualityScore: 35,
  phoneExpiryDays: 30,
  emailExpiryDays: 30,
  websiteExpiryDays: 14,
  businessStatusExpiryDays: 7,
  addressExpiryDays: 90,
  identityExpiryDays: 90,
};

export interface Phase3FreshnessThresholds {
  freshMaxDays: number;
  recentMaxDays: number;
  needsVerifyMaxDays: number;
  staleMaxDays: number;
}

export const DEFAULT_PHASE3_FRESHNESS_THRESHOLDS: Phase3FreshnessThresholds = {
  freshMaxDays: 7,
  recentMaxDays: 30,
  needsVerifyMaxDays: 90,
  staleMaxDays: 180,
};

export interface Phase3FreshnessResult {
  freshnessStatus: FreshnessState;
  legacyStatus: 'FRESH' | 'RECENTLY_VERIFIED' | 'NEEDS_VERIFICATION' | 'STALE';
  daysSinceVerified: number | null;
  isStale: boolean;
  requiresVerification: boolean;
  labelAr: string;
  labelEn: string;
  badgeClass: string;
}

export interface DimensionVerificationSnapshot {
  verificationType: VerificationType;
  status: VerificationRecordStatus;
  effectiveStatus: VerificationRecordStatus;
  checkedAt: Date;
  expiresAt?: Date | null;
  isExpired: boolean;
  source: string;
  resultSummary: string;
  errorType?: string | null;
  retryCount?: number;
}

export interface QualityComponentContribution {
  component: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface QualityReasonSignal {
  signal: string;
  impact: number;
  reason: string;
}

export interface QualityEvaluationSummary {
  qualityVersion: string;
  qualityScore: number;
  qualityStatus: QualityStatus;
  opportunityScore?: number;
  completenessScore: number;
  freshnessStatus: FreshnessState;
  daysSinceVerified: number | null;
  verificationStatus: VerificationStatus;
  saleabilityStatus: LeadAvailabilityStatus;
  isSaleable: boolean;
  saleabilityReason: string;
  businessStatus: BusinessOperationalStatus;
  phoneValidationStatus: PhoneValidationState;
  emailValidationStatus: EmailValidationState;
  websiteVerificationState: WebsiteVerificationState;
  qualityFlags: QualityFlagCode[];
  components: QualityComponentContribution[];
  reasons: QualityReasonSignal[];
  evaluatedAt: string;
}

export interface LeadQualityEvaluationInput {
  id?: string;
  businessName?: string | null;
  normalizedName?: string | null;
  category?: string | null;
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  normalizedAddress?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  phones?: string[];
  hasPhone?: boolean;
  email?: string | null;
  normalizedEmail?: string | null;
  hasEmail?: boolean;
  website?: string | null;
  normalizedDomain?: string | null;
  websiteStatus?: string | null;
  websiteAnalysis?: Record<string, unknown> | null;
  facebook?: string | null;
  normalizedFacebook?: string | null;
  hasFacebook?: boolean;
  instagram?: string | null;
  normalizedInstagram?: string | null;
  hasInstagram?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  branchCount?: number | null;
  score?: number;
  isVerified?: boolean;
  isCanonical?: boolean;
  mergedIntoLeadId?: string | null;
  status?: LeadAvailabilityStatus | string | null;
  currentPurchasers?: number;
  maxPurchasers?: number;
  businessStatus?: BusinessOperationalStatus | string | null;
  phoneValidationStatus?: string | null;
  emailValidationStatus?: string | null;
  websiteVerificationState?: string | null;
  fieldConflicts?: unknown;
  hasPendingDuplicateCandidate?: boolean;
  duplicateConfidence?: string | number | null;
  source?: string | null;
  sourceList?: string[];
  lastVerifiedAt?: Date | string | null;
  lastDiscoveredAt?: Date | string | null;
  verifications?: Array<{
    verificationType: VerificationType;
    status: VerificationRecordStatus;
    checkedAt: Date | string;
    expiresAt?: Date | string | null;
    source?: string;
    resultSummary?: string;
    errorType?: string | null;
    retryCount?: number;
  }>;
  negativeFeedbackReasons?: string[];
  negativeFeedbackEntries?: Array<{
    reason: string;
    createdAt?: Date | string;
  }>;
}


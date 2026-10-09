import { FreshnessState, VerificationRecordStatus, VerificationType } from '@prisma/client';
import {
  DEFAULT_PHASE3_FRESHNESS_THRESHOLDS,
  DEFAULT_QUALITY_CONFIG,
  DimensionVerificationSnapshot,
  Phase3FreshnessResult,
  Phase3FreshnessThresholds,
  QualityThresholdsConfig,
} from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Dynamically computes Phase 3 FreshnessState from `lastVerifiedAt` and `now`.
 * Rules:
 * - null / undefined / invalid date -> UNKNOWN
 * - 0–7 days -> FRESH
 * - 8–30 days -> RECENT
 * - 31–90 days -> NEEDS_VERIFICATION
 * - 91–180 days -> STALE
 * - 181+ days -> VERY_STALE
 */
export function calculateLeadFreshness(
  lastVerifiedAt: Date | string | null | undefined,
  thresholds: Partial<Phase3FreshnessThresholds> = DEFAULT_PHASE3_FRESHNESS_THRESHOLDS,
  now: Date = new Date()
): Phase3FreshnessResult {
  const cfg: Phase3FreshnessThresholds = {
    ...DEFAULT_PHASE3_FRESHNESS_THRESHOLDS,
    ...thresholds,
  };

  if (lastVerifiedAt === null || lastVerifiedAt === undefined || lastVerifiedAt === '') {
    return {
      freshnessStatus: 'UNKNOWN',
      legacyStatus: 'NEEDS_VERIFICATION',
      daysSinceVerified: null,
      isStale: false,
      requiresVerification: true,
      labelAr: 'تاريخ التحقق غير معروف (Unknown)',
      labelEn: 'Unknown Freshness',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }

  const verifiedDate =
    typeof lastVerifiedAt === 'string' ? new Date(lastVerifiedAt) : lastVerifiedAt;

  if (Number.isNaN(verifiedDate.getTime())) {
    return {
      freshnessStatus: 'UNKNOWN',
      legacyStatus: 'NEEDS_VERIFICATION',
      daysSinceVerified: null,
      isStale: false,
      requiresVerification: true,
      labelAr: 'تاريخ التحقق غير معروف (Unknown)',
      labelEn: 'Unknown Freshness',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }

  const diffMs = Math.max(0, now.getTime() - verifiedDate.getTime());
  const daysSinceVerified = Math.floor(diffMs / MS_PER_DAY);

  if (daysSinceVerified <= cfg.freshMaxDays) {
    return {
      freshnessStatus: 'FRESH',
      legacyStatus: 'FRESH',
      daysSinceVerified,
      isStale: false,
      requiresVerification: false,
      labelAr: 'بيانات حديثة (Fresh)',
      labelEn: 'Fresh',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  if (daysSinceVerified <= cfg.recentMaxDays) {
    return {
      freshnessStatus: 'RECENT',
      legacyStatus: 'RECENTLY_VERIFIED',
      daysSinceVerified,
      isStale: false,
      requiresVerification: false,
      labelAr: 'تم التحقق مؤخرًا (Recent)',
      labelEn: 'Recent',
      badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    };
  }

  if (daysSinceVerified <= cfg.needsVerifyMaxDays) {
    return {
      freshnessStatus: 'NEEDS_VERIFICATION',
      legacyStatus: 'NEEDS_VERIFICATION',
      daysSinceVerified,
      isStale: false,
      requiresVerification: true,
      labelAr: 'يحتاج إعادة تحقق (Needs Verification)',
      labelEn: 'Needs Verification',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }

  if (daysSinceVerified <= cfg.staleMaxDays) {
    return {
      freshnessStatus: 'STALE',
      legacyStatus: 'STALE',
      daysSinceVerified,
      isStale: true,
      requiresVerification: true,
      labelAr: 'بيانات قديمة (Stale)',
      labelEn: 'Stale',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }

  return {
    freshnessStatus: 'VERY_STALE',
    legacyStatus: 'STALE',
    daysSinceVerified,
    isStale: true,
    requiresVerification: true,
    labelAr: 'بيانات قديمة جدًا (Very Stale)',
    labelEn: 'Very Stale',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
  };
}

/**
 * Returns the configured expiration window in days for a given VerificationType.
 */
export function getVerificationExpiryDays(
  verificationType: VerificationType,
  config: Partial<QualityThresholdsConfig> = DEFAULT_QUALITY_CONFIG
): number {
  const cfg = { ...DEFAULT_QUALITY_CONFIG, ...config };
  switch (verificationType) {
    case 'PHONE':
      return cfg.phoneExpiryDays;
    case 'EMAIL':
      return cfg.emailExpiryDays;
    case 'WEBSITE':
      return cfg.websiteExpiryDays;
    case 'BUSINESS_STATUS':
      return cfg.businessStatusExpiryDays;
    case 'ADDRESS':
    case 'LOCATION':
      return cfg.addressExpiryDays;
    case 'IDENTITY':
    case 'CATEGORY':
      return cfg.identityExpiryDays;
    case 'FEEDBACK':
      return cfg.phoneExpiryDays;
    case 'FULL':
    default:
      return cfg.websiteExpiryDays;
  }
}

/**
 * Computes the expiration Date for a verification event checked at `checkedAt`.
 */
export function computeVerificationExpiryDate(
  verificationType: VerificationType,
  checkedAt: Date = new Date(),
  config: Partial<QualityThresholdsConfig> = DEFAULT_QUALITY_CONFIG
): Date {
  const days = getVerificationExpiryDays(verificationType, config);
  return new Date(checkedAt.getTime() + days * MS_PER_DAY);
}

/**
 * Evaluates whether a verification record has expired at `now`.
 * Per Phase 3 rules:
 * - Expired verification transitions effective status to `NEEDS_REVERIFICATION` (never `FAILED`).
 * - A record that was already `FAILED` remains `FAILED` until a newer verification supersedes it.
 */
export function evaluateVerificationExpiration(
  record: {
    verificationType: VerificationType;
    status: VerificationRecordStatus;
    checkedAt: Date | string;
    expiresAt?: Date | string | null;
    source?: string;
    resultSummary?: string;
    errorType?: string | null;
    retryCount?: number;
  },
  config: Partial<QualityThresholdsConfig> = DEFAULT_QUALITY_CONFIG,
  now: Date = new Date()
): DimensionVerificationSnapshot {
  const checkedAt =
    typeof record.checkedAt === 'string' ? new Date(record.checkedAt) : record.checkedAt;
  const expiresAt = record.expiresAt
    ? typeof record.expiresAt === 'string'
      ? new Date(record.expiresAt)
      : record.expiresAt
    : computeVerificationExpiryDate(record.verificationType, checkedAt, config);

  const isExpired = now.getTime() > expiresAt.getTime();

  let effectiveStatus: VerificationRecordStatus = record.status;
  if (isExpired && record.status === 'VERIFIED') {
    effectiveStatus = 'NEEDS_REVERIFICATION';
  }

  return {
    verificationType: record.verificationType,
    status: record.status,
    effectiveStatus,
    checkedAt,
    expiresAt,
    isExpired,
    source: record.source || 'SYSTEM',
    resultSummary: record.resultSummary || '',
    errorType: record.errorType ?? null,
    retryCount: record.retryCount ?? 0,
  };
}

/**
 * Reduces a list of historical `LeadVerification` records into the latest snapshot per `VerificationType`,
 * applying expiration rules dynamically against `now`.
 */
export function getLatestVerificationSnapshotsByDimension(
  verifications: Array<{
    verificationType: VerificationType;
    status: VerificationRecordStatus;
    checkedAt: Date | string;
    expiresAt?: Date | string | null;
    source?: string;
    resultSummary?: string;
    errorType?: string | null;
    retryCount?: number;
  }> = [],
  config: Partial<QualityThresholdsConfig> = DEFAULT_QUALITY_CONFIG,
  now: Date = new Date()
): Map<VerificationType, DimensionVerificationSnapshot> {
  const sorted = [...verifications].sort((a, b) => {
    const tA = new Date(a.checkedAt).getTime();
    const tB = new Date(b.checkedAt).getTime();
    return tB - tA; // newest first
  });

  const map = new Map<VerificationType, DimensionVerificationSnapshot>();
  for (const record of sorted) {
    if (!map.has(record.verificationType)) {
      map.set(record.verificationType, evaluateVerificationExpiration(record, config, now));
    }
  }
  return map;
}

/**
 * Returns the freshness priority bucket rank (lower number = higher priority for batch verification).
 * Order:
 * 1. VERY_STALE
 * 2. STALE
 * 3. NEEDS_VERIFICATION / UNKNOWN
 * 4. RECENT
 * 5. FRESH
 */
export function getFreshnessVerificationPriorityRank(state: FreshnessState): number {
  switch (state) {
    case 'VERY_STALE':
      return 1;
    case 'STALE':
      return 2;
    case 'NEEDS_VERIFICATION':
    case 'UNKNOWN':
      return 3;
    case 'RECENT':
      return 4;
    case 'FRESH':
    default:
      return 5;
  }
}

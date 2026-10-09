import { FreshnessState } from '@prisma/client';
import { calculateLeadFreshness } from './quality/freshness-engine';

export type FreshnessStatus =
  | 'FRESH'
  | 'RECENTLY_VERIFIED'
  | 'RECENT'
  | 'NEEDS_VERIFICATION'
  | 'STALE'
  | 'VERY_STALE'
  | 'UNKNOWN';

export interface FreshnessThresholds {
  freshMaxDays: number;
  recentMaxDays: number;
  needsVerifyMaxDays: number;
  staleMaxDays?: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  freshMaxDays: 7,
  recentMaxDays: 30,
  needsVerifyMaxDays: 90,
  staleMaxDays: 180,
};

export interface FreshnessEvaluation {
  status: FreshnessStatus;
  freshnessStatus: FreshnessState;
  labelAr: string;
  labelEn: string;
  daysSinceVerified: number;
  isStale: boolean;
  requiresVerification: boolean;
  badgeClass: string;
}

export function evaluateLeadFreshness(
  lastVerifiedAt: Date | string | null | undefined,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS,
  now: Date = new Date()
): FreshnessEvaluation {
  const result = calculateLeadFreshness(
    lastVerifiedAt,
    {
      freshMaxDays: thresholds.freshMaxDays,
      recentMaxDays: thresholds.recentMaxDays,
      needsVerifyMaxDays: thresholds.needsVerifyMaxDays,
      staleMaxDays: thresholds.staleMaxDays ?? 180,
    },
    now
  );

  if (result.freshnessStatus === 'UNKNOWN') {
    return {
      status: 'UNKNOWN',
      freshnessStatus: 'UNKNOWN',
      labelAr: result.labelAr,
      labelEn: result.labelEn,
      daysSinceVerified: -1,
      isStale: false,
      requiresVerification: true,
      badgeClass: result.badgeClass,
    };
  }

  return {
    status: result.legacyStatus,
    freshnessStatus: result.freshnessStatus,
    labelAr:
      result.legacyStatus === 'RECENTLY_VERIFIED'
        ? 'تم التحقق مؤخرًا (Recently Verified)'
        : result.labelAr,
    labelEn:
      result.legacyStatus === 'RECENTLY_VERIFIED' ? 'Recently Verified' : result.labelEn,
    daysSinceVerified: result.daysSinceVerified ?? 0,
    isStale: result.isStale,
    requiresVerification: result.requiresVerification,
    badgeClass: result.badgeClass,
  };
}


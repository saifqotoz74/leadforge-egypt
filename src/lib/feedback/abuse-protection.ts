import { Prisma, PrismaClient } from '@prisma/client';
import { createAuditLog } from '../audit';
import { EngagementEngineError, FeedbackAbuseFlag } from './types';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AbuseThresholdConfig {
  maxStatusChangesPerEngagementWindow: number;
  rapidStatusWindowMs: number;
  maxStatusChangesHardLimit: number;
  maxFeedbackPerDeveloperWindow: number;
  feedbackVolumeWindowMs: number;
  maxFeedbackHardLimit: number;
  maxInvalidReportsWindow: number;
  invalidReportsWindowMs: number;
  maxContactAttemptsPerEngagementWindow: number;
  contactAttemptsWindowMs: number;
}

export const DEFAULT_ABUSE_THRESHOLDS: AbuseThresholdConfig = {
  maxStatusChangesPerEngagementWindow: 4,
  rapidStatusWindowMs: 5 * 60 * 1000, // 5 minutes
  maxStatusChangesHardLimit: 12,
  maxFeedbackPerDeveloperWindow: 8,
  feedbackVolumeWindowMs: 15 * 60 * 1000, // 15 minutes
  maxFeedbackHardLimit: 20,
  maxInvalidReportsWindow: 3,
  invalidReportsWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxContactAttemptsPerEngagementWindow: 15,
  contactAttemptsWindowMs: 10 * 60 * 1000, // 10 minutes
};

export interface AbuseEvaluationResult {
  flags: FeedbackAbuseFlag[];
  requiresAdminReview: boolean;
  details: Record<string, unknown>;
}

/**
 * Evaluates rate limits and abuse flags for status changes on an engagement.
 */
export async function evaluateStatusChangeAbuse(
  db: DbClient,
  params: {
    developerId: string;
    leadId: string;
    engagementId: string;
    previousStatus: string;
    targetStatus: string;
    hasContactAttempts: boolean;
    claimedAt: Date;
    now?: Date;
    thresholds?: Partial<AbuseThresholdConfig>;
  }
): Promise<AbuseEvaluationResult> {
  const {
    developerId,
    leadId,
    engagementId,
    previousStatus,
    targetStatus,
    hasContactAttempts,
    claimedAt,
    now = new Date(),
  } = params;
  const cfg = { ...DEFAULT_ABUSE_THRESHOLDS, ...(params.thresholds ?? {}) };
  const flags = new Set<FeedbackAbuseFlag>();

  const windowStart = new Date(now.getTime() - cfg.rapidStatusWindowMs);
  const recentTransitionsCount = await db.leadStatusHistory.count({
    where: {
      engagementId,
      createdAt: { gte: windowStart },
    },
  });

  if (recentTransitionsCount > cfg.maxStatusChangesHardLimit) {
    await createAuditLog(
      {
        userId: developerId,
        action: 'FEEDBACK_FLAGGED',
        entityType: 'LeadEngagement',
        entityId: engagementId,
        details: {
          leadId,
          developerId,
          flags: ['RAPID_STATUS_CHANGES', 'ADMIN_REVIEW_REQUIRED'],
          recentTransitionsCount,
          blocked: true,
        },
      },
      db as PrismaClient
    );
    throw new EngagementEngineError(
      'RATE_LIMITED',
      'Too many rapid status updates on this engagement. Please wait before making further changes.',
      429,
      {
        engagementId,
        recentTransitionsCount,
        flags: ['RAPID_STATUS_CHANGES', 'ADMIN_REVIEW_REQUIRED'],
      }
    );
  }

  if (recentTransitionsCount >= cfg.maxStatusChangesPerEngagementWindow) {
    flags.add('RAPID_STATUS_CHANGES');
    flags.add('ADMIN_REVIEW_REQUIRED');
  }

  // Check INVALID_SEQUENCE: marking INVALID from CLAIMED with zero contact attempts or marking frequent INVALIDs
  if (targetStatus === 'INVALID') {
    if (previousStatus === 'CLAIMED' && !hasContactAttempts) {
      const elapsedMs = now.getTime() - claimedAt.getTime();
      if (elapsedMs < 5000) {
        flags.add('INVALID_SEQUENCE');
      }
    }

    const invalidWindowStart = new Date(now.getTime() - cfg.invalidReportsWindowMs);
    const recentInvalidEngagements = await db.leadEngagement.count({
      where: {
        developerId,
        currentStatus: 'INVALID',
        invalidAt: { gte: invalidWindowStart },
      },
    });

    if (recentInvalidEngagements + 1 >= cfg.maxInvalidReportsWindow) {
      flags.add('FREQUENT_INVALID_REPORTS');
      flags.add('ADMIN_REVIEW_REQUIRED');
    }
  }

  const flagList = Array.from(flags);
  const requiresAdminReview = flagList.includes('ADMIN_REVIEW_REQUIRED');

  if (flagList.length > 0) {
    await createAuditLog(
      {
        userId: developerId,
        action: 'FEEDBACK_FLAGGED',
        entityType: 'LeadEngagement',
        entityId: engagementId,
        details: {
          leadId,
          developerId,
          previousStatus,
          targetStatus,
          flags: flagList,
          recentTransitionsCount,
        },
      },
      db as PrismaClient
    );
  }

  return {
    flags: flagList,
    requiresAdminReview,
    details: {
      recentTransitionsCount,
    },
  };
}

/**
 * Evaluates rate limits and abuse flags for structured feedback submission.
 */
export async function evaluateFeedbackAbuse(
  db: DbClient,
  params: {
    developerId: string;
    leadId: string;
    engagementId: string | null;
    category: string;
    reasonCode: string;
    now?: Date;
    thresholds?: Partial<AbuseThresholdConfig>;
  }
): Promise<AbuseEvaluationResult> {
  const {
    developerId,
    leadId,
    engagementId,
    category,
    reasonCode,
    now = new Date(),
  } = params;
  const cfg = { ...DEFAULT_ABUSE_THRESHOLDS, ...(params.thresholds ?? {}) };
  const flags = new Set<FeedbackAbuseFlag>();

  const volumeWindowStart = new Date(now.getTime() - cfg.feedbackVolumeWindowMs);
  const recentFeedbackCount = await db.leadFeedback.count({
    where: {
      userId: developerId,
      createdAt: { gte: volumeWindowStart },
    },
  });

  if (recentFeedbackCount >= cfg.maxFeedbackHardLimit) {
    await createAuditLog(
      {
        userId: developerId,
        action: 'FEEDBACK_FLAGGED',
        entityType: 'LeadFeedback',
        entityId: engagementId ?? leadId,
        details: {
          leadId,
          developerId,
          flags: ['SUSPICIOUS_FEEDBACK_VOLUME', 'ADMIN_REVIEW_REQUIRED'],
          recentFeedbackCount,
          blocked: true,
        },
      },
      db as PrismaClient
    );
    throw new EngagementEngineError(
      'RATE_LIMITED',
      'Excessive feedback volume detected. Please wait before submitting additional feedback.',
      429,
      {
        developerId,
        recentFeedbackCount,
        flags: ['SUSPICIOUS_FEEDBACK_VOLUME', 'ADMIN_REVIEW_REQUIRED'],
      }
    );
  }

  if (recentFeedbackCount >= cfg.maxFeedbackPerDeveloperWindow) {
    flags.add('SUSPICIOUS_FEEDBACK_VOLUME');
    flags.add('ADMIN_REVIEW_REQUIRED');
  }

  const invalidReasonSet = new Set([
    'PHONE_INVALID',
    'WRONG_PHONE',
    'WRONG_EMAIL',
    'BUSINESS_CLOSED',
    'BUSINESS_NOT_FOUND',
    'FAKE_BUSINESS',
    'DUPLICATE',
    'DUPLICATE_LEAD',
  ]);

  if (invalidReasonSet.has(reasonCode)) {
    const invalidWindowStart = new Date(now.getTime() - cfg.invalidReportsWindowMs);
    const recentInvalidFeedbackCount = await db.leadFeedback.count({
      where: {
        userId: developerId,
        reasonCode: { in: Array.from(invalidReasonSet) },
        createdAt: { gte: invalidWindowStart },
      },
    });

    if (recentInvalidFeedbackCount + 1 >= cfg.maxInvalidReportsWindow) {
      flags.add('FREQUENT_INVALID_REPORTS');
      flags.add('ADMIN_REVIEW_REQUIRED');
    }
  }

  const flagList = Array.from(flags);
  const requiresAdminReview = flagList.includes('ADMIN_REVIEW_REQUIRED');

  if (flagList.length > 0) {
    await createAuditLog(
      {
        userId: developerId,
        action: 'FEEDBACK_FLAGGED',
        entityType: 'LeadFeedback',
        entityId: engagementId ?? leadId,
        details: {
          leadId,
          developerId,
          category,
          reasonCode,
          flags: flagList,
          recentFeedbackCount,
        },
      },
      db as PrismaClient
    );
  }

  return {
    flags: flagList,
    requiresAdminReview,
    details: {
      recentFeedbackCount,
    },
  };
}

/**
 * Evaluates rate limits for contact attempts on an engagement.
 */
export async function evaluateContactAttemptRateLimit(
  db: DbClient,
  params: {
    developerId: string;
    leadId: string;
    engagementId: string;
    now?: Date;
    thresholds?: Partial<AbuseThresholdConfig>;
  }
): Promise<void> {
  const { developerId, leadId, engagementId, now = new Date() } = params;
  const cfg = { ...DEFAULT_ABUSE_THRESHOLDS, ...(params.thresholds ?? {}) };

  const windowStart = new Date(now.getTime() - cfg.contactAttemptsWindowMs);
  const recentAttempts = await db.contactAttempt.count({
    where: {
      engagementId,
      createdAt: { gte: windowStart },
    },
  });

  if (recentAttempts >= cfg.maxContactAttemptsPerEngagementWindow) {
    await createAuditLog(
      {
        userId: developerId,
        action: 'FEEDBACK_FLAGGED',
        entityType: 'LeadEngagement',
        entityId: engagementId,
        details: {
          leadId,
          developerId,
          flags: ['SUSPICIOUS_FEEDBACK_VOLUME', 'ADMIN_REVIEW_REQUIRED'],
          recentContactAttempts: recentAttempts,
          blocked: true,
        },
      },
      db as PrismaClient
    );
    throw new EngagementEngineError(
      'RATE_LIMITED',
      'Excessive contact attempts recorded in a short window. Please wait before logging more attempts.',
      429,
      {
        engagementId,
        recentContactAttempts: recentAttempts,
      }
    );
  }
}

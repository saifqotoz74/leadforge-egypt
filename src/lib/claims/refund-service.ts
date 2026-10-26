import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import { createAuditLog } from '../audit';
import { ensureDeveloperCreditAccount } from './credit-service';
import { acquireLeadAndAccountRowLocks, withResourceLocks } from './locks';
import { logClaimEngineEvent } from './logger';
import { DEFAULT_CREDIT_PRICING_CONFIG } from './pricing';
import { ClaimEngineError, RefundClaimInput, RefundClaimResult } from './types';

/**
 * Deterministic, atomic claim refund processor.
 * - Prevents double refunds and partial over-refunds.
 * - Appends an immutable `REFUND` `CreditTransaction` (`amount > 0`).
 * - Updates `DeveloperCreditAccount.balance` and `lifetimeRefunded`.
 * - Revokes lead access (`accessGranted = false`) and updates lead purchaser capacity when fully refunded.
 */
export async function refundClaim(input: RefundClaimInput): Promise<RefundClaimResult> {
  const { claimId, reason, refundedBy, amount, idempotencyKey, ipAddress } = input;

  if (!claimId || typeof claimId !== 'string') {
    throw new ClaimEngineError('INVALID_REFUND_REQUEST', 'claimId is required', 422);
  }
  if (!reason || reason.trim().length < 3) {
    throw new ClaimEngineError(
      'INVALID_REFUND_REQUEST',
      'A descriptive refund reason (at least 3 characters) is required',
      422
    );
  }
  if (!refundedBy || typeof refundedBy !== 'string') {
    throw new ClaimEngineError('INVALID_REFUND_REQUEST', 'refundedBy is required', 422);
  }

  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.trim().length > 128 ||
      /[\r\n\0]/.test(idempotencyKey)
    ) {
      throw new ClaimEngineError(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency key must be a non-empty string up to 128 characters',
        422
      );
    }
  }

  const trimmedReason = reason.trim();
  const normalizedIdempotencyKey = idempotencyKey?.trim() || undefined;

  const claimLookup = await prisma.leadClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      userId: true,
      developerId: true,
      leadId: true,
    },
  });

  if (!claimLookup) {
    throw new ClaimEngineError('CLAIM_NOT_FOUND', 'Lead claim not found', 404, { claimId });
  }

  const developerId = claimLookup.developerId || claimLookup.userId;

  return withResourceLocks(
    [`developer:${developerId}`, `lead:${claimLookup.leadId}`, `claim:${claimId}`],
    async () => {
      const result = await prisma.$transaction(async (tx) => {
        await acquireLeadAndAccountRowLocks(tx, claimLookup.leadId, developerId);

        const claim = await tx.leadClaim.findUnique({
          where: { id: claimId },
          include: {
            lead: true,
          },
        });

        if (!claim) {
          throw new ClaimEngineError('CLAIM_NOT_FOUND', 'Lead claim not found', 404, { claimId });
        }

        const targetDeveloperId = claim.developerId || claim.userId;

        if (normalizedIdempotencyKey) {
          const existingTx = await tx.creditTransaction.findUnique({
            where: {
              developerId_idempotencyKey: {
                developerId: targetDeveloperId,
                idempotencyKey: normalizedIdempotencyKey,
              },
            },
          });

          if (existingTx && existingTx.claimId === claim.id && existingTx.type === 'REFUND') {
            return {
              success: true as const,
              idempotentReplay: true,
              claimId: claim.id,
              leadId: claim.leadId,
              developerId: targetDeveloperId,
              status: claim.status,
              creditsRefunded: existingTx.amount,
              totalCreditsRefundedForClaim: claim.creditsRefunded,
              balanceBefore: existingTx.balanceBefore,
              balanceAfter: existingTx.balanceAfter,
              transactionId: existingTx.id,
              refundReason: claim.refundReason ?? existingTx.reason,
              refundedBy: claim.refundedBy ?? existingTx.performedById ?? existingTx.actorId ?? refundedBy,
              refundedAt: claim.refundedAt ?? existingTx.createdAt,
            };
          }
        }

        if (claim.status === 'REFUNDED') {
          throw new ClaimEngineError(
            'CLAIM_ALREADY_REFUNDED',
            'This claim has already been refunded',
            409,
            {
              claimId: claim.id,
              refundedAt: claim.refundedAt,
              creditsRefunded: claim.creditsRefunded,
            }
          );
        }

        if (claim.status !== 'ACTIVE' && claim.status !== 'EXPIRED') {
          throw new ClaimEngineError(
            'INVALID_REFUND_REQUEST',
            `Cannot refund claim in status ${claim.status}`,
            422,
            { claimId: claim.id, status: claim.status }
          );
        }

        const remainingRefundable = claim.creditsCharged - claim.creditsRefunded;
        if (remainingRefundable <= 0) {
          throw new ClaimEngineError(
            'CLAIM_ALREADY_REFUNDED',
            'No refundable credits remain on this claim',
            409,
            { claimId: claim.id, creditsCharged: claim.creditsCharged, creditsRefunded: claim.creditsRefunded }
          );
        }

        const refundAmount = amount !== undefined ? amount : remainingRefundable;
        if (
          typeof refundAmount !== 'number' ||
          !Number.isInteger(refundAmount) ||
          refundAmount <= 0 ||
          refundAmount > remainingRefundable
        ) {
          throw new ClaimEngineError(
            'INVALID_REFUND_REQUEST',
            `Refund amount (${refundAmount}) must be a positive integer not exceeding remaining refundable credits (${remainingRefundable})`,
            422,
            {
              requestedRefund: refundAmount,
              remainingRefundable,
              creditsCharged: claim.creditsCharged,
              alreadyRefunded: claim.creditsRefunded,
            }
          );
        }

        const account = await ensureDeveloperCreditAccount(tx, targetDeveloperId);
        const balanceBefore = account.balance;
        const balanceAfter = balanceBefore + refundAmount;
        const newTotalRefunded = claim.creditsRefunded + refundAmount;
        const isFullyRefunded = newTotalRefunded >= claim.creditsCharged;
        const newClaimStatus: 'ACTIVE' | 'EXPIRED' | 'REFUNDED' = isFullyRefunded ? 'REFUNDED' : claim.status;
        const now = new Date();

        const accountUpdate = await tx.developerCreditAccount.updateMany({
          where: {
            id: account.id,
            version: account.version,
          },
          data: {
            balance: balanceAfter,
            lifetimeRefunded: { increment: refundAmount },
            totalRefunded: { increment: refundAmount },
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        if (accountUpdate.count !== 1) {
          throw new ClaimEngineError(
            'CONCURRENCY_CONFLICT',
            'Concurrent credit account update detected during refund',
            409
          );
        }

        // Synchronize legacy Subscription.credits and creditsUsed
        const existingSub = await tx.subscription.findUnique({
          where: { userId: targetDeveloperId },
          select: { id: true, creditsUsed: true },
        });
        if (existingSub) {
          await tx.subscription.update({
            where: { id: existingSub.id },
            data: {
              credits: balanceAfter,
              creditsUsed: Math.max(0, existingSub.creditsUsed - refundAmount),
            },
          });
        }

        const updatedClaimCount = await tx.leadClaim.updateMany({
          where: {
            id: claim.id,
            creditsRefunded: claim.creditsRefunded,
            status: claim.status,
          },
          data: {
            status: newClaimStatus,
            creditsRefunded: newTotalRefunded,
            accessGranted: isFullyRefunded ? false : claim.accessGranted,
            refundedAt: now,
            refundReason: trimmedReason,
            refundedBy,
          },
        });

        if (updatedClaimCount.count !== 1) {
          throw new ClaimEngineError(
            'CONCURRENCY_CONFLICT',
            'Concurrent claim status update detected during refund',
            409
          );
        }

        // If the claim is now REFUNDED, release its slot on the Lead (SEC-04)
        if (isFullyRefunded && claim.lead) {
          const activePaidClaimsCount = await tx.leadClaim.count({
            where: {
              leadId: claim.leadId,
              status: 'ACTIVE',
              user: {
                subscription: {
                  plan: {
                    priceEgp: { gt: 0 },
                    slug: { not: 'free' },
                  },
                },
              },
            },
          });
          const newPurchasers = activePaidClaimsCount;
          const leadStillSaleable =
            claim.lead.isCanonical !== false &&
            !claim.lead.mergedIntoLeadId &&
            (claim.lead.saleabilityStatus === 'AVAILABLE' || claim.lead.saleabilityStatus === 'CLAIMED_FULL') &&
            claim.lead.status !== 'INVALID' &&
            claim.lead.status !== 'CLOSED' &&
            claim.lead.status !== 'DUPLICATE' &&
            claim.lead.status !== 'ARCHIVED' &&
            claim.lead.status !== 'NOT_SALEABLE' &&
            claim.lead.status !== 'STALE' &&
            claim.lead.status !== 'REQUIRES_VERIFICATION' &&
            claim.lead.businessStatus !== 'CLOSED' &&
            claim.lead.verificationStatus !== 'FAILED_VERIFICATION' &&
            claim.lead.verificationStatus !== 'UNVERIFIED' &&
            claim.lead.freshnessStatus !== 'STALE' &&
            claim.lead.freshnessStatus !== 'VERY_STALE' &&
            claim.lead.freshnessStatus !== 'NEEDS_VERIFICATION';

          const isExclusive =
            claim.accessType === 'EXCLUSIVE' ||
            claim.lead.accessType === 'EXCLUSIVE' ||
            claim.lead.leadType === 'EXCLUSIVE' ||
            claim.lead.exclusive;

          await tx.lead.update({
            where: { id: claim.leadId },
            data: {
              currentPurchasers: newPurchasers,
              ...(leadStillSaleable && newPurchasers < (isExclusive ? 1 : claim.lead.maxPurchasers)
                ? {
                    availableForClaim: true,
                    status: 'AVAILABLE',
                    saleabilityStatus: 'AVAILABLE',
                    ...(isExclusive
                      ? {
                          exclusiveClaimedAt: null,
                          exclusiveClaimedById: null,
                        }
                      : {}),
                  }
                : {}),
            },
          });
        }

        const effectiveIdempotencyKey =
          normalizedIdempotencyKey ?? `refund-${claim.id}-${newTotalRefunded}`;

        const refundTx = await tx.creditTransaction.create({
          data: {
            accountId: account.id,
            developerId: targetDeveloperId,
            type: 'REFUND',
            amount: refundAmount,
            balanceBefore,
            balanceAfter,
            referenceType: 'LEAD_CLAIM',
            referenceId: claim.id,
            claimId: claim.id,
            leadId: claim.leadId,
            reason: trimmedReason,
            metadata: {
              refundedBy,
              ipAddress,
              isFullRefund: isFullyRefunded,
              creditsCharged: claim.creditsCharged,
              totalCreditsRefunded: newTotalRefunded,
            } as Prisma.InputJsonValue,
            idempotencyKey: effectiveIdempotencyKey,
            actorId: refundedBy,
            performedById: refundedBy,
          },
        });

        return {
          success: true as const,
          idempotentReplay: false,
          claimId: claim.id,
          leadId: claim.leadId,
          developerId: targetDeveloperId,
          status: newClaimStatus,
          creditsRefunded: refundAmount,
          totalCreditsRefundedForClaim: newTotalRefunded,
          balanceBefore,
          balanceAfter,
          transactionId: refundTx.id,
          refundReason: trimmedReason,
          refundedBy,
          refundedAt: now,
        };
      });

      if (!result.idempotentReplay) {
        logClaimEngineEvent('credits_refunded', {
          claimId: result.claimId,
          leadId: result.leadId,
          developerId: result.developerId,
          transactionId: result.transactionId,
          credits: result.creditsRefunded,
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          details: {
            refundReason: result.refundReason,
            refundedBy: result.refundedBy,
          },
        });

        await createAuditLog({
          userId: refundedBy,
          action: 'CLAIM_REFUNDED',
          entityType: 'LeadClaim',
          entityId: result.claimId,
          details: {
            leadId: result.leadId,
            developerId: result.developerId,
            creditsRefunded: result.creditsRefunded,
            balanceBefore: result.balanceBefore,
            balanceAfter: result.balanceAfter,
            transactionId: result.transactionId,
            reason: result.refundReason,
          },
          ipAddress,
        });
      }

      return result;
    }
  );
}

/**
 * Policy-driven handler for leads that become INVALID, DUPLICATE, or CLOSED after being claimed.
 * Automatically refunds active claims according to `CreditPricingConfig` rules.
 */
export async function handleLeadInvalidationAfterClaim(params: {
  leadId: string;
  invalidationType: 'INVALID' | 'DUPLICATE' | 'CLOSED';
  reason?: string;
  triggeredBy: string;
  forceRefund?: boolean;
  now?: Date;
}): Promise<{
  leadId: string;
  invalidationType: 'INVALID' | 'DUPLICATE' | 'CLOSED';
  policyApplied: string;
  refundedClaims: RefundClaimResult[];
  skippedClaimIds: string[];
}> {
  const { leadId, invalidationType, reason, triggeredBy, forceRefund = false } = params;
  const now = params.now ?? new Date();

  const dbConfig = await prisma.creditPricingConfig.findUnique({
    where: { id: 'default' },
  });
  const cfg = {
    ...DEFAULT_CREDIT_PRICING_CONFIG,
    ...(dbConfig ?? {}),
  };

  // Mark lead unavailable for any future claims immediately
  await prisma.lead.updateMany({
    where: { id: leadId },
    data: {
      availableForClaim: false,
      ...(invalidationType === 'INVALID'
        ? { status: 'INVALID', saleabilityStatus: 'INVALID' }
        : invalidationType === 'DUPLICATE'
          ? { status: 'DUPLICATE', saleabilityStatus: 'DUPLICATE' }
          : { status: 'CLOSED', saleabilityStatus: 'CLOSED', businessStatus: 'CLOSED' }),
    },
  });

  const activeClaims = await prisma.leadClaim.findMany({
    where: {
      leadId,
      status: 'ACTIVE',
    },
  });

  const refundedClaims: RefundClaimResult[] = [];
  const skippedClaimIds: string[] = [];

  for (const claim of activeClaims) {
    const refundable = claim.creditsCharged - claim.creditsRefunded;
    if (refundable <= 0) {
      skippedClaimIds.push(claim.id);
      continue;
    }

    let shouldRefund = forceRefund;
    if (!shouldRefund) {
      if (invalidationType === 'INVALID' && cfg.autoRefundOnInvalidLead) {
        shouldRefund = true;
      } else if (invalidationType === 'DUPLICATE' && cfg.autoRefundOnDuplicateLead) {
        shouldRefund = true;
      } else if (invalidationType === 'CLOSED' && cfg.autoRefundOnClosedWithinHours > 0) {
        const hoursSinceClaim =
          (now.getTime() - new Date(claim.claimedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceClaim <= cfg.autoRefundOnClosedWithinHours) {
          shouldRefund = true;
        }
      }
    }

    if (shouldRefund) {
      const defaultReason =
        reason?.trim() ||
        `Automatic refund: lead marked ${invalidationType} after claim`;
      const refundResult = await refundClaim({
        claimId: claim.id,
        reason: defaultReason,
        refundedBy: triggeredBy,
        idempotencyKey: `auto-invalidation-${invalidationType.toLowerCase()}-${claim.id}`,
      });
      refundedClaims.push(refundResult);
    } else {
      skippedClaimIds.push(claim.id);
    }
  }

  const policyApplied =
    invalidationType === 'INVALID'
      ? `autoRefundOnInvalidLead=${cfg.autoRefundOnInvalidLead}`
      : invalidationType === 'DUPLICATE'
        ? `autoRefundOnDuplicateLead=${cfg.autoRefundOnDuplicateLead}`
        : `autoRefundOnClosedWithinHours=${cfg.autoRefundOnClosedWithinHours}`;

  logClaimEngineEvent('lead_post_claim_invalidation', {
    leadId,
    details: {
      invalidationType,
      policyApplied,
      refundedCount: refundedClaims.length,
      skippedCount: skippedClaimIds.length,
    },
  });

  return {
    leadId,
    invalidationType,
    policyApplied,
    refundedClaims,
    skippedClaimIds,
  };
}

/**
 * Transitions active claims whose `expiresAt` has passed into `EXPIRED` status
 * and releases their active purchaser slots on the corresponding leads if still saleable.
 */
export async function expireStaleClaims(now: Date = new Date()): Promise<number> {
  return withResourceLocks(['__expire_stale_claims__'], async () => {
    return prisma.$transaction(async (tx) => {
      const expiringClaims = await tx.leadClaim.findMany({
        where: {
          status: 'ACTIVE',
          expiresAt: {
            lte: now,
          },
        },
        select: {
          id: true,
          leadId: true,
        },
      });

      if (expiringClaims.length === 0) {
        return 0;
      }

      const result = await tx.leadClaim.updateMany({
        where: {
          id: { in: expiringClaims.map((c) => c.id) },
          status: 'ACTIVE',
        },
        data: {
          status: 'EXPIRED',
          accessGranted: false,
        },
      });

      const affectedLeadIds = Array.from(new Set(expiringClaims.map((c) => c.leadId)));
      for (const leadId of affectedLeadIds) {
        const [lead, activeClaimsCount] = await Promise.all([
          tx.lead.findUnique({ where: { id: leadId } }),
          tx.leadClaim.count({ where: { leadId, status: 'ACTIVE' } }),
        ]);

        if (!lead) continue;

        const leadStillSaleable =
          lead.isCanonical !== false &&
          !lead.mergedIntoLeadId &&
          (lead.saleabilityStatus === 'AVAILABLE' || lead.saleabilityStatus === 'CLAIMED_FULL') &&
          lead.status !== 'INVALID' &&
          lead.status !== 'CLOSED' &&
          lead.status !== 'DUPLICATE' &&
          lead.status !== 'ARCHIVED' &&
          lead.status !== 'NOT_SALEABLE' &&
          lead.status !== 'STALE' &&
          lead.status !== 'REQUIRES_VERIFICATION' &&
          lead.businessStatus !== 'CLOSED' &&
          lead.verificationStatus !== 'FAILED_VERIFICATION' &&
          lead.verificationStatus !== 'UNVERIFIED' &&
          lead.freshnessStatus !== 'STALE' &&
          lead.freshnessStatus !== 'VERY_STALE' &&
          lead.freshnessStatus !== 'NEEDS_VERIFICATION';

        const isExclusive =
          lead.accessType === 'EXCLUSIVE' || lead.leadType === 'EXCLUSIVE' || lead.exclusive;

        await tx.lead.update({
          where: { id: leadId },
          data: {
            currentPurchasers: activeClaimsCount,
            ...(leadStillSaleable && activeClaimsCount < (isExclusive ? 1 : lead.maxPurchasers)
              ? {
                  availableForClaim: true,
                  status: 'AVAILABLE',
                  saleabilityStatus: 'AVAILABLE',
                  ...(isExclusive && activeClaimsCount === 0
                    ? {
                        exclusiveClaimedAt: null,
                        exclusiveClaimedById: null,
                      }
                    : {}),
                }
              : {}),
          },
        });
      }

      return result.count;
    });
  });
}

export const MIN_REFUND_REPORT_WAIT_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_TRIAL_REFUND_REPORTS_PER_MONTH = 2;

export interface SubmitRefundReportInput {
  claimId: string;
  developerId: string;
  reason: string;
  comment?: string | null;
  now?: Date;
  ipAddress?: string;
  idempotencyKey?: string | null;
}

export interface RefundReportResult {
  success: true;
  feedbackId: string;
  claimId: string;
  leadId: string;
  developerId: string;
  status: 'PENDING_MANUAL_REVIEW';
  targetReviewHours: 24;
  reason: string;
  comment: string | null;
  submittedAt: Date;
}

/**
 * Validates the Section 15 / FIN-04 refund dispute guardrails:
 * 1. Minimum 30-minute wait after claim before a refund report can be submitted.
 * 2. Monthly refund report cap for trial/free users (max 2 reports per rolling 30 days).
 */
export async function validateRefundReportGuardrails(params: {
  claim: { id: string; claimedAt: Date; userId: string; status: string };
  user: {
    id: string;
    subscription?: { plan?: { slug?: string; priceEgp?: number } | null } | null;
  };
  now?: Date;
  prismaClient?: any;
}) {
  const { claim, user, now = new Date(), prismaClient = prisma } = params;

  if (claim.status !== 'ACTIVE') {
    throw new ClaimEngineError(
      'CLAIM_NOT_FOUND',
      `Cannot report on a claim with status ${claim.status}`,
      422
    );
  }

  // 1. Enforce minimum 30-minute wait after claiming before a report can be submitted
  const claimAgeMs = now.getTime() - new Date(claim.claimedAt).getTime();
  if (claimAgeMs < MIN_REFUND_REPORT_WAIT_MS) {
    const remainingMinutes = Math.max(1, Math.ceil((MIN_REFUND_REPORT_WAIT_MS - claimAgeMs) / (60 * 1000)));
    throw new ClaimEngineError(
      'WAIT_PERIOD_REQUIRED',
      `يجب الانتظار لمدة 30 دقيقة على الأقل بعد استلام الفرصة ومحاولة التواصل قبل تقديم تقرير استرداد. يرجى المحاولة بعد ${remainingMinutes} دقيقة.`,
      422,
      {
        claimId: claim.id,
        claimedAt: claim.claimedAt,
        claimAgeMs,
        minWaitMs: MIN_REFUND_REPORT_WAIT_MS,
        remainingMinutes,
      }
    );
  }

  // 2. Enforce trial user monthly cap (max 2 reports per rolling 30 days)
  const isTrialUser =
    !user.subscription?.plan ||
    user.subscription.plan.slug === 'free' ||
    user.subscription.plan.priceEgp === 0;

  if (isTrialUser) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const existingReportsCount = await prismaClient.leadFeedback.count({
      where: {
        userId: user.id,
        useful: false,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    if (existingReportsCount >= MAX_TRIAL_REFUND_REPORTS_PER_MONTH) {
      throw new ClaimEngineError(
        'TRIAL_REFUND_LIMIT_EXCEEDED',
        `تم استنفاد الحد الأقصى لتقارير الاسترداد المتاحة للباقة المجانية (${MAX_TRIAL_REFUND_REPORTS_PER_MONTH} تقارير شهريًا).`,
        422,
        {
          userId: user.id,
          reportsSubmittedLast30Days: existingReportsCount,
          maxAllowedPerMonth: MAX_TRIAL_REFUND_REPORTS_PER_MONTH,
        }
      );
    }
  }

  // 3. Enforce only ONE active refund report per claim
  const existingActiveReport = await prismaClient.leadFeedback.findFirst({
    where: {
      claimId: claim.id,
      type: 'REFUND_REPORT',
    },
  });

  if (existingActiveReport) {
    throw new ClaimEngineError(
      'REFUND_REPORT_ALREADY_EXISTS',
      'يوجد بالفعل تقرير استرداد مسجل لهذه الفرصة قيد المراجعة.',
      409,
      {
        claimId: claim.id,
        existingReportId: existingActiveReport.id,
        createdAt: existingActiveReport.createdAt,
      }
    );
  }
}

/**
 * Submits a developer refund report for manual review (target 24 hours).
 * Enforces minimum 30 minutes claim age and trial monthly cap.
 * Does NOT auto-refund credits — keeps dispute pending for admin review.
 */
export async function submitClaimRefundReport(
  input: SubmitRefundReportInput
): Promise<RefundReportResult> {
  const { claimId, developerId, reason, comment, now = new Date(), ipAddress, idempotencyKey } = input;

  if (!claimId || typeof claimId !== 'string') {
    throw new ClaimEngineError('CLAIM_NOT_FOUND', 'claimId is required', 404);
  }
  if (!reason || reason.trim().length === 0) {
    throw new ClaimEngineError('INVALID_REFUND_REQUEST', 'A valid report reason is required', 422);
  }

  return withResourceLocks([`developer:${developerId}`, `claim:${claimId}`], async () => {
    return prisma.$transaction(async (tx) => {
      const claim = await tx.leadClaim.findUnique({
        where: { id: claimId },
        include: {
          lead: true,
          user: {
            include: {
              subscription: { include: { plan: true } },
            },
          },
        },
      });

      if (!claim || (claim.developerId !== developerId && claim.userId !== developerId)) {
        throw new ClaimEngineError('CLAIM_NOT_FOUND', 'Claim not found or unauthorized', 404);
      }

      await validateRefundReportGuardrails({
        claim,
        user: claim.user,
        now,
        prismaClient: tx,
      });

      // Create a pending review feedback/report entry (no auto-refund, manual review target 24h)
      let feedback;
      try {
        feedback = await tx.leadFeedback.create({
          data: {
            leadId: claim.leadId,
            userId: developerId,
            developerId,
            claimId: claim.id,
            useful: false,
            reasonCode: reason.trim(),
            category: 'LEAD_QUALITY',
            type: 'REFUND_REPORT',
            comment: comment?.trim() || null,
            note: comment?.trim() || null,
            metadata: {
              refundRequested: true,
              status: 'PENDING_MANUAL_REVIEW',
              targetReviewHours: 24,
              reportSubmittedAt: now.toISOString(),
              ipAddress: ipAddress ?? null,
              idempotencyKey: idempotencyKey ?? null,
            },
          },
        });
      } catch (err: any) {
        if (
          err?.code === 'P2002' ||
          err?.message?.includes('Unique constraint failed') ||
          err?.message?.includes('idx_lead_feedback_unique_claim_refund_report')
        ) {
          throw new ClaimEngineError(
            'REFUND_REPORT_ALREADY_EXISTS',
            'يوجد بالفعل تقرير استرداد مسجل لهذه الفرصة قيد المراجعة.',
            409,
            {
              claimId: claim.id,
              error: 'UNIQUE_CONSTRAINT_VIOLATION',
            }
          );
        }
        throw err;
      }

      await createAuditLog(
        {
          userId: developerId,
          action: 'CLAIM_REFUND_REPORTED',
          entityType: 'LeadClaim',
          entityId: claim.id,
          details: {
            claimId: claim.id,
            leadId: claim.leadId,
            developerId,
            reason: reason.trim(),
            status: 'PENDING_MANUAL_REVIEW',
            targetReviewHours: 24,
          },
          ipAddress,
        },
        tx as unknown as PrismaClient
      );

      return {
        success: true as const,
        feedbackId: feedback.id,
        claimId: claim.id,
        leadId: claim.leadId,
        developerId,
        status: 'PENDING_MANUAL_REVIEW' as const,
        targetReviewHours: 24 as const,
        reason: reason.trim(),
        comment: comment?.trim() || null,
        submittedAt: now,
      };
    });
  });
}


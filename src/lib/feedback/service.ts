import {
  ContactAttemptResult,
  ContactChannel,
  EngagementStatus,
  FeedbackCategory,
  LeadClaim,
  LeadEngagement,
  PipelineStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { createAuditLog } from '../audit';
import { withResourceLocks } from '../claims/locks';
import { prisma } from '../db';
import { createInAppNotification } from '../notifications';
import {
  evaluateContactAttemptRateLimit,
  evaluateFeedbackAbuse,
  evaluateStatusChangeAbuse,
} from './abuse-protection';
import {
  emitQualityReverificationSignal,
  resolveFeedbackSourceConfidence,
} from './quality-integration';
import {
  getAllowedNextStatuses,
  isTerminalEngagementStatus,
  isValidEngagementStatus,
  parseAndValidateTimestamp,
  validateChronologicalTimestamps,
  validateOutcomePayload,
  validateStateTransition,
} from './state-machine';
import {
  AdminCorrectEngagementStatusInput,
  ALL_STRUCTURED_FEEDBACK_REASON_CODES,
  EngagementEngineError,
  FEEDBACK_REASON_CODES_BY_CATEGORY,
  RecordContactAttemptInput,
  SubmitStructuredFeedbackInput,
  UpdateEngagementStatusInput,
  VALID_CONTACT_ATTEMPT_RESULTS,
  VALID_CONTACT_CHANNELS,
} from './types';

type DbClient = PrismaClient | Prisma.TransactionClient;

function validateIdempotencyKey(rawKey?: string | null): string | undefined {
  if (rawKey === undefined || rawKey === null) return undefined;
  if (
    typeof rawKey !== 'string' ||
    rawKey.trim().length === 0 ||
    rawKey.trim().length > 128 ||
    /[\r\n\0]/.test(rawKey)
  ) {
    throw new EngagementEngineError(
      'INVALID_FEEDBACK',
      'idempotencyKey must be a non-empty string up to 128 characters',
      422
    );
  }
  return rawKey.trim();
}

function mapPipelineToEngagementStatus(
  pipelineStatus: PipelineStatus | EngagementStatus | string
): EngagementStatus {
  if (pipelineStatus === 'NEW') return 'CLAIMED';
  return pipelineStatus as EngagementStatus;
}

function mapEngagementToPipelineStatus(engagementStatus: EngagementStatus): PipelineStatus {
  return engagementStatus as PipelineStatus;
}

/**
 * Ensures a `LeadEngagement` record exists for a given `LeadClaim`.
 */
export async function ensureLeadEngagement(
  db: DbClient,
  claim: LeadClaim
): Promise<LeadEngagement> {
  const existing = await db.leadEngagement.findUnique({
    where: {
      leadId_developerId: {
        leadId: claim.leadId,
        developerId: claim.userId,
      },
    },
  });

  if (existing) {
    if (existing.claimId !== claim.id) {
      return db.leadEngagement.update({
        where: { id: existing.id },
        data: { claimId: claim.id },
      });
    }
    return existing;
  }

  return db.leadEngagement.create({
    data: {
      leadId: claim.leadId,
      developerId: claim.userId,
      claimId: claim.id,
      currentStatus: mapPipelineToEngagementStatus(claim.pipelineStatus),
      claimedAt: claim.claimedAt,
      lastContactedAt: claim.lastContactedAt,
    },
  });
}

/**
 * Updates the developer-specific engagement lifecycle status for a claimed lead.
 * Enforces:
 * - Active claim ownership
 * - Deterministic state machine transitions & terminal state locking
 * - Outcome requirements (WON, LOST, INVALID, NOT_INTERESTED)
 * - Chronological timestamp validation
 * - Idempotency & concurrency locking
 * - Non-destructive Phase 3 reverification signal on INVALID outcome
 * - Abuse & rapid status change detection
 */
export async function updateEngagementStatus(input: UpdateEngagementStatusInput) {
  const {
    leadId,
    developerId,
    status: targetStatus,
    reasonCode,
    note,
    notes,
    estimatedProjectValue,
    currency,
    wonReason,
    wonAt,
    contactedAt,
    repliedAt,
    interestedAt,
    meetingAt,
    proposalSentAt,
    negotiationAt,
    lostAt,
    invalidAt,
    notInterestedAt,
    nextFollowUpAt,
    idempotencyKey,
    ipAddress,
  } = input;

  if (!developerId || typeof developerId !== 'string') {
    throw new EngagementEngineError('UNAUTHORIZED', 'Authentication is required', 401);
  }
  if (!leadId || typeof leadId !== 'string') {
    throw new EngagementEngineError('ENGAGEMENT_NOT_FOUND', 'Lead ID is required', 404);
  }
  if (!isValidEngagementStatus(targetStatus)) {
    throw new EngagementEngineError(
      'INVALID_STATUS_TRANSITION',
      `Invalid engagement status: ${String(targetStatus)}`,
      422,
      { targetStatus }
    );
  }

  const normalizedIdempotencyKey = validateIdempotencyKey(idempotencyKey);
  const effectiveNote = (note ?? notes)?.trim() || null;

  return withResourceLocks([`engagement:${developerId}:${leadId}`], async () => {
    return prisma.$transaction(async (tx) => {
      // 1. Idempotency check
      if (normalizedIdempotencyKey) {
        const existingHistory = await tx.leadStatusHistory.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: developerId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
          include: {
            engagement: true,
          },
        });

        if (existingHistory) {
          const existingNewStatus = mapPipelineToEngagementStatus(existingHistory.newStatus);
          if (
            existingHistory.leadId !== leadId ||
            existingNewStatus !== targetStatus
          ) {
            throw new EngagementEngineError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key was already used for a different status transition',
              409,
              {
                idempotencyKey: normalizedIdempotencyKey,
                existingLeadId: existingHistory.leadId,
                existingStatus: existingNewStatus,
                requestedLeadId: leadId,
                requestedStatus: targetStatus,
              }
            );
          }

          const currentEngagement =
            existingHistory.engagement ??
            (await tx.leadEngagement.findUniqueOrThrow({
              where: {
                leadId_developerId: { leadId, developerId },
              },
            }));

          return {
            success: true as const,
            idempotentReplay: true,
            engagement: currentEngagement,
            statusHistory: existingHistory,
            allowedNextStatuses: getAllowedNextStatuses(currentEngagement.currentStatus),
            qualitySignal: null,
            abuseFlags: [] as string[],
          };
        }
      }

      // 2. Claim Ownership & Active Status Verification
      const claim = await tx.leadClaim.findUnique({
        where: {
          leadId_userId: {
            leadId,
            userId: developerId,
          },
        },
        include: {
          lead: true,
          _count: {
            select: { contactAttempts: true },
          },
        },
      });

      if (!claim) {
        throw new EngagementEngineError(
          'CLAIM_REQUIRED',
          'You must have a claim on this lead before updating its engagement status',
          403,
          { leadId, developerId }
        );
      }

      if (claim.status !== 'ACTIVE' || claim.accessGranted === false) {
        throw new EngagementEngineError(
          'CLAIM_NOT_ACTIVE',
          `Cannot update engagement status because your claim status is ${claim.status}`,
          422,
          { leadId, claimId: claim.id, claimStatus: claim.status }
        );
      }

      // 3. Ensure LeadEngagement exists
      const engagement = await ensureLeadEngagement(tx, claim);
      const currentStatus = engagement.currentStatus;

      // 4. Validate State Machine Transition
      validateStateTransition(currentStatus, targetStatus);

      // 5. Validate Outcome Fields (WON, LOST, INVALID, NOT_INTERESTED)
      const outcomeFields = validateOutcomePayload({
        targetStatus,
        reasonCode,
        note: effectiveNote,
        estimatedProjectValue,
        currency,
        wonReason,
      });

      // 6. Parse & Validate Chronological Timestamps
      const now = new Date();
      const parsedContactedAt = parseAndValidateTimestamp(contactedAt, 'contactedAt', now);
      const parsedRepliedAt = parseAndValidateTimestamp(repliedAt, 'repliedAt', now);
      const parsedInterestedAt = parseAndValidateTimestamp(interestedAt, 'interestedAt', now);
      const parsedMeetingAt = parseAndValidateTimestamp(meetingAt, 'meetingAt', now);
      const parsedProposalSentAt = parseAndValidateTimestamp(proposalSentAt, 'proposalSentAt', now);
      const parsedNegotiationAt = parseAndValidateTimestamp(negotiationAt, 'negotiationAt', now);
      const parsedWonAt = parseAndValidateTimestamp(wonAt, 'wonAt', now);
      const parsedLostAt = parseAndValidateTimestamp(lostAt, 'lostAt', now);
      const parsedInvalidAt = parseAndValidateTimestamp(invalidAt, 'invalidAt', now);
      const parsedNotInterestedAt = parseAndValidateTimestamp(
        notInterestedAt,
        'notInterestedAt',
        now
      );

      const nextFirstContactedAt =
        parsedContactedAt ??
        engagement.firstContactedAt ??
        (targetStatus === 'CONTACTED' ? now : null);

      const nextLastContactedAt =
        parsedContactedAt ??
        (targetStatus === 'CONTACTED' ||
        targetStatus === 'REPLIED' ||
        targetStatus === 'INTERESTED' ||
        targetStatus === 'MEETING' ||
        targetStatus === 'PROPOSAL_SENT' ||
        targetStatus === 'NEGOTIATION' ||
        targetStatus === 'WON'
          ? now
          : engagement.lastContactedAt);

      const nextFirstRepliedAt =
        parsedRepliedAt ??
        engagement.firstRepliedAt ??
        (targetStatus === 'REPLIED' ? now : null);

      const nextInterestedAt =
        parsedInterestedAt ??
        engagement.interestedAt ??
        (targetStatus === 'INTERESTED' ? now : null);

      const nextMeetingAt =
        parsedMeetingAt ??
        engagement.meetingAt ??
        (targetStatus === 'MEETING' ? now : null);

      const nextProposalSentAt =
        parsedProposalSentAt ??
        engagement.proposalSentAt ??
        (targetStatus === 'PROPOSAL_SENT' ? now : null);

      const nextNegotiationAt =
        parsedNegotiationAt ??
        engagement.negotiationAt ??
        (targetStatus === 'NEGOTIATION' ? now : null);

      const nextWonAt =
        parsedWonAt ?? engagement.wonAt ?? (targetStatus === 'WON' ? now : null);
      const nextLostAt =
        parsedLostAt ?? engagement.lostAt ?? (targetStatus === 'LOST' ? now : null);
      const nextInvalidAt =
        parsedInvalidAt ??
        engagement.invalidAt ??
        (targetStatus === 'INVALID' ? now : null);
      const nextNotInterestedAt =
        parsedNotInterestedAt ??
        engagement.notInterestedAt ??
        (targetStatus === 'NOT_INTERESTED' ? now : null);

      validateChronologicalTimestamps({
        claimedAt: engagement.claimedAt,
        firstContactedAt: nextFirstContactedAt,
        lastContactedAt: nextLastContactedAt,
        firstRepliedAt: nextFirstRepliedAt,
        interestedAt: nextInterestedAt,
        meetingAt: nextMeetingAt,
        proposalSentAt: nextProposalSentAt,
        negotiationAt: nextNegotiationAt,
        wonAt: nextWonAt,
        lostAt: nextLostAt,
        invalidAt: nextInvalidAt,
        notInterestedAt: nextNotInterestedAt,
      });

      // 7. Abuse & Rate Limit Evaluation
      const abuseEval = await evaluateStatusChangeAbuse(tx, {
        developerId,
        leadId,
        engagementId: engagement.id,
        previousStatus: currentStatus,
        targetStatus,
        hasContactAttempts: claim._count.contactAttempts > 0 || Boolean(engagement.firstContactedAt),
        claimedAt: engagement.claimedAt,
        now,
      });

      // 8. Persist LeadEngagement Update
      const isTargetTerminal = isTerminalEngagementStatus(targetStatus);
      const nextClosedAt = isTargetTerminal
        ? nextWonAt ?? nextLostAt ?? nextInvalidAt ?? nextNotInterestedAt ?? now
        : null;
      const mergedEngagementFlags = Array.from(
        new Set([...(engagement.flags ?? []), ...abuseEval.flags])
      );

      const updatedEngagement = await tx.leadEngagement.update({
        where: { id: engagement.id },
        data: {
          currentStatus: targetStatus,
          firstContactedAt: nextFirstContactedAt,
          lastContactedAt: nextLastContactedAt,
          firstRepliedAt: nextFirstRepliedAt,
          interestedAt: nextInterestedAt,
          meetingAt: nextMeetingAt,
          proposalSentAt: nextProposalSentAt,
          negotiationAt: nextNegotiationAt,
          wonAt: nextWonAt,
          lostAt: nextLostAt,
          invalidAt: nextInvalidAt,
          invalidatedAt: nextInvalidAt,
          notInterestedAt: nextNotInterestedAt,
          closedAt: nextClosedAt,
          isTerminal: isTargetTerminal,
          finalOutcome: outcomeFields.finalOutcome,
          outcomeReasonCode: outcomeFields.outcomeReasonCode,
          outcomeReasonNote: outcomeFields.outcomeReasonNote,
          outcomeNote: outcomeFields.outcomeReasonNote,
          estimatedProjectValue:
            outcomeFields.estimatedProjectValue ?? engagement.estimatedProjectValue,
          currency: outcomeFields.currency,
          wonReason: outcomeFields.wonReason ?? engagement.wonReason,
          lostReasonCode: outcomeFields.lostReasonCode ?? engagement.lostReasonCode,
          lostReasonNote: outcomeFields.lostReasonNote ?? engagement.lostReasonNote,
          invalidReasonCode: outcomeFields.invalidReasonCode ?? engagement.invalidReasonCode,
          invalidReasonNote: outcomeFields.invalidReasonNote ?? engagement.invalidReasonNote,
          flags: mergedEngagementFlags,
        },
      });

      // Sync LeadClaim pipelineStatus for backward compatibility
      const mappedPipelineStatus = mapEngagementToPipelineStatus(targetStatus);
      const parsedNextFollowUp =
        nextFollowUpAt !== undefined
          ? nextFollowUpAt
            ? new Date(nextFollowUpAt)
            : null
          : claim.nextFollowUpAt;

      await tx.leadClaim.update({
        where: { id: claim.id },
        data: {
          pipelineStatus: mappedPipelineStatus,
          lastContactedAt: nextLastContactedAt,
          nextFollowUpAt: parsedNextFollowUp,
          notes: effectiveNote !== null ? effectiveNote : claim.notes,
        },
      });

      // 9. Append Immutable LeadStatusHistory Entry
      const statusHistory = await tx.leadStatusHistory.create({
        data: {
          claimId: claim.id,
          engagementId: engagement.id,
          leadId,
          userId: developerId,
          developerId,
          previousStatus: mapEngagementToPipelineStatus(currentStatus),
          newStatus: mappedPipelineStatus,
          reasonCode: outcomeFields.outcomeReasonCode,
          note: effectiveNote,
          notes: effectiveNote,
          actorType: 'DEVELOPER',
          actorId: developerId,
          idempotencyKey: normalizedIdempotencyKey ?? null,
          metadata: {
            previousEngagementStatus: currentStatus,
            newEngagementStatus: targetStatus,
            estimatedProjectValue: outcomeFields.estimatedProjectValue,
            currency: outcomeFields.currency,
            abuseFlags: abuseEval.flags,
            ipAddress: ipAddress ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      // 10. Non-Destructive Phase 3 Quality Reverification Signal on INVALID or LOST with contact/business issue
      let qualitySignal = null;
      if (
        targetStatus === 'INVALID' ||
        (targetStatus === 'LOST' &&
          outcomeFields.outcomeReasonCode &&
          ['WRONG_CONTACT', 'WRONG_BUSINESS', 'BUSINESS_CLOSED', 'DUPLICATE'].includes(
            outcomeFields.outcomeReasonCode
          ))
      ) {
        const categoryForSignal: FeedbackCategory =
          outcomeFields.outcomeReasonCode === 'WRONG_PHONE' ||
          outcomeFields.outcomeReasonCode === 'WRONG_EMAIL' ||
          outcomeFields.outcomeReasonCode === 'WRONG_CONTACT'
            ? 'CONTACT'
            : outcomeFields.outcomeReasonCode === 'DUPLICATE'
            ? 'LEAD_QUALITY'
            : 'BUSINESS';

        await tx.leadFeedback.create({
          data: {
            leadId,
            userId: developerId,
            developerId,
            claimId: claim.id,
            engagementId: engagement.id,
            useful: false,
            reason: null, // Keep legacy reason null so Phase 3 single-report doesn't hard-fail trusted data
            category: categoryForSignal,
            reasonCode: outcomeFields.outcomeReasonCode,
            confidence: 'MEDIUM',
            comment: effectiveNote,
            note: effectiveNote,
            flags: abuseEval.flags,
            metadata: {
              triggeredByStatus: targetStatus,
              nonDestructiveSignal: true,
            } as Prisma.InputJsonValue,
          },
        });

        qualitySignal = await emitQualityReverificationSignal(tx, {
          leadId,
          developerId,
          reasonCode: outcomeFields.outcomeReasonCode,
          note: effectiveNote,
        });
      }

      // 11. Audit Logs & Notifications
      await createAuditLog(
        {
          userId: developerId,
          action: 'STATUS_CHANGED',
          entityType: 'LeadEngagement',
          entityId: engagement.id,
          details: {
            leadId,
            claimId: claim.id,
            engagementId: engagement.id,
            previousStatus: currentStatus,
            newStatus: targetStatus,
            reasonCode: outcomeFields.outcomeReasonCode,
            note: effectiveNote,
          },
          ipAddress,
        },
        tx as unknown as PrismaClient
      );

      if (isTerminalEngagementStatus(targetStatus)) {
        await createAuditLog(
          {
            userId: developerId,
            action: 'OUTCOME_RECORDED',
            entityType: 'LeadEngagement',
            entityId: engagement.id,
            details: {
              leadId,
              claimId: claim.id,
              engagementId: engagement.id,
              finalOutcome: targetStatus,
              reasonCode: outcomeFields.outcomeReasonCode,
              note: effectiveNote,
              estimatedProjectValue: outcomeFields.estimatedProjectValue,
              currency: outcomeFields.currency,
            },
            ipAddress,
          },
          tx as unknown as PrismaClient
        );
      }

      if (targetStatus === 'INVALID') {
        await createAuditLog(
          {
            userId: developerId,
            action: 'INVALID_LEAD_REPORTED',
            entityType: 'Lead',
            entityId: leadId,
            details: {
              leadId,
              claimId: claim.id,
              engagementId: engagement.id,
              developerId,
              invalidReasonCode: outcomeFields.invalidReasonCode,
              invalidReasonNote: outcomeFields.invalidReasonNote,
              qualitySignal,
              trustedSourceDataPreserved: true,
            },
            ipAddress,
          },
          tx as unknown as PrismaClient
        );
      }

      if (targetStatus === 'WON') {
        await createInAppNotification(
          {
            userId: developerId,
            title: 'مبارك! إغلاق صفقة ناجحة (WON)',
            message: `A lead you claimed was marked WON — تم تسجيل صفقة ناجحة مع "${claim.lead.businessName}".`,
            type: 'LEAD_WON',
            link: `/leads/${leadId}`,
          },
          tx as unknown as PrismaClient
        );
      }

      return {
        success: true as const,
        idempotentReplay: false,
        engagement: updatedEngagement,
        statusHistory,
        allowedNextStatuses: getAllowedNextStatuses(updatedEngagement.currentStatus),
        qualitySignal,
        abuseFlags: abuseEval.flags,
      };
    });
  });
}

function resolveFeedbackCategoryAndReason(params: {
  category?: FeedbackCategory | string | null;
  reasonCode?: string | null;
  comment?: string | null;
}): {
  category: FeedbackCategory;
  reasonCode: string;
} {
  const rawCategory = params.category?.trim().toUpperCase() as FeedbackCategory | undefined;
  const rawReasonCode = params.reasonCode?.trim().toUpperCase();

  if (!rawReasonCode) {
    throw new EngagementEngineError(
      'INVALID_REASON',
      'A structured reasonCode is required when submitting feedback',
      422
    );
  }

  const validCategories: FeedbackCategory[] = ['CONTACT', 'BUSINESS', 'SALES', 'LEAD_QUALITY'];
  if (rawCategory && !validCategories.includes(rawCategory)) {
    throw new EngagementEngineError(
      'INVALID_FEEDBACK',
      `Invalid feedback category: ${rawCategory}`,
      422,
      { category: rawCategory, validCategories }
    );
  }

  if (!ALL_STRUCTURED_FEEDBACK_REASON_CODES.has(rawReasonCode)) {
    throw new EngagementEngineError(
      'INVALID_REASON',
      `Invalid feedback reasonCode: ${rawReasonCode}`,
      422,
      { reasonCode: rawReasonCode }
    );
  }

  let resolvedCategory: FeedbackCategory = rawCategory ?? 'LEAD_QUALITY';
  if (rawCategory) {
    const allowedInCat = FEEDBACK_REASON_CODES_BY_CATEGORY[rawCategory];
    if (!allowedInCat.includes(rawReasonCode) && rawReasonCode !== 'OTHER') {
      throw new EngagementEngineError(
        'INVALID_REASON',
        `reasonCode ${rawReasonCode} is not valid for category ${rawCategory}`,
        422,
        {
          category: rawCategory,
          reasonCode: rawReasonCode,
          allowedReasonCodes: allowedInCat,
        }
      );
    }
  } else {
    for (const cat of validCategories) {
      if (FEEDBACK_REASON_CODES_BY_CATEGORY[cat].includes(rawReasonCode)) {
        resolvedCategory = cat;
        break;
      }
    }
  }

  if (rawReasonCode === 'OTHER' && (!params.comment || params.comment.trim().length === 0)) {
    throw new EngagementEngineError(
      'INVALID_REASON',
      'A non-empty comment/note is required when feedback reasonCode is OTHER',
      422,
      { reasonCode: 'OTHER' }
    );
  }

  return {
    category: resolvedCategory,
    reasonCode: rawReasonCode,
  };
}

/**
 * Submits structured Phase 6 developer feedback (`CONTACT`, `BUSINESS`, `SALES`, `LEAD_QUALITY`).
 * Enforces:
 * - Active claim ownership
 * - Category, reasonCode, and optional 1..5 rating validation
 * - Idempotency & business-semantic duplicate suppression
 * - Source confidence weighting (LOW, MEDIUM, HIGH)
 * - Non-destructive Phase 3 reverification signals
 * - Abuse & volume flagging
 */
export async function submitLeadFeedback(input: SubmitStructuredFeedbackInput) {
  const {
    leadId,
    developerId,
    category: rawCategory,
    reasonCode: rawReasonCode,
    rating,
    comment,
    note,
    useful,
    sourceType,
    metadata,
    idempotencyKey,
    ipAddress,
  } = input;

  if (!developerId || typeof developerId !== 'string') {
    throw new EngagementEngineError('UNAUTHORIZED', 'Authentication is required', 401);
  }
  if (!leadId || typeof leadId !== 'string') {
    throw new EngagementEngineError('ENGAGEMENT_NOT_FOUND', 'Lead ID is required', 404);
  }

  const normalizedIdempotencyKey = validateIdempotencyKey(idempotencyKey);
  const effectiveComment = (comment ?? note)?.trim() || null;

  if (rating !== undefined && rating !== null) {
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new EngagementEngineError(
        'INVALID_FEEDBACK',
        'rating must be an integer between 1 and 5',
        422,
        { rating }
      );
    }
  }

  const { category, reasonCode } = resolveFeedbackCategoryAndReason({
    category: rawCategory,
    reasonCode: rawReasonCode,
    comment: effectiveComment,
  });

  return withResourceLocks([`feedback:${developerId}:${leadId}`], async () => {
    return prisma.$transaction(async (tx) => {
      // 1. Idempotency check
      if (normalizedIdempotencyKey) {
        const existingByIdempotency = await tx.leadFeedback.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: developerId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
        });

        if (existingByIdempotency) {
          if (
            existingByIdempotency.leadId !== leadId ||
            existingByIdempotency.reasonCode !== reasonCode ||
            existingByIdempotency.category !== category
          ) {
            throw new EngagementEngineError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key was already used for a different feedback event',
              409,
              {
                idempotencyKey: normalizedIdempotencyKey,
                existingLeadId: existingByIdempotency.leadId,
                existingReasonCode: existingByIdempotency.reasonCode,
                requestedLeadId: leadId,
                requestedReasonCode: reasonCode,
              }
            );
          }

          return {
            success: true as const,
            idempotentReplay: true,
            feedback: existingByIdempotency,
            qualitySignal: null,
            abuseFlags: [] as string[],
          };
        }
      }

      // 2. Claim Ownership & Active Status Verification
      const claim = await tx.leadClaim.findUnique({
        where: {
          leadId_userId: {
            leadId,
            userId: developerId,
          },
        },
      });

      if (!claim) {
        throw new EngagementEngineError(
          'CLAIM_REQUIRED',
          'You must claim this lead before submitting feedback',
          403,
          { leadId, developerId }
        );
      }

      if (claim.status !== 'ACTIVE' || claim.accessGranted === false) {
        throw new EngagementEngineError(
          'CLAIM_NOT_ACTIVE',
          `Cannot submit feedback because your claim status is ${claim.status}`,
          422,
          { leadId, claimId: claim.id, claimStatus: claim.status }
        );
      }

      const engagement = await ensureLeadEngagement(tx, claim);

      // 3. Business-semantic duplicate suppression (same developer, lead, category, reasonCode, comment)
      const duplicateSemantic = await tx.leadFeedback.findFirst({
        where: {
          leadId,
          userId: developerId,
          category,
          reasonCode,
          comment: effectiveComment,
        },
      });

      if (duplicateSemantic) {
        await createAuditLog(
          {
            userId: developerId,
            action: 'FEEDBACK_FLAGGED',
            entityType: 'LeadFeedback',
            entityId: duplicateSemantic.id,
            details: {
              leadId,
              developerId,
              engagementId: engagement.id,
              category,
              reasonCode,
              flags: ['DUPLICATE_FEEDBACK'],
            },
            ipAddress,
          },
          tx as unknown as PrismaClient
        );

        throw new EngagementEngineError(
          'DUPLICATE_EVENT',
          `Duplicate feedback event (${category}:${reasonCode}) already exists for this lead`,
          409,
          {
            existingFeedbackId: duplicateSemantic.id,
            category,
            reasonCode,
            flags: ['DUPLICATE_FEEDBACK'],
          }
        );
      }

      // 4. Abuse & Volume Check
      const abuseEval = await evaluateFeedbackAbuse(tx, {
        developerId,
        leadId,
        engagementId: engagement.id,
        category,
        reasonCode,
      });

      // 5. Phase 3 Quality Signal & Confidence Weighting
      const qualitySignal = await emitQualityReverificationSignal(tx, {
        leadId,
        developerId,
        reasonCode,
        note: effectiveComment,
        explicitSourceType: sourceType,
      });

      const resolvedConfidence = qualitySignal.signalTriggered
        ? qualitySignal.confidence
        : resolveFeedbackSourceConfidence({
            sourceType,
            corroboratingDevelopersCount: 1,
            hasStructuredReason: reasonCode !== 'OTHER',
          }).confidence;

      const positiveReasonSet = new Set([
        'PHONE_ANSWERED',
        'CONTACT_SUCCESSFUL',
        'WHATSAPP_ACTIVE',
        'EMAIL_VALID',
        'BUSINESS_OPEN',
        'NO_WEBSITE_CONFIRMED',
        'INTERESTED',
        'HIGH_INTEREST',
        'REQUESTED_QUOTE',
        'MEETING_BOOKED',
        'GREAT_LEAD',
        'GOOD_LEAD',
        'HIGH_QUALITY_LEAD',
      ]);
      const inferredUseful =
        useful !== undefined && useful !== null
          ? Boolean(useful)
          : positiveReasonSet.has(reasonCode) || (rating !== undefined && rating !== null && rating >= 4);

      if (abuseEval.flags.length > 0) {
        const mergedFlags = Array.from(
          new Set([...(engagement.flags ?? []), ...abuseEval.flags])
        );
        await tx.leadEngagement.update({
          where: { id: engagement.id },
          data: { flags: mergedFlags },
        });
      }

      // 6. Create LeadFeedback Entry
      const feedback = await tx.leadFeedback.create({
        data: {
          leadId,
          userId: developerId,
          developerId,
          claimId: claim.id,
          engagementId: engagement.id,
          useful: inferredUseful,
          reason: null, // Non-destructive: keep legacy enum null unless invoked via legacy helper
          category,
          reasonCode,
          rating: rating ?? null,
          confidence: resolvedConfidence,
          comment: effectiveComment,
          note: effectiveComment,
          flags: abuseEval.flags,
          idempotencyKey: normalizedIdempotencyKey ?? null,
          metadata: {
            ...(metadata ?? {}),
            sourceType: qualitySignal.sourceType,
            abuseFlags: abuseEval.flags,
            qualitySignalTriggered: qualitySignal.signal,
            ipAddress: ipAddress ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      await createAuditLog(
        {
          userId: developerId,
          action: 'FEEDBACK_CREATED',
          entityType: 'LeadFeedback',
          entityId: feedback.id,
          details: {
            leadId,
            claimId: claim.id,
            engagementId: engagement.id,
            category,
            reasonCode,
            rating: rating ?? null,
            confidence: resolvedConfidence,
            qualitySignal: qualitySignal.signal,
          },
          ipAddress,
        },
        tx as unknown as PrismaClient
      );

      return {
        success: true as const,
        idempotentReplay: false,
        feedback,
        qualitySignal,
        abuseFlags: abuseEval.flags,
      };
    });
  });
}

/**
 * Records a developer contact attempt (`PHONE`, `WHATSAPP`, `EMAIL`, `SMS`, `SOCIAL`, `OTHER`).
 * Enforces active claim ownership, rate limits, chronological timestamp validity, and idempotency.
 */
export async function recordContactAttempt(input: RecordContactAttemptInput) {
  const {
    leadId,
    developerId,
    channel,
    result,
    note,
    attemptedAt,
    idempotencyKey,
    ipAddress,
  } = input;

  if (!developerId || typeof developerId !== 'string') {
    throw new EngagementEngineError('UNAUTHORIZED', 'Authentication is required', 401);
  }
  if (!leadId || typeof leadId !== 'string') {
    throw new EngagementEngineError('ENGAGEMENT_NOT_FOUND', 'Lead ID is required', 404);
  }

  if (!VALID_CONTACT_CHANNELS.includes(channel)) {
    throw new EngagementEngineError(
      'INVALID_FEEDBACK',
      `Invalid contact channel: ${String(channel)}`,
      422,
      { channel, validChannels: VALID_CONTACT_CHANNELS }
    );
  }

  if (!VALID_CONTACT_ATTEMPT_RESULTS.includes(result)) {
    throw new EngagementEngineError(
      'INVALID_FEEDBACK',
      `Invalid contact attempt result: ${String(result)}`,
      422,
      { result, validResults: VALID_CONTACT_ATTEMPT_RESULTS }
    );
  }

  const normalizedIdempotencyKey = validateIdempotencyKey(idempotencyKey);
  const now = new Date();
  const parsedAttemptedAt = parseAndValidateTimestamp(attemptedAt, 'attemptedAt', now) ?? now;
  const trimmedNote = note?.trim() || null;

  return withResourceLocks([`engagement:${developerId}:${leadId}`], async () => {
    return prisma.$transaction(async (tx) => {
      // 1. Idempotency check
      if (normalizedIdempotencyKey) {
        const existingAttempt = await tx.contactAttempt.findUnique({
          where: {
            developerId_idempotencyKey: {
              developerId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
        });

        if (existingAttempt) {
          if (
            existingAttempt.leadId !== leadId ||
            existingAttempt.channel !== channel ||
            existingAttempt.result !== result
          ) {
            throw new EngagementEngineError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key was already used for a different contact attempt',
              409,
              {
                idempotencyKey: normalizedIdempotencyKey,
                existingLeadId: existingAttempt.leadId,
                requestedLeadId: leadId,
              }
            );
          }

          return {
            success: true as const,
            idempotentReplay: true,
            contactAttempt: existingAttempt,
          };
        }
      }

      // 2. Claim Ownership & Active Check
      const claim = await tx.leadClaim.findUnique({
        where: {
          leadId_userId: {
            leadId,
            userId: developerId,
          },
        },
      });

      if (!claim) {
        throw new EngagementEngineError(
          'CLAIM_REQUIRED',
          'You must claim this lead before recording contact attempts',
          403,
          { leadId, developerId }
        );
      }

      if (claim.status !== 'ACTIVE' || claim.accessGranted === false) {
        throw new EngagementEngineError(
          'CLAIM_NOT_ACTIVE',
          `Cannot record contact attempt because your claim status is ${claim.status}`,
          422,
          { leadId, claimId: claim.id, claimStatus: claim.status }
        );
      }

      const engagement = await ensureLeadEngagement(tx, claim);

      if (parsedAttemptedAt.getTime() < engagement.claimedAt.getTime()) {
        throw new EngagementEngineError(
          'INVALID_TIMESTAMP',
          `attemptedAt (${parsedAttemptedAt.toISOString()}) cannot be earlier than claimedAt (${engagement.claimedAt.toISOString()})`,
          422,
          {
            attemptedAt: parsedAttemptedAt.toISOString(),
            claimedAt: engagement.claimedAt.toISOString(),
          }
        );
      }

      // 3. Rate limit check
      await evaluateContactAttemptRateLimit(tx, {
        developerId,
        leadId,
        engagementId: engagement.id,
        now,
      });

      // 4. Create ContactAttempt
      const contactAttempt = await tx.contactAttempt.create({
        data: {
          engagementId: engagement.id,
          claimId: claim.id,
          leadId,
          developerId,
          channel,
          result,
          note: trimmedNote,
          attemptedAt: parsedAttemptedAt,
          idempotencyKey: normalizedIdempotencyKey ?? null,
        },
      });

      // 5. Update Engagement & Claim contact timestamps
      const nextFirstContacted = engagement.firstContactedAt ?? parsedAttemptedAt;
      const nextLastContacted =
        !engagement.lastContactedAt ||
        parsedAttemptedAt.getTime() >= engagement.lastContactedAt.getTime()
          ? parsedAttemptedAt
          : engagement.lastContactedAt;

      await tx.leadEngagement.update({
        where: { id: engagement.id },
        data: {
          firstContactedAt: nextFirstContacted,
          lastContactedAt: nextLastContacted,
        },
      });

      await tx.leadClaim.update({
        where: { id: claim.id },
        data: {
          lastContactedAt: nextLastContacted,
        },
      });

      let qualitySignal = null;
      if (result === 'INVALID_NUMBER' || result === 'BOUNCED') {
        qualitySignal = await emitQualityReverificationSignal(tx, {
          leadId,
          developerId,
          reasonCode: result === 'INVALID_NUMBER' ? 'INVALID_NUMBER' : 'BOUNCED',
          note: trimmedNote,
          explicitSourceType: 'SINGLE_DEVELOPER_REPORT',
        });
      }

      await createAuditLog(
        {
          userId: developerId,
          action: 'CONTACT_ATTEMPT_CREATED',
          entityType: 'ContactAttempt',
          entityId: contactAttempt.id,
          details: {
            leadId,
            claimId: claim.id,
            engagementId: engagement.id,
            channel,
            result,
            attemptedAt: parsedAttemptedAt.toISOString(),
            qualitySignal: qualitySignal?.signal ?? null,
          },
          ipAddress,
        },
        tx as unknown as PrismaClient
      );

      return {
        success: true as const,
        idempotentReplay: false,
        contactAttempt,
        qualitySignal,
      };
    });
  });
}

/**
 * Lists a developer's engagements with pagination and optional status filter.
 * Enforces strict developer ownership isolation and avoids N+1 queries.
 */
export async function getDeveloperEngagements(
  developerId: string,
  options?: {
    status?: EngagementStatus;
    leadId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 25));

  const where: Prisma.LeadEngagementWhereInput = {
    developerId,
    ...(options?.status ? { currentStatus: options.status } : {}),
    ...(options?.leadId ? { leadId: options.leadId } : {}),
  };

  const [engagements, total] = await Promise.all([
    prisma.leadEngagement.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            category: true,
            governorate: true,
            city: true,
            area: true,
            phone: true,
            email: true,
            website: true,
            websiteStatus: true,
            estimatedBudget: true,
            requiredService: true,
            leadType: true,
            accessType: true,
            status: true,
            saleabilityStatus: true,
            qualityScore: true,
            score: true,
          },
        },
        claim: {
          select: {
            id: true,
            status: true,
            accessType: true,
            accessGranted: true,
            creditsCharged: true,
            claimedAt: true,
          },
        },
        _count: {
          select: {
            statusHistories: true,
            contactAttempts: true,
            feedbacks: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.leadEngagement.count({ where }),
  ]);

  const formatted = engagements.map((eng) => {
    const canViewSensitive = eng.claim.status === 'ACTIVE' && eng.claim.accessGranted !== false;
    return {
      ...eng,
      allowedNextStatuses: getAllowedNextStatuses(eng.currentStatus),
      isTerminal: isTerminalEngagementStatus(eng.currentStatus),
      lead: canViewSensitive
        ? eng.lead
        : {
            ...eng.lead,
            phone: null,
            email: null,
            website: null,
          },
    };
  });

  return {
    engagements: formatted,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/**
 * Retrieves a single developer engagement by ID (or by leadId for the developer),
 * enforcing strict developer ownership isolation (`FORBIDDEN` 403 if owned by another developer).
 */
export async function getDeveloperEngagementById(
  developerId: string,
  engagementIdOrLeadId: string
) {
  let engagement = await prisma.leadEngagement.findUnique({
    where: { id: engagementIdOrLeadId },
    include: {
      lead: true,
      claim: true,
      statusHistories: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      },
      contactAttempts: {
        orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
        take: 50,
      },
      feedbacks: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      },
    },
  });

  if (!engagement) {
    engagement = await prisma.leadEngagement.findUnique({
      where: {
        leadId_developerId: {
          leadId: engagementIdOrLeadId,
          developerId,
        },
      },
      include: {
        lead: true,
        claim: true,
        statusHistories: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
        contactAttempts: {
          orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
        feedbacks: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
        },
      },
    });
  }

  if (!engagement) {
    throw new EngagementEngineError(
      'ENGAGEMENT_NOT_FOUND',
      'Engagement not found',
      404,
      { engagementId: engagementIdOrLeadId }
    );
  }

  if (engagement.developerId !== developerId) {
    throw new EngagementEngineError(
      'FORBIDDEN',
      'You are not authorized to access another developer’s lead engagement',
      403,
      { engagementId: engagement.id }
    );
  }

  const canViewSensitive =
    engagement.claim.status === 'ACTIVE' && engagement.claim.accessGranted !== false;

  return {
    ...engagement,
    allowedNextStatuses: getAllowedNextStatuses(engagement.currentStatus),
    isTerminal: isTerminalEngagementStatus(engagement.currentStatus),
    lead: canViewSensitive
      ? engagement.lead
      : {
          ...engagement.lead,
          address: null,
          phone: null,
          phones: [],
          email: null,
          website: null,
          facebook: null,
          instagram: null,
        },
  };
}

/**
 * Returns the unified chronological timeline for an engagement (status transitions, contact attempts, feedback).
 * Enforces strict developer ownership (unless `isAdmin === true`).
 */
export async function getEngagementTimeline(
  actorId: string,
  engagementId: string,
  options?: {
    isAdmin?: boolean;
    page?: number;
    pageSize?: number;
  }
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 50));

  const engagement = await prisma.leadEngagement.findUnique({
    where: { id: engagementId },
    include: {
      statusHistories: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
      contactAttempts: {
        orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
      },
      feedbacks: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
    },
  });

  if (!engagement) {
    throw new EngagementEngineError(
      'ENGAGEMENT_NOT_FOUND',
      'Engagement not found',
      404,
      { engagementId }
    );
  }

  if (!options?.isAdmin && engagement.developerId !== actorId) {
    throw new EngagementEngineError(
      'FORBIDDEN',
      'You are not authorized to view another developer’s engagement timeline',
      403,
      { engagementId }
    );
  }

  type TimelineEvent = {
    id: string;
    type: 'STATUS_TRANSITION' | 'CONTACT_ATTEMPT' | 'FEEDBACK';
    timestamp: Date;
    actorType: string;
    actorId: string | null;
    summary: string;
    data: Record<string, unknown>;
  };

  const events: TimelineEvent[] = [
    ...engagement.statusHistories.map((h) => ({
      id: h.id,
      type: 'STATUS_TRANSITION' as const,
      timestamp: h.createdAt,
      actorType: h.actorType,
      actorId: h.actorId ?? h.userId,
      summary: `${h.previousStatus ?? 'INITIAL'} -> ${h.newStatus === 'NEW' ? 'CLAIMED' : h.newStatus}${
        h.reasonCode ? ` (${h.reasonCode})` : ''
      }`,
      data: {
        previousStatus: h.previousStatus ? mapPipelineToEngagementStatus(h.previousStatus) : null,
        newStatus: mapPipelineToEngagementStatus(h.newStatus),
        reasonCode: h.reasonCode,
        note: h.note ?? h.notes,
        metadata: h.metadata,
      },
    })),
    ...engagement.contactAttempts.map((a) => ({
      id: a.id,
      type: 'CONTACT_ATTEMPT' as const,
      timestamp: a.attemptedAt,
      actorType: 'DEVELOPER',
      actorId: a.developerId,
      summary: `${a.channel}: ${a.result}`,
      data: {
        channel: a.channel,
        result: a.result,
        note: a.note,
        attemptedAt: a.attemptedAt,
      },
    })),
    ...engagement.feedbacks.map((f) => ({
      id: f.id,
      type: 'FEEDBACK' as const,
      timestamp: f.createdAt,
      actorType: 'DEVELOPER',
      actorId: f.userId,
      summary: `${f.category}: ${f.reasonCode ?? f.reason ?? 'FEEDBACK'}`,
      data: {
        category: f.category,
        reasonCode: f.reasonCode ?? f.reason,
        rating: f.rating,
        confidence: f.confidence,
        useful: f.useful,
        comment: f.comment,
      },
    })),
  ];

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const total = events.length;
  const paginatedEvents = events.slice((page - 1) * pageSize, page * pageSize);

  return {
    engagementId: engagement.id,
    leadId: engagement.leadId,
    developerId: engagement.developerId,
    currentStatus: engagement.currentStatus,
    timeline: paginatedEvents,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/**
 * Controlled Admin Status Correction workflow (Section 12 & Section 31).
 * Allows admins to correct an engagement status (including terminal states),
 * preserving the original state in audit/history metadata and recording `ADMIN_STATUS_CORRECTION`.
 */
export async function adminCorrectEngagementStatus(input: AdminCorrectEngagementStatusInput) {
  const {
    engagementId,
    adminId,
    previousState,
    previousStatus,
    newState,
    newStatus,
    reason,
    estimatedProjectValue,
    currency,
    reasonCode,
    ipAddress,
  } = input;

  if (!adminId) {
    throw new EngagementEngineError('UNAUTHORIZED', 'Admin authentication is required', 401);
  }
  if (!engagementId) {
    throw new EngagementEngineError('ENGAGEMENT_NOT_FOUND', 'Engagement ID is required', 404);
  }

  const targetStatus = (newStatus ?? newState) as EngagementStatus;
  const expectedPreviousStatus = (previousStatus ?? previousState) as EngagementStatus | undefined;

  if (!isValidEngagementStatus(targetStatus)) {
    throw new EngagementEngineError(
      'INVALID_STATUS_TRANSITION',
      `Invalid target engagement status: ${String(targetStatus)}`,
      422,
      { targetStatus }
    );
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new EngagementEngineError(
      'INVALID_REASON',
      'Admin status correction requires a non-empty reason',
      422
    );
  }

  const trimmedReason = reason.trim();

  return prisma.$transaction(async (tx) => {
    const engagement = await tx.leadEngagement.findUnique({
      where: { id: engagementId },
      include: { claim: true },
    });

    if (!engagement) {
      throw new EngagementEngineError(
        'ENGAGEMENT_NOT_FOUND',
        'Engagement not found',
        404,
        { engagementId }
      );
    }

    if (expectedPreviousStatus && engagement.currentStatus !== expectedPreviousStatus) {
      throw new EngagementEngineError(
        'INVALID_STATUS_TRANSITION',
        `Expected previous status ${expectedPreviousStatus} does not match current status ${engagement.currentStatus}`,
        409,
        {
          expectedPreviousStatus,
          actualCurrentStatus: engagement.currentStatus,
        }
      );
    }

    const originalState = engagement.currentStatus;
    const originalOutcome = engagement.finalOutcome;
    const now = new Date();

    const isTargetTerminal = isTerminalEngagementStatus(targetStatus);
    let parsedProjectValue = engagement.estimatedProjectValue;
    if (estimatedProjectValue !== undefined) {
      if (
        estimatedProjectValue === null ||
        String(estimatedProjectValue).trim().toLowerCase() === 'unknown' ||
        String(estimatedProjectValue).trim() === ''
      ) {
        parsedProjectValue = null;
      } else {
        const num = Number(estimatedProjectValue);
        if (!Number.isFinite(num) || num < 0) {
          throw new EngagementEngineError(
            'INVALID_FEEDBACK',
            'estimatedProjectValue must be a non-negative number or null',
            422
          );
        }
        parsedProjectValue = Math.round(num);
      }
    }

    const updatedEngagement = await tx.leadEngagement.update({
      where: { id: engagement.id },
      data: {
        currentStatus: targetStatus,
        isTerminal: isTargetTerminal,
        closedAt: isTargetTerminal ? (engagement.closedAt ?? now) : null,
        finalOutcome: isTargetTerminal ? targetStatus : null,
        outcomeReasonCode: isTargetTerminal
          ? reasonCode?.trim().toUpperCase() ?? engagement.outcomeReasonCode ?? 'ADMIN_CORRECTION'
          : null,
        outcomeReasonNote: isTargetTerminal ? trimmedReason : null,
        outcomeNote: isTargetTerminal ? trimmedReason : null,
        estimatedProjectValue: parsedProjectValue,
        currency: currency?.trim().toUpperCase() || engagement.currency,
        wonAt: targetStatus === 'WON' ? (engagement.wonAt ?? now) : null,
        lostAt: targetStatus === 'LOST' ? (engagement.lostAt ?? now) : null,
        invalidAt: targetStatus === 'INVALID' ? (engagement.invalidAt ?? now) : null,
        invalidatedAt: targetStatus === 'INVALID' ? (engagement.invalidatedAt ?? now) : null,
        notInterestedAt:
          targetStatus === 'NOT_INTERESTED' ? (engagement.notInterestedAt ?? now) : null,
      },
    });

    const mappedPipelineStatus = mapEngagementToPipelineStatus(targetStatus);
    await tx.leadClaim.update({
      where: { id: engagement.claimId },
      data: {
        pipelineStatus: mappedPipelineStatus,
      },
    });

    const statusHistory = await tx.leadStatusHistory.create({
      data: {
        claimId: engagement.claimId,
        engagementId: engagement.id,
        leadId: engagement.leadId,
        userId: engagement.developerId,
        developerId: engagement.developerId,
        previousStatus: mapEngagementToPipelineStatus(originalState),
        newStatus: mappedPipelineStatus,
        reasonCode: reasonCode?.trim().toUpperCase() ?? 'ADMIN_CORRECTION',
        note: trimmedReason,
        notes: `[ADMIN CORRECTION] ${trimmedReason}`,
        actorType: 'ADMIN',
        actorId: adminId,
        isAdminCorrection: true,
        metadata: {
          adminCorrection: true,
          adminId,
          previousState: originalState,
          newState: targetStatus,
          originalOutcome,
          reason: trimmedReason,
          correctedAt: now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    await createAuditLog(
      {
        userId: adminId,
        action: 'ADMIN_STATUS_CORRECTION',
        entityType: 'LeadEngagement',
        entityId: engagement.id,
        details: {
          engagementId: engagement.id,
          claimId: engagement.claimId,
          leadId: engagement.leadId,
          developerId: engagement.developerId,
          previousState: originalState,
          newState: targetStatus,
          originalOutcome,
          reason: trimmedReason,
        },
        ipAddress,
      },
      tx as unknown as PrismaClient
    );

    await createAuditLog(
      {
        userId: adminId,
        action: 'STATUS_CHANGED',
        entityType: 'LeadEngagement',
        entityId: engagement.id,
        details: {
          engagementId: engagement.id,
          leadId: engagement.leadId,
          developerId: engagement.developerId,
          previousStatus: originalState,
          newStatus: targetStatus,
          actorType: 'ADMIN',
          reason: trimmedReason,
        },
        ipAddress,
      },
      tx as unknown as PrismaClient
    );

    return {
      success: true as const,
      engagement: updatedEngagement,
      statusHistory,
      previousState: originalState,
      newState: targetStatus,
    };
  });
}

/**
 * Admin operational visibility for engagements, conversion funnel, lost reasons,
 * won projects, invalid reports, and suspicious feedback flags.
 */
export async function getAdminEngagementsOverview(options?: {
  status?: EngagementStatus;
  developerId?: string;
  leadId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 25));

  const where: Prisma.LeadEngagementWhereInput = {
    ...(options?.status ? { currentStatus: options.status } : {}),
    ...(options?.developerId ? { developerId: options.developerId } : {}),
    ...(options?.leadId ? { leadId: options.leadId } : {}),
  };

  const [
    engagements,
    total,
    statusGroups,
    lostReasonGroups,
    invalidReasonGroups,
    feedbackCategoryGroups,
    flaggedAuditLogs,
    wonProjectsAgg,
  ] = await Promise.all([
    prisma.leadEngagement.findMany({
      where,
      include: {
        developer: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        lead: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
            governorate: true,
            leadType: true,
            accessType: true,
            status: true,
            saleabilityStatus: true,
            qualityScore: true,
            qualityFlags: true,
            verificationStatus: true,
          },
        },
        _count: {
          select: {
            statusHistories: true,
            contactAttempts: true,
            feedbacks: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.leadEngagement.count({ where }),
    prisma.leadEngagement.groupBy({
      by: ['currentStatus'],
      _count: { _all: true },
    }),
    prisma.leadEngagement.groupBy({
      by: ['lostReasonCode'],
      where: { currentStatus: 'LOST', lostReasonCode: { not: null } },
      _count: { _all: true },
    }),
    prisma.leadEngagement.groupBy({
      by: ['invalidReasonCode'],
      where: { currentStatus: 'INVALID', invalidReasonCode: { not: null } },
      _count: { _all: true },
    }),
    prisma.leadFeedback.groupBy({
      by: ['category', 'confidence'],
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: { action: 'FEEDBACK_FLAGGED' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.leadEngagement.aggregate({
      where: { currentStatus: 'WON' },
      _count: { _all: true },
      _sum: { estimatedProjectValue: true },
      _avg: { estimatedProjectValue: true },
    }),
  ]);

  const funnel: Record<EngagementStatus, number> = {
    CLAIMED: 0,
    CONTACTED: 0,
    REPLIED: 0,
    INTERESTED: 0,
    MEETING: 0,
    PROPOSAL_SENT: 0,
    NEGOTIATION: 0,
    WON: 0,
    LOST: 0,
    NOT_INTERESTED: 0,
    INVALID: 0,
  };
  for (const g of statusGroups) {
    funnel[g.currentStatus] = g._count._all;
  }

  return {
    engagements,
    conversionFunnel: funnel,
    wonSummary: {
      totalWon: wonProjectsAgg._count._all,
      totalEstimatedValue: wonProjectsAgg._sum.estimatedProjectValue ?? 0,
      averageEstimatedValue: Math.round(wonProjectsAgg._avg.estimatedProjectValue ?? 0),
    },
    lostReasons: lostReasonGroups.map((g) => ({
      reasonCode: g.lostReasonCode,
      count: g._count._all,
    })),
    invalidReports: invalidReasonGroups.map((g) => ({
      reasonCode: g.invalidReasonCode,
      count: g._count._all,
    })),
    feedbackBreakdown: feedbackCategoryGroups.map((g) => ({
      category: g.category,
      confidence: g.confidence,
      count: g._count._all,
    })),
    suspiciousFlags: flaggedAuditLogs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

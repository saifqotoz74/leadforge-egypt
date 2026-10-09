import { FeedbackReason, Lead, PipelineStatus, PrismaClient } from '@prisma/client';
import { createAuditLog } from './audit';
import { createInAppNotification } from './notifications';
import {
  recordDeveloperFeedbackVerification,
} from './quality';
import { claimLead, ClaimEngineError } from './claims';

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 6) return '****';
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  return `${parts[0].slice(0, 2)}***@${parts[1]}`;
}

/**
 * Sanitizes a raw database Lead record for developer-facing APIs.
 * Masks private contact details unless `isUnlocked === true` and strips internal deduplication/ownership metadata.
 */
export function sanitizeLeadForDeveloper(lead: Lead, isUnlocked: boolean) {
  const {
    normalizedPhone: _np,
    normalizedEmail: _ne,
    normalizedAddress: _na,
    normalizedFacebook: _nf,
    normalizedInstagram: _ni,
    normalizedName: _nn,
    canonicalIdentityKeys: _cik,
    fieldProvenance: _fp,
    fieldConflicts: _fc,
    exclusiveClaimedById: _ecb,
    ...publicLead
  } = lead;

  if (isUnlocked) {
    return publicLead;
  }

  return {
    ...publicLead,
    address: null,
    phone: maskPhone(lead.phone),
    phones: [],
    email: maskEmail(lead.email),
    facebook: lead.hasFacebook ? 'متاح بعد فتح الفرصة' : null,
    instagram: lead.hasInstagram ? 'متاح بعد فتح الفرصة' : null,
  };
}

export class LeadServiceError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(message: string, code: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = 'LeadServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Atomically claims a lead for a developer via the Phase 5 Claim, Credits & Shared/Exclusive Leads Engine.
 */
export async function claimLeadForDeveloper(params: {
  prisma: PrismaClient;
  userId: string;
  leadId: string;
  idempotencyKey?: string | null;
  ipAddress?: string;
  legacyCompatibilityMode?: boolean;
}) {
  const {
    prisma,
    userId,
    leadId,
    idempotencyKey,
    ipAddress,
    legacyCompatibilityMode = true,
  } = params;

  try {
    const result = await claimLead({
      leadId,
      developerId: userId,
      idempotencyKey,
      ipAddress,
      legacyCompatibilityMode,
    });

    const [claim, lead] = await Promise.all([
      prisma.leadClaim.findUniqueOrThrow({ where: { id: result.claimId } }),
      prisma.lead.findUniqueOrThrow({ where: { id: result.leadId } }),
    ]);

    return {
      claim,
      lead,
      remainingCredits: result.remainingBalance,
      claimResult: result,
    };
  } catch (error) {
    if (error instanceof ClaimEngineError) {
      throw new LeadServiceError(error.message, error.code, error.statusCode, error.details);
    }
    throw error;
  }
}

const VALID_PIPELINE_STATUSES: PipelineStatus[] = [
  'NEW',
  'CLAIMED',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'INVALID',
];

/**
 * Updates the pipeline status, notes, lastContactedAt, and nextFollowUpAt of a claimed lead.
 * Enforces ownership: a developer can ONLY update their own active claimed leads.
 */
export async function updateDeveloperLeadStatus(params: {
  prisma: PrismaClient;
  userId: string;
  leadId: string;
  status: PipelineStatus;
  notes?: string | null;
  lastContactedAt?: string | Date | null;
  nextFollowUpAt?: string | Date | null;
}) {
  const { prisma, userId, leadId, status, notes, lastContactedAt, nextFollowUpAt } = params;

  if (!VALID_PIPELINE_STATUSES.includes(status)) {
    throw new LeadServiceError('حالة المتابعة غير صالحة.', 'INVALID_STATUS', 400);
  }

  const claim = await prisma.leadClaim.findUnique({
    where: {
      leadId_userId: {
        leadId,
        userId,
      },
    },
    include: { lead: true, engagement: true },
  });

  if (!claim || claim.status !== 'ACTIVE' || claim.accessGranted === false) {
    throw new LeadServiceError(
      'غير مصرح لك بتعديل حالة هذا العميل لأنك لم تقم بشراء الفرصة أو تم استردادها.',
      'CLAIM_NOT_FOUND_OR_FORBIDDEN',
      403
    );
  }

  const mappedEngagementStatus = status === 'NEW' ? 'CLAIMED' : status;
  const currentEngagementStatus =
    claim.engagement?.currentStatus ??
    (claim.pipelineStatus === 'NEW' ? 'CLAIMED' : claim.pipelineStatus);
  const terminalStates = ['WON', 'LOST', 'NOT_INTERESTED', 'INVALID'];

  if (
    terminalStates.includes(currentEngagementStatus) &&
    mappedEngagementStatus !== currentEngagementStatus
  ) {
    throw new LeadServiceError(
      'لا يمكن إعادة فتح أو تغيير حالة الفرصة بعد وصولها لحالة نهائية إلا بواسطة مدير النظام.',
      'TERMINAL_STATUS',
      422
    );
  }

  const resolvedLastContacted =
    lastContactedAt !== undefined
      ? lastContactedAt
        ? new Date(lastContactedAt)
        : null
      : ['CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON'].includes(status) &&
        !claim.lastContactedAt
      ? new Date()
      : claim.lastContactedAt;

  const resolvedNextFollowUp =
    nextFollowUpAt !== undefined
      ? nextFollowUpAt
        ? new Date(nextFollowUpAt)
        : null
      : claim.nextFollowUpAt;

  const updatedClaim = await prisma.leadClaim.update({
    where: { id: claim.id },
    data: {
      pipelineStatus: status,
      notes: notes !== undefined ? notes : claim.notes,
      lastContactedAt: resolvedLastContacted,
      nextFollowUpAt: resolvedNextFollowUp,
    },
  });

  const now = new Date();
  const isTargetTerminal = terminalStates.includes(mappedEngagementStatus);
  const engagement = await prisma.leadEngagement.upsert({
    where: {
      leadId_developerId: {
        leadId,
        developerId: userId,
      },
    },
    update: {
      claimId: claim.id,
      currentStatus: mappedEngagementStatus,
      isTerminal: isTargetTerminal,
      ...(isTargetTerminal && !claim.engagement?.closedAt ? { closedAt: now } : {}),
      lastContactedAt: resolvedLastContacted ?? undefined,
      ...(mappedEngagementStatus === 'CONTACTED' && !claim.engagement?.firstContactedAt
        ? { firstContactedAt: resolvedLastContacted ?? now }
        : {}),
      ...(mappedEngagementStatus === 'REPLIED' && !claim.engagement?.firstRepliedAt
        ? { firstRepliedAt: now }
        : {}),
      ...(mappedEngagementStatus === 'INTERESTED' && !claim.engagement?.interestedAt
        ? { interestedAt: now }
        : {}),
      ...(mappedEngagementStatus === 'MEETING' && !claim.engagement?.meetingAt
        ? { meetingAt: now }
        : {}),
      ...(mappedEngagementStatus === 'PROPOSAL_SENT' && !claim.engagement?.proposalSentAt
        ? { proposalSentAt: now }
        : {}),
      ...(mappedEngagementStatus === 'NEGOTIATION' && !claim.engagement?.negotiationAt
        ? { negotiationAt: now }
        : {}),
      ...(mappedEngagementStatus === 'WON' && !claim.engagement?.wonAt
        ? { wonAt: now, finalOutcome: 'WON' }
        : {}),
      ...(mappedEngagementStatus === 'LOST' && !claim.engagement?.lostAt
        ? { lostAt: now, finalOutcome: 'LOST' }
        : {}),
      ...(mappedEngagementStatus === 'NOT_INTERESTED' && !claim.engagement?.notInterestedAt
        ? { notInterestedAt: now, finalOutcome: 'NOT_INTERESTED' }
        : {}),
      ...(mappedEngagementStatus === 'INVALID' && !claim.engagement?.invalidAt
        ? { invalidAt: now, invalidatedAt: now, finalOutcome: 'INVALID' }
        : {}),
    },
    create: {
      leadId,
      developerId: userId,
      claimId: claim.id,
      currentStatus: mappedEngagementStatus,
      isTerminal: isTargetTerminal,
      closedAt: isTargetTerminal ? now : null,
      claimedAt: claim.claimedAt,
      lastContactedAt: resolvedLastContacted,
    },
  });

  await prisma.leadStatusHistory.create({
    data: {
      claimId: claim.id,
      engagementId: engagement.id,
      leadId,
      userId,
      developerId: userId,
      previousStatus: claim.pipelineStatus,
      newStatus: status,
      actorType: 'DEVELOPER',
      actorId: userId,
      notes: notes || null,
    },
  });

  if (status === 'WON' && claim.pipelineStatus !== 'WON') {
    await createInAppNotification(
      {
        userId,
        title: 'مبارك! إغلاق صفقة ناجحة (WON)',
        message: `A lead you claimed was marked WON — تم تسجيل صفقة ناجحة مع "${claim.lead.businessName}".`,
        type: 'LEAD_WON',
        link: `/leads/${leadId}`,
      },
      prisma
    );
  }

  await createAuditLog(
    {
      userId,
      action: 'LEAD_STATUS_UPDATED',
      entityType: 'LeadClaim',
      entityId: claim.id,
      details: {
        leadId,
        engagementId: engagement.id,
        previousStatus: claim.pipelineStatus,
        newStatus: status,
      },
    },
    prisma
  );

  return updatedClaim;
}

const VALID_FEEDBACK_REASONS: FeedbackReason[] = [
  'WRONG_PHONE',
  'BUSINESS_CLOSED',
  'ALREADY_HAS_WEBSITE',
  'NOT_INTERESTED',
  'DUPLICATE',
  'WRONG_CATEGORY',
  'WRONG_LOCATION',
  'OTHER',
];

/**
 * Records developer feedback ("Was this lead useful? Yes / No + reason").
 * Enforces that only a developer who claimed the lead can submit feedback.
 */
export async function submitDeveloperLeadFeedback(params: {
  prisma: PrismaClient;
  userId: string;
  leadId: string;
  useful: boolean;
  reason?: FeedbackReason | null;
  comment?: string | null;
}) {
  const { prisma, userId, leadId, useful, reason, comment } = params;

  const claim = await prisma.leadClaim.findUnique({
    where: {
      leadId_userId: {
        leadId,
        userId,
      },
    },
    include: { engagement: true },
  });

  if (!claim) {
    throw new LeadServiceError(
      'يجب الحصول على الفرصة أولاً قبل تقييم جودتها.',
      'CLAIM_REQUIRED_FOR_FEEDBACK',
      403
    );
  }

  if (!useful) {
    if (!reason || !VALID_FEEDBACK_REASONS.includes(reason)) {
      throw new LeadServiceError(
        'يرجى اختيار سبب عدم فائدة الفرصة.',
        'FEEDBACK_REASON_REQUIRED',
        400
      );
    }
  }

  const existingLegacyFeedback = await prisma.leadFeedback.findFirst({
    where: {
      leadId,
      userId,
    },
    orderBy: { createdAt: 'desc' },
  });

  const resolvedReasonCode = useful ? 'HIGH_QUALITY_LEAD' : (reason ?? 'OTHER');
  const trimmedComment = comment?.trim() || null;
  const feedback = existingLegacyFeedback
    ? await prisma.leadFeedback.update({
        where: { id: existingLegacyFeedback.id },
        data: {
          developerId: userId,
          useful,
          reason: useful ? null : reason || null,
          reasonCode: resolvedReasonCode,
          category: 'LEAD_QUALITY',
          comment: trimmedComment,
          note: trimmedComment,
          engagementId: claim.engagement?.id ?? existingLegacyFeedback.engagementId,
        },
      })
    : await prisma.leadFeedback.create({
        data: {
          leadId,
          userId,
          developerId: userId,
          claimId: claim.id,
          engagementId: claim.engagement?.id ?? null,
          useful,
          reason: useful ? null : reason || null,
          reasonCode: resolvedReasonCode,
          category: 'LEAD_QUALITY',
          confidence: 'MEDIUM',
          comment: trimmedComment,
          note: trimmedComment,
        },
      });

  await recordDeveloperFeedbackVerification({
    leadId,
    userId,
    useful,
    reason: useful ? null : reason || null,
    comment: comment?.trim() || null,
  });

  await createAuditLog(
    {
      userId,
      action: 'LEAD_FEEDBACK_SUBMITTED',
      entityType: 'LeadFeedback',
      entityId: feedback.id,
      details: {
        leadId,
        useful,
        reason: useful ? null : reason,
      },
    },
    prisma
  );

  return feedback;
}

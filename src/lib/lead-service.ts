import { FeedbackReason, PipelineStatus, PrismaClient } from '@prisma/client';
import { createAuditLog } from './audit';
import { createInAppNotification } from './notifications';
import {
  calculateLeadFreshness,
  getActiveQualityAndFreshnessConfig,
  recordDeveloperFeedbackVerification,
} from './quality';

export class LeadServiceError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'LeadServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Atomically claims a lead for a developer:
 * Enforces all security and business rules:
 * 1. User must have an active subscription with credits > 0 ("No credits remaining")
 * 2. Lead must exist and be AVAILABLE (and pass Phase 3 saleability, freshness, verification, and quality gates)
 * 3. User cannot claim the same lead twice
 * 4. Lead cannot exceed maxPurchasers
 * 5. Exclusive lead can only be claimed once (maxPurchasers = 1, currentPurchasers = 0)
 * 6. Deducts 1 credit and records LeadClaim + LeadStatusHistory + AuditLog + low-credit notification
 */
export async function claimLeadForDeveloper(params: {
  prisma: PrismaClient;
  userId: string;
  leadId: string;
}) {
  const { prisma, userId, leadId } = params;
  const { qualityConfig, freshnessThresholds } = await getActiveQualityAndFreshnessConfig();

  const result = await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'ACTIVE') {
      throw new LeadServiceError(
        'لا يوجد اشتراك نشط في حسابك. يرجى تفعيل باقتك أولاً.',
        'NO_ACTIVE_SUBSCRIPTION',
        403
      );
    }

    if (subscription.credits <= 0) {
      throw new LeadServiceError(
        'No credits remaining — لا يوجد رصيد كافٍ من النقاط لاقتناص هذه الفرصة.',
        'NO_CREDITS_REMAINING',
        403
      );
    }

    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      include: {
        verifications: {
          orderBy: { checkedAt: 'desc' },
        },
      },
    });

    if (!lead) {
      throw new LeadServiceError('الفرصة المطلوبة غير موجودة.', 'LEAD_NOT_FOUND', 404);
    }

    const existingClaim = await tx.leadClaim.findUnique({
      where: {
        leadId_userId: {
          leadId,
          userId,
        },
      },
    });

    if (existingClaim) {
      throw new LeadServiceError(
        'لقد قمت بالحصول على بيانات هذا العميل مسبقًا.',
        'ALREADY_CLAIMED_BY_USER',
        409
      );
    }

    const now = new Date();
    const dynamicFreshness = calculateLeadFreshness(
      lead.lastVerifiedAt,
      freshnessThresholds,
      now
    );

    // Check if any critical latest verification (PHONE or BUSINESS_STATUS) has expired or failed
    const latestByType = new Map<string, (typeof lead.verifications)[number]>();
    for (const v of lead.verifications) {
      const dim = v.verificationType;
      if (!latestByType.has(dim)) {
        latestByType.set(dim, v);
      }
    }
    const latestPhoneVer = latestByType.get('PHONE');
    const latestBizVer = latestByType.get('BUSINESS_STATUS');
    const hasExpiredCriticalVerification =
      (latestPhoneVer?.expiresAt && new Date(latestPhoneVer.expiresAt).getTime() <= now.getTime()) ||
      (latestBizVer?.expiresAt && new Date(latestBizVer.expiresAt).getTime() <= now.getTime());

    const isQualityGateBlocked =
      lead.status !== 'AVAILABLE' ||
      (lead.saleabilityStatus && lead.saleabilityStatus !== 'AVAILABLE') ||
      !lead.isCanonical ||
      Boolean(lead.mergedIntoLeadId) ||
      lead.businessStatus === 'CLOSED' ||
      lead.verificationStatus === 'FAILED_VERIFICATION' ||
      lead.verificationStatus === 'UNVERIFIED' ||
      lead.qualityScore < qualityConfig.minSaleableQualityScore ||
      dynamicFreshness.isStale ||
      dynamicFreshness.requiresVerification ||
      Boolean(hasExpiredCriticalVerification);

    if (isQualityGateBlocked) {
      throw new LeadServiceError(
        'هذه الفرصة غير متاحة حاليًا للشراء (تحتاج إلى إعادة تحقق أو غير مستوفية لمعايير الجودة).',
        'LEAD_NOT_AVAILABLE',
        409
      );
    }

    const effectiveMaxPurchasers =
      lead.exclusive || lead.leadType === 'EXCLUSIVE' ? 1 : lead.maxPurchasers;

    if (lead.currentPurchasers >= effectiveMaxPurchasers) {
      if (lead.exclusive || lead.leadType === 'EXCLUSIVE') {
        throw new LeadServiceError(
          'هذه فرصة حصرية وقد تم شراؤها بالفعل من قِبل مطور آخر.',
          'EXCLUSIVE_LEAD_ALREADY_CLAIMED',
          409
        );
      }
      throw new LeadServiceError(
        'وصلت هذه الفرصة إلى الحد الأقصى لعدد المشترين المسموح به.',
        'MAX_PURCHASERS_EXCEEDED',
        409
      );
    }

    // Atomic conditional credit deduction to prevent concurrent race conditions when credits === 1
    const subUpdate = await tx.subscription.updateMany({
      where: {
        id: subscription.id,
        status: 'ACTIVE',
        credits: { gt: 0 },
      },
      data: {
        credits: { decrement: 1 },
        creditsUsed: { increment: 1 },
      },
    });

    if (subUpdate.count === 0) {
      throw new LeadServiceError(
        'No credits remaining — لا يوجد رصيد كافٍ من النقاط لاقتناص هذه الفرصة.',
        'NO_CREDITS_REMAINING',
        403
      );
    }

    // Atomic conditional purchaser increment to prevent concurrent race conditions on exclusive/shared leads
    const leadIncrement = await tx.lead.updateMany({
      where: {
        id: lead.id,
        status: 'AVAILABLE',
        currentPurchasers: { lt: effectiveMaxPurchasers },
      },
      data: {
        currentPurchasers: { increment: 1 },
      },
    });

    if (leadIncrement.count === 0) {
      throw new LeadServiceError(
        lead.exclusive || lead.leadType === 'EXCLUSIVE'
          ? 'هذه فرصة حصرية وقد تم شراؤها بالفعل من قِبل مطور آخر.'
          : 'وصلت هذه الفرصة إلى الحد الأقصى لعدد المشترين المسموح به.',
        lead.exclusive || lead.leadType === 'EXCLUSIVE'
          ? 'EXCLUSIVE_LEAD_ALREADY_CLAIMED'
          : 'MAX_PURCHASERS_EXCEEDED',
        409
      );
    }

    const refreshedLead = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const isNowFull =
      refreshedLead.exclusive ||
      refreshedLead.leadType === 'EXCLUSIVE' ||
      refreshedLead.currentPurchasers >= refreshedLead.maxPurchasers;

    const updatedLead = isNowFull
      ? await tx.lead.update({
          where: { id: lead.id },
          data: { status: 'CLAIMED_FULL', saleabilityStatus: 'CLAIMED_FULL' },
        })
      : refreshedLead;

    const updatedSub = await tx.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });

    const claim = await tx.leadClaim.create({
      data: {
        leadId: lead.id,
        userId,
        pipelineStatus: 'NEW',
        creditsSpent: 1,
        exclusiveClaim: lead.exclusive || lead.leadType === 'EXCLUSIVE',
      },
    });

    await tx.leadStatusHistory.create({
      data: {
        claimId: claim.id,
        leadId: lead.id,
        userId,
        previousStatus: null,
        newStatus: 'NEW',
        notes: 'تم الحصول على الفرصة وفتح بيانات التواصل',
      },
    });

    return {
      claim,
      lead: updatedLead,
      remainingCredits: updatedSub.credits,
    };
  });

  if (result.remainingCredits <= 5) {
    await createInAppNotification(
      {
        userId,
        title: 'تنبيه انخفاض رصيد النقاط',
        message: `Your subscription has ${result.remainingCredits} credits remaining — متبقي لديك ${result.remainingCredits} نقاط فقط في باقتك الحالية.`,
        type: 'LOW_CREDITS',
        link: '/subscription',
      },
      prisma
    );
  }

  await createAuditLog(
    {
      userId,
      action: 'LEAD_CLAIMED',
      entityType: 'Lead',
      entityId: leadId,
      details: {
        claimId: result.claim.id,
        exclusive: result.claim.exclusiveClaim,
        remainingCredits: result.remainingCredits,
      },
    },
    prisma
  );

  return result;
}

const VALID_PIPELINE_STATUSES: PipelineStatus[] = [
  'NEW',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'WON',
  'LOST',
  'NOT_INTERESTED',
  'INVALID',
];

/**
 * Updates the pipeline status, notes, lastContactedAt, and nextFollowUpAt of a claimed lead.
 * Enforces ownership: a developer can ONLY update their own claimed leads.
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
    include: { lead: true },
  });

  if (!claim) {
    throw new LeadServiceError(
      'غير مصرح لك بتعديل حالة هذا العميل لأنك لم تقم بشراء الفرصة.',
      'CLAIM_NOT_FOUND_OR_FORBIDDEN',
      403
    );
  }

  const resolvedLastContacted =
    lastContactedAt !== undefined
      ? lastContactedAt
        ? new Date(lastContactedAt)
        : null
      : ['CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'WON'].includes(status) && !claim.lastContactedAt
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

  await prisma.leadStatusHistory.create({
    data: {
      claimId: claim.id,
      leadId,
      userId,
      previousStatus: claim.pipelineStatus,
      newStatus: status,
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

  const feedback = await prisma.leadFeedback.upsert({
    where: {
      leadId_userId: {
        leadId,
        userId,
      },
    },
    update: {
      useful,
      reason: useful ? null : reason || null,
      comment: comment?.trim() || null,
    },
    create: {
      leadId,
      userId,
      claimId: claim.id,
      useful,
      reason: useful ? null : reason || null,
      comment: comment?.trim() || null,
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

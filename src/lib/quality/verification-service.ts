import {
  BusinessOperationalStatus,
  FeedbackReason,
  LeadAvailabilityStatus,
  Prisma,
  VerificationRecordStatus,
  VerificationType,
} from '@prisma/client';
import { prisma } from '../db';
import { recalculateLeadScore } from '../scoring/service';
import {
  computeVerificationExpiryDate,
  getFreshnessVerificationPriorityRank,
} from './freshness-engine';
import { logVerificationEvent } from './logger';
import { evaluateLeadQuality, FullLeadQualityEvaluation } from './quality-engine';
import {
  DEFAULT_PHASE3_FRESHNESS_THRESHOLDS,
  DEFAULT_QUALITY_CONFIG,
  Phase3FreshnessThresholds,
  QualityThresholdsConfig,
  VerificationErrorType,
} from './types';
import {
  evaluateBusinessOperationalStatus,
  evaluateWebsiteVerification,
  validateLeadCategory,
  validateLeadEmail,
  validateLeadLocation,
  validateLeadPhone,
  verifyWebsiteHttpWithTimeout,
  WebsiteProbeFn,
  WebsiteProbeResponse,
} from './validators';

export interface VerificationRunOptions {
  source?: string;
  now?: Date;
  websiteProbe?: WebsiteProbeFn | WebsiteProbeResponse | null;
  probeWebsiteLive?: boolean;
  probeTimeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  recalculateOpportunityScore?: boolean;
  overrideBusinessStatus?: BusinessOperationalStatus;
  _skipLock?: boolean;
}

export interface SingleVerificationOutcome {
  leadId: string;
  verificationType: VerificationType;
  recordId: string;
  status: VerificationRecordStatus;
  previousStatus: string | null;
  checkedAt: Date;
  expiresAt: Date | null;
  resultSummary: string;
  errorType: VerificationErrorType | null;
  retryCount: number;
  durationMs: number;
  qualityEvaluation: FullLeadQualityEvaluation;
}

export interface BatchVerificationOptions extends VerificationRunOptions {
  batchSize?: number;
  offset?: number;
  page?: number;
  leadIds?: string[];
  freshnessFilter?: string[];
  onlyCanonical?: boolean;
}

export interface BatchVerificationResult {
  processedCount: number;
  verifiedCount: number;
  partiallyVerifiedCount: number;
  failedCount: number;
  durationMs: number;
  results: Array<{
    leadId: string;
    businessName: string;
    previousFreshnessStatus: string;
    newFreshnessStatus: string;
    previousVerificationStatus: string;
    newVerificationStatus: string;
    qualityScore: number;
    qualityStatus: string;
    saleabilityStatus: string;
  }>;
  errors: Array<{
    leadId: string;
    error: string;
  }>;
}

const leadVerificationLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes verification and feedback state mutations per leadId so concurrent batch
 * verifications and developer feedback submissions never interleave or corrupt Lead state.
 */
export async function withLeadVerificationLock<T>(
  leadId: string,
  fn: () => Promise<T>,
  skipLock = false
): Promise<T> {
  if (skipLock || !leadId) {
    return fn();
  }
  const previous = leadVerificationLocks.get(leadId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current, () => current);
  leadVerificationLocks.set(leadId, chained);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (leadVerificationLocks.get(leadId) === chained) {
      leadVerificationLocks.delete(leadId);
    }
  }
}

/**
 * Computes bounded exponential backoff delay in milliseconds.
 */
export function computeRetryBackoffMs(
  attempt: number,
  baseDelayMs = 50,
  maxDelayMs = 1000
): number {
  const exp = Math.max(0, Math.min(attempt, 6));
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exp));
}

/**
 * Classifies an error or probe failure into TEMPORARY_FAILURE, PERMANENT_FAILURE, or UNKNOWN.
 */
export function classifyVerificationError(err: unknown): VerificationErrorType {
  if (!err) return 'UNKNOWN';
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === 'string'
      ? err.toLowerCase()
      : '';

  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('eai_again') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('429') ||
    msg.includes('temporary') ||
    msg.includes('unreachable')
  ) {
    return 'TEMPORARY_FAILURE';
  }

  if (
    msg.includes('invalid') ||
    msg.includes('404') ||
    msg.includes('410') ||
    msg.includes('nxdomain') ||
    msg.includes('enotfound') ||
    msg.includes('permanent') ||
    msg.includes('closed')
  ) {
    return 'PERMANENT_FAILURE';
  }

  return 'UNKNOWN';
}

export async function getActiveQualityAndFreshnessConfig(): Promise<{
  qualityConfig: QualityThresholdsConfig;
  freshnessThresholds: Phase3FreshnessThresholds;
}> {
  const [qRow, fRow] = await Promise.all([
    prisma.qualityConfig.findUnique({ where: { id: 'default' } }).catch(() => null),
    prisma.freshnessConfig.findUnique({ where: { id: 'default' } }).catch(() => null),
  ]);

  const qualityConfig: QualityThresholdsConfig = qRow
    ? {
        veryLowMax: qRow.veryLowMax,
        lowMin: qRow.lowMin,
        lowMax: qRow.lowMax,
        mediumMin: qRow.mediumMin,
        mediumMax: qRow.mediumMax,
        highMin: qRow.highMin,
        highMax: qRow.highMax,
        excellentMin: qRow.excellentMin,
        minSaleableQualityScore: qRow.minSaleableQualityScore,
        phoneExpiryDays: qRow.phoneExpiryDays,
        emailExpiryDays: qRow.emailExpiryDays,
        websiteExpiryDays: qRow.websiteExpiryDays,
        businessStatusExpiryDays: qRow.businessStatusExpiryDays,
        addressExpiryDays: qRow.addressExpiryDays,
        identityExpiryDays: qRow.identityExpiryDays,
      }
    : DEFAULT_QUALITY_CONFIG;

  const freshnessThresholds: Phase3FreshnessThresholds = fRow
    ? {
        freshMaxDays: fRow.freshMaxDays,
        recentMaxDays: fRow.recentMaxDays,
        needsVerifyMaxDays: fRow.needsVerifyMaxDays,
        staleMaxDays: fRow.staleMaxDays ?? 180,
      }
    : DEFAULT_PHASE3_FRESHNESS_THRESHOLDS;

  return { qualityConfig, freshnessThresholds };
}

/**
 * Loads a Lead along with its verification history, negative feedback, and pending duplicate candidates,
 * evaluates its Phase 3 quality/freshness/verification/saleability state, and persists the updated fields on `Lead`.
 * Never modifies `LeadClaim.pipelineStatus` or replaces `Lead.score` with `qualityScore`.
 */
export async function recalculateAndPersistLeadQuality(
  leadId: string,
  options: {
    now?: Date;
    websiteProbe?: WebsiteProbeResponse | null;
    updateLastVerifiedAt?: Date | null;
    preserveArchivedOrClaimedFullStatus?: boolean;
  } = {}
): Promise<FullLeadQualityEvaluation> {
  const now = options.now ?? new Date();
  const { qualityConfig, freshnessThresholds } = await getActiveQualityAndFreshnessConfig();

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      verifications: {
        orderBy: { checkedAt: 'desc' },
      },
      feedbacks: {
        where: { useful: false },
        select: { reason: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      candidateDuplicates: {
        where: { status: 'PENDING' },
        select: { id: true },
      },
      matchedCandidates: {
        where: { status: 'PENDING' },
        select: { id: true },
      },
    },
  });

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const negativeFeedbackEntries = lead.feedbacks
    .filter((f): f is { reason: FeedbackReason; createdAt: Date } => Boolean(f.reason))
    .map((f) => ({
      reason: f.reason,
      createdAt: f.createdAt,
    }));

  const negativeFeedbackReasons = negativeFeedbackEntries.map((f) => f.reason);

  const hasPendingDuplicateCandidate =
    lead.candidateDuplicates.length > 0 || lead.matchedCandidates.length > 0;

  const effectiveLastVerifiedAt =
    options.updateLastVerifiedAt !== undefined
      ? options.updateLastVerifiedAt
      : lead.lastVerifiedAt;

  const evaluation = evaluateLeadQuality(
    {
      ...lead,
      lastVerifiedAt: effectiveLastVerifiedAt,
      websiteAnalysis:
        lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
          ? (lead.websiteAnalysis as Record<string, unknown>)
          : null,
      negativeFeedbackReasons,
      negativeFeedbackEntries,
      hasPendingDuplicateCandidate,
    },
    {
      qualityConfig,
      freshnessThresholds,
      websiteProbe: options.websiteProbe,
      now,
    }
  );

  // Sync Lead.status with saleabilityStatus while preserving CLAIMED_FULL / ARCHIVED when applicable
  let nextLeadStatus: LeadAvailabilityStatus = evaluation.saleabilityStatus;
  if (lead.status === 'ARCHIVED') {
    nextLeadStatus = 'ARCHIVED';
  } else if (
    lead.currentPurchasers >= lead.maxPurchasers &&
    evaluation.saleabilityStatus === 'AVAILABLE'
  ) {
    nextLeadStatus = 'CLAIMED_FULL';
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      qualityScore: evaluation.qualityScore,
      qualityStatus: evaluation.qualityStatus,
      freshnessStatus: evaluation.freshness.freshnessStatus,
      verificationStatus: evaluation.verificationStatus,
      saleabilityStatus: evaluation.saleabilityStatus,
      status: nextLeadStatus,
      completenessScore: evaluation.completeness.completenessScore,
      completenessBreakdown: evaluation.completeness as unknown as Prisma.InputJsonValue,
      qualityFlags: evaluation.qualityFlags,
      qualitySummary: evaluation.summary as unknown as Prisma.InputJsonValue,
      businessStatus: evaluation.businessStatus,
      phoneValidationStatus: evaluation.phoneValidationStatus,
      emailValidationStatus: evaluation.emailValidationStatus,
      websiteVerificationState: evaluation.websiteVerificationState,
      isVerified:
        evaluation.verificationStatus === 'VERIFIED' ||
        evaluation.verificationStatus === 'PARTIALLY_VERIFIED',
      ...(options.updateLastVerifiedAt !== undefined
        ? { lastVerifiedAt: options.updateLastVerifiedAt }
        : {}),
      nextVerificationAt: evaluation.nextVerificationAt,
    },
  });

  return evaluation;
}

/**
 * Executes a website probe with bounded retry and exponential backoff when a probe function is provided.
 */
async function runWebsiteProbeWithRetry(
  url: string,
  probeInput?: WebsiteProbeFn | WebsiteProbeResponse | null,
  maxRetries = 2,
  baseBackoffMs = 20
): Promise<{
  probeResult: WebsiteProbeResponse | null;
  retryCount: number;
  errorType: VerificationErrorType | null;
}> {
  if (!probeInput) {
    return { probeResult: null, retryCount: 0, errorType: null };
  }

  if (typeof probeInput === 'object') {
    return {
      probeResult: probeInput,
      retryCount: 0,
      errorType: probeInput.errorType ?? null,
    };
  }

  const cappedRetries = Math.max(0, Math.min(maxRetries, 3));
  let attempt = 0;
  let lastErrorType: VerificationErrorType | null = null;

  while (attempt <= cappedRetries) {
    try {
      const res = await probeInput(url);
      if (res.reachable) {
        return { probeResult: res, retryCount: attempt, errorType: null };
      }
      const errType =
        res.errorType ||
        classifyVerificationError(res.errorMessage || String(res.statusCode || ''));
      lastErrorType = errType;

      // Only retry TEMPORARY_FAILURE
      if (errType !== 'TEMPORARY_FAILURE' || attempt === cappedRetries) {
        return {
          probeResult: { ...res, errorType: errType },
          retryCount: attempt,
          errorType: errType,
        };
      }
    } catch (err) {
      const errType = classifyVerificationError(err);
      lastErrorType = errType;
      if (errType !== 'TEMPORARY_FAILURE' || attempt === cappedRetries) {
        return {
          probeResult: {
            reachable: false,
            errorType: errType,
            errorMessage: err instanceof Error ? err.message : 'Probe failed',
          },
          retryCount: attempt,
          errorType: errType,
        };
      }
    }

    const delay = computeRetryBackoffMs(attempt, baseBackoffMs, 200);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }

  return { probeResult: null, retryCount: attempt, errorType: lastErrorType };
}

/**
 * Verifies a Lead's Phone number and records an immutable `LeadVerification` history entry.
 */
export async function verifyPhone(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<SingleVerificationOutcome> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';
      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          verifications: {
            where: { verificationType: 'PHONE' },
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const previousStatus = lead.verifications[0]?.status ?? lead.phoneValidationStatus ?? null;
      const phoneVal = validateLeadPhone(lead.phone || lead.normalizedPhone);

      let status: VerificationRecordStatus = 'UNKNOWN';
      let errorType: VerificationErrorType | null = null;
      if (phoneVal.status === 'VALID') {
        status = 'VERIFIED';
      } else if (phoneVal.status === 'INVALID') {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
      } else {
        status = 'UNKNOWN';
      }

      const expiresAt = computeVerificationExpiryDate('PHONE', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      const record = await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'PHONE',
          status,
          previousStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: phoneVal.reason,
          evidence: {
            rawPhone: lead.phone,
            normalizedPhone: phoneVal.normalizedPhone,
            phoneType: phoneVal.phoneType,
            validationState: phoneVal.status,
          },
          errorType,
          retryCount: 0,
          durationMs,
        },
      });

      if (phoneVal.normalizedPhone && phoneVal.normalizedPhone !== lead.normalizedPhone) {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            normalizedPhone: phoneVal.normalizedPhone,
            hasPhone: true,
          },
        });
      } else if (phoneVal.status === 'INVALID') {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            hasPhone: false,
          },
        });
      }

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        updateLastVerifiedAt: status === 'VERIFIED' ? now : undefined,
      });

      logVerificationEvent({
        leadId,
        verificationType: 'PHONE',
        source,
        previousStatus,
        newStatus: status,
        durationMs,
        result: phoneVal.reason,
        errorType,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        verificationType: 'PHONE',
        recordId: record.id,
        status,
        previousStatus,
        checkedAt: now,
        expiresAt,
        resultSummary: phoneVal.reason,
        errorType,
        retryCount: 0,
        durationMs,
        qualityEvaluation,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Verifies a Lead's Email and records an immutable `LeadVerification` history entry.
 */
export async function verifyEmail(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<SingleVerificationOutcome> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';
      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          verifications: {
            where: { verificationType: 'EMAIL' },
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const previousStatus = lead.verifications[0]?.status ?? lead.emailValidationStatus ?? null;
      const emailVal = validateLeadEmail(lead.email || lead.normalizedEmail);

      let status: VerificationRecordStatus = 'UNKNOWN';
      let errorType: VerificationErrorType | null = null;
      if (emailVal.status === 'DOMAIN_VALID' || emailVal.status === 'VALID_FORMAT') {
        status = 'VERIFIED';
      } else if (
        emailVal.status === 'INVALID_FORMAT' ||
        emailVal.status === 'DOMAIN_INVALID'
      ) {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
      }

      const expiresAt = computeVerificationExpiryDate('EMAIL', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      const record = await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'EMAIL',
          status,
          previousStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: emailVal.reason,
          evidence: {
            rawEmail: lead.email,
            normalizedEmail: emailVal.normalizedEmail,
            domain: emailVal.domain,
            validationState: emailVal.status,
          },
          errorType,
          retryCount: 0,
          durationMs,
        },
      });

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        updateLastVerifiedAt: status === 'VERIFIED' ? now : undefined,
      });

      logVerificationEvent({
        leadId,
        verificationType: 'EMAIL',
        source,
        previousStatus,
        newStatus: status,
        durationMs,
        result: emailVal.reason,
        errorType,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        verificationType: 'EMAIL',
        recordId: record.id,
        status,
        previousStatus,
        checkedAt: now,
        expiresAt,
        resultSummary: emailVal.reason,
        errorType,
        retryCount: 0,
        durationMs,
        qualityEvaluation,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Verifies a Lead's Website and records an immutable `LeadVerification` history entry.
 * Integrates with `src/lib/website-analyzer.ts` and updates `websiteStatus`, `websiteAnalysis`, and `websiteVerificationState`.
 */
export async function verifyWebsite(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<SingleVerificationOutcome> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';
      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          verifications: {
            where: { verificationType: 'WEBSITE' },
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const previousStatus = lead.verifications[0]?.status ?? lead.websiteVerificationState ?? null;

      const effectiveWebsiteProbe: WebsiteProbeFn | WebsiteProbeResponse | null | undefined =
        options.websiteProbe !== undefined
          ? options.websiteProbe
          : options.probeWebsiteLive
          ? (url: string) => verifyWebsiteHttpWithTimeout(url, options.probeTimeoutMs ?? 3500)
          : undefined;

      const { probeResult, retryCount, errorType: probeErrorType } = lead.website
        ? await runWebsiteProbeWithRetry(
            lead.website,
            effectiveWebsiteProbe,
            options.maxRetries ?? 2,
            options.baseBackoffMs ?? 20
          )
        : { probeResult: null, retryCount: 0, errorType: null };

      const websiteOutcome = evaluateWebsiteVerification(
        lead.website,
        lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
          ? (lead.websiteAnalysis as Record<string, unknown>)
          : null,
        probeResult
      );

      let status: VerificationRecordStatus = 'VERIFIED';
      let errorType: VerificationErrorType | null =
        probeErrorType ?? websiteOutcome.errorType ?? null;

      if (
        websiteOutcome.state === 'WEBSITE_UNREACHABLE' ||
        websiteOutcome.state === 'DOMAIN_INVALID'
      ) {
        status = 'FAILED';
        if (!errorType) {
          errorType =
            websiteOutcome.state === 'DOMAIN_INVALID'
              ? 'PERMANENT_FAILURE'
              : 'TEMPORARY_FAILURE';
        }
      } else {
        status = 'VERIFIED';
      }

      const expiresAt = computeVerificationExpiryDate('WEBSITE', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      const enrichedAnalysis = {
        ...websiteOutcome.analysis,
        verificationState: websiteOutcome.state,
        reachable: websiteOutcome.isReachable,
        redirected: websiteOutcome.state === 'WEBSITE_REDIRECT',
        finalUrl: websiteOutcome.redirectedTo ?? lead.website ?? null,
        checkedAt: now.toISOString(),
      };

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          websiteStatus: websiteOutcome.websiteStatus,
          normalizedDomain: websiteOutcome.normalizedDomain,
          websiteVerificationState: websiteOutcome.state,
          websiteAnalysis: enrichedAnalysis as unknown as Prisma.InputJsonValue,
        },
      });

      const record = await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'WEBSITE',
          status,
          previousStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: `${websiteOutcome.state}: ${websiteOutcome.reason}`,
          evidence: {
            rawWebsite: lead.website,
            state: websiteOutcome.state,
            websiteStatus: websiteOutcome.websiteStatus,
            normalizedDomain: websiteOutcome.normalizedDomain,
            isSocialOnly: websiteOutcome.isSocialOnly,
            isReachable: websiteOutcome.isReachable,
            hasHttps: websiteOutcome.hasHttps,
            redirectedTo: websiteOutcome.redirectedTo,
            httpStatusCode: websiteOutcome.httpStatusCode,
          },
          errorType,
          retryCount,
          durationMs,
        },
      });

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        websiteProbe: probeResult,
        updateLastVerifiedAt: status === 'VERIFIED' ? now : undefined,
      });

      if (options.recalculateOpportunityScore !== false) {
        await recalculateLeadScore(prisma, leadId, { trigger: 'SOURCE_REFRESH' }).catch(() => null);
      }

      logVerificationEvent({
        leadId,
        verificationType: 'WEBSITE',
        source,
        previousStatus,
        newStatus: status,
        durationMs,
        result: `${websiteOutcome.state}: ${websiteOutcome.reason}`,
        errorType,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        verificationType: 'WEBSITE',
        recordId: record.id,
        status,
        previousStatus,
        checkedAt: now,
        expiresAt,
        resultSummary: `${websiteOutcome.state}: ${websiteOutcome.reason}`,
        errorType,
        retryCount,
        durationMs,
        qualityEvaluation,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Verifies a Lead's Business Operational Status (`OPEN`, `CLOSED`, `TEMPORARILY_CLOSED`, `UNKNOWN`)
 * and records an immutable `LeadVerification` history entry.
 */
export async function verifyBusiness(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<SingleVerificationOutcome> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';
      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          verifications: {
            where: { verificationType: 'BUSINESS_STATUS' },
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
          feedbacks: {
            where: { useful: false },
            select: { reason: true },
          },
        },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const latestBizVerification = lead.verifications[0];
      const previousStatus = latestBizVerification?.status ?? lead.businessStatus ?? null;
      const wasClosedByDeveloperFeedback =
        lead.businessStatus === 'CLOSED' &&
        Boolean(latestBizVerification?.source?.startsWith('DEVELOPER_FEEDBACK'));

      // When an Admin or Verification Engine explicitly re-verifies business status after a developer feedback report,
      // do not let the feedback-induced CLOSED state permanently block re-verification if the business is actually open.
      const effectiveInputStatus =
        options.overrideBusinessStatus !== undefined
          ? options.overrideBusinessStatus
          : wasClosedByDeveloperFeedback
          ? undefined
          : lead.businessStatus;

      const negativeFeedbackReasons = wasClosedByDeveloperFeedback
        ? []
        : lead.feedbacks
            .map((f) => f.reason)
            .filter((r): r is FeedbackReason => Boolean(r));

      const bizEval = evaluateBusinessOperationalStatus({
        businessStatus: effectiveInputStatus,
        businessName: lead.businessName,
        negativeFeedbackReasons,
      });

      let status: VerificationRecordStatus = 'VERIFIED';
      let errorType: VerificationErrorType | null = null;

      if (bizEval.businessStatus === 'CLOSED') {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
      } else if (bizEval.businessStatus === 'TEMPORARILY_CLOSED') {
        status = 'NEEDS_REVERIFICATION';
        errorType = 'TEMPORARY_FAILURE';
      } else if (bizEval.businessStatus === 'UNKNOWN') {
        status = 'UNKNOWN';
      } else {
        status = 'VERIFIED';
      }

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          businessStatus: bizEval.businessStatus,
        },
      });

      const expiresAt = computeVerificationExpiryDate('BUSINESS_STATUS', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      const record = await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'BUSINESS_STATUS',
          status,
          previousStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: `${bizEval.businessStatus}: ${bizEval.reason}`,
          evidence: {
            businessStatus: bizEval.businessStatus,
            isClosed: bizEval.isClosed,
            isTemporarilyClosed: bizEval.isTemporarilyClosed,
          },
          errorType,
          retryCount: 0,
          durationMs,
        },
      });

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        updateLastVerifiedAt: status === 'VERIFIED' ? now : undefined,
      });

      logVerificationEvent({
        leadId,
        verificationType: 'BUSINESS_STATUS',
        source,
        previousStatus,
        newStatus: status,
        durationMs,
        result: `${bizEval.businessStatus}: ${bizEval.reason}`,
        errorType,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        verificationType: 'BUSINESS_STATUS',
        recordId: record.id,
        status,
        previousStatus,
        checkedAt: now,
        expiresAt,
        resultSummary: `${bizEval.businessStatus}: ${bizEval.reason}`,
        errorType,
        retryCount: 0,
        durationMs,
        qualityEvaluation,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Verifies a Lead's Location & Address consistency (`governorate`, `city`, `area`, `address`)
 * and records an immutable `LeadVerification` history entry.
 */
export async function verifyAddress(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<SingleVerificationOutcome> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';
      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          verifications: {
            where: { verificationType: 'ADDRESS' },
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const previousStatus = lead.verifications[0]?.status ?? null;
      const locResult = validateLeadLocation(lead.governorate, lead.city);

      let status: VerificationRecordStatus = 'VERIFIED';
      let errorType: VerificationErrorType | null = null;
      if (!locResult.isValid || locResult.hasLocationMismatch) {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
      }

      const expiresAt = computeVerificationExpiryDate('ADDRESS', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      const record = await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'ADDRESS',
          status,
          previousStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: locResult.reason,
          evidence: {
            governorate: lead.governorate,
            city: lead.city,
            area: lead.area,
            address: lead.address,
            hasLocationMismatch: locResult.hasLocationMismatch,
            expectedGovernorate: locResult.expectedGovernorate,
          },
          errorType,
          retryCount: 0,
          durationMs,
        },
      });

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        updateLastVerifiedAt: status === 'VERIFIED' ? now : undefined,
      });

      logVerificationEvent({
        leadId,
        verificationType: 'ADDRESS',
        source,
        previousStatus,
        newStatus: status,
        durationMs,
        result: locResult.reason,
        errorType,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        verificationType: 'ADDRESS',
        recordId: record.id,
        status,
        previousStatus,
        checkedAt: now,
        expiresAt,
        resultSummary: locResult.reason,
        errorType,
        retryCount: 0,
        durationMs,
        qualityEvaluation,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Verifies a Lead's Business Identity & Category consistency (`businessName`, `category`, canonical status)
 * and records an immutable `LeadVerification` history entry.
 */
export async function verifyIdentity(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<SingleVerificationOutcome> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';
      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          verifications: {
            where: { verificationType: 'IDENTITY' },
            orderBy: { checkedAt: 'desc' },
            take: 1,
          },
        },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const previousStatus = lead.verifications[0]?.status ?? null;
      const catResult = validateLeadCategory(lead.category, lead.businessName);
      const hasValidName = Boolean(lead.businessName && lead.businessName.trim().length >= 2);
      const isDuplicate = !lead.isCanonical || Boolean(lead.mergedIntoLeadId);

      let status: VerificationRecordStatus = 'VERIFIED';
      let errorType: VerificationErrorType | null = null;
      let summaryText = 'Business identity and category are valid and canonical';

      if (!hasValidName) {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summaryText = 'Business name is missing or invalid';
      } else if (isDuplicate) {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summaryText = `Lead is non-canonical duplicate merged into ${lead.mergedIntoLeadId}`;
      } else if (!catResult.isValid || catResult.hasCategoryMismatch) {
        status = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summaryText = catResult.reason;
      }

      const expiresAt = computeVerificationExpiryDate('IDENTITY', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      const record = await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'IDENTITY',
          status,
          previousStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: summaryText,
          evidence: {
            businessName: lead.businessName,
            category: lead.category,
            isCanonical: lead.isCanonical,
            mergedIntoLeadId: lead.mergedIntoLeadId,
            hasCategoryMismatch: catResult.hasCategoryMismatch,
            detectedCategory: catResult.detectedCategory,
          },
          errorType,
          retryCount: 0,
          durationMs,
        },
      });

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        updateLastVerifiedAt: status === 'VERIFIED' ? now : undefined,
      });

      logVerificationEvent({
        leadId,
        verificationType: 'IDENTITY',
        source,
        previousStatus,
        newStatus: status,
        durationMs,
        result: summaryText,
        errorType,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        verificationType: 'IDENTITY',
        recordId: record.id,
        status,
        previousStatus,
        checkedAt: now,
        expiresAt,
        resultSummary: summaryText,
        errorType,
        retryCount: 0,
        durationMs,
        qualityEvaluation,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Full multi-dimension verification of a Lead (`PHONE`, `EMAIL`, `WEBSITE`, `BUSINESS_STATUS`, `ADDRESS`, `IDENTITY`, plus summary `FULL` check).
 * Updates `lastVerifiedAt` when verification succeeds and recalculates quality, freshness, verification, and saleability statuses.
 */
export async function verifyLead(
  leadId: string,
  options: VerificationRunOptions = {}
): Promise<{
  leadId: string;
  previousVerificationStatus: string;
  newVerificationStatus: string;
  previousFreshnessStatus: string;
  newFreshnessStatus: string;
  qualityEvaluation: FullLeadQualityEvaluation;
  checks: Record<string, SingleVerificationOutcome>;
  durationMs: number;
}> {
  return withLeadVerificationLock(
    leadId,
    async () => {
      const startMs = Date.now();
      const now = options.now ?? new Date();
      const source = options.source || 'VERIFICATION_ENGINE';

      const existingLead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          verificationStatus: true,
          freshnessStatus: true,
          email: true,
        },
      });
      if (!existingLead) {
        throw new Error(`Lead ${leadId} not found`);
      }

      const previousVerificationStatus = existingLead.verificationStatus;
      const previousFreshnessStatus = existingLead.freshnessStatus;
      const childOptions: VerificationRunOptions = {
        ...options,
        now,
        recalculateOpportunityScore: false,
        _skipLock: true,
      };

      const phoneCheck = await verifyPhone(leadId, childOptions);
      const websiteCheck = await verifyWebsite(leadId, childOptions);
      const businessCheck = await verifyBusiness(leadId, childOptions);
      const addressCheck = await verifyAddress(leadId, childOptions);
      const identityCheck = await verifyIdentity(leadId, childOptions);

      const checks: Record<string, SingleVerificationOutcome> = {
        PHONE: phoneCheck,
        WEBSITE: websiteCheck,
        BUSINESS_STATUS: businessCheck,
        ADDRESS: addressCheck,
        IDENTITY: identityCheck,
      };

      if (existingLead.email) {
        checks.EMAIL = await verifyEmail(leadId, childOptions);
      }

      const hasCriticalFailure =
        businessCheck.status === 'FAILED' ||
        identityCheck.status === 'FAILED' ||
        addressCheck.status === 'FAILED' ||
        (phoneCheck.status === 'FAILED' && websiteCheck.status === 'FAILED');

      const fullStatus: VerificationRecordStatus = hasCriticalFailure
        ? 'FAILED'
        : (phoneCheck.status === 'VERIFIED' || phoneCheck.status === 'UNKNOWN') &&
          businessCheck.status === 'VERIFIED' &&
          addressCheck.status === 'VERIFIED' &&
          identityCheck.status === 'VERIFIED' &&
          (phoneCheck.status === 'VERIFIED' || websiteCheck.status === 'VERIFIED')
        ? 'VERIFIED'
        : 'NEEDS_REVERIFICATION';

      const { qualityConfig } = await getActiveQualityAndFreshnessConfig();
      const expiresAt = computeVerificationExpiryDate('FULL', now, qualityConfig);
      const durationMs = Math.max(1, Date.now() - startMs);

      await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: 'FULL',
          status: fullStatus,
          previousStatus: previousVerificationStatus,
          checkedAt: now,
          expiresAt,
          source,
          resultSummary: `Full verification completed (${fullStatus})`,
          evidence: {
            phone: phoneCheck.status,
            website: websiteCheck.status,
            business: businessCheck.status,
            address: addressCheck.status,
            identity: identityCheck.status,
          },
          errorType: hasCriticalFailure ? 'PERMANENT_FAILURE' : null,
          retryCount: websiteCheck.retryCount,
          durationMs,
        },
      });

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId, {
        now,
        updateLastVerifiedAt: now,
      });

      if (options.recalculateOpportunityScore !== false) {
        await recalculateLeadScore(prisma, leadId, { trigger: 'SOURCE_REFRESH' }).catch(() => null);
      }

      logVerificationEvent({
        leadId,
        verificationType: 'FULL',
        source,
        previousStatus: previousVerificationStatus,
        newStatus: qualityEvaluation.verificationStatus,
        durationMs,
        result: `Full verification -> ${qualityEvaluation.verificationStatus} (Quality: ${qualityEvaluation.qualityScore}, Saleability: ${qualityEvaluation.saleabilityStatus})`,
        errorType: hasCriticalFailure ? 'PERMANENT_FAILURE' : null,
        qualityScore: qualityEvaluation.qualityScore,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
      });

      return {
        leadId,
        previousVerificationStatus,
        newVerificationStatus: qualityEvaluation.verificationStatus,
        previousFreshnessStatus,
        newFreshnessStatus: qualityEvaluation.freshness.freshnessStatus,
        qualityEvaluation,
        checks,
        durationMs,
      };
    },
    Boolean(options._skipLock)
  );
}

/**
 * Integrates Developer Feedback (`WRONG_PHONE`, `ALREADY_HAS_WEBSITE`, `BUSINESS_CLOSED`, `WRONG_CATEGORY`, `WRONG_LOCATION`, `DUPLICATE`)
 * directly into the Verification & Quality Engine without deleting the Lead or modifying other developers' pipeline statuses.
 */
export async function recordDeveloperFeedbackVerification(params: {
  leadId: string;
  userId: string;
  useful: boolean;
  reason?: FeedbackReason | null;
  comment?: string | null;
  now?: Date;
}): Promise<FullLeadQualityEvaluation> {
  return withLeadVerificationLock(params.leadId, async () => {
    const now = params.now ?? new Date();
    const { leadId, userId, useful, reason, comment } = params;

    if (!useful && reason) {
      let vType: VerificationType = 'FEEDBACK';
      let vStatus: VerificationRecordStatus = 'NEEDS_REVERIFICATION';
      let errorType: VerificationErrorType | null = null;
      let summary = `Developer feedback reported ${reason}`;

      if (reason === 'WRONG_PHONE') {
        vType = 'PHONE';
        vStatus = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summary = 'Developer feedback reported WRONG_PHONE: Phone marked FAILED / NEEDS_REVERIFICATION';
      } else if (reason === 'ALREADY_HAS_WEBSITE') {
        vType = 'WEBSITE';
        vStatus = 'NEEDS_REVERIFICATION';
        summary = 'Developer feedback reported ALREADY_HAS_WEBSITE: Website requires re-verification';
      } else if (reason === 'BUSINESS_CLOSED') {
        vType = 'BUSINESS_STATUS';
        vStatus = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summary = 'Developer feedback reported BUSINESS_CLOSED: Business marked CLOSED / requires verification';
        await prisma.lead.update({
          where: { id: leadId },
          data: { businessStatus: 'CLOSED' },
        });
      } else if (reason === 'WRONG_CATEGORY') {
        vType = 'CATEGORY';
        vStatus = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summary = 'Developer feedback reported WRONG_CATEGORY';
      } else if (reason === 'WRONG_LOCATION') {
        vType = 'LOCATION';
        vStatus = 'FAILED';
        errorType = 'PERMANENT_FAILURE';
        summary = 'Developer feedback reported WRONG_LOCATION';
      }

      await prisma.leadVerification.create({
        data: {
          leadId,
          verificationType: vType,
          status: vStatus,
          previousStatus: 'VERIFIED',
          checkedAt: now,
          expiresAt: now, // Immediately requires attention/re-verification
          source: `DEVELOPER_FEEDBACK:${userId}`,
          resultSummary: comment ? `${summary} (${comment})` : summary,
          evidence: {
            feedbackReason: reason,
            comment: comment ?? null,
            reportedByUserId: userId,
          },
          errorType,
          retryCount: 0,
          durationMs: 1,
        },
      });

      logVerificationEvent({
        leadId,
        verificationType: vType,
        source: `DEVELOPER_FEEDBACK:${userId}`,
        previousStatus: 'VERIFIED',
        newStatus: vStatus,
        durationMs: 1,
        result: summary,
        errorType,
      });
    }

    return recalculateAndPersistLeadQuality(leadId, { now });
  });
}

/**
 * Retrieves leads prioritized for verification according to Phase 3 priority rules:
 * 1. Freshness priority bucket: VERY_STALE -> STALE -> NEEDS_VERIFICATION / UNKNOWN -> RECENT -> FRESH
 * 2. Within each bucket:
 *    - Opportunity Score (`score` descending)
 *    - Commercial value (`estimatedBudget` descending)
 *    - Developer demand (`currentPurchasers` + claims count descending)
 */
export async function getPrioritizedLeadsForVerification(options: {
  limit?: number;
  offset?: number;
  page?: number;
  leadIds?: string[];
  freshnessFilter?: string[];
  onlyCanonical?: boolean;
  now?: Date;
} = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const offset =
    typeof options.offset === 'number' && options.offset >= 0
      ? options.offset
      : typeof options.page === 'number' && options.page > 1
      ? (options.page - 1) * limit
      : 0;
  const now = options.now ?? new Date();
  const { qualityConfig, freshnessThresholds } = await getActiveQualityAndFreshnessConfig();

  const where: Prisma.LeadWhereInput = {};
  if (options.onlyCanonical !== false) {
    where.isCanonical = true;
  }
  if (options.leadIds && options.leadIds.length > 0) {
    where.id = { in: options.leadIds };
  }

  const boundedTake =
    options.leadIds && options.leadIds.length > 0
      ? Math.min(options.leadIds.length, 500)
      : Math.max((offset + limit) * 5, 250);

  const candidates = await prisma.lead.findMany({
    where,
    orderBy: [{ lastVerifiedAt: 'asc' }, { score: 'desc' }],
    take: boundedTake,
    include: {
      verifications: {
        orderBy: { checkedAt: 'desc' },
      },
      _count: {
        select: { claims: true },
      },
    },
  });

  // Dynamically compute freshness & verification status for each candidate so ordering reflects real-time age & expiry
  const enriched = candidates.map((lead) => {
    const evaluation = evaluateLeadQuality(
      {
        ...lead,
        websiteAnalysis:
          lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
            ? (lead.websiteAnalysis as Record<string, unknown>)
            : null,
      },
      { qualityConfig, freshnessThresholds, now }
    );
    const dynamicFreshness = evaluation.freshness.freshnessStatus;
    const priorityRank = getFreshnessVerificationPriorityRank(dynamicFreshness);
    const demandScore = (lead.currentPurchasers || 0) * 2 + (lead._count?.claims || 0);

    return {
      lead,
      dynamicFreshness,
      daysSinceVerified: evaluation.freshness.daysSinceVerified,
      priorityRank,
      demandScore,
      opportunityScore: lead.score,
      commercialValue: lead.estimatedBudget,
      qualityEvaluation: evaluation,
    };
  });

  const filtered =
    options.freshnessFilter && options.freshnessFilter.length > 0
      ? enriched.filter((item) => options.freshnessFilter!.includes(item.dynamicFreshness))
      : enriched;

  filtered.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank; // 1 (VERY_STALE) before 2 (STALE) before 3 (NEEDS_VERIFICATION) ...
    }
    if (b.opportunityScore !== a.opportunityScore) {
      return b.opportunityScore - a.opportunityScore;
    }
    if (b.commercialValue !== a.commercialValue) {
      return b.commercialValue - a.commercialValue;
    }
    if (b.demandScore !== a.demandScore) {
      return b.demandScore - a.demandScore;
    }
    const dA = a.daysSinceVerified ?? 999999;
    const dB = b.daysSinceVerified ?? 999999;
    return dB - dA;
  });

  return filtered.slice(offset, offset + limit);
}

/**
 * Bounded Batch Verification runner with deterministic priority ordering and per-lead failure isolation.
 */
export async function verifyLeadsBatch(
  options: BatchVerificationOptions = {}
): Promise<BatchVerificationResult> {
  const startMs = Date.now();
  const now = options.now ?? new Date();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 20, 50));

  const prioritized = await getPrioritizedLeadsForVerification({
    limit: batchSize,
    offset: options.offset,
    page: options.page,
    leadIds: options.leadIds,
    freshnessFilter: options.freshnessFilter,
    onlyCanonical: options.onlyCanonical,
    now,
  });

  const results: BatchVerificationResult['results'] = [];
  const errors: BatchVerificationResult['errors'] = [];
  let verifiedCount = 0;
  let partiallyVerifiedCount = 0;
  let failedCount = 0;

  for (const item of prioritized) {
    try {
      const outcome = await verifyLead(item.lead.id, {
        ...options,
        now,
        source: options.source || 'BATCH_VERIFICATION',
      });

      if (outcome.newVerificationStatus === 'VERIFIED') {
        verifiedCount++;
      } else if (outcome.newVerificationStatus === 'PARTIALLY_VERIFIED') {
        partiallyVerifiedCount++;
      } else if (outcome.newVerificationStatus === 'FAILED_VERIFICATION') {
        failedCount++;
      }

      results.push({
        leadId: item.lead.id,
        businessName: item.lead.businessName,
        previousFreshnessStatus: item.dynamicFreshness,
        newFreshnessStatus: outcome.newFreshnessStatus,
        previousVerificationStatus: outcome.previousVerificationStatus,
        newVerificationStatus: outcome.newVerificationStatus,
        qualityScore: outcome.qualityEvaluation.qualityScore,
        qualityStatus: outcome.qualityEvaluation.qualityStatus,
        saleabilityStatus: outcome.qualityEvaluation.saleabilityStatus,
      });
    } catch (err) {
      failedCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      errors.push({
        leadId: item.lead.id,
        error: errorMessage,
      });
      logVerificationEvent({
        leadId: item.lead.id,
        verificationType: 'FULL',
        source: options.source || 'BATCH_VERIFICATION',
        previousStatus: item.lead.verificationStatus,
        newStatus: 'FAILED_VERIFICATION',
        durationMs: 1,
        result: `Batch verification error isolated for lead ${item.lead.id}: ${errorMessage}`,
        errorType: classifyVerificationError(err),
      });
    }
  }

  return {
    processedCount: results.length,
    verifiedCount,
    partiallyVerifiedCount,
    failedCount,
    durationMs: Math.max(1, Date.now() - startMs),
    results,
    errors,
  };
}

export const VerificationService = {
  verifyLead,
  verifyLeadFull: verifyLead,
  verifyPhone,
  verifyEmail,
  verifyWebsite,
  verifyBusiness,
  verifyBusinessStatus: verifyBusiness,
  verifyAddress,
  verifyIdentity,
  verifyLeadsBatch,
  getPrioritizedLeadsForVerification,
  recalculateAndPersistLeadQuality,
  recordDeveloperFeedbackVerification,
  handleFeedbackSignal: recordDeveloperFeedbackVerification,
  withLeadVerificationLock,
  computeRetryBackoffMs,
  classifyVerificationError,
};


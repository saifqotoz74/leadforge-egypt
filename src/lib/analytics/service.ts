import { RuleReviewStatus, RuleReviewType } from '@prisma/client';
import { createAuditLog } from '../audit';
import {
  BUSINESS_CATEGORIES,
  CATEGORY_LABELS_AR,
  DEVELOPER_SERVICES,
} from '../constants';
import { ensureDbReady, prisma } from '../db';
import { DEFAULT_MATCHING_RULES } from '../matching/rules';
import { DEFAULT_SCORING_RULES } from '../scoring-engine';
import { computeSourceCostEconomics } from '../collectors/health-and-supply';
import {
  buildDeveloperCreditValueMap,
  classifyMatchStrengthBand,
  doesLeadMatchDimensionFilters,
  EngagementStageFlags,
  evaluateClaimEngagementFlags,
  normalizeInvalidReasonCode,
  normalizeLostReasonCode,
  resolveCanonicalLocation,
  resolveCanonicalService,
  resolveEnrichmentSources,
  resolvePrimaryOriginSource,
} from './helpers';
import {
  buildRateMetric,
  buildValueMetric,
  calculateCentralizedFunnelMetrics,
  METRIC_DICTIONARY,
} from './metric-dictionary';
import {
  compareObservedVsBaseline,
  computeDeterministicRate,
  paginateAndSort,
  roundTo,
  summarizeNumericValues,
} from './statistics';
import {
  formatBusinessDateKey,
  isWithinDateRange,
  normalizeAnalyticsFilters,
  serializeActiveFilters,
} from './time-dimensions';
import {
  AnalyticsEngineError,
  AnalyticsFilterInput,
  DeterministicAnomalyFlag,
  NormalizedAnalyticsFilters,
  RulePerformanceRow,
  RuleReviewDecisionInput,
  StandardizedMetricResult,
} from './types';

const SCORE_BAND_ORDER = ['PREMIUM', 'HOT', 'WARM', 'COLD'] as const;
const QUALITY_BAND_ORDER = [
  'EXCELLENT',
  'HIGH',
  'MEDIUM',
  'LOW',
  'VERY_LOW',
] as const;
const FRESHNESS_BAND_ORDER = [
  'FRESH',
  'RECENT',
  'NEEDS_VERIFICATION',
  'STALE',
  'VERY_STALE',
  'UNKNOWN',
] as const;
const MATCH_STRENGTH_BAND_ORDER = [
  '75-100',
  '50-74',
  '25-49',
  '0-24',
] as const;

const CANONICAL_LOST_REASONS = [
  'NO_BUDGET',
  'PRICE',
  'COMPETITOR',
  'NO_RESPONSE',
  'TIMING',
  'WRONG_CONTACT',
  'NOT_INTERESTED',
  'OTHER',
] as const;

const CANONICAL_INVALID_REASONS = [
  'WRONG_PHONE',
  'WRONG_EMAIL',
  'BUSINESS_CLOSED',
  'DUPLICATE',
  'WRONG_CATEGORY',
  'WRONG_LOCATION',
  'FAKE_BUSINESS',
  'ALREADY_HAS_WEBSITE',
  'OTHER',
] as const;

const QUALITY_RULE_DEFINITIONS = [
  {
    key: 'PHONE_VALID',
    name: 'صلاحية رقم الهاتف المصري',
    nameEn: 'Valid Egyptian Phone Number',
    category: 'CONTACTABILITY',
    points: 20,
    isPositive: true,
    matchesLead: (lead: { phoneValidationStatus: string; qualityFlags: string[] }) =>
      lead.phoneValidationStatus === 'VALID' ||
      lead.qualityFlags.includes('PHONE_VALID'),
  },
  {
    key: 'EMAIL_VALID',
    name: 'صلاحية البريد الإلكتروني',
    nameEn: 'Valid Business Email',
    category: 'CONTACTABILITY',
    points: 10,
    isPositive: true,
    matchesLead: (lead: { emailValidationStatus: string; qualityFlags: string[] }) =>
      lead.emailValidationStatus === 'VALID' ||
      lead.qualityFlags.includes('EMAIL_VALID'),
  },
  {
    key: 'BUSINESS_OPEN_VERIFIED',
    name: 'النشاط التجاري مفتوح ويعمل',
    nameEn: 'Verified Open Business Status',
    category: 'VERIFICATION',
    points: 15,
    isPositive: true,
    matchesLead: (lead: { businessStatus: string }) =>
      lead.businessStatus === 'OPEN',
  },
  {
    key: 'HIGH_COMPLETENESS',
    name: 'اكتمال بيانات النشاط (>= 80%)',
    nameEn: 'High Profile Completeness (>= 80%)',
    category: 'COMPLETENESS',
    points: 15,
    isPositive: true,
    matchesLead: (lead: { completenessScore: number }) =>
      (lead.completenessScore ?? 0) >= 80,
  },
  {
    key: 'FRESH_VERIFICATION',
    name: 'بيانات محدثة (FRESH)',
    nameEn: 'Fresh Verification Window',
    category: 'FRESHNESS',
    points: 15,
    isPositive: true,
    matchesLead: (lead: { freshnessStatus: string }) =>
      lead.freshnessStatus === 'FRESH',
  },
  {
    key: 'VERIFIED_STATUS',
    name: 'توثيق كامل للبيانات (VERIFIED)',
    nameEn: 'Fully Verified Lead Status',
    category: 'VERIFICATION',
    points: 20,
    isPositive: true,
    matchesLead: (lead: { verificationStatus: string }) =>
      lead.verificationStatus === 'VERIFIED',
  },
  {
    key: 'STALE_OR_NEEDS_VERIFY_PENALTY',
    name: 'تقليص بسبب تقادم البيانات أو الحاجة لإعادة التحقق',
    nameEn: 'Stale or Needs Reverification Flag',
    category: 'FRESHNESS',
    points: -20,
    isPositive: false,
    matchesLead: (lead: { freshnessStatus: string; qualityFlags: string[] }) =>
      ['NEEDS_VERIFICATION', 'STALE', 'VERY_STALE'].includes(lead.freshnessStatus) ||
      lead.qualityFlags.includes('STALE_RECORD') ||
      lead.qualityFlags.includes('REQUIRES_REVERIFICATION'),
  },
  {
    key: 'INVALID_CONTACT_PENALTY',
    name: 'تقليص بسبب عدم صلاحية الهاتف أو البريد',
    nameEn: 'Invalid Phone or Email Penalty',
    category: 'CONTACTABILITY',
    points: -35,
    isPositive: false,
    matchesLead: (lead: {
      phoneValidationStatus: string;
      emailValidationStatus: string;
      qualityFlags: string[];
    }) =>
      lead.phoneValidationStatus === 'INVALID' ||
      lead.emailValidationStatus === 'INVALID' ||
      lead.qualityFlags.includes('INVALID_PHONE') ||
      lead.qualityFlags.includes('INVALID_EMAIL'),
  },
];

let cachedRawDataset: {
  data: Awaited<ReturnType<typeof queryRawAnalyticsDataset>>;
  expiresAt: number;
} | null = null;

let inFlightRawDatasetPromise: Promise<Awaited<ReturnType<typeof queryRawAnalyticsDataset>>> | null = null;

function fetchRawAnalyticsDatasetCoalesced() {
  const now = Date.now();
  if (cachedRawDataset && cachedRawDataset.expiresAt > now) {
    return Promise.resolve(cachedRawDataset.data);
  }
  if (!inFlightRawDatasetPromise) {
    inFlightRawDatasetPromise = queryRawAnalyticsDataset()
      .then((data) => {
        cachedRawDataset = { data, expiresAt: Date.now() + 30_000 };
        return data;
      })
      .finally(() => {
        inFlightRawDatasetPromise = null;
      });
  }
  return inFlightRawDatasetPromise;
}

async function queryRawAnalyticsDataset() {
  return Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.leadSource.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.sourceRecord.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.duplicateCandidate.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.leadVerification.findMany({
      orderBy: { checkedAt: 'desc' },
    }),
    prisma.leadClaim.findMany({
      orderBy: { claimedAt: 'desc' },
    }),
    prisma.leadEngagement.findMany({
      orderBy: { claimedAt: 'desc' },
    }),
    prisma.leadFeedback.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.matchSnapshot.findMany({
      orderBy: { calculatedAt: 'desc' },
    }),
    prisma.scoringRule.findMany({
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.matchingRule.findMany({
      orderBy: { priority: 'asc' },
    }),
    prisma.leadScore.findMany({
      orderBy: { calculatedAt: 'desc' },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { role: 'DEVELOPER' },
          { claims: { some: {} } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        developerProfile: true,
        subscription: {
          include: { plan: true },
        },
        creditAccount: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.subscription.findMany({
      include: { plan: true },
    }),
    prisma.payment.findMany({
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.developerCreditAccount.findMany(),
    prisma.creditTransaction.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'LEAD_CLAIM_FAILED',
            'LEAD_CLAIM_CONFLICT',
            'FEEDBACK_ABUSE_SIGNAL',
            'RAPID_STATUS_CHANGE_FLAGGED',
            'CONTACT_ATTEMPT_RATE_LIMITED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
}


/**
 * Loads the analytical dataset context with database-level filtering where possible
 * and singleflight coalescing for concurrent dashboard API requests.
 */
async function loadAnalyticsContext(rawFilters: AnalyticsFilterInput = {}) {
  await ensureDbReady();
  const filters = normalizeAnalyticsFilters(rawFilters);

  const [
    allLeadsRaw,
    leadSources,
    sourceRecords,
    duplicateCandidates,
    verifications,
    allClaimsRaw,
    allEngagementsRaw,
    allFeedbacksRaw,
    matchSnapshotsRaw,
    scoringRulesDb,
    matchingRulesDb,
    leadScoresRaw,
    developersRaw,
    plansRaw,
    subscriptionsRaw,
    paymentsRaw,
    creditAccountsRaw,
    creditTransactionsRaw,
    auditLogsRaw,
  ] = await fetchRawAnalyticsDatasetCoalesced();

  // Build lookup maps
  const engagementByClaimId = new Map<
    string,
    (typeof allEngagementsRaw)[number]
  >();
  const engagementByLeadDev = new Map<
    string,
    (typeof allEngagementsRaw)[number]
  >();
  for (const eng of allEngagementsRaw) {
    engagementByClaimId.set(eng.claimId, eng);
    engagementByLeadDev.set(`${eng.leadId}:${eng.developerId}`, eng);
  }

  // Developer credit EGP values (for deterministic claim revenue attribution without double counting)
  const completedPaymentsAll = paymentsRaw.filter(
    (p) => p.status === 'COMPLETED'
  );
  const developerCreditValueMap = buildDeveloperCreditValueMap(
    developersRaw,
    completedPaymentsAll
  );

  // Filter claims by developerId if specified
  const developerClaimedLeadIds = filters.developerId
    ? new Set(
        allClaimsRaw
          .filter(
            (c) => (c.developerId || c.userId) === filters.developerId
          )
          .map((c) => c.leadId)
      )
    : null;

  // Canonical vs non-canonical leads matching dimension & date filters
  const claimedLeadIdsInDateWindow =
    filters.cohortBy === 'claimed_date'
      ? new Set(
          allClaimsRaw
            .filter((c) => {
              const claimDevId = c.developerId || c.userId;
              if (filters.developerId && claimDevId !== filters.developerId) {
                return false;
              }
              return isWithinDateRange(c.claimedAt, filters.dateRange);
            })
            .map((c) => c.leadId)
        )
      : null;

  const canonicalLeads = allLeadsRaw.filter((l) => {
    if (!l.isCanonical) return false;
    if (filters.cohortBy === 'claimed_date' && claimedLeadIdsInDateWindow) {
      return (
        claimedLeadIdsInDateWindow.has(l.id) &&
        doesLeadMatchDimensionFilters(l, filters, {
          skipDateCheck: true,
          claimedLeadIdsForDeveloper: developerClaimedLeadIds,
        })
      );
    }
    return doesLeadMatchDimensionFilters(l, filters, {
      claimedLeadIdsForDeveloper: developerClaimedLeadIds,
    });
  });

  const nonCanonicalDuplicateLeads = allLeadsRaw.filter(
    (l) =>
      !l.isCanonical &&
      doesLeadMatchDimensionFilters(l, filters, {
        claimedLeadIdsForDeveloper: developerClaimedLeadIds,
      })
  );

  const canonicalLeadById = new Map<string, (typeof allLeadsRaw)[number]>();
  for (const l of canonicalLeads) {
    canonicalLeadById.set(l.id, l);
  }

  const allLeadById = new Map<string, (typeof allLeadsRaw)[number]>();
  for (const l of allLeadsRaw) {
    allLeadById.set(l.id, l);
  }

  // Evaluate claim + engagement flags for claims whose canonical Lead is in canonicalLeadById
  // so that overview, sources, niches, locations, services, developers, and funnel always sum identically
  const evaluatedClaims: Array<
    EngagementStageFlags & {
      accessType: 'SHARED' | 'EXCLUSIVE';
      creditCostReason: string;
      failureCode: string | null;
      failureReason: string | null;
      matchStrengthAtClaim: number | null;
      attributedRevenueEgp: number;
      grossClaimRevenueEgp: number;
      refundedClaimRevenueEgp: number;
      lead: (typeof allLeadsRaw)[number];
    }
  > = [];

  for (const claim of allClaimsRaw) {
    const lead = canonicalLeadById.get(claim.leadId);
    if (!lead) continue;

    const claimDevId = claim.developerId || claim.userId;
    if (filters.developerId && claimDevId !== filters.developerId) {
      continue;
    }

    if (filters.cohortBy === 'claimed_date') {
      if (!isWithinDateRange(claim.claimedAt, filters.dateRange)) {
        continue;
      }
    } else if (
      filters.dateRange.endDate &&
      claim.claimedAt.getTime() > filters.dateRange.endDate.getTime()
    ) {
      continue;
    }

    const eng =
      engagementByClaimId.get(claim.id) ||
      engagementByLeadDev.get(`${claim.leadId}:${claimDevId}`) ||
      null;
    const flags = evaluateClaimEngagementFlags(claim, eng);
    const creditValEgp = developerCreditValueMap.get(claimDevId) || 0;
    const grossClaimRevenueEgp = flags.isFailedClaim
      ? 0
      : roundTo(flags.creditsCharged * creditValEgp, 2);
    const refundedClaimRevenueEgp = flags.isFailedClaim
      ? 0
      : roundTo(flags.creditsRefunded * creditValEgp, 2);
    const attributedRevenueEgp = flags.isFailedClaim
      ? 0
      : roundTo(flags.netCreditsConsumed * creditValEgp, 2);

    const accessType: 'SHARED' | 'EXCLUSIVE' =
      (claim.accessType || lead.accessType || lead.leadType) === 'EXCLUSIVE'
        ? 'EXCLUSIVE'
        : 'SHARED';

    evaluatedClaims.push({
      ...flags,
      accessType,
      creditCostReason: claim.creditCostReason || `${accessType}_LEAD`,
      failureCode: claim.failureCode || null,
      failureReason: claim.failureReason || null,
      matchStrengthAtClaim: claim.matchStrengthAtClaim ?? null,
      attributedRevenueEgp,
      grossClaimRevenueEgp,
      refundedClaimRevenueEgp,
      lead,
    });
  }

  // Successful (non-failed) claims
  const successfulClaims = evaluatedClaims.filter((c) => !c.isFailedClaim);
  const failedClaims = evaluatedClaims.filter((c) => c.isFailedClaim);

  // Map claims by leadId
  const claimsByLeadId = new Map<string, typeof successfulClaims>();
  for (const c of successfulClaims) {
    const arr = claimsByLeadId.get(c.leadId) || [];
    arr.push(c);
    claimsByLeadId.set(c.leadId, arr);
  }

  return {
    filters,
    allLeadsRaw,
    canonicalLeads,
    nonCanonicalDuplicateLeads,
    canonicalLeadById,
    allLeadById,
    leadSources,
    sourceRecords,
    duplicateCandidates,
    verifications,
    allClaimsRaw,
    evaluatedClaims,
    successfulClaims,
    failedClaims,
    claimsByLeadId,
    allEngagementsRaw,
    engagementByClaimId,
    engagementByLeadDev,
    allFeedbacksRaw,
    matchSnapshotsRaw,
    scoringRulesDb,
    matchingRulesDb,
    leadScoresRaw,
    developersRaw,
    developerCreditValueMap,
    plansRaw,
    subscriptionsRaw,
    paymentsRaw,
    creditAccountsRaw,
    creditTransactionsRaw,
    auditLogsRaw,
  };
}

/**
 * Helper to aggregate funnel, quality, opportunity, and revenue metrics for any subset of Canonical Leads.
 */
function aggregateLeadSegmentMetrics(
  leadsSubset: Array<{
    id: string;
    score: number;
    qualityScore: number;
    completenessScore: number;
    status: string;
    saleabilityStatus: string;
    verificationStatus: string;
    freshnessStatus: string;
    availableForClaim: boolean;
  }>,
  claimsByLeadId: Map<
    string,
    Array<
      EngagementStageFlags & {
        attributedRevenueEgp: number;
        grossClaimRevenueEgp: number;
        refundedClaimRevenueEgp: number;
      }
    >
  >,
  filters: NormalizedAnalyticsFilters
) {
  const leadsCount = leadsSubset.length;
  let availableCount = 0;
  let saleableCount = 0;
  let verifiedCount = 0;
  let staleCount = 0;
  let invalidLeadCount = 0;

  const oppScores: number[] = [];
  const qualScores: number[] = [];
  const compScores: number[] = [];

  let claimsCount = 0;
  let distinctClaimedLeads = 0;
  let contactedCount = 0;
  let repliedCount = 0;
  let interestedCount = 0;
  let meetingCount = 0;
  let proposalCount = 0;
  let negotiationCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let notInterestedCount = 0;
  let invalidEngagementCount = 0;
  let attributedRevenueEgp = 0;
  let creditsConsumed = 0;
  let creditsRefunded = 0;
  const projectValuesWon: number[] = [];

  for (const lead of leadsSubset) {
    oppScores.push(lead.score ?? 0);
    qualScores.push(lead.qualityScore ?? 0);
    compScores.push(lead.completenessScore ?? 0);

    if (lead.status === 'AVAILABLE' && lead.availableForClaim) {
      availableCount += 1;
    }
    if (
      lead.saleabilityStatus === 'AVAILABLE' ||
      lead.saleabilityStatus === 'CLAIMED_FULL'
    ) {
      saleableCount += 1;
    }
    if (
      lead.verificationStatus === 'VERIFIED' ||
      lead.verificationStatus === 'PARTIALLY_VERIFIED'
    ) {
      verifiedCount += 1;
    }
    if (
      lead.freshnessStatus === 'STALE' ||
      lead.freshnessStatus === 'VERY_STALE' ||
      lead.status === 'STALE'
    ) {
      staleCount += 1;
    }

    const leadClaims = claimsByLeadId.get(lead.id) || [];
    if (leadClaims.length > 0) {
      distinctClaimedLeads += 1;
    }

    let hasInvalidClaim = false;
    for (const c of leadClaims) {
      claimsCount += 1;
      if (c.isContacted) contactedCount += 1;
      if (c.isReplied) repliedCount += 1;
      if (c.isInterested) interestedCount += 1;
      if (c.isMeeting) meetingCount += 1;
      if (c.isProposal) proposalCount += 1;
      if (c.isNegotiation) negotiationCount += 1;
      if (c.isWon) {
        wonCount += 1;
        if (c.estimatedProjectValueEgp > 0) {
          projectValuesWon.push(c.estimatedProjectValueEgp);
        }
      }
      if (c.isLost) lostCount += 1;
      if (c.isNotInterested) notInterestedCount += 1;
      if (c.isInvalid) {
        invalidEngagementCount += 1;
        hasInvalidClaim = true;
      }
      attributedRevenueEgp = roundTo(
        attributedRevenueEgp + c.attributedRevenueEgp,
        2
      );
      creditsConsumed += c.netCreditsConsumed;
      creditsRefunded += c.creditsRefunded;
    }

    if (
      lead.status === 'INVALID' ||
      lead.saleabilityStatus === 'INVALID' ||
      hasInvalidClaim
    ) {
      invalidLeadCount += 1;
    }
  }

  const funnel = calculateCentralizedFunnelMetrics(
    {
      claimed: claimsCount,
      contacted: contactedCount,
      replied: repliedCount,
      interested: interestedCount,
      meetings: meetingCount,
      proposals: proposalCount,
      negotiations: negotiationCount,
      won: wonCount,
      lost: lostCount,
      notInterested: notInterestedCount,
      invalid: invalidEngagementCount,
    },
    filters
  );

  const oppSummary = summarizeNumericValues(oppScores);
  const qualSummary = summarizeNumericValues(qualScores);
  const compSummary = summarizeNumericValues(compScores);
  const wonValueSummary = summarizeNumericValues(projectValuesWon);

  const claimRate = buildRateMetric(
    'CLAIM_RATE',
    distinctClaimedLeads,
    leadsCount,
    filters
  );
  const invalidRate = buildRateMetric(
    'INVALID_RATE',
    invalidLeadCount,
    leadsCount,
    filters
  );
  const verificationRate = buildRateMetric(
    'VERIFICATION_RATE',
    verifiedCount,
    leadsCount,
    filters
  );
  const revenuePerLead = buildValueMetric(
    'REVENUE_PER_LEAD',
    attributedRevenueEgp,
    leadsCount,
    filters
  );
  const revenuePerClaim = buildValueMetric(
    'REVENUE_PER_CLAIM',
    attributedRevenueEgp,
    claimsCount,
    filters
  );

  return {
    leadsCount,
    availableCount,
    saleableCount,
    verifiedCount,
    staleCount,
    invalidLeadCount,
    distinctClaimedLeads,
    claimsCount,
    contactedCount,
    repliedCount,
    interestedCount,
    meetingCount,
    proposalCount,
    negotiationCount,
    wonCount,
    lostCount,
    notInterestedCount,
    invalidEngagementCount,
    attributedRevenueEgp,
    creditsConsumed,
    creditsRefunded,
    totalEstimatedProjectValueEgp: wonValueSummary.sum,
    averageEstimatedProjectValueEgp: wonValueSummary.average,
    opportunityScoreStats: oppSummary,
    qualityScoreStats: qualSummary,
    completenessScoreStats: compSummary,
    rates: {
      claimRate,
      contactRate: funnel.stageRates.contactRate,
      replyRate: funnel.stageRates.replyRate,
      interestRate: funnel.stageRates.interestRate,
      meetingRate: funnel.stageRates.meetingRate,
      meetingRateOfInterested: funnel.stageRates.meetingRateOfInterested,
      meetingRateOfClaimed: funnel.overallRates.meetingRateOfClaimed,
      winRate: funnel.overallRates.winRateOfClaimed,
      winRateOfMeetings: funnel.stageRates.winRate,
      winRateOfContacted: funnel.overallRates.winRateOfContacted,
      winRateOfCompleted: funnel.overallRates.winRateOfCompleted,
      invalidRate,
      verificationRate,
    },
    economics: {
      attributedRevenueEgp,
      revenuePerLead,
      revenuePerClaim,
      creditsConsumed,
      creditsRefunded,
    },
  };
}

// ============================================================================
// 1. ADMIN EXECUTIVE OVERVIEW (Layer 1–6 Metrics + Anomalies)
// ============================================================================
export async function getAdminOverviewAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, nonCanonicalDuplicateLeads, successfulClaims, failedClaims } =
    ctx;

  // --- LAYER 1: INVENTORY ---
  const totalLeads = canonicalLeads.length;
  const availableLeads = canonicalLeads.filter(
    (l) => l.status === 'AVAILABLE' && l.availableForClaim
  ).length;
  const claimedLeads = canonicalLeads.filter(
    (l) => (ctx.claimsByLeadId.get(l.id)?.length || 0) > 0 || l.currentPurchasers > 0
  ).length;
  const sharedLeads = canonicalLeads.filter(
    (l) => (l.accessType || l.leadType) === 'SHARED'
  ).length;
  const exclusiveLeads = canonicalLeads.filter(
    (l) => (l.accessType || l.leadType) === 'EXCLUSIVE' || l.exclusive
  ).length;
  const staleLeads = canonicalLeads.filter(
    (l) =>
      l.freshnessStatus === 'STALE' ||
      l.freshnessStatus === 'VERY_STALE' ||
      l.status === 'STALE'
  ).length;
  const requiresVerificationLeads = canonicalLeads.filter(
    (l) =>
      l.freshnessStatus === 'NEEDS_VERIFICATION' ||
      l.status === 'REQUIRES_VERIFICATION' ||
      l.saleabilityStatus === 'REQUIRES_VERIFICATION'
  ).length;

  const distinctInvalidLeadIds = new Set<string>();
  for (const l of canonicalLeads) {
    if (l.status === 'INVALID' || l.saleabilityStatus === 'INVALID') {
      distinctInvalidLeadIds.add(l.id);
    }
  }
  for (const c of successfulClaims) {
    if (c.isInvalid) {
      distinctInvalidLeadIds.add(c.leadId);
    }
  }
  const invalidLeads = distinctInvalidLeadIds.size;

  const duplicateSourceRecordsCount = ctx.sourceRecords.filter(
    (sr) =>
      (sr.decision === 'DUPLICATE_CONFIRMED' || sr.status === 'DUPLICATE') &&
      isWithinDateRange(sr.createdAt, filters.dateRange)
  ).length;
  const duplicateLeads =
    nonCanonicalDuplicateLeads.length + duplicateSourceRecordsCount;

  const saleableLeads = canonicalLeads.filter(
    (l) =>
      l.saleabilityStatus === 'AVAILABLE' ||
      l.saleabilityStatus === 'CLAIMED_FULL'
  ).length;

  // --- LAYER 2: QUALITY ---
  const qualityScores = canonicalLeads.map((l) => l.qualityScore ?? 0);
  const qualityStats = summarizeNumericValues(qualityScores);
  const qualityDistribution: Record<string, number> = {
    VERY_LOW: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    EXCELLENT: 0,
  };
  const freshnessDistribution: Record<string, number> = {
    FRESH: 0,
    RECENT: 0,
    NEEDS_VERIFICATION: 0,
    STALE: 0,
    VERY_STALE: 0,
    UNKNOWN: 0,
  };
  let verifiedCount = 0;

  for (const l of canonicalLeads) {
    qualityDistribution[l.qualityStatus] =
      (qualityDistribution[l.qualityStatus] || 0) + 1;
    freshnessDistribution[l.freshnessStatus] =
      (freshnessDistribution[l.freshnessStatus] || 0) + 1;
    if (
      l.verificationStatus === 'VERIFIED' ||
      l.verificationStatus === 'PARTIALLY_VERIFIED'
    ) {
      verifiedCount += 1;
    }
  }

  const verificationRate = buildRateMetric(
    'VERIFICATION_RATE',
    verifiedCount,
    totalLeads,
    filters
  );
  const invalidRate = buildRateMetric(
    'INVALID_RATE',
    invalidLeads,
    totalLeads,
    filters
  );
  const totalEvaluatedForDedup = totalLeads + duplicateLeads;
  const duplicateRate = buildRateMetric(
    'DUPLICATE_RATE',
    duplicateLeads,
    totalEvaluatedForDedup,
    filters
  );

  // --- LAYER 3: OPPORTUNITY ---
  const oppScores = canonicalLeads.map((l) => l.score ?? 0);
  const opportunityStats = summarizeNumericValues(oppScores);
  const opportunityDistribution: Record<string, number> = {
    COLD: 0,
    WARM: 0,
    HOT: 0,
    PREMIUM: 0,
  };
  for (const l of canonicalLeads) {
    opportunityDistribution[l.temperature] =
      (opportunityDistribution[l.temperature] || 0) + 1;
  }

  // --- LAYER 4: MATCHING ---
  const filteredSnapshots = ctx.matchSnapshotsRaw.filter((ms) => {
    if (!canonicalLeadByIdHas(ctx.canonicalLeadById, ms.leadId)) return false;
    if (filters.developerId && ms.developerId !== filters.developerId) return false;
    if (filters.matchVersion && ms.matchVersion !== filters.matchVersion) return false;
    return true;
  });
  const totalEvaluatedMatches = filteredSnapshots.length;
  const eligibleMatchesList = filteredSnapshots.filter((ms) => ms.eligible);
  const eligibleMatches = eligibleMatchesList.length;
  const rejectedMatches = totalEvaluatedMatches - eligibleMatches;
  const matchStrengthStats = summarizeNumericValues(
    eligibleMatchesList.map((ms) => ms.matchStrength)
  );

  const claimedPairSet = new Set(
    successfulClaims.map((c) => `${c.leadId}:${c.developerId}`)
  );
  const claimedEligibleMatches = eligibleMatchesList.filter((ms) =>
    claimedPairSet.has(`${ms.leadId}:${ms.developerId}`)
  ).length;

  const matchRate = buildRateMetric(
    'MATCH_RATE',
    eligibleMatches,
    totalEvaluatedMatches,
    filters
  );
  const claimsPerMatchRate = buildRateMetric(
    'CLAIMS_PER_MATCH_RATE',
    claimedEligibleMatches,
    eligibleMatches,
    filters
  );

  // --- LAYER 5: SALES FUNNEL ---
  let contacted = 0;
  let replied = 0;
  let interested = 0;
  let meetings = 0;
  let proposals = 0;
  let negotiations = 0;
  let won = 0;
  let lost = 0;
  let notInterested = 0;
  let invalidEngagements = 0;
  let totalEstimatedProjectValueEgp = 0;

  for (const c of successfulClaims) {
    if (c.isContacted) contacted += 1;
    if (c.isReplied) replied += 1;
    if (c.isInterested) interested += 1;
    if (c.isMeeting) meetings += 1;
    if (c.isProposal) proposals += 1;
    if (c.isNegotiation) negotiations += 1;
    if (c.isWon) {
      won += 1;
      totalEstimatedProjectValueEgp += c.estimatedProjectValueEgp;
    }
    if (c.isLost) lost += 1;
    if (c.isNotInterested) notInterested += 1;
    if (c.isInvalid) invalidEngagements += 1;
  }

  const funnel = calculateCentralizedFunnelMetrics(
    {
      claimed: successfulClaims.length,
      contacted,
      replied,
      interested,
      meetings,
      proposals,
      negotiations,
      won,
      lost,
      notInterested,
      invalid: invalidEngagements,
    },
    filters
  );

  const claimRate = buildRateMetric(
    'CLAIM_RATE',
    claimedLeads,
    saleableLeads > 0 ? saleableLeads : totalLeads,
    filters
  );

  // --- LAYER 6: ECONOMICS (Credits & Cash Revenue Separated) ---
  const filteredTransactions = ctx.creditTransactionsRaw.filter((tx) => {
    if (filters.developerId && tx.developerId !== filters.developerId) return false;
    return isWithinDateRange(tx.createdAt, filters.dateRange);
  });

  const creditsPurchased = filteredTransactions
    .filter((tx) => tx.type === 'PURCHASE' && tx.amount > 0)
    .reduce((acc, tx) => acc + tx.amount, 0);
  const creditsBonusOrGranted = filteredTransactions
    .filter(
      (tx) =>
        (tx.type === 'BONUS' || tx.type === 'ADMIN_ADJUSTMENT') && tx.amount > 0
    )
    .reduce((acc, tx) => acc + tx.amount, 0);
  const creditsGranted = creditsPurchased + creditsBonusOrGranted;
  const creditsExpired = filteredTransactions
    .filter((tx) => tx.type === 'EXPIRATION')
    .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);

  const creditsChargedGross = successfulClaims.reduce(
    (acc, c) => acc + c.creditsCharged,
    0
  );
  const creditsRefundedFromClaims = successfulClaims.reduce(
    (acc, c) => acc + c.creditsRefunded,
    0
  );
  const creditsRefundedFromTx = filteredTransactions
    .filter((tx) => tx.type === 'REFUND')
    .reduce((acc, tx) => acc + Math.abs(tx.amount), 0);
  const creditsRefunded = Math.max(
    creditsRefundedFromClaims,
    creditsRefundedFromTx
  );
  const creditsConsumed = Math.max(
    0,
    creditsChargedGross - creditsRefunded
  );

  const creditsOutstanding = ctx.creditAccountsRaw
    .filter((acc) => !filters.developerId || acc.developerId === filters.developerId)
    .reduce((sum, acc) => sum + acc.balance, 0);

  // Cash revenue from Payments
  const filteredPayments = ctx.paymentsRaw.filter((p) => {
    if (filters.developerId && p.userId !== filters.developerId) return false;
    return isWithinDateRange(p.createdAt, filters.dateRange);
  });

  const grossCashRevenueEgp = filteredPayments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((acc, p) => acc + p.amountEgp, 0);
  const refundedCashRevenueEgp = filteredPayments
    .filter((p) => p.status === 'REFUNDED')
    .reduce((acc, p) => acc + p.amountEgp, 0);
  const netCashRevenueEgp = Math.max(0, grossCashRevenueEgp - refundedCashRevenueEgp);

  // Claim-attributed revenue across dimensions (zero double-counting)
  const attributedClaimRevenueEgp = roundTo(
    successfulClaims.reduce((acc, c) => acc + c.attributedRevenueEgp, 0),
    2
  );

  const revenueBySource: Record<string, number> = {};
  const revenueByNiche: Record<string, number> = {};
  const revenueByDeveloper: Record<string, number> = {};
  const revenueByPlan: Record<string, number> = {};

  for (const c of successfulClaims) {
    const src = resolvePrimaryOriginSource(c.lead);
    const niche = c.lead.category;
    revenueBySource[src] = roundTo(
      (revenueBySource[src] || 0) + c.attributedRevenueEgp,
      2
    );
    revenueByNiche[niche] = roundTo(
      (revenueByNiche[niche] || 0) + c.attributedRevenueEgp,
      2
    );
    revenueByDeveloper[c.developerId] = roundTo(
      (revenueByDeveloper[c.developerId] || 0) + c.attributedRevenueEgp,
      2
    );
  }

  for (const p of filteredPayments) {
    if (p.status === 'COMPLETED') {
      const planName = p.plan?.nameEn || p.planId;
      revenueByPlan[planName] = roundTo(
        (revenueByPlan[planName] || 0) + p.amountEgp,
        2
      );
    }
  }

  const revenuePerLead = buildValueMetric(
    'REVENUE_PER_LEAD',
    attributedClaimRevenueEgp,
    totalLeads,
    filters
  );
  const revenuePerClaim = buildValueMetric(
    'REVENUE_PER_CLAIM',
    attributedClaimRevenueEgp,
    successfulClaims.length,
    filters
  );
  const refundRate = buildRateMetric(
    'REFUND_RATE',
    creditsRefunded,
    creditsChargedGross,
    filters
  );

  const anomalies = await detectDeterministicAnomaliesFromContext(ctx);

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    executiveSummary: {
      totalLeads,
      availableLeads,
      claimedLeads,
      claimsCount: successfulClaims.length,
      meetingsCount: meetings,
      winsCount: won,
      winRate: funnel.overallRates.winRateOfClaimed,
      winRateOfMeetings: funnel.stageRates.winRate,
      winRateOfCompleted: funnel.overallRates.winRateOfCompleted,
      cashRevenueEgp: netCashRevenueEgp,
      attributedClaimRevenueEgp,
      creditsConsumed,
      invalidRate,
      averageQualityScore: qualityStats.average,
      averageOpportunityScore: opportunityStats.average,
      freshnessDistribution,
    },
    layers: {
      layer1Inventory: {
        totalLeads,
        availableLeads,
        claimedLeads,
        sharedLeads,
        exclusiveLeads,
        staleLeads,
        requiresVerificationLeads,
        invalidLeads,
        duplicateLeads,
        saleableLeads,
      },
      layer2Quality: {
        averageQualityScore: buildValueMetric(
          'AVERAGE_QUALITY_SCORE',
          qualityStats.sum,
          qualityStats.count,
          filters
        ),
        qualityScoreStats: qualityStats,
        qualityDistribution,
        verificationRate,
        freshnessDistribution,
        invalidRate,
        duplicateRate,
      },
      layer3Opportunity: {
        averageOpportunityScore: buildValueMetric(
          'AVERAGE_OPPORTUNITY_SCORE',
          opportunityStats.sum,
          opportunityStats.count,
          filters
        ),
        opportunityScoreStats: opportunityStats,
        opportunityDistribution,
      },
      layer4Matching: {
        evaluatedPairs: totalEvaluatedMatches,
        eligibleMatches,
        rejectedMatches,
        matchRate,
        averageMatchStrength: buildValueMetric(
          'AVERAGE_MATCH_STRENGTH',
          matchStrengthStats.sum,
          matchStrengthStats.count,
          filters
        ),
        matchStrengthStats,
        claimsFromEligibleMatches: claimedEligibleMatches,
        claimsPerMatchRate,
      },
      layer5SalesFunnel: {
        ...funnel,
        claimRate,
        totalEstimatedProjectValueEgp,
      },
      layer6Economics: {
        credits: {
          creditsPurchased,
          creditsGranted,
          creditsChargedGross,
          creditsConsumed,
          creditsRefunded,
          creditsExpired,
          creditsOutstanding,
          averageCreditsPerClaim:
            successfulClaims.length > 0
              ? roundTo(creditsConsumed / successfulClaims.length, 2)
              : null,
          averageCreditsPerWin:
            won > 0 ? roundTo(creditsConsumed / won, 2) : null,
          refundRate,
        },
        revenue: {
          grossCashRevenueEgp,
          refundedCashRevenueEgp,
          netCashRevenueEgp,
          attributedClaimRevenueEgp,
          revenuePerLead,
          revenuePerClaim,
          revenueBySource,
          revenueByNiche,
          revenueByDeveloper,
          revenueByPlan,
        },
      },
    },
    anomalyFlags: anomalies,
    metricDictionary: METRIC_DICTIONARY,
  };
}

function canonicalLeadByIdHas(
  map: Map<string, unknown>,
  id: string
): boolean {
  return map.has(id);
}

// ============================================================================
// 2. LEAD PERFORMANCE ANALYTICS (Score, Quality, Freshness, Shared/Exclusive, Claims, Cohorts)
// ============================================================================
export async function getLeadPerformanceAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, claimsByLeadId, evaluatedClaims, successfulClaims, failedClaims } =
    ctx;

  // 1. Score Band Performance (Section 14)
  const byScoreBand = SCORE_BAND_ORDER.map((band) => {
    const subset = canonicalLeads.filter((l) => l.temperature === band);
    return {
      scoreBand: band,
      ...aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters),
    };
  });

  // Historical Scoring Version Performance (Section 40)
  const versionsSet = new Set<string>(
    canonicalLeads.map((l) => l.scoringVersion || 'v1')
  );
  const byScoringVersion = Array.from(versionsSet)
    .sort()
    .map((ver) => {
      const subset = canonicalLeads.filter(
        (l) => (l.scoringVersion || 'v1') === ver
      );
      return {
        scoringVersion: ver,
        ...aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters),
      };
    });

  // 2. Quality Score Performance (Section 15)
  const byQualityBand = QUALITY_BAND_ORDER.map((band) => {
    const subset = canonicalLeads.filter((l) => l.qualityStatus === band);
    return {
      qualityBand: band,
      ...aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters),
    };
  });

  // Flag if higher quality band performs worse than lower quality band
  const qualityBandInversions: Array<{
    higherBand: string;
    lowerBand: string;
    higherWinRate: number;
    lowerWinRate: number;
    reason: string;
  }> = [];
  for (let i = 0; i < byQualityBand.length - 1; i++) {
    const higher = byQualityBand[i];
    const lower = byQualityBand[i + 1];
    const hWin = higher.rates.winRate.value;
    const lWin = lower.rates.winRate.value;
    if (
      hWin !== null &&
      lWin !== null &&
      higher.claimsCount >= 3 &&
      lower.claimsCount >= 3 &&
      hWin < lWin
    ) {
      qualityBandInversions.push({
        higherBand: higher.qualityBand,
        lowerBand: lower.qualityBand,
        higherWinRate: hWin,
        lowerWinRate: lWin,
        reason: `${higher.qualityBand} win rate (${higher.rates.winRate.displayValue}) is lower than ${lower.qualityBand} (${lower.rates.winRate.displayValue}). Flagged for human review.`,
      });
    }
  }

  // 3. Freshness Performance (Section 16)
  const byFreshnessBand = FRESHNESS_BAND_ORDER.map((state) => {
    const subset = canonicalLeads.filter((l) => l.freshnessStatus === state);
    return {
      freshness: state,
      ...aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters),
    };
  });

  // 4. Shared vs Exclusive Comparison (Section 20)
  const sharedVsExclusive = (['SHARED', 'EXCLUSIVE'] as const).map((access) => {
    const subset = canonicalLeads.filter(
      (l) => (l.accessType || l.leadType) === access
    );
    return {
      accessType: access,
      ...aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters),
    };
  });

  // 5. Claim Performance (Section 19)
  const claimFailureLogs = ctx.auditLogsRaw.filter(
    (log) =>
      (log.action === 'LEAD_CLAIM_FAILED' ||
        log.action === 'LEAD_CLAIM_CONFLICT') &&
      isWithinDateRange(log.createdAt, filters.dateRange)
  );

  let insufficientCreditFailures = failedClaims.filter((c) =>
    (c.failureCode || c.failureReason || '')
      .toUpperCase()
      .includes('INSUFFICIENT')
  ).length;
  let unavailableLeadFailures = failedClaims.filter((c) => {
    const code = (c.failureCode || c.failureReason || '').toUpperCase();
    return (
      code.includes('UNAVAILABLE') ||
      code.includes('NOT_AVAILABLE') ||
      code.includes('CLAIMED') ||
      code.includes('STALE') ||
      code.includes('INVALID')
    );
  }).length;
  let claimConflicts = failedClaims.filter((c) =>
    (c.failureCode || c.failureReason || '').toUpperCase().includes('CONFLICT')
  ).length;

  for (const log of claimFailureLogs) {
    const details = (log.details || {}) as Record<string, unknown>;
    const code = String(details.code || details.failureCode || '').toUpperCase();
    if (code.includes('INSUFFICIENT')) insufficientCreditFailures += 1;
    if (
      code.includes('UNAVAILABLE') ||
      code.includes('CLAIMED') ||
      code.includes('NOT_SALEABLE')
    ) {
      unavailableLeadFailures += 1;
    }
    if (log.action === 'LEAD_CLAIM_CONFLICT' || code.includes('CONFLICT')) {
      claimConflicts += 1;
    }
  }

  const totalFailedClaimsCount = Math.max(
    failedClaims.length,
    claimFailureLogs.length
  );
  const totalClaimAttempts = successfulClaims.length + totalFailedClaimsCount;
  const refundedClaimsCount = successfulClaims.filter(
    (c) => c.isRefundedClaim
  ).length;

  const claimsByCreditCost: Record<
    string,
    { creditCost: number; claims: number; wins: number; refunds: number; revenueEgp: number }
  > = {};
  for (const c of successfulClaims) {
    const costKey = String(c.creditsCharged);
    const cur = claimsByCreditCost[costKey] || {
      creditCost: c.creditsCharged,
      claims: 0,
      wins: 0,
      refunds: 0,
      revenueEgp: 0,
    };
    cur.claims += 1;
    if (c.isWon) cur.wins += 1;
    if (c.isRefundedClaim) cur.refunds += 1;
    cur.revenueEgp = roundTo(cur.revenueEgp + c.attributedRevenueEgp, 2);
    claimsByCreditCost[costKey] = cur;
  }

  // 6. Match Strength Performance (Section 18)
  const byMatchStrengthBand = computeMatchStrengthBands(ctx);

  // 7. Cohort Analysis (Section 8)
  const cohorts = computeLeadCohorts(ctx);

  // 8. Paginated Lead Performance Table (Section 36)
  const leadRows = canonicalLeads.map((l) => {
    const lClaims = claimsByLeadId.get(l.id) || [];
    const loc = resolveCanonicalLocation(l);
    const service = resolveCanonicalService(l);
    const originSource = resolvePrimaryOriginSource(l);
    const wonClaims = lClaims.filter((c) => c.isWon).length;
    const meetingClaims = lClaims.filter((c) => c.isMeeting).length;
    const contactedClaims = lClaims.filter((c) => c.isContacted).length;
    const revenueEgp = roundTo(
      lClaims.reduce((acc, c) => acc + c.attributedRevenueEgp, 0),
      2
    );

    return {
      leadId: l.id,
      businessName: l.businessName,
      originSource,
      niche: l.category,
      governorate: loc.governorate,
      city: loc.city,
      district: loc.district,
      service,
      opportunityScore: l.score,
      scoreBand: l.temperature,
      scoringVersion: l.scoringVersion || 'v1',
      qualityScore: l.qualityScore,
      qualityBand: l.qualityStatus,
      freshness: l.freshnessStatus,
      accessType: l.accessType || l.leadType,
      status: l.status,
      saleabilityStatus: l.saleabilityStatus,
      claimsCount: lClaims.length,
      contactedCount: contactedClaims,
      meetingCount: meetingClaims,
      wonCount: wonClaims,
      attributedRevenueEgp: revenueEgp,
      createdAt: l.createdAt.toISOString(),
    };
  });

  const paginatedLeads = paginateAndSort(leadRows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy === 'totalLeads' ? 'opportunityScore' : filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSortFields: [
      'opportunityScore',
      'qualityScore',
      'claimsCount',
      'wonCount',
      'attributedRevenueEgp',
      'createdAt',
      'businessName',
    ],
    defaultSortField: 'opportunityScore',
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    byScoreBand,
    byScoringVersion,
    byQualityBand,
    qualityBandInversions,
    byFreshnessBand,
    sharedVsExclusive,
    byMatchStrengthBand,
    claimPerformance: {
      claimAttempts: totalClaimAttempts,
      successfulClaims: successfulClaims.length,
      failedClaims: totalFailedClaimsCount,
      insufficientCreditFailures,
      unavailableLeadFailures,
      refundedClaims: refundedClaimsCount,
      claimConflicts,
      byCreditCost: Object.values(claimsByCreditCost).sort(
        (a, b) => a.creditCost - b.creditCost
      ),
    },
    cohorts,
    leadsTable: paginatedLeads.items,
    pagination: paginatedLeads.pagination,
  };
}

function computeMatchStrengthBands(
  ctx: Awaited<ReturnType<typeof loadAnalyticsContext>>
) {
  const { filters, matchSnapshotsRaw, successfulClaims } = ctx;
  const claimByPair = new Map<string, (typeof successfulClaims)[number]>();
  for (const c of successfulClaims) {
    claimByPair.set(`${c.leadId}:${c.developerId}`, c);
  }

  const bandBuckets: Record<
    '75-100' | '50-74' | '25-49' | '0-24',
    {
      band: string;
      matches: number;
      eligibleMatches: number;
      claims: number;
      contacted: number;
      meetings: number;
      wins: number;
      losses: number;
    }
  > = {
    '75-100': {
      band: '75-100',
      matches: 0,
      eligibleMatches: 0,
      claims: 0,
      contacted: 0,
      meetings: 0,
      wins: 0,
      losses: 0,
    },
    '50-74': {
      band: '50-74',
      matches: 0,
      eligibleMatches: 0,
      claims: 0,
      contacted: 0,
      meetings: 0,
      wins: 0,
      losses: 0,
    },
    '25-49': {
      band: '25-49',
      matches: 0,
      eligibleMatches: 0,
      claims: 0,
      contacted: 0,
      meetings: 0,
      wins: 0,
      losses: 0,
    },
    '0-24': {
      band: '0-24',
      matches: 0,
      eligibleMatches: 0,
      claims: 0,
      contacted: 0,
      meetings: 0,
      wins: 0,
      losses: 0,
    },
  };

  const seenPairs = new Set<string>();
  for (const snap of matchSnapshotsRaw) {
    if (!ctx.canonicalLeadById.has(snap.leadId)) continue;
    if (filters.developerId && snap.developerId !== filters.developerId) continue;
    if (filters.matchVersion && snap.matchVersion !== filters.matchVersion) continue;

    const band = classifyMatchStrengthBand(snap.matchStrength);
    const b = bandBuckets[band];
    b.matches += 1;
    if (snap.eligible) b.eligibleMatches += 1;

    const pairKey = `${snap.leadId}:${snap.developerId}`;
    seenPairs.add(pairKey);
    const claim = claimByPair.get(pairKey);
    if (claim) {
      b.claims += 1;
      if (claim.isContacted) b.contacted += 1;
      if (claim.isMeeting) b.meetings += 1;
      if (claim.isWon) b.wins += 1;
      if (claim.isLost) b.losses += 1;
    }
  }

  // Also include claims that recorded matchStrengthAtClaim even if no MatchSnapshot row existed
  for (const c of successfulClaims) {
    const pairKey = `${c.leadId}:${c.developerId}`;
    if (seenPairs.has(pairKey)) continue;
    if (typeof c.matchStrengthAtClaim === 'number') {
      const band = classifyMatchStrengthBand(c.matchStrengthAtClaim);
      const b = bandBuckets[band];
      b.matches += 1;
      b.eligibleMatches += 1;
      b.claims += 1;
      if (c.isContacted) b.contacted += 1;
      if (c.isMeeting) b.meetings += 1;
      if (c.isWon) b.wins += 1;
      if (c.isLost) b.losses += 1;
    }
  }

  return MATCH_STRENGTH_BAND_ORDER.map((bandKey) => {
    const b = bandBuckets[bandKey];
    return {
      ...b,
      claimRate: buildRateMetric(
        'CLAIMS_PER_MATCH_RATE',
        b.claims,
        b.eligibleMatches > 0 ? b.eligibleMatches : b.matches,
        filters
      ),
      contactRate: buildRateMetric('CONTACT_RATE', b.contacted, b.claims, filters),
      meetingRate: buildRateMetric(
        'MEETING_RATE_OF_CLAIMED',
        b.meetings,
        b.claims,
        filters
      ),
      winRate: buildRateMetric('WIN_RATE', b.wins, b.claims, filters),
    };
  });
}

function computeLeadCohorts(
  ctx: Awaited<ReturnType<typeof loadAnalyticsContext>>
) {
  const { filters, canonicalLeads, claimsByLeadId, successfulClaims } = ctx;
  const cohortBy = filters.cohortBy;

  if (cohortBy === 'claimed_date') {
    const claimGroups = new Map<string, typeof successfulClaims>();
    for (const c of successfulClaims) {
      const key = formatBusinessDateKey(c.claimedAt, filters.dateRange.timezone);
      const arr = claimGroups.get(key) || [];
      arr.push(c);
      claimGroups.set(key, arr);
    }

    return Array.from(claimGroups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([cohortKey, claimsList]) => {
        const distinctLeadIds = new Set(claimsList.map((c) => c.leadId));
        const contacted = claimsList.filter((c) => c.isContacted).length;
        const replied = claimsList.filter((c) => c.isReplied).length;
        const meetings = claimsList.filter((c) => c.isMeeting).length;
        const wins = claimsList.filter((c) => c.isWon).length;
        const revenueEgp = roundTo(
          claimsList.reduce((acc, c) => acc + c.attributedRevenueEgp, 0),
          2
        );
        return {
          cohortBy: 'claimed_date',
          cohortKey,
          leadsCount: distinctLeadIds.size,
          claimsCount: claimsList.length,
          contactedCount: contacted,
          repliedCount: replied,
          meetingCount: meetings,
          wonCount: wins,
          attributedRevenueEgp: revenueEgp,
          contactRate: buildRateMetric(
            'CONTACT_RATE',
            contacted,
            claimsList.length,
            filters
          ),
          meetingRate: buildRateMetric(
            'MEETING_RATE',
            meetings,
            replied,
            filters
          ),
          winRate: buildRateMetric(
            'WIN_RATE',
            wins,
            claimsList.length,
            filters
          ),
        };
      });
  }

  const leadGroups = new Map<string, typeof canonicalLeads>();
  for (const lead of canonicalLeads) {
    let key = 'UNKNOWN';
    switch (cohortBy) {
      case 'created_date':
        key = formatBusinessDateKey(lead.createdAt, filters.dateRange.timezone);
        break;
      case 'source':
        key = resolvePrimaryOriginSource(lead);
        break;
      case 'niche':
        key = lead.category;
        break;
      case 'city':
        key = resolveCanonicalLocation(lead).city;
        break;
      case 'service':
        key = resolveCanonicalService(lead);
        break;
      case 'score_band':
        key = lead.temperature;
        break;
      case 'quality_band':
        key = lead.qualityStatus;
        break;
      default:
        key = formatBusinessDateKey(lead.createdAt, filters.dateRange.timezone);
        break;
    }
    const arr = leadGroups.get(key) || [];
    arr.push(lead);
    leadGroups.set(key, arr);
  }

  return Array.from(leadGroups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([cohortKey, subset]) => {
      const agg = aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters);
      return {
        cohortBy,
        cohortKey,
        leadsCount: agg.leadsCount,
        claimedLeadsCount: agg.distinctClaimedLeads,
        claimsCount: agg.claimsCount,
        contactedCount: agg.contactedCount,
        repliedCount: agg.repliedCount,
        meetingCount: agg.meetingCount,
        wonCount: agg.wonCount,
        lostCount: agg.lostCount,
        invalidCount: agg.invalidLeadCount,
        attributedRevenueEgp: agg.attributedRevenueEgp,
        claimRate: agg.rates.claimRate,
        contactRate: agg.rates.contactRate,
        meetingRate: agg.rates.meetingRate,
        winRate: agg.rates.winRate,
      };
    });
}

// ============================================================================
// 3. SOURCE PERFORMANCE & PROVENANCE SCORECARD (Sections 9, 10, 26, 28)
// ============================================================================
export async function getSourceAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const {
    filters,
    canonicalLeads,
    nonCanonicalDuplicateLeads,
    leadSources,
    sourceRecords,
    verifications,
    claimsByLeadId,
    allFeedbacksRaw,
  } = ctx;

  const [importJobs, deadLetters] = await Promise.all([
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.deadLetterRecord.findMany({
      where: { status: 'DEAD_LETTER' },
    }),
  ]);

  const leadSourceByName = new Map(leadSources.map((ls) => [ls.name, ls]));

  // Gather all known source names from LeadSource table, canonical leads, sourceList, sourceRecords, and verifications
  const allSourceNames = new Set<string>();
  const sourceTypeMap = new Map<string, string>();

  for (const ls of leadSources) {
    allSourceNames.add(ls.name);
    sourceTypeMap.set(ls.name, ls.type);
  }
  for (const l of canonicalLeads) {
    const origin = resolvePrimaryOriginSource(l);
    allSourceNames.add(origin);
    for (const es of resolveEnrichmentSources(l)) {
      allSourceNames.add(es);
    }
  }
  for (const sr of sourceRecords) {
    if (sr.sourceName) {
      allSourceNames.add(sr.sourceName);
      if (!sourceTypeMap.has(sr.sourceName)) {
        sourceTypeMap.set(sr.sourceName, sr.sourceType);
      }
    }
  }

  // Group origin leads, enrichment leads, duplicate records, and verifications by source
  const originLeadsBySource = new Map<string, typeof canonicalLeads>();
  const enrichedLeadIdsBySource = new Map<string, Set<string>>();
  const duplicatesBySource = new Map<string, number>();
  const verificationsBySource = new Map<
    string,
    { total: number; verified: number; failed: number }
  >();

  for (const l of canonicalLeads) {
    const origin = resolvePrimaryOriginSource(l);
    const arr = originLeadsBySource.get(origin) || [];
    arr.push(l);
    originLeadsBySource.set(origin, arr);

    const enrichments = resolveEnrichmentSources(l);
    for (const es of enrichments) {
      const set = enrichedLeadIdsBySource.get(es) || new Set<string>();
      set.add(l.id);
      enrichedLeadIdsBySource.set(es, set);
    }
  }

  for (const dupLead of nonCanonicalDuplicateLeads) {
    const origin = resolvePrimaryOriginSource(dupLead);
    duplicatesBySource.set(origin, (duplicatesBySource.get(origin) || 0) + 1);
  }

  for (const sr of sourceRecords) {
    if (!isWithinDateRange(sr.createdAt, filters.dateRange)) continue;
    if (sr.decision === 'DUPLICATE_CONFIRMED' || sr.status === 'DUPLICATE') {
      duplicatesBySource.set(
        sr.sourceName,
        (duplicatesBySource.get(sr.sourceName) || 0) + 1
      );
      if (sr.leadId) {
        const canonicalLead = ctx.canonicalLeadById.get(sr.leadId);
        if (
          canonicalLead &&
          resolvePrimaryOriginSource(canonicalLead) !== sr.sourceName
        ) {
          const set =
            enrichedLeadIdsBySource.get(sr.sourceName) || new Set<string>();
          set.add(sr.leadId);
          enrichedLeadIdsBySource.set(sr.sourceName, set);
        }
      }
    }
  }

  for (const v of verifications) {
    if (!isWithinDateRange(v.checkedAt, filters.dateRange)) continue;
    const src = v.source || 'SYSTEM';
    const cur = verificationsBySource.get(src) || {
      total: 0,
      verified: 0,
      failed: 0,
    };
    cur.total += 1;
    if (v.status === 'VERIFIED') cur.verified += 1;
    if (v.status === 'FAILED') cur.failed += 1;
    verificationsBySource.set(src, cur);
  }

  // Invalid reasons by source (Section 26)
  const invalidReasonsBySource = new Map<string, Record<string, number>>();
  for (const l of canonicalLeads) {
    const origin = resolvePrimaryOriginSource(l);
    const bucket = invalidReasonsBySource.get(origin) || {};

    if (l.phoneValidationStatus === 'INVALID' || l.qualityFlags.includes('INVALID_PHONE')) {
      bucket.WRONG_PHONE = (bucket.WRONG_PHONE || 0) + 1;
    }
    if (l.emailValidationStatus === 'INVALID' || l.qualityFlags.includes('INVALID_EMAIL')) {
      bucket.WRONG_EMAIL = (bucket.WRONG_EMAIL || 0) + 1;
    }
    if (l.businessStatus === 'CLOSED' || l.qualityFlags.includes('BUSINESS_CLOSED')) {
      bucket.BUSINESS_CLOSED = (bucket.BUSINESS_CLOSED || 0) + 1;
    }

    const lClaims = claimsByLeadId.get(l.id) || [];
    for (const c of lClaims) {
      if (c.isInvalid && c.invalidReasonCode) {
        bucket[c.invalidReasonCode] = (bucket[c.invalidReasonCode] || 0) + 1;
      }
    }
    invalidReasonsBySource.set(origin, bucket);
  }

  for (const fb of allFeedbacksRaw) {
    if (fb.useful) continue;
    const lead = ctx.canonicalLeadById.get(fb.leadId);
    if (!lead) continue;
    const origin = resolvePrimaryOriginSource(lead);
    const bucket = invalidReasonsBySource.get(origin) || {};
    const code = normalizeInvalidReasonCode(fb.reasonCode || fb.reason);
    bucket[code] = (bucket[code] || 0) + 1;
    invalidReasonsBySource.set(origin, bucket);
  }

  const rows = Array.from(allSourceNames)
    .filter((sourceName) => {
      if (filters.source && sourceName.toLowerCase() !== filters.source.toLowerCase()) {
        return false;
      }
      return true;
    })
    .map((sourceName) => {
      const leadSource = leadSourceByName.get(sourceName);
      const originLeads = originLeadsBySource.get(sourceName) || [];
      const uniqueLeads = originLeads.length;
      const duplicates = duplicatesBySource.get(sourceName) || 0;
      const leadsCollected = uniqueLeads + duplicates;
      const enrichmentLeadsCount =
        enrichedLeadIdsBySource.get(sourceName)?.size || 0;
      const verifStats = verificationsBySource.get(sourceName) || {
        total: 0,
        verified: 0,
        failed: 0,
      };

      const agg = aggregateLeadSegmentMetrics(
        originLeads,
        claimsByLeadId,
        filters
      );

      const saleableLeadsCount = originLeads.filter(
        (l) => l.saleabilityStatus === 'AVAILABLE'
      ).length;

      const sourceJobs = importJobs.filter(
        (j) =>
          (leadSource && j.sourceId === leadSource.id) ||
          j.sourceName === sourceName
      );
      const sourceDeadLetters = deadLetters.filter(
        (dl) =>
          (leadSource && dl.sourceId === leadSource.id) ||
          dl.sourceName === sourceName
      );

      const jobFunnel = sourceJobs.reduce(
        (acc, j) => {
          acc.discovered += j.discoveredCount || j.totalRows || 0;
          acc.fetched += j.fetchedCount || j.totalRows || 0;
          acc.normalized += j.normalizedCount || (j.validCount || 0) + (j.duplicateCount || 0);
          acc.accepted += j.validCount || 0;
          acc.inserted += j.insertedCount || 0;
          acc.updated += j.updatedCount || 0;
          acc.duplicate += j.duplicateCount || 0;
          acc.invalid += j.invalidCount || 0;
          acc.failed += j.failedCount || 0;
          acc.saleable += j.saleableCount || 0;
          acc.totalJobCostEgp += j.acquisitionCostEgp || 0;
          return acc;
        },
        {
          discovered: 0,
          fetched: 0,
          normalized: 0,
          accepted: 0,
          inserted: 0,
          updated: 0,
          duplicate: 0,
          invalid: 0,
          failed: 0,
          saleable: 0,
          totalJobCostEgp: 0,
        }
      );

      const ingestionFunnel = {
        discovered: Math.max(jobFunnel.discovered, leadsCollected),
        fetched: Math.max(jobFunnel.fetched, leadsCollected),
        normalized: Math.max(jobFunnel.normalized, leadsCollected),
        accepted: Math.max(jobFunnel.accepted, uniqueLeads),
        updated: jobFunnel.updated,
        duplicate: Math.max(jobFunnel.duplicate, duplicates),
        invalid: Math.max(jobFunnel.invalid, agg.invalidLeadCount),
        failed: jobFunnel.failed,
        saleable: Math.max(jobFunnel.saleable, saleableLeadsCount),
        deadLetter: sourceDeadLetters.length,
      };

      const costEconomics = computeSourceCostEconomics({
        acquisitionCostPerRunEgp: leadSource?.acquisitionCostPerRunEgp ?? null,
        acquisitionCostPerRecordEgp: leadSource?.acquisitionCostPerRecordEgp ?? null,
        totalJobCostEgp:
          jobFunnel.totalJobCostEgp > 0 ? jobFunnel.totalJobCostEgp : null,
        completedRunsCount: leadSource?.totalSuccessCount || sourceJobs.filter((j) => j.status === 'COMPLETED').length,
        collectedRecordsCount: ingestionFunnel.fetched,
        uniqueLeadsCount: uniqueLeads,
        saleableLeadsCount,
        claimedLeadsCount: agg.distinctClaimedLeads,
        wonLeadsCount: agg.wonCount,
      });

      const freshOrRecentCount = originLeads.filter(
        (l) => l.freshnessStatus === 'FRESH' || l.freshnessStatus === 'RECENT'
      ).length;
      const validLeadsCount = Math.max(0, uniqueLeads - agg.invalidLeadCount);

      const duplicateRate = buildRateMetric(
        'DUPLICATE_RATE',
        duplicates,
        leadsCollected,
        filters
      );
      const validityRate = buildRateMetric(
        'VALIDITY_RATE',
        validLeadsCount,
        uniqueLeads,
        filters,
        {
          customNumeratorLabel: 'Valid unique Leads from source',
          customDenominatorLabel: 'Unique Leads from source',
        }
      );
      const freshnessRate = buildRateMetric(
        'FRESHNESS_RATE',
        freshOrRecentCount,
        uniqueLeads,
        filters,
        {
          customNumeratorLabel: 'Fresh or Recent Leads from source',
          customDenominatorLabel: 'Unique Leads from source',
        }
      );

      return {
        sourceName,
        sourceType: sourceTypeMap.get(sourceName) || 'MANUAL',
        collectorVersion:
          leadSource?.collectorVersion ||
          sourceJobs.find((j) => j.collectorVersion)?.collectorVersion ||
          'manual-v1',
        healthStatus: leadSource?.healthStatus || 'HEALTHY',
        configurationStatus: leadSource?.configurationStatus || 'CONFIGURED',
        leadsCollected,
        uniqueLeads,
        totalLeads: uniqueLeads,
        duplicates,
        invalidLeads: agg.invalidLeadCount,
        qualityAverage: agg.qualityScoreStats.average,
        opportunityAverage: agg.opportunityScoreStats.average,
        completenessAverage: agg.completenessScoreStats.average,
        claimsCount: agg.claimsCount,
        distinctClaimedLeads: agg.distinctClaimedLeads,
        contactedCount: agg.contactedCount,
        repliedCount: agg.repliedCount,
        meetingCount: agg.meetingCount,
        wonCount: agg.wonCount,
        lostCount: agg.lostCount,
        attributedRevenueEgp: agg.attributedRevenueEgp,
        revenuePerLead: agg.economics.revenuePerLead,
        claimRate: agg.rates.claimRate,
        contactRate: agg.rates.contactRate,
        meetingRate: agg.rates.meetingRate,
        winRate: agg.rates.winRate,
        invalidRate: agg.rates.invalidRate,
        duplicateRate,
        ingestionFunnel,
        costEconomics,
        attribution: {
          originLeadsCount: uniqueLeads,
          enrichmentLeadsCount,
          verificationRecordsCount: verifStats.total,
          verificationSuccessCount: verifStats.verified,
        },
        scorecard: {
          dataQuality: {
            completenessAverage: agg.completenessScoreStats.average,
            validityRate,
            freshnessRate,
            duplicateRate,
            verificationRate: agg.rates.verificationRate,
            qualityScoreAverage: agg.qualityScoreStats.average,
          },
          commercialQuality: {
            claims: agg.claimsCount,
            meetings: agg.meetingCount,
            wins: agg.wonCount,
            claimRate: agg.rates.claimRate,
            winRate: agg.rates.winRate,
            revenueEgp: agg.attributedRevenueEgp,
            revenuePerLeadEgp: agg.economics.revenuePerLead.value,
          },
          acquisitionEconomics: costEconomics,
        },
        invalidReasons: invalidReasonsBySource.get(sourceName) || {},
      };
    });

  const paged = paginateAndSort(rows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSortFields: [
      'totalLeads',
      'leadsCollected',
      'uniqueLeads',
      'duplicates',
      'qualityAverage',
      'opportunityAverage',
      'claimsCount',
      'wonCount',
      'attributedRevenueEgp',
      'sourceName',
    ],
    defaultSortField: 'uniqueLeads',
  });

  // Verify zero double counting across sources
  const totalAttributedRevenueAcrossSources = roundTo(
    rows.reduce((acc, r) => acc + r.attributedRevenueEgp, 0),
    2
  );
  const totalUniqueOriginLeadsAcrossSources = rows.reduce(
    (acc, r) => acc + r.uniqueLeads,
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    attributionSummary: {
      totalCanonicalLeads: canonicalLeads.length,
      totalUniqueOriginLeadsAcrossSources,
      totalAttributedRevenueAcrossSources,
      doubleCountCheckPassed:
        totalUniqueOriginLeadsAcrossSources === canonicalLeads.length,
    },
    sources: paged.items,
    allSourcesSummary: rows,
    pagination: paged.pagination,
  };
}

// ============================================================================
// 4. NICHE PERFORMANCE (Section 11)
// ============================================================================
export async function getNicheAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, claimsByLeadId } = ctx;

  const knownNiches = new Set<string>(BUSINESS_CATEGORIES.map((c) => c.value));
  for (const l of canonicalLeads) {
    if (l.category) knownNiches.add(l.category);
  }

  const rows = Array.from(knownNiches)
    .filter((niche) => {
      if (filters.niche && niche.toLowerCase() !== filters.niche.toLowerCase()) {
        return false;
      }
      return true;
    })
    .map((niche) => {
      const subset = canonicalLeads.filter((l) => l.category === niche);
      const agg = aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters);
      return {
        niche,
        labelAr: CATEGORY_LABELS_AR[niche] || niche,
        totalLeads: agg.leadsCount,
        leads: agg.leadsCount,
        claims: agg.claimsCount,
        distinctClaimedLeads: agg.distinctClaimedLeads,
        contacted: agg.contactedCount,
        replied: agg.repliedCount,
        interested: agg.interestedCount,
        meetings: agg.meetingCount,
        proposals: agg.proposalCount,
        negotiations: agg.negotiationCount,
        won: agg.wonCount,
        lost: agg.lostCount,
        notInterested: agg.notInterestedCount,
        invalid: agg.invalidLeadCount,
        qualityAverage: agg.qualityScoreStats.average,
        opportunityAverage: agg.opportunityScoreStats.average,
        claimRate: agg.rates.claimRate,
        contactRate: agg.rates.contactRate,
        replyRate: agg.rates.replyRate,
        meetingRate: agg.rates.meetingRate,
        winRate: agg.rates.winRate,
        winRateOfCompleted: agg.rates.winRateOfCompleted,
        invalidRate: agg.rates.invalidRate,
        revenueEgp: agg.attributedRevenueEgp,
        revenuePerLead: agg.economics.revenuePerLead,
        averageProjectValueEgp: agg.averageEstimatedProjectValueEgp,
      };
    });

  const paged = paginateAndSort(rows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSortFields: [
      'totalLeads',
      'claims',
      'contacted',
      'meetings',
      'won',
      'revenueEgp',
      'qualityAverage',
      'opportunityAverage',
      'niche',
    ],
    defaultSortField: 'totalLeads',
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    niches: paged.items,
    allNichesSummary: rows,
    pagination: paged.pagination,
  };
}

// ============================================================================
// 5. LOCATION PERFORMANCE (Governorate, City, District — Section 12)
// ============================================================================
export async function getLocationAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, claimsByLeadId } = ctx;

  const byGovernorateMap = new Map<string, typeof canonicalLeads>();
  const byCityMap = new Map<
    string,
    { governorate: string; leads: typeof canonicalLeads }
  >();
  const byDistrictMap = new Map<
    string,
    { governorate: string; city: string; district: string; leads: typeof canonicalLeads }
  >();

  for (const lead of canonicalLeads) {
    const loc = resolveCanonicalLocation(lead);

    const govLeads = byGovernorateMap.get(loc.governorate) || [];
    govLeads.push(lead);
    byGovernorateMap.set(loc.governorate, govLeads);

    const cityEntry = byCityMap.get(loc.city) || {
      governorate: loc.governorate,
      leads: [],
    };
    cityEntry.leads.push(lead);
    byCityMap.set(loc.city, cityEntry);

    const distKey = `${loc.governorate}::${loc.city}::${loc.district}`;
    const distEntry = byDistrictMap.get(distKey) || {
      governorate: loc.governorate,
      city: loc.city,
      district: loc.district,
      leads: [],
    };
    distEntry.leads.push(lead);
    byDistrictMap.set(distKey, distEntry);
  }

  const governorates = Array.from(byGovernorateMap.entries()).map(
    ([governorate, subset]) => {
      const agg = aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters);
      return {
        governorate,
        totalLeads: agg.leadsCount,
        qualityAverage: agg.qualityScoreStats.average,
        opportunityAverage: agg.opportunityScoreStats.average,
        claims: agg.claimsCount,
        contacted: agg.contactedCount,
        meetings: agg.meetingCount,
        wins: agg.wonCount,
        revenueEgp: agg.attributedRevenueEgp,
        claimRate: agg.rates.claimRate,
        winRate: agg.rates.winRate,
      };
    }
  );

  const cityRows = Array.from(byCityMap.entries()).map(([city, entry]) => {
    const agg = aggregateLeadSegmentMetrics(entry.leads, claimsByLeadId, filters);
    return {
      governorate: entry.governorate,
      city,
      totalLeads: agg.leadsCount,
      qualityAverage: agg.qualityScoreStats.average,
      opportunityAverage: agg.opportunityScoreStats.average,
      claims: agg.claimsCount,
      contacted: agg.contactedCount,
      meetings: agg.meetingCount,
      wins: agg.wonCount,
      revenueEgp: agg.attributedRevenueEgp,
      claimRate: agg.rates.claimRate,
      contactRate: agg.rates.contactRate,
      meetingRate: agg.rates.meetingRate,
      winRate: agg.rates.winRate,
      invalidRate: agg.rates.invalidRate,
    };
  });

  const districts = Array.from(byDistrictMap.values()).map((entry) => {
    const agg = aggregateLeadSegmentMetrics(entry.leads, claimsByLeadId, filters);
    return {
      governorate: entry.governorate,
      city: entry.city,
      district: entry.district,
      totalLeads: agg.leadsCount,
      qualityAverage: agg.qualityScoreStats.average,
      claims: agg.claimsCount,
      meetings: agg.meetingCount,
      wins: agg.wonCount,
      revenueEgp: agg.attributedRevenueEgp,
      winRate: agg.rates.winRate,
    };
  });

  const pagedCities = paginateAndSort(cityRows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSortFields: [
      'totalLeads',
      'qualityAverage',
      'opportunityAverage',
      'claims',
      'meetings',
      'wins',
      'revenueEgp',
      'city',
      'governorate',
    ],
    defaultSortField: 'totalLeads',
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    governorates: governorates.sort((a, b) => b.totalLeads - a.totalLeads),
    cities: pagedCities.items,
    districts: districts.sort((a, b) => b.totalLeads - a.totalLeads),
    pagination: pagedCities.pagination,
  };
}

// ============================================================================
// 6. SERVICE PERFORMANCE (Section 13)
// ============================================================================
export async function getServiceAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, claimsByLeadId } = ctx;

  const serviceLabelsAr = new Map<string, string>(
    DEVELOPER_SERVICES.map((s) => [s.value, s.labelAr])
  );
  const knownServices = new Set<string>(DEVELOPER_SERVICES.map((s) => s.value));
  for (const l of canonicalLeads) {
    knownServices.add(resolveCanonicalService(l));
  }

  const rows = Array.from(knownServices)
    .filter((svc) => {
      if (filters.service && svc.toLowerCase() !== filters.service.toLowerCase()) {
        return false;
      }
      return true;
    })
    .map((service) => {
      const subset = canonicalLeads.filter(
        (l) => resolveCanonicalService(l) === service
      );
      const agg = aggregateLeadSegmentMetrics(subset, claimsByLeadId, filters);
      return {
        service,
        labelAr: serviceLabelsAr.get(service) || service,
        totalLeads: agg.leadsCount,
        leadVolume: agg.leadsCount,
        claims: agg.claimsCount,
        contacted: agg.contactedCount,
        replied: agg.repliedCount,
        meetings: agg.meetingCount,
        wins: agg.wonCount,
        claimRate: agg.rates.claimRate,
        contactRate: agg.rates.contactRate,
        meetingRate: agg.rates.meetingRate,
        winRate: agg.rates.winRate,
        revenueEgp: agg.attributedRevenueEgp,
        revenuePerLead: agg.economics.revenuePerLead,
        averageProjectValueEgp: agg.averageEstimatedProjectValueEgp,
        totalEstimatedProjectValueEgp: agg.totalEstimatedProjectValueEgp,
      };
    });

  const paged = paginateAndSort(rows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSortFields: [
      'totalLeads',
      'leadVolume',
      'claims',
      'meetings',
      'wins',
      'revenueEgp',
      'averageProjectValueEgp',
      'service',
    ],
    defaultSortField: 'totalLeads',
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    services: paged.items,
    allServicesSummary: rows,
    pagination: paged.pagination,
  };
}

// ============================================================================
// 7. DEVELOPER PERFORMANCE & FUNNEL (Sections 23, 24, 42)
// ============================================================================
export async function getDeveloperAnalyticsForAdmin(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const {
    filters,
    developersRaw,
    successfulClaims,
    matchSnapshotsRaw,
    paymentsRaw,
  } = ctx;

  const claimsByDev = new Map<string, typeof successfulClaims>();
  for (const c of successfulClaims) {
    const arr = claimsByDev.get(c.developerId) || [];
    arr.push(c);
    claimsByDev.set(c.developerId, arr);
  }

  const snapshotsByDev = new Map<string, typeof matchSnapshotsRaw>();
  for (const ms of matchSnapshotsRaw) {
    if (!ms.eligible) continue;
    const arr = snapshotsByDev.get(ms.developerId) || [];
    arr.push(ms);
    snapshotsByDev.set(ms.developerId, arr);
  }

  const cashPaidByDev = new Map<string, number>();
  for (const p of paymentsRaw) {
    if (p.status === 'COMPLETED' && isWithinDateRange(p.createdAt, filters.dateRange)) {
      cashPaidByDev.set(p.userId, (cashPaidByDev.get(p.userId) || 0) + p.amountEgp);
    }
  }

  const rows = developersRaw
    .filter((dev) => !filters.developerId || dev.id === filters.developerId)
    .map((dev) => {
      const devClaims = claimsByDev.get(dev.id) || [];
      const devSnaps = snapshotsByDev.get(dev.id) || [];

      const claimed = devClaims.length;
      const contacted = devClaims.filter((c) => c.isContacted).length;
      const replied = devClaims.filter((c) => c.isReplied).length;
      const interested = devClaims.filter((c) => c.isInterested).length;
      const meetings = devClaims.filter((c) => c.isMeeting).length;
      const proposals = devClaims.filter((c) => c.isProposal).length;
      const negotiations = devClaims.filter((c) => c.isNegotiation).length;
      const wins = devClaims.filter((c) => c.isWon).length;
      const lost = devClaims.filter((c) => c.isLost).length;
      const notInterested = devClaims.filter((c) => c.isNotInterested).length;
      const invalid = devClaims.filter((c) => c.isInvalid).length;

      const estimatedProjectValueEgp = devClaims.reduce(
        (acc, c) => acc + c.estimatedProjectValueEgp,
        0
      );
      const creditsCharged = devClaims.reduce(
        (acc, c) => acc + c.creditsCharged,
        0
      );
      const creditsRefunded = devClaims.reduce(
        (acc, c) => acc + c.creditsRefunded,
        0
      );
      const creditsConsumed = devClaims.reduce(
        (acc, c) => acc + c.netCreditsConsumed,
        0
      );
      const attributedRevenueEgp = roundTo(
        devClaims.reduce((acc, c) => acc + c.attributedRevenueEgp, 0),
        2
      );
      const cashRevenuePaidEgp = cashPaidByDev.get(dev.id) || 0;

      const leadQualities = devClaims.map((c) => c.lead.qualityScore ?? 0);
      const matchStrengths = [
        ...devClaims
          .map((c) => c.matchStrengthAtClaim)
          .filter((v): v is number => typeof v === 'number'),
        ...devSnaps.map((s) => s.matchStrength),
      ];

      const funnel = calculateCentralizedFunnelMetrics(
        {
          claimed,
          contacted,
          replied,
          interested,
          meetings,
          proposals,
          negotiations,
          won: wins,
          lost,
          notInterested,
          invalid,
        },
        filters
      );

      return {
        developerId: dev.id,
        name: dev.name,
        email: dev.email,
        companyName: dev.developerProfile?.companyName || null,
        planName: dev.subscription?.plan?.nameEn || 'Free',
        subscriptionStatus: dev.subscription?.status || 'INACTIVE',
        leadsClaimed: claimed,
        totalLeads: claimed,
        contactedCount: contacted,
        repliedCount: replied,
        interestedCount: interested,
        meetingCount: meetings,
        proposalCount: proposals,
        negotiationCount: negotiations,
        totalWins: wins,
        lostCount: lost,
        invalidCount: invalid,
        estimatedProjectValueEgp,
        creditsConsumed,
        creditsCharged,
        creditsRefunded,
        creditsBalance: dev.creditAccount?.balance ?? dev.subscription?.credits ?? 0,
        attributedRevenueEgp,
        cashRevenuePaidEgp,
        averageLeadQuality: summarizeNumericValues(leadQualities).average,
        averageMatchStrength: summarizeNumericValues(matchStrengths).average,
        contactRate: funnel.stageRates.contactRate,
        replyRate: funnel.stageRates.replyRate,
        interestRate: funnel.stageRates.interestRate,
        meetingRate: funnel.stageRates.meetingRate,
        winRate: funnel.overallRates.winRateOfClaimed,
        winRateOfMeetings: funnel.stageRates.winRate,
        funnel,
      };
    });

  const paged = paginateAndSort(rows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy === 'totalLeads' ? 'leadsClaimed' : filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSortFields: [
      'leadsClaimed',
      'totalWins',
      'estimatedProjectValueEgp',
      'creditsConsumed',
      'attributedRevenueEgp',
      'cashRevenuePaidEgp',
      'averageLeadQuality',
      'averageMatchStrength',
      'name',
    ],
    defaultSortField: 'leadsClaimed',
  });

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    developers: paged.items,
    allDevelopersSummary: rows,
    pagination: paged.pagination,
  };
}

interface DeveloperAnalyticsCacheEntry {
  data: any;
  expiresAt: number;
}
const devAnalyticsCache = new Map<string, DeveloperAnalyticsCacheEntry>();

export function clearDeveloperAnalyticsCache(developerId?: string): void {
  if (developerId) {
    for (const key of devAnalyticsCache.keys()) {
      if (key.startsWith(`${developerId}:`)) {
        devAnalyticsCache.delete(key);
      }
    }
  } else {
    devAnalyticsCache.clear();
  }
}

/**
 * Developer-scoped analytics (Section 23, 24, 42, 49).
 * Strictly enforces developer ownership: a developer can ONLY access their own analytics.
 * Never leaks other developers' revenue, outcomes, private contact data, or internal source credentials.
 */
export async function getDeveloperOwnAnalytics(
  authenticatedDeveloperId: string,
  rawFilters: AnalyticsFilterInput = {}
) {
  if (!authenticatedDeveloperId || typeof authenticatedDeveloperId !== 'string') {
    throw new AnalyticsEngineError(
      'UNAUTHORIZED',
      'Authentication is required',
      401
    );
  }

  // Security check: if caller explicitly requested a different developerId in filters, reject with 403 Forbidden!
  if (
    rawFilters.developerId &&
    rawFilters.developerId.trim() !== '' &&
    rawFilters.developerId.trim() !== authenticatedDeveloperId
  ) {
    throw new AnalyticsEngineError(
      'FORBIDDEN_DEVELOPER_SCOPE',
      'You are only authorized to view your own developer analytics.',
      403,
      { requestedDeveloperId: rawFilters.developerId }
    );
  }

  const scopedFilters: AnalyticsFilterInput = {
    ...rawFilters,
    developerId: authenticatedDeveloperId,
  };

  const cacheKey = `${authenticatedDeveloperId}:${JSON.stringify(scopedFilters)}`;
  const now = Date.now();
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (!isTest) {
    const cached = devAnalyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  }

  const adminDevData = await getDeveloperAnalyticsForAdmin(scopedFilters);
  const mySummary = adminDevData.allDevelopersSummary.find(
    (d) => d.developerId === authenticatedDeveloperId
  );

  const ctx = await loadAnalyticsContext(scopedFilters);
  const myClaims = ctx.successfulClaims.filter(
    (c) => c.developerId === authenticatedDeveloperId
  );

  // Breakdown of developer's own claims by niche & city
  const byNiche: Record<
    string,
    { niche: string; labelAr: string; claimed: number; contacted: number; meetings: number; wins: number; estimatedValueEgp: number }
  > = {};
  const byCity: Record<
    string,
    { city: string; claimed: number; contacted: number; meetings: number; wins: number; estimatedValueEgp: number }
  > = {};

  for (const c of myClaims) {
    const n = c.lead.category;
    const nEntry = byNiche[n] || {
      niche: n,
      labelAr: CATEGORY_LABELS_AR[n] || n,
      claimed: 0,
      contacted: 0,
      meetings: 0,
      wins: 0,
      estimatedValueEgp: 0,
    };
    nEntry.claimed += 1;
    if (c.isContacted) nEntry.contacted += 1;
    if (c.isMeeting) nEntry.meetings += 1;
    if (c.isWon) {
      nEntry.wins += 1;
      nEntry.estimatedValueEgp += c.estimatedProjectValueEgp;
    }
    byNiche[n] = nEntry;

    const city = resolveCanonicalLocation(c.lead).city;
    const cEntry = byCity[city] || {
      city,
      claimed: 0,
      contacted: 0,
      meetings: 0,
      wins: 0,
      estimatedValueEgp: 0,
    };
    cEntry.claimed += 1;
    if (c.isContacted) cEntry.contacted += 1;
    if (c.isMeeting) cEntry.meetings += 1;
    if (c.isWon) {
      cEntry.wins += 1;
      cEntry.estimatedValueEgp += c.estimatedProjectValueEgp;
    }
    byCity[city] = cEntry;
  }

  const resultData = {
    generatedAt: new Date().toISOString(),
    developerId: authenticatedDeveloperId,
    dateRange: adminDevData.dateRange,
    filters: adminDevData.filters,
    performance: mySummary
      ? {
          developerId: mySummary.developerId,
          name: mySummary.name,
          companyName: mySummary.companyName,
          planName: mySummary.planName,
          subscriptionStatus: mySummary.subscriptionStatus,
          leadsClaimed: mySummary.leadsClaimed,
          contactedCount: mySummary.contactedCount,
          repliedCount: mySummary.repliedCount,
          interestedCount: mySummary.interestedCount,
          meetingCount: mySummary.meetingCount,
          proposalCount: mySummary.proposalCount,
          negotiationCount: mySummary.negotiationCount,
          totalWins: mySummary.totalWins,
          lostCount: mySummary.lostCount,
          invalidCount: mySummary.invalidCount,
          estimatedProjectValueEgp: mySummary.estimatedProjectValueEgp,
          creditsConsumed: mySummary.creditsConsumed,
          creditsRefunded: mySummary.creditsRefunded,
          creditsBalance: mySummary.creditsBalance,
          averageLeadQuality: mySummary.averageLeadQuality,
          averageMatchStrength: mySummary.averageMatchStrength,
          contactRate: mySummary.contactRate,
          replyRate: mySummary.replyRate,
          interestRate: mySummary.interestRate,
          meetingRate: mySummary.meetingRate,
          winRate: mySummary.winRate,
          winRateOfMeetings: mySummary.winRateOfMeetings,
          funnel: mySummary.funnel,
        }
      : null,
    byNiche: Object.values(byNiche).sort((a, b) => b.claimed - a.claimed),
    byCity: Object.values(byCity).sort((a, b) => b.claimed - a.claimed),
  };

  if (!isTest) {
    devAnalyticsCache.set(cacheKey, {
      data: resultData,
      expiresAt: Date.now() + 30_000,
    });
  }

  return resultData;
}

// ============================================================================
// 8. FUNNEL, LOST REASON & INVALID REASON ANALYTICS (Sections 21, 22, 24, 25, 26)
// ============================================================================
export async function getFunnelAndReasonsAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, successfulClaims, allFeedbacksRaw } = ctx;

  // Global Sales Funnel
  const claimed = successfulClaims.length;
  const contacted = successfulClaims.filter((c) => c.isContacted).length;
  const replied = successfulClaims.filter((c) => c.isReplied).length;
  const interested = successfulClaims.filter((c) => c.isInterested).length;
  const meetings = successfulClaims.filter((c) => c.isMeeting).length;
  const proposals = successfulClaims.filter((c) => c.isProposal).length;
  const negotiations = successfulClaims.filter((c) => c.isNegotiation).length;
  const won = successfulClaims.filter((c) => c.isWon).length;
  const lost = successfulClaims.filter((c) => c.isLost).length;
  const notInterested = successfulClaims.filter((c) => c.isNotInterested).length;
  const invalid = successfulClaims.filter((c) => c.isInvalid).length;

  const funnel = calculateCentralizedFunnelMetrics(
    {
      claimed,
      contacted,
      replied,
      interested,
      meetings,
      proposals,
      negotiations,
      won,
      lost,
      notInterested,
      invalid,
    },
    filters
  );

  // Lost Reason Analysis (Section 25)
  const lostOrNotInterestedClaims = successfulClaims.filter(
    (c) => c.isLost || c.isNotInterested
  );
  const totalLostOutcomes = lostOrNotInterestedClaims.length;

  const lostReasonCounts: Record<string, number> = {};
  for (const r of CANONICAL_LOST_REASONS) {
    lostReasonCounts[r] = 0;
  }

  const lostBySource: Record<string, Record<string, number>> = {};
  const lostByNiche: Record<string, Record<string, number>> = {};
  const lostByCity: Record<string, Record<string, number>> = {};
  const lostByScoreBand: Record<string, Record<string, number>> = {};
  const lostByQualityBand: Record<string, Record<string, number>> = {};
  const lostByDeveloper: Record<string, Record<string, number>> = {};

  const recordLostDimension = (
    map: Record<string, Record<string, number>>,
    dimKey: string,
    reasonCode: string
  ) => {
    if (!map[dimKey]) map[dimKey] = {};
    map[dimKey][reasonCode] = (map[dimKey][reasonCode] || 0) + 1;
  };

  for (const c of lostOrNotInterestedClaims) {
    const code = c.lostReasonCode || 'OTHER';
    lostReasonCounts[code] = (lostReasonCounts[code] || 0) + 1;

    const src = resolvePrimaryOriginSource(c.lead);
    const niche = c.lead.category;
    const city = resolveCanonicalLocation(c.lead).city;
    const scoreBand = c.lead.temperature;
    const qualityBand = c.lead.qualityStatus;

    recordLostDimension(lostBySource, src, code);
    recordLostDimension(lostByNiche, niche, code);
    recordLostDimension(lostByCity, city, code);
    recordLostDimension(lostByScoreBand, scoreBand, code);
    recordLostDimension(lostByQualityBand, qualityBand, code);
    recordLostDimension(lostByDeveloper, c.developerId, code);
  }

  const lostReasonsSummary = Object.entries(lostReasonCounts)
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      rate: buildRateMetric(
        `LOST_REASON_${reasonCode}`,
        count,
        totalLostOutcomes,
        filters,
        {
          customNumeratorLabel: `Lost engagements with reason ${reasonCode}`,
          customDenominatorLabel: 'Total lost / not-interested engagements',
        }
      ),
    }))
    .sort((a, b) => b.count - a.count);

  // Invalid Reason Analysis (Section 26)
  const invalidReasonCounts: Record<string, number> = {};
  for (const r of CANONICAL_INVALID_REASONS) {
    invalidReasonCounts[r] = 0;
  }
  const invalidBySource: Record<string, Record<string, number>> = {};

  let totalInvalidSignals = 0;
  for (const c of successfulClaims) {
    if (c.isInvalid) {
      const code = c.invalidReasonCode || 'WRONG_PHONE';
      invalidReasonCounts[code] = (invalidReasonCounts[code] || 0) + 1;
      totalInvalidSignals += 1;
      const src = resolvePrimaryOriginSource(c.lead);
      if (!invalidBySource[src]) invalidBySource[src] = {};
      invalidBySource[src][code] = (invalidBySource[src][code] || 0) + 1;
    }
  }

  for (const fb of allFeedbacksRaw) {
    if (fb.useful) continue;
    const lead = ctx.canonicalLeadById.get(fb.leadId);
    if (!lead) continue;
    if (!isWithinDateRange(fb.createdAt, filters.dateRange)) continue;
    const code = normalizeInvalidReasonCode(fb.reasonCode || fb.reason);
    invalidReasonCounts[code] = (invalidReasonCounts[code] || 0) + 1;
    totalInvalidSignals += 1;
    const src = resolvePrimaryOriginSource(lead);
    if (!invalidBySource[src]) invalidBySource[src] = {};
    invalidBySource[src][code] = (invalidBySource[src][code] || 0) + 1;
  }

  for (const l of canonicalLeads) {
    const src = resolvePrimaryOriginSource(l);
    if (!invalidBySource[src]) invalidBySource[src] = {};
    if (l.phoneValidationStatus === 'INVALID' || l.qualityFlags.includes('INVALID_PHONE')) {
      invalidReasonCounts.WRONG_PHONE = (invalidReasonCounts.WRONG_PHONE || 0) + 1;
      invalidBySource[src].WRONG_PHONE = (invalidBySource[src].WRONG_PHONE || 0) + 1;
      totalInvalidSignals += 1;
    }
    if (l.emailValidationStatus === 'INVALID' || l.qualityFlags.includes('INVALID_EMAIL')) {
      invalidReasonCounts.WRONG_EMAIL = (invalidReasonCounts.WRONG_EMAIL || 0) + 1;
      invalidBySource[src].WRONG_EMAIL = (invalidBySource[src].WRONG_EMAIL || 0) + 1;
      totalInvalidSignals += 1;
    }
    if (l.businessStatus === 'CLOSED' || l.qualityFlags.includes('BUSINESS_CLOSED')) {
      invalidReasonCounts.BUSINESS_CLOSED =
        (invalidReasonCounts.BUSINESS_CLOSED || 0) + 1;
      invalidBySource[src].BUSINESS_CLOSED =
        (invalidBySource[src].BUSINESS_CLOSED || 0) + 1;
      totalInvalidSignals += 1;
    }
  }

  const invalidReasonsSummary = Object.entries(invalidReasonCounts)
    .map(([reasonCode, count]) => ({
      reasonCode,
      count,
      rate: buildRateMetric(
        `INVALID_REASON_${reasonCode}`,
        count,
        totalInvalidSignals,
        filters,
        {
          customNumeratorLabel: `Invalid signals with reason ${reasonCode}`,
          customDenominatorLabel: 'Total invalid signals evaluated',
        }
      ),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    funnel,
    lostReasonAnalysis: {
      totalLostOutcomes,
      reasons: lostReasonsSummary,
      bySource: lostBySource,
      byNiche: lostByNiche,
      byCity: lostByCity,
      byScoreBand: lostByScoreBand,
      byQualityBand: lostByQualityBand,
      byDeveloper: lostByDeveloper,
    },
    invalidReasonAnalysis: {
      totalInvalidSignals,
      reasons: invalidReasonsSummary,
      bySource: invalidBySource,
    },
  };
}

// ============================================================================
// 9. OPERATIONAL DATA QUALITY DASHBOARD (Section 27 & 28)
// ============================================================================
export async function getDataQualityDashboardAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const { filters, canonicalLeads, duplicateCandidates } = ctx;

  let missingPhone = 0;
  let missingEmail = 0;
  let missingWebsite = 0;
  let invalidPhone = 0;
  let invalidEmail = 0;
  let staleLeads = 0;
  let leadsRequiringVerification = 0;
  let conflictingSourceData = 0;
  let invalidLeads = 0;

  const issueRows: Array<{
    leadId: string;
    businessName: string;
    source: string;
    niche: string;
    city: string;
    qualityScore: number;
    qualityBand: string;
    freshness: string;
    saleabilityStatus: string;
    issues: string[];
    createdAt: string;
  }> = [];

  for (const lead of canonicalLeads) {
    const issues: string[] = [];

    if (!lead.hasPhone || !lead.phone) {
      missingPhone += 1;
      issues.push('MISSING_PHONE');
    }
    if (!lead.hasEmail || !lead.email) {
      missingEmail += 1;
      issues.push('MISSING_EMAIL');
    }
    if (lead.websiteStatus === 'NO_WEBSITE' || !lead.website) {
      missingWebsite += 1;
    }
    if (
      lead.phoneValidationStatus === 'INVALID' ||
      lead.qualityFlags.includes('INVALID_PHONE')
    ) {
      invalidPhone += 1;
      issues.push('INVALID_PHONE');
    }
    if (
      lead.emailValidationStatus === 'INVALID' ||
      lead.qualityFlags.includes('INVALID_EMAIL')
    ) {
      invalidEmail += 1;
      issues.push('INVALID_EMAIL');
    }
    if (
      lead.freshnessStatus === 'STALE' ||
      lead.freshnessStatus === 'VERY_STALE' ||
      lead.status === 'STALE'
    ) {
      staleLeads += 1;
      issues.push('STALE_LEAD');
    }
    if (
      lead.freshnessStatus === 'NEEDS_VERIFICATION' ||
      lead.status === 'REQUIRES_VERIFICATION' ||
      lead.saleabilityStatus === 'REQUIRES_VERIFICATION' ||
      lead.qualityFlags.includes('REQUIRES_REVERIFICATION')
    ) {
      leadsRequiringVerification += 1;
      issues.push('REQUIRES_VERIFICATION');
    }

    const hasConflicts =
      lead.fieldConflicts &&
      ((Array.isArray(lead.fieldConflicts) && lead.fieldConflicts.length > 0) ||
        (typeof lead.fieldConflicts === 'object' &&
          !Array.isArray(lead.fieldConflicts) &&
          Object.keys(lead.fieldConflicts as Record<string, unknown>).length > 0));
    if (hasConflicts || lead.qualityFlags.includes('SOURCE_CONFLICT')) {
      conflictingSourceData += 1;
      issues.push('CONFLICTING_SOURCE_DATA');
    }

    if (lead.status === 'INVALID' || lead.saleabilityStatus === 'INVALID') {
      invalidLeads += 1;
      issues.push('INVALID_LEAD');
    }

    if (issues.length > 0) {
      issueRows.push({
        leadId: lead.id,
        businessName: lead.businessName,
        source: resolvePrimaryOriginSource(lead),
        niche: lead.category,
        city: resolveCanonicalLocation(lead).city,
        qualityScore: lead.qualityScore,
        qualityBand: lead.qualityStatus,
        freshness: lead.freshnessStatus,
        saleabilityStatus: lead.saleabilityStatus,
        issues,
        createdAt: lead.createdAt.toISOString(),
      });
    }
  }

  const pendingDuplicateCandidates = duplicateCandidates.filter(
    (dc) =>
      dc.status === 'PENDING' &&
      isWithinDateRange(dc.createdAt, filters.dateRange)
  ).length;
  const totalDuplicateCandidates = duplicateCandidates.filter((dc) =>
    isWithinDateRange(dc.createdAt, filters.dateRange)
  ).length;

  const sourceAnalytics = await getSourceAnalytics(rawFilters);
  const funnelAndReasons = await getFunnelAndReasonsAnalytics(rawFilters);
  const anomalies = await detectDeterministicAnomaliesFromContext(ctx);

  const pagedIssues = paginateAndSort(issueRows, {
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy === 'totalLeads' ? 'qualityScore' : filters.sortBy,
    sortOrder: filters.sortOrder === 'desc' ? 'asc' : filters.sortOrder,
    allowedSortFields: ['qualityScore', 'businessName', 'source', 'city', 'createdAt'],
    defaultSortField: 'qualityScore',
  });

  const totalLeads = canonicalLeads.length;

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    summary: {
      totalCanonicalLeads: totalLeads,
      missingPhone,
      missingEmail,
      missingWebsite,
      invalidPhone,
      invalidEmail,
      staleLeads,
      leadsRequiringVerification,
      duplicateCandidates: totalDuplicateCandidates,
      pendingDuplicateCandidates,
      conflictingSourceData,
      invalidLeads,
      rates: {
        missingPhoneRate: buildRateMetric('MISSING_PHONE_RATE', missingPhone, totalLeads, filters),
        missingEmailRate: buildRateMetric('MISSING_EMAIL_RATE', missingEmail, totalLeads, filters),
        invalidPhoneRate: buildRateMetric('INVALID_PHONE_RATE', invalidPhone, totalLeads, filters),
        staleRate: buildRateMetric('STALE_RATE', staleLeads, totalLeads, filters),
        requiresVerificationRate: buildRateMetric(
          'REQUIRES_VERIFICATION_RATE',
          leadsRequiringVerification,
          totalLeads,
          filters
        ),
        invalidRate: buildRateMetric('INVALID_RATE', invalidLeads, totalLeads, filters),
      },
    },
    sourceQualityScorecards: sourceAnalytics.allSourcesSummary.map((s) => ({
      sourceName: s.sourceName,
      sourceType: s.sourceType,
      uniqueLeads: s.uniqueLeads,
      duplicates: s.duplicates,
      invalidLeads: s.invalidLeads,
      dataQuality: s.scorecard.dataQuality,
      commercialQuality: s.scorecard.commercialQuality,
      invalidReasons: s.invalidReasons,
    })),
    invalidReasonAnalysis: funnelAndReasons.invalidReasonAnalysis,
    anomalyFlags: anomalies,
    problemLeads: pagedIssues.items,
    pagination: pagedIssues.pagination,
  };
}

// ============================================================================
// 10. DETERMINISTIC RULE PERFORMANCE ENGINE (Sections 17, 29, 31, 32, 40, 48)
// ============================================================================
export async function getRulePerformanceAnalytics(
  rawFilters: AnalyticsFilterInput = {}
) {
  const ctx = await loadAnalyticsContext(rawFilters);
  const {
    filters,
    canonicalLeads,
    claimsByLeadId,
    successfulClaims,
    scoringRulesDb,
    matchingRulesDb,
    matchSnapshotsRaw,
  } = ctx;

  const minSample = filters.minimumSampleSize;

  // --- A. SCORING RULES PERFORMANCE ---
  const scoringRulesCatalog =
    scoringRulesDb.length > 0
      ? scoringRulesDb.map((r) => ({
          id: r.id,
          key: r.key || r.code,
          code: r.code,
          name: r.name,
          nameEn: r.nameEn || r.code,
          category: r.category || 'GENERAL',
          points: r.points || r.weight,
          enabled: r.enabled,
          version: r.version || 'v1',
        }))
      : DEFAULT_SCORING_RULES.map((r) => ({
          id: r.id,
          key: r.key || r.code,
          code: r.code,
          name: r.name,
          nameEn: r.nameEn,
          category: String(r.category || 'GENERAL'),
          points: r.points ?? r.weight,
          enabled: r.enabled,
          version: r.version || 'v1',
        }));

  // Extract applied rule keys per Lead from qualificationRules / scoreExplanation / LeadScore
  const appliedRulesByLeadId = new Map<string, Set<string>>();
  for (const lead of canonicalLeads) {
    const keys = new Set<string>();
    if (Array.isArray(lead.qualificationRules)) {
      for (const item of lead.qualificationRules as Array<Record<string, unknown>>) {
        if (item && typeof item === 'object') {
          if (typeof item.ruleKey === 'string') keys.add(item.ruleKey);
          if (typeof item.code === 'string') keys.add(item.code);
        } else if (typeof item === 'string') {
          keys.add(item);
        }
      }
    }
    if (lead.scoreExplanation && typeof lead.scoreExplanation === 'object') {
      const exp = lead.scoreExplanation as {
        appliedRules?: Array<Record<string, unknown>>;
        reasons?: Array<Record<string, unknown>>;
      };
      for (const arr of [exp.appliedRules, exp.reasons]) {
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item && typeof item === 'object') {
              if (typeof item.ruleKey === 'string') keys.add(item.ruleKey);
              if (typeof item.code === 'string') keys.add(item.code);
            }
          }
        }
      }
    }
    appliedRulesByLeadId.set(lead.id, keys);
  }

  for (const ls of ctx.leadScoresRaw) {
    if (!ctx.canonicalLeadById.has(ls.leadId)) continue;
    if (filters.scoringVersion && ls.scoringVersion !== filters.scoringVersion) continue;
    const keys = appliedRulesByLeadId.get(ls.leadId) || new Set<string>();
    if (Array.isArray(ls.appliedRules)) {
      for (const item of ls.appliedRules as Array<Record<string, unknown>>) {
        if (item && typeof item === 'object') {
          if (typeof item.ruleKey === 'string') keys.add(item.ruleKey);
          if (typeof item.code === 'string') keys.add(item.code);
        }
      }
    }
    appliedRulesByLeadId.set(ls.leadId, keys);
  }

  const scoringRuleRows: RulePerformanceRow[] = scoringRulesCatalog.map((rule) => {
    const withLeads = canonicalLeads.filter((l) => {
      const keys = appliedRulesByLeadId.get(l.id);
      return Boolean(keys && (keys.has(rule.key) || keys.has(rule.code)));
    });
    const withoutLeads = canonicalLeads.filter((l) => {
      const keys = appliedRulesByLeadId.get(l.id);
      return !keys || (!keys.has(rule.key) && !keys.has(rule.code));
    });

    return buildRulePerformanceRow({
      ruleType: 'SCORING',
      ruleId: rule.id,
      ruleKey: rule.key,
      ruleName: rule.name,
      ruleNameEn: rule.nameEn,
      category: rule.category,
      points: rule.points,
      enabled: rule.enabled,
      ruleVersion: rule.version,
      timesTriggered: withLeads.length,
      withLeads,
      withoutLeads,
      claimsByLeadId,
      filters,
      minSample,
    });
  });

  // --- B. MATCHING RULES PERFORMANCE (Section 17 & 29) ---
  const matchingRulesCatalog =
    matchingRulesDb.length > 0
      ? matchingRulesDb.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          nameEn: r.nameEn || r.key,
          category: String(r.category),
          points: r.points,
          enabled: r.enabled,
          version: r.version || 'v1',
        }))
      : DEFAULT_MATCHING_RULES.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          nameEn: r.nameEn,
          category: String(r.category),
          points: r.points,
          enabled: r.enabled,
          version: r.version || 'v1',
        }));

  const claimByPair = new Map<string, (typeof successfulClaims)[number]>();
  for (const c of successfulClaims) {
    claimByPair.set(`${c.leadId}:${c.developerId}`, c);
  }

  const validSnapshots = matchSnapshotsRaw.filter((ms) => {
    if (!ctx.canonicalLeadById.has(ms.leadId)) return false;
    if (filters.developerId && ms.developerId !== filters.developerId) return false;
    if (filters.matchVersion && ms.matchVersion !== filters.matchVersion) return false;
    return true;
  });

  const matchingRuleRows: RulePerformanceRow[] = matchingRulesCatalog.map((rule) => {
    const triggeredSnapshots: typeof validSnapshots = [];
    const nonTriggeredSnapshots: typeof validSnapshots = [];

    for (const snap of validSnapshots) {
      const criteria = Array.isArray(snap.matchedCriteria)
        ? (snap.matchedCriteria as Array<Record<string, unknown>>)
        : [];
      const didTrigger = criteria.some(
        (c) =>
          c &&
          typeof c === 'object' &&
          (c.ruleKey === rule.key || c.key === rule.key || c.ruleId === rule.id)
      );
      if (didTrigger) {
        triggeredSnapshots.push(snap);
      } else {
        nonTriggeredSnapshots.push(snap);
      }
    }

    const summarizeSnapshotSet = (snaps: typeof validSnapshots) => {
      const distinctLeads = new Set<string>();
      let eligibleCount = 0;
      let claimsCount = 0;
      let contactedCount = 0;
      let repliedCount = 0;
      let interestedCount = 0;
      let meetingCount = 0;
      let wonCount = 0;
      let lostCount = 0;
      let invalidCount = 0;
      const oppScores: number[] = [];
      const qualScores: number[] = [];
      const projectValues: number[] = [];

      for (const s of snaps) {
        distinctLeads.add(s.leadId);
        if (s.eligible) eligibleCount += 1;
        oppScores.push(s.opportunityScore);
        qualScores.push(s.qualityScore);

        const claim = claimByPair.get(`${s.leadId}:${s.developerId}`);
        if (claim) {
          claimsCount += 1;
          if (claim.isContacted) contactedCount += 1;
          if (claim.isReplied) repliedCount += 1;
          if (claim.isInterested) interestedCount += 1;
          if (claim.isMeeting) meetingCount += 1;
          if (claim.isWon) {
            wonCount += 1;
            if (claim.estimatedProjectValueEgp > 0) {
              projectValues.push(claim.estimatedProjectValueEgp);
            }
          }
          if (claim.isLost) lostCount += 1;
          if (claim.isInvalid) invalidCount += 1;
        }
      }

      const denomMatches = eligibleCount > 0 ? eligibleCount : snaps.length;

      return {
        matchesCount: snaps.length,
        eligibleMatchesCount: eligibleCount,
        leadsCount: distinctLeads.size,
        claimsCount,
        contactedCount,
        repliedCount,
        interestedCount,
        meetingCount,
        wonCount,
        lostCount,
        invalidCount,
        averageOpportunityScore: summarizeNumericValues(oppScores).average,
        averageQualityScore: summarizeNumericValues(qualScores).average,
        averageProjectValueEgp: summarizeNumericValues(projectValues).average,
        claimRate: buildRateMetric(
          'CLAIMS_PER_MATCH_RATE',
          claimsCount,
          denomMatches,
          filters
        ),
        contactRate: buildRateMetric(
          'CONTACT_RATE',
          contactedCount,
          claimsCount,
          filters
        ),
        meetingRate: buildRateMetric(
          'MEETING_RATE_OF_CLAIMED',
          meetingCount,
          claimsCount,
          filters
        ),
        winRate: buildRateMetric(
          'WIN_RATE',
          wonCount,
          claimsCount,
          filters,
          { minimumSampleSize: minSample }
        ),
        invalidRate: buildRateMetric(
          'INVALID_RATE',
          invalidCount,
          claimsCount,
          filters
        ),
      };
    };

    const withStats = summarizeSnapshotSet(triggeredSnapshots);
    const withoutStats = summarizeSnapshotSet(nonTriggeredSnapshots);

    // Sample size for rule evaluation: number of claims when evaluating outcome conversion, or triggered matches if claims > 0
    const sampleSize =
      withStats.claimsCount > 0
        ? withStats.claimsCount
        : triggeredSnapshots.length;
    const isSufficient = sampleSize >= minSample;

    const comp = compareObservedVsBaseline({
      observedNumerator: withStats.wonCount,
      observedDenominator: withStats.claimsCount,
      baselineNumerator: withoutStats.wonCount,
      baselineDenominator: withoutStats.claimsCount,
      minimumSampleSize: minSample,
    });

    const contactComp = compareObservedVsBaseline({
      observedNumerator: withStats.contactedCount,
      observedDenominator: withStats.claimsCount,
      baselineNumerator: withoutStats.contactedCount,
      baselineDenominator: withoutStats.claimsCount,
      minimumSampleSize: minSample,
    });

    const invalidComp = compareObservedVsBaseline({
      observedNumerator: withStats.invalidCount,
      observedDenominator: withStats.claimsCount,
      baselineNumerator: withoutStats.invalidCount,
      baselineDenominator: withoutStats.claimsCount,
      minimumSampleSize: minSample,
    });

    const isPositiveRule = rule.points >= 0;
    const underperforming =
      isSufficient &&
      isPositiveRule &&
      comp.absoluteDifference !== null &&
      comp.absoluteDifference < -0.02;

    return {
      ruleType: 'MATCHING',
      ruleId: rule.id,
      ruleKey: rule.key,
      ruleName: rule.name,
      ruleNameEn: rule.nameEn,
      category: rule.category,
      points: rule.points,
      enabled: rule.enabled,
      ruleVersion: rule.version,
      timesTriggered: triggeredSnapshots.length,
      leadsAffected: withStats.leadsCount,
      sampleSize,
      minimumSampleSize: minSample,
      sampleStatus: isSufficient ? 'SUFFICIENT' : 'INSUFFICIENT_SAMPLE',
      withRule: withStats,
      withoutRule: withoutStats,
      comparison: {
        winRateLiftAbsolute: comp.absoluteDifference,
        winRateLiftRelative: comp.relativeDifference,
        contactRateLiftAbsolute: contactComp.absoluteDifference,
        invalidRateDeltaAbsolute: invalidComp.absoluteDifference,
        flaggedForReview: underperforming,
        flagReason: underperforming
          ? `Matching rule ${rule.key} has lower win rate (${withStats.winRate.displayValue}) than baseline without rule (${withoutStats.winRate.displayValue}) across ${sampleSize} observations.`
          : null,
      },
    };
  });

  // --- C. QUALITY RULES PERFORMANCE (Section 29) ---
  const qualityRuleRows: RulePerformanceRow[] = QUALITY_RULE_DEFINITIONS.map(
    (qRule) => {
      const withLeads = canonicalLeads.filter((l) => qRule.matchesLead(l));
      const withoutLeads = canonicalLeads.filter((l) => !qRule.matchesLead(l));

      return buildRulePerformanceRow({
        ruleType: 'QUALITY',
        ruleId: `quality-rule-${qRule.key.toLowerCase()}`,
        ruleKey: qRule.key,
        ruleName: qRule.name,
        ruleNameEn: qRule.nameEn,
        category: qRule.category,
        points: qRule.points,
        enabled: true,
        ruleVersion: 'v1',
        timesTriggered: withLeads.length,
        withLeads,
        withoutLeads,
        claimsByLeadId,
        filters,
        minSample,
      });
    }
  );

  const allRules = [
    ...scoringRuleRows,
    ...matchingRuleRows,
    ...qualityRuleRows,
  ];

  const byMatchStrengthBand = computeMatchStrengthBands(ctx);

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    minimumSampleSize: minSample,
    scoringRules: scoringRuleRows,
    matchingRules: matchingRuleRows,
    qualityRules: qualityRuleRows,
    allRules,
    byMatchStrengthBand,
  };
}

function buildRulePerformanceRow(params: {
  ruleType: RuleReviewType;
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  ruleNameEn: string;
  category: string;
  points: number;
  enabled: boolean;
  ruleVersion: string;
  timesTriggered: number;
  withLeads: Array<{
    id: string;
    score: number;
    qualityScore: number;
    completenessScore: number;
    status: string;
    saleabilityStatus: string;
    verificationStatus: string;
    freshnessStatus: string;
    availableForClaim: boolean;
  }>;
  withoutLeads: Array<{
    id: string;
    score: number;
    qualityScore: number;
    completenessScore: number;
    status: string;
    saleabilityStatus: string;
    verificationStatus: string;
    freshnessStatus: string;
    availableForClaim: boolean;
  }>;
  claimsByLeadId: Map<
    string,
    Array<
      EngagementStageFlags & {
        attributedRevenueEgp: number;
        grossClaimRevenueEgp: number;
        refundedClaimRevenueEgp: number;
      }
    >
  >;
  filters: NormalizedAnalyticsFilters;
  minSample: number;
}): RulePerformanceRow {
  const {
    ruleType,
    ruleId,
    ruleKey,
    ruleName,
    ruleNameEn,
    category,
    points,
    enabled,
    ruleVersion,
    timesTriggered,
    withLeads,
    withoutLeads,
    claimsByLeadId,
    filters,
    minSample,
  } = params;

  const withAgg = aggregateLeadSegmentMetrics(withLeads, claimsByLeadId, filters);
  const withoutAgg = aggregateLeadSegmentMetrics(
    withoutLeads,
    claimsByLeadId,
    filters
  );

  // Sample size is the number of triggered observations (leadsAffected / timesTriggered or claimsCount)
  const sampleSize = timesTriggered;
  const isSufficient = sampleSize >= minSample;

  const winComp = compareObservedVsBaseline({
    observedNumerator: withAgg.wonCount,
    observedDenominator:
      withAgg.claimsCount > 0 ? withAgg.claimsCount : withAgg.leadsCount,
    baselineNumerator: withoutAgg.wonCount,
    baselineDenominator:
      withoutAgg.claimsCount > 0 ? withoutAgg.claimsCount : withoutAgg.leadsCount,
    minimumSampleSize: minSample,
  });

  const contactComp = compareObservedVsBaseline({
    observedNumerator: withAgg.contactedCount,
    observedDenominator:
      withAgg.claimsCount > 0 ? withAgg.claimsCount : withAgg.leadsCount,
    baselineNumerator: withoutAgg.contactedCount,
    baselineDenominator:
      withoutAgg.claimsCount > 0 ? withoutAgg.claimsCount : withoutAgg.leadsCount,
    minimumSampleSize: minSample,
  });

  const invalidComp = compareObservedVsBaseline({
    observedNumerator: withAgg.invalidLeadCount,
    observedDenominator: withAgg.leadsCount,
    baselineNumerator: withoutAgg.invalidLeadCount,
    baselineDenominator: withoutAgg.leadsCount,
    minimumSampleSize: minSample,
  });

  const isPositiveRule = points >= 0;
  let flaggedForReview = false;
  let flagReason: string | null = null;

  if (isSufficient) {
    if (
      isPositiveRule &&
      winComp.observedValue !== null &&
      winComp.baselineValue !== null &&
      winComp.observedValue < winComp.baselineValue
    ) {
      flaggedForReview = true;
      flagReason = `Positive rule ${ruleKey} (+${points}) has lower observed win rate (${roundTo(winComp.observedValue * 100, 1)}%) than baseline without rule (${roundTo(winComp.baselineValue * 100, 1)}%) across ${sampleSize} observations.`;
    } else if (
      isPositiveRule &&
      invalidComp.observedValue !== null &&
      invalidComp.baselineValue !== null &&
      invalidComp.observedValue > invalidComp.baselineValue + 0.1
    ) {
      flaggedForReview = true;
      flagReason = `Positive rule ${ruleKey} (+${points}) exhibits elevated invalid rate (${roundTo(invalidComp.observedValue * 100, 1)}% vs ${roundTo(invalidComp.baselineValue * 100, 1)}% baseline) across ${sampleSize} observations.`;
    }
  }

  // Build rate metrics with minimumSampleSize awareness
  const withWinRate = buildRateMetric(
    'WIN_RATE',
    withAgg.wonCount,
    withAgg.claimsCount,
    filters,
    { minimumSampleSize: isSufficient ? 0 : minSample }
  );

  return {
    ruleType,
    ruleId,
    ruleKey,
    ruleName,
    ruleNameEn,
    category,
    points,
    enabled,
    ruleVersion,
    timesTriggered,
    leadsAffected: withAgg.leadsCount,
    sampleSize,
    minimumSampleSize: minSample,
    sampleStatus: isSufficient ? 'SUFFICIENT' : 'INSUFFICIENT_SAMPLE',
    withRule: {
      leadsCount: withAgg.leadsCount,
      claimsCount: withAgg.claimsCount,
      contactedCount: withAgg.contactedCount,
      repliedCount: withAgg.repliedCount,
      interestedCount: withAgg.interestedCount,
      meetingCount: withAgg.meetingCount,
      wonCount: withAgg.wonCount,
      lostCount: withAgg.lostCount,
      invalidCount: withAgg.invalidLeadCount,
      averageOpportunityScore: withAgg.opportunityScoreStats.average,
      averageQualityScore: withAgg.qualityScoreStats.average,
      averageProjectValueEgp: withAgg.averageEstimatedProjectValueEgp,
      claimRate: withAgg.rates.claimRate,
      contactRate: withAgg.rates.contactRate,
      meetingRate: withAgg.rates.meetingRateOfClaimed,
      winRate: withWinRate,
      invalidRate: withAgg.rates.invalidRate,
    },
    withoutRule: {
      leadsCount: withoutAgg.leadsCount,
      claimsCount: withoutAgg.claimsCount,
      contactedCount: withoutAgg.contactedCount,
      repliedCount: withoutAgg.repliedCount,
      interestedCount: withoutAgg.interestedCount,
      meetingCount: withoutAgg.meetingCount,
      wonCount: withoutAgg.wonCount,
      lostCount: withoutAgg.lostCount,
      invalidCount: withoutAgg.invalidLeadCount,
      claimRate: withoutAgg.rates.claimRate,
      contactRate: withoutAgg.rates.contactRate,
      meetingRate: withoutAgg.rates.meetingRateOfClaimed,
      winRate: withoutAgg.rates.winRate,
      invalidRate: withoutAgg.rates.invalidRate,
    },
    comparison: {
      winRateLiftAbsolute: winComp.absoluteDifference,
      winRateLiftRelative: winComp.relativeDifference,
      contactRateLiftAbsolute: contactComp.absoluteDifference,
      invalidRateDeltaAbsolute: invalidComp.absoluteDifference,
      flaggedForReview,
      flagReason,
    },
  };
}

// ============================================================================
// 11. RULE REVIEW QUEUE — HUMAN-IN-THE-LOOP DATA FLYWHEEL (Section 3, 30, 32, 48)
// ============================================================================
export async function listRuleReviewCandidates(params: {
  status?: RuleReviewStatus | string | null;
  ruleType?: RuleReviewType | string | null;
  ruleKey?: string | null;
  page?: number | null;
  pageSize?: number | null;
} = {}) {
  await ensureDbReady();

  const where: Record<string, unknown> = {};
  if (params.status && params.status !== 'ALL') {
    where.status = params.status;
  }
  if (params.ruleType && params.ruleType !== 'ALL') {
    where.ruleType = params.ruleType;
  }
  if (params.ruleKey && params.ruleKey.trim()) {
    where.ruleKey = params.ruleKey.trim();
  }

  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize || 20)));

  const [totalItems, candidates] = await Promise.all([
    prisma.ruleReviewCandidate.count({ where }),
    prisma.ruleReviewCandidate.findMany({
      where,
      include: {
        reviewer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return {
    candidates,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      sortBy: 'createdAt',
      sortOrder: 'desc' as const,
    },
  };
}

/**
 * Evaluates deterministic rule performance and generates/updates `RuleReviewCandidate` records
 * ONLY when `sampleSize >= minimumSampleSize`.
 * NEVER modifies production `ScoringRule`, `MatchingRule`, or `QualityConfig` records automatically.
 */
export async function evaluateAndGenerateRuleReviewCandidates(
  rawFilters: AnalyticsFilterInput = {},
  options?: {
    actorUserId?: string;
    includeSignificantPositiveLifts?: boolean;
  }
) {
  const rulePerf = await getRulePerformanceAnalytics(rawFilters);
  const minSample = rulePerf.minimumSampleSize;
  const windowLabel =
    rulePerf.dateRange.from && rulePerf.dateRange.to
      ? `${rulePerf.dateRange.from.slice(0, 10)}..${rulePerf.dateRange.to.slice(0, 10)}`
      : `ALL_TIME_AS_OF_${new Date().toISOString().slice(0, 10)}`;

  const createdOrUpdated = [];
  const skippedInsufficientSample: Array<{
    ruleType: string;
    ruleKey: string;
    sampleSize: number;
    minimumSampleSize: number;
    status: 'INSUFFICIENT_SAMPLE';
  }> = [];

  for (const row of rulePerf.allRules) {
    if (row.sampleSize < minSample) {
      skippedInsufficientSample.push({
        ruleType: row.ruleType,
        ruleKey: row.ruleKey,
        sampleSize: row.sampleSize,
        minimumSampleSize: minSample,
        status: 'INSUFFICIENT_SAMPLE',
      });
      continue;
    }

    const obsWin = row.withRule.winRate.value ?? 0;
    const baseWin = row.withoutRule.winRate.value ?? 0;
    const absDiff = roundTo(obsWin - baseWin, 4);
    const relDiff = baseWin > 0 ? roundTo((obsWin - baseWin) / baseWin, 4) : null;

    const shouldCreateCandidate =
      row.comparison.flaggedForReview ||
      (options?.includeSignificantPositiveLifts && Math.abs(absDiff) >= 0.05);

    if (!shouldCreateCandidate) continue;

    // Check if an OPEN or UNDER_REVIEW candidate already exists for this ruleType + ruleKey + ruleVersion + metric
    const existing = await prisma.ruleReviewCandidate.findFirst({
      where: {
        ruleType: row.ruleType,
        ruleKey: row.ruleKey,
        ruleVersion: row.ruleVersion,
        metric: 'WIN_RATE',
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
    });

    if (existing) {
      const updated = await prisma.ruleReviewCandidate.update({
        where: { id: existing.id },
        data: {
          baselineValue: baseWin,
          observedValue: obsWin,
          absoluteDifference: absDiff,
          relativeDifference: relDiff,
          sampleSize: row.sampleSize,
          minimumSampleSize: minSample,
          triggeredNumerator: row.withRule.wonCount,
          triggeredDenominator: row.withRule.claimsCount,
          baselineNumerator: row.withoutRule.wonCount,
          baselineDenominator: row.withoutRule.claimsCount,
          evidenceWindow: windowLabel,
          recommendation:
            row.comparison.flagReason ||
            `Observed win rate (${roundTo(obsWin * 100, 1)}%) differs from baseline (${roundTo(baseWin * 100, 1)}%). Admin review recommended.`,
          evidenceDetails: {
            withRule: {
              leadsCount: row.withRule.leadsCount,
              claimsCount: row.withRule.claimsCount,
              wonCount: row.withRule.wonCount,
              invalidCount: row.withRule.invalidCount,
            },
            withoutRule: {
              leadsCount: row.withoutRule.leadsCount,
              claimsCount: row.withoutRule.claimsCount,
              wonCount: row.withoutRule.wonCount,
              invalidCount: row.withoutRule.invalidCount,
            },
          },
        },
      });
      createdOrUpdated.push(updated);
    } else {
      const created = await prisma.ruleReviewCandidate.create({
        data: {
          ruleType: row.ruleType,
          ruleKey: row.ruleKey,
          ruleName: row.ruleName,
          ruleVersion: row.ruleVersion,
          metric: 'WIN_RATE',
          metricVersion: 'WIN_RATE_V1',
          baselineValue: baseWin,
          observedValue: obsWin,
          absoluteDifference: absDiff,
          relativeDifference: relDiff,
          sampleSize: row.sampleSize,
          minimumSampleSize: minSample,
          triggeredNumerator: row.withRule.wonCount,
          triggeredDenominator: row.withRule.claimsCount,
          baselineNumerator: row.withoutRule.wonCount,
          baselineDenominator: row.withoutRule.claimsCount,
          evidenceWindow: windowLabel,
          recommendation:
            row.comparison.flagReason ||
            `Observed win rate (${roundTo(obsWin * 100, 1)}%) differs from baseline (${roundTo(baseWin * 100, 1)}%). Admin review recommended.`,
          evidenceDetails: {
            withRule: {
              leadsCount: row.withRule.leadsCount,
              claimsCount: row.withRule.claimsCount,
              wonCount: row.withRule.wonCount,
              invalidCount: row.withRule.invalidCount,
            },
            withoutRule: {
              leadsCount: row.withoutRule.leadsCount,
              claimsCount: row.withoutRule.claimsCount,
              wonCount: row.withoutRule.wonCount,
              invalidCount: row.withoutRule.invalidCount,
            },
          },
          status: 'OPEN',
        },
      });
      createdOrUpdated.push(created);
    }
  }

  if (options?.actorUserId) {
    await createAuditLog({
      userId: options.actorUserId,
      action: 'RULE_REVIEW_CANDIDATES_EVALUATED',
      entityType: 'RuleReviewCandidate',
      details: {
        minimumSampleSize: minSample,
        candidatesGeneratedOrUpdated: createdOrUpdated.length,
        skippedInsufficientSampleCount: skippedInsufficientSample.length,
      },
    });
  }

  return {
    minimumSampleSize: minSample,
    candidatesGeneratedOrUpdated: createdOrUpdated,
    skippedInsufficientSample,
  };
}

/**
 * Records an Admin decision on a `RuleReviewCandidate` (Section 30 & 48).
 * Does NOT automatically mutate production ScoringRule or MatchingRule tables.
 */
export async function recordRuleReviewDecision(input: RuleReviewDecisionInput) {
  await ensureDbReady();

  const validStatuses = new Set([
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'DEFERRED',
  ]);
  if (!validStatuses.has(input.status)) {
    throw new AnalyticsEngineError(
      'INVALID_DECISION_STATUS',
      `Invalid review status: ${String(input.status)}`,
      422
    );
  }
  if (!input.decision || !input.decision.trim()) {
    throw new AnalyticsEngineError(
      'DECISION_REQUIRED',
      'A human review decision summary is required.',
      422
    );
  }

  const existing = await prisma.ruleReviewCandidate.findUnique({
    where: { id: input.candidateId },
  });
  if (!existing) {
    throw new AnalyticsEngineError(
      'CANDIDATE_NOT_FOUND',
      `RuleReviewCandidate not found: ${input.candidateId}`,
      404
    );
  }

  const now = new Date();
  const updated = await prisma.ruleReviewCandidate.update({
    where: { id: input.candidateId },
    data: {
      status: input.status,
      reviewedAt: now,
      reviewedBy: input.adminUserId,
      decision: input.decision.trim(),
      notes: input.notes?.trim() || existing.notes,
    },
    include: {
      reviewer: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  await createAuditLog({
    userId: input.adminUserId,
    action: 'RULE_REVIEW_DECISION_RECORDED',
    entityType: 'RuleReviewCandidate',
    entityId: updated.id,
    ipAddress: input.ipAddress,
    details: {
      ruleType: updated.ruleType,
      ruleKey: updated.ruleKey,
      ruleVersion: updated.ruleVersion,
      previousStatus: existing.status,
      newStatus: updated.status,
      decision: updated.decision,
      notes: updated.notes,
    },
  });

  return updated;
}

// ============================================================================
// 12. DETERMINISTIC OPERATIONAL ANOMALY FLAGS (Section 33)
// ============================================================================
export async function detectDeterministicAnomalies(
  rawFilters: AnalyticsFilterInput = {}
): Promise<DeterministicAnomalyFlag[]> {
  const ctx = await loadAnalyticsContext(rawFilters);
  return detectDeterministicAnomaliesFromContext(ctx);
}

async function detectDeterministicAnomaliesFromContext(
  ctx: Awaited<ReturnType<typeof loadAnalyticsContext>>
): Promise<DeterministicAnomalyFlag[]> {
  const {
    canonicalLeads,
    nonCanonicalDuplicateLeads,
    sourceRecords,
    claimsByLeadId,
    successfulClaims,
    failedClaims,
    allFeedbacksRaw,
    auditLogsRaw,
  } = ctx;

  const nowIso = new Date().toISOString();
  const flags: DeterministicAnomalyFlag[] = [];

  // 1 & 2. SOURCE_INVALID_RATE_HIGH & SOURCE_DUPLICATE_RATE_HIGH
  const leadsBySource = new Map<string, typeof canonicalLeads>();
  for (const l of canonicalLeads) {
    const src = resolvePrimaryOriginSource(l);
    const arr = leadsBySource.get(src) || [];
    arr.push(l);
    leadsBySource.set(src, arr);
  }

  const dupsBySource = new Map<string, number>();
  for (const dl of nonCanonicalDuplicateLeads) {
    const src = resolvePrimaryOriginSource(dl);
    dupsBySource.set(src, (dupsBySource.get(src) || 0) + 1);
  }
  for (const sr of sourceRecords) {
    if (sr.decision === 'DUPLICATE_CONFIRMED' || sr.status === 'DUPLICATE') {
      dupsBySource.set(sr.sourceName, (dupsBySource.get(sr.sourceName) || 0) + 1);
    }
  }

  for (const [src, srcLeads] of Array.from(leadsBySource.entries())) {
    const invalidCount = srcLeads.filter((l) => {
      const lClaims = claimsByLeadId.get(l.id) || [];
      return (
        l.status === 'INVALID' ||
        l.saleabilityStatus === 'INVALID' ||
        lClaims.some((c) => c.isInvalid)
      );
    }).length;

    if (srcLeads.length >= 3) {
      const invRate = roundTo(invalidCount / srcLeads.length, 4);
      if (invRate >= 0.2) {
        flags.push({
          code: 'SOURCE_INVALID_RATE_HIGH',
          severity: invRate >= 0.35 ? 'CRITICAL' : 'WARNING',
          entityType: 'SOURCE',
          entityKey: src,
          metric: 'INVALID_RATE',
          metricVersion: 'INVALID_RATE_V1',
          observedValue: invRate,
          thresholdValue: 0.2,
          numerator: invalidCount,
          denominator: srcLeads.length,
          sampleSize: srcLeads.length,
          title: `High Invalid Lead Rate for Source: ${src}`,
          titleAr: `ارتفاع معدل البيانات غير الصالحة للمصدر: ${src}`,
          explanation: `Source "${src}" has an invalid rate of ${roundTo(invRate * 100, 1)}% (${invalidCount}/${srcLeads.length}), exceeding the 20% threshold.`,
          explanationAr: `المصدر "${src}" سجل معدل عدم صلاحية ${roundTo(invRate * 100, 1)}% (${invalidCount} من ${srcLeads.length})، متجاوزًا الحد المسموح (20%).`,
          detectedAt: nowIso,
        });
      }
    }

    const dupCount = dupsBySource.get(src) || 0;
    const totalCollected = srcLeads.length + dupCount;
    if (totalCollected >= 3 && dupCount > 0) {
      const dupRate = roundTo(dupCount / totalCollected, 4);
      if (dupRate >= 0.25) {
        flags.push({
          code: 'SOURCE_DUPLICATE_RATE_HIGH',
          severity: dupRate >= 0.4 ? 'CRITICAL' : 'WARNING',
          entityType: 'SOURCE',
          entityKey: src,
          metric: 'DUPLICATE_RATE',
          metricVersion: 'DUPLICATE_RATE_V1',
          observedValue: dupRate,
          thresholdValue: 0.25,
          numerator: dupCount,
          denominator: totalCollected,
          sampleSize: totalCollected,
          title: `High Duplicate Rate for Source: ${src}`,
          titleAr: `ارتفاع معدل التكرار للمصدر: ${src}`,
          explanation: `Source "${src}" has a duplicate rate of ${roundTo(dupRate * 100, 1)}% (${dupCount}/${totalCollected}), exceeding the 25% threshold.`,
          explanationAr: `المصدر "${src}" ينتج نسبة تكرارات مرتفعة (${roundTo(dupRate * 100, 1)}% — ${dupCount} من ${totalCollected}).`,
          detectedAt: nowIso,
        });
      }
    }
  }

  // 3. SCORE_BAND_UNDERPERFORMING
  const scoreBandStats = SCORE_BAND_ORDER.map((band) => {
    const subset = canonicalLeads.filter((l) => l.temperature === band);
    const claims = subset.flatMap((l) => claimsByLeadId.get(l.id) || []);
    const wins = claims.filter((c) => c.isWon).length;
    return {
      band,
      claimsCount: claims.length,
      winsCount: wins,
      winRate: claims.length > 0 ? roundTo(wins / claims.length, 4) : null,
    };
  });

  for (let i = 0; i < scoreBandStats.length - 1; i++) {
    const higher = scoreBandStats[i];
    const lower = scoreBandStats[i + 1];
    if (
      higher.winRate !== null &&
      lower.winRate !== null &&
      higher.claimsCount >= 2 &&
      lower.claimsCount >= 2 &&
      higher.winRate < lower.winRate
    ) {
      flags.push({
        code: 'SCORE_BAND_UNDERPERFORMING',
        severity: 'WARNING',
        entityType: 'SCORE_BAND',
        entityKey: higher.band,
        metric: 'WIN_RATE',
        metricVersion: 'WIN_RATE_V1',
        observedValue: higher.winRate,
        thresholdValue: lower.winRate,
        numerator: higher.winsCount,
        denominator: higher.claimsCount,
        sampleSize: higher.claimsCount,
        title: `Score Band ${higher.band} Underperforming ${lower.band}`,
        titleAr: `انخفاض أداء فئة التقييم ${higher.band} مقارنة بفئة ${lower.band}`,
        explanation: `${higher.band} leads have a win rate of ${roundTo(higher.winRate * 100, 1)}% (${higher.winsCount}/${higher.claimsCount}), lower than ${lower.band} (${roundTo(lower.winRate * 100, 1)}%).`,
        explanationAr: `معدل الفوز لفئة ${higher.band} (${roundTo(higher.winRate * 100, 1)}%) أقل من فئة ${lower.band} (${roundTo(lower.winRate * 100, 1)}%). يوصى بمراجعة أوزان التقييم.`,
        detectedAt: nowIso,
      });
    }
  }

  // 4. QUALITY_BAND_UNDERPERFORMING
  const qualityBandStats = QUALITY_BAND_ORDER.map((band) => {
    const subset = canonicalLeads.filter((l) => l.qualityStatus === band);
    const claims = subset.flatMap((l) => claimsByLeadId.get(l.id) || []);
    const wins = claims.filter((c) => c.isWon).length;
    return {
      band,
      claimsCount: claims.length,
      winsCount: wins,
      winRate: claims.length > 0 ? roundTo(wins / claims.length, 4) : null,
    };
  });

  for (let i = 0; i < qualityBandStats.length - 1; i++) {
    const higher = qualityBandStats[i];
    const lower = qualityBandStats[i + 1];
    if (
      higher.winRate !== null &&
      lower.winRate !== null &&
      higher.claimsCount >= 2 &&
      lower.claimsCount >= 2 &&
      higher.winRate < lower.winRate
    ) {
      flags.push({
        code: 'QUALITY_BAND_UNDERPERFORMING',
        severity: 'WARNING',
        entityType: 'QUALITY_BAND',
        entityKey: higher.band,
        metric: 'WIN_RATE',
        metricVersion: 'WIN_RATE_V1',
        observedValue: higher.winRate,
        thresholdValue: lower.winRate,
        numerator: higher.winsCount,
        denominator: higher.claimsCount,
        sampleSize: higher.claimsCount,
        title: `Quality Band ${higher.band} Underperforming ${lower.band}`,
        titleAr: `انخفاض أداء فئة الجودة ${higher.band} مقارنة بفئة ${lower.band}`,
        explanation: `Quality band ${higher.band} win rate (${roundTo(higher.winRate * 100, 1)}%) is lower than ${lower.band} (${roundTo(lower.winRate * 100, 1)}%). Flagged for human review.`,
        explanationAr: `معدل الفوز لفئة الجودة ${higher.band} (${roundTo(higher.winRate * 100, 1)}%) أقل من فئة ${lower.band} (${roundTo(lower.winRate * 100, 1)}%).`,
        detectedAt: nowIso,
      });
    }
  }

  // 5. MATCH_RULE_UNDERPERFORMING
  const claimByPair = new Map<string, (typeof successfulClaims)[number]>();
  for (const c of successfulClaims) {
    claimByPair.set(`${c.leadId}:${c.developerId}`, c);
  }
  const totalClaimsWinRate =
    successfulClaims.length > 0
      ? successfulClaims.filter((c) => c.isWon).length / successfulClaims.length
      : 0;

  const matchRuleTriggerStats = new Map<
    string,
    { claims: number; wins: number }
  >();
  for (const snap of ctx.matchSnapshotsRaw) {
    const claim = claimByPair.get(`${snap.leadId}:${snap.developerId}`);
    if (!claim) continue;
    const criteria = Array.isArray(snap.matchedCriteria)
      ? (snap.matchedCriteria as Array<Record<string, unknown>>)
      : [];
    for (const crit of criteria) {
      const rKey = String(crit?.ruleKey || crit?.key || '');
      if (!rKey) continue;
      const cur = matchRuleTriggerStats.get(rKey) || { claims: 0, wins: 0 };
      cur.claims += 1;
      if (claim.isWon) cur.wins += 1;
      matchRuleTriggerStats.set(rKey, cur);
    }
  }

  for (const [rKey, st] of Array.from(matchRuleTriggerStats.entries())) {
    if (st.claims >= 3) {
      const ruleWinRate = roundTo(st.wins / st.claims, 4);
      if (totalClaimsWinRate > 0 && ruleWinRate < totalClaimsWinRate - 0.05) {
        flags.push({
          code: 'MATCH_RULE_UNDERPERFORMING',
          severity: 'INFO',
          entityType: 'MATCH_RULE',
          entityKey: rKey,
          metric: 'WIN_RATE',
          metricVersion: 'WIN_RATE_V1',
          observedValue: ruleWinRate,
          thresholdValue: roundTo(totalClaimsWinRate, 4),
          numerator: st.wins,
          denominator: st.claims,
          sampleSize: st.claims,
          title: `Matching Rule ${rKey} Underperforming Baseline`,
          titleAr: `قاعدة المطابقة ${rKey} أقل من خط الأساس`,
          explanation: `Matching rule ${rKey} win rate is ${roundTo(ruleWinRate * 100, 1)}% (${st.wins}/${st.claims}) vs platform baseline ${roundTo(totalClaimsWinRate * 100, 1)}%.`,
          explanationAr: `قاعدة المطابقة ${rKey} حققت معدل فوز ${roundTo(ruleWinRate * 100, 1)}% مقارنة بالمعدل العام ${roundTo(totalClaimsWinRate * 100, 1)}%.`,
          detectedAt: nowIso,
        });
      }
    }
  }

  // 6. DEVELOPER_FEEDBACK_SPIKE
  const negFeedbackByDev = new Map<string, { neg: number; total: number }>();
  for (const fb of allFeedbacksRaw) {
    const devId = fb.developerId || fb.userId;
    const cur = negFeedbackByDev.get(devId) || { neg: 0, total: 0 };
    cur.total += 1;
    if (!fb.useful) cur.neg += 1;
    negFeedbackByDev.set(devId, cur);
  }
  for (const [devId, fbStats] of Array.from(negFeedbackByDev.entries())) {
    if (fbStats.neg >= 3 && fbStats.neg / fbStats.total >= 0.6) {
      const ratio = roundTo(fbStats.neg / fbStats.total, 4);
      flags.push({
        code: 'DEVELOPER_FEEDBACK_SPIKE',
        severity: 'WARNING',
        entityType: 'DEVELOPER',
        entityKey: devId,
        metric: 'NEGATIVE_FEEDBACK_RATE',
        metricVersion: 'NEGATIVE_FEEDBACK_RATE_V1',
        observedValue: ratio,
        thresholdValue: 0.6,
        numerator: fbStats.neg,
        denominator: fbStats.total,
        sampleSize: fbStats.total,
        title: `Developer Negative Feedback Spike (${devId})`,
        titleAr: `ارتفاع مفاجئ في بلاغات عدم الفائدة من المطور (${devId})`,
        explanation: `Developer ${devId} submitted ${fbStats.neg}/${fbStats.total} (${roundTo(ratio * 100, 1)}%) negative feedback reports.`,
        explanationAr: `قام المطور ${devId} بتسجيل ${fbStats.neg} بلاغات سلبية من أصل ${fbStats.total} (${roundTo(ratio * 100, 1)}%).`,
        detectedAt: nowIso,
      });
    }
  }

  // 7. CLAIM_FAILURE_SPIKE
  const claimFailLogs = auditLogsRaw.filter(
    (l) =>
      l.action === 'LEAD_CLAIM_FAILED' || l.action === 'LEAD_CLAIM_CONFLICT'
  ).length;
  const totalFailures = Math.max(failedClaims.length, claimFailLogs);
  const totalClaimAttempts = successfulClaims.length + totalFailures;
  if (totalFailures >= 3 && totalClaimAttempts > 0) {
    const failRate = roundTo(totalFailures / totalClaimAttempts, 4);
    if (failRate >= 0.15) {
      flags.push({
        code: 'CLAIM_FAILURE_SPIKE',
        severity: failRate >= 0.3 ? 'CRITICAL' : 'WARNING',
        entityType: 'CLAIMS',
        entityKey: 'PLATFORM_CLAIMS',
        metric: 'CLAIM_FAILURE_RATE',
        metricVersion: 'CLAIM_FAILURE_RATE_V1',
        observedValue: failRate,
        thresholdValue: 0.15,
        numerator: totalFailures,
        denominator: totalClaimAttempts,
        sampleSize: totalClaimAttempts,
        title: 'Claim Failure Rate Spike',
        titleAr: 'ارتفاع معدل فشل عمليات اقتناص الفرص',
        explanation: `${totalFailures} of ${totalClaimAttempts} claim attempts failed (${roundTo(failRate * 100, 1)}%).`,
        explanationAr: `فشلت ${totalFailures} عملية اقتناص من أصل ${totalClaimAttempts} محاولة (${roundTo(failRate * 100, 1)}%).`,
        detectedAt: nowIso,
      });
    }
  }

  // 8. REFUND_RATE_SPIKE
  const totalCreditsCharged = successfulClaims.reduce(
    (acc, c) => acc + c.creditsCharged,
    0
  );
  const totalCreditsRefunded = successfulClaims.reduce(
    (acc, c) => acc + c.creditsRefunded,
    0
  );
  if (totalCreditsCharged >= 5 && totalCreditsRefunded > 0) {
    const refRate = roundTo(totalCreditsRefunded / totalCreditsCharged, 4);
    if (refRate >= 0.15) {
      flags.push({
        code: 'REFUND_RATE_SPIKE',
        severity: refRate >= 0.3 ? 'CRITICAL' : 'WARNING',
        entityType: 'CREDITS',
        entityKey: 'PLATFORM_CREDITS',
        metric: 'REFUND_RATE',
        metricVersion: 'REFUND_RATE_V1',
        observedValue: refRate,
        thresholdValue: 0.15,
        numerator: totalCreditsRefunded,
        denominator: totalCreditsCharged,
        sampleSize: totalCreditsCharged,
        title: 'Credit Refund Rate Spike',
        titleAr: 'ارتفاع معدل استرداد النقاط (Refund Rate Spike)',
        explanation: `${totalCreditsRefunded} of ${totalCreditsCharged} charged credits were refunded (${roundTo(refRate * 100, 1)}%), exceeding the 15% alert threshold.`,
        explanationAr: `تم استرداد ${totalCreditsRefunded} نقطة من أصل ${totalCreditsCharged} نقطة مخصومة (${roundTo(refRate * 100, 1)}%)، مما يتجاوز حد التنبيه (15%).`,
        detectedAt: nowIso,
      });
    }
  }

  return flags;
}

// ============================================================================
// 13. DAILY METRIC SNAPSHOTS (Section 38)
// ============================================================================
export async function generateDailyMetricSnapshots(
  options: {
    targetDate?: Date | string;
    timezone?: string;
  } = {}
) {
  await ensureDbReady();
  const targetDate =
    options.targetDate instanceof Date
      ? options.targetDate
      : typeof options.targetDate === 'string'
        ? new Date(options.targetDate)
        : new Date();
  const timezone = options.timezone || 'Africa/Cairo';
  const dateKey = formatBusinessDateKey(targetDate, timezone);
  const snapshotDate = new Date(`${dateKey}T00:00:00.000Z`);

  const overview = await getAdminOverviewAnalytics({
    preset: 'all_time',
    timezone,
    referenceNow: targetDate,
  });
  const sourceData = await getSourceAnalytics({
    preset: 'all_time',
    timezone,
    referenceNow: targetDate,
  });
  const nicheData = await getNicheAnalytics({
    preset: 'all_time',
    timezone,
    referenceNow: targetDate,
  });

  const snapshotsToUpsert: Array<{
    date: Date;
    dateKey: string;
    metric: string;
    dimension: string;
    dimensionValue: string;
    value: number | null;
    numerator: number;
    denominator: number;
    status: string;
    version: string;
  }> = [
    {
      date: snapshotDate,
      dateKey,
      metric: 'TOTAL_LEADS',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: overview.executiveSummary.totalLeads,
      numerator: overview.executiveSummary.totalLeads,
      denominator: 1,
      status: 'VALID',
      version: 'TOTAL_LEADS_V1',
    },
    {
      date: snapshotDate,
      dateKey,
      metric: 'WIN_RATE',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: overview.executiveSummary.winRate.value,
      numerator: overview.executiveSummary.winRate.numerator,
      denominator: overview.executiveSummary.winRate.denominator,
      status: overview.executiveSummary.winRate.status,
      version: overview.executiveSummary.winRate.metricVersion,
    },
    {
      date: snapshotDate,
      dateKey,
      metric: 'CONTACT_RATE',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: overview.layers.layer5SalesFunnel.stageRates.contactRate.value,
      numerator:
        overview.layers.layer5SalesFunnel.stageRates.contactRate.numerator,
      denominator:
        overview.layers.layer5SalesFunnel.stageRates.contactRate.denominator,
      status: overview.layers.layer5SalesFunnel.stageRates.contactRate.status,
      version:
        overview.layers.layer5SalesFunnel.stageRates.contactRate.metricVersion,
    },
    {
      date: snapshotDate,
      dateKey,
      metric: 'INVALID_RATE',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: overview.executiveSummary.invalidRate.value,
      numerator: overview.executiveSummary.invalidRate.numerator,
      denominator: overview.executiveSummary.invalidRate.denominator,
      status: overview.executiveSummary.invalidRate.status,
      version: overview.executiveSummary.invalidRate.metricVersion,
    },
    {
      date: snapshotDate,
      dateKey,
      metric: 'ATTRIBUTED_CLAIM_REVENUE_EGP',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: overview.executiveSummary.attributedClaimRevenueEgp,
      numerator: Math.round(overview.executiveSummary.attributedClaimRevenueEgp),
      denominator: 1,
      status: 'VALID',
      version: 'ATTRIBUTED_CLAIM_REVENUE_EGP_V1',
    },
  ];

  for (const s of sourceData.allSourcesSummary) {
    snapshotsToUpsert.push({
      date: snapshotDate,
      dateKey,
      metric: 'WIN_RATE',
      dimension: 'SOURCE',
      dimensionValue: s.sourceName,
      value: s.winRate.value,
      numerator: s.winRate.numerator,
      denominator: s.winRate.denominator,
      status: s.winRate.status,
      version: s.winRate.metricVersion,
    });
  }

  for (const n of nicheData.allNichesSummary) {
    snapshotsToUpsert.push({
      date: snapshotDate,
      dateKey,
      metric: 'WIN_RATE',
      dimension: 'NICHE',
      dimensionValue: n.niche,
      value: n.winRate.value,
      numerator: n.winRate.numerator,
      denominator: n.winRate.denominator,
      status: n.winRate.status,
      version: n.winRate.metricVersion,
    });
  }

  const saved = [];
  for (const item of snapshotsToUpsert) {
    const record = await prisma.dailyMetricSnapshot.upsert({
      where: {
        dateKey_metric_dimension_dimensionValue_version: {
          dateKey: item.dateKey,
          metric: item.metric,
          dimension: item.dimension,
          dimensionValue: item.dimensionValue,
          version: item.version,
        },
      },
      update: {
        value: item.value,
        numerator: item.numerator,
        denominator: item.denominator,
        status: item.status,
        date: item.date,
      },
      create: item,
    });
    saved.push(record);
  }

  return {
    dateKey,
    snapshotsCount: saved.length,
    snapshots: saved,
  };
}

export async function getDailyMetricSnapshots(params: {
  metric?: string | null;
  dimension?: string | null;
  dateKey?: string | null;
  limit?: number;
} = {}) {
  await ensureDbReady();
  const where: Record<string, unknown> = {};
  if (params.metric) where.metric = params.metric;
  if (params.dimension) where.dimension = params.dimension;
  if (params.dateKey) where.dateKey = params.dateKey;

  return prisma.dailyMetricSnapshot.findMany({
    where,
    orderBy: [{ date: 'desc' }, { metric: 'asc' }],
    take: Math.min(200, Math.max(1, params.limit || 50)),
  });
}

// ============================================================================
// 14. SAFE CSV EXPORT ENGINE (Section 37)
// ============================================================================
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Prevent CSV formula injection (=, +, -, @, \t, \r, or leading whitespace before formula chars) and quote commas/newlines
  const sanitized = /^[\t\r=+\-@]|^\s+[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function toCsvString(
  headers: string[],
  rows: Array<Record<string, unknown>>
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

export type ExportableAnalyticsDataset =
  | 'sources'
  | 'niches'
  | 'locations'
  | 'services'
  | 'developers'
  | 'leads'
  | 'rules'
  | 'data-quality'
  | 'funnel';

/**
 * Generates an approved, sanitized CSV export for Admin users (Section 37).
 * Never exports passwords, secrets, authentication tokens, or raw private contact details.
 */
export async function exportAnalyticsDatasetToCsv(
  dataset: ExportableAnalyticsDataset | string,
  rawFilters: AnalyticsFilterInput = {},
  adminUserId?: string
): Promise<{ fileName: string; csv: string; rowCount: number }> {
  const normalizedDataset = dataset.toLowerCase().trim();
  const dateStamp = new Date().toISOString().slice(0, 10);

  let headers: string[] = [];
  let rows: Array<Record<string, unknown>> = [];

  switch (normalizedDataset) {
    case 'sources': {
      const data = await getSourceAnalytics({ ...rawFilters, pageSize: 100 });
      headers = [
        'sourceName',
        'sourceType',
        'leadsCollected',
        'uniqueLeads',
        'duplicates',
        'invalidLeads',
        'qualityAverage',
        'opportunityAverage',
        'claimsCount',
        'meetingCount',
        'wonCount',
        'claimRatePct',
        'winRatePct',
        'attributedRevenueEgp',
        'metricVersion',
      ];
      rows = data.allSourcesSummary.map((s) => ({
        sourceName: s.sourceName,
        sourceType: s.sourceType,
        leadsCollected: s.leadsCollected,
        uniqueLeads: s.uniqueLeads,
        duplicates: s.duplicates,
        invalidLeads: s.invalidLeads,
        qualityAverage: s.qualityAverage ?? 'INSUFFICIENT_DATA',
        opportunityAverage: s.opportunityAverage ?? 'INSUFFICIENT_DATA',
        claimsCount: s.claimsCount,
        meetingCount: s.meetingCount,
        wonCount: s.wonCount,
        claimRatePct: s.claimRate.displayValue,
        winRatePct: s.winRate.displayValue,
        attributedRevenueEgp: s.attributedRevenueEgp,
        metricVersion: s.winRate.metricVersion,
      }));
      break;
    }
    case 'niches': {
      const data = await getNicheAnalytics({ ...rawFilters, pageSize: 100 });
      headers = [
        'niche',
        'leads',
        'claims',
        'contacted',
        'replied',
        'interested',
        'meetings',
        'won',
        'lost',
        'invalid',
        'winRatePct',
        'revenueEgp',
        'metricVersion',
      ];
      rows = data.allNichesSummary.map((n) => ({
        niche: n.niche,
        leads: n.leads,
        claims: n.claims,
        contacted: n.contacted,
        replied: n.replied,
        interested: n.interested,
        meetings: n.meetings,
        won: n.won,
        lost: n.lost,
        invalid: n.invalid,
        winRatePct: n.winRate.displayValue,
        revenueEgp: n.revenueEgp,
        metricVersion: n.winRate.metricVersion,
      }));
      break;
    }
    case 'locations': {
      const data = await getLocationAnalytics({ ...rawFilters, pageSize: 100 });
      headers = [
        'governorate',
        'city',
        'totalLeads',
        'qualityAverage',
        'opportunityAverage',
        'claims',
        'meetings',
        'wins',
        'winRatePct',
        'revenueEgp',
      ];
      rows = data.cities.map((c) => ({
        governorate: c.governorate,
        city: c.city,
        totalLeads: c.totalLeads,
        qualityAverage: c.qualityAverage ?? 'INSUFFICIENT_DATA',
        opportunityAverage: c.opportunityAverage ?? 'INSUFFICIENT_DATA',
        claims: c.claims,
        meetings: c.meetings,
        wins: c.wins,
        winRatePct: c.winRate.displayValue,
        revenueEgp: c.revenueEgp,
      }));
      break;
    }
    case 'services': {
      const data = await getServiceAnalytics({ ...rawFilters, pageSize: 100 });
      headers = [
        'service',
        'leadVolume',
        'claims',
        'contacted',
        'meetings',
        'wins',
        'claimRatePct',
        'winRatePct',
        'revenueEgp',
        'averageProjectValueEgp',
      ];
      rows = data.allServicesSummary.map((s) => ({
        service: s.service,
        leadVolume: s.leadVolume,
        claims: s.claims,
        contacted: s.contacted,
        meetings: s.meetings,
        wins: s.wins,
        claimRatePct: s.claimRate.displayValue,
        winRatePct: s.winRate.displayValue,
        revenueEgp: s.revenueEgp,
        averageProjectValueEgp: s.averageProjectValueEgp ?? 'INSUFFICIENT_DATA',
      }));
      break;
    }
    case 'developers': {
      const data = await getDeveloperAnalyticsForAdmin({
        ...rawFilters,
        pageSize: 100,
      });
      // Strictly exclude passwordHash, tokens, email/phone PII if not needed; only analytical performance metrics
      headers = [
        'developerId',
        'name',
        'companyName',
        'planName',
        'leadsClaimed',
        'contactedCount',
        'repliedCount',
        'meetingCount',
        'totalWins',
        'contactRatePct',
        'winRatePct',
        'estimatedProjectValueEgp',
        'creditsConsumed',
        'creditsRefunded',
        'attributedRevenueEgp',
        'averageLeadQuality',
        'averageMatchStrength',
      ];
      rows = data.allDevelopersSummary.map((d) => ({
        developerId: d.developerId,
        name: d.name,
        companyName: d.companyName || '',
        planName: d.planName,
        leadsClaimed: d.leadsClaimed,
        contactedCount: d.contactedCount,
        repliedCount: d.repliedCount,
        meetingCount: d.meetingCount,
        totalWins: d.totalWins,
        contactRatePct: d.contactRate.displayValue,
        winRatePct: d.winRate.displayValue,
        estimatedProjectValueEgp: d.estimatedProjectValueEgp,
        creditsConsumed: d.creditsConsumed,
        creditsRefunded: d.creditsRefunded,
        attributedRevenueEgp: d.attributedRevenueEgp,
        averageLeadQuality: d.averageLeadQuality ?? 'INSUFFICIENT_DATA',
        averageMatchStrength: d.averageMatchStrength ?? 'INSUFFICIENT_DATA',
      }));
      break;
    }
    case 'rules': {
      const data = await getRulePerformanceAnalytics(rawFilters);
      headers = [
        'ruleType',
        'ruleKey',
        'ruleVersion',
        'points',
        'timesTriggered',
        'leadsAffected',
        'sampleSize',
        'sampleStatus',
        'withRuleWinRate',
        'withoutRuleWinRate',
        'winRateLiftAbsolute',
        'flaggedForReview',
      ];
      rows = data.allRules.map((r) => ({
        ruleType: r.ruleType,
        ruleKey: r.ruleKey,
        ruleVersion: r.ruleVersion,
        points: r.points,
        timesTriggered: r.timesTriggered,
        leadsAffected: r.leadsAffected,
        sampleSize: r.sampleSize,
        sampleStatus: r.sampleStatus,
        withRuleWinRate: r.withRule.winRate.displayValue,
        withoutRuleWinRate: r.withoutRule.winRate.displayValue,
        winRateLiftAbsolute: r.comparison.winRateLiftAbsolute ?? 'INSUFFICIENT_DATA',
        flaggedForReview: r.comparison.flaggedForReview,
      }));
      break;
    }
    case 'leads': {
      const data = await getLeadPerformanceAnalytics({
        ...rawFilters,
        pageSize: 100,
      });
      headers = [
        'leadId',
        'businessName',
        'originSource',
        'niche',
        'governorate',
        'city',
        'service',
        'opportunityScore',
        'scoreBand',
        'scoringVersion',
        'qualityScore',
        'qualityBand',
        'freshness',
        'accessType',
        'claimsCount',
        'wonCount',
        'attributedRevenueEgp',
      ];
      rows = data.leadsTable.map((l) => ({
        leadId: l.leadId,
        businessName: l.businessName,
        originSource: l.originSource,
        niche: l.niche,
        governorate: l.governorate,
        city: l.city,
        service: l.service,
        opportunityScore: l.opportunityScore,
        scoreBand: l.scoreBand,
        scoringVersion: l.scoringVersion,
        qualityScore: l.qualityScore,
        qualityBand: l.qualityBand,
        freshness: l.freshness,
        accessType: l.accessType,
        claimsCount: l.claimsCount,
        wonCount: l.wonCount,
        attributedRevenueEgp: l.attributedRevenueEgp,
      }));
      break;
    }
    case 'data-quality': {
      const data = await getDataQualityDashboardAnalytics({
        ...rawFilters,
        pageSize: 100,
      });
      headers = [
        'leadId',
        'businessName',
        'source',
        'niche',
        'city',
        'qualityScore',
        'qualityBand',
        'freshness',
        'saleabilityStatus',
        'issues',
      ];
      rows = data.problemLeads.map((p) => ({
        leadId: p.leadId,
        businessName: p.businessName,
        source: p.source,
        niche: p.niche,
        city: p.city,
        qualityScore: p.qualityScore,
        qualityBand: p.qualityBand,
        freshness: p.freshness,
        saleabilityStatus: p.saleabilityStatus,
        issues: p.issues.join('|'),
      }));
      break;
    }
    case 'funnel': {
      const data = await getFunnelAndReasonsAnalytics(rawFilters);
      headers = [
        'stage',
        'count',
        'conversionFromPrevious',
        'conversionFromClaimed',
        'numerator',
        'denominator',
        'metricVersion',
      ];
      rows = data.funnel.stages.map((st) => ({
        stage: st.stage,
        count: st.count,
        conversionFromPrevious: st.conversionFromPrevious.displayValue,
        conversionFromClaimed: st.conversionFromClaimed.displayValue,
        numerator: st.conversionFromPrevious.numerator,
        denominator: st.conversionFromPrevious.denominator,
        metricVersion: st.conversionFromPrevious.metricVersion,
      }));
      break;
    }
    case 'overview': {
      const data = await getAdminOverviewAnalytics(rawFilters);
      headers = [
        'metric',
        'value',
      ];
      rows = [
        { metric: 'totalLeads', value: data.executiveSummary.totalLeads },
        { metric: 'availableLeads', value: data.executiveSummary.availableLeads },
        { metric: 'claimedLeads', value: data.executiveSummary.claimedLeads },
        { metric: 'claimsCount', value: data.executiveSummary.claimsCount },
        { metric: 'meetingsCount', value: data.executiveSummary.meetingsCount },
        { metric: 'winsCount', value: data.executiveSummary.winsCount },
        { metric: 'winRate', value: data.executiveSummary.winRate.displayValue },
        { metric: 'invalidRate', value: data.executiveSummary.invalidRate.displayValue },
        { metric: 'cashRevenueEgp', value: data.executiveSummary.cashRevenueEgp },
        {
          metric: 'attributedClaimRevenueEgp',
          value: data.executiveSummary.attributedClaimRevenueEgp,
        },
      ];
      break;
    }
    case 'rule-review': {
      const data = await listRuleReviewCandidates({
        page: rawFilters.page,
        pageSize: 100,
      });
      headers = [
        'id',
        'ruleType',
        'ruleKey',
        'ruleVersion',
        'metric',
        'sampleSize',
        'baselineValue',
        'observedValue',
        'absoluteDifference',
        'status',
        'recommendation',
      ];
      rows = data.candidates.map((c) => ({
        id: c.id,
        ruleType: c.ruleType,
        ruleKey: c.ruleKey,
        ruleVersion: c.ruleVersion,
        metric: c.metric,
        sampleSize: c.sampleSize,
        baselineValue: c.baselineValue,
        observedValue: c.observedValue,
        absoluteDifference: c.absoluteDifference,
        status: c.status,
        recommendation: c.recommendation,
      }));
      break;
    }
    default:
      throw new AnalyticsEngineError(
        'UNSUPPORTED_EXPORT_DATASET',
        `Unsupported export dataset: ${dataset}`,
        422
      );
  }

  const csv = toCsvString(headers, rows);

  if (adminUserId) {
    await createAuditLog({
      userId: adminUserId,
      action: 'ANALYTICS_CSV_EXPORTED',
      entityType: 'AnalyticsExport',
      details: {
        dataset: normalizedDataset,
        rowCount: rows.length,
      },
    });
  }

  return {
    fileName: `leadforge-analytics-${normalizedDataset}-${dateStamp}.csv`,
    csv,
    rowCount: rows.length,
  };
}

// ============================================================================
// 15. CONVENIENCE ALIASES & HELPERS FOR API ROUTES
// ============================================================================
export type RuleReviewTypeCode = RuleReviewType;
export type RuleReviewStatusCode = RuleReviewStatus;

export const getExecutiveAnalyticsOverview = getAdminOverviewAnalytics;
export const getSourcePerformanceAnalytics = getSourceAnalytics;
export const getNichePerformanceAnalytics = getNicheAnalytics;
export const getLocationPerformanceAnalytics = getLocationAnalytics;
export const getServicePerformanceAnalytics = getServiceAnalytics;
export const getDeveloperPerformanceAnalytics = getDeveloperAnalyticsForAdmin;
export const getFunnelAndReasonAnalytics = getFunnelAndReasonsAnalytics;
export const getRuleReviewCandidates = listRuleReviewCandidates;
export const generateDeterministicRuleReviewCandidates =
  evaluateAndGenerateRuleReviewCandidates;

export async function materializeDailyMetricSnapshot(targetDateKey?: string) {
  return generateDailyMetricSnapshots({
    targetDate: targetDateKey ? new Date(`${targetDateKey}T12:00:00.000Z`) : undefined,
  });
}

export async function exportAnalyticsCsv(
  dataset: string,
  rawFilters: AnalyticsFilterInput = {},
  adminUserId?: string
): Promise<string> {
  const res = await exportAnalyticsDatasetToCsv(dataset, rawFilters, adminUserId);
  return res.csv;
}

export async function createRuleReviewCandidate(input: {
  ruleType: RuleReviewType;
  ruleKey: string;
  ruleName?: string;
  version?: string;
  cohortFilter?: Record<string, unknown>;
  sampleSize: number;
  baselineRate: number;
  observedRate: number;
  deltaRate: number;
  evidenceSummary: string;
  suggestedAction: string;
  createdByUserId?: string;
}) {
  await ensureDbReady();
  const created = await prisma.ruleReviewCandidate.create({
    data: {
      ruleType: input.ruleType,
      ruleKey: input.ruleKey,
      ruleName: input.ruleName || input.ruleKey,
      ruleVersion: input.version || 'v1',
      metric: 'WIN_RATE',
      metricVersion: 'WIN_RATE_V1',
      baselineValue: input.baselineRate,
      observedValue: input.observedRate,
      absoluteDifference: input.deltaRate,
      relativeDifference:
        input.baselineRate > 0
          ? roundTo(input.deltaRate / input.baselineRate, 4)
          : null,
      sampleSize: input.sampleSize,
      minimumSampleSize: 5,
      triggeredNumerator: 0,
      triggeredDenominator: input.sampleSize,
      baselineNumerator: 0,
      baselineDenominator: input.sampleSize,
      evidenceWindow: 'MANUAL_ADMIN_SUBMISSION',
      recommendation:
        input.suggestedAction ||
        input.evidenceSummary ||
        'Admin manual rule review candidate.',
      evidenceDetails: (input.cohortFilter || {}) as any,
      notes: input.evidenceSummary || null,
      status: 'OPEN',
    },
  });

  if (input.createdByUserId) {
    await createAuditLog({
      userId: input.createdByUserId,
      action: 'RULE_REVIEW_CANDIDATE_CREATED',
      entityType: 'RuleReviewCandidate',
      entityId: created.id,
      details: {
        ruleType: created.ruleType,
        ruleKey: created.ruleKey,
        ruleVersion: created.ruleVersion,
      },
    });
  }

  return created;
}

export async function decideRuleReviewCandidate(input: {
  candidateId: string;
  reviewerUserId: string;
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'DEFERRED';
  decisionNotes?: string;
  decision?: string;
  ipAddress?: string;
}) {
  return recordRuleReviewDecision({
    candidateId: input.candidateId,
    adminUserId: input.reviewerUserId,
    status: input.status,
    decision:
      input.decision?.trim() ||
      input.decisionNotes?.trim() ||
      `Admin marked candidate as ${input.status}`,
    notes: input.decisionNotes?.trim() || input.decision?.trim() || null,
    ipAddress: input.ipAddress,
  });
}


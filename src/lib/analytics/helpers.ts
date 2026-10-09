import { EGYPT_LOCATIONS } from '../constants';
import { roundTo } from './statistics';
import { isWithinDateRange } from './time-dimensions';
import { NormalizedAnalyticsFilters } from './types';

const CITY_TO_GOVERNORATE: Record<string, string> = {};
for (const gov of EGYPT_LOCATIONS) {
  for (const c of gov.cities) {
    CITY_TO_GOVERNORATE[c.name] = gov.governorate;
  }
}

const SERVICE_CANONICAL_MAP: Record<string, string> = {
  WEBSITE_DEVELOPMENT: 'Website Development',
  'Website Development': 'Website Development',
  ECOMMERCE: 'E-Commerce Development',
  E_COMMERCE_DEVELOPMENT: 'E-Commerce Development',
  'E-Commerce Development': 'E-Commerce Development',
  LANDING_PAGE: 'Landing Pages',
  LANDING_PAGES: 'Landing Pages',
  'Landing Pages': 'Landing Pages',
  WEBSITE_REDESIGN: 'Website Redesign',
  'Website Redesign': 'Website Redesign',
  BOOKING_SYSTEM: 'Booking & Clinic Systems',
  BOOKING_AND_CLINIC_SYSTEMS: 'Booking & Clinic Systems',
  'Booking & Clinic Systems': 'Booking & Clinic Systems',
  CUSTOM_WEB_APP: 'Custom Web Applications',
  CUSTOM_WEB_APPLICATIONS: 'Custom Web Applications',
  'Custom Web Applications': 'Custom Web Applications',
};

/**
 * Resolves the canonical primary origin source of a Lead without attributing to later enrichment sources (Section 10).
 */
export function resolvePrimaryOriginSource(lead: {
  source?: string | null;
  sourceList?: string[] | null;
}): string {
  if (
    Array.isArray(lead.sourceList) &&
    lead.sourceList.length > 0 &&
    lead.sourceList[0] &&
    lead.sourceList[0].trim()
  ) {
    return lead.sourceList[0].trim();
  }
  if (lead.source && lead.source.trim()) {
    return lead.source.trim();
  }
  return 'Manual';
}

/**
 * Resolves secondary/enrichment sources for a Lead (excluding its primary origin source).
 */
export function resolveEnrichmentSources(lead: {
  source?: string | null;
  sourceList?: string[] | null;
  fieldProvenance?: unknown;
}): string[] {
  const origin = resolvePrimaryOriginSource(lead);
  const enrichmentSet = new Set<string>();

  if (Array.isArray(lead.sourceList)) {
    for (const s of lead.sourceList) {
      if (s && s.trim() && s.trim() !== origin) {
        enrichmentSet.add(s.trim());
      }
    }
  }

  if (lead.fieldProvenance && typeof lead.fieldProvenance === 'object') {
    for (const entry of Object.values(lead.fieldProvenance as Record<string, unknown>)) {
      if (entry && typeof entry === 'object') {
        const rec = entry as { source?: string; confirmedBySources?: string[] };
        if (rec.source && rec.source.trim() && rec.source.trim() !== origin) {
          enrichmentSet.add(rec.source.trim());
        }
        if (Array.isArray(rec.confirmedBySources)) {
          for (const cs of rec.confirmedBySources) {
            if (cs && cs.trim() && cs.trim() !== origin) {
              enrichmentSet.add(cs.trim());
            }
          }
        }
      }
    }
  }

  return Array.from(enrichmentSet);
}

/**
 * Resolves canonical governorate, city, and district/area for a Lead (Section 12).
 */
export function resolveCanonicalLocation(lead: {
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
}): {
  governorate: string;
  city: string;
  district: string;
} {
  const city = (lead.city || 'غير محدد').trim();
  const governorate = (
    lead.governorate?.trim() ||
    CITY_TO_GOVERNORATE[city] ||
    city ||
    'غير محدد'
  ).trim();
  const district = (lead.area || 'غير محدد').trim();

  return { governorate, city, district };
}

/**
 * Resolves the canonical primary service required by a Lead (Section 13).
 */
export function resolveCanonicalService(lead: {
  requiredService?: string | null;
  requiredServices?: string[] | null;
  websiteStatus?: string | null;
  category?: string | null;
}): string {
  if (lead.requiredService && lead.requiredService.trim()) {
    const raw = lead.requiredService.trim();
    return SERVICE_CANONICAL_MAP[raw] || raw;
  }
  if (Array.isArray(lead.requiredServices) && lead.requiredServices.length > 0) {
    const first = lead.requiredServices[0]?.trim();
    if (first) return SERVICE_CANONICAL_MAP[first] || first;
  }
  if (lead.websiteStatus === 'POOR_WEBSITE') {
    return 'Website Redesign';
  }
  if (lead.category === 'Dental' || lead.category === 'Medical') {
    return 'Booking & Clinic Systems';
  }
  if (lead.category === 'Retail') {
    return 'E-Commerce Development';
  }
  return 'Website Development';
}

export interface EngagementStageFlags {
  claimId: string;
  leadId: string;
  developerId: string;
  claimedAt: Date;
  effectiveStatus: string;
  isFailedClaim: boolean;
  isRefundedClaim: boolean;
  isContacted: boolean;
  isReplied: boolean;
  isInterested: boolean;
  isMeeting: boolean;
  isProposal: boolean;
  isNegotiation: boolean;
  isWon: boolean;
  isLost: boolean;
  isNotInterested: boolean;
  isInvalid: boolean;
  isCompletedEligible: boolean;
  estimatedProjectValueEgp: number;
  lostReasonCode: string | null;
  invalidReasonCode: string | null;
  creditsCharged: number;
  creditsRefunded: number;
  netCreditsConsumed: number;
}

const CONTACTED_STATUSES = new Set([
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
]);

const REPLIED_STATUSES = new Set([
  'REPLIED',
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
]);

const INTERESTED_STATUSES = new Set([
  'INTERESTED',
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
]);

const MEETING_STATUSES = new Set([
  'MEETING',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
]);

const PROPOSAL_STATUSES = new Set([
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'WON',
]);

const NEGOTIATION_STATUSES = new Set([
  'NEGOTIATION',
  'WON',
]);

/**
 * Normalizes lost reason codes into canonical Phase 6/7 buckets (Section 25).
 */
export function normalizeLostReasonCode(raw?: string | null): string {
  if (!raw) return 'OTHER';
  const upper = raw.trim().toUpperCase();
  if (upper.includes('NO_BUDGET') || upper === 'BUDGET_TOO_LOW') return 'NO_BUDGET';
  if (upper.includes('PRICE') || upper === 'PRICE_OBJECTION') return 'PRICE';
  if (upper.includes('COMPETITOR') || upper === 'CHOSE_COMPETITOR') return 'COMPETITOR';
  if (upper.includes('NO_RESPONSE') || upper === 'UNRESPONSIVE') return 'NO_RESPONSE';
  if (upper.includes('TIMING') || upper === 'BAD_TIMING' || upper === 'DELAYED') return 'TIMING';
  if (upper.includes('WRONG_CONTACT') || upper === 'NO_DECISION_MAKER') return 'WRONG_CONTACT';
  if (upper.includes('NOT_INTERESTED')) return 'NOT_INTERESTED';
  return upper;
}

/**
 * Normalizes invalid reason codes into canonical Phase 6/7 buckets (Section 26).
 */
export function normalizeInvalidReasonCode(raw?: string | null): string {
  if (!raw) return 'OTHER';
  const upper = raw.trim().toUpperCase();
  if (upper.includes('PHONE') || upper === 'INVALID_NUMBER' || upper === 'DISCONNECTED_NUMBER') {
    return 'WRONG_PHONE';
  }
  if (upper.includes('EMAIL') || upper === 'EMAIL_BOUNCED') return 'WRONG_EMAIL';
  if (upper.includes('CLOSED')) return 'BUSINESS_CLOSED';
  if (upper.includes('DUPLICATE')) return 'DUPLICATE';
  if (upper.includes('CATEGORY') || upper.includes('NICHE')) return 'WRONG_CATEGORY';
  if (upper.includes('LOCATION') || upper.includes('CITY') || upper.includes('ADDRESS')) {
    return 'WRONG_LOCATION';
  }
  if (upper.includes('FAKE') || upper.includes('SPAM') || upper.includes('NON_EXISTENT')) {
    return 'FAKE_BUSINESS';
  }
  if (upper.includes('WEBSITE')) return 'ALREADY_HAS_WEBSITE';
  return upper;
}

/**
 * Evaluates cumulative stage flags for a claim + optional engagement pair.
 */
export function evaluateClaimEngagementFlags(
  claim: {
    id: string;
    leadId: string;
    userId: string;
    developerId?: string | null;
    status: string;
    pipelineStatus: string;
    creditsCharged?: number | null;
    creditsSpent?: number | null;
    creditsRefunded?: number | null;
    claimedAt: Date;
    lastContactedAt?: Date | null;
  },
  engagement?: {
    currentStatus: string;
    finalOutcome?: string | null;
    claimedAt?: Date | null;
    firstContactedAt?: Date | null;
    lastContactedAt?: Date | null;
    firstRepliedAt?: Date | null;
    interestedAt?: Date | null;
    meetingAt?: Date | null;
    proposalSentAt?: Date | null;
    negotiationAt?: Date | null;
    wonAt?: Date | null;
    lostAt?: Date | null;
    notInterestedAt?: Date | null;
    invalidAt?: Date | null;
    invalidatedAt?: Date | null;
    estimatedProjectValue?: number | null;
    lostReasonCode?: string | null;
    invalidReasonCode?: string | null;
    outcomeReasonCode?: string | null;
  } | null
): EngagementStageFlags {
  const developerId = claim.developerId || claim.userId;
  const isFailedClaim = claim.status === 'FAILED' || claim.status === 'CANCELLED';
  const isRefundedClaim =
    claim.status === 'REFUNDED' || (claim.creditsRefunded ?? 0) > 0;

  const rawPipeline =
    claim.pipelineStatus === 'NEW' ? 'CLAIMED' : claim.pipelineStatus;
  const effectiveStatus =
    engagement?.currentStatus || engagement?.finalOutcome || rawPipeline || 'CLAIMED';
  const finalOutcome = engagement?.finalOutcome || effectiveStatus;

  const isWon =
    effectiveStatus === 'WON' ||
    finalOutcome === 'WON' ||
    rawPipeline === 'WON' ||
    Boolean(engagement?.wonAt);
  const isLost =
    !isWon &&
    (effectiveStatus === 'LOST' ||
      finalOutcome === 'LOST' ||
      rawPipeline === 'LOST' ||
      Boolean(engagement?.lostAt));
  const isNotInterested =
    !isWon &&
    !isLost &&
    (effectiveStatus === 'NOT_INTERESTED' ||
      finalOutcome === 'NOT_INTERESTED' ||
      rawPipeline === 'NOT_INTERESTED' ||
      Boolean(engagement?.notInterestedAt));
  const isInvalid =
    !isWon &&
    (effectiveStatus === 'INVALID' ||
      finalOutcome === 'INVALID' ||
      rawPipeline === 'INVALID' ||
      Boolean(engagement?.invalidAt || engagement?.invalidatedAt));

  const isNegotiation =
    isWon ||
    NEGOTIATION_STATUSES.has(effectiveStatus) ||
    NEGOTIATION_STATUSES.has(rawPipeline) ||
    Boolean(engagement?.negotiationAt);
  const isProposal =
    isNegotiation ||
    PROPOSAL_STATUSES.has(effectiveStatus) ||
    PROPOSAL_STATUSES.has(rawPipeline) ||
    Boolean(engagement?.proposalSentAt);
  const isMeeting =
    isProposal ||
    MEETING_STATUSES.has(effectiveStatus) ||
    MEETING_STATUSES.has(rawPipeline) ||
    Boolean(engagement?.meetingAt);
  const isInterested =
    isMeeting ||
    INTERESTED_STATUSES.has(effectiveStatus) ||
    INTERESTED_STATUSES.has(rawPipeline) ||
    Boolean(engagement?.interestedAt);
  const isReplied =
    isInterested ||
    REPLIED_STATUSES.has(effectiveStatus) ||
    REPLIED_STATUSES.has(rawPipeline) ||
    Boolean(engagement?.firstRepliedAt);
  const isContacted =
    isReplied ||
    CONTACTED_STATUSES.has(effectiveStatus) ||
    CONTACTED_STATUSES.has(rawPipeline) ||
    Boolean(
      engagement?.firstContactedAt ||
        engagement?.lastContactedAt ||
        claim.lastContactedAt
    ) ||
    ((isLost || isNotInterested) &&
      Boolean(engagement?.firstContactedAt || claim.lastContactedAt || rawPipeline === 'LOST' || rawPipeline === 'NOT_INTERESTED'));

  const creditsCharged = Math.max(
    0,
    claim.creditsCharged ?? claim.creditsSpent ?? 0
  );
  const creditsRefunded = Math.max(0, claim.creditsRefunded ?? 0);
  const netCreditsConsumed = Math.max(0, creditsCharged - creditsRefunded);

  const lostReasonCode =
    isLost || isNotInterested
      ? normalizeLostReasonCode(
          engagement?.lostReasonCode ||
            engagement?.outcomeReasonCode ||
            (isNotInterested ? 'NOT_INTERESTED' : 'OTHER')
        )
      : null;

  const invalidReasonCode = isInvalid
    ? normalizeInvalidReasonCode(
        engagement?.invalidReasonCode ||
          engagement?.outcomeReasonCode ||
          'WRONG_PHONE'
      )
    : null;

  return {
    claimId: claim.id,
    leadId: claim.leadId,
    developerId,
    claimedAt: engagement?.claimedAt || claim.claimedAt,
    effectiveStatus,
    isFailedClaim,
    isRefundedClaim,
    isContacted,
    isReplied,
    isInterested,
    isMeeting,
    isProposal,
    isNegotiation,
    isWon,
    isLost,
    isNotInterested,
    isInvalid,
    isCompletedEligible: isWon || isLost || isNotInterested,
    estimatedProjectValueEgp: isWon
      ? Math.max(0, engagement?.estimatedProjectValue ?? 0)
      : 0,
    lostReasonCode,
    invalidReasonCode,
    creditsCharged,
    creditsRefunded,
    netCreditsConsumed,
  };
}

/**
 * Checks whether a Lead matches the dimension filters in `NormalizedAnalyticsFilters`.
 */
export function doesLeadMatchDimensionFilters(
  lead: {
    id: string;
    source?: string | null;
    sourceList?: string[] | null;
    category: string;
    governorate: string;
    city: string;
    area?: string | null;
    requiredService?: string | null;
    requiredServices?: string[] | null;
    websiteStatus?: string | null;
    temperature: string;
    scoringVersion?: string | null;
    qualityStatus: string;
    freshnessStatus: string;
    accessType?: string | null;
    leadType?: string | null;
    createdAt: Date;
  },
  filters: NormalizedAnalyticsFilters,
  options?: {
    skipDateCheck?: boolean;
    claimedLeadIdsForDeveloper?: Set<string> | null;
  }
): boolean {
  if (!options?.skipDateCheck && !isWithinDateRange(lead.createdAt, filters.dateRange)) {
    return false;
  }

  if (filters.source) {
    const origin = resolvePrimaryOriginSource(lead);
    if (origin.toLowerCase() !== filters.source.toLowerCase()) {
      return false;
    }
  }

  if (filters.niche) {
    if (lead.category.toLowerCase() !== filters.niche.toLowerCase()) {
      return false;
    }
  }

  const loc = resolveCanonicalLocation(lead);
  if (filters.governorate && loc.governorate !== filters.governorate) {
    return false;
  }
  if (filters.city && loc.city !== filters.city) {
    return false;
  }
  if (filters.district && loc.district !== filters.district) {
    return false;
  }

  if (filters.service) {
    const primaryService = resolveCanonicalService(lead);
    const reqList = Array.isArray(lead.requiredServices) ? lead.requiredServices : [];
    const matchesPrimary =
      primaryService.toLowerCase() === filters.service.toLowerCase();
    const matchesList = reqList.some(
      (s) =>
        (SERVICE_CANONICAL_MAP[s] || s).toLowerCase() ===
        filters.service!.toLowerCase()
    );
    if (!matchesPrimary && !matchesList) {
      return false;
    }
  }

  if (filters.scoreBand && lead.temperature.toUpperCase() !== filters.scoreBand) {
    return false;
  }

  if (filters.qualityBand && lead.qualityStatus.toUpperCase() !== filters.qualityBand) {
    return false;
  }

  if (filters.freshness && lead.freshnessStatus.toUpperCase() !== filters.freshness) {
    return false;
  }

  if (filters.accessType) {
    const effectiveAccess = (lead.accessType || lead.leadType || 'SHARED').toUpperCase();
    if (effectiveAccess !== filters.accessType) {
      return false;
    }
  }

  if (filters.scoringVersion) {
    const ver = (lead.scoringVersion || 'v1').toLowerCase();
    if (ver !== filters.scoringVersion.toLowerCase()) {
      return false;
    }
  }

  if (
    options?.claimedLeadIdsForDeveloper &&
    !options.claimedLeadIdsForDeveloper.has(lead.id)
  ) {
    return false;
  }

  return true;
}

/**
 * Classifies numeric Match Strength (0–100) into deterministic Phase 7 bands (Section 18).
 */
export function classifyMatchStrengthBand(
  matchStrength: number
): '0-24' | '25-49' | '50-74' | '75-100' {
  const s = Math.max(0, Math.min(100, Math.round(matchStrength)));
  if (s <= 24) return '0-24';
  if (s <= 49) return '25-49';
  if (s <= 74) return '50-74';
  return '75-100';
}

/**
 * Computes each developer's paid EGP value per credit for deterministic claim revenue attribution (Section 22).
 */
export function buildDeveloperCreditValueMap(
  developers: Array<{
    id: string;
    subscription?: {
      plan?: {
        priceEgp: number;
        monthlyCredits: number;
      } | null;
    } | null;
  }>,
  completedPayments: Array<{
    userId: string;
    amountEgp: number;
    creditsGranted: number;
  }>
): Map<string, number> {
  const paymentSums = new Map<string, { egp: number; credits: number }>();
  for (const p of completedPayments) {
    const cur = paymentSums.get(p.userId) || { egp: 0, credits: 0 };
    cur.egp += Math.max(0, p.amountEgp);
    cur.credits += Math.max(0, p.creditsGranted);
    paymentSums.set(p.userId, cur);
  }

  const creditValueMap = new Map<string, number>();
  for (const dev of developers) {
    const paid = paymentSums.get(dev.id);
    if (paid && paid.credits > 0 && paid.egp > 0) {
      creditValueMap.set(dev.id, roundTo(paid.egp / paid.credits, 4));
      continue;
    }
    const plan = dev.subscription?.plan;
    if (plan && plan.priceEgp > 0 && plan.monthlyCredits > 0) {
      creditValueMap.set(dev.id, roundTo(plan.priceEgp / plan.monthlyCredits, 4));
      continue;
    }
    creditValueMap.set(dev.id, 0);
  }

  return creditValueMap;
}

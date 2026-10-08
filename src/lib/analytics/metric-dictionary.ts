import { computeDeterministicRate, roundTo } from './statistics';
import { serializeActiveFilters } from './time-dimensions';
import {
  DEFAULT_BUSINESS_TIMEZONE,
  MetricDataStatus,
  MetricDefinition,
  NormalizedAnalyticsFilters,
  StandardizedMetricResult,
} from './types';

export const METRIC_DICTIONARY: Record<string, MetricDefinition> = {
  // ==========================================================================
  // LAYER 1 — INVENTORY
  // ==========================================================================
  TOTAL_LEADS: {
    key: 'TOTAL_LEADS',
    name: 'Total Canonical Leads',
    nameAr: 'إجمالي الفرص القياسية',
    layer: 'INVENTORY',
    unit: 'COUNT',
    definition: 'Total canonical Leads in the platform inventory within the selected filter window.',
    numerator: 'Count of canonical Leads (isCanonical = true)',
    denominator: '1 (Inventory count)',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'TOTAL_LEADS_V1',
  },
  AVAILABLE_LEADS: {
    key: 'AVAILABLE_LEADS',
    name: 'Available Leads',
    nameAr: 'الفرص المتاحة للاقتناص',
    layer: 'INVENTORY',
    unit: 'COUNT',
    definition: 'Canonical Leads currently available for claim (availableForClaim = true and status = AVAILABLE).',
    numerator: 'Available canonical Leads',
    denominator: 'Total canonical Leads',
    filters: ['isCanonical = true', 'status = AVAILABLE', 'availableForClaim = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'AVAILABLE_LEADS_V1',
  },
  CLAIMED_LEADS: {
    key: 'CLAIMED_LEADS',
    name: 'Claimed Leads',
    nameAr: 'الفرص التي تم اقتناصها',
    layer: 'INVENTORY',
    unit: 'COUNT',
    definition: 'Distinct canonical Leads with at least one active or completed developer claim.',
    numerator: 'Distinct Leads with claims',
    denominator: 'Total canonical Leads',
    filters: ['isCanonical = true', 'LeadClaim.status != FAILED'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'CLAIMED_LEADS_V1',
  },
  SALEABLE_LEADS: {
    key: 'SALEABLE_LEADS',
    name: 'Saleable Leads',
    nameAr: 'الفرص القابلة للبيع',
    layer: 'INVENTORY',
    unit: 'COUNT',
    definition: 'Canonical Leads passing Phase 3 saleability gates (saleabilityStatus = AVAILABLE or CLAIMED_FULL).',
    numerator: 'Saleable canonical Leads',
    denominator: 'Total canonical Leads',
    filters: ['isCanonical = true', 'saleabilityStatus IN (AVAILABLE, CLAIMED_FULL)'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'SALEABLE_LEADS_V1',
  },

  // ==========================================================================
  // LAYER 2 — QUALITY
  // ==========================================================================
  AVERAGE_QUALITY_SCORE: {
    key: 'AVERAGE_QUALITY_SCORE',
    name: 'Average Quality Score',
    nameAr: 'متوسط درجة الجودة',
    layer: 'QUALITY',
    unit: 'SCORE',
    definition: 'Arithmetic mean of Phase 3 deterministic qualityScore (0–100) across evaluated canonical Leads.',
    numerator: 'Sum of Lead.qualityScore',
    denominator: 'Evaluated canonical Leads count',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'AVERAGE_QUALITY_SCORE_V1',
  },
  VERIFICATION_RATE: {
    key: 'VERIFICATION_RATE',
    name: 'Verification Rate',
    nameAr: 'معدل التحقق من البيانات',
    layer: 'QUALITY',
    unit: 'RATE',
    definition: 'Verified or partially verified Leads divided by total evaluated canonical Leads.',
    numerator: 'Leads with verificationStatus IN (VERIFIED, PARTIALLY_VERIFIED)',
    denominator: 'Total evaluated canonical Leads',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'VERIFICATION_RATE_V1',
  },
  INVALID_RATE: {
    key: 'INVALID_RATE',
    name: 'Invalid Lead Rate',
    nameAr: 'معدل الفرص غير الصالحة',
    layer: 'QUALITY',
    unit: 'RATE',
    definition: 'Invalid Leads (marked INVALID in Lead status/saleability or confirmed INVALID engagement) divided by Leads evaluated.',
    numerator: 'Invalid Leads',
    denominator: 'Leads evaluated',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'INVALID_RATE_V1',
  },
  DUPLICATE_RATE: {
    key: 'DUPLICATE_RATE',
    name: 'Duplicate Rate',
    nameAr: 'معدل التكرارات المكتشفة',
    layer: 'QUALITY',
    unit: 'RATE',
    definition: 'Duplicate source records and non-canonical merged duplicates divided by total records collected.',
    numerator: 'Duplicate records identified',
    denominator: 'Total records evaluated (unique + duplicates)',
    filters: ['SourceRecord / Lead deduplication'],
    timeBasis: 'SourceRecord.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'DUPLICATE_RATE_V1',
  },

  // ==========================================================================
  // LAYER 3 — OPPORTUNITY
  // ==========================================================================
  AVERAGE_OPPORTUNITY_SCORE: {
    key: 'AVERAGE_OPPORTUNITY_SCORE',
    name: 'Average Opportunity Score',
    nameAr: 'متوسط تقييم الفرصة البيعية',
    layer: 'OPPORTUNITY',
    unit: 'SCORE',
    definition: 'Arithmetic mean of Phase 1 deterministic Opportunity Score (Lead.score 0–100) across canonical Leads.',
    numerator: 'Sum of Lead.score',
    denominator: 'Evaluated canonical Leads count',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'AVERAGE_OPPORTUNITY_SCORE_V1',
  },

  // ==========================================================================
  // LAYER 4 — MATCHING
  // ==========================================================================
  MATCH_RATE: {
    key: 'MATCH_RATE',
    name: 'Match Eligibility Rate',
    nameAr: 'معدل أهلية المطابقة',
    layer: 'MATCHING',
    unit: 'RATE',
    definition: 'Eligible Lead-developer match snapshots divided by total evaluated Lead-developer pairs.',
    numerator: 'Eligible matches (MatchSnapshot.eligible = true)',
    denominator: 'Total evaluated Lead-developer pairs (MatchSnapshot)',
    filters: ['MatchSnapshot.isStale = false'],
    timeBasis: 'MatchSnapshot.calculatedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'MATCH_RATE_V1',
  },
  AVERAGE_MATCH_STRENGTH: {
    key: 'AVERAGE_MATCH_STRENGTH',
    name: 'Average Match Strength',
    nameAr: 'متوسط قوة المطابقة',
    layer: 'MATCHING',
    unit: 'SCORE',
    definition: 'Arithmetic mean of deterministic matchStrength (0–100) across eligible Lead-developer matches.',
    numerator: 'Sum of MatchSnapshot.matchStrength for eligible matches',
    denominator: 'Count of eligible matches',
    filters: ['MatchSnapshot.eligible = true'],
    timeBasis: 'MatchSnapshot.calculatedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'AVERAGE_MATCH_STRENGTH_V1',
  },
  CLAIMS_PER_MATCH_RATE: {
    key: 'CLAIMS_PER_MATCH_RATE',
    name: 'Claims per Eligible Match Rate',
    nameAr: 'معدل الاقتناص من المطابقات المؤهلة',
    layer: 'MATCHING',
    unit: 'RATE',
    definition: 'Claims made on eligible matched pairs divided by total eligible matches.',
    numerator: 'Claimed eligible matches',
    denominator: 'Eligible matches',
    filters: ['MatchSnapshot.eligible = true'],
    timeBasis: 'MatchSnapshot.calculatedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'CLAIMS_PER_MATCH_RATE_V1',
  },

  // ==========================================================================
  // LAYER 5 — SALES FUNNEL & DENOMINATOR-DISCIPLINED CONVERSIONS
  // ==========================================================================
  CLAIM_RATE: {
    key: 'CLAIM_RATE',
    name: 'Lead Claim Rate',
    nameAr: 'معدل اقتناص الفرص',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Claimed canonical Leads divided by available/saleable canonical Leads evaluated.',
    numerator: 'Claimed Leads (distinct Leads with active/completed claims)',
    denominator: 'Available/saleable Leads evaluated',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'CLAIM_RATE_V1',
  },
  CONTACT_RATE: {
    key: 'CONTACT_RATE',
    name: 'Contact Rate',
    nameAr: 'معدل التواصل بعد الاقتناص',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Contacted engagements divided by claimed engagements.',
    numerator: 'Contacted engagements',
    denominator: 'Claimed engagements',
    filters: ['LeadClaim.status != FAILED'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'CONTACT_RATE_V1',
  },
  REPLY_RATE: {
    key: 'REPLY_RATE',
    name: 'Reply Rate (of Contacted)',
    nameAr: 'معدل الرد من المتواصل معهم',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Replied engagements divided by contacted engagements.',
    numerator: 'Replied engagements',
    denominator: 'Contacted engagements',
    filters: ['Contacted engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'REPLY_RATE_V1',
  },
  REPLY_RATE_OF_CLAIMED: {
    key: 'REPLY_RATE_OF_CLAIMED',
    name: 'Reply Rate (of Claimed)',
    nameAr: 'معدل الرد من إجمالي المقتنصة',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Replied engagements divided by claimed engagements.',
    numerator: 'Replied engagements',
    denominator: 'Claimed engagements',
    filters: ['Claimed engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'REPLY_RATE_OF_CLAIMED_V1',
  },
  INTEREST_RATE: {
    key: 'INTEREST_RATE',
    name: 'Interest Rate (of Contacted)',
    nameAr: 'معدل الاهتمام من المتواصل معهم',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Interested engagements divided by contacted engagements.',
    numerator: 'Interested engagements',
    denominator: 'Contacted engagements',
    filters: ['Contacted engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'INTEREST_RATE_V1',
  },
  INTEREST_RATE_OF_REPLIED: {
    key: 'INTEREST_RATE_OF_REPLIED',
    name: 'Interest Rate (of Replied)',
    nameAr: 'معدل الاهتمام من المستجيبين',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Interested engagements divided by replied engagements.',
    numerator: 'Interested engagements',
    denominator: 'Replied engagements',
    filters: ['Replied engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'INTEREST_RATE_OF_REPLIED_V1',
  },
  MEETING_RATE: {
    key: 'MEETING_RATE',
    name: 'Meeting Rate (of Replied)',
    nameAr: 'معدل الاجتماعات من المستجيبين',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Meeting engagements divided by replied engagements (stage conversion rate).',
    numerator: 'Meeting engagements',
    denominator: 'Replied engagements',
    filters: ['Replied engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'MEETING_RATE_V1',
  },
  MEETING_RATE_OF_INTERESTED: {
    key: 'MEETING_RATE_OF_INTERESTED',
    name: 'Meeting Rate (of Interested)',
    nameAr: 'معدل الاجتماعات من المهتمين',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Meeting engagements divided by interested engagements.',
    numerator: 'Meeting engagements',
    denominator: 'Interested engagements',
    filters: ['Interested engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'MEETING_RATE_OF_INTERESTED_V1',
  },
  MEETING_RATE_OF_CLAIMED: {
    key: 'MEETING_RATE_OF_CLAIMED',
    name: 'Meeting Rate (of Claimed)',
    nameAr: 'معدل الاجتماعات من إجمالي المقتنصة',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Meeting engagements divided by claimed engagements.',
    numerator: 'Meeting engagements',
    denominator: 'Claimed engagements',
    filters: ['Claimed engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'MEETING_RATE_OF_CLAIMED_V1',
  },
  WIN_RATE: {
    key: 'WIN_RATE',
    name: 'Win Rate (of Claimed)',
    nameAr: 'معدل الفوز بالصفقات من المقتنصة',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Won engagements divided by claimed engagements.',
    numerator: 'Won engagements (WON)',
    denominator: 'Claimed engagements',
    filters: ['Claimed engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'WIN_RATE_V1',
  },
  WIN_RATE_OF_MEETINGS: {
    key: 'WIN_RATE_OF_MEETINGS',
    name: 'Win Rate (of Meetings)',
    nameAr: 'معدل الفوز من الاجتماعات',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Won engagements divided by meeting engagements (stage conversion rate).',
    numerator: 'Won engagements (WON)',
    denominator: 'Meeting engagements',
    filters: ['Meeting engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'WIN_RATE_OF_MEETINGS_V1',
  },
  WIN_RATE_OF_CONTACTED: {
    key: 'WIN_RATE_OF_CONTACTED',
    name: 'Win Rate (of Contacted)',
    nameAr: 'معدل الفوز من المتواصل معهم',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Won engagements divided by contacted engagements.',
    numerator: 'Won engagements (WON)',
    denominator: 'Contacted engagements',
    filters: ['Contacted engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'WIN_RATE_OF_CONTACTED_V1',
  },
  WIN_RATE_OF_COMPLETED: {
    key: 'WIN_RATE_OF_COMPLETED',
    name: 'Win Rate (of Completed Opportunities)',
    nameAr: 'معدل الفوز من الفرص المكتملة',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Won engagements divided by eligible completed engagements (WON + LOST + NOT_INTERESTED).',
    numerator: 'Won engagements (WON)',
    denominator: 'Eligible completed engagements (WON + LOST + NOT_INTERESTED)',
    filters: ['Terminal non-invalid engagements'],
    timeBasis: 'LeadEngagement.closedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'WIN_RATE_OF_COMPLETED_V1',
  },
  PROPOSAL_RATE: {
    key: 'PROPOSAL_RATE',
    name: 'Proposal Rate (of Meetings)',
    nameAr: 'معدل إرسال العروض من الاجتماعات',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Proposal sent engagements divided by meeting engagements.',
    numerator: 'Proposal engagements (PROPOSAL_SENT+)',
    denominator: 'Meeting engagements (MEETING+)',
    filters: ['Meeting engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'PROPOSAL_RATE_V1',
  },
  LOSS_RATE: {
    key: 'LOSS_RATE',
    name: 'Loss Rate (of Claimed)',
    nameAr: 'معدل خسارة الصفقات من المقتنصة',
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: 'Lost engagements divided by claimed engagements.',
    numerator: 'Lost engagements (LOST)',
    denominator: 'Claimed engagements',
    filters: ['Claimed engagements'],
    timeBasis: 'LeadEngagement.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'LOSS_RATE_V1',
  },

  // ==========================================================================
  // LAYER 6 — ECONOMICS
  // ==========================================================================
  REVENUE_TOTAL_EGP: {
    key: 'REVENUE_TOTAL_EGP',
    name: 'Total Net Cash Revenue (EGP)',
    nameAr: 'إجمالي الإيرادات النقدية الصافية (ج.م)',
    layer: 'ECONOMICS',
    unit: 'CURRENCY_EGP',
    definition: 'Net completed subscription & credit package payments in EGP.',
    numerator: 'Completed payments EGP minus payment refunds EGP',
    denominator: '1 (Currency total)',
    filters: ['Payment.status = COMPLETED'],
    timeBasis: 'Payment.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'REVENUE_TOTAL_EGP_V1',
  },
  ATTRIBUTED_CLAIM_REVENUE_EGP: {
    key: 'ATTRIBUTED_CLAIM_REVENUE_EGP',
    name: 'Attributed Claim Revenue (EGP)',
    nameAr: 'الإيراد المحقق من اقتناص الفرص (ج.م)',
    layer: 'ECONOMICS',
    unit: 'CURRENCY_EGP',
    definition: 'Realized platform revenue attributed to net credits consumed on Lead claims without cross-dimension double counting.',
    numerator: 'Sum of (netCreditsConsumed * developerPaidCreditValueEgp)',
    denominator: '1 (Currency total)',
    filters: ['LeadClaim.status IN (ACTIVE, EXPIRED)'],
    timeBasis: 'LeadClaim.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'ATTRIBUTED_CLAIM_REVENUE_EGP_V1',
  },
  REVENUE_PER_LEAD: {
    key: 'REVENUE_PER_LEAD',
    name: 'Revenue per Lead (EGP)',
    nameAr: 'متوسط الإيراد لكل فرصة (ج.م)',
    layer: 'ECONOMICS',
    unit: 'CURRENCY_EGP',
    definition: 'Attributed claim revenue in EGP divided by canonical Leads in the segment.',
    numerator: 'Attributed claim revenue (EGP)',
    denominator: 'Canonical Leads count',
    filters: ['isCanonical = true'],
    timeBasis: 'Lead.createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'REVENUE_PER_LEAD_V1',
  },
  REVENUE_PER_CLAIM: {
    key: 'REVENUE_PER_CLAIM',
    name: 'Revenue per Claim (EGP)',
    nameAr: 'متوسط الإيراد لكل عملية اقتناص (ج.م)',
    layer: 'ECONOMICS',
    unit: 'CURRENCY_EGP',
    definition: 'Attributed claim revenue in EGP divided by successful claims count.',
    numerator: 'Attributed claim revenue (EGP)',
    denominator: 'Successful claims count',
    filters: ['LeadClaim.status != FAILED'],
    timeBasis: 'LeadClaim.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'REVENUE_PER_CLAIM_V1',
  },
  REFUND_RATE: {
    key: 'REFUND_RATE',
    name: 'Claim Credit Refund Rate',
    nameAr: 'معدل استرداد النقاط',
    layer: 'ECONOMICS',
    unit: 'RATE',
    definition: 'Refunded credits divided by total credits charged on claims.',
    numerator: 'Credits refunded',
    denominator: 'Credits charged',
    filters: ['LeadClaim'],
    timeBasis: 'LeadClaim.claimedAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: 'REFUND_RATE_V1',
  },
};

export function getMetricDefinition(metricKey: string): MetricDefinition {
  const def = METRIC_DICTIONARY[metricKey];
  if (def) return def;
  return {
    key: metricKey,
    name: metricKey,
    nameAr: metricKey,
    layer: 'SALES_FUNNEL',
    unit: 'RATE',
    definition: `Centralized deterministic metric ${metricKey}`,
    numerator: 'Numerator',
    denominator: 'Denominator',
    filters: [],
    timeBasis: 'createdAt',
    timezonePolicy: DEFAULT_BUSINESS_TIMEZONE,
    version: `${metricKey}_V1`,
  };
}

/**
 * Builds a standardized rate metric envelope (Section 5, 6, 39, 44, 56).
 * Explicitly exposes numerator, denominator, percentage, definition, dateRange, filters, and metricVersion.
 * If denominator === 0, returns status = 'INSUFFICIENT_DATA' and value = null (never fabricates a percentage).
 */
export function buildRateMetric(
  metricKey: string,
  numerator: number,
  denominator: number,
  filters: NormalizedAnalyticsFilters,
  options?: {
    minimumSampleSize?: number;
    customNumeratorLabel?: string;
    customDenominatorLabel?: string;
    generatedAt?: Date;
  }
): StandardizedMetricResult {
  const def = getMetricDefinition(metricKey);
  const minSample = options?.minimumSampleSize ?? def.minimumSampleSize ?? 0;
  const rate = computeDeterministicRate(numerator, denominator, minSample);
  const genAt = (options?.generatedAt || new Date()).toISOString();

  return {
    metric: def.key,
    name: def.name,
    nameAr: def.nameAr,
    layer: def.layer,
    unit: def.unit,
    definition: def.definition,
    value: rate.value,
    percentage: rate.percentage,
    displayValue: rate.displayValue,
    status: rate.status,
    numerator: Math.max(0, Math.round(numerator)),
    denominator: Math.max(0, Math.round(denominator)),
    numeratorLabel: options?.customNumeratorLabel || def.numerator,
    denominatorLabel: options?.customDenominatorLabel || def.denominator,
    minimumSampleSize: minSample,
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    metricVersion: def.version,
    timeBasis: def.timeBasis,
    timezonePolicy: def.timezonePolicy,
    generatedAt: genAt,
  };
}

/**
 * Builds a standardized ratio/average/count/currency metric envelope.
 */
export function buildValueMetric(
  metricKey: string,
  numerator: number,
  denominator: number,
  filters: NormalizedAnalyticsFilters,
  options?: {
    isCount?: boolean;
    generatedAt?: Date;
  }
): StandardizedMetricResult {
  const def = getMetricDefinition(metricKey);
  const genAt = (options?.generatedAt || new Date()).toISOString();

  if (options?.isCount) {
    const safeCount = Number.isFinite(numerator) ? Math.round(numerator) : 0;
    return {
      metric: def.key,
      name: def.name,
      nameAr: def.nameAr,
      layer: def.layer,
      unit: def.unit,
      definition: def.definition,
      value: safeCount,
      percentage: null,
      displayValue: String(safeCount),
      status: 'VALID',
      numerator: safeCount,
      denominator: 1,
      numeratorLabel: def.numerator,
      denominatorLabel: def.denominator,
      dateRange: {
        from: filters.dateRange.from,
        to: filters.dateRange.to,
        preset: filters.dateRange.preset,
        timezone: filters.dateRange.timezone,
      },
      filters: serializeActiveFilters(filters),
      metricVersion: def.version,
      timeBasis: def.timeBasis,
      timezonePolicy: def.timezonePolicy,
      generatedAt: genAt,
    };
  }

  const safeDen = Number.isFinite(denominator) ? Math.max(0, Math.round(denominator)) : 0;
  const safeNum = Number.isFinite(numerator) ? roundTo(numerator, 2) : 0;

  if (safeDen <= 0) {
    return {
      metric: def.key,
      name: def.name,
      nameAr: def.nameAr,
      layer: def.layer,
      unit: def.unit,
      definition: def.definition,
      value: null,
      percentage: null,
      displayValue: 'INSUFFICIENT_DATA',
      status: 'INSUFFICIENT_DATA' as MetricDataStatus,
      numerator: 0,
      denominator: 0,
      numeratorLabel: def.numerator,
      denominatorLabel: def.denominator,
      dateRange: {
        from: filters.dateRange.from,
        to: filters.dateRange.to,
        preset: filters.dateRange.preset,
        timezone: filters.dateRange.timezone,
      },
      filters: serializeActiveFilters(filters),
      metricVersion: def.version,
      timeBasis: def.timeBasis,
      timezonePolicy: def.timezonePolicy,
      generatedAt: genAt,
    };
  }

  const val = roundTo(safeNum / safeDen, 2);
  return {
    metric: def.key,
    name: def.name,
    nameAr: def.nameAr,
    layer: def.layer,
    unit: def.unit,
    definition: def.definition,
    value: val,
    percentage: null,
    displayValue: def.unit === 'CURRENCY_EGP' ? `${val} EGP` : String(val),
    status: 'VALID',
    numerator: Math.round(safeNum),
    denominator: safeDen,
    numeratorLabel: def.numerator,
    denominatorLabel: def.denominator,
    dateRange: {
      from: filters.dateRange.from,
      to: filters.dateRange.to,
      preset: filters.dateRange.preset,
      timezone: filters.dateRange.timezone,
    },
    filters: serializeActiveFilters(filters),
    metricVersion: def.version,
    timeBasis: def.timeBasis,
    timezonePolicy: def.timezonePolicy,
    generatedAt: genAt,
  };
}

export interface FunnelStageCountsInput {
  claimed: number;
  contacted: number;
  replied: number;
  interested?: number;
  meetings: number;
  proposals?: number;
  negotiations?: number;
  won?: number;
  wins?: number;
  lost?: number;
  notInterested?: number;
  invalid?: number;
}

/**
 * Centralized Sales Funnel calculator enforcing Denominator Discipline (Sections 5, 6, 24, 45).
 * Computes both stage-to-stage conversion rates and overall claim-denominator conversion rates.
 */
export function calculateCentralizedFunnelMetrics(
  counts: FunnelStageCountsInput,
  filters: NormalizedAnalyticsFilters
) {
  const claimed = Math.max(0, Math.round(counts.claimed || 0));
  const contacted = Math.max(0, Math.round(counts.contacted || 0));
  const replied = Math.max(0, Math.round(counts.replied || 0));
  const interested = Math.max(
    0,
    Math.round(counts.interested !== undefined ? counts.interested : replied)
  );
  const meetings = Math.max(0, Math.round(counts.meetings || 0));
  const proposals = Math.max(0, Math.round(counts.proposals || 0));
  const negotiations = Math.max(0, Math.round(counts.negotiations || 0));
  const won = Math.max(0, Math.round(counts.won ?? counts.wins ?? 0));
  const lost = Math.max(0, Math.round(counts.lost || 0));
  const notInterested = Math.max(0, Math.round(counts.notInterested || 0));
  const invalid = Math.max(0, Math.round(counts.invalid || 0));
  const completedEligible = won + lost + notInterested;

  // Stage-to-stage conversion rates (Section 45: Contact=contacted/claimed, Reply=replied/contacted, Meeting=meetings/replied, Win=wins/meetings)
  const contactRate = buildRateMetric('CONTACT_RATE', contacted, claimed, filters);
  const replyRate = buildRateMetric('REPLY_RATE', replied, contacted, filters);
  const interestRate = buildRateMetric('INTEREST_RATE', interested, contacted, filters);
  const interestRateOfReplied = buildRateMetric(
    'INTEREST_RATE_OF_REPLIED',
    interested,
    replied,
    filters
  );
  const meetingRate = buildRateMetric('MEETING_RATE', meetings, replied, filters);
  const meetingRateOfInterested = buildRateMetric(
    'MEETING_RATE_OF_INTERESTED',
    meetings,
    interested,
    filters
  );
  const proposalRate = buildRateMetric('PROPOSAL_RATE', proposals, meetings, filters);
  const winRateOfMeetings = buildRateMetric('WIN_RATE_OF_MEETINGS', won, meetings, filters);

  // Claim-based & alternative denominator rates (Section 6: Won/claimed, Won/contacted, Won/completed)
  const replyRateOfClaimed = buildRateMetric('REPLY_RATE_OF_CLAIMED', replied, claimed, filters);
  const meetingRateOfClaimed = buildRateMetric(
    'MEETING_RATE_OF_CLAIMED',
    meetings,
    claimed,
    filters
  );
  const winRateOfClaimed = buildRateMetric('WIN_RATE', won, claimed, filters);
  const winRateOfContacted = buildRateMetric('WIN_RATE_OF_CONTACTED', won, contacted, filters);
  const winRateOfCompleted = buildRateMetric(
    'WIN_RATE_OF_COMPLETED',
    won,
    completedEligible,
    filters
  );
  const lossRateOfClaimed = buildRateMetric('LOSS_RATE', lost, claimed, filters);
  const invalidEngagementRate = buildRateMetric('INVALID_RATE', invalid, claimed, filters);

  return {
    counts: {
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
      completedEligible,
    },
    stageRates: {
      contactRate,
      replyRate,
      interestRate,
      interestRateOfReplied,
      meetingRate,
      meetingRateOfInterested,
      proposalRate,
      winRate: winRateOfMeetings,
    },
    overallRates: {
      contactRate,
      replyRateOfClaimed,
      meetingRateOfReplied: meetingRate,
      meetingRateOfClaimed,
      winRateOfClaimed,
      winRateOfContacted,
      winRateOfCompleted,
      winRateOfMeetings,
      lossRateOfClaimed,
      invalidEngagementRate,
    },
    stages: [
      {
        stage: 'CLAIMED',
        label: 'Claimed',
        labelAr: 'تم الاقتناص (CLAIMED)',
        count: claimed,
        conversionFromPrevious: buildRateMetric('CLAIM_STAGE', claimed, claimed, filters, {
          customNumeratorLabel: 'Claimed engagements',
          customDenominatorLabel: 'Claimed engagements',
        }),
        conversionFromClaimed: buildRateMetric('CLAIM_STAGE', claimed, claimed, filters, {
          customNumeratorLabel: 'Claimed engagements',
          customDenominatorLabel: 'Claimed engagements',
        }),
      },
      {
        stage: 'CONTACTED',
        label: 'Contacted',
        labelAr: 'تم التواصل (CONTACTED)',
        count: contacted,
        conversionFromPrevious: contactRate,
        conversionFromClaimed: contactRate,
      },
      {
        stage: 'REPLIED',
        label: 'Replied',
        labelAr: 'تم الرد (REPLIED)',
        count: replied,
        conversionFromPrevious: replyRate,
        conversionFromClaimed: replyRateOfClaimed,
      },
      {
        stage: 'INTERESTED',
        label: 'Interested',
        labelAr: 'مهتم (INTERESTED)',
        count: interested,
        conversionFromPrevious: interestRateOfReplied,
        conversionFromClaimed: buildRateMetric('INTEREST_OF_CLAIMED', interested, claimed, filters, {
          customNumeratorLabel: 'Interested engagements',
          customDenominatorLabel: 'Claimed engagements',
        }),
      },
      {
        stage: 'MEETING',
        label: 'Meeting',
        labelAr: 'اجتماع محدد (MEETING)',
        count: meetings,
        conversionFromPrevious: meetingRateOfInterested,
        conversionFromReplied: meetingRate,
        conversionFromClaimed: meetingRateOfClaimed,
      },
      {
        stage: 'PROPOSAL_SENT',
        label: 'Proposal Sent',
        labelAr: 'تم إرسال العرض (PROPOSAL)',
        count: proposals,
        conversionFromPrevious: buildRateMetric('PROPOSAL_OF_MEETING', proposals, meetings, filters, {
          customNumeratorLabel: 'Proposal engagements',
          customDenominatorLabel: 'Meeting engagements',
        }),
        conversionFromClaimed: buildRateMetric('PROPOSAL_OF_CLAIMED', proposals, claimed, filters, {
          customNumeratorLabel: 'Proposal engagements',
          customDenominatorLabel: 'Claimed engagements',
        }),
      },
      {
        stage: 'NEGOTIATION',
        label: 'Negotiation',
        labelAr: 'مرحلة التفاوض (NEGOTIATION)',
        count: negotiations,
        conversionFromPrevious: buildRateMetric(
          'NEGOTIATION_OF_PROPOSAL',
          negotiations,
          proposals,
          filters,
          {
            customNumeratorLabel: 'Negotiation engagements',
            customDenominatorLabel: 'Proposal engagements',
          }
        ),
        conversionFromClaimed: buildRateMetric(
          'NEGOTIATION_OF_CLAIMED',
          negotiations,
          claimed,
          filters,
          {
            customNumeratorLabel: 'Negotiation engagements',
            customDenominatorLabel: 'Claimed engagements',
          }
        ),
      },
      {
        stage: 'WON',
        label: 'Won',
        labelAr: 'صفقة ناجحة (WON)',
        count: won,
        conversionFromPrevious: winRateOfMeetings,
        conversionFromClaimed: winRateOfClaimed,
      },
    ],
  };
}

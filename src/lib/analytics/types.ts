import { RuleReviewStatus, RuleReviewType } from '@prisma/client';

export const DEFAULT_BUSINESS_TIMEZONE =
  process.env.ANALYTICS_TIMEZONE || 'Africa/Cairo';

export const DEFAULT_MINIMUM_SAMPLE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_SAFE_PAGE_SIZE = 100;

export type TimePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'month_to_date'
  | 'previous_month'
  | 'custom'
  | 'all_time';

export type MetricLayer =
  | 'INVENTORY'
  | 'QUALITY'
  | 'OPPORTUNITY'
  | 'MATCHING'
  | 'SALES_FUNNEL'
  | 'ECONOMICS'
  | 'RULE_PERFORMANCE';

export type MetricUnit =
  | 'RATE'
  | 'COUNT'
  | 'SCORE'
  | 'CURRENCY_EGP'
  | 'CREDITS';

export type MetricDataStatus =
  | 'VALID'
  | 'INSUFFICIENT_DATA'
  | 'INSUFFICIENT_SAMPLE';

export interface DateRangeWindow {
  preset: TimePreset;
  from: string | null;
  to: string | null;
  startDate: Date | null;
  endDate: Date | null;
  timezone: string;
}

export interface AnalyticsFilterInput {
  preset?: TimePreset | string | null;
  from?: string | Date | null;
  to?: string | Date | null;
  timezone?: string | null;
  source?: string | null;
  niche?: string | null;
  category?: string | null;
  governorate?: string | null;
  city?: string | null;
  district?: string | null;
  service?: string | null;
  scoreBand?: string | null;
  qualityBand?: string | null;
  freshness?: string | null;
  accessType?: 'SHARED' | 'EXCLUSIVE' | string | null;
  developerId?: string | null;
  scoringVersion?: string | null;
  matchVersion?: string | null;
  cohortBy?:
    | 'created_date'
    | 'claimed_date'
    | 'source'
    | 'niche'
    | 'city'
    | 'service'
    | 'score_band'
    | 'quality_band'
    | string
    | null;
  minimumSampleSize?: number | null;
  page?: number | null;
  pageSize?: number | null;
  sortBy?: string | null;
  sortOrder?: 'asc' | 'desc' | string | null;
  referenceNow?: Date | string | null;
}

export interface NormalizedAnalyticsFilters {
  dateRange: DateRangeWindow;
  source: string | null;
  niche: string | null;
  governorate: string | null;
  city: string | null;
  district: string | null;
  service: string | null;
  scoreBand: string | null;
  qualityBand: string | null;
  freshness: string | null;
  accessType: 'SHARED' | 'EXCLUSIVE' | null;
  developerId: string | null;
  scoringVersion: string | null;
  matchVersion: string | null;
  cohortBy:
    | 'created_date'
    | 'claimed_date'
    | 'source'
    | 'niche'
    | 'city'
    | 'service'
    | 'score_band'
    | 'quality_band';
  minimumSampleSize: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  referenceNow: Date;
}

export interface MetricDefinition {
  key: string;
  name: string;
  nameAr: string;
  layer: MetricLayer;
  unit: MetricUnit;
  definition: string;
  numerator: string;
  denominator: string;
  numeratorDescription?: string;
  denominatorDescription?: string;
  filters: string[];
  timeBasis: string;
  timezonePolicy: string;
  version: string;
  minimumSampleSize?: number;
}

export interface StandardizedMetricResult {
  metric: string;
  name: string;
  nameAr: string;
  layer: MetricLayer;
  unit: MetricUnit;
  definition: string;
  value: number | null;
  percentage: number | null;
  displayValue: string;
  status: MetricDataStatus;
  numerator: number;
  denominator: number;
  numeratorLabel: string;
  denominatorLabel: string;
  minimumSampleSize?: number;
  dateRange: {
    from: string | null;
    to: string | null;
    preset: TimePreset;
    timezone: string;
  };
  filters: Record<string, unknown>;
  metricVersion: string;
  timeBasis: string;
  timezonePolicy: string;
  generatedAt: string;
}

export interface NumericSummaryStats {
  count: number;
  sum: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  status: MetricDataStatus;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export type AnomalyFlagCode =
  | 'SOURCE_INVALID_RATE_HIGH'
  | 'SOURCE_DUPLICATE_RATE_HIGH'
  | 'SCORE_BAND_UNDERPERFORMING'
  | 'QUALITY_BAND_UNDERPERFORMING'
  | 'MATCH_RULE_UNDERPERFORMING'
  | 'DEVELOPER_FEEDBACK_SPIKE'
  | 'CLAIM_FAILURE_SPIKE'
  | 'REFUND_RATE_SPIKE';

export interface DeterministicAnomalyFlag {
  code: AnomalyFlagCode;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  entityType:
    | 'SOURCE'
    | 'SCORE_BAND'
    | 'QUALITY_BAND'
    | 'MATCH_RULE'
    | 'DEVELOPER'
    | 'CLAIMS'
    | 'CREDITS';
  entityKey: string;
  metric: string;
  metricVersion: string;
  observedValue: number;
  thresholdValue: number;
  numerator: number;
  denominator: number;
  sampleSize: number;
  title: string;
  titleAr: string;
  explanation: string;
  explanationAr: string;
  detectedAt: string;
}

export interface RulePerformanceRow {
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
  leadsAffected: number;
  sampleSize: number;
  minimumSampleSize: number;
  sampleStatus: 'SUFFICIENT' | 'INSUFFICIENT_SAMPLE';
  withRule: {
    leadsCount: number;
    claimsCount: number;
    contactedCount: number;
    repliedCount: number;
    interestedCount: number;
    meetingCount: number;
    wonCount: number;
    lostCount: number;
    invalidCount: number;
    averageOpportunityScore: number | null;
    averageQualityScore: number | null;
    averageProjectValueEgp: number | null;
    claimRate: StandardizedMetricResult;
    contactRate: StandardizedMetricResult;
    meetingRate: StandardizedMetricResult;
    winRate: StandardizedMetricResult;
    invalidRate: StandardizedMetricResult;
  };
  withoutRule: {
    leadsCount: number;
    claimsCount: number;
    contactedCount: number;
    repliedCount: number;
    interestedCount: number;
    meetingCount: number;
    wonCount: number;
    lostCount: number;
    invalidCount: number;
    claimRate: StandardizedMetricResult;
    contactRate: StandardizedMetricResult;
    meetingRate: StandardizedMetricResult;
    winRate: StandardizedMetricResult;
    invalidRate: StandardizedMetricResult;
  };
  comparison: {
    winRateLiftAbsolute: number | null;
    winRateLiftRelative: number | null;
    contactRateLiftAbsolute: number | null;
    invalidRateDeltaAbsolute: number | null;
    flaggedForReview: boolean;
    flagReason: string | null;
  };
}

export interface RuleReviewDecisionInput {
  candidateId: string;
  adminUserId: string;
  status: Extract<
    RuleReviewStatus,
    'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'DEFERRED'
  >;
  decision: string;
  notes?: string | null;
  ipAddress?: string;
}

export class AnalyticsEngineError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AnalyticsEngineError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

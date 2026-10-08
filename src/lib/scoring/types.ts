import { WebsiteAnalysisResult } from '../website-analyzer';

export type LeadTemperatureBand = 'COLD' | 'WARM' | 'HOT' | 'PREMIUM';

export type WebsiteQualityState = 'NO_WEBSITE' | 'POOR_WEBSITE' | 'HAS_WEBSITE' | 'UNKNOWN';

export type TriState = 'TRUE' | 'FALSE' | 'UNKNOWN';

export type ScoringTriggerType =
  | 'LEAD_CREATED'
  | 'LEAD_UPDATED'
  | 'SOURCE_REFRESH'
  | 'MANUAL_RECALCULATION'
  | 'ADMIN_RECALCULATION'
  | 'SCHEDULED_RECALCULATION';

export type SafeRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists'
  | 'in'
  | 'not_in'
  | 'is_true'
  | 'is_false'
  // Uppercase legacy aliases for full backwards compatibility
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'EXISTS'
  | 'NOT_EXISTS'
  | 'IN'
  | 'NOT_IN'
  | 'IS_TRUE'
  | 'IS_FALSE';

export type RuleCategory =
  | 'VERIFICATION'
  | 'WEBSITE'
  | 'CONTACTABILITY'
  | 'SOCIAL'
  | 'BUSINESS_STRENGTH'
  | 'FRESHNESS'
  | 'GENERAL';

export interface StructuredAtomicCondition {
  field: string;
  operator: string;
  value?: unknown;
  targetValue?: unknown;
}

export interface StructuredRuleCondition {
  field?: string;
  operator?: string;
  value?: unknown;
  targetValue?: unknown;
  all?: StructuredAtomicCondition[];
  any?: StructuredAtomicCondition[];
}

export interface ScoringRuleDefinition {
  id: string;
  code: string;
  key?: string;
  name: string;
  nameEn: string;
  description?: string | null;
  category?: RuleCategory | string;
  ruleGroup?: string | null;
  weight: number;
  points?: number;
  priority?: number;
  sortOrder?: number;
  enabled: boolean;
  field: string;
  operator: string;
  targetValue: string;
  condition?: StructuredRuleCondition | Record<string, unknown> | null;
  conditions?: StructuredRuleCondition | Record<string, unknown> | null;
  version?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface LeadScorableFields {
  id?: string;
  businessName?: string | null;
  isVerified?: boolean | null;
  websiteStatus?: WebsiteQualityState | 'GOOD_WEBSITE' | 'MISSING' | null;
  website?: string | null;
  normalizedDomain?: string | null;
  websiteAnalysis?: Partial<WebsiteAnalysisResult> | Record<string, unknown> | null;
  hasFacebook?: boolean | null;
  facebook?: string | null;
  hasInstagram?: boolean | null;
  instagram?: string | null;
  hasPhone?: boolean | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  hasEmail?: boolean | null;
  email?: string | null;
  normalizedEmail?: string | null;
  branchCount?: number | null;
  reviewCount?: number | null;
  rating?: number | null;
  isRecentlyActive?: boolean | null;
  category?: string | null;
  city?: string | null;
  governorate?: string | null;
  area?: string | null;
  estimatedBudget?: number | null;
  source?: string | null;
  sourceList?: string[] | null;
  sourceVerified?: boolean | null;
  lastVerifiedAt?: Date | string | null;
  // Optional nested/alias signals for flexible test and collector inputs
  noWebsite?: boolean | null;
  poorWebsite?: boolean | null;
  goodWebsite?: boolean | null;
}

export interface ClassificationThresholds {
  coldMax: number;
  warmMin: number;
  warmMax: number;
  hotMin: number;
  hotMax: number;
  premiumMin: number;
}

export interface NormalizationBounds {
  minScore: number;
  maxScore: number;
}

export interface AppliedScoringRule {
  ruleId: string;
  code: string;
  ruleKey: string;
  name: string;
  nameEn: string;
  label: string;
  weight: number;
  points: number;
  category: string;
  ruleGroup: string | null;
}

export type RuleEvaluationOutcome =
  | 'APPLIED'
  | 'NOT_MATCHED'
  | 'UNKNOWN_DATA'
  | 'SUPERSEDED_BY_GROUP'
  | 'DUPLICATE_RULE_SKIPPED'
  | 'DISABLED';

export interface EvaluatedRuleRecord {
  ruleId: string;
  ruleKey: string;
  code: string;
  label: string;
  labelAr: string;
  points: number;
  pointsAwarded: number;
  priority: number;
  category: string;
  ruleGroup: string | null;
  applied: boolean;
  outcome: RuleEvaluationOutcome;
  reason: string;
}

export interface ScoreReasonItem {
  ruleId: string;
  ruleKey: string;
  code: string;
  label: string;
  labelAr: string;
  points: number;
  category: string;
  ruleGroup: string | null;
}

export interface ScoreExplanationData {
  score: number;
  rawScore: number;
  classification: LeadTemperatureBand;
  scoringVersion: string;
  reasons: ScoreReasonItem[];
  evaluatedRules: EvaluatedRuleRecord[];
  summary: string;
}

export interface LeadScoringOptions {
  scoringVersion?: string;
  thresholds?: Partial<ClassificationThresholds>;
  bounds?: Partial<NormalizationBounds>;
  calculatedAt?: Date | string;
}

export interface LeadScoringResult {
  rawScore: number;
  normalizedScore: number;
  score: number;
  temperature: LeadTemperatureBand;
  classification: LeadTemperatureBand;
  qualificationReasons: string[];
  qualificationRules: AppliedScoringRule[];
  appliedRules: AppliedScoringRule[];
  evaluatedRules: EvaluatedRuleRecord[];
  explanation: ScoreExplanationData;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  scoringVersion: string;
  calculatedAt: string;
}

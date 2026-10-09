import {
  FreshnessState,
  LeadAvailabilityStatus,
  MatchingRuleCategory,
  QualityStatus,
  RequiresVerificationMatchPolicy,
  ServiceMatchMode,
  SubscriptionStatus,
  UnknownDataPolicy,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';

export type {
  MatchingRuleCategory,
  RequiresVerificationMatchPolicy,
  ServiceMatchMode,
  UnknownDataPolicy,
};

export type CanonicalServiceCode =
  | 'WEBSITE_DEVELOPMENT'
  | 'WEBSITE_REDESIGN'
  | 'ECOMMERCE'
  | 'LANDING_PAGE'
  | 'WEB_APP'
  | 'MOBILE_APP'
  | 'SEO'
  | 'MAINTENANCE'
  | 'UI_UX'
  | 'CUSTOM_SOFTWARE'
  | 'BOOKING_SYSTEM';

export type CanonicalNicheCode =
  | 'DENTAL_CLINIC'
  | 'MEDICAL'
  | 'PHARMACY'
  | 'RESTAURANT'
  | 'REAL_ESTATE'
  | 'EDUCATION'
  | 'RETAIL'
  | 'BEAUTY'
  | 'AUTOMOTIVE'
  | 'GYM'
  | 'LAW_FIRM'
  | 'OTHER';

export type CanonicalProjectLeadType =
  | 'NEW_WEBSITE'
  | 'WEBSITE_REDESIGN'
  | 'ECOMMERCE'
  | 'LANDING_PAGE'
  | 'WEBSITE_MAINTENANCE'
  | 'CUSTOM_SYSTEM';

export type HardFailureCode =
  | 'SERVICE_NOT_SUPPORTED'
  | 'NICHE_EXCLUDED'
  | 'NICHE_NOT_SUPPORTED'
  | 'LOCATION_NOT_SUPPORTED'
  | 'LOCATION_EXCLUDED'
  | 'BUDGET_INCOMPATIBLE'
  | 'LEAD_NOT_SALEABLE'
  | 'LEAD_INVALID'
  | 'LEAD_DUPLICATE'
  | 'LEAD_CLOSED'
  | 'LEAD_STALE'
  | 'LEAD_REQUIRES_VERIFICATION'
  | 'DEVELOPER_INACTIVE'
  | 'DEVELOPER_SUSPENDED'
  | 'DEVELOPER_NOT_VERIFIED'
  | 'PLAN_NOT_ELIGIBLE'
  | 'CAPACITY_LIMIT_REACHED'
  | 'PROFILE_INCOMPLETE'
  | 'LEAD_TYPE_NOT_SUPPORTED'
  | 'LEAD_TYPE_EXCLUDED';

export type LocationMatchTier =
  | 'EXACT_CITY'
  | 'GOVERNORATE'
  | 'SERVICE_AREA'
  | 'UNKNOWN_ALLOWED'
  | 'NONE';

export interface DeveloperMatchingProfileInput {
  id?: string;
  userId?: string;
  developerId?: string;
  companyName?: string | null;
  services?: string[];
  preferredServices?: string[];
  excludedServices?: string[];
  disabledServices?: string[];
  locations?: string[];
  supportedGovernorates?: string[];
  supportedCities?: string[];
  supportedDistricts?: string[];
  preferredCities?: string[];
  excludedLocations?: string[];
  allLocationsMode?: boolean;
  niches?: string[];
  preferredNiches?: string[];
  excludedNiches?: string[];
  allNichesMode?: boolean;
  leadPreferences?: string[];
  supportedLeadTypes?: string[];
  preferredLeadTypes?: string[];
  excludedLeadTypes?: string[];
  minBudget?: number;
  maxBudget?: number | null;
  minProjectBudget?: number;
  maxProjectBudget?: number | null;
  preferredMinBudget?: number | null;
  preferredMaxBudget?: number | null;
  budgetCurrency?: string;
  budgetRange?: string;
  leadType?: string; // 'BOTH' | 'EXCLUSIVE' | 'SHARED' | canonical project lead types
  isActive?: boolean;
  isAcceptingLeads?: boolean;
  leadReceivingDisabled?: boolean;
  isVerified?: boolean;
  isComplete?: boolean;
  maxActiveLeads?: number | null;
}

export interface DeveloperPlanEligibilityInput {
  id?: string;
  slug?: string;
  name?: string;
  nameEn?: string;
  allowsExclusive?: boolean;
  maxConcurrentClaims?: number;
  isActive?: boolean;
  supportedServices?: string[];
  supportedLeadTypes?: string[];
  maxCities?: number | null;
  maxNiches?: number | null;
  allowedLeadTiers?: string[];
}

export interface DeveloperSubscriptionInput {
  id?: string;
  status?: SubscriptionStatus | string;
  credits?: number;
  totalCreditsGranted?: number;
  creditsUsed?: number;
  currentPeriodEnd?: Date | string | null;
  plan?: DeveloperPlanEligibilityInput | null;
}

export interface DeveloperMatchingContext {
  developerId?: string;
  userId?: string;
  name?: string;
  email?: string;
  role?: 'DEVELOPER' | 'ADMIN';
  userStatus?: UserStatus | string;
  status?: UserStatus | string;
  suspended?: boolean;
  inactive?: boolean;
  activeClaimsCount?: number;
  requireSubscription?: boolean;
  profile?: DeveloperMatchingProfileInput | null;
  subscription?: DeveloperSubscriptionInput | null;
  // Direct profile fields also supported at top level for unit testing ergonomics
  services?: string[];
  preferredServices?: string[];
  excludedServices?: string[];
  disabledServices?: string[];
  locations?: string[];
  supportedGovernorates?: string[];
  supportedCities?: string[];
  supportedDistricts?: string[];
  preferredCities?: string[];
  excludedLocations?: string[];
  allLocationsMode?: boolean;
  niches?: string[];
  preferredNiches?: string[];
  excludedNiches?: string[];
  allNichesMode?: boolean;
  leadPreferences?: string[];
  supportedLeadTypes?: string[];
  preferredLeadTypes?: string[];
  excludedLeadTypes?: string[];
  minBudget?: number;
  maxBudget?: number | null;
  minProjectBudget?: number;
  maxProjectBudget?: number | null;
  preferredMinBudget?: number | null;
  preferredMaxBudget?: number | null;
  budgetCurrency?: string;
  budgetRange?: string;
  leadType?: string;
  isActive?: boolean;
  isAcceptingLeads?: boolean;
  leadReceivingDisabled?: boolean;
  isVerified?: boolean;
  isComplete?: boolean;
  maxActiveLeads?: number | null;
}

export interface MatchableLeadInput {
  id: string;
  businessName?: string;
  category: string;
  niche?: string;
  governorate: string;
  city: string;
  area?: string | null;
  district?: string | null;
  website?: string | null;
  websiteStatus?: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN' | string;
  websiteAnalysis?: unknown;
  requiredService?: string | null;
  requiredServices?: string[];
  projectLeadType?: string | null;
  estimatedBudget?: number | null;
  minBudget?: number | null;
  maxBudget?: number | null;
  budgetCurrency?: string | null;
  budgetType?: 'ESTIMATED' | 'FIXED' | 'RANGE' | 'UNKNOWN' | string | null;
  leadType?: 'SHARED' | 'EXCLUSIVE' | string;
  exclusive?: boolean;
  maxPurchasers?: number;
  currentPurchasers?: number;
  score?: number;
  opportunityScore?: number;
  temperature?: 'COLD' | 'WARM' | 'HOT' | 'PREMIUM' | string;
  qualityScore?: number;
  qualityStatus?: QualityStatus | string;
  freshnessStatus?: FreshnessState | string;
  freshness?: FreshnessState | string;
  verificationStatus?: VerificationStatus | string;
  saleabilityStatus?: LeadAvailabilityStatus | string;
  status?: LeadAvailabilityStatus | string;
  businessStatus?: string;
  isCanonical?: boolean;
  mergedIntoLeadId?: string | null;
  hasPhone?: boolean;
  hasEmail?: boolean;
  phoneValidationStatus?: string;
  emailValidationStatus?: string;
  websiteVerificationState?: string;
  qualityFlags?: string[];
  claimedDeveloperIds?: string[];
  lastVerifiedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface MatchingConfigData {
  currentVersion: string;
  versionNumber: number;
  serviceMatchMode: ServiceMatchMode | 'ALL_REQUIRED' | 'ANY_REQUIRED';
  unknownLocationPolicy: UnknownDataPolicy | 'ALLOW_WITH_PENALTY' | 'REQUIRE_VERIFICATION' | 'FAIL';
  unknownBudgetPolicy: UnknownDataPolicy | 'ALLOW_WITH_PENALTY' | 'REQUIRE_VERIFICATION' | 'FAIL';
  requiresVerificationPolicy:
    | RequiresVerificationMatchPolicy
    | 'EXCLUDE'
    | 'VERIFIED_DEVELOPERS_ONLY'
    | 'INCLUDE_WITH_WARNING';
  budgetHardRequirement: boolean;
  requireActiveSubscription: boolean;
  requireDeveloperVerified: boolean;
  minMatchStrength: number;
  maxMatchStrength: number;
  unknownLocationPenalty: number;
  unknownBudgetPenalty: number;
  minSaleableQualityScore: number;
}

export interface MatchingRuleCondition {
  field?: string;
  operator?: string;
  value?: unknown;
  targetValue?: unknown;
  all?: Array<{
    field: string;
    operator: string;
    value?: unknown;
    targetValue?: unknown;
  }>;
  any?: Array<{
    field: string;
    operator: string;
    value?: unknown;
    targetValue?: unknown;
  }>;
}

export interface MatchingRuleDefinition {
  id: string;
  key: string;
  name: string;
  nameEn: string;
  description?: string | null;
  category: MatchingRuleCategory | string;
  ruleGroup?: string | null;
  points: number;
  priority: number;
  enabled: boolean;
  version: string;
  condition: MatchingRuleCondition | Record<string, unknown>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface MatchedCriterion {
  key: string;
  category: MatchingRuleCategory | string;
  reason: string;
  reasonAr: string;
  points: number;
}

export interface FailedCriterion {
  key: string;
  category: MatchingRuleCategory | string;
  reason: string;
  reasonAr: string;
  points: number;
  outcome?: 'NOT_MATCHED' | 'UNKNOWN_DATA' | 'SUPERSEDED_BY_GROUP' | 'DISABLED';
}

export interface HardFailureItem {
  key: HardFailureCode | string;
  subCode?: HardFailureCode | string;
  category: string;
  reason: string;
  reasonAr: string;
}

export interface MatchWarningItem {
  key: string;
  reason: string;
  reasonAr: string;
}

export interface MatchExplanation {
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  items: Array<{
    dimension: string;
    label: string;
    labelAr: string;
    value: string;
    valueAr: string;
    points?: number;
  }>;
  whyMatched: string[];
  whyMatchedAr: string[];
  warnings: string[];
  warningsAr: string[];
  hardFailures: string[];
  hardFailuresAr: string[];
}

export interface HardEligibilityCheckRecord {
  dimension:
    | 'DEVELOPER_STATUS'
    | 'PROFILE_COMPLETENESS'
    | 'SUBSCRIPTION_PLAN'
    | 'LEAD_QUALITY_GATE'
    | 'FRESHNESS'
    | 'SERVICE'
    | 'NICHE'
    | 'LOCATION'
    | 'BUDGET'
    | 'LEAD_TYPE';
  status: 'PASS' | 'FAIL' | 'WARN';
  code: string;
  leadValue: string;
  developerPreference: string;
  reason: string;
  reasonAr: string;
}

export interface MatchResult {
  leadId: string;
  developerId: string;
  eligible: boolean;
  rank: number | null;
  matchStrength: number;
  rawMatchPoints: number;
  matchVersion: string;
  matchedCriteria: MatchedCriterion[];
  failedCriteria: FailedCriterion[];
  hardFailures: HardFailureItem[];
  warnings: MatchWarningItem[];
  opportunityScore: number;
  qualityScore: number;
  freshness: string;
  explanation: MatchExplanation;
  calculatedAt: string;
  // Backwards-compatible properties for existing LeadMatchEvaluation consumers
  isMatch: boolean;
  matchPercentage: number;
}

export interface AdminMatchDebugReport {
  leadId: string;
  developerId: string;
  leadData: {
    id: string;
    businessName: string;
    category: string;
    normalizedNiche: string;
    requiredServices: string[];
    projectLeadType: string;
    ownershipType: string;
    city: string;
    governorate: string;
    area: string | null;
    budgetInterval: { min: number | null; max: number | null; currency: string; type: string };
    opportunityScore: number;
    qualityScore: number;
    qualityStatus: string;
    freshness: string;
    verificationStatus: string;
    saleabilityStatus: string;
    isCanonical: boolean;
  };
  developerPreferences: {
    developerId: string;
    name: string;
    accountStatus: string;
    profileActive: boolean;
    acceptingLeads: boolean;
    isVerified: boolean;
    services: string[];
    preferredServices: string[];
    excludedServices: string[];
    niches: string[];
    preferredNiches: string[];
    excludedNiches: string[];
    allNichesMode: boolean;
    locations: string[];
    supportedCities: string[];
    supportedGovernorates: string[];
    supportedDistricts: string[];
    preferredCities: string[];
    excludedLocations: string[];
    allLocationsMode: boolean;
    budgetRange: { min: number; max: number | null; currency: string };
    leadTypePreference: string;
    supportedLeadTypes: string[];
    preferredLeadTypes: string[];
    excludedLeadTypes: string[];
    subscriptionStatus: string;
    planName: string;
    allowsExclusive: boolean;
  };
  hardEligibilityChecks: HardEligibilityCheckRecord[];
  passedChecks: HardEligibilityCheckRecord[];
  failedChecks: HardEligibilityCheckRecord[];
  appliedRules: MatchedCriterion[];
  unappliedRules: FailedCriterion[];
  matchPoints: number;
  finalMatchStrength: number;
  eligible: boolean;
  resultLabel: 'ELIGIBLE' | 'REJECTED';
  matchVersion: string;
  calculatedAt: string;
  matchResult: MatchResult;
}

export interface NoMatchDiagnostics {
  totalEvaluated: number;
  eligibleCount: number;
  rejectedCount: number;
  failureBreakdown: Record<string, number>;
  summary: string;
  summaryAr: string;
}

export interface MatchingEvaluationOptions {
  config?: Partial<MatchingConfigData>;
  rules?: MatchingRuleDefinition[];
  matchVersion?: string;
  calculatedAt?: Date | string;
}

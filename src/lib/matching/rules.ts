import {
  FailedCriterion,
  MatchedCriterion,
  MatchingConfigData,
  MatchingRuleCategory,
  MatchingRuleCondition,
  MatchingRuleDefinition,
} from './types';
import { HardEligibilityEvaluationResult } from './hard-eligibility';
import {
  getLeadTypeLabel,
  getNicheLabel,
  getServiceLabel,
} from './taxonomy';

export const DEFAULT_MATCHING_CONFIG: MatchingConfigData = {
  currentVersion: 'v1',
  versionNumber: 1,
  serviceMatchMode: 'ALL_REQUIRED',
  unknownLocationPolicy: 'ALLOW_WITH_PENALTY',
  unknownBudgetPolicy: 'ALLOW_WITH_PENALTY',
  requiresVerificationPolicy: 'EXCLUDE',
  budgetHardRequirement: true,
  requireActiveSubscription: false,
  requireDeveloperVerified: false,
  minMatchStrength: 0,
  maxMatchStrength: 100,
  unknownLocationPenalty: -5,
  unknownBudgetPenalty: -5,
  minSaleableQualityScore: 35,
};

export const VALID_MATCHING_CATEGORIES: ReadonlyArray<MatchingRuleCategory> = [
  'SERVICE',
  'NICHE',
  'LOCATION',
  'BUDGET',
  'LEAD_TYPE',
  'QUALITY',
  'FRESHNESS',
  'PREFERENCE',
  'PERFORMANCE',
];

export const VALID_MATCHING_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'contains',
  'exists',
] as const;

export const DEFAULT_MATCHING_RULES: MatchingRuleDefinition[] = [
  // 1. SERVICE RULES
  {
    id: 'rule-service-exact',
    key: 'SERVICE_EXACT_MATCH',
    name: 'تطابق الخدمة الأساسية المطلوبة',
    nameEn: 'Exact Primary Service Match',
    description: 'Developer directly offers the primary service required by the lead.',
    category: 'SERVICE',
    ruleGroup: 'service_primary',
    points: 25,
    priority: 10,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'matchedPrimaryService',
      operator: 'eq',
      value: true,
    },
  },
  {
    id: 'rule-service-secondary',
    key: 'SERVICE_SECONDARY_MATCH',
    name: 'تطابق خدمة ثانوية متوافقة',
    nameEn: 'Secondary / Compatible Service Match',
    description: 'Developer supports a compatible secondary service for the lead.',
    category: 'SERVICE',
    ruleGroup: 'service_primary',
    points: 15,
    priority: 20,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'serviceMatchTier',
      operator: 'eq',
      value: 'SECONDARY',
    },
  },
  {
    id: 'rule-service-multi',
    key: 'SERVICE_MULTI_MATCH_BONUS',
    name: 'مكافأة تغطية خدمات متعددة',
    nameEn: 'Multi-Service Coverage Bonus',
    description: 'Developer covers multiple services required or beneficial for the lead.',
    category: 'SERVICE',
    ruleGroup: null,
    points: 10,
    priority: 25,
    enabled: true,
    version: 'v1',
    condition: {
      any: [
        { field: 'serviceMatchTier', operator: 'eq', value: 'MULTI_ALL' },
        {
          field: 'matchedMultiService',
          operator: 'eq',
          value: true,
        },
      ],
    },
  },

  // 2. NICHE RULES
  {
    id: 'rule-niche-exact',
    key: 'NICHE_EXACT_MATCH',
    name: 'تطابق تام لتخصص النشاط التجاري',
    nameEn: 'Exact Niche Specialization Match',
    description: 'Developer explicitly specializes in the lead business niche.',
    category: 'NICHE',
    ruleGroup: 'niche_fit',
    points: 20,
    priority: 30,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'nicheMatchTier',
      operator: 'eq',
      value: 'EXACT_NICHE',
    },
  },
  {
    id: 'rule-niche-general',
    key: 'NICHE_GENERAL_MATCH',
    name: 'قبول عام لمجال النشاط التجاري',
    nameEn: 'General / All-Niches Acceptance Match',
    description: 'Developer accepts general business categories including this niche.',
    category: 'NICHE',
    ruleGroup: 'niche_fit',
    points: 8,
    priority: 40,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'nicheMatchTier',
      operator: 'eq',
      value: 'GENERAL_NICHE',
    },
  },

  // 3. LOCATION RULES
  {
    id: 'rule-location-city-exact',
    key: 'LOCATION_CITY_EXACT',
    name: 'تطابق مباشر للمدينة أو الحي',
    nameEn: 'Exact City / District Match',
    description: 'Developer explicitly serves the exact city or district of the lead.',
    category: 'LOCATION',
    ruleGroup: 'location_fit',
    points: 15,
    priority: 50,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'locationMatchTier',
      operator: 'eq',
      value: 'EXACT_CITY',
    },
  },
  {
    id: 'rule-location-governorate',
    key: 'LOCATION_GOVERNORATE_MATCH',
    name: 'تغطية على مستوى المحافظة',
    nameEn: 'Governorate Coverage Match',
    description: 'Developer covers the Egyptian governorate containing the lead city.',
    category: 'LOCATION',
    ruleGroup: 'location_fit',
    points: 10,
    priority: 60,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'locationMatchTier',
      operator: 'eq',
      value: 'GOVERNORATE',
    },
  },
  {
    id: 'rule-location-service-area',
    key: 'LOCATION_SERVICE_AREA_MATCH',
    name: 'تغطية عامة لجميع المحافظات / عن بُعد',
    nameEn: 'Broad Service Area / All-Egypt Match',
    description: 'Developer serves all Egyptian governorates remotely.',
    category: 'LOCATION',
    ruleGroup: 'location_fit',
    points: 5,
    priority: 70,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'locationMatchTier',
      operator: 'eq',
      value: 'SERVICE_AREA',
    },
  },
  {
    id: 'rule-location-unknown-penalty',
    key: 'LOCATION_UNKNOWN_PENALTY',
    name: 'خصم عدم تحديد الموقع الجغرافي',
    nameEn: 'Unknown Location Penalty',
    description: 'Penalty applied when lead location is unknown but permitted by policy.',
    category: 'LOCATION',
    ruleGroup: 'location_fit',
    points: -5,
    priority: 75,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'locationMatchTier',
      operator: 'eq',
      value: 'UNKNOWN_ALLOWED',
    },
  },

  // 4. BUDGET RULES
  {
    id: 'rule-budget-ideal',
    key: 'BUDGET_IDEAL_RANGE',
    name: 'تطابق مثالي للميزانية المتوقعة',
    nameEn: 'Ideal Budget Range Match',
    description: 'Lead budget falls comfortably within developer ideal project budget range.',
    category: 'BUDGET',
    ruleGroup: 'budget_fit',
    points: 15,
    priority: 80,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'budgetMatchTier',
      operator: 'eq',
      value: 'IDEAL_RANGE',
    },
  },
  {
    id: 'rule-budget-acceptable',
    key: 'BUDGET_ACCEPTABLE_RANGE',
    name: 'تقاطع مقبول لنطاق الميزانية',
    nameEn: 'Acceptable Budget Overlap Match',
    description: 'Lead budget interval overlaps with developer acceptable budget range.',
    category: 'BUDGET',
    ruleGroup: 'budget_fit',
    points: 8,
    priority: 90,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'budgetMatchTier',
      operator: 'eq',
      value: 'ACCEPTABLE_RANGE',
    },
  },
  {
    id: 'rule-budget-near',
    key: 'BUDGET_NEAR_RANGE',
    name: 'ميزانية قريبة من الحد الأدنى للمطور',
    nameEn: 'Near-Threshold Budget Adjustment',
    description: 'Lead budget is slightly outside developer preferred range under soft tolerance.',
    category: 'BUDGET',
    ruleGroup: 'budget_fit',
    points: -5,
    priority: 95,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'budgetMatchTier',
      operator: 'eq',
      value: 'NEAR_RANGE',
    },
  },
  {
    id: 'rule-budget-unknown-penalty',
    key: 'BUDGET_UNKNOWN_PENALTY',
    name: 'خصم عدم تحديد الميزانية',
    nameEn: 'Unknown Budget Penalty',
    description: 'Penalty applied when lead budget is unknown but permitted by policy.',
    category: 'BUDGET',
    ruleGroup: 'budget_fit',
    points: -5,
    priority: 98,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'budgetMatchTier',
      operator: 'eq',
      value: 'UNKNOWN_ALLOWED',
    },
  },

  // 5. LEAD TYPE RULES
  {
    id: 'rule-lead-type-exact',
    key: 'LEAD_TYPE_EXACT_MATCH',
    name: 'تطابق تام لنوع المشروع المفضل',
    nameEn: 'Exact Preferred Lead Type Match',
    description: 'Lead project type directly matches developer preferred lead types.',
    category: 'LEAD_TYPE',
    ruleGroup: 'lead_type_fit',
    points: 10,
    priority: 100,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'leadTypeMatchTier',
      operator: 'eq',
      value: 'EXACT_PREFERRED',
    },
  },
  {
    id: 'rule-lead-type-compatible',
    key: 'LEAD_TYPE_COMPATIBLE',
    name: 'توافق عام مع نوع المشروع',
    nameEn: 'Compatible Lead Type Match',
    description: 'Lead project and ownership type are compatible with developer profile.',
    category: 'LEAD_TYPE',
    ruleGroup: 'lead_type_fit',
    points: 5,
    priority: 110,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'leadTypeMatchTier',
      operator: 'eq',
      value: 'COMPATIBLE',
    },
  },

  // 6. QUALITY & FRESHNESS BOOSTS
  {
    id: 'rule-quality-verified-high',
    key: 'QUALITY_VERIFIED_HIGH',
    name: 'مكافأة عميل موثق عالي الجودة',
    nameEn: 'High Quality Verified Lead Boost',
    description: 'Lead is VERIFIED and has a Phase 3 quality score >= 80.',
    category: 'QUALITY',
    ruleGroup: 'quality_boost',
    points: 5,
    priority: 120,
    enabled: true,
    version: 'v1',
    condition: {
      all: [
        { field: 'leadQualityScore', operator: 'gte', value: 80 },
        { field: 'leadVerificationStatus', operator: 'eq', value: 'VERIFIED' },
      ],
    },
  },
  {
    id: 'rule-freshness-fresh',
    key: 'FRESHNESS_FRESH_BOOST',
    name: 'مكافأة حداثة بيانات العميل (FRESH)',
    nameEn: 'Fresh Lead Boost',
    description: 'Lead verification state is FRESH.',
    category: 'FRESHNESS',
    ruleGroup: 'freshness_boost',
    points: 5,
    priority: 130,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'leadFreshness',
      operator: 'eq',
      value: 'FRESH',
    },
  },
  {
    id: 'rule-freshness-aging',
    key: 'FRESHNESS_AGING_BOOST',
    name: 'نقاط حداثة متوسطة (RECENT / AGING)',
    nameEn: 'Recent / Aging Lead Freshness Points',
    description: 'Lead verification state is RECENT or AGING.',
    category: 'FRESHNESS',
    ruleGroup: 'freshness_boost',
    points: 2,
    priority: 140,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'leadFreshness',
      operator: 'in',
      value: ['AGING', 'RECENT', 'RECENTLY_VERIFIED'],
    },
  },

  // 7. PREFERENCE ALIGNMENT
  {
    id: 'rule-preference-priority',
    key: 'PREFERENCE_PRIORITY_MATCH',
    name: 'مكافأة أولوية تفضيلات المطور',
    nameEn: 'Developer Priority Preference Match',
    description: 'Lead matches developer explicit priority service, niche, or city preferences.',
    category: 'PREFERENCE',
    ruleGroup: null,
    points: 5,
    priority: 150,
    enabled: true,
    version: 'v1',
    condition: {
      field: 'hasPriorityPreferenceMatch',
      operator: 'eq',
      value: true,
    },
  },
];

export interface SoftEvaluationVariables extends Record<string, unknown> {
  leadPrimaryService: string;
  leadAllRequiredServices: string[];
  leadSecondaryServices: string[];
  serviceMatchTier: string;
  matchedPrimaryService: boolean;
  matchedSecondaryServicesCount: number;
  matchedMultiService: boolean;
  matchedPreferredService: boolean;
  leadNiche: string;
  nicheMatchTier: string;
  matchedPreferredNiche: boolean;
  leadCityAr: string;
  leadGovernorateAr: string;
  leadAreaAr: string | null;
  locationUnknown: boolean;
  locationMatchTier: string;
  matchedPreferredCity: boolean;
  leadBudgetMin: number | null;
  leadBudgetMax: number | null;
  leadBudgetCurrency: string;
  leadBudgetType: string;
  budgetUnknown: boolean;
  budgetMatchTier: string;
  leadProjectType: string;
  leadOwnershipType: string;
  leadTypeMatchTier: string;
  leadQualityScore: number;
  leadOpportunityScore: number;
  leadFreshness: string;
  leadVerificationStatus: string;
  leadSaleabilityStatus: string;
  hasPriorityPreferenceMatch: boolean;
}

export function buildSoftEvaluationVariables(
  hardEval: HardEligibilityEvaluationResult
): SoftEvaluationVariables {
  const f = hardEval.extractedFeatures;
  const matchedMultiService =
    f.serviceMatchTier === 'MULTI_ALL' ||
    (f.leadAllRequiredServices.length > 1 &&
      f.matchedPrimaryService &&
      f.matchedSecondaryServicesCount >= 1);
  const hasPriorityPreferenceMatch =
    f.matchedPreferredService || f.matchedPreferredNiche || f.matchedPreferredCity;

  return {
    ...f,
    matchedMultiService,
    hasPriorityPreferenceMatch,
  };
}

function evaluateSingleConditionClause(
  clause: { field?: string; operator?: string; value?: unknown; targetValue?: unknown },
  vars: Record<string, unknown>
): boolean {
  const field = clause.field;
  const operator = clause.operator;
  if (!field || !operator) return false;

  const actual = vars[field];
  const expected = clause.value !== undefined ? clause.value : clause.targetValue;

  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'not_in':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected);
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;
    case 'exists':
      return expected === false
        ? actual === null || actual === undefined || actual === ''
        : actual !== null && actual !== undefined && actual !== '';
    default:
      return false;
  }
}

/**
 * Pure deterministic condition evaluator.
 * Strictly forbids `eval()` or `new Function()`.
 */
export function evaluateRuleCondition(
  condition: MatchingRuleCondition | Record<string, unknown>,
  vars: Record<string, unknown>
): boolean {
  if (!condition || typeof condition !== 'object') return false;
  const cond = condition as MatchingRuleCondition;

  if (Array.isArray(cond.all) && cond.all.length > 0) {
    return cond.all.every((clause) => evaluateRuleCondition(clause, vars));
  }

  if (Array.isArray(cond.any) && cond.any.length > 0) {
    return cond.any.some((clause) => evaluateRuleCondition(clause, vars));
  }

  return evaluateSingleConditionClause(cond, vars);
}

function formatCriterionReasons(
  rule: MatchingRuleDefinition,
  vars: SoftEvaluationVariables,
  matched: boolean
): { reason: string; reasonAr: string } {
  const srvLabel = getServiceLabel(vars.leadPrimaryService);
  const nicheLabel = getNicheLabel(vars.leadNiche);
  const ltLabel = getLeadTypeLabel(vars.leadProjectType);

  switch (rule.key) {
    case 'SERVICE_EXACT_MATCH':
      return matched
        ? {
            reason: `Developer directly offers required primary service: ${srvLabel.en} (${vars.leadPrimaryService})`,
            reasonAr: `المطور يقدم الخدمة الأساسية المطلوبة مباشرة: ${srvLabel.ar}`,
          }
        : {
            reason: `Developer did not match primary service ${srvLabel.en} directly`,
            reasonAr: `لم تتطابق الخدمة الأساسية (${srvLabel.ar}) بشكل مباشر`,
          };
    case 'SERVICE_SECONDARY_MATCH':
      return matched
        ? {
            reason: `Developer supports a compatible secondary service for ${srvLabel.en}`,
            reasonAr: `المطور يدعم خدمة ثانوية متوافقة مع ${srvLabel.ar}`,
          }
        : {
            reason: 'Secondary service rule not applicable',
            reasonAr: 'قاعدة الخدمة الثانوية غير منطبقة',
          };
    case 'SERVICE_MULTI_MATCH_BONUS':
      return matched
        ? {
            reason: `Developer supports multiple required services (${vars.leadAllRequiredServices.join(', ')})`,
            reasonAr: `المطور يغطي خدمات متعددة مطلوبة للعميل (${vars.leadAllRequiredServices.join('، ')})`,
          }
        : {
            reason: 'Lead does not require multiple services or multi-service bonus not triggered',
            reasonAr: 'العميل لا يتطلب خدمات متعددة إضافية',
          };
    case 'NICHE_EXACT_MATCH':
      return matched
        ? {
            reason: `Developer specializes in lead niche: ${nicheLabel.en} (${vars.leadNiche})`,
            reasonAr: `المطور متخصص في نشاط العميل: ${nicheLabel.ar}`,
          }
        : {
            reason: `Developer does not have explicit specialization in ${nicheLabel.en}`,
            reasonAr: `المطور غير متخصص بشكل حصري في ${nicheLabel.ar}`,
          };
    case 'NICHE_GENERAL_MATCH':
      return matched
        ? {
            reason: `Developer accepts all general business niches (${nicheLabel.en})`,
            reasonAr: `المطور يقبل جميع المجالات التجارية العامة (${nicheLabel.ar})`,
          }
        : {
            reason: 'General niche rule superseded or not applicable',
            reasonAr: 'قاعدة القبول العام للمجالات غير منطبقة',
          };
    case 'LOCATION_CITY_EXACT':
      return matched
        ? {
            reason: `Developer directly covers lead city/district: ${vars.leadCityAr || vars.leadAreaAr}`,
            reasonAr: `المطور يغطي مدينة/منطقة العميل مباشرة: ${vars.leadAreaAr || vars.leadCityAr}`,
          }
        : {
            reason: `Developer does not have exact city match for ${vars.leadCityAr || 'lead city'}`,
            reasonAr: `لا يوجد تطابق مباشر على مستوى المدينة (${vars.leadCityAr || 'غير محدد'})`,
          };
    case 'LOCATION_GOVERNORATE_MATCH':
      return matched
        ? {
            reason: `Developer covers lead governorate: ${vars.leadGovernorateAr}`,
            reasonAr: `المطور يغطي محافظة العميل: ${vars.leadGovernorateAr}`,
          }
        : {
            reason: 'Governorate level match superseded or not applicable',
            reasonAr: 'تطابق المحافظة غير منطبق',
          };
    case 'LOCATION_SERVICE_AREA_MATCH':
      return matched
        ? {
            reason: 'Developer covers lead via broad All-Egypt / remote service area',
            reasonAr: 'المطور يغطي العميل ضمن نطاق الخدمة الشامل لجميع المحافظات',
          }
        : {
            reason: 'Broad service area rule not applicable',
            reasonAr: 'نطاق الخدمة العام غير منطبق',
          };
    case 'BUDGET_IDEAL_RANGE':
      return matched
        ? {
            reason: `Lead budget (${vars.leadBudgetMin}-${vars.leadBudgetMax} ${vars.leadBudgetCurrency}) fits within developer ideal range`,
            reasonAr: `ميزانية العميل (${vars.leadBudgetMin}-${vars.leadBudgetMax} ${vars.leadBudgetCurrency}) تقع ضمن النطاق المثالي للمطور`,
          }
        : {
            reason: 'Lead budget is not within ideal budget range',
            reasonAr: 'ميزانية العميل ليست ضمن النطاق المثالي الكامل',
          };
    case 'BUDGET_ACCEPTABLE_RANGE':
      return matched
        ? {
            reason: `Lead budget (${vars.leadBudgetMin}-${vars.leadBudgetMax} ${vars.leadBudgetCurrency}) overlaps developer acceptable range`,
            reasonAr: `ميزانية العميل (${vars.leadBudgetMin}-${vars.leadBudgetMax} ${vars.leadBudgetCurrency}) تتقاطع مع النطاق المقبول للمطور`,
          }
        : {
            reason: 'Acceptable budget overlap rule not applicable',
            reasonAr: 'تقاطع الميزانية الجزئي غير منطبق',
          };
    case 'LEAD_TYPE_EXACT_MATCH':
      return matched
        ? {
            reason: `Lead project type matches developer preferred type: ${ltLabel.en} (${vars.leadProjectType})`,
            reasonAr: `نوع المشروع يتطابق مع تفضيلات المطور: ${ltLabel.ar}`,
          }
        : {
            reason: `Developer did not list ${ltLabel.en} as an explicit priority lead type`,
            reasonAr: `لم يحدد المطور (${ltLabel.ar}) كنوع مشروع ذي أولوية صريحة`,
          };
    case 'LEAD_TYPE_COMPATIBLE':
      return matched
        ? {
            reason: `Lead type (${ltLabel.en} / ${vars.leadOwnershipType}) is compatible with developer profile`,
            reasonAr: `نوع المشروع (${ltLabel.ar} / ${vars.leadOwnershipType}) متوافق مع ملف المطور`,
          }
        : {
            reason: 'Compatible lead type rule superseded by exact lead type match',
            reasonAr: 'تم استبدال قاعدة التوافق العام بتطابق النوع المباشر',
          };
    case 'QUALITY_VERIFIED_HIGH':
      return matched
        ? {
            reason: `Verified high-quality lead boost (qualityScore: ${vars.leadQualityScore})`,
            reasonAr: `مكافأة عميل موثق عالي الجودة (درجة الجودة: ${vars.leadQualityScore})`,
          }
        : {
            reason: `Lead quality (${vars.leadQualityScore}) or verification (${vars.leadVerificationStatus}) below high-quality boost threshold`,
            reasonAr: `درجة الجودة (${vars.leadQualityScore}) أقل من حد مكافأة الجودة الفائقة (80+)`,
          };
    case 'FRESHNESS_FRESH_BOOST':
      return matched
        ? {
            reason: 'Lead verification state is FRESH (+5 freshness boost)',
            reasonAr: 'بيانات العميل محدثة وحديثة جداً (FRESH)',
          }
        : {
            reason: `Lead freshness is ${vars.leadFreshness} (not FRESH)`,
            reasonAr: `حداثة بيانات العميل هي ${vars.leadFreshness} وليست FRESH`,
          };
    case 'FRESHNESS_AGING_BOOST':
      return matched
        ? {
            reason: 'Lead verification state is AGING (+2 freshness points)',
            reasonAr: 'بيانات العميل بحداثة متوسطة (AGING)',
          }
        : {
            reason: 'Aging freshness rule not applicable',
            reasonAr: 'قاعدة الحداثة المتوسطة غير منطبقة',
          };
    case 'PREFERENCE_PRIORITY_MATCH':
      return matched
        ? {
            reason: 'Lead matches developer explicit priority preferences (preferred service/niche/city)',
            reasonAr: 'العميل يتوافق مع التفضيلات ذات الأولوية القصوى للمطور',
          }
        : {
            reason: 'No additional explicit priority preference boost triggered',
            reasonAr: 'لم يتم تفعيل مكافأة التفضيلات الإضافية',
          };
    default:
      return {
        reason: rule.description || rule.nameEn || rule.name,
        reasonAr: rule.name || rule.nameEn,
      };
  }
}

export interface SoftScoringEvaluationResult {
  rawMatchPoints: number;
  matchStrength: number;
  matchedCriteria: MatchedCriterion[];
  failedCriteria: FailedCriterion[];
}

/**
 * Evaluates Layer B — Soft Matching Rules deterministically.
 * Rules are sorted by `(priority ASC, key ASC)`.
 * Within each non-null `ruleGroup`, at most one rule can fire (the highest-priority matching rule).
 */
export function evaluateSoftMatchingRules(
  hardEval: HardEligibilityEvaluationResult,
  rules: MatchingRuleDefinition[],
  config: MatchingConfigData
): SoftScoringEvaluationResult {
  const vars = buildSoftEvaluationVariables(hardEval);
  const matchedCriteria: MatchedCriterion[] = [];
  const failedCriteria: FailedCriterion[] = [];

  const sortedRules = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.key.localeCompare(b.key);
  });

  const satisfiedGroups = new Set<string>();
  let rawPoints = 0;

  for (const rule of sortedRules) {
    if (!rule.enabled) {
      const reasons = formatCriterionReasons(rule, vars, false);
      failedCriteria.push({
        key: rule.key,
        category: rule.category,
        reason: `${reasons.reason} (Rule Disabled)`,
        reasonAr: `${reasons.reasonAr} (قاعدة معطلة)`,
        points: 0,
        outcome: 'DISABLED',
      });
      continue;
    }

    if (rule.ruleGroup && satisfiedGroups.has(rule.ruleGroup)) {
      const reasons = formatCriterionReasons(rule, vars, false);
      failedCriteria.push({
        key: rule.key,
        category: rule.category,
        reason: reasons.reason,
        reasonAr: reasons.reasonAr,
        points: 0,
        outcome: 'SUPERSEDED_BY_GROUP',
      });
      continue;
    }

    const isMatched = evaluateRuleCondition(rule.condition, vars);
    const reasons = formatCriterionReasons(rule, vars, isMatched);

    if (isMatched) {
      let effectivePoints = rule.points;
      if (rule.key === 'LOCATION_UNKNOWN_PENALTY') {
        effectivePoints = config.unknownLocationPenalty;
      } else if (rule.key === 'BUDGET_UNKNOWN_PENALTY') {
        effectivePoints = config.unknownBudgetPenalty;
      }

      rawPoints += effectivePoints;
      if (rule.ruleGroup) {
        satisfiedGroups.add(rule.ruleGroup);
      }

      matchedCriteria.push({
        key: rule.key,
        category: rule.category,
        reason: reasons.reason,
        reasonAr: reasons.reasonAr,
        points: effectivePoints,
      });
    } else {
      failedCriteria.push({
        key: rule.key,
        category: rule.category,
        reason: reasons.reason,
        reasonAr: reasons.reasonAr,
        points: 0,
        outcome:
          (rule.category === 'LOCATION' && vars.locationUnknown) ||
          (rule.category === 'BUDGET' && vars.budgetUnknown)
            ? 'UNKNOWN_DATA'
            : 'NOT_MATCHED',
      });
    }
  }

  const clampedStrength = hardEval.eligible
    ? Math.max(
        config.minMatchStrength,
        Math.min(config.maxMatchStrength, Math.round(rawPoints))
      )
    : 0;

  return {
    rawMatchPoints: hardEval.eligible ? Math.round(rawPoints) : 0,
    matchStrength: clampedStrength,
    matchedCriteria: hardEval.eligible ? matchedCriteria : [],
    failedCriteria,
  };
}

/**
 * Validates a MatchingRule create/update payload.
 */
export function validateMatchingRulePayload(
  payload: Record<string, unknown>,
  isPartial = false
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isPartial || payload.key !== undefined) {
    if (typeof payload.key !== 'string' || payload.key.trim().length < 2) {
      errors.push('key must be a non-empty string (at least 2 characters)');
    }
  }

  if (!isPartial || payload.name !== undefined) {
    if (typeof payload.name !== 'string' || payload.name.trim().length < 2) {
      errors.push('name must be a non-empty string');
    }
  }

  if (!isPartial || payload.category !== undefined) {
    const cat = String(payload.category || '').toUpperCase() as MatchingRuleCategory;
    if (!VALID_MATCHING_CATEGORIES.includes(cat)) {
      errors.push(
        `category must be one of: ${VALID_MATCHING_CATEGORIES.join(', ')}`
      );
    }
  }

  if (!isPartial || payload.points !== undefined) {
    const pts = Number(payload.points);
    if (!Number.isFinite(pts) || pts < -100 || pts > 100) {
      errors.push('points must be a finite integer between -100 and 100');
    }
  }

  if (payload.priority !== undefined) {
    const prio = Number(payload.priority);
    if (!Number.isFinite(prio) || prio < 0 || prio > 10000) {
      errors.push('priority must be a finite number between 0 and 10000');
    }
  }

  if (!isPartial || payload.condition !== undefined) {
    if (!payload.condition || typeof payload.condition !== 'object' || Array.isArray(payload.condition)) {
      errors.push('condition must be a structured JSON object');
    } else {
      const validateClause = (c: MatchingRuleCondition) => {
        if (!c || typeof c !== 'object' || Array.isArray(c)) {
          errors.push('condition clause must be an object');
          return;
        }
        if (Array.isArray(c.all) && c.all.length > 0) {
          c.all.forEach(validateClause);
          return;
        }
        if (Array.isArray(c.any) && c.any.length > 0) {
          c.any.forEach(validateClause);
          return;
        }
        if (typeof c.field !== 'string' || !c.field.trim()) {
          errors.push('condition clause must include a non-empty field name');
        }
        if (
          typeof c.operator !== 'string' ||
          !(VALID_MATCHING_OPERATORS as readonly string[]).includes(c.operator)
        ) {
          errors.push(
            `condition operator must be one of: ${VALID_MATCHING_OPERATORS.join(', ')}`
          );
        }
      };
      validateClause(payload.condition as MatchingRuleCondition);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

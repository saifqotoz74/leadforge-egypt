import { LeadClassification } from './classification';
import { ScoreExplanation } from './explanation';
import { ScoreNormalizer } from './normalizer';
import { RuleEvaluator } from './rule-evaluator';
import {
  LeadScorableFields,
  LeadScoringOptions,
  LeadScoringResult,
  ScoringRuleDefinition,
} from './types';

export const DEFAULT_SCORING_RULES: ScoringRuleDefinition[] = [
  {
    id: 'rule-verified',
    code: 'BUSINESS_VERIFIED',
    key: 'BUSINESS_VERIFIED',
    name: 'النشاط التجاري موثق وموجود فعليًا',
    nameEn: 'Business verified',
    description: 'Verified active business profile (+20)',
    category: 'VERIFICATION',
    ruleGroup: 'business_verification',
    weight: 20,
    points: 20,
    priority: 1,
    sortOrder: 1,
    enabled: true,
    field: 'isVerified',
    operator: 'IS_TRUE',
    targetValue: 'true',
    condition: { field: 'business.verified', operator: 'equals', value: true },
    conditions: { field: 'isVerified', operator: 'IS_TRUE', targetValue: 'true' },
    version: 'v1',
  },
  {
    id: 'rule-no-website',
    code: 'NO_WEBSITE',
    key: 'NO_WEBSITE',
    name: 'لا يمتلك موقعًا إلكترونيًا',
    nameEn: 'No website',
    description: 'Business has no website (+30)',
    category: 'WEBSITE',
    ruleGroup: 'website_quality',
    weight: 30,
    points: 30,
    priority: 2,
    sortOrder: 2,
    enabled: true,
    field: 'websiteStatus',
    operator: 'EQUALS',
    targetValue: 'NO_WEBSITE',
    condition: { field: 'website.status', operator: 'equals', value: 'NO_WEBSITE' },
    conditions: { field: 'websiteStatus', operator: 'EQUALS', targetValue: 'NO_WEBSITE' },
    version: 'v1',
  },
  {
    id: 'rule-poor-website',
    code: 'POOR_WEBSITE',
    key: 'POOR_WEBSITE',
    name: 'يمتلك موقعًا قديمًا أو ضعيفًا تقنيًا',
    nameEn: 'Poor/old website',
    description: 'Business has an outdated, broken, or non-responsive website (+20)',
    category: 'WEBSITE',
    ruleGroup: 'website_quality',
    weight: 20,
    points: 20,
    priority: 3,
    sortOrder: 3,
    enabled: true,
    field: 'websiteStatus',
    operator: 'EQUALS',
    targetValue: 'POOR_WEBSITE',
    condition: { field: 'website.status', operator: 'equals', value: 'POOR_WEBSITE' },
    conditions: { field: 'websiteStatus', operator: 'EQUALS', targetValue: 'POOR_WEBSITE' },
    version: 'v1',
  },
  {
    id: 'rule-active-facebook',
    code: 'ACTIVE_FACEBOOK',
    key: 'ACTIVE_FACEBOOK',
    name: 'تواجد نشط على فيسبوك',
    nameEn: 'Active Facebook',
    description: 'Active Facebook business page exists (+10)',
    category: 'SOCIAL',
    ruleGroup: 'social_facebook',
    weight: 10,
    points: 10,
    priority: 4,
    sortOrder: 4,
    enabled: true,
    field: 'hasFacebook',
    operator: 'IS_TRUE',
    targetValue: 'true',
    condition: { field: 'social.facebook', operator: 'equals', value: true },
    conditions: { field: 'hasFacebook', operator: 'IS_TRUE', targetValue: 'true' },
    version: 'v1',
  },
  {
    id: 'rule-active-instagram',
    code: 'ACTIVE_INSTAGRAM',
    key: 'ACTIVE_INSTAGRAM',
    name: 'تواجد نشط على إنستجرام',
    nameEn: 'Active Instagram',
    description: 'Active Instagram business profile exists (+10)',
    category: 'SOCIAL',
    ruleGroup: 'social_instagram',
    weight: 10,
    points: 10,
    priority: 5,
    sortOrder: 5,
    enabled: true,
    field: 'hasInstagram',
    operator: 'IS_TRUE',
    targetValue: 'true',
    condition: { field: 'social.instagram', operator: 'equals', value: true },
    conditions: { field: 'hasInstagram', operator: 'IS_TRUE', targetValue: 'true' },
    version: 'v1',
  },
  {
    id: 'rule-phone-available',
    code: 'PHONE_AVAILABLE',
    key: 'PHONE_AVAILABLE',
    name: 'رقم الهاتف متاح للتواصل المباشر',
    nameEn: 'Phone available',
    description: 'Direct phone number available (+10)',
    category: 'CONTACTABILITY',
    ruleGroup: 'contact_phone',
    weight: 10,
    points: 10,
    priority: 6,
    sortOrder: 6,
    enabled: true,
    field: 'hasPhone',
    operator: 'IS_TRUE',
    targetValue: 'true',
    condition: { field: 'contact.hasPhone', operator: 'equals', value: true },
    conditions: { field: 'hasPhone', operator: 'IS_TRUE', targetValue: 'true' },
    version: 'v1',
  },
  {
    id: 'rule-email-available',
    code: 'EMAIL_AVAILABLE',
    key: 'EMAIL_AVAILABLE',
    name: 'البريد الإلكتروني متاح',
    nameEn: 'Email available',
    description: 'Business email address available (+5)',
    category: 'CONTACTABILITY',
    ruleGroup: 'contact_email',
    weight: 5,
    points: 5,
    priority: 7,
    sortOrder: 7,
    enabled: true,
    field: 'hasEmail',
    operator: 'IS_TRUE',
    targetValue: 'true',
    condition: { field: 'contact.hasEmail', operator: 'equals', value: true },
    conditions: { field: 'hasEmail', operator: 'IS_TRUE', targetValue: 'true' },
    version: 'v1',
  },
  {
    id: 'rule-multiple-branches',
    code: 'MULTIPLE_BRANCHES',
    key: 'MULTIPLE_BRANCHES',
    name: 'يمتلك أكثر من فرع',
    nameEn: 'Multiple branches',
    description: 'Business operates more than 1 branch (+10)',
    category: 'BUSINESS_STRENGTH',
    ruleGroup: 'branch_strength',
    weight: 10,
    points: 10,
    priority: 8,
    sortOrder: 8,
    enabled: true,
    field: 'branchCount',
    operator: 'GREATER_THAN',
    targetValue: '1',
    condition: { field: 'business.branches', operator: 'greater_than', value: 1 },
    conditions: { field: 'branchCount', operator: 'GREATER_THAN', targetValue: '1' },
    version: 'v1',
  },
  {
    id: 'rule-high-reviews',
    code: 'HIGH_REVIEW_COUNT',
    key: 'HIGH_REVIEW_COUNT',
    name: 'عدد تقييمات مرتفع على جوجل (50+ تقييم)',
    nameEn: 'High review count',
    description: 'Business has a high review count (>= 50 reviews) (+10)',
    category: 'BUSINESS_STRENGTH',
    ruleGroup: 'review_strength',
    weight: 10,
    points: 10,
    priority: 9,
    sortOrder: 9,
    enabled: true,
    field: 'reviewCount',
    operator: 'GREATER_THAN_OR_EQUAL',
    targetValue: '50',
    condition: { field: 'reviews.count', operator: 'greater_than_or_equal', value: 50 },
    conditions: { field: 'reviewCount', operator: 'GREATER_THAN_OR_EQUAL', targetValue: '50' },
    version: 'v1',
  },
  {
    id: 'rule-recently-active',
    code: 'RECENTLY_ACTIVE',
    key: 'RECENTLY_ACTIVE',
    name: 'نشط تجاريًا خلال الفترة الأخيرة',
    nameEn: 'Recently active',
    description: 'Business is recently active commercially (+10)',
    category: 'FRESHNESS',
    ruleGroup: 'activity_freshness',
    weight: 10,
    points: 10,
    priority: 10,
    sortOrder: 10,
    enabled: true,
    field: 'isRecentlyActive',
    operator: 'IS_TRUE',
    targetValue: 'true',
    condition: { field: 'business.recentlyActive', operator: 'equals', value: true },
    conditions: { field: 'isRecentlyActive', operator: 'IS_TRUE', targetValue: 'true' },
    version: 'v1',
  },
];

// Deterministic timestamp memoization for pure `calculateLeadScore` calls without explicit `calculatedAt`
const deterministicTimestampCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;

function resolveDeterministicTimestamp(
  lead: LeadScorableFields,
  scoringVersion: string,
  rawScore: number,
  appliedRuleKeys: string[],
  explicitCalculatedAt?: Date | string
): string {
  if (explicitCalculatedAt) {
    return typeof explicitCalculatedAt === 'string'
      ? explicitCalculatedAt
      : explicitCalculatedAt.toISOString();
  }
  let sig = `${scoringVersion}:${rawScore}:${appliedRuleKeys.join(',')}`;
  try {
    sig = JSON.stringify({ lead, scoringVersion, rawScore, appliedRuleKeys });
  } catch {
    // Fallback to primitive signature if lead has non-serializable properties
  }
  const cached = deterministicTimestampCache.get(sig);
  if (cached) return cached;

  const iso = new Date().toISOString();
  if (deterministicTimestampCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = deterministicTimestampCache.keys().next().value;
    if (firstKey) deterministicTimestampCache.delete(firstKey);
  }
  deterministicTimestampCache.set(sig, iso);
  return iso;
}

/**
 * Evaluates source & data confidence without multiplying or inflating points for multiple sources.
 */
export function evaluateLeadConfidence(lead: LeadScorableFields): 'HIGH' | 'MEDIUM' | 'LOW' {
  const hasPhone = Boolean(lead.hasPhone || (lead.phone && String(lead.phone).trim()));
  const hasEmail = Boolean(lead.hasEmail || (lead.email && String(lead.email).trim()));
  const hasSocial = Boolean(
    lead.hasFacebook ||
      lead.hasInstagram ||
      (lead.facebook && String(lead.facebook).trim()) ||
      (lead.instagram && String(lead.instagram).trim())
  );
  const reviewCount = typeof lead.reviewCount === 'number' ? lead.reviewCount : 0;
  const multiSourceCount = Array.isArray(lead.sourceList)
    ? new Set(lead.sourceList.filter(Boolean)).size
    : 1;

  if (lead.isVerified && hasPhone && (hasSocial || reviewCount >= 20 || multiSourceCount >= 2)) {
    return 'HIGH';
  }
  if (!hasPhone && !hasEmail) {
    return 'LOW';
  }
  return 'MEDIUM';
}

function resolveEffectiveScoringVersion(
  rules: ScoringRuleDefinition[],
  explicitVersion?: string
): string {
  if (explicitVersion && explicitVersion.trim()) {
    return explicitVersion.trim();
  }
  let maxVerNum = 1;
  let foundCustom = '';
  for (const r of rules) {
    if (r.version) {
      const match = String(r.version).match(/^v(\d+)$/i);
      if (match) {
        const num = Number(match[1]);
        if (num > maxVerNum) maxVerNum = num;
      } else {
        foundCustom = String(r.version);
      }
    }
  }
  if (foundCustom && maxVerNum === 1) return foundCustom;
  return `v${maxVerNum}`;
}

/**
 * ScoringEngine:
 * Central, pure, 100% deterministic rule-based scoring engine.
 */
export class ScoringEngine {
  static evaluate(
    lead: LeadScorableFields,
    rules: ScoringRuleDefinition[] = DEFAULT_SCORING_RULES,
    options?: LeadScoringOptions
  ): LeadScoringResult {
    const scoringVersion = resolveEffectiveScoringVersion(rules, options?.scoringVersion);

    const { rawScore, appliedRules, evaluatedRules } = RuleEvaluator.evaluateRules(lead, rules);

    const normalizedScore = ScoreNormalizer.normalize(rawScore, options?.bounds);
    const classification = LeadClassification.classify(normalizedScore, options?.thresholds);

    const { explanation, qualificationReasons } = ScoreExplanation.build({
      rawScore,
      normalizedScore,
      classification,
      scoringVersion,
      appliedRules,
      evaluatedRules,
    });

    const confidence = evaluateLeadConfidence(lead);
    const calculatedAt = resolveDeterministicTimestamp(
      lead,
      scoringVersion,
      rawScore,
      appliedRules.map((r) => r.ruleKey),
      options?.calculatedAt
    );

    return {
      rawScore,
      normalizedScore,
      score: normalizedScore,
      temperature: classification,
      classification,
      qualificationReasons,
      qualificationRules: appliedRules,
      appliedRules,
      evaluatedRules,
      explanation,
      confidence,
      scoringVersion,
      calculatedAt,
    };
  }
}

export function calculateLeadScore(
  lead: LeadScorableFields,
  rules: ScoringRuleDefinition[] = DEFAULT_SCORING_RULES,
  options?: LeadScoringOptions
): LeadScoringResult {
  return ScoringEngine.evaluate(lead, rules, options);
}

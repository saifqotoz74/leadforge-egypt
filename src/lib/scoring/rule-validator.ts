import { ScoringRuleDefinition, StructuredAtomicCondition, StructuredRuleCondition } from './types';

export const CANONICAL_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'contains',
  'not_contains',
  'exists',
  'not_exists',
  'in',
  'not_in',
  'is_true',
  'is_false',
] as const;

export type CanonicalOperator = (typeof CANONICAL_OPERATORS)[number];

const OPERATOR_LOOKUP: Record<string, CanonicalOperator> = {
  equals: 'equals',
  eq: 'equals',
  '==': 'equals',
  '===': 'equals',
  not_equals: 'not_equals',
  neq: 'not_equals',
  '!=': 'not_equals',
  '!==': 'not_equals',
  greater_than: 'greater_than',
  gt: 'greater_than',
  '>': 'greater_than',
  greater_than_or_equal: 'greater_than_or_equal',
  gte: 'greater_than_or_equal',
  '>=': 'greater_than_or_equal',
  less_than: 'less_than',
  lt: 'less_than',
  '<': 'less_than',
  less_than_or_equal: 'less_than_or_equal',
  lte: 'less_than_or_equal',
  '<=': 'less_than_or_equal',
  contains: 'contains',
  not_contains: 'not_contains',
  exists: 'exists',
  not_exists: 'not_exists',
  in: 'in',
  not_in: 'not_in',
  is_true: 'is_true',
  is_false: 'is_false',
};

export const ALLOWED_SCORABLE_FIELDS = new Set<string>([
  // Flat fields
  'isVerified',
  'websiteStatus',
  'website',
  'normalizedDomain',
  'hasFacebook',
  'facebook',
  'hasInstagram',
  'instagram',
  'hasPhone',
  'phone',
  'normalizedPhone',
  'hasEmail',
  'email',
  'normalizedEmail',
  'branchCount',
  'reviewCount',
  'rating',
  'isRecentlyActive',
  'category',
  'city',
  'governorate',
  'area',
  'estimatedBudget',
  'source',
  'sourceCount',
  'sourceVerified',
  'freshnessStatus',
  'daysSinceVerified',
  // Structured dot-notation fields (Phase 1 spec)
  'business.verified',
  'business.category',
  'business.city',
  'business.governorate',
  'business.recentlyActive',
  'business.active',
  'business.branches',
  'business.branchCount',
  'business.estimatedBudget',
  'source.verified',
  'source.count',
  'sources.count',
  'source.multiple',
  'website.status',
  'website.exists',
  'website.reachable',
  'website.isHttps',
  'website.https',
  'website.sslValid',
  'website.responseTimeMs',
  'website.slow',
  'website.hasMobileViewport',
  'website.mobileViewport',
  'website.hasResponsiveIndicators',
  'website.isOldBasicStructure',
  'website.poorStructure',
  'website.hasTitle',
  'website.hasMetaDescription',
  'website.weakMetadata',
  'website.domainStatus',
  'website.domainInactive',
  'website.opportunityScore',
  'contact.phoneExists',
  'contact.hasPhone',
  'contact.phoneVerified',
  'phone_verified',
  'phoneVerified',
  'contact.emailExists',
  'contact.hasEmail',
  'contact.emailVerified',
  'email_verified',
  'emailVerified',
  'business_verified',
  'noWebsite',
  'poorWebsite',
  'goodWebsite',
  'no_website',
  'poor_website',
  'good_website',
  'contact.socialExists',
  'social.exists',
  'social.facebook',
  'social.hasFacebook',
  'social.instagram',
  'social.hasInstagram',
  'social.active',
  'social.recentlyActive',
  'reviews.count',
  'reviews.rating',
  'freshness.status',
  'freshness.daysSinceVerified',
  'freshness.recentlyVerified',
  'freshness.stale',
]);

const UNSAFE_CODE_PATTERNS: RegExp[] = [
  /\beval\s*\(/i,
  /\bnew\s+Function\b/i,
  /\bFunction\s*\(/i,
  /\bsetTimeout\s*\(/i,
  /\bsetInterval\s*\(/i,
  /\bprocess\.env\b/i,
  /\brequire\s*\(/i,
  /\bimport\s*\(/i,
  /__proto__/i,
  /\bconstructor\b/i,
  /\bprototype\b/i,
  /<script\b/i,
  /javascript:/i,
  /\bDROP\s+TABLE\b/i,
  /\bUNION\s+SELECT\b/i,
  /;\s*--/,
];

export function containsUnsafeExecutablePattern(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return UNSAFE_CODE_PATTERNS.some((regex) => regex.test(serialized));
}

export function normalizeOperator(rawOperator?: string | null): CanonicalOperator | null {
  if (!rawOperator || typeof rawOperator !== 'string') return null;
  const trimmed = rawOperator.trim().toLowerCase();
  return OPERATOR_LOOKUP[trimmed] ?? null;
}

export function isValidScorableField(field?: string | null): boolean {
  if (!field || typeof field !== 'string') return false;
  const trimmed = field.trim();
  if (!trimmed || containsUnsafeExecutablePattern(trimmed)) return false;
  return ALLOWED_SCORABLE_FIELDS.has(trimmed);
}

export function inferRuleGroup(
  codeOrKey: string,
  field: string,
  explicitGroup?: string | null,
  isCompound = false
): string | null {
  if (explicitGroup !== undefined && explicitGroup !== null) {
    const trimmed = String(explicitGroup).trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const upperKey = (codeOrKey || '').toUpperCase();
  const cleanField = (field || '').trim();

  if (
    upperKey === 'NO_WEBSITE' ||
    upperKey === 'POOR_WEBSITE' ||
    upperKey === 'GOOD_WEBSITE' ||
    upperKey === 'HAS_WEBSITE' ||
    (!isCompound && (cleanField === 'websiteStatus' || cleanField === 'website.status'))
  ) {
    return 'website_quality';
  }
  if (upperKey === 'BUSINESS_VERIFIED') {
    return 'business_verification';
  }
  return null;
}

export function inferRuleCategory(codeOrKey: string, field: string, explicitCategory?: string | null): string {
  if (explicitCategory && String(explicitCategory).trim()) {
    return String(explicitCategory).trim().toUpperCase();
  }
  const upperKey = (codeOrKey || '').toUpperCase();
  const cleanField = (field || '').trim();

  if (cleanField.startsWith('website') || upperKey.includes('WEBSITE')) return 'WEBSITE';
  if (cleanField === 'isVerified' || cleanField.startsWith('business.verified') || cleanField.startsWith('source')) {
    return 'VERIFICATION';
  }
  if (cleanField.includes('Phone') || cleanField.includes('Email') || cleanField.startsWith('contact.')) {
    return 'CONTACTABILITY';
  }
  if (cleanField.includes('Facebook') || cleanField.includes('Instagram') || cleanField.startsWith('social.')) {
    return 'SOCIAL';
  }
  if (cleanField.includes('freshness') || cleanField === 'isRecentlyActive' || cleanField === 'daysSinceVerified') {
    return 'FRESHNESS';
  }
  if (cleanField.includes('review') || cleanField.includes('rating') || cleanField.includes('branch')) {
    return 'BUSINESS_STRENGTH';
  }
  return 'GENERAL';
}

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: {
    key: string;
    code: string;
    name: string;
    nameEn: string;
    description: string | null;
    category: string;
    ruleGroup: string | null;
    points: number;
    weight: number;
    priority: number;
    sortOrder: number;
    enabled: boolean;
    field: string;
    operator: string;
    targetValue: string;
    conditions: StructuredRuleCondition;
    version: string;
  };
}

function validateOperatorTargetValue(canonicalOp: CanonicalOperator, val: unknown, errors: string[]) {
  if (
    canonicalOp === 'greater_than' ||
    canonicalOp === 'greater_than_or_equal' ||
    canonicalOp === 'less_than' ||
    canonicalOp === 'less_than_or_equal'
  ) {
    const strVal = val !== undefined && val !== null ? String(val).trim() : '';
    const numVal = Number(strVal);
    if (!strVal || typeof val === 'boolean' || Number.isNaN(numVal) || !Number.isFinite(numVal)) {
      errors.push(`Numeric operator "${canonicalOp}" requires a valid finite number targetValue.`);
    }
  } else if (canonicalOp === 'in' || canonicalOp === 'not_in') {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        errors.push(`List operator "${canonicalOp}" requires a non-empty list of values.`);
      }
    } else {
      const strVal = val !== undefined && val !== null ? String(val).trim() : '';
      if (!strVal) {
        errors.push(`List operator "${canonicalOp}" requires a non-empty targetValue.`);
      }
    }
  }
}

function validateAtomicConditionObject(cond: Record<string, unknown>, errors: string[]) {
  const field = typeof cond.field === 'string' ? cond.field.trim() : '';
  const op = typeof cond.operator === 'string' ? cond.operator.trim() : '';
  const val = cond.value !== undefined ? cond.value : cond.targetValue;

  if (!isValidScorableField(field)) {
    errors.push(`Invalid or unsupported rule field: "${field}".`);
  }
  const canonicalOp = normalizeOperator(op);
  if (!canonicalOp) {
    errors.push(`Invalid or unsafe rule operator: "${op}".`);
  } else {
    validateOperatorTargetValue(canonicalOp, val, errors);
  }
  if (containsUnsafeExecutablePattern(val)) {
    errors.push('Condition value contains prohibited executable or unsafe patterns.');
  }
}

function parseSafeConditionObject(rawCond: unknown): StructuredRuleCondition {
  if (!rawCond) return {};
  if (typeof rawCond === 'string') {
    try {
      const parsed = JSON.parse(rawCond);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as StructuredRuleCondition;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof rawCond === 'object' && !Array.isArray(rawCond)) {
    return rawCond as StructuredRuleCondition;
  }
  return {};
}

/**
 * Validates and sanitizes a scoring rule definition (create or update).
 * Rejects eval(), Function(), SQL injection, prototype pollution, unknown fields, and invalid operators.
 */
export function validateScoringRulePayload(
  raw: Record<string, unknown>,
  existing?: Partial<ScoringRuleDefinition>
): RuleValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Rule payload must be a JSON object.'] };
  }

  // Reject any explicit executable fields
  for (const forbiddenProp of ['script', 'eval', 'fn', 'executable', 'sql', 'functionBody']) {
    if (raw[forbiddenProp] !== undefined) {
      errors.push(`Prohibited executable property "${forbiddenProp}" is not allowed in scoring rules.`);
    }
  }

  if (containsUnsafeExecutablePattern(raw)) {
    errors.push('Rule definition contains prohibited executable code or unsafe expression patterns.');
  }

  const rawKey =
    (typeof raw.key === 'string' && raw.key.trim()) ||
    (typeof raw.code === 'string' && raw.code.trim()) ||
    existing?.key ||
    existing?.code ||
    '';

  const cleanKey = rawKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (!cleanKey || cleanKey.length < 2 || cleanKey.length > 80) {
    errors.push('Rule key/code is required (2–80 alphanumeric/underscore characters).');
  }

  const rawName =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : existing?.name || '';
  const rawNameEn =
    typeof raw.nameEn === 'string' && raw.nameEn.trim()
      ? raw.nameEn.trim()
      : existing?.nameEn || rawName;

  if (!rawName || rawName.length < 2) {
    errors.push('Rule name is required (at least 2 characters).');
  }

  const rawPoints =
    raw.points !== undefined
      ? Number(raw.points)
      : raw.weight !== undefined
        ? Number(raw.weight)
        : existing?.points ?? existing?.weight;

  if (
    rawPoints === undefined ||
    Number.isNaN(rawPoints) ||
    !Number.isInteger(rawPoints) ||
    rawPoints < -100 ||
    rawPoints > 100
  ) {
    errors.push('Rule points/weight must be an integer between -100 and 100.');
  }

  const rawPriority =
    raw.priority !== undefined
      ? Number(raw.priority)
      : raw.sortOrder !== undefined
        ? Number(raw.sortOrder)
        : existing?.priority ?? existing?.sortOrder ?? 10;

  if (Number.isNaN(rawPriority) || !Number.isInteger(rawPriority) || rawPriority < -1000 || rawPriority > 10000) {
    errors.push('Rule priority/sortOrder must be a valid integer.');
  }

  // Extract structured condition from `condition`, `conditions`, or top-level `field`/`operator`/`targetValue`/`value`
  const condObj =
    raw.condition && typeof raw.condition === 'object' && !Array.isArray(raw.condition)
      ? (raw.condition as Record<string, unknown>)
      : raw.conditions && typeof raw.conditions === 'object' && !Array.isArray(raw.conditions)
        ? (raw.conditions as Record<string, unknown>)
        : null;

  const existingCond =
    existing?.condition && typeof existing.condition === 'object' && !Array.isArray(existing.condition)
      ? (existing.condition as Record<string, unknown>)
      : existing?.conditions && typeof existing.conditions === 'object' && !Array.isArray(existing.conditions)
        ? (existing.conditions as Record<string, unknown>)
        : null;

  const field = String(
    raw.field ?? condObj?.field ?? existing?.field ?? existingCond?.field ?? ''
  ).trim();

  const rawOperator = String(
    raw.operator ?? condObj?.operator ?? existing?.operator ?? existingCond?.operator ?? ''
  ).trim();

  const rawTargetVal =
    raw.targetValue !== undefined
      ? raw.targetValue
      : raw.value !== undefined
        ? raw.value
        : condObj?.value !== undefined
          ? condObj.value
          : condObj?.targetValue !== undefined
            ? condObj.targetValue
            : existing?.targetValue ?? existingCond?.value ?? existingCond?.targetValue ?? '';

  // Validate compound `all` / `any` if present
  if (condObj && condObj.all !== undefined) {
    if (!Array.isArray(condObj.all) || condObj.all.length === 0 || condObj.all.length > 50) {
      errors.push('Compound "all" condition must be a non-empty array (1–50 items).');
    } else {
      for (const c of condObj.all) {
        if (c && typeof c === 'object' && !Array.isArray(c)) {
          validateAtomicConditionObject(c as Record<string, unknown>, errors);
        } else {
          errors.push('Invalid atomic condition inside "all" array.');
        }
      }
    }
  } else if (condObj && condObj.any !== undefined) {
    if (!Array.isArray(condObj.any) || condObj.any.length === 0 || condObj.any.length > 50) {
      errors.push('Compound "any" condition must be a non-empty array (1–50 items).');
    } else {
      for (const c of condObj.any) {
        if (c && typeof c === 'object' && !Array.isArray(c)) {
          validateAtomicConditionObject(c as Record<string, unknown>, errors);
        } else {
          errors.push('Invalid atomic condition inside "any" array.');
        }
      }
    }
  } else {
    if (!isValidScorableField(field)) {
      errors.push(`Invalid or unsupported rule field: "${field}".`);
    }
    const canonicalOp = normalizeOperator(rawOperator);
    if (!canonicalOp) {
      errors.push(`Invalid or unsupported rule operator: "${rawOperator}".`);
    } else {
      validateOperatorTargetValue(canonicalOp, rawTargetVal, errors);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const canonicalOp = normalizeOperator(rawOperator) || 'equals';
  const storedOperator = rawOperator.toUpperCase() === rawOperator && rawOperator.length > 0 ? rawOperator : canonicalOp;
  const serializedTargetValue =
    Array.isArray(rawTargetVal) || (typeof rawTargetVal === 'object' && rawTargetVal !== null)
      ? JSON.stringify(rawTargetVal)
      : String(rawTargetVal ?? '');

  const normalizedCondition: StructuredRuleCondition = condObj
    ? {
        ...(condObj as StructuredRuleCondition),
        field: field || (condObj.field as string),
        operator: canonicalOp,
        value: rawTargetVal,
        targetValue: serializedTargetValue,
      }
    : {
        field,
        operator: canonicalOp,
        value: rawTargetVal,
        targetValue: serializedTargetValue,
      };

  const explicitGroup =
    raw.ruleGroup !== undefined
      ? (raw.ruleGroup as string | null)
      : existing?.ruleGroup !== undefined
        ? existing.ruleGroup
        : undefined;

  const isCompoundPayload = Boolean(
    condObj && (Array.isArray(condObj.all) || Array.isArray(condObj.any))
  );
  const ruleGroup = inferRuleGroup(cleanKey, field, explicitGroup, isCompoundPayload);
  const category = inferRuleCategory(
    cleanKey,
    field,
    (raw.category as string | undefined) ?? existing?.category
  );

  const description =
    raw.description !== undefined
      ? raw.description
        ? String(raw.description).trim()
        : null
      : existing?.description ?? null;

  const enabled =
    raw.enabled !== undefined ? Boolean(raw.enabled) : existing?.enabled ?? true;

  const version =
    typeof raw.version === 'string' && raw.version.trim()
      ? raw.version.trim()
      : existing?.version || 'v1';

  return {
    valid: true,
    errors: [],
    normalized: {
      key: cleanKey,
      code: cleanKey,
      name: rawName,
      nameEn: rawNameEn,
      description,
      category,
      ruleGroup,
      points: Number(rawPoints),
      weight: Number(rawPoints),
      priority: Number(rawPriority),
      sortOrder: Number(rawPriority),
      enabled,
      field,
      operator: storedOperator,
      targetValue: serializedTargetValue,
      conditions: normalizedCondition,
      version,
    },
  };
}

/**
 * Normalizes any rule object (from DB or in-memory test) into a full ScoringRuleDefinition.
 */
export function normalizeRuleDefinition(rule: Partial<ScoringRuleDefinition> & { code?: string; key?: string }): ScoringRuleDefinition {
  const code = (rule.code || rule.key || 'UNKNOWN_RULE').trim().toUpperCase();
  const key = (rule.key || rule.code || code).trim().toUpperCase();
  const weight = rule.weight !== undefined ? Number(rule.weight) : Number(rule.points ?? 0);
  const points = rule.points !== undefined ? Number(rule.points) : weight;
  const sortOrder = rule.sortOrder !== undefined ? Number(rule.sortOrder) : Number(rule.priority ?? 0);
  const priority = rule.priority !== undefined ? Number(rule.priority) : sortOrder;

  const parsedCondition = parseSafeConditionObject(rule.condition);
  const parsedConditions = parseSafeConditionObject(rule.conditions);
  const condObj: StructuredRuleCondition =
    Object.keys(parsedCondition).length > 0 ? parsedCondition : parsedConditions;

  const field = String(rule.field || condObj.field || '').trim();
  const operator = String(rule.operator || condObj.operator || 'equals').trim();
  const rawVal =
    rule.targetValue !== undefined
      ? rule.targetValue
      : condObj.value !== undefined
        ? condObj.value
        : condObj.targetValue !== undefined
          ? condObj.targetValue
          : '';
  const targetValue = typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal);

  const isCompound = Boolean(Array.isArray(condObj.all) || Array.isArray(condObj.any));
  const ruleGroup = inferRuleGroup(code, field, rule.ruleGroup, isCompound);
  const category = inferRuleCategory(code, field, rule.category);

  return {
    id: rule.id || `rule-${code.toLowerCase()}`,
    code,
    key,
    name: rule.name || rule.nameEn || code,
    nameEn: rule.nameEn || rule.name || code,
    description: rule.description ?? null,
    category,
    ruleGroup,
    weight,
    points,
    priority,
    sortOrder,
    enabled: rule.enabled !== undefined ? Boolean(rule.enabled) : true,
    field,
    operator,
    targetValue,
    condition: condObj,
    conditions: condObj,
    version: rule.version || 'v1',
  };
}

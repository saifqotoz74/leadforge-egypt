import { evaluateLeadFreshness } from '../freshness';
import { normalizeEmail, normalizePhone } from '../normalizer';
import { normalizeOperator, normalizeRuleDefinition } from './rule-validator';
import {
  AppliedScoringRule,
  EvaluatedRuleRecord,
  LeadScorableFields,
  ScoringRuleDefinition,
  StructuredRuleCondition,
  TriState,
} from './types';

export const UNKNOWN_SIGNAL = Symbol.for('LEADFORGE_UNKNOWN_SIGNAL');

/**
 * Resolves a field value from LeadScorableFields supporting both flat fields and structured dot-notation paths.
 * Explicitly returns UNKNOWN_SIGNAL when data is missing/unknown so missing data never masquerades as false/0.
 */
export function resolveLeadSignal(
  lead: LeadScorableFields,
  rawField: string
): unknown | typeof UNKNOWN_SIGNAL {
  const field = (rawField || '').trim();
  if (!field) return UNKNOWN_SIGNAL;

  // Determine effective websiteStatus
  let effectiveWebsiteStatus = lead.websiteStatus;
  if (lead.noWebsite === true) {
    effectiveWebsiteStatus = 'NO_WEBSITE';
  } else if (
    lead.website === '' &&
    lead.websiteStatus === 'POOR_WEBSITE'
  ) {
    // Contradictory raw state: empty website URL cannot be a poor existing website
    effectiveWebsiteStatus = 'NO_WEBSITE';
  } else if (!effectiveWebsiteStatus) {
    if (lead.poorWebsite === true) {
      effectiveWebsiteStatus = 'POOR_WEBSITE';
    } else if (lead.goodWebsite === true) {
      effectiveWebsiteStatus = 'HAS_WEBSITE';
    }
  }

  const webAnalysis =
    lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
      ? (lead.websiteAnalysis as Record<string, unknown>)
      : null;

  const websiteIsKnownExisting =
    effectiveWebsiteStatus === 'HAS_WEBSITE' ||
    effectiveWebsiteStatus === 'GOOD_WEBSITE' ||
    effectiveWebsiteStatus === 'POOR_WEBSITE';

  switch (field) {
    case 'isVerified':
    case 'business.verified':
    case 'business_verified':
      if (lead.isVerified === null || lead.isVerified === undefined) return UNKNOWN_SIGNAL;
      return Boolean(lead.isVerified);

    case 'noWebsite':
    case 'no_website':
      if (lead.noWebsite !== null && lead.noWebsite !== undefined) return Boolean(lead.noWebsite);
      if (effectiveWebsiteStatus === 'NO_WEBSITE' || effectiveWebsiteStatus === 'MISSING') return true;
      if (websiteIsKnownExisting) return false;
      return UNKNOWN_SIGNAL;

    case 'poorWebsite':
    case 'poor_website':
      if (lead.poorWebsite !== null && lead.poorWebsite !== undefined) return Boolean(lead.poorWebsite);
      if (effectiveWebsiteStatus === 'POOR_WEBSITE') return true;
      if (
        effectiveWebsiteStatus === 'NO_WEBSITE' ||
        effectiveWebsiteStatus === 'MISSING' ||
        effectiveWebsiteStatus === 'HAS_WEBSITE' ||
        effectiveWebsiteStatus === 'GOOD_WEBSITE'
      ) {
        return false;
      }
      return UNKNOWN_SIGNAL;

    case 'goodWebsite':
    case 'good_website':
      if (lead.goodWebsite !== null && lead.goodWebsite !== undefined) return Boolean(lead.goodWebsite);
      if (effectiveWebsiteStatus === 'HAS_WEBSITE' || effectiveWebsiteStatus === 'GOOD_WEBSITE') return true;
      if (
        effectiveWebsiteStatus === 'NO_WEBSITE' ||
        effectiveWebsiteStatus === 'MISSING' ||
        effectiveWebsiteStatus === 'POOR_WEBSITE'
      ) {
        return false;
      }
      return UNKNOWN_SIGNAL;

    case 'websiteStatus':
    case 'website.status': {
      if (
        effectiveWebsiteStatus === null ||
        effectiveWebsiteStatus === undefined ||
        effectiveWebsiteStatus === 'UNKNOWN'
      ) {
        // Also check if poorWebsite boolean was explicitly passed in a multi-signal test
        if (lead.poorWebsite === true && lead.noWebsite !== true) return 'POOR_WEBSITE';
        return UNKNOWN_SIGNAL;
      }
      if (effectiveWebsiteStatus === 'MISSING') return 'NO_WEBSITE';
      if (effectiveWebsiteStatus === 'GOOD_WEBSITE') return 'HAS_WEBSITE';
      return effectiveWebsiteStatus;
    }

    case 'website.exists': {
      if (
        effectiveWebsiteStatus === null ||
        effectiveWebsiteStatus === undefined ||
        effectiveWebsiteStatus === 'UNKNOWN'
      ) {
        if (lead.website && String(lead.website).trim()) return true;
        return UNKNOWN_SIGNAL;
      }
      return effectiveWebsiteStatus === 'HAS_WEBSITE' ||
        effectiveWebsiteStatus === 'GOOD_WEBSITE' ||
        effectiveWebsiteStatus === 'POOR_WEBSITE';
    }

    case 'website':
      if (lead.website !== null && lead.website !== undefined && String(lead.website).trim() !== '') {
        return String(lead.website).trim();
      }
      if (effectiveWebsiteStatus === 'NO_WEBSITE' || effectiveWebsiteStatus === 'MISSING') {
        return null;
      }
      return UNKNOWN_SIGNAL;

    case 'normalizedDomain':
      if (lead.normalizedDomain === null || lead.normalizedDomain === undefined || lead.normalizedDomain === '') {
        return UNKNOWN_SIGNAL;
      }
      return String(lead.normalizedDomain);

    case 'website.reachable':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.reachable === undefined || webAnalysis.reachable === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.reachable);

    case 'website.isHttps':
    case 'website.https':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.isHttps === undefined || webAnalysis.isHttps === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.isHttps);

    case 'website.sslValid':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.sslValid === undefined || webAnalysis.sslValid === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.sslValid);

    case 'website.responseTimeMs':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.responseTimeMs === undefined || webAnalysis.responseTimeMs === null) {
        return UNKNOWN_SIGNAL;
      }
      return Number(webAnalysis.responseTimeMs);

    case 'website.slow':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.responseTimeMs === undefined || webAnalysis.responseTimeMs === null) {
        return UNKNOWN_SIGNAL;
      }
      return Number(webAnalysis.responseTimeMs) >= 1500;

    case 'website.hasMobileViewport':
    case 'website.mobileViewport':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.hasMobileViewport === undefined || webAnalysis.hasMobileViewport === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.hasMobileViewport);

    case 'website.hasResponsiveIndicators':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.hasResponsiveIndicators === undefined || webAnalysis.hasResponsiveIndicators === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.hasResponsiveIndicators);

    case 'website.isOldBasicStructure':
    case 'website.poorStructure':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.isOldBasicStructure === undefined || webAnalysis.isOldBasicStructure === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.isOldBasicStructure);

    case 'website.hasTitle':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.hasTitle === undefined || webAnalysis.hasTitle === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.hasTitle);

    case 'website.hasMetaDescription':
      if (!websiteIsKnownExisting || !webAnalysis || webAnalysis.hasMetaDescription === undefined || webAnalysis.hasMetaDescription === null) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(webAnalysis.hasMetaDescription);

    case 'website.weakMetadata':
      if (!websiteIsKnownExisting || !webAnalysis) {
        return UNKNOWN_SIGNAL;
      }
      if (webAnalysis.hasTitle === undefined && webAnalysis.hasMetaDescription === undefined) {
        return UNKNOWN_SIGNAL;
      }
      return !webAnalysis.hasTitle || !webAnalysis.hasMetaDescription;

    case 'website.domainStatus':
      if (!websiteIsKnownExisting || !webAnalysis || !webAnalysis.domainStatus) {
        return UNKNOWN_SIGNAL;
      }
      return String(webAnalysis.domainStatus);

    case 'website.domainInactive':
      if (!websiteIsKnownExisting || !webAnalysis || !webAnalysis.domainStatus) {
        return UNKNOWN_SIGNAL;
      }
      return webAnalysis.domainStatus === 'UNREACHABLE' || webAnalysis.domainStatus === 'NO_DOMAIN';

    case 'website.opportunityScore':
      if (!webAnalysis || webAnalysis.opportunityScore === undefined || webAnalysis.opportunityScore === null) {
        return UNKNOWN_SIGNAL;
      }
      return Number(webAnalysis.opportunityScore);

    case 'hasPhone':
    case 'contact.phoneExists':
    case 'contact.hasPhone':
      if (lead.hasPhone !== null && lead.hasPhone !== undefined) {
        return Boolean(lead.hasPhone);
      }
      if (lead.phone !== null && lead.phone !== undefined && String(lead.phone).trim() !== '') {
        return true;
      }
      return UNKNOWN_SIGNAL;

    case 'phone':
      if (lead.phone !== null && lead.phone !== undefined && String(lead.phone).trim() !== '') {
        return String(lead.phone).trim();
      }
      if (lead.hasPhone === true) return 'AVAILABLE';
      if (lead.hasPhone === false) return null;
      return UNKNOWN_SIGNAL;

    case 'contact.phoneVerified':
    case 'phone_verified':
    case 'phoneVerified': {
      const explicitProp =
        (lead as Record<string, unknown>).phoneVerified ??
        (lead as Record<string, unknown>).phone_verified;
      if (explicitProp !== undefined && explicitProp !== null) {
        return Boolean(explicitProp);
      }
      // Missing phone does NOT mean phoneVerified = false; it means UNKNOWN
      const phonePresent =
        (lead.phone !== null && lead.phone !== undefined && String(lead.phone).trim() !== '') ||
        lead.hasPhone === true;
      if (!phonePresent) return UNKNOWN_SIGNAL;
      if (lead.normalizedPhone) return true;
      if (lead.phone) return Boolean(normalizePhone(lead.phone));
      return true;
    }

    case 'hasEmail':
    case 'contact.emailExists':
    case 'contact.hasEmail':
      if (lead.hasEmail !== null && lead.hasEmail !== undefined) {
        return Boolean(lead.hasEmail);
      }
      if (lead.email !== null && lead.email !== undefined && String(lead.email).trim() !== '') {
        return true;
      }
      return UNKNOWN_SIGNAL;

    case 'email':
      if (lead.email !== null && lead.email !== undefined && String(lead.email).trim() !== '') {
        return String(lead.email).trim();
      }
      if (lead.hasEmail === true) return 'AVAILABLE';
      if (lead.hasEmail === false) return null;
      return UNKNOWN_SIGNAL;

    case 'contact.emailVerified':
    case 'email_verified':
    case 'emailVerified': {
      const explicitProp =
        (lead as Record<string, unknown>).emailVerified ??
        (lead as Record<string, unknown>).email_verified;
      if (explicitProp !== undefined && explicitProp !== null) {
        return Boolean(explicitProp);
      }
      // email = null must NOT automatically mean email_verified = false; it is UNKNOWN
      const emailPresent =
        (lead.email !== null && lead.email !== undefined && String(lead.email).trim() !== '') ||
        lead.hasEmail === true;
      if (!emailPresent) return UNKNOWN_SIGNAL;
      if (lead.normalizedEmail) return true;
      if (lead.email) return Boolean(normalizeEmail(lead.email));
      return true;
    }

    case 'contact.socialExists':
    case 'social.exists': {
      if (
        (lead.hasFacebook === null || lead.hasFacebook === undefined) &&
        (lead.hasInstagram === null || lead.hasInstagram === undefined) &&
        (!lead.facebook || !String(lead.facebook).trim()) &&
        (!lead.instagram || !String(lead.instagram).trim())
      ) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(
        lead.hasFacebook ||
          lead.hasInstagram ||
          (lead.facebook && String(lead.facebook).trim()) ||
          (lead.instagram && String(lead.instagram).trim())
      );
    }

    case 'hasFacebook':
    case 'social.facebook':
    case 'social.hasFacebook':
      if (lead.hasFacebook !== null && lead.hasFacebook !== undefined) {
        return Boolean(lead.hasFacebook);
      }
      if (lead.facebook !== null && lead.facebook !== undefined && String(lead.facebook).trim() !== '') {
        return true;
      }
      return UNKNOWN_SIGNAL;

    case 'facebook':
      if (lead.facebook && String(lead.facebook).trim()) return String(lead.facebook).trim();
      if (lead.hasFacebook === true) return 'AVAILABLE';
      if (lead.hasFacebook === false) return null;
      return UNKNOWN_SIGNAL;

    case 'hasInstagram':
    case 'social.instagram':
    case 'social.hasInstagram':
      if (lead.hasInstagram !== null && lead.hasInstagram !== undefined) {
        return Boolean(lead.hasInstagram);
      }
      if (lead.instagram !== null && lead.instagram !== undefined && String(lead.instagram).trim() !== '') {
        return true;
      }
      return UNKNOWN_SIGNAL;

    case 'instagram':
      if (lead.instagram && String(lead.instagram).trim()) return String(lead.instagram).trim();
      if (lead.hasInstagram === true) return 'AVAILABLE';
      if (lead.hasInstagram === false) return null;
      return UNKNOWN_SIGNAL;

    case 'isRecentlyActive':
    case 'social.active':
    case 'social.recentlyActive':
    case 'business.recentlyActive':
    case 'business.active':
      if (lead.isRecentlyActive === null || lead.isRecentlyActive === undefined) {
        return UNKNOWN_SIGNAL;
      }
      return Boolean(lead.isRecentlyActive);

    case 'branchCount':
    case 'business.branches':
    case 'business.branchCount':
      if (lead.branchCount === null || lead.branchCount === undefined || Number.isNaN(Number(lead.branchCount))) {
        return UNKNOWN_SIGNAL;
      }
      return Number(lead.branchCount);

    case 'reviewCount':
    case 'reviews.count':
      if (lead.reviewCount === null || lead.reviewCount === undefined || Number.isNaN(Number(lead.reviewCount))) {
        return UNKNOWN_SIGNAL;
      }
      return Number(lead.reviewCount);

    case 'rating':
    case 'reviews.rating':
      if (lead.rating === null || lead.rating === undefined || Number.isNaN(Number(lead.rating))) {
        return UNKNOWN_SIGNAL;
      }
      return Number(lead.rating);

    case 'category':
    case 'business.category':
      if (!lead.category || !String(lead.category).trim()) return UNKNOWN_SIGNAL;
      return String(lead.category).trim();

    case 'city':
    case 'business.city':
      if (!lead.city || !String(lead.city).trim()) return UNKNOWN_SIGNAL;
      return String(lead.city).trim();

    case 'governorate':
    case 'business.governorate':
      if (!lead.governorate || !String(lead.governorate).trim()) return UNKNOWN_SIGNAL;
      return String(lead.governorate).trim();

    case 'area':
      if (!lead.area || !String(lead.area).trim()) return UNKNOWN_SIGNAL;
      return String(lead.area).trim();

    case 'estimatedBudget':
    case 'business.estimatedBudget':
      if (lead.estimatedBudget === null || lead.estimatedBudget === undefined) return UNKNOWN_SIGNAL;
      return Number(lead.estimatedBudget);

    case 'source':
      if (!lead.source || !String(lead.source).trim()) return UNKNOWN_SIGNAL;
      return String(lead.source).trim();

    case 'sourceVerified':
    case 'source.verified':
      if (lead.sourceVerified !== null && lead.sourceVerified !== undefined) {
        return Boolean(lead.sourceVerified);
      }
      if (lead.isVerified !== null && lead.isVerified !== undefined) {
        return Boolean(lead.isVerified);
      }
      return UNKNOWN_SIGNAL;

    case 'sourceCount':
    case 'source.count':
    case 'sources.count': {
      if (Array.isArray(lead.sourceList) && lead.sourceList.length > 0) {
        return new Set(lead.sourceList.map((s) => String(s).trim()).filter(Boolean)).size;
      }
      if (lead.source && String(lead.source).trim()) return 1;
      return UNKNOWN_SIGNAL;
    }

    case 'source.multiple': {
      if (Array.isArray(lead.sourceList) && lead.sourceList.length > 0) {
        const uniqueCount = new Set(lead.sourceList.map((s) => String(s).trim()).filter(Boolean)).size;
        return uniqueCount > 1;
      }
      if (lead.source && String(lead.source).trim()) return false;
      return UNKNOWN_SIGNAL;
    }

    case 'freshnessStatus':
    case 'freshness.status': {
      if (!lead.lastVerifiedAt) return UNKNOWN_SIGNAL;
      return evaluateLeadFreshness(lead.lastVerifiedAt).status;
    }

    case 'daysSinceVerified':
    case 'freshness.daysSinceVerified': {
      if (!lead.lastVerifiedAt) return UNKNOWN_SIGNAL;
      return evaluateLeadFreshness(lead.lastVerifiedAt).daysSinceVerified;
    }

    case 'freshness.recentlyVerified': {
      if (!lead.lastVerifiedAt) return UNKNOWN_SIGNAL;
      const status = evaluateLeadFreshness(lead.lastVerifiedAt).status;
      return status === 'FRESH' || status === 'RECENTLY_VERIFIED';
    }

    case 'freshness.stale': {
      if (!lead.lastVerifiedAt) return UNKNOWN_SIGNAL;
      return evaluateLeadFreshness(lead.lastVerifiedAt).status === 'STALE';
    }

    default: {
      const fallback = (lead as unknown as Record<string, unknown>)[field];
      if (fallback === undefined || fallback === null) return UNKNOWN_SIGNAL;
      return fallback;
    }
  }
}

function parseListTarget(targetValue: unknown): string[] {
  if (Array.isArray(targetValue)) {
    return targetValue.map((v) => String(v).trim());
  }
  const str = String(targetValue ?? '').trim();
  if (!str) return [];
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim());
      }
    } catch {
      // fall through to comma split
    }
  }
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeWebsiteTargetAlias(field: string, value: string): string {
  if (field === 'websiteStatus' || field === 'website.status') {
    const upper = value.trim().toUpperCase();
    if (upper === 'MISSING' || upper === 'NONE') return 'NO_WEBSITE';
    if (upper === 'GOOD_WEBSITE' || upper === 'GOOD' || upper === 'ACTIVE') return 'HAS_WEBSITE';
    if (upper === 'POOR' || upper === 'OLD_WEBSITE') return 'POOR_WEBSITE';
  }
  return value;
}

/**
 * Evaluates a single atomic condition with TriState ('TRUE' | 'FALSE' | 'UNKNOWN') semantics.
 */
export function evaluateConditionTriState(
  lead: LeadScorableFields,
  field: string,
  rawOperator: string,
  targetValue: unknown
): TriState {
  const op = normalizeOperator(rawOperator);
  if (!op) return 'FALSE';

  // Special case: if a test passes contradictory signals (e.g., `{ websiteStatus: 'NO_WEBSITE', poorWebsite: true }`
  // or `{ websiteStatus: 'POOR_WEBSITE', noWebsite: true }` or `{ websiteStatus: 'POOR_WEBSITE', website: '' }`)
  // and a rule tests POOR_WEBSITE, allow evaluating the rule condition so rule group exclusivity (`SUPERSEDED_BY_GROUP`)
  // can explicitly adjudicate it.
  let signal = resolveLeadSignal(lead, field);
  if (
    (field === 'websiteStatus' || field === 'website.status') &&
    String(targetValue ?? '').toUpperCase() === 'POOR_WEBSITE' &&
    (lead.poorWebsite === true || lead.websiteStatus === 'POOR_WEBSITE')
  ) {
    signal = 'POOR_WEBSITE';
  }

  // Handle `exists` and `not_exists` first
  if (op === 'exists') {
    if (signal === UNKNOWN_SIGNAL) {
      return 'UNKNOWN';
    }
    if (signal === null || signal === undefined || signal === '' || signal === false) {
      return 'FALSE';
    }
    return 'TRUE';
  }

  if (op === 'not_exists') {
    if (signal === UNKNOWN_SIGNAL) {
      return 'UNKNOWN';
    }
    if (signal === null || signal === undefined || signal === '' || signal === false) {
      return 'TRUE';
    }
    return 'FALSE';
  }

  // If signal is UNKNOWN_SIGNAL, do NOT coerce to false or 0
  if (signal === UNKNOWN_SIGNAL || signal === null || signal === undefined) {
    const targetStr = String(targetValue ?? '').trim().toUpperCase();
    if (op === 'equals' && targetStr === 'UNKNOWN') {
      return 'TRUE';
    }
    return 'UNKNOWN';
  }

  const targetStr = normalizeWebsiteTargetAlias(
    field,
    targetValue !== undefined && targetValue !== null ? String(targetValue).trim() : ''
  );

  switch (op) {
    case 'is_true':
      return signal === true || String(signal).toLowerCase() === 'true' ? 'TRUE' : 'FALSE';

    case 'is_false':
      return signal === false || String(signal).toLowerCase() === 'false' ? 'TRUE' : 'FALSE';

    case 'equals': {
      if (typeof signal === 'boolean') {
        const targetBool =
          targetValue === true ||
          String(targetValue).trim().toLowerCase() === 'true'
            ? true
            : targetValue === false || String(targetValue).trim().toLowerCase() === 'false'
              ? false
              : null;
        if (targetBool === null) return 'FALSE';
        return signal === targetBool ? 'TRUE' : 'FALSE';
      }
      if (typeof signal === 'number' && targetStr !== '' && !Number.isNaN(Number(targetStr))) {
        return signal === Number(targetStr) ? 'TRUE' : 'FALSE';
      }
      return String(signal).trim() === targetStr ? 'TRUE' : 'FALSE';
    }

    case 'not_equals': {
      const eq = evaluateConditionTriState(lead, field, 'equals', targetValue);
      if (eq === 'UNKNOWN') return 'UNKNOWN';
      return eq === 'TRUE' ? 'FALSE' : 'TRUE';
    }

    case 'greater_than': {
      const numVal = Number(signal);
      const numTarget = Number(targetStr);
      if (Number.isNaN(numVal) || Number.isNaN(numTarget)) return 'FALSE';
      return numVal > numTarget ? 'TRUE' : 'FALSE';
    }

    case 'greater_than_or_equal': {
      const numVal = Number(signal);
      const numTarget = Number(targetStr);
      if (Number.isNaN(numVal) || Number.isNaN(numTarget)) return 'FALSE';
      return numVal >= numTarget ? 'TRUE' : 'FALSE';
    }

    case 'less_than': {
      const numVal = Number(signal);
      const numTarget = Number(targetStr);
      if (Number.isNaN(numVal) || Number.isNaN(numTarget)) return 'FALSE';
      return numVal < numTarget ? 'TRUE' : 'FALSE';
    }

    case 'less_than_or_equal': {
      const numVal = Number(signal);
      const numTarget = Number(targetStr);
      if (Number.isNaN(numVal) || Number.isNaN(numTarget)) return 'FALSE';
      return numVal <= numTarget ? 'TRUE' : 'FALSE';
    }

    case 'contains': {
      if (!targetStr) return 'FALSE';
      if (Array.isArray(signal)) {
        return signal.some((item) => String(item).toLowerCase().includes(targetStr.toLowerCase()))
          ? 'TRUE'
          : 'FALSE';
      }
      return String(signal).toLowerCase().includes(targetStr.toLowerCase()) ? 'TRUE' : 'FALSE';
    }

    case 'not_contains': {
      const has = evaluateConditionTriState(lead, field, 'contains', targetValue);
      if (has === 'UNKNOWN') return 'UNKNOWN';
      return has === 'TRUE' ? 'FALSE' : 'TRUE';
    }

    case 'in': {
      const list = parseListTarget(targetValue).map((item) =>
        normalizeWebsiteTargetAlias(field, item).toLowerCase()
      );
      if (list.length === 0) return 'FALSE';
      if (Array.isArray(signal)) {
        return signal.some((item) => list.includes(String(item).trim().toLowerCase()))
          ? 'TRUE'
          : 'FALSE';
      }
      return list.includes(String(signal).trim().toLowerCase()) ? 'TRUE' : 'FALSE';
    }

    case 'not_in': {
      const list = parseListTarget(targetValue).map((item) =>
        normalizeWebsiteTargetAlias(field, item).toLowerCase()
      );
      if (list.length === 0) return 'TRUE';
      if (Array.isArray(signal)) {
        return signal.some((item) => list.includes(String(item).trim().toLowerCase()))
          ? 'FALSE'
          : 'TRUE';
      }
      return list.includes(String(signal).trim().toLowerCase()) ? 'FALSE' : 'TRUE';
    }

    default:
      return 'FALSE';
  }
}

/**
 * Evaluates a single rule and returns its TriState ('TRUE' | 'FALSE' | 'UNKNOWN').
 */
export function evaluateRuleTriState(
  lead: LeadScorableFields,
  rawRule: ScoringRuleDefinition
): TriState {
  const rule = normalizeRuleDefinition(rawRule);
  if (!rule.enabled) return 'FALSE';

  const cond = (rule.condition || rule.conditions) as StructuredRuleCondition | null | undefined;
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    if (Array.isArray(cond.all) && cond.all.length > 0) {
      let hasUnknown = false;
      for (const c of cond.all) {
        if (!c || typeof c !== 'object' || Array.isArray(c)) return 'FALSE';
        const res = evaluateConditionTriState(
          lead,
          String(c.field || rule.field),
          String(c.operator || rule.operator),
          c.value !== undefined ? c.value : c.targetValue ?? rule.targetValue
        );
        if (res === 'FALSE') return 'FALSE';
        if (res === 'UNKNOWN') hasUnknown = true;
      }
      return hasUnknown ? 'UNKNOWN' : 'TRUE';
    }

    if (Array.isArray(cond.any) && cond.any.length > 0) {
      let hasUnknown = false;
      for (const c of cond.any) {
        if (!c || typeof c !== 'object' || Array.isArray(c)) return 'FALSE';
        const res = evaluateConditionTriState(
          lead,
          String(c.field || rule.field),
          String(c.operator || rule.operator),
          c.value !== undefined ? c.value : c.targetValue ?? rule.targetValue
        );
        if (res === 'TRUE') return 'TRUE';
        if (res === 'UNKNOWN') hasUnknown = true;
      }
      return hasUnknown ? 'UNKNOWN' : 'FALSE';
    }

    if (
      cond.field !== undefined ||
      cond.operator !== undefined ||
      cond.value !== undefined ||
      cond.targetValue !== undefined
    ) {
      return evaluateConditionTriState(
        lead,
        String(cond.field ?? rule.field),
        String(cond.operator ?? rule.operator),
        cond.value !== undefined ? cond.value : cond.targetValue ?? rule.targetValue
      );
    }
  }

  return evaluateConditionTriState(lead, rule.field, rule.operator, rule.targetValue);
}

/**
 * Boolean wrapper around `evaluateRuleTriState` for direct unit checks.
 */
export function evaluateSingleRule(
  lead: LeadScorableFields,
  rule: ScoringRuleDefinition
): boolean {
  return evaluateRuleTriState(lead, rule) === 'TRUE';
}

export interface RuleBatchEvaluationResult {
  rawScore: number;
  appliedRules: AppliedScoringRule[];
  evaluatedRules: EvaluatedRuleRecord[];
}

function buildRuleConditionSignature(rule: ScoringRuleDefinition): string {
  const cond = (rule.condition || rule.conditions) as StructuredRuleCondition | null | undefined;
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    if (Array.isArray(cond.all) && cond.all.length > 0) {
      return `ALL::${JSON.stringify(cond.all)}`;
    }
    if (Array.isArray(cond.any) && cond.any.length > 0) {
      return `ANY::${JSON.stringify(cond.any)}`;
    }
  }
  return `${rule.field}::${normalizeOperator(rule.operator)}::${rule.targetValue}`;
}

/**
 * RuleEvaluator:
 * Evaluates a set of rules deterministically, enforcing:
 * 1. Priority / sortOrder ordering
 * 2. Duplicate rule key / identical condition protection
 * 3. Mutually exclusive rule groups (`ruleGroup`, e.g. `website_quality`) where only the highest applicable state contributes points
 * 4. Explicit tracking of non-applied rules (`NOT_MATCHED`, `UNKNOWN_DATA`, `SUPERSEDED_BY_GROUP`, `DISABLED`)
 */
export class RuleEvaluator {
  static evaluateRules(
    lead: LeadScorableFields,
    rules: ScoringRuleDefinition[]
  ): RuleBatchEvaluationResult {
    const normalizedRules = rules.map((r) => normalizeRuleDefinition(r));

    // Sort deterministically by priority (asc), then points (desc), then key (asc)
    const sortedRules = [...normalizedRules].sort((a, b) => {
      const prioDiff = (a.priority ?? a.sortOrder ?? 0) - (b.priority ?? b.sortOrder ?? 0);
      if (prioDiff !== 0) return prioDiff;
      const pointsDiff = (b.points ?? b.weight) - (a.points ?? a.weight);
      if (pointsDiff !== 0) return pointsDiff;
      return (a.key || a.code).localeCompare(b.key || b.code);
    });

    // First pass: evaluate TriState for each rule and detect duplicate keys
    const seenKeys = new Set<string>();

    interface IntermediateEval {
      rule: ScoringRuleDefinition;
      triState: TriState;
      isDuplicateKey: boolean;
      condSig: string;
    }

    const firstPass: IntermediateEval[] = sortedRules.map((rule) => {
      const ruleKey = (rule.key || rule.code).toUpperCase();
      const condSig = buildRuleConditionSignature(rule);

      if (!rule.enabled) {
        return { rule, triState: 'FALSE', isDuplicateKey: false, condSig };
      }

      if (seenKeys.has(ruleKey)) {
        return { rule, triState: 'FALSE', isDuplicateKey: true, condSig };
      }
      seenKeys.add(ruleKey);

      const triState = evaluateRuleTriState(lead, rule);
      return { rule, triState, isDuplicateKey: false, condSig };
    });

    // Second pass: resolve mutually exclusive rule groups (`ruleGroup`)
    // Within each ruleGroup, only the matching rule with the highest points (or highest priority on tie) wins.
    const winningRuleIdByGroup = new Map<string, string>();
    for (const item of firstPass) {
      if (!item.rule.enabled || item.isDuplicateKey || item.triState !== 'TRUE') continue;
      const group = item.rule.ruleGroup;
      if (!group) continue;

      const currentWinnerId = winningRuleIdByGroup.get(group);
      if (!currentWinnerId) {
        winningRuleIdByGroup.set(group, item.rule.id);
      } else {
        const currentWinner = firstPass.find((x) => x.rule.id === currentWinnerId)!.rule;
        const itemPoints = item.rule.points ?? item.rule.weight;
        const winnerPoints = currentWinner.points ?? currentWinner.weight;
        if (itemPoints > winnerPoints) {
          winningRuleIdByGroup.set(group, item.rule.id);
        }
      }
    }

    const seenAppliedConditionSignatures = new Set<string>();
    let rawScore = 0;
    const appliedRules: AppliedScoringRule[] = [];
    const evaluatedRules: EvaluatedRuleRecord[] = [];

    for (const { rule, triState, isDuplicateKey, condSig } of firstPass) {
      const ruleKey = rule.key || rule.code;
      const points = rule.points ?? rule.weight;
      const priority = rule.priority ?? rule.sortOrder ?? 0;
      const category = rule.category || 'GENERAL';
      const ruleGroup = rule.ruleGroup ?? null;

      if (!rule.enabled) {
        evaluatedRules.push({
          ruleId: rule.id,
          ruleKey,
          code: rule.code,
          label: rule.nameEn,
          labelAr: rule.name,
          points,
          pointsAwarded: 0,
          priority,
          category,
          ruleGroup,
          applied: false,
          outcome: 'DISABLED',
          reason: 'Rule is disabled',
        });
        continue;
      }

      if (isDuplicateKey) {
        evaluatedRules.push({
          ruleId: rule.id,
          ruleKey,
          code: rule.code,
          label: rule.nameEn,
          labelAr: rule.name,
          points,
          pointsAwarded: 0,
          priority,
          category,
          ruleGroup,
          applied: false,
          outcome: 'DUPLICATE_RULE_SKIPPED',
          reason: 'Duplicate rule key or condition skipped to prevent double scoring',
        });
        continue;
      }

      if (triState === 'UNKNOWN') {
        evaluatedRules.push({
          ruleId: rule.id,
          ruleKey,
          code: rule.code,
          label: rule.nameEn,
          labelAr: rule.name,
          points,
          pointsAwarded: 0,
          priority,
          category,
          ruleGroup,
          applied: false,
          outcome: 'UNKNOWN_DATA',
          reason: `Signal "${rule.field}" is missing/unknown`,
        });
        continue;
      }

      if (triState === 'FALSE') {
        evaluatedRules.push({
          ruleId: rule.id,
          ruleKey,
          code: rule.code,
          label: rule.nameEn,
          labelAr: rule.name,
          points,
          pointsAwarded: 0,
          priority,
          category,
          ruleGroup,
          applied: false,
          outcome: 'NOT_MATCHED',
          reason: `Condition (${rule.field} ${rule.operator} ${rule.targetValue}) did not match`,
        });
        continue;
      }

      // triState === 'TRUE'
      if (ruleGroup && winningRuleIdByGroup.get(ruleGroup) !== rule.id) {
        evaluatedRules.push({
          ruleId: rule.id,
          ruleKey,
          code: rule.code,
          label: rule.nameEn,
          labelAr: rule.name,
          points,
          pointsAwarded: 0,
          priority,
          category,
          ruleGroup,
          applied: false,
          outcome: 'SUPERSEDED_BY_GROUP',
          reason: `Superseded by higher-scoring rule in mutually exclusive group "${ruleGroup}"`,
        });
        continue;
      }

      if (seenAppliedConditionSignatures.has(condSig)) {
        evaluatedRules.push({
          ruleId: rule.id,
          ruleKey,
          code: rule.code,
          label: rule.nameEn,
          labelAr: rule.name,
          points,
          pointsAwarded: 0,
          priority,
          category,
          ruleGroup,
          applied: false,
          outcome: 'DUPLICATE_RULE_SKIPPED',
          reason: 'Duplicate rule key or condition skipped to prevent double scoring',
        });
        continue;
      }
      seenAppliedConditionSignatures.add(condSig);

      // Rule applies!
      rawScore += points;

      // Only include non-zero rules in appliedRules / qualificationReasons so 0-point marker rules (like GOOD_WEBSITE = 0) don't clutter reasons
      if (points !== 0) {
        appliedRules.push({
          ruleId: rule.id,
          code: rule.code,
          ruleKey,
          name: rule.name,
          nameEn: rule.nameEn,
          label: rule.nameEn,
          weight: points,
          points,
          category,
          ruleGroup,
        });
      }

      evaluatedRules.push({
        ruleId: rule.id,
        ruleKey,
        code: rule.code,
        label: rule.nameEn,
        labelAr: rule.name,
        points,
        pointsAwarded: points,
        priority,
        category,
        ruleGroup,
        applied: points !== 0,
        outcome: 'APPLIED',
        reason: `${points >= 0 ? `+${points}` : points} ${rule.nameEn}`,
      });
    }

    return {
      rawScore,
      appliedRules,
      evaluatedRules,
    };
  }
}

import { validateLeadLocation } from './quality/validators';
import {
  evaluateMatch,
  generateAdminMatchDebugReport,
  rankDevelopersForLead,
  rankLeadsForDeveloper,
} from './matching/engine';
import {
  DeveloperMatchingProfileInput,
  DeveloperSubscriptionInput,
  HardFailureItem,
  MatchableLeadInput,
  MatchedCriterion,
  FailedCriterion,
  MatchExplanation,
  MatchingConfigData,
  MatchingRuleDefinition,
  MatchResult,
  MatchWarningItem,
} from './matching/types';

export * from './matching';

export type DeveloperMatchingProfile = DeveloperMatchingProfileInput;
export type MatchableLead = MatchableLeadInput;

export interface LeadMatchEvaluation {
  isMatch: boolean;
  eligible: boolean;
  matchPercentage: number;
  matchStrength: number;
  matchVersion: string;
  matchedCriteria: string[];
  unmatchedCriteria: string[];
  matchedCriteriaDetails?: MatchedCriterion[];
  failedCriteriaDetails?: FailedCriterion[];
  hardFailures?: HardFailureItem[];
  warnings?: MatchWarningItem[];
  explanation?: MatchExplanation;
  fullMatchResult?: MatchResult;
}

export interface EvaluateDeveloperLeadMatchOptions {
  config?: Partial<MatchingConfigData>;
  rules?: MatchingRuleDefinition[];
  matchVersion?: string;
  subscription?: DeveloperSubscriptionInput | null;
  userStatus?: string;
  activeClaimsCount?: number;
}

/**
 * Deterministic Rule-Based Developer Matching Engine (Phase 4 Compatible).
 * Evaluates a Lead against a Developer's configured target profile using Layer A (Hard Eligibility)
 * and Layer B (Soft Matching Rules) while maintaining backwards-compatible string arrays for
 * existing UI components and tests.
 */
export function evaluateDeveloperLeadMatch(
  lead: MatchableLeadInput,
  profile?: DeveloperMatchingProfileInput | null,
  options?: EvaluateDeveloperLeadMatchOptions
): LeadMatchEvaluation {
  const evalOpts = options
    ? {
        config: options.config,
        rules: options.rules,
        matchVersion: options.matchVersion,
      }
    : undefined;

  // When no profile is provided, still enforce Phase 3 saleability & quality gates
  if (!profile) {
    const defaultResult = evaluateMatch(
      lead,
      {
        developerId: 'default-preview-developer',
        userStatus: options?.userStatus || 'ACTIVE',
        subscription: options?.subscription || undefined,
        activeClaimsCount: options?.activeClaimsCount,
        profile: {
          services: [
            'WEBSITE_DEVELOPMENT',
            'WEBSITE_REDESIGN',
            'ECOMMERCE',
            'LANDING_PAGE',
            'BOOKING_SYSTEM',
            'CUSTOM_SOFTWARE',
            'WEB_APP',
            'MOBILE_APP',
            'SEO',
            'MAINTENANCE',
            'UI_UX',
          ],
          allLocationsMode: true,
          allNichesMode: true,
          minBudget: 0,
          leadType: 'BOTH',
          isActive: true,
          isAcceptingLeads: true,
          isComplete: true,
        },
      },
      evalOpts
    );

    if (!defaultResult.eligible) {
      return {
        isMatch: false,
        eligible: false,
        matchPercentage: 0,
        matchStrength: 0,
        matchVersion: defaultResult.matchVersion,
        matchedCriteria: [],
        unmatchedCriteria: defaultResult.hardFailures.map((hf) => hf.reasonAr || hf.reason),
        matchedCriteriaDetails: [],
        failedCriteriaDetails: defaultResult.failedCriteria,
        hardFailures: defaultResult.hardFailures,
        warnings: defaultResult.warnings,
        explanation: defaultResult.explanation,
        fullMatchResult: defaultResult,
      };
    }

    return {
      isMatch: true,
      eligible: true,
      matchPercentage: 100,
      matchStrength: 100,
      matchVersion: defaultResult.matchVersion,
      matchedCriteria: ['الوضع الافتراضي (لم يتم تخصيص تفضيلات محددة)'],
      unmatchedCriteria: [],
      matchedCriteriaDetails: defaultResult.matchedCriteria,
      failedCriteriaDetails: defaultResult.failedCriteria,
      hardFailures: [],
      warnings: defaultResult.warnings,
      explanation: defaultResult.explanation,
      fullMatchResult: defaultResult,
    };
  }

  // Check if lead has a governorate/city contradiction in Egypt taxonomy
  const locValidation =
    lead.governorate && lead.city
      ? validateLeadLocation(lead.governorate, lead.city)
      : { hasLocationMismatch: false };

  const result = evaluateMatch(
    lead,
    {
      developerId: profile.userId || profile.developerId || profile.id || 'developer',
      userStatus: options?.userStatus || 'ACTIVE',
      subscription: options?.subscription || undefined,
      activeClaimsCount: options?.activeClaimsCount,
      profile: {
        ...profile,
        allLocationsMode:
          profile.allLocationsMode ??
          ((profile.locations?.length ?? 0) === 0 &&
            (profile.supportedCities?.length ?? 0) === 0 &&
            (profile.supportedGovernorates?.length ?? 0) === 0 &&
            (profile.supportedDistricts?.length ?? 0) === 0),
        allNichesMode:
          profile.allNichesMode ?? (profile.niches?.length ?? 0) === 0,
      },
    },
    evalOpts
  );

  if (locValidation.hasLocationMismatch && result.eligible) {
    // Ensure location contradiction is surfaced
    const mismatchMsg = `عدم تطابق الموقع الجغرافي (${lead.city} / ${lead.governorate})`;
    return {
      isMatch: false,
      eligible: false,
      matchPercentage: 0,
      matchStrength: 0,
      matchVersion: result.matchVersion,
      matchedCriteria: [],
      unmatchedCriteria: [mismatchMsg],
      matchedCriteriaDetails: [],
      failedCriteriaDetails: result.failedCriteria,
      hardFailures: [
        {
          key: 'LOCATION_NOT_SUPPORTED',
          subCode: 'LOCATION_NOT_SUPPORTED',
          category: 'LOCATION',
          reason: `Lead location has governorate/city contradiction (${lead.city} / ${lead.governorate}).`,
          reasonAr: mismatchMsg,
        },
      ],
      warnings: result.warnings,
      explanation: result.explanation,
      fullMatchResult: {
        ...result,
        eligible: false,
        isMatch: false,
        matchStrength: 0,
        matchPercentage: 0,
      },
    };
  }

  return {
    isMatch: result.eligible,
    eligible: result.eligible,
    matchPercentage: result.matchStrength,
    matchStrength: result.matchStrength,
    matchVersion: result.matchVersion,
    matchedCriteria: result.matchedCriteria.map((c) => c.reasonAr || c.reason),
    unmatchedCriteria: result.hardFailures.map((hf) => hf.reasonAr || hf.reason),
    matchedCriteriaDetails: result.matchedCriteria,
    failedCriteriaDetails: result.failedCriteria,
    hardFailures: result.hardFailures,
    warnings: result.warnings,
    explanation: result.explanation,
    fullMatchResult: result,
  };
}

export {
  evaluateMatch,
  rankDevelopersForLead,
  rankLeadsForDeveloper,
  generateAdminMatchDebugReport,
};

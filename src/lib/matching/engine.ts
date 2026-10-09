import {
  evaluateHardEligibility,
  HardEligibilityEvaluationResult,
} from './hard-eligibility';
import { logMatchingEvent } from './logger';
import {
  DEFAULT_MATCHING_CONFIG,
  DEFAULT_MATCHING_RULES,
  evaluateSoftMatchingRules,
} from './rules';
import {
  getLeadTypeLabel,
  getNicheLabel,
  getServiceLabel,
} from './taxonomy';
import {
  AdminMatchDebugReport,
  DeveloperMatchingContext,
  MatchableLeadInput,
  MatchedCriterion,
  MatchExplanation,
  MatchingConfigData,
  MatchingEvaluationOptions,
  MatchResult,
  NoMatchDiagnostics,
} from './types';

function freshnessRank(freshness: string): number {
  const upper = String(freshness || '').toUpperCase();
  if (upper === 'FRESH') return 4;
  if (upper === 'RECENT' || upper === 'AGING' || upper === 'RECENTLY_VERIFIED') return 3;
  if (upper === 'NEEDS_VERIFICATION') return 2;
  if (upper === 'STALE') return 1;
  return 0;
}

export function resolveMatchingConfig(
  partial?: Partial<MatchingConfigData>
): MatchingConfigData {
  if (!partial) return { ...DEFAULT_MATCHING_CONFIG };
  return {
    ...DEFAULT_MATCHING_CONFIG,
    ...partial,
  };
}

export function buildMatchExplanation(
  hardEval: HardEligibilityEvaluationResult,
  matchedCriteria: MatchedCriterion[],
  matchStrength: number
): MatchExplanation {
  const f = hardEval.extractedFeatures;
  const srvLabel = getServiceLabel(f.leadPrimaryService);
  const nicheLabel = getNicheLabel(f.leadNiche);
  const ltLabel = getLeadTypeLabel(f.leadProjectType);

  const items: MatchExplanation['items'] = [];

  if (hardEval.eligible) {
    const srvCriterion = matchedCriteria.find((c) => c.category === 'SERVICE');
    items.push({
      dimension: 'SERVICE',
      label: 'Service Match',
      labelAr: 'تطابق الخدمة',
      value: `${srvLabel.en} (${f.serviceMatchTier === 'EXACT_PRIMARY' || f.serviceMatchTier === 'MULTI_ALL' ? 'Exact' : 'Compatible'})`,
      valueAr: `${srvLabel.ar} (${f.serviceMatchTier === 'EXACT_PRIMARY' || f.serviceMatchTier === 'MULTI_ALL' ? 'تطابق مباشر' : 'خدمة متوافقة'})`,
      points: srvCriterion?.points ?? 0,
    });

    const nicheCriterion = matchedCriteria.find((c) => c.category === 'NICHE');
    items.push({
      dimension: 'NICHE',
      label: 'Niche Match',
      labelAr: 'تطابق التخصص التجاري',
      value: `${nicheLabel.en} (${f.nicheMatchTier === 'EXACT_NICHE' ? 'Specialized' : 'General'})`,
      valueAr: `${nicheLabel.ar} (${f.nicheMatchTier === 'EXACT_NICHE' ? 'تخصص مباشر' : 'تغطية عامة'})`,
      points: nicheCriterion?.points ?? 0,
    });

    const locCriterion = matchedCriteria.find((c) => c.category === 'LOCATION');
    const locTierLabelEn =
      f.locationMatchTier === 'EXACT_CITY'
        ? `Exact City (${f.leadAreaAr || f.leadCityAr})`
        : f.locationMatchTier === 'GOVERNORATE'
          ? `Governorate (${f.leadGovernorateAr})`
          : f.locationMatchTier === 'SERVICE_AREA'
            ? 'All Egypt / Remote Coverage'
            : 'Unknown (Permitted)';
    const locTierLabelAr =
      f.locationMatchTier === 'EXACT_CITY'
        ? `تطابق المدينة/المنطقة (${f.leadAreaAr || f.leadCityAr})`
        : f.locationMatchTier === 'GOVERNORATE'
          ? `تغطية المحافظة (${f.leadGovernorateAr})`
          : f.locationMatchTier === 'SERVICE_AREA'
            ? 'تغطية جميع المحافظات'
            : 'موقع غير محدد (مسموح)';

    items.push({
      dimension: 'LOCATION',
      label: 'Location Match',
      labelAr: 'النطاق الجغرافي',
      value: locTierLabelEn,
      valueAr: locTierLabelAr,
      points: locCriterion?.points ?? 0,
    });

    const budgetCriterion = matchedCriteria.find((c) => c.category === 'BUDGET');
    const budgetStr =
      f.leadBudgetMin !== null && f.leadBudgetMax !== null
        ? f.leadBudgetMin === f.leadBudgetMax
          ? `${f.leadBudgetMin.toLocaleString('en-US')} ${f.leadBudgetCurrency}`
          : `${f.leadBudgetMin.toLocaleString('en-US')}–${f.leadBudgetMax.toLocaleString('en-US')} ${f.leadBudgetCurrency}`
        : 'Unspecified';
    items.push({
      dimension: 'BUDGET',
      label: 'Budget Fit',
      labelAr: 'توافق الميزانية',
      value: `${budgetStr} (${f.budgetMatchTier === 'IDEAL_RANGE' ? 'Within target range' : f.budgetMatchTier === 'ACCEPTABLE_RANGE' ? 'Acceptable overlap' : 'Permitted'})`,
      valueAr: `${budgetStr} (${f.budgetMatchTier === 'IDEAL_RANGE' ? 'ضمن النطاق المستهدف' : f.budgetMatchTier === 'ACCEPTABLE_RANGE' ? 'تقاطع مقبول' : 'مسموح'})`,
      points: budgetCriterion?.points ?? 0,
    });

    const ltCriterion = matchedCriteria.find((c) => c.category === 'LEAD_TYPE');
    items.push({
      dimension: 'LEAD_TYPE',
      label: 'Project Type',
      labelAr: 'نوع المشروع',
      value: `${ltLabel.en} (${f.leadOwnershipType})`,
      valueAr: `${ltLabel.ar} (${f.leadOwnershipType === 'EXCLUSIVE' ? 'حصري' : 'مشترك'})`,
      points: ltCriterion?.points ?? 0,
    });

    items.push({
      dimension: 'QUALITY_FRESHNESS',
      label: 'Lead Quality & Freshness',
      labelAr: 'الجودة والحداثة',
      value: `${f.leadVerificationStatus} • ${f.leadFreshness} (Quality ${f.leadQualityScore}/100)`,
      valueAr: `${f.leadVerificationStatus === 'VERIFIED' ? 'موثق' : f.leadVerificationStatus} • ${f.leadFreshness} (الجودة ${f.leadQualityScore}/100)`,
      points: matchedCriteria
        .filter((c) => c.category === 'QUALITY' || c.category === 'FRESHNESS')
        .reduce((sum, c) => sum + c.points, 0),
    });

    const whyMatched = matchedCriteria.map((c) => c.reason);
    const whyMatchedAr = matchedCriteria.map((c) => c.reasonAr);

    return {
      title: 'Why this lead matched you',
      titleAr: 'لماذا يتطابق هذا العميل مع ملفك؟',
      summary: `Strong ${matchStrength}% match: ${srvLabel.en} for ${nicheLabel.en} in ${f.leadCityAr || f.leadGovernorateAr || 'Egypt'}.`,
      summaryAr: `تطابق بنسبة ${matchStrength}%: ${srvLabel.ar} في مجال ${nicheLabel.ar} (${f.leadCityAr || f.leadGovernorateAr || 'مصر'}).`,
      items,
      whyMatched,
      whyMatchedAr,
      warnings: hardEval.warnings.map((w) => w.reason),
      warningsAr: hardEval.warnings.map((w) => w.reasonAr),
      hardFailures: [],
      hardFailuresAr: [],
    };
  }

  return {
    title: 'Why this lead did not match',
    titleAr: 'أسباب عدم تطابق هذا العميل مع ملفك',
    summary: `Ineligible (${hardEval.hardFailures.length} hard requirement failure${hardEval.hardFailures.length === 1 ? '' : 's'}): ${hardEval.hardFailures.map((hf) => hf.key).join(', ')}.`,
    summaryAr: `غير مؤهل للمطابقة (${hardEval.hardFailures.length} أسباب استبعاد أساسية): ${hardEval.hardFailures.map((hf) => hf.reasonAr).join(' | ')}.`,
    items: [],
    whyMatched: [],
    whyMatchedAr: [],
    warnings: hardEval.warnings.map((w) => w.reason),
    warningsAr: hardEval.warnings.map((w) => w.reasonAr),
    hardFailures: hardEval.hardFailures.map((hf) => hf.reason),
    hardFailuresAr: hardEval.hardFailures.map((hf) => hf.reasonAr),
  };
}

/**
 * Pure deterministic matching evaluation for a single `(lead, developer)` pair.
 */
export function evaluateMatch(
  lead: MatchableLeadInput,
  developer: DeveloperMatchingContext | null | undefined,
  options?: MatchingEvaluationOptions
): MatchResult {
  const startMs = Date.now();
  const config = resolveMatchingConfig(options?.config);
  const rules = options?.rules || DEFAULT_MATCHING_RULES;
  const matchVersion = options?.matchVersion || config.currentVersion || 'v1';
  const calculatedAt = options?.calculatedAt
    ? typeof options.calculatedAt === 'string'
      ? options.calculatedAt
      : options.calculatedAt.toISOString()
    : '2026-01-01T00:00:00.000Z';

  const hardEval = evaluateHardEligibility(lead, developer, config);
  const softEval = evaluateSoftMatchingRules(hardEval, rules, config);

  const explanation = buildMatchExplanation(
    hardEval,
    softEval.matchedCriteria,
    softEval.matchStrength
  );

  const f = hardEval.extractedFeatures;
  const result: MatchResult = {
    leadId: String(lead.id || 'unknown-lead'),
    developerId: hardEval.normalizedDeveloper.developerId,
    eligible: hardEval.eligible,
    rank: null,
    matchStrength: softEval.matchStrength,
    rawMatchPoints: softEval.rawMatchPoints,
    matchVersion,
    matchedCriteria: softEval.matchedCriteria,
    failedCriteria: softEval.failedCriteria,
    hardFailures: hardEval.hardFailures,
    warnings: hardEval.warnings,
    opportunityScore: f.leadOpportunityScore,
    qualityScore: f.leadQualityScore,
    freshness: f.leadFreshness,
    explanation,
    calculatedAt,
    isMatch: hardEval.eligible,
    matchPercentage: softEval.matchStrength,
  };

  logMatchingEvent({
    eventType: hardEval.eligible ? 'MATCH_CALCULATED' : 'MATCH_REJECTED',
    leadId: result.leadId,
    developerId: result.developerId,
    eligible: result.eligible,
    matchStrength: result.matchStrength,
    rawMatchPoints: result.rawMatchPoints,
    hardFailureCount: result.hardFailures.length,
    hardFailureCodes: result.hardFailures.map((hf) => String(hf.key)),
    matchVersion: result.matchVersion,
    durationMs: Date.now() - startMs,
  });

  return result;
}

/**
 * Deterministic comparator for ranking MatchResults for a Lead (across developers)
 * or for a Developer (across leads).
 */
export function compareMatchResults(
  a: MatchResult,
  b: MatchResult,
  tieBreakBy: 'developerId' | 'leadId' = 'developerId'
): number {
  // 1. Eligible = true always before eligible = false
  if (a.eligible !== b.eligible) {
    return a.eligible ? -1 : 1;
  }

  // 2. matchStrength DESC
  if (b.matchStrength !== a.matchStrength) {
    return b.matchStrength - a.matchStrength;
  }

  // 3. qualityScore DESC
  if (b.qualityScore !== a.qualityScore) {
    return b.qualityScore - a.qualityScore;
  }

  // 4. opportunityScore DESC
  if (b.opportunityScore !== a.opportunityScore) {
    return b.opportunityScore - a.opportunityScore;
  }

  // 5. Freshness priority (FRESH > AGING > STALE)
  const freshDiff = freshnessRank(b.freshness) - freshnessRank(a.freshness);
  if (freshDiff !== 0) {
    return freshDiff;
  }

  // 6. Deterministic tie-breaker: ID ASC
  if (tieBreakBy === 'leadId') {
    return a.leadId.localeCompare(b.leadId);
  }
  return a.developerId.localeCompare(b.developerId);
}

export interface RankedDevelopersForLeadOutput {
  leadId: string;
  matchVersion: string;
  eligibleDevelopers: MatchResult[];
  rejectedDevelopers: MatchResult[];
  allResults: MatchResult[];
  reason: 'NO_ELIGIBLE_DEVELOPERS' | null;
  diagnostics: NoMatchDiagnostics;
}

/**
 * Evaluates and deterministically ranks all candidate developers for a given lead.
 */
export function rankDevelopersForLead(
  lead: MatchableLeadInput,
  developers: DeveloperMatchingContext[],
  options?: MatchingEvaluationOptions
): RankedDevelopersForLeadOutput {
  const startMs = Date.now();
  const config = resolveMatchingConfig(options?.config);
  const matchVersion = options?.matchVersion || config.currentVersion || 'v1';

  const evaluated = developers.map((dev) => evaluateMatch(lead, dev, options));
  const sorted = [...evaluated].sort((a, b) => compareMatchResults(a, b, 'developerId'));

  const eligibleDevelopers: MatchResult[] = [];
  const rejectedDevelopers: MatchResult[] = [];
  const failureBreakdown: Record<string, number> = {};

  let currentRank = 1;
  for (const res of sorted) {
    if (res.eligible) {
      res.rank = currentRank++;
      eligibleDevelopers.push(res);
    } else {
      res.rank = null;
      rejectedDevelopers.push(res);
      for (const hf of res.hardFailures) {
        const code = String(hf.key);
        failureBreakdown[code] = (failureBreakdown[code] || 0) + 1;
      }
    }
  }

  const breakdownParts = Object.entries(failureBreakdown)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => `${count} failed ${code}`);

  const summary =
    eligibleDevelopers.length > 0
      ? `${eligibleDevelopers.length} of ${evaluated.length} evaluated developers are eligible.`
      : evaluated.length === 0
        ? 'No developers evaluated.'
        : `0 eligible developers out of ${evaluated.length}: ${breakdownParts.join(', ')}.`;

  const summaryAr =
    eligibleDevelopers.length > 0
      ? `${eligibleDevelopers.length} مطورين مؤهلين من أصل ${evaluated.length}.`
      : evaluated.length === 0
        ? 'لم يتم تقييم أي مطورين.'
        : `لا يوجد مطورون مؤهلون من أصل ${evaluated.length} (${breakdownParts.join('، ')}).`;

  if (eligibleDevelopers.length === 0) {
    logMatchingEvent({
      eventType: 'NO_ELIGIBLE_DEVELOPERS',
      leadId: String(lead.id || 'unknown-lead'),
      developerId: null,
      eligible: false,
      matchStrength: 0,
      hardFailureCount: rejectedDevelopers.length,
      hardFailureCodes: Object.keys(failureBreakdown),
      matchVersion,
      durationMs: Date.now() - startMs,
      details: {
        totalEvaluated: evaluated.length,
        failureBreakdown,
      },
    });
  }

  return {
    leadId: String(lead.id || 'unknown-lead'),
    matchVersion,
    eligibleDevelopers,
    rejectedDevelopers,
    allResults: sorted,
    reason: eligibleDevelopers.length === 0 ? 'NO_ELIGIBLE_DEVELOPERS' : null,
    diagnostics: {
      totalEvaluated: evaluated.length,
      eligibleCount: eligibleDevelopers.length,
      rejectedCount: rejectedDevelopers.length,
      failureBreakdown,
      summary,
      summaryAr,
    },
  };
}

export interface RankedLeadsForDeveloperOutput {
  developerId: string;
  matchVersion: string;
  eligibleLeads: Array<{ lead: MatchableLeadInput; match: MatchResult }>;
  rejectedLeads: Array<{ lead: MatchableLeadInput; match: MatchResult }>;
  allResults: Array<{ lead: MatchableLeadInput; match: MatchResult }>;
  diagnostics: NoMatchDiagnostics;
}

/**
 * Evaluates and deterministically ranks all candidate leads for a given developer.
 */
export function rankLeadsForDeveloper(
  developer: DeveloperMatchingContext,
  leads: MatchableLeadInput[],
  options?: MatchingEvaluationOptions
): RankedLeadsForDeveloperOutput {
  const config = resolveMatchingConfig(options?.config);
  const matchVersion = options?.matchVersion || config.currentVersion || 'v1';

  const pairs = leads.map((lead) => ({
    lead,
    match: evaluateMatch(lead, developer, options),
  }));

  pairs.sort((a, b) => compareMatchResults(a.match, b.match, 'leadId'));

  const eligibleLeads: Array<{ lead: MatchableLeadInput; match: MatchResult }> = [];
  const rejectedLeads: Array<{ lead: MatchableLeadInput; match: MatchResult }> = [];
  const failureBreakdown: Record<string, number> = {};

  let currentRank = 1;
  for (const item of pairs) {
    if (item.match.eligible) {
      item.match.rank = currentRank++;
      eligibleLeads.push(item);
    } else {
      item.match.rank = null;
      rejectedLeads.push(item);
      for (const hf of item.match.hardFailures) {
        const code = String(hf.key);
        failureBreakdown[code] = (failureBreakdown[code] || 0) + 1;
      }
    }
  }

  const devId =
    pairs[0]?.match.developerId ||
    developer.developerId ||
    developer.userId ||
    developer.profile?.userId ||
    'unknown-developer';

  const breakdownParts = Object.entries(failureBreakdown)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => `${count} failed ${code}`);

  return {
    developerId: devId,
    matchVersion,
    eligibleLeads,
    rejectedLeads,
    allResults: pairs,
    diagnostics: {
      totalEvaluated: pairs.length,
      eligibleCount: eligibleLeads.length,
      rejectedCount: rejectedLeads.length,
      failureBreakdown,
      summary:
        eligibleLeads.length > 0
          ? `${eligibleLeads.length} of ${pairs.length} leads matched developer ${devId}.`
          : `0 eligible leads out of ${pairs.length}: ${breakdownParts.join(', ')}.`,
      summaryAr:
        eligibleLeads.length > 0
          ? `${eligibleLeads.length} عملاء متطابقون من أصل ${pairs.length}.`
          : `لا يوجد عملاء متطابقون من أصل ${pairs.length}.`,
    },
  };
}

/**
 * Generates a comprehensive Admin Match Debug Report for any `(lead, developer)` pair.
 */
export function generateAdminMatchDebugReport(
  lead: MatchableLeadInput,
  developer: DeveloperMatchingContext | null | undefined,
  options?: MatchingEvaluationOptions
): AdminMatchDebugReport {
  const config = resolveMatchingConfig(options?.config);
  const rules = options?.rules || DEFAULT_MATCHING_RULES;
  const matchVersion = options?.matchVersion || config.currentVersion || 'v1';

  const hardEval = evaluateHardEligibility(lead, developer, config);
  const matchResult = evaluateMatch(lead, developer, {
    ...options,
    config,
    rules,
    matchVersion,
  });

  const dev = hardEval.normalizedDeveloper;
  const f = hardEval.extractedFeatures;

  const passedChecks = hardEval.checks.filter((c) => c.status === 'PASS' || c.status === 'WARN');
  const failedChecks = hardEval.checks.filter((c) => c.status === 'FAIL');

  return {
    leadId: matchResult.leadId,
    developerId: matchResult.developerId,
    leadData: {
      id: matchResult.leadId,
      businessName: lead.businessName || lead.id,
      category: lead.category,
      normalizedNiche: f.leadNiche,
      requiredServices: f.leadAllRequiredServices,
      projectLeadType: f.leadProjectType,
      ownershipType: f.leadOwnershipType,
      city: lead.city || '',
      governorate: lead.governorate || '',
      area: lead.area || lead.district || null,
      budgetInterval: {
        min: f.leadBudgetMin,
        max: f.leadBudgetMax,
        currency: f.leadBudgetCurrency,
        type: f.leadBudgetType,
      },
      opportunityScore: f.leadOpportunityScore,
      qualityScore: f.leadQualityScore,
      qualityStatus: String(lead.qualityStatus || 'HIGH_QUALITY'),
      freshness: f.leadFreshness,
      verificationStatus: f.leadVerificationStatus,
      saleabilityStatus: f.leadSaleabilityStatus,
      isCanonical: lead.isCanonical !== false && !lead.mergedIntoLeadId,
    },
    developerPreferences: {
      developerId: dev.developerId,
      name: dev.name,
      accountStatus: dev.accountStatus,
      profileActive: dev.profileActive,
      acceptingLeads: dev.acceptingLeads,
      isVerified: dev.isVerified,
      services: dev.services,
      preferredServices: dev.preferredServices,
      excludedServices: dev.excludedServices,
      niches: dev.niches,
      preferredNiches: dev.preferredNiches,
      excludedNiches: dev.excludedNiches,
      allNichesMode: dev.allNichesMode,
      locations: dev.rawLocations,
      supportedCities: dev.supportedCities,
      supportedGovernorates: dev.supportedGovernorates,
      supportedDistricts: dev.supportedDistricts,
      preferredCities: dev.preferredCities,
      excludedLocations: dev.excludedLocations,
      allLocationsMode: dev.allLocationsMode,
      budgetRange: {
        min: dev.minBudget,
        max: dev.maxBudget,
        currency: dev.budgetCurrency,
      },
      leadTypePreference: dev.ownershipLeadType,
      supportedLeadTypes: dev.supportedLeadTypes,
      preferredLeadTypes: dev.preferredLeadTypes,
      excludedLeadTypes: dev.excludedLeadTypes,
      subscriptionStatus: String(dev.subscription?.status || 'ACTIVE'),
      planName:
        dev.subscription?.plan?.nameEn ||
        dev.subscription?.plan?.name ||
        dev.subscription?.plan?.slug ||
        'Default',
      allowsExclusive: dev.subscription?.plan?.allowsExclusive !== false,
    },
    hardEligibilityChecks: hardEval.checks,
    passedChecks,
    failedChecks,
    appliedRules: matchResult.matchedCriteria,
    unappliedRules: matchResult.failedCriteria,
    matchPoints: matchResult.rawMatchPoints,
    finalMatchStrength: matchResult.matchStrength,
    eligible: matchResult.eligible,
    resultLabel: matchResult.eligible ? 'ELIGIBLE' : 'REJECTED',
    matchVersion: matchResult.matchVersion,
    calculatedAt: matchResult.calculatedAt,
    matchResult,
  };
}

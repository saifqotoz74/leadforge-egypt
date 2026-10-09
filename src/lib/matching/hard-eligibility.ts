import { evaluateLeadFreshness } from '../freshness';
import {
  getLeadTypeLabel,
  getNicheLabel,
  getServiceLabel,
  normalizeNicheCode,
  normalizeProjectLeadType,
  normalizeServiceCode,
  resolveLeadProjectType,
  resolveLeadRequiredServices,
  resolveLocationHierarchy,
} from './taxonomy';
import {
  DeveloperMatchingContext,
  DeveloperMatchingProfileInput,
  HardEligibilityCheckRecord,
  HardFailureItem,
  LocationMatchTier,
  MatchableLeadInput,
  MatchingConfigData,
  MatchWarningItem,
} from './types';

export interface NormalizedDeveloperContext {
  developerId: string;
  name: string;
  accountStatus: string;
  suspended: boolean;
  inactive: boolean;
  hasProfile: boolean;
  profileActive: boolean;
  acceptingLeads: boolean;
  isVerified: boolean;
  isComplete: boolean;
  activeClaimsCount: number;
  maxActiveLeads: number | null;
  services: string[];
  preferredServices: string[];
  excludedServices: string[];
  niches: string[];
  preferredNiches: string[];
  excludedNiches: string[];
  allNichesMode: boolean;
  nichesExplicitlyProvided: boolean;
  rawLocations: string[];
  supportedCities: string[];
  supportedGovernorates: string[];
  supportedDistricts: string[];
  preferredCities: string[];
  excludedLocations: string[];
  allLocationsMode: boolean;
  minBudget: number;
  maxBudget: number | null;
  preferredMinBudget: number | null;
  preferredMaxBudget: number | null;
  budgetCurrency: string;
  ownershipLeadType: 'BOTH' | 'EXCLUSIVE' | 'SHARED';
  supportedLeadTypes: string[];
  preferredLeadTypes: string[];
  excludedLeadTypes: string[];
  requireSubscription: boolean;
  subscription: DeveloperMatchingContext['subscription'];
}

export interface HardEligibilityEvaluationResult {
  eligible: boolean;
  hardFailures: HardFailureItem[];
  warnings: MatchWarningItem[];
  checks: HardEligibilityCheckRecord[];
  normalizedDeveloper: NormalizedDeveloperContext;
  extractedFeatures: {
    leadPrimaryService: string;
    leadAllRequiredServices: string[];
    leadSecondaryServices: string[];
    serviceMatchTier: 'EXACT_PRIMARY' | 'MULTI_ALL' | 'SECONDARY' | 'NONE';
    matchedPrimaryService: boolean;
    matchedSecondaryServicesCount: number;
    matchedPreferredService: boolean;
    leadNiche: string;
    nicheMatchTier: 'EXACT_NICHE' | 'GENERAL_NICHE' | 'NONE';
    matchedPreferredNiche: boolean;
    leadCityAr: string;
    leadGovernorateAr: string;
    leadAreaAr: string | null;
    locationUnknown: boolean;
    locationMatchTier: LocationMatchTier;
    matchedPreferredCity: boolean;
    leadBudgetMin: number | null;
    leadBudgetMax: number | null;
    leadBudgetCurrency: string;
    leadBudgetType: string;
    budgetUnknown: boolean;
    budgetMatchTier: 'IDEAL_RANGE' | 'ACCEPTABLE_RANGE' | 'NEAR_RANGE' | 'UNKNOWN_ALLOWED' | 'NONE';
    leadProjectType: string;
    leadOwnershipType: 'EXCLUSIVE' | 'SHARED';
    leadTypeMatchTier: 'EXACT_PREFERRED' | 'COMPATIBLE' | 'NONE';
    leadQualityScore: number;
    leadOpportunityScore: number;
    leadFreshness: string;
    leadVerificationStatus: string;
    leadSaleabilityStatus: string;
  };
}

function parseLegacyBudgetRange(range?: string | null): { min: number; max: number | null } | null {
  if (!range || typeof range !== 'string') return null;
  const cleaned = range.replace(/,/g, '').trim();
  const rangeMatch = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    };
  }
  const plusMatch = cleaned.match(/^(\d+)\s*\+$/);
  if (plusMatch) {
    return {
      min: Number(plusMatch[1]),
      max: null,
    };
  }
  return null;
}

export function normalizeDeveloperContext(
  dev?: DeveloperMatchingContext | null
): NormalizedDeveloperContext {
  if (!dev) {
    return {
      developerId: 'unknown-developer',
      name: 'Unknown Developer',
      accountStatus: 'INACTIVE',
      suspended: false,
      inactive: true,
      hasProfile: false,
      profileActive: false,
      acceptingLeads: false,
      isVerified: false,
      isComplete: false,
      activeClaimsCount: 0,
      maxActiveLeads: null,
      services: [],
      preferredServices: [],
      excludedServices: [],
      niches: [],
      preferredNiches: [],
      excludedNiches: [],
      allNichesMode: false,
      nichesExplicitlyProvided: true,
      rawLocations: [],
      supportedCities: [],
      supportedGovernorates: [],
      supportedDistricts: [],
      preferredCities: [],
      excludedLocations: [],
      allLocationsMode: false,
      minBudget: 0,
      maxBudget: null,
      preferredMinBudget: null,
      preferredMaxBudget: null,
      budgetCurrency: 'EGP',
      ownershipLeadType: 'BOTH',
      supportedLeadTypes: [],
      preferredLeadTypes: [],
      excludedLeadTypes: [],
      requireSubscription: false,
      subscription: null,
    };
  }

  const p: DeveloperMatchingProfileInput | null =
    dev.profile !== undefined
      ? dev.profile
      : dev.services !== undefined ||
          dev.locations !== undefined ||
          dev.supportedCities !== undefined ||
          dev.supportedGovernorates !== undefined ||
          dev.niches !== undefined ||
          dev.minBudget !== undefined ||
          dev.budgetRange !== undefined ||
          dev.isComplete !== undefined
        ? dev
        : null;

  const hasProfile = Boolean(p);
  const developerId =
    dev.developerId || dev.userId || p?.developerId || p?.userId || p?.id || 'dev-anonymous';
  const name = dev.name || p?.companyName || developerId;

  const rawStatus = String(dev.userStatus || dev.status || 'ACTIVE').toUpperCase();
  const suspended = Boolean(dev.suspended) || rawStatus === 'SUSPENDED';
  const inactive =
    Boolean(dev.inactive) ||
    rawStatus === 'INACTIVE' ||
    rawStatus === 'PENDING' ||
    p?.isActive === false;

  const profileActive = p ? p.isActive !== false : false;
  const acceptingLeads = p
    ? p.isAcceptingLeads !== false && p.leadReceivingDisabled !== true
    : false;
  const isVerified = p ? p.isVerified !== false : false;

  const excludedServices = Array.from(
    new Set(
      [...(p?.excludedServices || []), ...(p?.disabledServices || [])]
        .map(normalizeServiceCode)
        .filter(Boolean)
    )
  );

  const rawServices = Array.from(
    new Set((p?.services || []).map(normalizeServiceCode).filter(Boolean))
  );
  const activeServices = rawServices.filter((s) => !excludedServices.includes(s));

  const preferredServices = Array.from(
    new Set((p?.preferredServices || []).map(normalizeServiceCode).filter(Boolean))
  );

  const excludedNiches = Array.from(
    new Set((p?.excludedNiches || []).map(normalizeNicheCode).filter(Boolean))
  );
  const nichesExplicitlyProvided = p !== null && Array.isArray(p.niches);
  const rawNiches = Array.from(
    new Set((p?.niches || []).map(normalizeNicheCode).filter(Boolean))
  );
  const activeNiches = rawNiches.filter((n) => n !== 'ALL' && !excludedNiches.includes(n));
  const allNichesMode =
    Boolean(p?.allNichesMode) ||
    rawNiches.includes('ALL') ||
    (!nichesExplicitlyProvided && hasProfile && activeServices.length > 0);

  const preferredNiches = Array.from(
    new Set((p?.preferredNiches || []).map(normalizeNicheCode).filter(Boolean))
  );

  const rawLocations = (p?.locations || []).map((l) => l.trim()).filter(Boolean);
  const explicitCities = (p?.supportedCities || []).map((l) => l.trim()).filter(Boolean);
  const explicitGovernorates = (p?.supportedGovernorates || [])
    .map((l) => l.trim())
    .filter(Boolean);
  const explicitDistricts = (p?.supportedDistricts || []).map((l) => l.trim()).filter(Boolean);

  const allLocationsMode =
    Boolean(p?.allLocationsMode) ||
    rawLocations.some((l) => l.toUpperCase() === 'ALL') ||
    explicitCities.some((l) => l.toUpperCase() === 'ALL') ||
    explicitGovernorates.some((l) => l.toUpperCase() === 'ALL');

  const legacyBudget = parseLegacyBudgetRange(p?.budgetRange);
  const minBudget =
    p?.minProjectBudget !== undefined
      ? Number(p.minProjectBudget)
      : p?.minBudget !== undefined
        ? Number(p.minBudget)
        : legacyBudget
          ? legacyBudget.min
          : 0;
  const maxBudget =
    p?.maxProjectBudget !== undefined
      ? p.maxProjectBudget
      : p?.maxBudget !== undefined
        ? p.maxBudget
        : legacyBudget
          ? legacyBudget.max
          : null;

  const preferredMinBudget = p?.preferredMinBudget ?? null;
  const preferredMaxBudget = p?.preferredMaxBudget ?? null;
  const budgetCurrency = (p?.budgetCurrency || 'EGP').toUpperCase();

  let ownershipLeadType: 'BOTH' | 'EXCLUSIVE' | 'SHARED' = 'BOTH';
  const rawLeadTypeField = String(p?.leadType || 'BOTH').toUpperCase();
  if (rawLeadTypeField === 'EXCLUSIVE' || rawLeadTypeField === 'SHARED') {
    ownershipLeadType = rawLeadTypeField;
  }

  const supportedLeadTypesSet = new Set<string>();
  for (const lt of p?.supportedLeadTypes || []) {
    const norm = normalizeProjectLeadType(lt);
    if (norm) supportedLeadTypesSet.add(norm);
  }
  for (const pref of p?.leadPreferences || []) {
    const norm = normalizeProjectLeadType(pref);
    if (norm) supportedLeadTypesSet.add(norm);
  }
  if (
    rawLeadTypeField &&
    rawLeadTypeField !== 'BOTH' &&
    rawLeadTypeField !== 'EXCLUSIVE' &&
    rawLeadTypeField !== 'SHARED'
  ) {
    const norm = normalizeProjectLeadType(rawLeadTypeField);
    if (norm) supportedLeadTypesSet.add(norm);
  }

  const preferredLeadTypes = Array.from(
    new Set((p?.preferredLeadTypes || []).map(normalizeProjectLeadType).filter(Boolean))
  );
  const excludedLeadTypes = Array.from(
    new Set((p?.excludedLeadTypes || []).map(normalizeProjectLeadType).filter(Boolean))
  );

  const hasLocations =
    allLocationsMode ||
    rawLocations.length > 0 ||
    explicitCities.length > 0 ||
    explicitGovernorates.length > 0 ||
    explicitDistricts.length > 0;
  const hasNiches = allNichesMode || activeNiches.length > 0;
  const isComplete =
    hasProfile &&
    p?.isComplete !== false &&
    activeServices.length > 0 &&
    hasLocations &&
    hasNiches;

  return {
    developerId,
    name,
    accountStatus: suspended ? 'SUSPENDED' : inactive ? 'INACTIVE' : rawStatus,
    suspended,
    inactive,
    hasProfile,
    profileActive,
    acceptingLeads,
    isVerified,
    isComplete,
    activeClaimsCount: Math.max(0, Number(dev.activeClaimsCount || 0)),
    maxActiveLeads: p?.maxActiveLeads ?? null,
    services: activeServices,
    preferredServices,
    excludedServices,
    niches: activeNiches,
    preferredNiches,
    excludedNiches,
    allNichesMode,
    nichesExplicitlyProvided,
    rawLocations,
    supportedCities: explicitCities,
    supportedGovernorates: explicitGovernorates,
    supportedDistricts: explicitDistricts,
    preferredCities: (p?.preferredCities || []).map((c) => c.trim()).filter(Boolean),
    excludedLocations: (p?.excludedLocations || []).map((l) => l.trim()).filter(Boolean),
    allLocationsMode,
    minBudget: Number.isFinite(minBudget) ? minBudget : 0,
    maxBudget: maxBudget !== null && Number.isFinite(Number(maxBudget)) ? Number(maxBudget) : null,
    preferredMinBudget,
    preferredMaxBudget,
    budgetCurrency,
    ownershipLeadType,
    supportedLeadTypes: Array.from(supportedLeadTypesSet),
    preferredLeadTypes,
    excludedLeadTypes,
    requireSubscription: Boolean(dev.requireSubscription),
    subscription: dev.subscription,
  };
}

/**
 * Evaluates Layer A — Hard Eligibility Gates between a Lead and a Developer.
 * Any hard failure immediately renders `eligible = false` and `matchStrength = 0`.
 */
export function evaluateHardEligibility(
  lead: MatchableLeadInput,
  developerInput: DeveloperMatchingContext | null | undefined,
  config: MatchingConfigData
): HardEligibilityEvaluationResult {
  const dev = normalizeDeveloperContext(developerInput);
  const hardFailures: HardFailureItem[] = [];
  const warnings: MatchWarningItem[] = [];
  const checks: HardEligibilityCheckRecord[] = [];

  const addFailure = (
    dimension: HardEligibilityCheckRecord['dimension'],
    key: HardFailureItem['key'],
    subCode: HardFailureItem['subCode'],
    leadValue: string,
    developerPreference: string,
    reason: string,
    reasonAr: string
  ) => {
    hardFailures.push({
      key,
      subCode: subCode || key,
      category: dimension,
      reason,
      reasonAr,
    });
    checks.push({
      dimension,
      status: 'FAIL',
      code: String(subCode || key),
      leadValue,
      developerPreference,
      reason,
      reasonAr,
    });
  };

  const addPass = (
    dimension: HardEligibilityCheckRecord['dimension'],
    code: string,
    leadValue: string,
    developerPreference: string,
    reason: string,
    reasonAr: string,
    isWarn = false
  ) => {
    checks.push({
      dimension,
      status: isWarn ? 'WARN' : 'PASS',
      code,
      leadValue,
      developerPreference,
      reason,
      reasonAr,
    });
  };

  // =========================================================================
  // 1. Developer Status & Readiness
  // =========================================================================
  if (dev.suspended) {
    addFailure(
      'DEVELOPER_STATUS',
      'DEVELOPER_SUSPENDED',
      'DEVELOPER_SUSPENDED',
      'Active Lead',
      `Status: ${dev.accountStatus}`,
      'Developer account is suspended and cannot receive leads.',
      'حساب المطور موقوف ولا يمكنه استقبال العملاء المحتملين.'
    );
  } else if (dev.inactive || !dev.profileActive || !dev.acceptingLeads) {
    const reasonDetail = !dev.acceptingLeads
      ? 'Developer has disabled lead receiving or paused availability.'
      : 'Developer account or profile is inactive.';
    const reasonDetailAr = !dev.acceptingLeads
      ? 'قام المطور بإيقاف استقبال العملاء المحتملين مؤقتاً.'
      : 'حساب المطور أو ملفه التعريفي غير نشط.';
    addFailure(
      'DEVELOPER_STATUS',
      'DEVELOPER_INACTIVE',
      'DEVELOPER_INACTIVE',
      'Active Lead',
      `Status: ${dev.accountStatus}, Active: ${dev.profileActive}, Accepting: ${dev.acceptingLeads}`,
      reasonDetail,
      reasonDetailAr
    );
  } else if (config.requireDeveloperVerified && !dev.isVerified) {
    addFailure(
      'DEVELOPER_STATUS',
      'DEVELOPER_INACTIVE',
      'DEVELOPER_NOT_VERIFIED',
      'Verified Developer Required',
      'Unverified Developer',
      'Developer profile is not verified while verification is required by policy.',
      'ملف المطور غير موثق بينما تتطلب السياسة الحالية توثيق المطورين.'
    );
  } else {
    addPass(
      'DEVELOPER_STATUS',
      'DEVELOPER_ACTIVE',
      'Active Lead',
      `Status: ${dev.accountStatus}, Accepting: true`,
      'Developer is active and accepting leads.',
      'حساب المطور نشط وجاهز لاستقبال العملاء.'
    );
  }

  // =========================================================================
  // 2. Profile Completeness
  // =========================================================================
  if (!dev.isComplete) {
    const missingParts: string[] = [];
    if (!dev.hasProfile) missingParts.push('profile');
    else {
      if (dev.services.length === 0) missingParts.push('services');
      if (
        !dev.allLocationsMode &&
        dev.rawLocations.length === 0 &&
        dev.supportedCities.length === 0 &&
        dev.supportedGovernorates.length === 0 &&
        dev.supportedDistricts.length === 0
      ) {
        missingParts.push('locations');
      }
      if (!dev.allNichesMode && dev.niches.length === 0) {
        missingParts.push('niches');
      }
    }
    const missingDesc = missingParts.length > 0 ? missingParts.join(', ') : 'required configuration';
    addFailure(
      'PROFILE_COMPLETENESS',
      'PROFILE_INCOMPLETE',
      'PROFILE_INCOMPLETE',
      'Complete Profile Required',
      `Missing: ${missingDesc}`,
      `Developer profile is incomplete (missing ${missingDesc}).`,
      `الملف التعريفي للمطور غير مكتمل (ينقصه: ${missingDesc}).`
    );
  } else {
    addPass(
      'PROFILE_COMPLETENESS',
      'PROFILE_COMPLETE',
      'Complete Profile Required',
      `${dev.services.length} services, ${dev.allLocationsMode ? 'All Egypt' : dev.rawLocations.length + dev.supportedCities.length + dev.supportedGovernorates.length} locations`,
      'Developer profile has all required matching configurations.',
      'الملف التعريفي للمطور مكتمل ويحتوي على كافة إعدادات المطابقة.'
    );
  }

  // =========================================================================
  // 3. Subscription, Plan & Entitlement Eligibility
  // =========================================================================
  const isExclusiveLead =
    Boolean(lead.exclusive) || String(lead.leadType || '').toUpperCase() === 'EXCLUSIVE';
  const resolvedProjectType = resolveLeadProjectType(lead);
  const resolvedServices = resolveLeadRequiredServices(lead);

  let planFailed = false;
  if (dev.maxActiveLeads !== null && dev.maxActiveLeads > 0 && dev.activeClaimsCount >= dev.maxActiveLeads) {
    planFailed = true;
    addFailure(
      'SUBSCRIPTION_PLAN',
      'PLAN_NOT_ELIGIBLE',
      'CAPACITY_LIMIT_REACHED',
      `Active Claims: ${dev.activeClaimsCount}`,
      `Max Active Leads: ${dev.maxActiveLeads}`,
      `Developer has reached maximum active lead capacity (${dev.activeClaimsCount}/${dev.maxActiveLeads}).`,
      `وصل المطور للحد الأقصى للعملاء النشطين (${dev.activeClaimsCount}/${dev.maxActiveLeads}).`
    );
  } else if ((config.requireActiveSubscription || dev.requireSubscription) && !dev.subscription) {
    planFailed = true;
    addFailure(
      'SUBSCRIPTION_PLAN',
      'PLAN_NOT_ELIGIBLE',
      'PLAN_NOT_ELIGIBLE',
      'Active Subscription Required',
      'No Subscription',
      'Developer does not have an active subscription required for matching.',
      'لا يمتلك المطور اشتراكاً نشطاً مطلوباً للمطابقة.'
    );
  } else if (dev.subscription) {
    const sub = dev.subscription;
    const subStatus = String(sub.status || 'ACTIVE').toUpperCase();
    const periodEndMs = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
    const isExpiredPeriod =
      periodEndMs !== null && Number.isFinite(periodEndMs) && periodEndMs < Date.now();

    if (subStatus !== 'ACTIVE' || isExpiredPeriod) {
      planFailed = true;
      addFailure(
        'SUBSCRIPTION_PLAN',
        'PLAN_NOT_ELIGIBLE',
        'PLAN_NOT_ELIGIBLE',
        'Active Subscription',
        `Status: ${subStatus}${isExpiredPeriod ? ' (Period Expired)' : ''}`,
        `Developer subscription is not active (${subStatus}).`,
        `اشتراك المطور غير نشط حالياً (${subStatus}).`
      );
    } else if (sub.credits !== undefined && sub.credits <= 0) {
      planFailed = true;
      addFailure(
        'SUBSCRIPTION_PLAN',
        'PLAN_NOT_ELIGIBLE',
        'PLAN_NOT_ELIGIBLE',
        'Credits >= 1',
        `Credits: ${sub.credits}`,
        'Developer has 0 remaining subscription credits.',
        'رصيد نقاط اشتراك المطور يساوي صفر.'
      );
    } else if (sub.plan) {
      const plan = sub.plan;
      if (plan.isActive === false) {
        planFailed = true;
        addFailure(
          'SUBSCRIPTION_PLAN',
          'PLAN_NOT_ELIGIBLE',
          'PLAN_NOT_ELIGIBLE',
          'Active Plan',
          `Plan ${plan.nameEn || plan.name || plan.slug} (Inactive)`,
          'Developer subscription plan is inactive.',
          'باقة اشتراك المطور غير مفعلة.'
        );
      } else if (isExclusiveLead && plan.allowsExclusive === false) {
        planFailed = true;
        addFailure(
          'SUBSCRIPTION_PLAN',
          'PLAN_NOT_ELIGIBLE',
          'PLAN_NOT_ELIGIBLE',
          'Exclusive Lead',
          `Plan ${plan.nameEn || plan.name || 'Basic'} (Shared Only)`,
          'Developer subscription plan does not permit claiming EXCLUSIVE leads.',
          'باقة اشتراك المطور الحالية لا تدعم العملاء الحصريين (EXCLUSIVE).'
        );
      } else if (
        plan.maxConcurrentClaims !== undefined &&
        plan.maxConcurrentClaims > 0 &&
        dev.activeClaimsCount >= plan.maxConcurrentClaims
      ) {
        planFailed = true;
        addFailure(
          'SUBSCRIPTION_PLAN',
          'PLAN_NOT_ELIGIBLE',
          'CAPACITY_LIMIT_REACHED',
          `Active Claims: ${dev.activeClaimsCount}`,
          `Plan Limit: ${plan.maxConcurrentClaims}`,
          `Developer reached plan concurrent claims limit (${dev.activeClaimsCount}/${plan.maxConcurrentClaims}).`,
          `وصل المطور للحد الأقصى المسموح به في الباقة (${dev.activeClaimsCount}/${plan.maxConcurrentClaims}).`
        );
      } else if (
        Array.isArray(plan.supportedServices) &&
        plan.supportedServices.length > 0 &&
        !plan.supportedServices.map(normalizeServiceCode).includes(resolvedServices.primary)
      ) {
        planFailed = true;
        addFailure(
          'SUBSCRIPTION_PLAN',
          'PLAN_NOT_ELIGIBLE',
          'PLAN_NOT_ELIGIBLE',
          resolvedServices.primary,
          `Plan Services: ${plan.supportedServices.join(', ')}`,
          `Developer subscription plan does not cover service ${resolvedServices.primary}.`,
          `باقة اشتراك المطور لا تغطي خدمة ${resolvedServices.primary}.`
        );
      } else if (
        Array.isArray(plan.allowedLeadTiers) &&
        plan.allowedLeadTiers.length > 0 &&
        lead.temperature &&
        !plan.allowedLeadTiers.map((t) => t.toUpperCase()).includes(String(lead.temperature).toUpperCase())
      ) {
        planFailed = true;
        addFailure(
          'SUBSCRIPTION_PLAN',
          'PLAN_NOT_ELIGIBLE',
          'PLAN_NOT_ELIGIBLE',
          `Tier: ${lead.temperature}`,
          `Allowed Tiers: ${plan.allowedLeadTiers.join(', ')}`,
          `Developer subscription plan does not include ${lead.temperature} tier leads.`,
          `باقة اشتراك المطور لا تشمل العملاء من فئة ${lead.temperature}.`
        );
      }
    }
  }

  if (!planFailed) {
    addPass(
      'SUBSCRIPTION_PLAN',
      'PLAN_ELIGIBLE',
      isExclusiveLead ? 'EXCLUSIVE Lead' : 'SHARED Lead',
      dev.subscription?.plan?.nameEn || dev.subscription?.plan?.name || 'Eligible Plan',
      'Developer subscription and capacity are eligible.',
      'اشتراك المطور وسعة الاستيعاب مؤهلان.'
    );
  }

  // =========================================================================
  // 4. Lead Quality & Saleability Gate (Phase 3 Integration)
  // =========================================================================
  const verificationStatus = String(lead.verificationStatus || 'VERIFIED').toUpperCase();
  const qualityStatus = String(lead.qualityStatus || 'HIGH_QUALITY').toUpperCase();
  const rawFreshness = String(lead.freshnessStatus || lead.freshness || '').toUpperCase();
  let freshness = rawFreshness || 'FRESH';
  if ((!rawFreshness || rawFreshness === 'FRESH') && lead.lastVerifiedAt) {
    const dynFreshness = evaluateLeadFreshness(lead.lastVerifiedAt);
    if (dynFreshness.freshnessStatus && dynFreshness.freshnessStatus !== 'UNKNOWN') {
      freshness = dynFreshness.freshnessStatus;
    }
  }
  const saleabilityStatus = String(
    lead.saleabilityStatus || lead.status || 'AVAILABLE'
  ).toUpperCase();
  const businessStatus = String(lead.businessStatus || 'OPEN').toUpperCase();
  const isCanonical = lead.isCanonical !== false && !lead.mergedIntoLeadId;
  const qualityScore =
    typeof lead.qualityScore === 'number'
      ? lead.qualityScore
      : typeof lead.score === 'number'
        ? lead.score
        : 75;
  const opportunityScore =
    typeof lead.opportunityScore === 'number'
      ? lead.opportunityScore
      : typeof lead.score === 'number'
        ? lead.score
        : 75;

  let qualityGateFailed = false;

  if (
    !isCanonical ||
    verificationStatus === 'DUPLICATE' ||
    qualityStatus === 'DUPLICATE' ||
    saleabilityStatus === 'DUPLICATE'
  ) {
    qualityGateFailed = true;
    addFailure(
      'LEAD_QUALITY_GATE',
      'LEAD_NOT_SALEABLE',
      'LEAD_DUPLICATE',
      'DUPLICATE / Non-Canonical',
      'Saleable Canonical Lead Required',
      'Lead is marked as DUPLICATE or merged into another canonical lead (LEAD_NOT_SALEABLE: LEAD_DUPLICATE).',
      'العميل المحتمل مكرر أو مدمج في سجل آخر وغير قابل للبيع (LEAD_DUPLICATE).'
    );
  }

  if (
    verificationStatus === 'INVALID' ||
    verificationStatus === 'FAILED_VERIFICATION' ||
    qualityStatus === 'INVALID' ||
    saleabilityStatus === 'INVALID'
  ) {
    qualityGateFailed = true;
    addFailure(
      'LEAD_QUALITY_GATE',
      'LEAD_NOT_SALEABLE',
      'LEAD_INVALID',
      `Verification: ${verificationStatus}, Quality: ${qualityStatus}`,
      'Valid Lead Required',
      'Lead failed Phase 3 validation and is marked INVALID (LEAD_NOT_SALEABLE: LEAD_INVALID).',
      'العميل المحتمل غير صالح بناءً على فحص الجودة (LEAD_INVALID).'
    );
  }

  if (
    businessStatus === 'CLOSED' ||
    verificationStatus === 'CLOSED' ||
    qualityStatus === 'CLOSED' ||
    saleabilityStatus === 'CLOSED'
  ) {
    qualityGateFailed = true;
    addFailure(
      'LEAD_QUALITY_GATE',
      'LEAD_NOT_SALEABLE',
      'LEAD_CLOSED',
      `Business Status: CLOSED`,
      'Open Business Required',
      'Lead business is permanently or temporarily CLOSED (LEAD_NOT_SALEABLE: LEAD_CLOSED).',
      'النشاط التجاري للعميل مغلق ولا يمكن مطابقته (LEAD_CLOSED).'
    );
  }

  if (
    freshness === 'STALE' ||
    freshness === 'VERY_STALE' ||
    saleabilityStatus === 'STALE'
  ) {
    qualityGateFailed = true;
    addFailure(
      'LEAD_QUALITY_GATE',
      'LEAD_NOT_SALEABLE',
      'LEAD_STALE',
      `Freshness: ${freshness}`,
      'Fresh or Recent Lead Required',
      `Lead data is ${freshness} and blocked from developer matching until re-verified (LEAD_NOT_SALEABLE: LEAD_STALE).`,
      'بيانات العميل قديمة (STALE) وموقوفة عن المطابقة حتى إعادة التحقق.'
    );
    addFailure(
      'FRESHNESS',
      'LEAD_NOT_SALEABLE',
      'LEAD_STALE',
      freshness,
      'FRESH | RECENT | AGING',
      `Lead freshness is ${freshness}.`,
      `حداثة بيانات العميل منتهية (${freshness}).`
    );
  } else {
    const isAgingOrNeedsCheck =
      freshness === 'AGING' ||
      freshness === 'NEEDS_VERIFICATION' ||
      freshness === 'UNKNOWN';
    addPass(
      'FRESHNESS',
      `FRESHNESS_${freshness}`,
      freshness,
      'FRESH | RECENT | AGING',
      `Lead freshness state is ${freshness}.`,
      `حالة حداثة بيانات العميل هي ${freshness}.`,
      isAgingOrNeedsCheck
    );
    if (isAgingOrNeedsCheck) {
      warnings.push({
        key: 'LEAD_AGING_WARNING',
        reason: `Lead verification is ${freshness} and may benefit from refreshing soon.`,
        reasonAr: `بيانات التحقق للعميل بدأت تتقادم (${freshness}) ويُفضّل تحديثها قريباً.`,
      });
    }
  }

  const isClaimedFull =
    saleabilityStatus === 'CLAIMED_FULL' ||
    (typeof lead.maxPurchasers === 'number' &&
      typeof lead.currentPurchasers === 'number' &&
      lead.currentPurchasers >= lead.maxPurchasers);

  const isAlreadyClaimedByDev =
    Array.isArray(lead.claimedDeveloperIds) &&
    Boolean(dev.developerId) &&
    dev.developerId !== 'unknown-developer' &&
    lead.claimedDeveloperIds.includes(dev.developerId);

  if (
    !qualityGateFailed &&
    (saleabilityStatus === 'NOT_SALEABLE' ||
      saleabilityStatus === 'HIDDEN' ||
      saleabilityStatus === 'ARCHIVED' ||
      saleabilityStatus === 'EXPIRED' ||
      isClaimedFull ||
      isAlreadyClaimedByDev ||
      (lead.qualityScore !== undefined && lead.qualityScore < config.minSaleableQualityScore))
  ) {
    qualityGateFailed = true;
    const detail = isAlreadyClaimedByDev
      ? 'ALREADY_CLAIMED_BY_DEVELOPER'
      : isClaimedFull
        ? 'CLAIMED_FULL'
        : lead.qualityScore !== undefined && lead.qualityScore < config.minSaleableQualityScore
          ? `QualityScore ${lead.qualityScore} < ${config.minSaleableQualityScore}`
          : saleabilityStatus;
    addFailure(
      'LEAD_QUALITY_GATE',
      'LEAD_NOT_SALEABLE',
      'LEAD_NOT_SALEABLE',
      `Saleability: ${detail}`,
      'AVAILABLE / SALEABLE',
      isAlreadyClaimedByDev
        ? 'Lead has already been claimed by this developer (LEAD_NOT_SALEABLE).'
        : `Lead is not saleable (${detail}) (LEAD_NOT_SALEABLE).`,
      isAlreadyClaimedByDev
        ? 'تم شراء هذا العميل مسبقاً من قِبل نفس المطور.'
        : `العميل المحتمل غير متاح للبيع (${detail}).`
    );
  }

  const requiresVerification =
    verificationStatus === 'REQUIRES_VERIFICATION' ||
    verificationStatus === 'UNVERIFIED' ||
    qualityStatus === 'NEEDS_REVIEW' ||
    saleabilityStatus === 'REQUIRES_VERIFICATION' ||
    freshness === 'NEEDS_VERIFICATION' ||
    freshness === 'UNKNOWN';

  if (!qualityGateFailed && requiresVerification) {
    if (config.requiresVerificationPolicy === 'EXCLUDE') {
      qualityGateFailed = true;
      addFailure(
        'LEAD_QUALITY_GATE',
        'LEAD_NOT_SALEABLE',
        'LEAD_REQUIRES_VERIFICATION',
        `Verification: ${verificationStatus}, Quality: ${qualityStatus}`,
        'Policy: EXCLUDE unverified leads',
        'Lead requires verification before it can be matched under current policy (LEAD_NOT_SALEABLE: LEAD_REQUIRES_VERIFICATION).',
        'العميل يحتاج إلى مراجعة وتحقق قبل السماح بمطابقته حسب السياسة الحالية.'
      );
    } else if (config.requiresVerificationPolicy === 'VERIFIED_DEVELOPERS_ONLY' && !dev.isVerified) {
      qualityGateFailed = true;
      addFailure(
        'LEAD_QUALITY_GATE',
        'LEAD_NOT_SALEABLE',
        'LEAD_REQUIRES_VERIFICATION',
        'Requires Verification',
        'Verified Developer Only',
        'Lead requires verification and developer is not verified (LEAD_NOT_SALEABLE: LEAD_REQUIRES_VERIFICATION).',
        'العميل يحتاج إلى تحقق والمطور غير موثق.'
      );
    } else {
      warnings.push({
        key: 'LEAD_REQUIRES_VERIFICATION_WARNING',
        reason: 'Lead is flagged as REQUIRES_VERIFICATION; included with penalty/warning per policy.',
        reasonAr: 'العميل موسوم بأنه يحتاج إلى تحقق إضافي؛ تم تضمينه مع تنبيه حسب السياسة.',
      });
      addPass(
        'LEAD_QUALITY_GATE',
        'LEAD_REQUIRES_VERIFICATION_ALLOWED',
        `Verification: ${verificationStatus}`,
        `Policy: ${config.requiresVerificationPolicy}`,
        'Lead requires verification but is permitted by active policy with warning.',
        'العميل يحتاج إلى تحقق ولكنه مسموح به مع تنبيه وفق السياسة الحالية.',
        true
      );
    }
  } else if (!qualityGateFailed) {
    addPass(
      'LEAD_QUALITY_GATE',
      'LEAD_SALEABLE',
      `Status: ${saleabilityStatus}, Quality: ${qualityScore}`,
      `Min Quality: ${config.minSaleableQualityScore}`,
      'Lead passed all Phase 3 quality, verification, and saleability gates.',
      'اجتاز العميل جميع بوابات الجودة والتحقق والقابلية للبيع.'
    );
  }

  // =========================================================================
  // 5. Service Compatibility
  // =========================================================================
  const { primary, allRequired, compatibleServices, secondary, isExplicit } = resolvedServices;
  let serviceMatchTier: 'EXACT_PRIMARY' | 'MULTI_ALL' | 'SECONDARY' | 'NONE' = 'NONE';
  let matchedPrimaryService = false;
  let matchedSecondaryServicesCount = 0;
  let matchedPreferredService = false;

  const isPrimaryExcluded = dev.excludedServices.includes(primary);
  const isAnyRequiredExcluded =
    config.serviceMatchMode === 'ALL_REQUIRED' &&
    allRequired.some((req) => dev.excludedServices.includes(req));

  if (dev.services.length === 0 || isPrimaryExcluded || isAnyRequiredExcluded) {
    const srvLabel = getServiceLabel(primary);
    addFailure(
      'SERVICE',
      'SERVICE_NOT_SUPPORTED',
      'SERVICE_NOT_SUPPORTED',
      allRequired.join(', '),
      dev.services.length > 0 ? dev.services.join(', ') : 'None',
      isPrimaryExcluded || isAnyRequiredExcluded
        ? `Developer explicitly excluded required service (${srvLabel.en}).`
        : `Developer does not support required service (${srvLabel.en}).`,
      isPrimaryExcluded || isAnyRequiredExcluded
        ? `المطور استبعد الخدمة المطلوبة (${srvLabel.ar}).`
        : `المطور لا يقدم الخدمة المطلوبة (${srvLabel.ar}).`
    );
  } else if (isExplicit && allRequired.length > 1) {
    const matchedReq = allRequired.filter((req) => dev.services.includes(req));
    matchedPrimaryService = dev.services.includes(primary);
    matchedSecondaryServicesCount = secondary.filter((sec) => dev.services.includes(sec)).length;
    matchedPreferredService = matchedReq.some((req) => dev.preferredServices.includes(req));

    if (config.serviceMatchMode === 'ALL_REQUIRED') {
      if (matchedReq.length === allRequired.length) {
        serviceMatchTier = 'MULTI_ALL';
        addPass(
          'SERVICE',
          'SERVICE_MULTI_ALL_MATCHED',
          allRequired.join(', '),
          dev.services.join(', '),
          `Developer supports all ${allRequired.length} required services (${allRequired.join(', ')}).`,
          `المطور يدعم جميع الخدمات المطلوبة (${allRequired.join('، ')}).`
        );
      } else {
        const missing = allRequired.filter((req) => !dev.services.includes(req));
        addFailure(
          'SERVICE',
          'SERVICE_NOT_SUPPORTED',
          'SERVICE_NOT_SUPPORTED',
          allRequired.join(', '),
          dev.services.join(', '),
          `Developer is missing required services in ALL_REQUIRED mode: ${missing.join(', ')}.`,
          `المطور لا يدعم كافة الخدمات الإلزامية المطلوبة: ${missing.join('، ')}.`
        );
      }
    } else {
      // ANY_REQUIRED
      if (matchedReq.length > 0) {
        serviceMatchTier = matchedPrimaryService ? 'EXACT_PRIMARY' : 'SECONDARY';
        addPass(
          'SERVICE',
          'SERVICE_ANY_MATCHED',
          allRequired.join(', '),
          dev.services.join(', '),
          `Developer supports ${matchedReq.join(', ')} (ANY_REQUIRED mode).`,
          `المطور يدعم الخدمة المطلوبة (${matchedReq.join('، ')}).`
        );
      } else {
        addFailure(
          'SERVICE',
          'SERVICE_NOT_SUPPORTED',
          'SERVICE_NOT_SUPPORTED',
          allRequired.join(', '),
          dev.services.join(', '),
          `Developer does not support any of the required services: ${allRequired.join(', ')}.`,
          `المطور لا يدعم أياً من الخدمات المطلوبة: ${allRequired.join('، ')}.`
        );
      }
    }
  } else {
    // Single required service or derived service
    matchedPrimaryService = dev.services.includes(primary);
    matchedSecondaryServicesCount = secondary.filter((sec) => dev.services.includes(sec)).length;
    const matchedCompatible = compatibleServices.filter((c) => dev.services.includes(c));
    matchedPreferredService =
      (matchedPrimaryService && dev.preferredServices.includes(primary)) ||
      matchedCompatible.some((c) => dev.preferredServices.includes(c));

    if (matchedPrimaryService) {
      serviceMatchTier = 'EXACT_PRIMARY';
      const srvLabel = getServiceLabel(primary);
      addPass(
        'SERVICE',
        'SERVICE_PRIMARY_MATCHED',
        primary,
        dev.services.join(', '),
        `Developer directly supports primary required service: ${srvLabel.en}.`,
        `المطور يدعم الخدمة الأساسية المطلوبة مباشرة: ${srvLabel.ar}.`
      );
    } else if (
      matchedCompatible.length > 0 ||
      (config.serviceMatchMode === 'ANY_REQUIRED' && matchedSecondaryServicesCount > 0)
    ) {
      serviceMatchTier = 'SECONDARY';
      const matchedName = matchedCompatible[0] || secondary.find((s) => dev.services.includes(s)) || primary;
      const srvLabel = getServiceLabel(matchedName);
      addPass(
        'SERVICE',
        'SERVICE_SECONDARY_MATCHED',
        primary,
        dev.services.join(', '),
        `Developer supports compatible service: ${srvLabel.en}.`,
        `المطور يدعم خدمة متوافقة مع طلب العميل: ${srvLabel.ar}.`
      );
    } else {
      const srvLabel = getServiceLabel(primary);
      addFailure(
        'SERVICE',
        'SERVICE_NOT_SUPPORTED',
        'SERVICE_NOT_SUPPORTED',
        primary,
        dev.services.join(', '),
        `Developer does not offer required service ${srvLabel.en} (${primary}).`,
        `المطور لا يقدم الخدمة المطلوبة: ${srvLabel.ar}.`
      );
    }
  }

  // =========================================================================
  // 6. Niche / Business Category Compatibility
  // =========================================================================
  const leadNiche = normalizeNicheCode(lead.niche || lead.category);
  const nicheLabel = getNicheLabel(leadNiche);
  let nicheMatchTier: 'EXACT_NICHE' | 'GENERAL_NICHE' | 'NONE' = 'NONE';
  const matchedPreferredNiche = dev.preferredNiches.includes(leadNiche);

  if (dev.excludedNiches.includes(leadNiche)) {
    addFailure(
      'NICHE',
      'NICHE_EXCLUDED',
      'NICHE_EXCLUDED',
      leadNiche,
      `Excluded: ${dev.excludedNiches.join(', ')}`,
      `Developer explicitly excluded niche ${nicheLabel.en} (${leadNiche}).`,
      `المطور استبعد تخصص النشاط التجاري (${nicheLabel.ar}) بشكل صريح.`
    );
  } else if (dev.niches.includes(leadNiche)) {
    nicheMatchTier = 'EXACT_NICHE';
    addPass(
      'NICHE',
      'NICHE_EXACT_MATCH',
      leadNiche,
      dev.niches.join(', '),
      `Developer specializes in ${nicheLabel.en} (${leadNiche}).`,
      `المطور متخصص في مجال ${nicheLabel.ar}.`
    );
  } else if (dev.allNichesMode) {
    nicheMatchTier = 'GENERAL_NICHE';
    addPass(
      'NICHE',
      'NICHE_GENERAL_MATCH',
      leadNiche,
      'ALL_NICHES',
      `Developer accepts general business niches including ${nicheLabel.en}.`,
      `المطور يقبل جميع المجالات التجارية بما فيها ${nicheLabel.ar}.`
    );
  } else {
    addFailure(
      'NICHE',
      'NICHE_EXCLUDED',
      'NICHE_NOT_SUPPORTED',
      leadNiche,
      dev.niches.length > 0 ? dev.niches.join(', ') : 'None',
      `Developer does not support business niche ${nicheLabel.en} (${leadNiche}).`,
      `المطور لا يدعم مجال النشاط التجاري (${nicheLabel.ar}).`
    );
  }

  // =========================================================================
  // 7. Location Compatibility (Egyptian Geographic Hierarchy)
  // =========================================================================
  const resolvedCity = resolveLocationHierarchy(lead.city);
  const resolvedGov = resolveLocationHierarchy(lead.governorate);
  const resolvedArea = resolveLocationHierarchy(lead.area || lead.district);

  const locationUnknown = !resolvedCity && !resolvedGov;
  const leadCityAr = resolvedCity?.parentCityAr || resolvedCity?.canonicalAr || '';
  const leadGovernorateAr =
    resolvedGov?.governorateAr || resolvedCity?.governorateAr || resolvedArea?.governorateAr || '';
  const leadAreaAr =
    resolvedArea?.canonicalAr ||
    (resolvedCity?.isDistrictName ? resolvedCity.canonicalAr : null);

  let locationMatchTier: LocationMatchTier = 'NONE';
  let matchedPreferredCity = false;

  if (locationUnknown) {
    if (config.unknownLocationPolicy === 'FAIL') {
      addFailure(
        'LOCATION',
        'LOCATION_NOT_SUPPORTED',
        'LOCATION_NOT_SUPPORTED',
        'UNKNOWN',
        'Valid Location Required',
        'Lead location is missing or unknown and policy is set to FAIL.',
        'موقع العميل غير معروف وسياسة المطابقة ترفض المواقع المجهولة.'
      );
    } else if (
      config.unknownLocationPolicy === 'REQUIRE_VERIFICATION' &&
      verificationStatus !== 'VERIFIED'
    ) {
      addFailure(
        'LOCATION',
        'LOCATION_NOT_SUPPORTED',
        'LOCATION_NOT_SUPPORTED',
        'UNKNOWN (Unverified)',
        'Verified Location Required',
        'Lead location is unknown and lead is not verified.',
        'موقع العميل غير معروف والعميل غير موثق.'
      );
    } else {
      locationMatchTier = 'UNKNOWN_ALLOWED';
      warnings.push({
        key: 'UNKNOWN_LOCATION_PENALTY',
        reason: 'Lead location is unknown; allowed with penalty per policy.',
        reasonAr: 'موقع العميل غير محدد؛ تم السماح به مع خصم نقاط حسب السياسة.',
      });
      addPass(
        'LOCATION',
        'LOCATION_UNKNOWN_ALLOWED',
        'UNKNOWN',
        `Policy: ${config.unknownLocationPolicy}`,
        'Lead location is unknown; permitted with score penalty.',
        'موقع العميل غير محدد؛ مسموح به مع خصم نقاط.',
        true
      );
    }
  } else {
    // Check explicit location exclusions first
    const normExcluded = dev.excludedLocations
      .map(resolveLocationHierarchy)
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const isExcludedLocation = normExcluded.some((ex) => {
      if (ex.isDistrictName && leadAreaAr && ex.canonicalAr === leadAreaAr) return true;
      if (ex.isCityName && !ex.isGovernorateName && ex.canonicalAr === leadCityAr) return true;
      if (
        ex.isGovernorateName &&
        ex.governorateAr === leadGovernorateAr &&
        (!ex.isCityName || ex.canonicalAr === leadCityAr || ex.governorateAr === leadGovernorateAr)
      ) {
        return true;
      }
      return ex.canonicalAr === resolvedCity?.canonicalAr || ex.canonicalAr === leadGovernorateAr;
    });

    if (isExcludedLocation) {
      addFailure(
        'LOCATION',
        'LOCATION_NOT_SUPPORTED',
        'LOCATION_EXCLUDED',
        `${lead.city || ''}, ${lead.governorate || ''}`.trim(),
        `Excluded: ${dev.excludedLocations.join(', ')}`,
        `Developer explicitly excluded location ${lead.city || lead.governorate}.`,
        `المطور استبعد النطاق الجغرافي (${lead.city || lead.governorate}) بشكل صريح.`
      );
    } else {
      // Resolve developer supported cities, governorates, districts, and combined locations
      const devCityEntries = dev.supportedCities
        .map(resolveLocationHierarchy)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const devGovEntries = dev.supportedGovernorates
        .map(resolveLocationHierarchy)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const devDistrictEntries = dev.supportedDistricts
        .map(resolveLocationHierarchy)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const devGeneralEntries = dev.rawLocations
        .map(resolveLocationHierarchy)
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const devPrefCities = dev.preferredCities
        .map(resolveLocationHierarchy)
        .filter((x): x is NonNullable<typeof x> => x !== null);

      matchedPreferredCity = devPrefCities.some(
        (pref) =>
          pref.canonicalAr === resolvedCity?.canonicalAr ||
          pref.canonicalAr === leadCityAr ||
          (leadAreaAr && pref.canonicalAr === leadAreaAr)
      );

      // 1. Check Exact District or Exact City match
      const exactDistrictMatch =
        leadAreaAr !== null &&
        (devDistrictEntries.some((d) => d.canonicalAr === leadAreaAr) ||
          devCityEntries.some((c) => c.canonicalAr === leadAreaAr) ||
          devGeneralEntries.some((g) => g.canonicalAr === leadAreaAr));

      const exactCityExplicitMatch =
        devCityEntries.some(
          (c) =>
            c.canonicalAr === resolvedCity?.canonicalAr ||
            (c.canonicalAr === leadCityAr && Boolean(leadCityAr))
        ) ||
        devGeneralEntries.some(
          (g) =>
            // If lead is in a specific sub-city like 'New Cairo' and developer only put 'Cairo' in general locations,
            // that is a Governorate match unless lead's city is also 'Cairo' (or a district of 'Cairo' city like Nasr City).
            g.canonicalAr === resolvedCity?.canonicalAr ||
            (resolvedCity?.isDistrictName && g.canonicalAr === leadCityAr)
        );

      const governorateMatch =
        devGovEntries.some((gov) => gov.governorateAr === leadGovernorateAr) ||
        devGeneralEntries.some(
          (g) => g.isGovernorateName && g.governorateAr === leadGovernorateAr
        ) ||
        devCityEntries.some(
          (c) => c.isGovernorateName && c.governorateAr === leadGovernorateAr && devGovEntries.length === 0
        );

      if (exactDistrictMatch || exactCityExplicitMatch) {
        locationMatchTier = 'EXACT_CITY';
        addPass(
          'LOCATION',
          'LOCATION_EXACT_CITY_MATCH',
          `${lead.city} (${lead.governorate})`,
          [...dev.supportedCities, ...dev.rawLocations, ...dev.supportedDistricts].join(', '),
          `Developer directly serves ${lead.city} (${leadCityAr}).`,
          `المطور يغطي مدينة/منطقة ${lead.city} بشكل مباشر.`
        );
      } else if (governorateMatch) {
        locationMatchTier = 'GOVERNORATE';
        addPass(
          'LOCATION',
          'LOCATION_GOVERNORATE_MATCH',
          `${lead.city} (${lead.governorate})`,
          [...dev.supportedGovernorates, ...dev.rawLocations].join(', '),
          `Developer covers governorate ${leadGovernorateAr} containing ${lead.city}.`,
          `المطور يغطي محافظة ${leadGovernorateAr} التي تتبعها ${lead.city}.`
        );
      } else if (dev.allLocationsMode) {
        locationMatchTier = 'SERVICE_AREA';
        addPass(
          'LOCATION',
          'LOCATION_SERVICE_AREA_MATCH',
          `${lead.city} (${lead.governorate})`,
          'All Egypt / Remote Service Area',
          'Developer serves all Egyptian governorates (All-Egypt mode).',
          'المطور يخدم جميع محافظات مصر.'
        );
      } else {
        addFailure(
          'LOCATION',
          'LOCATION_NOT_SUPPORTED',
          'LOCATION_NOT_SUPPORTED',
          `${lead.city} (${lead.governorate})`,
          [...dev.supportedCities, ...dev.supportedGovernorates, ...dev.rawLocations].join(', ') ||
            'None',
          `Developer does not cover ${lead.city} or governorate ${lead.governorate}.`,
          `المطور لا يغطي مدينة ${lead.city} أو محافظة ${lead.governorate}.`
        );
      }
    }
  }

  // =========================================================================
  // 8. Budget Compatibility
  // =========================================================================
  const hasExplicitMinMax =
    (lead.minBudget !== undefined && lead.minBudget !== null) ||
    (lead.maxBudget !== undefined && lead.maxBudget !== null);
  const hasEstimatedBudget =
    lead.estimatedBudget !== undefined &&
    lead.estimatedBudget !== null &&
    Number(lead.estimatedBudget) > 0;

  const budgetUnknown =
    !hasExplicitMinMax &&
    !hasEstimatedBudget &&
    String(lead.budgetType || '').toUpperCase() !== 'FIXED';

  const leadBudgetMin: number | null = budgetUnknown
    ? null
    : Number(lead.minBudget ?? lead.estimatedBudget ?? lead.maxBudget ?? 0);
  const leadBudgetMax: number | null = budgetUnknown
    ? null
    : Number(lead.maxBudget ?? lead.estimatedBudget ?? lead.minBudget ?? 0);
  const leadBudgetCurrency = String(lead.budgetCurrency || 'EGP').toUpperCase();
  const leadBudgetType = String(
    lead.budgetType ||
      (budgetUnknown
        ? 'UNKNOWN'
        : lead.minBudget != null && lead.maxBudget != null && lead.minBudget !== lead.maxBudget
          ? 'RANGE'
          : 'ESTIMATED')
  ).toUpperCase();

  let budgetMatchTier:
    | 'IDEAL_RANGE'
    | 'ACCEPTABLE_RANGE'
    | 'NEAR_RANGE'
    | 'UNKNOWN_ALLOWED'
    | 'NONE' = 'NONE';

  if (budgetUnknown || leadBudgetMin === null || leadBudgetMax === null) {
    if (config.unknownBudgetPolicy === 'FAIL') {
      addFailure(
        'BUDGET',
        'BUDGET_INCOMPATIBLE',
        'BUDGET_INCOMPATIBLE',
        'UNKNOWN',
        `${dev.minBudget} - ${dev.maxBudget ?? '∞'} ${dev.budgetCurrency}`,
        'Lead budget is unknown and policy requires a known compatible budget.',
        'ميزانية العميل غير محددة وسياسة المطابقة تشترط وجود ميزانية واضحة.'
      );
    } else if (
      config.unknownBudgetPolicy === 'REQUIRE_VERIFICATION' &&
      verificationStatus !== 'VERIFIED'
    ) {
      addFailure(
        'BUDGET',
        'BUDGET_INCOMPATIBLE',
        'BUDGET_INCOMPATIBLE',
        'UNKNOWN (Unverified)',
        `${dev.minBudget} - ${dev.maxBudget ?? '∞'} ${dev.budgetCurrency}`,
        'Lead budget is unknown and lead is unverified.',
        'ميزانية العميل غير معروفة والعميل غير موثق.'
      );
    } else {
      budgetMatchTier = 'UNKNOWN_ALLOWED';
      warnings.push({
        key: 'UNKNOWN_BUDGET_PENALTY',
        reason: 'Lead budget is unknown; allowed with penalty per policy.',
        reasonAr: 'ميزانية العميل غير محددة؛ مسموح بها مع خصم نقاط حسب السياسة.',
      });
      addPass(
        'BUDGET',
        'BUDGET_UNKNOWN_ALLOWED',
        'UNKNOWN',
        `${dev.minBudget} - ${dev.maxBudget ?? '∞'} ${dev.budgetCurrency}`,
        'Lead budget is unknown; permitted with score adjustment.',
        'ميزانية العميل غير محددة؛ تم السماح بها مع تعديل التقييم.',
        true
      );
    }
  } else if (leadBudgetCurrency !== dev.budgetCurrency) {
    addFailure(
      'BUDGET',
      'BUDGET_INCOMPATIBLE',
      'BUDGET_INCOMPATIBLE',
      `${leadBudgetMin}-${leadBudgetMax} ${leadBudgetCurrency}`,
      `${dev.minBudget}-${dev.maxBudget ?? '∞'} ${dev.budgetCurrency}`,
      `Currency mismatch: Lead budget is in ${leadBudgetCurrency} while developer requires ${dev.budgetCurrency}.`,
      `عدم توافق العملة: ميزانية العميل بعملة ${leadBudgetCurrency} بينما المطور يحدد ${dev.budgetCurrency}.`
    );
  } else {
    const devMin = dev.minBudget;
    const devMax = dev.maxBudget;
    const overlaps = leadBudgetMax >= devMin && (devMax === null || leadBudgetMin <= devMax);

    if (overlaps) {
      const prefMin = dev.preferredMinBudget ?? devMin;
      const prefMax = dev.preferredMaxBudget ?? devMax;
      const inPreferred =
        leadBudgetMin >= prefMin && (prefMax === null || leadBudgetMax <= prefMax);

      if (inPreferred) {
        budgetMatchTier = 'IDEAL_RANGE';
        addPass(
          'BUDGET',
          'BUDGET_IDEAL_MATCH',
          `${leadBudgetMin === leadBudgetMax ? leadBudgetMin : `${leadBudgetMin}-${leadBudgetMax}`} ${leadBudgetCurrency}`,
          `${devMin}-${devMax ?? '∞'} ${dev.budgetCurrency}`,
          `Lead budget (${leadBudgetMin}-${leadBudgetMax} ${leadBudgetCurrency}) fits within developer ideal range.`,
          `ميزانية العميل (${leadBudgetMin}-${leadBudgetMax} ${leadBudgetCurrency}) تقع بالكامل ضمن النطاق المثالي للمطور.`
        );
      } else {
        budgetMatchTier = 'ACCEPTABLE_RANGE';
        addPass(
          'BUDGET',
          'BUDGET_ACCEPTABLE_OVERLAP',
          `${leadBudgetMin}-${leadBudgetMax} ${leadBudgetCurrency}`,
          `${devMin}-${devMax ?? '∞'} ${dev.budgetCurrency}`,
          `Lead budget range overlaps with developer acceptable range.`,
          `نطاق ميزانية العميل يتقاطع مع النطاق المقبول للمطور.`
        );
      }
    } else {
      // Does not overlap
      const toleranceMin = Math.round(devMin * 0.85);
      const toleranceMax = devMax !== null ? Math.round(devMax * 1.15) : null;
      const nearOverlap =
        !config.budgetHardRequirement &&
        leadBudgetMax >= toleranceMin &&
        (toleranceMax === null || leadBudgetMin <= toleranceMax);

      if (nearOverlap) {
        budgetMatchTier = 'NEAR_RANGE';
        warnings.push({
          key: 'BUDGET_NEAR_THRESHOLD_WARNING',
          reason: 'Lead budget is slightly outside developer target range but within soft tolerance.',
          reasonAr: 'ميزانية العميل قريبة من الحد الأدنى للمطور ومسموح بها ضمن هامش المرونة.',
        });
        addPass(
          'BUDGET',
          'BUDGET_NEAR_MATCH',
          `${leadBudgetMin}-${leadBudgetMax} ${leadBudgetCurrency}`,
          `${devMin}-${devMax ?? '∞'} ${dev.budgetCurrency}`,
          'Lead budget is near developer threshold (soft budget mode).',
          'ميزانية العميل قريبة من نطاق المطور.',
          true
        );
      } else {
        addFailure(
          'BUDGET',
          'BUDGET_INCOMPATIBLE',
          'BUDGET_INCOMPATIBLE',
          `${leadBudgetMin === leadBudgetMax ? leadBudgetMin : `${leadBudgetMin}-${leadBudgetMax}`} ${leadBudgetCurrency}`,
          `${devMin}-${devMax ?? '∞'} ${dev.budgetCurrency}`,
          `Lead budget (${leadBudgetMin === leadBudgetMax ? leadBudgetMin : `${leadBudgetMin}-${leadBudgetMax}`} ${leadBudgetCurrency}) is outside developer budget range (${devMin}-${devMax ?? '∞'} ${dev.budgetCurrency}).`,
          `ميزانية العميل (${leadBudgetMin === leadBudgetMax ? leadBudgetMin : `${leadBudgetMin}-${leadBudgetMax}`} ${leadBudgetCurrency}) خارج النطاق المالي للمطور (${devMin}-${devMax ?? '∞'} ${dev.budgetCurrency}).`
        );
      }
    }
  }

  // =========================================================================
  // 9. Lead Type Compatibility (Ownership Type + Project Lead Type)
  // =========================================================================
  const leadOwnershipType: 'EXCLUSIVE' | 'SHARED' = isExclusiveLead ? 'EXCLUSIVE' : 'SHARED';
  // Support cases where unit test passes project lead type in `lead.leadType` or `lead.projectLeadType`
  const rawLeadTypeUpper = String(lead.leadType || '').toUpperCase();
  const effectiveProjectType =
    lead.projectLeadType
      ? normalizeProjectLeadType(lead.projectLeadType)
      : rawLeadTypeUpper &&
          rawLeadTypeUpper !== 'SHARED' &&
          rawLeadTypeUpper !== 'EXCLUSIVE' &&
          rawLeadTypeUpper !== 'BOTH'
        ? normalizeProjectLeadType(rawLeadTypeUpper)
        : resolvedProjectType;

  let leadTypeMatchTier: 'EXACT_PREFERRED' | 'COMPATIBLE' | 'NONE' = 'NONE';
  let leadTypeFailed = false;

  if (dev.ownershipLeadType === 'EXCLUSIVE' && leadOwnershipType !== 'EXCLUSIVE') {
    leadTypeFailed = true;
    addFailure(
      'LEAD_TYPE',
      'LEAD_TYPE_NOT_SUPPORTED',
      'LEAD_TYPE_NOT_SUPPORTED',
      `Ownership: ${leadOwnershipType}`,
      `Required Ownership: EXCLUSIVE`,
      'Developer only accepts EXCLUSIVE leads, but this lead is SHARED.',
      'المطور يقبل العملاء الحصريين (EXCLUSIVE) فقط وهذا العميل مشترك (SHARED).'
    );
  } else if (dev.ownershipLeadType === 'SHARED' && leadOwnershipType !== 'SHARED') {
    leadTypeFailed = true;
    addFailure(
      'LEAD_TYPE',
      'LEAD_TYPE_NOT_SUPPORTED',
      'LEAD_TYPE_NOT_SUPPORTED',
      `Ownership: ${leadOwnershipType}`,
      `Required Ownership: SHARED`,
      'Developer only accepts SHARED leads, but this lead is EXCLUSIVE.',
      'المطور يقبل العملاء المشتركين (SHARED) فقط وهذا العميل حصري (EXCLUSIVE).'
    );
  }

  if (!leadTypeFailed && dev.excludedLeadTypes.includes(effectiveProjectType)) {
    leadTypeFailed = true;
    const ltLabel = getLeadTypeLabel(effectiveProjectType);
    addFailure(
      'LEAD_TYPE',
      'LEAD_TYPE_NOT_SUPPORTED',
      'LEAD_TYPE_EXCLUDED',
      effectiveProjectType,
      `Excluded: ${dev.excludedLeadTypes.join(', ')}`,
      `Developer explicitly excluded project lead type ${ltLabel.en} (${effectiveProjectType}).`,
      `المطور استبعد نوع المشروع (${ltLabel.ar}) بشكل صريح.`
    );
  }

  if (
    !leadTypeFailed &&
    dev.supportedLeadTypes.length > 0 &&
    !dev.supportedLeadTypes.includes('ALL') &&
    !dev.supportedLeadTypes.includes(effectiveProjectType)
  ) {
    leadTypeFailed = true;
    const ltLabel = getLeadTypeLabel(effectiveProjectType);
    addFailure(
      'LEAD_TYPE',
      'LEAD_TYPE_NOT_SUPPORTED',
      'LEAD_TYPE_NOT_SUPPORTED',
      effectiveProjectType,
      dev.supportedLeadTypes.join(', '),
      `Developer only accepts lead types [${dev.supportedLeadTypes.join(', ')}], not ${ltLabel.en} (${effectiveProjectType}).`,
      `المطور لا يقبل هذا النوع من المشاريع (${ltLabel.ar}).`
    );
  }

  if (!leadTypeFailed) {
    const isExplicitlyPreferred =
      dev.preferredLeadTypes.includes(effectiveProjectType) ||
      (dev.supportedLeadTypes.length > 0 &&
        !dev.supportedLeadTypes.includes('ALL') &&
        dev.supportedLeadTypes.includes(effectiveProjectType)) ||
      (dev.ownershipLeadType !== 'BOTH' && dev.ownershipLeadType === leadOwnershipType);

    leadTypeMatchTier = isExplicitlyPreferred ? 'EXACT_PREFERRED' : 'COMPATIBLE';
    const ltLabel = getLeadTypeLabel(effectiveProjectType);
    addPass(
      'LEAD_TYPE',
      isExplicitlyPreferred ? 'LEAD_TYPE_EXACT_MATCH' : 'LEAD_TYPE_COMPATIBLE',
      `${effectiveProjectType} (${leadOwnershipType})`,
      dev.supportedLeadTypes.length > 0
        ? `${dev.supportedLeadTypes.join(', ')} (${dev.ownershipLeadType})`
        : `ALL (${dev.ownershipLeadType})`,
      `Lead type ${ltLabel.en} (${leadOwnershipType}) is compatible with developer preferences.`,
      `نوع طلب العميل (${ltLabel.ar} - ${leadOwnershipType}) متوافق مع تفضيلات المطور.`
    );
  }

  return {
    eligible: hardFailures.length === 0,
    hardFailures,
    warnings,
    checks,
    normalizedDeveloper: dev,
    extractedFeatures: {
      leadPrimaryService: primary,
      leadAllRequiredServices: allRequired,
      leadSecondaryServices: secondary,
      serviceMatchTier,
      matchedPrimaryService,
      matchedSecondaryServicesCount,
      matchedPreferredService,
      leadNiche,
      nicheMatchTier,
      matchedPreferredNiche,
      leadCityAr,
      leadGovernorateAr,
      leadAreaAr,
      locationUnknown,
      locationMatchTier,
      matchedPreferredCity,
      leadBudgetMin,
      leadBudgetMax,
      leadBudgetCurrency,
      leadBudgetType,
      budgetUnknown,
      budgetMatchTier,
      leadProjectType: effectiveProjectType,
      leadOwnershipType,
      leadTypeMatchTier,
      leadQualityScore: qualityScore,
      leadOpportunityScore: opportunityScore,
      leadFreshness: freshness,
      leadVerificationStatus: verificationStatus,
      leadSaleabilityStatus: saleabilityStatus,
    },
  };
}

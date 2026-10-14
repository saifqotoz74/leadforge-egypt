import {
  BusinessOperationalStatus,
  LeadAvailabilityStatus,
  QualityStatus,
  VerificationStatus,
} from '@prisma/client';
import { evaluateLeadCompleteness } from './completeness';
import {
  calculateLeadFreshness,
  getLatestVerificationSnapshotsByDimension,
} from './freshness-engine';
import {
  CompletenessEvaluationResult,
  DEFAULT_PHASE3_FRESHNESS_THRESHOLDS,
  DEFAULT_QUALITY_CONFIG,
  DimensionVerificationSnapshot,
  EmailValidationState,
  LeadQualityEvaluationInput,
  Phase3FreshnessResult,
  Phase3FreshnessThresholds,
  PhoneValidationState,
  QualityComponentContribution,
  QualityEvaluationSummary,
  QualityFlagCode,
  QualityReasonSignal,
  QualityThresholdsConfig,
  WebsiteVerificationState,
} from './types';
import {
  evaluateBusinessOperationalStatus,
  evaluateWebsiteVerification,
  validateLeadCategory,
  validateLeadEmail,
  validateLeadLocation,
  validateLeadPhone,
  WebsiteProbeResponse,
} from './validators';

export const QUALITY_ENGINE_VERSION = 'v1';

/**
 * Classifies a numeric `qualityScore` (0–100) into a `QualityStatus` bucket.
 * Default thresholds:
 * - 0–24 -> VERY_LOW
 * - 25–49 -> LOW
 * - 50–69 -> MEDIUM
 * - 70–84 -> HIGH
 * - 85–100 -> EXCELLENT
 */
export function classifyQualityStatus(
  qualityScore: number,
  config: Partial<QualityThresholdsConfig> = DEFAULT_QUALITY_CONFIG
): QualityStatus {
  const cfg = { ...DEFAULT_QUALITY_CONFIG, ...config };
  const clamped = Math.max(0, Math.min(100, Math.round(qualityScore)));

  if (clamped <= cfg.veryLowMax) return 'VERY_LOW';
  if (clamped <= cfg.lowMax) return 'LOW';
  if (clamped <= cfg.mediumMax) return 'MEDIUM';
  if (clamped <= cfg.highMax) return 'HIGH';
  return 'EXCELLENT';
}

export interface FullLeadQualityEvaluation {
  qualityVersion: string;
  qualityScore: number;
  qualityStatus: QualityStatus;
  completeness: CompletenessEvaluationResult;
  freshness: Phase3FreshnessResult;
  verificationStatus: VerificationStatus;
  dimensionVerifications: Record<string, DimensionVerificationSnapshot>;
  phoneValidationStatus: PhoneValidationState;
  emailValidationStatus: EmailValidationState;
  websiteVerificationState: WebsiteVerificationState;
  businessStatus: BusinessOperationalStatus;
  qualityFlags: QualityFlagCode[];
  saleabilityStatus: LeadAvailabilityStatus;
  isSaleable: boolean;
  saleabilityReason: string;
  nextVerificationAt: Date | null;
  reasons: QualityReasonSignal[];
  summary: QualityEvaluationSummary;
}

function hasNonEmptyConflict(fieldConflicts: unknown): boolean {
  if (!fieldConflicts) return false;
  if (Array.isArray(fieldConflicts)) return fieldConflicts.length > 0;
  if (typeof fieldConflicts === 'object') {
    return Object.keys(fieldConflicts as Record<string, unknown>).length > 0;
  }
  return false;
}

function getSupersedingDimensionsForFeedback(reason: string): string[] {
  switch (reason) {
    case 'WRONG_PHONE':
      return ['PHONE', 'FULL'];
    case 'ALREADY_HAS_WEBSITE':
      return ['WEBSITE', 'FULL'];
    case 'BUSINESS_CLOSED':
      return ['BUSINESS_STATUS', 'FULL'];
    case 'WRONG_CATEGORY':
      return ['IDENTITY', 'CATEGORY', 'FULL'];
    case 'WRONG_LOCATION':
      return ['ADDRESS', 'LOCATION', 'FULL'];
    case 'DUPLICATE':
      return ['IDENTITY', 'FULL'];
    default:
      return ['FULL'];
  }
}

function resolveActiveNegativeFeedbackReasons(
  lead: LeadQualityEvaluationInput,
  snapshotsMap: Map<string, DimensionVerificationSnapshot>
): string[] {
  if (lead.negativeFeedbackEntries && lead.negativeFeedbackEntries.length > 0) {
    const active = new Set<string>();
    for (const entry of lead.negativeFeedbackEntries) {
      if (!entry.reason) continue;
      const entryTime = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
      const dims = getSupersedingDimensionsForFeedback(entry.reason);
      const isSuperseded = dims.some((dim) => {
        const snap = snapshotsMap.get(dim);
        if (!snap || snap.effectiveStatus !== 'VERIFIED') return false;
        if (snap.source?.startsWith('DEVELOPER_FEEDBACK')) return false;
        return entryTime > 0 ? snap.checkedAt.getTime() >= entryTime : true;
      });
      if (!isSuperseded) {
        active.add(entry.reason);
      }
    }
    return Array.from(active);
  }

  const rawReasons = lead.negativeFeedbackReasons || [];
  if (rawReasons.length === 0) return [];

  const feedbackSnap = snapshotsMap.get('FEEDBACK');
  return rawReasons.filter((reason) => {
    const dims = getSupersedingDimensionsForFeedback(reason);
    const isSuperseded = dims.some((dim) => {
      const snap = snapshotsMap.get(dim);
      if (!snap || snap.effectiveStatus !== 'VERIFIED') return false;
      if (snap.source?.startsWith('DEVELOPER_FEEDBACK')) return false;
      if (feedbackSnap) {
        return snap.checkedAt.getTime() >= feedbackSnap.checkedAt.getTime();
      }
      return true;
    });
    return !isSuperseded;
  });
}

function isDimensionSnapshotSuperseded(
  dim: string,
  snap: DimensionVerificationSnapshot,
  snapshotsMap: Map<string, DimensionVerificationSnapshot>
): boolean {
  if (snap.effectiveStatus === 'VERIFIED') return false;
  const fullSnap = snapshotsMap.get('FULL');
  if (
    fullSnap &&
    fullSnap.effectiveStatus === 'VERIFIED' &&
    !fullSnap.source?.startsWith('DEVELOPER_FEEDBACK') &&
    fullSnap.checkedAt.getTime() >= snap.checkedAt.getTime()
  ) {
    return true;
  }
  if (dim === 'CATEGORY') {
    const idSnap = snapshotsMap.get('IDENTITY');
    if (
      idSnap &&
      idSnap.effectiveStatus === 'VERIFIED' &&
      !idSnap.source?.startsWith('DEVELOPER_FEEDBACK') &&
      idSnap.checkedAt.getTime() >= snap.checkedAt.getTime()
    ) {
      return true;
    }
  }
  if (dim === 'LOCATION') {
    const addrSnap = snapshotsMap.get('ADDRESS');
    if (
      addrSnap &&
      addrSnap.effectiveStatus === 'VERIFIED' &&
      !addrSnap.source?.startsWith('DEVELOPER_FEEDBACK') &&
      addrSnap.checkedAt.getTime() >= snap.checkedAt.getTime()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Core deterministic Quality, Freshness, Verification, Flag, and Saleability evaluation engine.
 * Never modifies Opportunity Score (`lead.score`).
 */
export function evaluateLeadQuality(
  lead: LeadQualityEvaluationInput,
  options: {
    qualityConfig?: Partial<QualityThresholdsConfig>;
    freshnessThresholds?: Partial<Phase3FreshnessThresholds>;
    websiteProbe?: WebsiteProbeResponse | null;
    now?: Date;
  } = {}
): FullLeadQualityEvaluation {
  const now = options.now ?? new Date();
  const qCfg: QualityThresholdsConfig = {
    ...DEFAULT_QUALITY_CONFIG,
    ...options.qualityConfig,
  };
  const fCfg: Phase3FreshnessThresholds = {
    ...DEFAULT_PHASE3_FRESHNESS_THRESHOLDS,
    ...options.freshnessThresholds,
  };

  // 1. Evaluate Completeness
  const completeness = evaluateLeadCompleteness(lead);

  // 2. Evaluate Dynamic Freshness
  const freshness = calculateLeadFreshness(lead.lastVerifiedAt, fCfg, now);

  // 3. Evaluate Dimension Verifications & Expiration
  const snapshotsMap = getLatestVerificationSnapshotsByDimension(
    lead.verifications || [],
    qCfg,
    now
  );

  // Resolve active negative feedback reasons (filtering out any feedback superseded by newer Admin/Engine VERIFIED checks)
  const activeFeedbackReasons = resolveActiveNegativeFeedbackReasons(lead, snapshotsMap);

  // 4. Evaluate Contact & Business Validations
  const phoneResult = validateLeadPhone(lead.phone || lead.normalizedPhone);
  const emailResult = validateLeadEmail(lead.email || lead.normalizedEmail);
  const websiteResult = evaluateWebsiteVerification(
    lead.website,
    lead.websiteAnalysis as Record<string, unknown> | null,
    options.websiteProbe
  );
  const businessStatusResult = evaluateBusinessOperationalStatus({
    businessStatus: lead.businessStatus,
    businessName: lead.businessName,
    negativeFeedbackReasons: activeFeedbackReasons,
  });
  const categoryResult = validateLeadCategory(lead.category, lead.businessName);
  const locationResult = validateLeadLocation(lead.governorate, lead.city);

  const dimensionVerifications: Record<string, DimensionVerificationSnapshot> = {};
  let earliestExpiry: Date | null = null;
  let anyActiveVerified = false;
  let anyFailedCritical = false;
  let anyExpiredOrNeedsReverify = false;

  for (const [dim, snap] of snapshotsMap.entries()) {
    dimensionVerifications[dim] = snap;
    if (snap.expiresAt && !snap.isExpired) {
      if (!earliestExpiry || snap.expiresAt.getTime() < earliestExpiry.getTime()) {
        earliestExpiry = snap.expiresAt;
      }
    }

    if (isDimensionSnapshotSuperseded(dim, snap, snapshotsMap)) {
      continue;
    }

    if (snap.effectiveStatus === 'VERIFIED') {
      anyActiveVerified = true;
    } else if (snap.effectiveStatus === 'FAILED') {
      if (
        dim === 'PHONE' ||
        dim === 'BUSINESS_STATUS' ||
        dim === 'IDENTITY' ||
        dim === 'FULL' ||
        dim === 'FEEDBACK'
      ) {
        anyFailedCritical = true;
      }
    } else if (snap.effectiveStatus === 'NEEDS_REVERIFICATION') {
      anyExpiredOrNeedsReverify = true;
    }
  }

  // Override phone/website/business states if explicit verification records or active feedback exist
  let phoneValidationStatus: PhoneValidationState = phoneResult.status;
  const phoneSnap = snapshotsMap.get('PHONE');
  if (
    phoneSnap?.effectiveStatus === 'FAILED' ||
    activeFeedbackReasons.includes('WRONG_PHONE')
  ) {
    phoneValidationStatus = 'INVALID';
    anyFailedCritical = true;
  }

  let emailValidationStatus: EmailValidationState = emailResult.status;
  const emailSnap = snapshotsMap.get('EMAIL');
  if (emailSnap?.effectiveStatus === 'FAILED') {
    emailValidationStatus = 'INVALID_FORMAT';
  }

  let websiteVerificationState: WebsiteVerificationState = websiteResult.state;
  const websiteSnap = snapshotsMap.get('WEBSITE');
  if (websiteSnap?.effectiveStatus === 'FAILED' && websiteVerificationState !== 'DOMAIN_INVALID') {
    websiteVerificationState = 'WEBSITE_UNREACHABLE';
  }
  if (
    websiteSnap?.effectiveStatus === 'NEEDS_REVERIFICATION' ||
    activeFeedbackReasons.includes('ALREADY_HAS_WEBSITE')
  ) {
    anyExpiredOrNeedsReverify = true;
  }

  let businessStatus: BusinessOperationalStatus = businessStatusResult.businessStatus;
  const bizSnap = snapshotsMap.get('BUSINESS_STATUS');
  if (bizSnap?.effectiveStatus === 'FAILED') {
    businessStatus = 'CLOSED';
    anyFailedCritical = true;
  } else if (bizSnap?.effectiveStatus === 'NEEDS_REVERIFICATION') {
    anyExpiredOrNeedsReverify = true;
  }

  // Determine alternate contact channels
  const hasAlternateValidContact =
    websiteResult.isReachable ||
    Boolean(lead.facebook && lead.facebook.trim()) ||
    Boolean(lead.hasFacebook) ||
    Boolean(lead.instagram && lead.instagram.trim()) ||
    Boolean(lead.hasInstagram) ||
    emailValidationStatus === 'DOMAIN_VALID';

  // Determine overall Lead VerificationStatus
  let verificationStatus: VerificationStatus = 'UNVERIFIED';
  const hasAllCoreDimensionsVerified =
    snapshotsMap.get('FULL')?.effectiveStatus === 'VERIFIED' ||
    (snapshotsMap.get('BUSINESS_STATUS')?.effectiveStatus === 'VERIFIED' &&
      (snapshotsMap.get('IDENTITY')?.effectiveStatus === 'VERIFIED' ||
        snapshotsMap.get('ADDRESS')?.effectiveStatus === 'VERIFIED') &&
      (phoneValidationStatus === 'VALID'
        ? snapshotsMap.get('PHONE')?.effectiveStatus === 'VERIFIED'
        : true));

  const isImplicitlyVerifiedFreshLead =
    snapshotsMap.size === 0 &&
    lead.isVerified !== false &&
    businessStatus === 'OPEN' &&
    (phoneValidationStatus === 'VALID' ||
      (phoneValidationStatus === 'UNKNOWN' &&
        (hasAlternateValidContact || Boolean(lead.address)))) &&
    !categoryResult.hasCategoryMismatch &&
    !locationResult.hasLocationMismatch &&
    completeness.missingRequiredFields.length === 0 &&
    (freshness.freshnessStatus === 'FRESH' || freshness.freshnessStatus === 'RECENT');

  if (
    anyFailedCritical ||
    businessStatus === 'CLOSED' ||
    (phoneValidationStatus === 'INVALID' && !websiteResult.isReachable && !lead.hasFacebook && !lead.hasInstagram)
  ) {
    verificationStatus = 'FAILED_VERIFICATION';
  } else if ((hasAllCoreDimensionsVerified || isImplicitlyVerifiedFreshLead) && !anyExpiredOrNeedsReverify) {
    verificationStatus = 'VERIFIED';
  } else if (anyActiveVerified) {
    verificationStatus = 'PARTIALLY_VERIFIED';
  } else {
    verificationStatus = 'UNVERIFIED';
  }

  // 5. Collect Machine-Readable Quality Flags
  const flagsSet = new Set<QualityFlagCode>();

  if (phoneValidationStatus === 'INVALID') {
    flagsSet.add('INVALID_PHONE');
  }
  if (
    emailValidationStatus === 'INVALID_FORMAT' ||
    emailValidationStatus === 'DOMAIN_INVALID'
  ) {
    flagsSet.add('INVALID_EMAIL');
  }
  if (
    websiteVerificationState === 'DOMAIN_INVALID' ||
    websiteVerificationState === 'WEBSITE_UNREACHABLE'
  ) {
    flagsSet.add('INVALID_WEBSITE');
  }
  if (
    freshness.freshnessStatus === 'STALE' ||
    freshness.freshnessStatus === 'VERY_STALE'
  ) {
    flagsSet.add('STALE_DATA');
  }
  if (
    categoryResult.hasCategoryMismatch ||
    activeFeedbackReasons.includes('WRONG_CATEGORY')
  ) {
    flagsSet.add('CATEGORY_MISMATCH');
  }
  if (
    locationResult.hasLocationMismatch ||
    activeFeedbackReasons.includes('WRONG_LOCATION')
  ) {
    flagsSet.add('LOCATION_MISMATCH');
  }
  if (
    lead.isCanonical === false ||
    Boolean(lead.mergedIntoLeadId) ||
    lead.hasPendingDuplicateCandidate === true ||
    activeFeedbackReasons.includes('DUPLICATE')
  ) {
    flagsSet.add('POSSIBLE_DUPLICATE');
  }
  if (businessStatus === 'CLOSED') {
    flagsSet.add('CLOSED_BUSINESS');
  }
  if (completeness.missingRequiredFields.length > 0) {
    flagsSet.add('MISSING_REQUIRED_DATA');
  }
  if (hasNonEmptyConflict(lead.fieldConflicts)) {
    flagsSet.add('CONFLICTING_SOURCE_DATA');
  }

  const qualityFlags = Array.from(flagsSet);

  // 6. Compute Deterministic Quality Score (0–100) & Machine-Readable Signal Reasons
  const components: QualityComponentContribution[] = [];
  const reasons: QualityReasonSignal[] = [];

  // Component A: Data Completeness (0–30 pts)
  const completenessPoints = Math.round(completeness.completenessScore * 0.3);
  components.push({
    component: 'COMPLETENESS',
    points: completenessPoints,
    maxPoints: 30,
    reason: `Data completeness is ${completeness.completenessScore}/100`,
  });
  reasons.push({
    signal: completeness.completenessScore >= 80 ? 'COMPLETE_PROFILE' : 'DATA_COMPLETENESS',
    impact: completenessPoints,
    reason: `Data completeness score is ${completeness.completenessScore}/100`,
  });

  // Component B: Contact Validation (max 25 pts, can be negative on invalid contact)
  let contactPoints = 0;
  const contactReasons: string[] = [];
  if (phoneValidationStatus === 'VALID') {
    contactPoints += 18;
    contactReasons.push('Valid Egyptian phone (+18)');
    reasons.push({
      signal: 'VALID_PHONE',
      impact: 18,
      reason: 'Valid Egyptian phone number',
    });
  } else if (phoneValidationStatus === 'INVALID') {
    contactPoints -= 25;
    contactReasons.push('Invalid phone (-25)');
    reasons.push({
      signal: 'INVALID_PHONE',
      impact: -25,
      reason: 'Phone number failed Egyptian format/validity check',
    });
  }

  if (emailValidationStatus === 'DOMAIN_VALID' || emailValidationStatus === 'VALID_FORMAT') {
    contactPoints += 4;
    contactReasons.push('Valid email (+4)');
    reasons.push({
      signal: 'VALID_EMAIL',
      impact: 4,
      reason: 'Valid business email format and domain',
    });
  } else if (
    emailValidationStatus === 'INVALID_FORMAT' ||
    emailValidationStatus === 'DOMAIN_INVALID'
  ) {
    contactPoints -= 8;
    contactReasons.push('Invalid email (-8)');
    reasons.push({
      signal: 'INVALID_EMAIL',
      impact: -8,
      reason: `Email validation failed (${emailValidationStatus})`,
    });
  }

  if (
    websiteVerificationState === 'WEBSITE_HTTPS' ||
    websiteVerificationState === 'WEBSITE_HTTP' ||
    websiteVerificationState === 'WEBSITE_EXISTS' ||
    websiteVerificationState === 'WEBSITE_REDIRECT'
  ) {
    contactPoints += 3;
    contactReasons.push(`Verified website state ${websiteVerificationState} (+3)`);
    reasons.push({
      signal: websiteVerificationState,
      impact: 3,
      reason: `Website verified (${websiteVerificationState})`,
    });
  } else if (
    websiteVerificationState === 'WEBSITE_MISSING' &&
    (lead.hasFacebook || lead.facebook || lead.hasInstagram || lead.instagram)
  ) {
    contactPoints += 3;
    contactReasons.push('Confirmed no-website lead with active social presence (+3)');
    reasons.push({
      signal: 'VERIFIED_SOCIAL_PRESENCE',
      impact: 3,
      reason: 'Confirmed no-website lead with verified social channel',
    });
  } else if (
    websiteVerificationState === 'WEBSITE_UNREACHABLE' ||
    websiteVerificationState === 'DOMAIN_INVALID'
  ) {
    contactPoints -= 10;
    contactReasons.push(`Invalid/unreachable website ${websiteVerificationState} (-10)`);
    reasons.push({
      signal: 'INVALID_WEBSITE',
      impact: -10,
      reason: `Website is ${websiteVerificationState}`,
    });
  }

  components.push({
    component: 'CONTACT_VALIDITY',
    points: contactPoints,
    maxPoints: 25,
    reason: contactReasons.join('; ') || 'No validated contact channels',
  });

  // Component C: Verification Status (max 25 pts)
  let verificationPoints = 0;
  if (verificationStatus === 'VERIFIED') {
    verificationPoints = 25;
  } else if (verificationStatus === 'PARTIALLY_VERIFIED') {
    verificationPoints = 16;
  } else if (verificationStatus === 'UNVERIFIED') {
    verificationPoints = 6;
  } else if (verificationStatus === 'FAILED_VERIFICATION') {
    verificationPoints = -25;
  }
  components.push({
    component: 'VERIFICATION_STATE',
    points: verificationPoints,
    maxPoints: 25,
    reason: `Verification status is ${verificationStatus}`,
  });
  reasons.push({
    signal: verificationStatus,
    impact: verificationPoints,
    reason: `Lead verification state is ${verificationStatus}`,
  });

  // Component D: Freshness (max 20 pts)
  let freshnessPoints = 0;
  switch (freshness.freshnessStatus) {
    case 'FRESH':
      freshnessPoints = 20;
      break;
    case 'RECENT':
      freshnessPoints = 16;
      break;
    case 'NEEDS_VERIFICATION':
      freshnessPoints = 6;
      break;
    case 'UNKNOWN':
      freshnessPoints = 4;
      break;
    case 'STALE':
      freshnessPoints = -12;
      break;
    case 'VERY_STALE':
      freshnessPoints = -25;
      break;
  }
  components.push({
    component: 'FRESHNESS',
    points: freshnessPoints,
    maxPoints: 20,
    reason: `Freshness state is ${freshness.freshnessStatus} (${
      freshness.daysSinceVerified !== null ? `${freshness.daysSinceVerified}d` : 'unknown age'
    })`,
  });
  reasons.push({
    signal:
      freshness.freshnessStatus === 'FRESH'
        ? 'FRESH_VERIFICATION'
        : `FRESHNESS_${freshness.freshnessStatus}`,
    impact: freshnessPoints,
    reason: `Freshness state is ${freshness.freshnessStatus} (${
      freshness.daysSinceVerified !== null ? `${freshness.daysSinceVerified}d` : 'unknown age'
    })`,
  });

  // Component E: Source Corroboration & Provenance (0–5 pts bonus)
  const distinctSources = Array.from(
    new Set(
      [
        ...(Array.isArray(lead.sourceList) ? lead.sourceList : []),
        ...(lead.source ? [lead.source] : []),
      ]
        .map((s) => (s || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (distinctSources.length > 1) {
    const sourceBonus = Math.min(5, distinctSources.length * 2 + 1);
    components.push({
      component: 'SOURCE_CORROBORATION',
      points: sourceBonus,
      maxPoints: 5,
      reason: `Corroborated across ${distinctSources.length} sources (${distinctSources.join(', ')})`,
    });
    reasons.push({
      signal: 'MULTIPLE_SOURCES',
      impact: sourceBonus,
      reason: `Corroborated across ${distinctSources.length} independent sources`,
    });
  }

  // Component F: Operational & Consistency Penalties
  let penaltyPoints = 0;
  const penaltyReasons: string[] = [];
  if (businessStatus === 'CLOSED') {
    penaltyPoints -= 40;
    penaltyReasons.push('Business is CLOSED (-40)');
    reasons.push({
      signal: 'CLOSED_BUSINESS',
      impact: -40,
      reason: 'Business is permanently closed',
    });
  } else if (businessStatus === 'TEMPORARILY_CLOSED') {
    penaltyPoints -= 15;
    penaltyReasons.push('Business is TEMPORARILY_CLOSED (-15)');
    reasons.push({
      signal: 'TEMPORARILY_CLOSED',
      impact: -15,
      reason: 'Business is temporarily closed',
    });
  }
  if (flagsSet.has('CATEGORY_MISMATCH')) {
    penaltyPoints -= 15;
    penaltyReasons.push('Category mismatch (-15)');
    reasons.push({
      signal: 'CATEGORY_MISMATCH',
      impact: -15,
      reason: 'Business name conflicts with assigned category',
    });
  }
  if (flagsSet.has('LOCATION_MISMATCH')) {
    penaltyPoints -= 15;
    penaltyReasons.push('Location mismatch (-15)');
    reasons.push({
      signal: 'LOCATION_MISMATCH',
      impact: -15,
      reason: 'City/Area conflicts with assigned governorate',
    });
  }
  if (flagsSet.has('CONFLICTING_SOURCE_DATA')) {
    penaltyPoints -= 10;
    penaltyReasons.push('Conflicting source data (-10)');
    reasons.push({
      signal: 'CONFLICTING_SOURCE_DATA',
      impact: -10,
      reason: 'Unresolved multi-source field conflicts',
    });
  }
  if (flagsSet.has('POSSIBLE_DUPLICATE')) {
    penaltyPoints -= 10;
    penaltyReasons.push('Possible or confirmed duplicate (-10)');
    reasons.push({
      signal: 'POSSIBLE_DUPLICATE',
      impact: -10,
      reason: 'Lead is flagged as a possible or confirmed duplicate',
    });
  }
  if (flagsSet.has('MISSING_REQUIRED_DATA')) {
    penaltyPoints -= 20;
    penaltyReasons.push('Missing required fields (-20)');
    reasons.push({
      signal: 'MISSING_REQUIRED_DATA',
      impact: -20,
      reason: `Missing required fields: ${completeness.missingRequiredFields.join(', ')}`,
    });
  }

  if (penaltyPoints !== 0) {
    components.push({
      component: 'RISK_AND_CONSISTENCY_PENALTIES',
      points: penaltyPoints,
      maxPoints: 0,
      reason: penaltyReasons.join('; '),
    });
  }

  const rawQualityScore = components.reduce((sum, c) => sum + c.points, 0);
  const qualityScore = Math.max(0, Math.min(100, Math.round(rawQualityScore)));
  const qualityStatus = classifyQualityStatus(qualityScore, qCfg);

  // 7. Evaluate Quality Gates & Saleability Status
  let saleabilityStatus: LeadAvailabilityStatus = 'AVAILABLE';
  let saleabilityReason = 'Lead passes all quality, freshness, and verification gates';

  if (
    lead.isCanonical === false ||
    Boolean(lead.mergedIntoLeadId) ||
    lead.status === 'DUPLICATE'
  ) {
    saleabilityStatus = 'DUPLICATE';
    saleabilityReason = 'Lead is a confirmed duplicate merged into a canonical record';
  } else if (lead.status === 'ARCHIVED') {
    saleabilityStatus = 'ARCHIVED';
    saleabilityReason = 'Lead is archived';
  } else if (businessStatus === 'CLOSED' || flagsSet.has('CLOSED_BUSINESS')) {
    saleabilityStatus = 'CLOSED';
    saleabilityReason = 'Business is permanently closed';
  } else if (
    flagsSet.has('MISSING_REQUIRED_DATA') ||
    (flagsSet.has('INVALID_PHONE') && !hasAlternateValidContact) ||
    verificationStatus === 'FAILED_VERIFICATION'
  ) {
    saleabilityStatus = 'INVALID';
    saleabilityReason = flagsSet.has('MISSING_REQUIRED_DATA')
      ? `Missing required data: ${completeness.missingRequiredFields.join(', ')}`
      : flagsSet.has('INVALID_PHONE')
      ? 'Primary phone number is invalid and no valid alternative contact exists'
      : 'Critical verification check failed';
  } else if (
    freshness.freshnessStatus === 'STALE' ||
    freshness.freshnessStatus === 'VERY_STALE'
  ) {
    saleabilityStatus = 'STALE';
    saleabilityReason = `Lead data is ${freshness.freshnessStatus} (${freshness.daysSinceVerified} days since verification)`;
  } else if (
    freshness.freshnessStatus === 'NEEDS_VERIFICATION' ||
    freshness.freshnessStatus === 'UNKNOWN' ||
    anyExpiredOrNeedsReverify ||
    businessStatus === 'TEMPORARILY_CLOSED' ||
    flagsSet.has('POSSIBLE_DUPLICATE') ||
    flagsSet.has('CONFLICTING_SOURCE_DATA') ||
    flagsSet.has('CATEGORY_MISMATCH') ||
    flagsSet.has('LOCATION_MISMATCH')
  ) {
    saleabilityStatus = 'REQUIRES_VERIFICATION';
    saleabilityReason =
      freshness.freshnessStatus === 'NEEDS_VERIFICATION' ||
      freshness.freshnessStatus === 'UNKNOWN'
        ? `Lead freshness is ${freshness.freshnessStatus} and requires verification`
        : anyExpiredOrNeedsReverify
        ? 'One or more verification dimensions have expired or were flagged for re-verification'
        : `Lead has unresolved quality flags (${qualityFlags.join(', ')}) requiring verification`;
  } else if (qualityScore < qCfg.minSaleableQualityScore) {
    saleabilityStatus = 'NOT_SALEABLE';
    saleabilityReason = `Quality score (${qualityScore}) is below minimum saleable threshold (${qCfg.minSaleableQualityScore})`;
  } else if (
    (typeof lead.currentPurchasers === 'number' &&
      typeof lead.maxPurchasers === 'number' &&
      lead.currentPurchasers >= lead.maxPurchasers) ||
    lead.status === 'CLAIMED_FULL'
  ) {
    saleabilityStatus = 'CLAIMED_FULL';
    saleabilityReason = 'Lead has reached maximum purchasers capacity';
  }

  const isSaleable = saleabilityStatus === 'AVAILABLE';

  // Compute nextVerificationAt
  let nextVerificationAt: Date | null = earliestExpiry;
  if (!nextVerificationAt && lead.lastVerifiedAt) {
    const verifiedDate =
      typeof lead.lastVerifiedAt === 'string'
        ? new Date(lead.lastVerifiedAt)
        : lead.lastVerifiedAt;
    if (!Number.isNaN(verifiedDate.getTime())) {
      nextVerificationAt = new Date(
        verifiedDate.getTime() + fCfg.recentMaxDays * 24 * 60 * 60 * 1000
      );
    }
  }

  const summary: QualityEvaluationSummary = {
    qualityVersion: QUALITY_ENGINE_VERSION,
    qualityScore,
    qualityStatus,
    opportunityScore: lead.score,
    completenessScore: completeness.completenessScore,
    freshnessStatus: freshness.freshnessStatus,
    daysSinceVerified: freshness.daysSinceVerified,
    verificationStatus,
    saleabilityStatus,
    isSaleable,
    saleabilityReason,
    businessStatus,
    phoneValidationStatus,
    emailValidationStatus,
    websiteVerificationState,
    qualityFlags,
    components,
    reasons,
    evaluatedAt: now.toISOString(),
  };

  return {
    qualityVersion: QUALITY_ENGINE_VERSION,
    qualityScore,
    qualityStatus,
    completeness,
    freshness,
    verificationStatus,
    dimensionVerifications,
    phoneValidationStatus,
    emailValidationStatus,
    websiteVerificationState,
    businessStatus,
    qualityFlags,
    saleabilityStatus,
    isSaleable,
    saleabilityReason,
    nextVerificationAt,
    reasons,
    summary,
  };
}

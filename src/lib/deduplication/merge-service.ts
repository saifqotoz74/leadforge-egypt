import { Lead, PrismaClient, SourceType } from '@prisma/client';
import { NormalizedLeadData, validateAndNormalizeLead } from '../validator';
import {
  calculateLeadScore,
  ClassificationThresholds,
  DEFAULT_SCORING_RULES,
  hasScoreMateriallyChanged,
  loadScoringContext,
  logScoringOperation,
  recalculateLeadScore,
  ScoringRuleDefinition,
} from '../scoring-engine';
import { generateCanonicalIdentityKeys } from './identity';
import { logMergeOperation } from './logger';
import { resolveSourceType } from './normalizer';
import {
  DeduplicationDecision,
  DeduplicationSignal,
  FieldConflictRecord,
  LeadFieldProvenanceMap,
  MergeExecutionResult,
} from './types';
import { evaluateLeadQuality } from '../quality';

let monotonicMergeSeq = 0;

export class MergeServiceError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'MergeServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Deterministic source trust priority (0..100).
 * Verified sources > Trusted structured sources > Bulk/unverified sources.
 */
export function getSourceTrustPriority(
  sourceTypeOrName?: SourceType | string | null,
  isVerified = true
): number {
  const sType = resolveSourceType(sourceTypeOrName);
  let base = 50;
  switch (sType) {
    case 'MANUAL':
      base = 90;
      break;
    case 'GOOGLE_BUSINESS':
      base = 85;
      break;
    case 'OPEN_DATA':
      base = 80;
      break;
    case 'WEBSITE':
      base = 75;
      break;
    case 'DIRECTORY':
      base = 65;
      break;
    case 'CSV_IMPORT':
      base = 60;
      break;
    default:
      base = 50;
  }
  return isVerified ? Math.min(100, base + 10) : base;
}

/**
 * Builds initial field-level provenance metadata when a Canonical Lead is first created.
 */
export function buildInitialFieldProvenance(
  normalized: NormalizedLeadData,
  sourceRecordId?: string | null,
  now = new Date()
): LeadFieldProvenanceMap {
  const nowIso = now.toISOString();
  const priority = getSourceTrustPriority(
    normalized.sourceType || normalized.source,
    normalized.isVerified
  );
  const provenance: LeadFieldProvenanceMap = {};

  const trackField = (field: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    provenance[field] = {
      value,
      source: normalized.source,
      sourceType: normalized.sourceType,
      sourceRecordId: sourceRecordId || null,
      externalId: normalized.externalId || null,
      priority,
      firstSeenAt: nowIso,
      verifiedAt: nowIso,
      confirmedBySources: [normalized.source],
    };
  };

  trackField('businessName', normalized.businessName);
  trackField('phone', normalized.phone);
  trackField('normalizedPhone', normalized.normalizedPhone);
  trackField('email', normalized.email);
  trackField('website', normalized.website);
  trackField('normalizedDomain', normalized.normalizedDomain);
  trackField('facebook', normalized.facebook);
  trackField('instagram', normalized.instagram);
  trackField('address', normalized.address);
  trackField('city', normalized.city);
  trackField('rating', normalized.rating);

  return provenance;
}

function captureLeadStateSnapshot(lead: Lead): Record<string, unknown> {
  return {
    businessName: lead.businessName,
    normalizedName: lead.normalizedName,
    category: lead.category,
    governorate: lead.governorate,
    city: lead.city,
    area: lead.area,
    address: lead.address,
    normalizedAddress: lead.normalizedAddress,
    phone: lead.phone,
    normalizedPhone: lead.normalizedPhone,
    phones: lead.phones || (lead.normalizedPhone ? [lead.normalizedPhone] : []),
    hasPhone: lead.hasPhone,
    email: lead.email,
    normalizedEmail: lead.normalizedEmail,
    hasEmail: lead.hasEmail,
    website: lead.website,
    normalizedDomain: lead.normalizedDomain,
    websiteStatus: lead.websiteStatus,
    facebook: lead.facebook,
    normalizedFacebook: lead.normalizedFacebook,
    hasFacebook: lead.hasFacebook,
    instagram: lead.instagram,
    normalizedInstagram: lead.normalizedInstagram,
    hasInstagram: lead.hasInstagram,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    branchCount: lead.branchCount,
    estimatedBudget: lead.estimatedBudget,
    isVerified: lead.isVerified,
    isRecentlyActive: lead.isRecentlyActive,
    source: lead.source,
    sourceList: lead.sourceList,
    canonicalIdentityKeys: lead.canonicalIdentityKeys || [],
    fieldProvenance: lead.fieldProvenance || {},
    fieldConflicts: lead.fieldConflicts || [],
    score: lead.score,
    temperature: lead.temperature,
    scoringVersion: lead.scoringVersion,
  };
}

export interface MergeLeadOptions {
  sourceRecordId?: string | null;
  sourceLeadId?: string | null;
  sourceLeadSnapshot?: Record<string, unknown> | null;
  reason?: string;
  decision?: DeduplicationDecision;
  matchedSignals?: DeduplicationSignal[];
  performedBy?: string; // 'SYSTEM' or admin userId
  mergeType?: 'AUTOMATIC' | 'MANUAL_ADMIN' | 'CONFLICT_RESOLVED';
  rules?: ScoringRuleDefinition[];
  scoringVersion?: string;
  thresholds?: Partial<ClassificationThresholds>;
  conflictPolicy?: 'SAFE_PHONE_PRIORITY' | 'STRICT_CONFLICT';
  preferredFields?: Partial<
    Record<'phone' | 'email' | 'website' | 'address' | 'businessName', 'EXISTING' | 'INCOMING'>
  >;
}

/**
 * Pure deterministic field-level merge function operating on a Lead snapshot + incoming NormalizedLeadData.
 * Used both for live merges and for replaying subsequent active merges when an earlier merge is reverted.
 */
function computeDeterministicSnapshotMerge(
  baseSnap: Record<string, unknown>,
  incoming: NormalizedLeadData,
  opts: {
    sourceRecordId?: string | null;
    preferredFields?: MergeLeadOptions['preferredFields'];
    nowIso: string;
  }
) {
  const { sourceRecordId, preferredFields, nowIso } = opts;
  const enrichedFields: string[] = [];
  const newConflicts: FieldConflictRecord[] = [];

  const existingProvenance: LeadFieldProvenanceMap =
    baseSnap.fieldProvenance && typeof baseSnap.fieldProvenance === 'object'
      ? JSON.parse(JSON.stringify(baseSnap.fieldProvenance))
      : {};

  const existingConflictsList: FieldConflictRecord[] = Array.isArray(baseSnap.fieldConflicts)
    ? [...(baseSnap.fieldConflicts as FieldConflictRecord[])]
    : [];

  const baseSource = String(baseSnap.source || 'Google Maps');
  const baseIsVerified = typeof baseSnap.isVerified === 'boolean' ? baseSnap.isVerified : true;

  const incomingPriority = getSourceTrustPriority(
    incoming.sourceType || incoming.source,
    incoming.isVerified
  );
  const existingDefaultPriority = getSourceTrustPriority(baseSource, baseIsVerified);

  const updateProvenance = (field: string, value: unknown, isNewConfirmationOnly = false) => {
    const prev = existingProvenance[field];
    if (isNewConfirmationOnly && prev) {
      existingProvenance[field] = {
        ...prev,
        verifiedAt: nowIso,
        confirmedBySources: Array.from(
          new Set([...(prev.confirmedBySources || [prev.source]), incoming.source])
        ),
      };
    } else {
      existingProvenance[field] = {
        value,
        source: incoming.source,
        sourceType: incoming.sourceType,
        sourceRecordId: sourceRecordId || null,
        externalId: incoming.externalId || null,
        priority: incomingPriority,
        firstSeenAt: prev?.firstSeenAt || nowIso,
        verifiedAt: nowIso,
        confirmedBySources: prev
          ? Array.from(new Set([...(prev.confirmedBySources || [prev.source]), incoming.source]))
          : [incoming.source],
      };
    }
  };

  // 0. Business Name
  let businessName = String(baseSnap.businessName || incoming.businessName);
  let normalizedName = (baseSnap.normalizedName as string | null) ?? incoming.normalizedName;
  if (preferredFields?.businessName === 'INCOMING' && incoming.businessName) {
    businessName = incoming.businessName;
    normalizedName = incoming.normalizedName;
    updateProvenance('businessName', businessName);
  } else if (normalizedName && incoming.normalizedName && normalizedName === incoming.normalizedName) {
    updateProvenance('businessName', businessName, true);
  }

  // 1. Merge Sources
  const baseSourceList = Array.isArray(baseSnap.sourceList)
    ? (baseSnap.sourceList as string[])
    : [baseSource];
  const mergedSources = Array.from(new Set([...baseSourceList, incoming.source]));

  // 2. Merge Phones (supports multiple phones per business)
  const baseNormalizedPhone = (baseSnap.normalizedPhone as string | null) || null;
  const basePhone = (baseSnap.phone as string | null) || null;
  const basePhones = Array.isArray(baseSnap.phones) ? (baseSnap.phones as string[]) : [];

  const allPhonesSet = new Set<string>();
  if (baseNormalizedPhone) allPhonesSet.add(baseNormalizedPhone);
  for (const p of basePhones) {
    if (p) allPhonesSet.add(p);
  }
  if (incoming.normalizedPhone) allPhonesSet.add(incoming.normalizedPhone);
  for (const p of incoming.normalizedPhones || []) {
    if (p) allPhonesSet.add(p);
  }
  const mergedPhones = Array.from(allPhonesSet);

  let phone = basePhone;
  let normalizedPhone = baseNormalizedPhone;
  if (!baseNormalizedPhone && incoming.normalizedPhone) {
    phone = incoming.phone;
    normalizedPhone = incoming.normalizedPhone;
    enrichedFields.push('phone');
    updateProvenance('phone', phone);
    updateProvenance('normalizedPhone', normalizedPhone);
  } else if (baseNormalizedPhone && incoming.normalizedPhone) {
    if (baseNormalizedPhone === incoming.normalizedPhone) {
      updateProvenance('phone', basePhone, true);
      updateProvenance('normalizedPhone', baseNormalizedPhone, true);
    } else if (preferredFields?.phone === 'INCOMING') {
      newConflicts.push({
        field: 'normalizedPhone',
        existingValue: baseNormalizedPhone,
        incomingValue: incoming.normalizedPhone,
        existingSource: existingProvenance.phone?.source || baseSource,
        incomingSource: incoming.source,
        resolution: 'UPDATED_BY_PRIORITY',
        detectedAt: nowIso,
      });
      phone = incoming.phone;
      normalizedPhone = incoming.normalizedPhone;
      updateProvenance('phone', phone);
      updateProvenance('normalizedPhone', normalizedPhone);
    } else {
      newConflicts.push({
        field: 'normalizedPhone',
        existingValue: baseNormalizedPhone,
        incomingValue: incoming.normalizedPhone,
        existingSource: existingProvenance.phone?.source || baseSource,
        incomingSource: incoming.source,
        resolution: 'KEPT_EXISTING',
        detectedAt: nowIso,
      });
    }
  }
  const hasPhone = Boolean(normalizedPhone || mergedPhones.length > 0);

  // 3. Merge Email
  const baseEmail = (baseSnap.email as string | null) || null;
  const baseNormalizedEmail = (baseSnap.normalizedEmail as string | null) || null;
  let email = baseEmail;
  let normalizedEmail = baseNormalizedEmail;
  if (!baseNormalizedEmail && incoming.normalizedEmail) {
    email = incoming.email;
    normalizedEmail = incoming.normalizedEmail;
    enrichedFields.push('email');
    updateProvenance('email', email);
  } else if (baseNormalizedEmail && incoming.normalizedEmail) {
    if (baseNormalizedEmail === incoming.normalizedEmail) {
      updateProvenance('email', baseEmail, true);
    } else if (preferredFields?.email === 'INCOMING') {
      newConflicts.push({
        field: 'normalizedEmail',
        existingValue: baseNormalizedEmail,
        incomingValue: incoming.normalizedEmail,
        existingSource: existingProvenance.email?.source || baseSource,
        incomingSource: incoming.source,
        resolution: 'UPDATED_BY_PRIORITY',
        detectedAt: nowIso,
      });
      email = incoming.email;
      normalizedEmail = incoming.normalizedEmail;
      updateProvenance('email', email);
    } else {
      newConflicts.push({
        field: 'normalizedEmail',
        existingValue: baseNormalizedEmail,
        incomingValue: incoming.normalizedEmail,
        existingSource: existingProvenance.email?.source || baseSource,
        incomingSource: incoming.source,
        resolution: 'KEPT_EXISTING',
        detectedAt: nowIso,
      });
    }
  }
  const hasEmail = Boolean(normalizedEmail);

  // 4. Merge Website & Domain (Test E: Never silently discard domain conflict!)
  const baseWebsite = (baseSnap.website as string | null) || null;
  const baseNormalizedDomain = (baseSnap.normalizedDomain as string | null) || null;
  const baseWebsiteStatus =
    (baseSnap.websiteStatus as 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN') ||
    'NO_WEBSITE';

  let website = baseWebsite;
  let normalizedDomain = baseNormalizedDomain;
  let websiteStatus = baseWebsiteStatus;

  if (!baseNormalizedDomain && incoming.normalizedDomain) {
    website = incoming.website;
    normalizedDomain = incoming.normalizedDomain;
    websiteStatus =
      incoming.websiteStatus !== 'NO_WEBSITE' && incoming.websiteStatus !== 'UNKNOWN'
        ? incoming.websiteStatus
        : 'HAS_WEBSITE';
    enrichedFields.push('website');
    updateProvenance('website', website);
    updateProvenance('normalizedDomain', normalizedDomain);
  } else if (baseNormalizedDomain && incoming.normalizedDomain) {
    if (baseNormalizedDomain === incoming.normalizedDomain) {
      updateProvenance('website', baseWebsite, true);
      updateProvenance('normalizedDomain', baseNormalizedDomain, true);
      if (baseWebsiteStatus === 'NO_WEBSITE' || baseWebsiteStatus === 'UNKNOWN') {
        websiteStatus = incoming.websiteStatus;
      }
    } else if (preferredFields?.website === 'INCOMING') {
      newConflicts.push({
        field: 'website',
        existingValue: baseNormalizedDomain,
        incomingValue: incoming.normalizedDomain,
        existingSource: existingProvenance.normalizedDomain?.source || baseSource,
        incomingSource: incoming.source,
        resolution: 'UPDATED_BY_PRIORITY',
        detectedAt: nowIso,
      });
      website = incoming.website;
      normalizedDomain = incoming.normalizedDomain;
      websiteStatus = incoming.websiteStatus;
      updateProvenance('website', website);
      updateProvenance('normalizedDomain', normalizedDomain);
    } else {
      // Domain Conflict! Preserve existing domain and flag conflict for Admin Review
      newConflicts.push({
        field: 'website',
        existingValue: baseNormalizedDomain,
        incomingValue: incoming.normalizedDomain,
        existingSource: existingProvenance.normalizedDomain?.source || baseSource,
        incomingSource: incoming.source,
        resolution: 'FLAGGED_FOR_REVIEW',
        detectedAt: nowIso,
      });
    }
  }

  // 5. Merge Social Profiles
  const baseFacebook = (baseSnap.facebook as string | null) || null;
  const baseNormalizedFacebook = (baseSnap.normalizedFacebook as string | null) || null;
  let facebook = baseFacebook;
  let normalizedFacebook = baseNormalizedFacebook;
  if (!baseFacebook && incoming.facebook) {
    facebook = incoming.facebook;
    normalizedFacebook = incoming.normalizedFacebook;
    enrichedFields.push('facebook');
    updateProvenance('facebook', facebook);
  }
  const hasFacebook = Boolean(facebook);

  const baseInstagram = (baseSnap.instagram as string | null) || null;
  const baseNormalizedInstagram = (baseSnap.normalizedInstagram as string | null) || null;
  let instagram = baseInstagram;
  let normalizedInstagram = baseNormalizedInstagram;
  if (!baseInstagram && incoming.instagram) {
    instagram = incoming.instagram;
    normalizedInstagram = incoming.normalizedInstagram;
    enrichedFields.push('instagram');
    updateProvenance('instagram', instagram);
  }
  const hasInstagram = Boolean(instagram);

  // 6. Merge Address & Area
  const baseAddress = (baseSnap.address as string | null) || null;
  const baseNormalizedAddress = (baseSnap.normalizedAddress as string | null) || null;
  const existingAddressPriority = existingProvenance.address?.priority ?? existingDefaultPriority;

  let address = baseAddress;
  let normalizedAddress = baseNormalizedAddress;
  if (!baseAddress && incoming.address) {
    address = incoming.address;
    normalizedAddress = incoming.normalizedAddress;
    enrichedFields.push('address');
    updateProvenance('address', address);
  } else if (
    baseNormalizedAddress &&
    incoming.normalizedAddress &&
    baseNormalizedAddress === incoming.normalizedAddress
  ) {
    updateProvenance('address', baseAddress, true);
  } else if (
    baseNormalizedAddress &&
    incoming.normalizedAddress &&
    baseNormalizedAddress !== incoming.normalizedAddress
  ) {
    const isNonConflictingDetailExpansion =
      (incoming.normalizedAddress.includes(baseNormalizedAddress) &&
        incoming.normalizedAddress.length > baseNormalizedAddress.length) ||
      (incomingPriority > existingAddressPriority &&
        incoming.normalizedAddress.length > baseNormalizedAddress.length);
    if (preferredFields?.address === 'INCOMING' || isNonConflictingDetailExpansion) {
      address = incoming.address;
      normalizedAddress = incoming.normalizedAddress;
      updateProvenance('address', address);
    }
  }

  const baseArea = (baseSnap.area as string | null) || null;
  const area = baseArea || incoming.area;
  if (!baseArea && incoming.area) {
    enrichedFields.push('area');
  }

  // 7. Merge Quantitative & Verification Attributes
  const baseReviewCount = typeof baseSnap.reviewCount === 'number' ? baseSnap.reviewCount : 0;
  const baseBranchCount = typeof baseSnap.branchCount === 'number' ? baseSnap.branchCount : 1;
  const baseRating = typeof baseSnap.rating === 'number' ? baseSnap.rating : null;
  const baseEstimatedBudget =
    typeof baseSnap.estimatedBudget === 'number' ? baseSnap.estimatedBudget : 0;
  const baseIsRecentlyActive =
    typeof baseSnap.isRecentlyActive === 'boolean' ? baseSnap.isRecentlyActive : true;

  const reviewCount = Math.max(baseReviewCount, incoming.reviewCount);
  const branchCount = Math.max(baseBranchCount, incoming.branchCount);
  const rating =
    baseRating === null || baseRating === undefined
      ? incoming.rating
      : incoming.rating !== null &&
          incoming.rating !== undefined &&
          incomingPriority > existingDefaultPriority
        ? incoming.rating
        : baseRating;
  const isVerified = baseIsVerified || incoming.isVerified;
  const isRecentlyActive = baseIsRecentlyActive || incoming.isRecentlyActive;
  const estimatedBudget = Math.max(baseEstimatedBudget, incoming.estimatedBudget || 0);

  const city = String(baseSnap.city || incoming.city);

  // 8. Canonical Identity Keys
  const generatedKeys = generateCanonicalIdentityKeys({
    businessName,
    normalizedName,
    city,
    address,
    normalizedAddress,
    phone,
    normalizedPhone,
    normalizedPhones: mergedPhones,
    email,
    normalizedEmail,
    website,
    normalizedDomain,
    facebook,
    normalizedFacebook,
    instagram,
    normalizedInstagram,
    source: incoming.source,
    sourceType: incoming.sourceType,
    externalId: incoming.externalId,
  });

  const baseIdentityKeys = Array.isArray(baseSnap.canonicalIdentityKeys)
    ? (baseSnap.canonicalIdentityKeys as string[])
    : [];
  const combinedIdentityKeys = Array.from(
    new Set([...baseIdentityKeys, ...generatedKeys.allKeys])
  );
  const combinedConflicts = [...existingConflictsList, ...newConflicts];

  const mergedSnapshot: Record<string, unknown> = {
    ...baseSnap,
    businessName,
    normalizedName,
    area,
    address,
    normalizedAddress,
    phone,
    normalizedPhone,
    phones: mergedPhones,
    hasPhone,
    email,
    normalizedEmail,
    hasEmail,
    website,
    normalizedDomain,
    websiteStatus,
    facebook,
    normalizedFacebook,
    hasFacebook,
    instagram,
    normalizedInstagram,
    hasInstagram,
    rating,
    reviewCount,
    branchCount,
    estimatedBudget,
    isVerified,
    isRecentlyActive,
    sourceList: mergedSources,
    canonicalIdentityKeys: combinedIdentityKeys,
    fieldProvenance: existingProvenance,
    fieldConflicts: combinedConflicts,
  };

  return {
    mergedSnapshot,
    enrichedFields,
    newConflicts,
    generatedKeys,
  };
}

/**
 * Controlled deterministic merge of an incoming source record into an existing Canonical Lead.
 * - Preserves source provenance per field
 * - Enriches missing fields without overwriting high-quality existing data
 * - Records field conflicts when values differ
 * - Writes an auditable LeadMergeHistory record
 * - Recalculates Phase 1 Lead Score
 */
export async function mergeSourceIntoCanonicalLead(
  prisma: PrismaClient,
  existing: Lead,
  incoming: NormalizedLeadData,
  options: MergeLeadOptions = {}
): Promise<MergeExecutionResult> {
  const startMs = Date.now();
  const now = new Date();
  const nowIso = now.toISOString();
  const performedBy = options.performedBy || 'SYSTEM';
  const mergeType = options.mergeType || (performedBy === 'SYSTEM' ? 'AUTOMATIC' : 'MANUAL_ADMIN');
  const reason = options.reason || 'DUPLICATE_CONFIRMED';

  const beforeSnapshot = captureLeadStateSnapshot(existing);
  const { mergedSnapshot, enrichedFields, newConflicts, generatedKeys } =
    computeDeterministicSnapshotMerge(beforeSnapshot, incoming, {
      sourceRecordId: options.sourceRecordId,
      preferredFields: options.preferredFields,
      nowIso,
    });

  const businessName = mergedSnapshot.businessName as string;
  const normalizedName = mergedSnapshot.normalizedName as string | null;
  const area = mergedSnapshot.area as string | null;
  const address = mergedSnapshot.address as string | null;
  const normalizedAddress = mergedSnapshot.normalizedAddress as string | null;
  const phone = mergedSnapshot.phone as string | null;
  const normalizedPhone = mergedSnapshot.normalizedPhone as string | null;
  const mergedPhones = mergedSnapshot.phones as string[];
  const hasPhone = mergedSnapshot.hasPhone as boolean;
  const email = mergedSnapshot.email as string | null;
  const normalizedEmail = mergedSnapshot.normalizedEmail as string | null;
  const hasEmail = mergedSnapshot.hasEmail as boolean;
  const website = mergedSnapshot.website as string | null;
  const normalizedDomain = mergedSnapshot.normalizedDomain as string | null;
  const websiteStatus = mergedSnapshot.websiteStatus as
    | 'NO_WEBSITE'
    | 'HAS_WEBSITE'
    | 'POOR_WEBSITE'
    | 'UNKNOWN';
  const facebook = mergedSnapshot.facebook as string | null;
  const normalizedFacebook = mergedSnapshot.normalizedFacebook as string | null;
  const hasFacebook = mergedSnapshot.hasFacebook as boolean;
  const instagram = mergedSnapshot.instagram as string | null;
  const normalizedInstagram = mergedSnapshot.normalizedInstagram as string | null;
  const hasInstagram = mergedSnapshot.hasInstagram as boolean;
  const rating = mergedSnapshot.rating as number | null;
  const reviewCount = mergedSnapshot.reviewCount as number;
  const branchCount = mergedSnapshot.branchCount as number;
  const estimatedBudget = mergedSnapshot.estimatedBudget as number;
  const isVerified = mergedSnapshot.isVerified as boolean;
  const isRecentlyActive = mergedSnapshot.isRecentlyActive as boolean;
  const mergedSources = mergedSnapshot.sourceList as string[];
  const combinedIdentityKeys = mergedSnapshot.canonicalIdentityKeys as string[];
  const existingProvenance = mergedSnapshot.fieldProvenance as LeadFieldProvenanceMap;
  const combinedConflicts = mergedSnapshot.fieldConflicts as FieldConflictRecord[];

  // 9. Phase 1 Scoring Integration
  let rulesToUse = options.rules;
  let versionToUse = options.scoringVersion;
  let thresholdsToUse = options.thresholds;

  if (!rulesToUse || !versionToUse) {
    const ctx = await loadScoringContext(prisma);
    rulesToUse = rulesToUse || ctx.rules;
    versionToUse = versionToUse || ctx.scoringVersion;
    thresholdsToUse = thresholdsToUse || ctx.thresholds;
  }

  const latestSnapshot = await prisma.leadScore
    .findFirst({
      where: { leadId: existing.id },
      orderBy: [{ calculatedAt: 'desc' }, { evaluatedAt: 'desc' }],
    })
    .catch(() => null);

  const scoreResult = calculateLeadScore(
    {
      isVerified,
      websiteStatus,
      website,
      normalizedDomain,
      websiteAnalysis:
        existing.websiteAnalysis && typeof existing.websiteAnalysis === 'object'
          ? (existing.websiteAnalysis as Record<string, unknown>)
          : null,
      hasFacebook,
      facebook,
      hasInstagram,
      instagram,
      hasPhone,
      phone,
      normalizedPhone,
      hasEmail,
      email,
      normalizedEmail,
      branchCount,
      reviewCount,
      rating,
      isRecentlyActive,
      category: existing.category,
      city: existing.city,
      governorate: existing.governorate,
      area,
      estimatedBudget,
      source: existing.source,
      sourceList: mergedSources,
      lastVerifiedAt: now,
    },
    rulesToUse,
    {
      scoringVersion: versionToUse,
      thresholds: thresholdsToUse,
      calculatedAt: now,
    }
  );

  const shouldCreateSnapshot = hasScoreMateriallyChanged(latestSnapshot, scoreResult);
  const sequenceOrder = ++monotonicMergeSeq;

  const mergedQualityEval = evaluateLeadQuality(
    {
      businessName,
      normalizedName: normalizedName || existing.normalizedName,
      category: existing.category,
      governorate: existing.governorate,
      city: existing.city,
      area,
      address,
      normalizedAddress,
      phone,
      normalizedPhone,
      phones: mergedPhones,
      hasPhone,
      email,
      normalizedEmail,
      hasEmail,
      website,
      normalizedDomain,
      websiteStatus,
      facebook,
      normalizedFacebook,
      hasFacebook,
      instagram,
      normalizedInstagram,
      hasInstagram,
      rating,
      reviewCount,
      branchCount,
      score: scoreResult.normalizedScore,
      isVerified,
      isCanonical: true,
      source: existing.source,
      sourceList: mergedSources,
      fieldConflicts: combinedConflicts,
      lastVerifiedAt: now,
    },
    { now }
  );

  const nextMergedStatus =
    existing.status === 'ARCHIVED'
      ? 'ARCHIVED'
      : existing.currentPurchasers >= existing.maxPurchasers &&
        mergedQualityEval.saleabilityStatus === 'AVAILABLE'
      ? 'CLAIMED_FULL'
      : mergedQualityEval.saleabilityStatus;

  const txResult = await prisma.$transaction(async (tx) => {
    const updatedLead = await tx.lead.update({
      where: { id: existing.id },
      data: {
        businessName,
        normalizedName: normalizedName || existing.normalizedName,
        area,
        address,
        normalizedAddress,
        phone,
        normalizedPhone,
        phones: mergedPhones,
        hasPhone,
        email,
        normalizedEmail,
        hasEmail,
        website,
        normalizedDomain,
        websiteStatus,
        facebook,
        normalizedFacebook,
        hasFacebook,
        instagram,
        normalizedInstagram,
        hasInstagram,
        rating,
        reviewCount,
        branchCount,
        estimatedBudget,
        isVerified,
        isRecentlyActive,
        sourceList: mergedSources,
        canonicalIdentityKeys: combinedIdentityKeys,
        fieldProvenance: existingProvenance as unknown as object,
        fieldConflicts: combinedConflicts as unknown as object,
        status: nextMergedStatus,
        qualityScore: mergedQualityEval.qualityScore,
        qualityStatus: mergedQualityEval.qualityStatus,
        freshnessStatus: mergedQualityEval.freshness.freshnessStatus,
        verificationStatus: mergedQualityEval.verificationStatus,
        saleabilityStatus: mergedQualityEval.saleabilityStatus,
        completenessScore: mergedQualityEval.completeness.completenessScore,
        completenessBreakdown: mergedQualityEval.completeness as unknown as object,
        qualityFlags: mergedQualityEval.qualityFlags,
        qualitySummary: mergedQualityEval.summary as unknown as object,
        businessStatus: mergedQualityEval.businessStatus,
        phoneValidationStatus: mergedQualityEval.phoneValidationStatus,
        emailValidationStatus: mergedQualityEval.emailValidationStatus,
        websiteVerificationState: mergedQualityEval.websiteVerificationState,
        lastVerifiedAt: now,
        nextVerificationAt: mergedQualityEval.nextVerificationAt,
        score: scoreResult.normalizedScore,
        temperature: scoreResult.temperature,
        scoringVersion: scoreResult.scoringVersion,
        scoreExplanation: scoreResult.explanation as unknown as object,
        lastScoredAt: now,
        confidence: scoreResult.confidence,
        qualificationReasons: scoreResult.qualificationReasons,
        qualificationRules: scoreResult.qualificationRules as unknown as object,
      },
    });

    // Persist LeadIdentity child records for fast indexed lookup
    for (const keyRec of generatedKeys.records) {
      await tx.leadIdentity
        .upsert({
          where: {
            leadId_canonicalKey: {
              leadId: existing.id,
              canonicalKey: keyRec.canonicalKey,
            },
          },
          update: {
            isPrimary: keyRec.isPrimary,
          },
          create: {
            leadId: existing.id,
            keyType: keyRec.keyType,
            keyValue: keyRec.keyValue,
            canonicalKey: keyRec.canonicalKey,
            source: incoming.source,
            sourceRecordId: options.sourceRecordId || null,
            isPrimary: keyRec.isPrimary,
          },
        })
        .catch(() => null);
    }

    let updatedSourceRecord = null;
    if (options.sourceRecordId) {
      updatedSourceRecord = await tx.sourceRecord
        .update({
          where: { id: options.sourceRecordId },
          data: {
            leadId: existing.id,
            status: newConflicts.some((c) => c.resolution === 'FLAGGED_FOR_REVIEW')
              ? 'CONFLICT'
              : 'MERGED',
            lastSeenAt: now,
          },
        })
        .catch(() => null);
    }

    // If domain conflict was detected during automatic merge (Test E), create a CONFLICT DuplicateCandidate for Admin review
    if (newConflicts.some((c) => c.resolution === 'FLAGGED_FOR_REVIEW')) {
      await tx.duplicateCandidate.create({
        data: {
          sourceRecordId: options.sourceRecordId || null,
          candidateLeadId: options.sourceLeadId || null,
          matchedLeadId: existing.id,
          decision: 'CONFLICT',
          status: 'PENDING',
          signals: (options.matchedSignals || []) as unknown as object,
          conflicts: newConflicts as unknown as object,
          confidenceLevel: 'HIGH',
        },
      });
    }

    const afterSnapshot = captureLeadStateSnapshot(updatedLead);

    const mergeHistory = await tx.leadMergeHistory.create({
      data: {
        targetLeadId: existing.id,
        sourceLeadId: options.sourceLeadId || null,
        sourceRecordId: options.sourceRecordId || null,
        mergeType,
        reason,
        decision: options.decision || 'DUPLICATE_CONFIRMED',
        matchedSignals: (options.matchedSignals || []) as unknown as object,
        fieldChanges: {
          before: beforeSnapshot,
          after: afterSnapshot,
          enrichedFields,
          conflictedFields: newConflicts,
          preferredFields: options.preferredFields || null,
          sequenceOrder,
        } as unknown as object,
        sourceLeadSnapshot: (options.sourceLeadSnapshot || null) as unknown as object,
        conflictsRecorded: newConflicts as unknown as object,
        performedBy,
        performedAt: now,
      },
    });

    if (shouldCreateSnapshot) {
      await tx.leadScore.create({
        data: {
          leadId: existing.id,
          previousScore: latestSnapshot ? latestSnapshot.normalizedScore : existing.score,
          rawScore: scoreResult.rawScore,
          normalizedScore: scoreResult.normalizedScore,
          newScore: scoreResult.normalizedScore,
          previousClassification: latestSnapshot
            ? latestSnapshot.temperature
            : existing.temperature,
          temperature: scoreResult.temperature,
          newClassification: scoreResult.classification,
          scoringVersion: scoreResult.scoringVersion,
          trigger: 'SOURCE_REFRESH',
          appliedRules: scoreResult.appliedRules as unknown as object,
          evaluatedRules: scoreResult.evaluatedRules as unknown as object,
          explanation: scoreResult.explanation as unknown as object,
          qualificationReasons: scoreResult.qualificationReasons,
          calculatedAt: now,
          evaluatedAt: now,
        },
      });
    }

    return {
      updatedLead,
      updatedSourceRecord,
      mergeHistory,
      afterSnapshot,
    };
  });

  logScoringOperation({
    event: 'LEAD_SCORE_EVALUATED',
    leadId: existing.id,
    scoringVersion: scoreResult.scoringVersion,
    previousScore: latestSnapshot ? latestSnapshot.normalizedScore : existing.score,
    newScore: scoreResult.normalizedScore,
    previousClassification: latestSnapshot ? latestSnapshot.temperature : existing.temperature,
    classification: scoreResult.classification,
    trigger: 'SOURCE_REFRESH',
    durationMs: Date.now() - startMs,
    rulesApplied: scoreResult.appliedRules.map((r) => r.ruleKey),
  });

  logMergeOperation({
    event: 'LEAD_MERGED',
    mergeId: txResult.mergeHistory.id,
    sourceLeadId: options.sourceLeadId || null,
    sourceRecordId: options.sourceRecordId || null,
    targetLeadId: existing.id,
    reason,
    performedBy,
    durationMs: Date.now() - startMs,
  });

  return {
    mergeId: txResult.mergeHistory.id,
    lead: txResult.updatedLead,
    sourceRecord: txResult.updatedSourceRecord,
    fieldChanges: {
      before: beforeSnapshot,
      after: txResult.afterSnapshot,
      enrichedFields,
      conflictedFields: newConflicts,
    },
    scoreRecalculated: shouldCreateSnapshot,
    newScore: scoreResult.normalizedScore,
  };
}

/**
 * Reverses a previous automatic or manual merge (Section 24: Unmerge / Recovery).
 * - Restores the target Canonical Lead to its pre-merge state (and replays any subsequent active merges!)
 * - Restores the merged SourceLead (or creates an independent Canonical Lead from the SourceRecord)
 * - Recalculates Phase 1 scores for both Leads
 * - Marks LeadMergeHistory as reverted
 */
export async function unmergeLead(params: {
  prisma: PrismaClient;
  mergeId: string;
  performedBy: string;
  reason?: string;
}) {
  const { prisma, mergeId, performedBy, reason } = params;
  const startMs = Date.now();

  const history = await prisma.leadMergeHistory.findUnique({
    where: { id: mergeId },
    include: {
      targetLead: true,
      sourceRecord: true,
      sourceLead: true,
    },
  });

  if (!history) {
    throw new MergeServiceError('سجل عملية الدمج غير موجود.', 'MERGE_HISTORY_NOT_FOUND', 404);
  }

  if (history.isReverted) {
    throw new MergeServiceError(
      'تم التراجع عن عملية الدمج هذه مسبقًا.',
      'MERGE_ALREADY_REVERTED',
      409
    );
  }

  const fieldChanges = history.fieldChanges as unknown as {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    sequenceOrder?: number;
  };
  const initialBefore = fieldChanges?.before || {};
  const now = new Date();
  const scoringCtx = await loadScoringContext(prisma);

  const txResult = await prisma.$transaction(async (tx) => {
    // Find all active (non-reverted) merges on targetLeadId so if an earlier merge in a chain
    // is reverted out-of-order, subsequent active merges are deterministically replayed!
    const allActiveMerges = await tx.leadMergeHistory.findMany({
      where: {
        targetLeadId: history.targetLeadId,
        isReverted: false,
      },
      include: {
        sourceRecord: true,
        sourceLead: true,
      },
      orderBy: [{ performedAt: 'asc' }, { id: 'asc' }],
    });

    allActiveMerges.sort((a, b) => {
      const timeDiff = a.performedAt.getTime() - b.performedAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      const seqA =
        ((a.fieldChanges as Record<string, unknown> | null)?.sequenceOrder as number) ?? 0;
      const seqB =
        ((b.fieldChanges as Record<string, unknown> | null)?.sequenceOrder as number) ?? 0;
      return seqA - seqB;
    });

    const selfIdx = allActiveMerges.findIndex((m) => m.id === history.id);
    const subsequentActiveMerges =
      selfIdx >= 0 ? allActiveMerges.slice(selfIdx + 1) : [];

    let targetSnapshot: Record<string, unknown> = { ...initialBefore };

    // Replay any subsequent active merges on top of initialBefore and update their before/after snapshots
    for (const subHist of subsequentActiveMerges) {
      let subIncoming: NormalizedLeadData | null = null;
      if (subHist.sourceRecord?.normalizedData) {
        subIncoming = subHist.sourceRecord.normalizedData as unknown as NormalizedLeadData;
      } else if (subHist.sourceLeadSnapshot || subHist.sourceLead) {
        const rawSrc = (subHist.sourceLeadSnapshot || subHist.sourceLead) as Record<
          string,
          unknown
        >;
        const val = validateAndNormalizeLead({
          businessName: String(rawSrc.businessName || ''),
          category: String(rawSrc.category || 'Other'),
          city: String(rawSrc.city || ''),
          governorate: String(rawSrc.governorate || rawSrc.city || ''),
          area: (rawSrc.area as string) || null,
          address: (rawSrc.address as string) || null,
          phone: (rawSrc.phone as string) || null,
          phones: Array.isArray(rawSrc.phones) ? (rawSrc.phones as string[]) : undefined,
          email: (rawSrc.email as string) || null,
          website: (rawSrc.website as string) || null,
          websiteStatus:
            (rawSrc.websiteStatus as
              | 'NO_WEBSITE'
              | 'HAS_WEBSITE'
              | 'POOR_WEBSITE'
              | 'UNKNOWN') || undefined,
          facebook: (rawSrc.facebook as string) || null,
          instagram: (rawSrc.instagram as string) || null,
          rating: typeof rawSrc.rating === 'number' ? rawSrc.rating : null,
          reviewCount: typeof rawSrc.reviewCount === 'number' ? rawSrc.reviewCount : 0,
          branchCount: typeof rawSrc.branchCount === 'number' ? rawSrc.branchCount : 1,
          source: String(rawSrc.source || 'Google Maps'),
        });
        subIncoming = val.data || null;
      }

      if (subIncoming) {
        const subFc = (subHist.fieldChanges || {}) as Record<string, unknown>;
        const subBefore = { ...targetSnapshot };
        const replayed = computeDeterministicSnapshotMerge(subBefore, subIncoming, {
          sourceRecordId: subHist.sourceRecordId,
          preferredFields:
            (subFc.preferredFields as MergeLeadOptions['preferredFields']) || undefined,
          nowIso: subHist.performedAt.toISOString(),
        });
        targetSnapshot = replayed.mergedSnapshot;

        await tx.leadMergeHistory.update({
          where: { id: subHist.id },
          data: {
            fieldChanges: {
              ...subFc,
              before: subBefore,
              after: targetSnapshot,
              enrichedFields: replayed.enrichedFields,
              conflictedFields: replayed.newConflicts,
            } as unknown as object,
          },
        });
      }
    }

    const finalIdentityKeys = Array.isArray(targetSnapshot.canonicalIdentityKeys)
      ? (targetSnapshot.canonicalIdentityKeys as string[])
      : [];

    // 1. Restore Target Lead to the computed snapshot
    const restoredTarget = await tx.lead.update({
      where: { id: history.targetLeadId },
      data: {
        businessName:
          (targetSnapshot.businessName as string) || history.targetLead.businessName,
        normalizedName:
          (targetSnapshot.normalizedName as string | null) ?? history.targetLead.normalizedName,
        area: (targetSnapshot.area as string | null) ?? null,
        address: (targetSnapshot.address as string | null) ?? null,
        normalizedAddress: (targetSnapshot.normalizedAddress as string | null) ?? null,
        phone: (targetSnapshot.phone as string | null) ?? null,
        normalizedPhone: (targetSnapshot.normalizedPhone as string | null) ?? null,
        phones: Array.isArray(targetSnapshot.phones)
          ? (targetSnapshot.phones as string[])
          : [],
        hasPhone:
          typeof targetSnapshot.hasPhone === 'boolean'
            ? targetSnapshot.hasPhone
            : Boolean(targetSnapshot.normalizedPhone),
        email: (targetSnapshot.email as string | null) ?? null,
        normalizedEmail: (targetSnapshot.normalizedEmail as string | null) ?? null,
        hasEmail: Boolean(targetSnapshot.normalizedEmail),
        website: (targetSnapshot.website as string | null) ?? null,
        normalizedDomain: (targetSnapshot.normalizedDomain as string | null) ?? null,
        websiteStatus:
          (targetSnapshot.websiteStatus as
            | 'NO_WEBSITE'
            | 'HAS_WEBSITE'
            | 'POOR_WEBSITE'
            | 'UNKNOWN') || 'NO_WEBSITE',
        facebook: (targetSnapshot.facebook as string | null) ?? null,
        normalizedFacebook: (targetSnapshot.normalizedFacebook as string | null) ?? null,
        hasFacebook: Boolean(targetSnapshot.facebook),
        instagram: (targetSnapshot.instagram as string | null) ?? null,
        normalizedInstagram: (targetSnapshot.normalizedInstagram as string | null) ?? null,
        hasInstagram: Boolean(targetSnapshot.instagram),
        rating:
          targetSnapshot.rating !== undefined
            ? (targetSnapshot.rating as number | null)
            : history.targetLead.rating,
        reviewCount:
          typeof targetSnapshot.reviewCount === 'number'
            ? targetSnapshot.reviewCount
            : history.targetLead.reviewCount,
        branchCount:
          typeof targetSnapshot.branchCount === 'number'
            ? targetSnapshot.branchCount
            : history.targetLead.branchCount,
        estimatedBudget:
          typeof targetSnapshot.estimatedBudget === 'number'
            ? targetSnapshot.estimatedBudget
            : history.targetLead.estimatedBudget,
        isVerified:
          typeof targetSnapshot.isVerified === 'boolean'
            ? targetSnapshot.isVerified
            : history.targetLead.isVerified,
        isRecentlyActive:
          typeof targetSnapshot.isRecentlyActive === 'boolean'
            ? targetSnapshot.isRecentlyActive
            : history.targetLead.isRecentlyActive,
        sourceList: Array.isArray(targetSnapshot.sourceList)
          ? (targetSnapshot.sourceList as string[])
          : [history.targetLead.source],
        canonicalIdentityKeys: finalIdentityKeys,
        fieldProvenance: (targetSnapshot.fieldProvenance as object) || {},
        fieldConflicts: (targetSnapshot.fieldConflicts as object) || [],
      },
    });

    // Remove LeadIdentity entries added specifically by this sourceRecordId or no longer in finalIdentityKeys
    if (history.sourceRecordId) {
      await tx.leadIdentity.deleteMany({
        where: {
          leadId: history.targetLeadId,
          sourceRecordId: history.sourceRecordId,
        },
      });
    }
    if (finalIdentityKeys.length > 0) {
      await tx.leadIdentity.deleteMany({
        where: {
          leadId: history.targetLeadId,
          canonicalKey: { notIn: finalIdentityKeys },
        },
      });
    }

    // 2. Restore or Separate the Merged Lead / SourceRecord
    let separatedLead: Lead | null = null;

    if (history.sourceLeadId && history.sourceLead) {
      const srcSnap = (history.sourceLeadSnapshot || {}) as Record<string, unknown>;
      separatedLead = await tx.lead.update({
        where: { id: history.sourceLeadId },
        data: {
          status:
            (srcSnap.status as 'AVAILABLE' | 'CLAIMED_FULL' | 'INVALID' | 'ARCHIVED') ||
            'AVAILABLE',
          isCanonical: true,
          mergedIntoLeadId: null,
        },
      });

      const snapSourceRecordIds = Array.isArray(srcSnap.sourceRecordIds)
        ? (srcSnap.sourceRecordIds as string[])
        : [];
      if (snapSourceRecordIds.length > 0) {
        await tx.sourceRecord.updateMany({
          where: {
            id: { in: snapSourceRecordIds },
            leadId: history.targetLeadId,
          },
          data: {
            leadId: separatedLead.id,
            status: 'ACTIVE',
          },
        });
      }

      if (history.sourceRecordId) {
        await tx.sourceRecord.update({
          where: { id: history.sourceRecordId },
          data: {
            leadId: separatedLead.id,
            status: 'UNMERGED',
          },
        });
      }
    } else if (history.sourceRecord) {
      const norm = history.sourceRecord.normalizedData as unknown as NormalizedLeadData;
      if (norm && norm.businessName && norm.city) {
        const sepScore = calculateLeadScore(
          {
            isVerified: norm.isVerified ?? true,
            websiteStatus: norm.websiteStatus || 'NO_WEBSITE',
            website: norm.website,
            normalizedDomain: norm.normalizedDomain,
            hasFacebook: Boolean(norm.facebook),
            facebook: norm.facebook,
            hasInstagram: Boolean(norm.instagram),
            instagram: norm.instagram,
            hasPhone: Boolean(norm.normalizedPhone),
            phone: norm.phone,
            normalizedPhone: norm.normalizedPhone,
            hasEmail: Boolean(norm.normalizedEmail),
            email: norm.email,
            normalizedEmail: norm.normalizedEmail,
            branchCount: norm.branchCount || 1,
            reviewCount: norm.reviewCount || 0,
            rating: norm.rating,
            isRecentlyActive: norm.isRecentlyActive ?? true,
            category: norm.category || 'Other',
            city: norm.city,
            governorate: norm.governorate || norm.city,
            area: norm.area,
            estimatedBudget: norm.estimatedBudget || 8000,
            source: norm.source || history.sourceRecord.sourceName,
            sourceList: [norm.source || history.sourceRecord.sourceName],
            lastVerifiedAt: now,
          },
          scoringCtx.rules,
          {
            scoringVersion: scoringCtx.scoringVersion,
            thresholds: scoringCtx.thresholds,
            calculatedAt: now,
          }
        );

        const sepKeys = generateCanonicalIdentityKeys(norm);

        separatedLead = await tx.lead.create({
          data: {
            businessName: norm.businessName,
            normalizedName: norm.normalizedName,
            category: norm.category || 'Other',
            governorate: norm.governorate || norm.city,
            city: norm.city,
            area: norm.area || null,
            address: norm.address || null,
            normalizedAddress: norm.normalizedAddress || null,
            phone: norm.phone || null,
            normalizedPhone: norm.normalizedPhone || null,
            phones: norm.normalizedPhones || (norm.normalizedPhone ? [norm.normalizedPhone] : []),
            hasPhone: Boolean(norm.normalizedPhone),
            email: norm.email || null,
            normalizedEmail: norm.normalizedEmail || null,
            hasEmail: Boolean(norm.normalizedEmail),
            website: norm.website || null,
            normalizedDomain: norm.normalizedDomain || null,
            websiteStatus: norm.websiteStatus || 'NO_WEBSITE',
            facebook: norm.facebook || null,
            normalizedFacebook: norm.normalizedFacebook || null,
            hasFacebook: Boolean(norm.facebook),
            instagram: norm.instagram || null,
            normalizedInstagram: norm.normalizedInstagram || null,
            hasInstagram: Boolean(norm.instagram),
            rating: norm.rating ?? null,
            reviewCount: norm.reviewCount || 0,
            branchCount: norm.branchCount || 1,
            estimatedBudget: norm.estimatedBudget || 8000,
            isVerified: norm.isVerified ?? true,
            isRecentlyActive: norm.isRecentlyActive ?? true,
            score: sepScore.normalizedScore,
            temperature: sepScore.temperature,
            scoringVersion: sepScore.scoringVersion,
            scoreExplanation: sepScore.explanation as unknown as object,
            lastScoredAt: now,
            status: 'AVAILABLE',
            confidence: sepScore.confidence,
            qualificationReasons: sepScore.qualificationReasons,
            qualificationRules: sepScore.qualificationRules as unknown as object,
            leadType: norm.leadType || 'SHARED',
            exclusive: Boolean(norm.exclusive),
            creditCost: Boolean(norm.normalizedPhone) ? (Boolean(norm.exclusive) ? 25 : 5) : 1,
            creditCostReason: Boolean(norm.normalizedPhone)
              ? (Boolean(norm.exclusive) ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD')
              : 'FIELD_VISIT_DISCOUNT',
            maxPurchasers: norm.maxPurchasers || 3,
            currentPurchasers: 0,
            source: norm.source || history.sourceRecord.sourceName,
            sourceList: [norm.source || history.sourceRecord.sourceName],
            sourceId: history.sourceRecord.sourceId,
            canonicalIdentityKeys: sepKeys.allKeys,
            fieldProvenance: buildInitialFieldProvenance(
              norm,
              history.sourceRecord.id,
              now
            ) as unknown as object,
            isCanonical: true,
            lastVerifiedAt: now,
            isMock: Boolean((norm as any).isMock ?? false),
          },
        });

        await tx.leadScore.create({
          data: {
            leadId: separatedLead.id,
            previousScore: null,
            rawScore: sepScore.rawScore,
            normalizedScore: sepScore.normalizedScore,
            newScore: sepScore.normalizedScore,
            previousClassification: null,
            temperature: sepScore.temperature,
            newClassification: sepScore.classification,
            scoringVersion: sepScore.scoringVersion,
            trigger: 'LEAD_CREATED',
            appliedRules: sepScore.appliedRules as unknown as object,
            evaluatedRules: sepScore.evaluatedRules as unknown as object,
            explanation: sepScore.explanation as unknown as object,
            qualificationReasons: sepScore.qualificationReasons,
            calculatedAt: now,
            evaluatedAt: now,
          },
        });

        await tx.sourceRecord.update({
          where: { id: history.sourceRecord.id },
          data: {
            leadId: separatedLead.id,
            status: 'UNMERGED',
          },
        });

        for (const k of sepKeys.records) {
          await tx.leadIdentity
            .create({
              data: {
                leadId: separatedLead.id,
                keyType: k.keyType,
                keyValue: k.keyValue,
                canonicalKey: k.canonicalKey,
                source: norm.source || history.sourceRecord.sourceName,
                sourceRecordId: history.sourceRecord.id,
                isPrimary: k.isPrimary,
              },
            })
            .catch(() => null);
        }
      }
    }

    // 3. Mark LeadMergeHistory as reverted
    const updatedHistory = await tx.leadMergeHistory.update({
      where: { id: mergeId },
      data: {
        isReverted: true,
        revertedAt: now,
        revertedBy: performedBy,
        revertReason: reason || 'Admin unmerge / recovery',
      },
    });

    return {
      restoredTarget,
      separatedLead,
      updatedHistory,
    };
  });

  // 4. Recalculate Phase 1 Score & Phase 3 Quality for the restored target Lead (and separated Lead if any)
  const recalcTarget = await recalculateLeadScore(prisma, history.targetLeadId, {
    trigger: 'LEAD_UPDATED',
    forceSnapshot: true,
  });

  const targetQ = evaluateLeadQuality(
    {
      ...recalcTarget.lead,
      websiteAnalysis:
        recalcTarget.lead.websiteAnalysis &&
        typeof recalcTarget.lead.websiteAnalysis === 'object'
          ? (recalcTarget.lead.websiteAnalysis as Record<string, unknown>)
          : null,
      isCanonical: true,
      lastVerifiedAt: recalcTarget.lead.lastVerifiedAt || now,
    },
    { now }
  );
  const finalTargetLead = await prisma.lead.update({
    where: { id: history.targetLeadId },
    data: {
      qualityScore: targetQ.qualityScore,
      qualityStatus: targetQ.qualityStatus,
      freshnessStatus: targetQ.freshness.freshnessStatus,
      verificationStatus: targetQ.verificationStatus,
      saleabilityStatus: targetQ.saleabilityStatus,
      status:
        recalcTarget.lead.status === 'ARCHIVED'
          ? 'ARCHIVED'
          : recalcTarget.lead.currentPurchasers >= recalcTarget.lead.maxPurchasers &&
            targetQ.saleabilityStatus === 'AVAILABLE'
          ? 'CLAIMED_FULL'
          : targetQ.saleabilityStatus,
      completenessScore: targetQ.completeness.completenessScore,
      completenessBreakdown: targetQ.completeness as unknown as object,
      qualityFlags: targetQ.qualityFlags,
      qualitySummary: targetQ.summary as unknown as object,
      businessStatus: targetQ.businessStatus,
      phoneValidationStatus: targetQ.phoneValidationStatus,
      emailValidationStatus: targetQ.emailValidationStatus,
      websiteVerificationState: targetQ.websiteVerificationState,
      nextVerificationAt: targetQ.nextVerificationAt,
    },
  });

  let finalSeparatedLead = txResult.separatedLead;
  if (finalSeparatedLead) {
    const sepQ = evaluateLeadQuality(
      {
        ...finalSeparatedLead,
        websiteAnalysis:
          finalSeparatedLead.websiteAnalysis &&
          typeof finalSeparatedLead.websiteAnalysis === 'object'
            ? (finalSeparatedLead.websiteAnalysis as Record<string, unknown>)
            : null,
        isCanonical: true,
        mergedIntoLeadId: null,
        lastVerifiedAt: finalSeparatedLead.lastVerifiedAt || now,
      },
      { now }
    );
    finalSeparatedLead = await prisma.lead.update({
      where: { id: finalSeparatedLead.id },
      data: {
        qualityScore: sepQ.qualityScore,
        qualityStatus: sepQ.qualityStatus,
        freshnessStatus: sepQ.freshness.freshnessStatus,
        verificationStatus: sepQ.verificationStatus,
        saleabilityStatus: sepQ.saleabilityStatus,
        status: sepQ.saleabilityStatus,
        completenessScore: sepQ.completeness.completenessScore,
        completenessBreakdown: sepQ.completeness as unknown as object,
        qualityFlags: sepQ.qualityFlags,
        qualitySummary: sepQ.summary as unknown as object,
        businessStatus: sepQ.businessStatus,
        phoneValidationStatus: sepQ.phoneValidationStatus,
        emailValidationStatus: sepQ.emailValidationStatus,
        websiteVerificationState: sepQ.websiteVerificationState,
        nextVerificationAt: sepQ.nextVerificationAt,
      },
    });
  }

  logMergeOperation({
    event: 'LEAD_UNMERGED',
    mergeId: history.id,
    sourceLeadId: finalSeparatedLead?.id || history.sourceLeadId,
    sourceRecordId: history.sourceRecordId,
    targetLeadId: history.targetLeadId,
    reason: reason || 'Admin unmerge / recovery',
    performedBy,
    durationMs: Date.now() - startMs,
  });

  return {
    mergeHistory: txResult.updatedHistory,
    targetLead: finalTargetLead,
    restoredLead: finalSeparatedLead,
  };
}

export class MergeService {
  static merge = mergeSourceIntoCanonicalLead;
  static unmerge = unmergeLead;
  static getSourceTrustPriority = getSourceTrustPriority;
  static buildInitialFieldProvenance = buildInitialFieldProvenance;
}

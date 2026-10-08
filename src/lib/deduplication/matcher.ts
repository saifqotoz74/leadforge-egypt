import { Lead, LeadIdentity, SourceRecord } from '@prisma/client';
import { NormalizedLeadData } from '../validator';
import {
  doAddressesConflictOnBuildingNumber,
  extractAddressBuildingNumber,
  extractCoreBusinessName,
  normalizeAddress,
  normalizeBusinessName,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePhones,
  normalizeSocialUrl,
  normalizeSourceExternalId,
  resolveSourceType,
} from './normalizer';
import {
  DeduplicationDecision,
  DeduplicationEvaluationResult,
  DeduplicationMatchReason,
  DeduplicationSignal,
  FieldConflictRecord,
} from './types';

export type CandidateLeadWithRelations = Lead & {
  identities?: LeadIdentity[];
  sourceRecords?: SourceRecord[];
};

export type ConflictResolutionPolicy = 'SAFE_PHONE_PRIORITY' | 'STRICT_CONFLICT';

export interface DeduplicationPolicyOptions {
  /**
   * 'SAFE_PHONE_PRIORITY' (default): When normalizedPhone uniquely matches the same business
   * but normalizedDomain conflicts, confirms duplicate while preserving the domain conflict
   * for admin review without overwriting the existing domain (Test E).
   * 'STRICT_CONFLICT': Any conflicting domain or phone on a strong match halts auto-merge
   * and returns decision = 'CONFLICT'.
   */
  conflictPolicy?: ConflictResolutionPolicy;
}

/**
 * Deterministic token overlap similarity between two normalized strings (0..1).
 */
export function calculateTokenSimilarity(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const tokensA = new Set(a.split(' ').filter((t) => t.length > 1));
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(tokensA.size, tokensB.size);
}

interface SingleCandidateEvaluation {
  lead: CandidateLeadWithRelations;
  signals: DeduplicationSignal[];
  conflicts: FieldConflictRecord[];
  hasSourceIdMatch: boolean;
  hasDomainMatch: boolean;
  hasPhoneMatch: boolean;
  hasEmailMatch: boolean;
  hasSocialMatch: boolean;
  hasExactNameMatch: boolean;
  hasSimilarNameMatch: boolean;
  hasNameConflict: boolean;
  hasExactOrStrongAddressMatch: boolean;
  hasAddressBuildingConflict: boolean;
  hasCityMatch: boolean;
  hasCityConflict: boolean;
  hasDomainConflict: boolean;
  hasPhoneConflict: boolean;
  hasEmailConflict: boolean;
  strongMatchCount: number;
}

/**
 * Evaluates all deterministic identity signals between an incoming normalized record
 * and an existing Canonical Lead.
 */
export function evaluateCandidateSignals(
  incoming: NormalizedLeadData,
  existing: CandidateLeadWithRelations
): SingleCandidateEvaluation {
  const signals: DeduplicationSignal[] = [];
  const conflicts: FieldConflictRecord[] = [];
  const nowIso = new Date().toISOString();

  // 1. Level 1 — Source External ID
  let hasSourceIdMatch = false;
  const incomingExtId = normalizeSourceExternalId(incoming.externalId);
  const incomingSourceType = resolveSourceType(incoming.sourceType || incoming.source);

  if (incomingExtId) {
    const matchingSourceRecord = existing.sourceRecords?.find(
      (sr) =>
        sr.externalId === incomingExtId &&
        (sr.sourceType === incomingSourceType ||
          sr.sourceName.toLowerCase() === incoming.source.toLowerCase())
    );
    const matchingIdentity = existing.identities?.find(
      (id) =>
        id.keyType === 'SOURCE' &&
        id.canonicalKey === `SOURCE:${incomingSourceType}:${incomingExtId}`
    );

    if (matchingSourceRecord || matchingIdentity) {
      hasSourceIdMatch = true;
      signals.push({
        type: 'SOURCE_EXTERNAL_ID',
        match: true,
        strength: 'STRONG',
        existingValue: `${incomingSourceType}:${incomingExtId}`,
        incomingValue: `${incomingSourceType}:${incomingExtId}`,
        label: 'Same source external ID',
        labelAr: 'تطابق المعرف الخارجي للمصدر',
      });
    }
  }

  // 2. Level 2 — Website Domain
  let hasDomainMatch = false;
  let hasDomainConflict = false;
  const existingDomains = new Set<string>();
  const primaryExistingDomain = existing.normalizedDomain || normalizeDomain(existing.website);
  if (primaryExistingDomain) existingDomains.add(primaryExistingDomain);
  for (const id of existing.identities || []) {
    if (id.keyType === 'DOMAIN' && id.keyValue) {
      existingDomains.add(id.keyValue);
    }
  }

  const incomingDomain = incoming.normalizedDomain || normalizeDomain(incoming.website);
  if (incomingDomain && existingDomains.size > 0) {
    if (existingDomains.has(incomingDomain)) {
      hasDomainMatch = true;
      signals.push({
        type: 'DOMAIN',
        match: true,
        strength: 'STRONG',
        existingValue: incomingDomain,
        incomingValue: incomingDomain,
        label: 'Same website domain',
        labelAr: 'تطابق النطاق (Domain)',
      });
    } else {
      hasDomainConflict = true;
      signals.push({
        type: 'DOMAIN',
        match: false,
        strength: 'CONFLICT',
        existingValue: primaryExistingDomain || Array.from(existingDomains)[0],
        incomingValue: incomingDomain,
        label: 'Conflicting website domain',
        labelAr: 'تعارض في نطاق الموقع الإلكتروني',
      });
      conflicts.push({
        field: 'normalizedDomain',
        existingValue: primaryExistingDomain || Array.from(existingDomains)[0],
        incomingValue: incomingDomain,
        existingSource: existing.source,
        incomingSource: incoming.source,
        resolution: 'FLAGGED_FOR_REVIEW',
        detectedAt: nowIso,
      });
    }
  }

  // 3. Level 3 — Phone
  let hasPhoneMatch = false;
  let hasPhoneConflict = false;
  const existingPhones = new Set<string>();
  const primaryExistingPhone = existing.normalizedPhone || normalizePhone(existing.phone);
  if (primaryExistingPhone) existingPhones.add(primaryExistingPhone);
  for (const p of existing.phones || []) {
    const normP = normalizePhone(p) || p;
    if (normP) existingPhones.add(normP);
  }
  for (const id of existing.identities || []) {
    if (id.keyType === 'PHONE' && id.keyValue) {
      existingPhones.add(id.keyValue);
    }
  }

  const incomingPhones = new Set<string>();
  if (incoming.normalizedPhone) incomingPhones.add(incoming.normalizedPhone);
  for (const p of incoming.normalizedPhones || []) {
    if (p) incomingPhones.add(p);
  }
  if (incoming.phone) {
    for (const p of normalizePhones(incoming.phone)) {
      incomingPhones.add(p);
    }
  }

  if (incomingPhones.size > 0 && existingPhones.size > 0) {
    let matchedPhone: string | null = null;
    for (const p of incomingPhones) {
      if (existingPhones.has(p)) {
        matchedPhone = p;
        break;
      }
    }

    if (matchedPhone) {
      hasPhoneMatch = true;
      signals.push({
        type: 'PHONE',
        match: true,
        strength: 'STRONG',
        existingValue: matchedPhone,
        incomingValue: matchedPhone,
        label: 'Same phone',
        labelAr: 'تطابق رقم الهاتف',
      });
    } else {
      hasPhoneConflict = true;
      const existPhoneVal = primaryExistingPhone || Array.from(existingPhones)[0];
      const incPhoneVal = incoming.normalizedPhone || Array.from(incomingPhones)[0];
      signals.push({
        type: 'PHONE',
        match: false,
        strength: 'CONFLICT',
        existingValue: existPhoneVal,
        incomingValue: incPhoneVal,
        label: 'Conflicting phone number',
        labelAr: 'تعارض في رقم الهاتف',
      });
      conflicts.push({
        field: 'normalizedPhone',
        existingValue: existPhoneVal,
        incomingValue: incPhoneVal,
        existingSource: existing.source,
        incomingSource: incoming.source,
        resolution: 'KEPT_EXISTING',
        detectedAt: nowIso,
      });
    }
  }

  // 4. Level 4 — Email
  let hasEmailMatch = false;
  let hasEmailConflict = false;
  const existingEmails = new Set<string>();
  const primaryExistingEmail = existing.normalizedEmail || normalizeEmail(existing.email);
  if (primaryExistingEmail) existingEmails.add(primaryExistingEmail);
  for (const id of existing.identities || []) {
    if (id.keyType === 'EMAIL' && id.keyValue) {
      existingEmails.add(id.keyValue);
    }
  }

  const incomingEmail = incoming.normalizedEmail || normalizeEmail(incoming.email);
  if (incomingEmail && existingEmails.size > 0) {
    if (existingEmails.has(incomingEmail)) {
      hasEmailMatch = true;
      signals.push({
        type: 'EMAIL',
        match: true,
        strength: 'STRONG',
        existingValue: incomingEmail,
        incomingValue: incomingEmail,
        label: 'Same email',
        labelAr: 'تطابق البريد الإلكتروني',
      });
    } else {
      hasEmailConflict = true;
      signals.push({
        type: 'EMAIL',
        match: false,
        strength: 'CONFLICT',
        existingValue: primaryExistingEmail || Array.from(existingEmails)[0],
        incomingValue: incomingEmail,
        label: 'Different email',
        labelAr: 'اختلاف البريد الإلكتروني',
      });
      conflicts.push({
        field: 'normalizedEmail',
        existingValue: primaryExistingEmail || Array.from(existingEmails)[0],
        incomingValue: incomingEmail,
        existingSource: existing.source,
        incomingSource: incoming.source,
        resolution: 'KEPT_EXISTING',
        detectedAt: nowIso,
      });
    }
  }

  // 5. Social URL Identity
  let hasSocialMatch = false;
  const existingSocials = new Set<string>();
  const existFb = existing.normalizedFacebook || normalizeSocialUrl(existing.facebook, 'FACEBOOK');
  const existIg =
    existing.normalizedInstagram || normalizeSocialUrl(existing.instagram, 'INSTAGRAM');
  if (existFb && !existFb.endsWith('/example.business')) existingSocials.add(existFb);
  if (existIg && !existIg.endsWith('/example.business')) existingSocials.add(existIg);
  for (const id of existing.identities || []) {
    if (id.keyType === 'SOCIAL' && id.keyValue && !id.keyValue.endsWith('/example.business')) {
      existingSocials.add(id.keyValue);
    }
  }

  const incomingSocials = new Set<string>();
  const incFb = incoming.normalizedFacebook || normalizeSocialUrl(incoming.facebook, 'FACEBOOK');
  const incIg =
    incoming.normalizedInstagram || normalizeSocialUrl(incoming.instagram, 'INSTAGRAM');
  if (incFb && !incFb.endsWith('/example.business')) incomingSocials.add(incFb);
  if (incIg && !incIg.endsWith('/example.business')) incomingSocials.add(incIg);

  if (incomingSocials.size > 0 && existingSocials.size > 0) {
    let matchedSocial: string | null = null;
    for (const s of incomingSocials) {
      if (existingSocials.has(s)) {
        matchedSocial = s;
        break;
      }
    }
    if (matchedSocial) {
      hasSocialMatch = true;
      signals.push({
        type: 'SOCIAL_URL',
        match: true,
        strength: 'STRONG',
        existingValue: matchedSocial,
        incomingValue: matchedSocial,
        label: 'Same social URL',
        labelAr: 'تطابق رابط التواصل الاجتماعي',
      });
    }
  }

  // 6. Level 5 — City, Business Name, and Address
  let hasCityMatch = false;
  let hasCityConflict = false;
  if (incoming.city && existing.city) {
    if (incoming.city === existing.city) {
      hasCityMatch = true;
      signals.push({
        type: 'CITY',
        match: true,
        strength: 'MODERATE',
        existingValue: existing.city,
        incomingValue: incoming.city,
        label: 'Same city',
        labelAr: 'نفس المدينة',
      });
    } else {
      hasCityConflict = true;
      signals.push({
        type: 'CITY',
        match: false,
        strength: 'CONFLICT',
        existingValue: existing.city,
        incomingValue: incoming.city,
        label: 'Different city',
        labelAr: 'مدينة مختلفة',
      });
    }
  }

  let hasExactNameMatch = false;
  let hasSimilarNameMatch = false;
  let hasNameConflict = false;
  const incNormName = incoming.normalizedName || normalizeBusinessName(incoming.businessName);
  const existNormName = existing.normalizedName || normalizeBusinessName(existing.businessName);

  if (incNormName && existNormName) {
    if (incNormName === existNormName) {
      hasExactNameMatch = true;
      signals.push({
        type: 'BUSINESS_NAME',
        match: true,
        strength: 'MODERATE',
        existingValue: existing.businessName,
        incomingValue: incoming.businessName,
        label: 'Same business name',
        labelAr: 'تطابق الاسم التجاري',
      });
    } else {
      const incCore = extractCoreBusinessName(incNormName);
      const existCore = extractCoreBusinessName(existNormName);
      const coreSim = calculateTokenSimilarity(incCore, existCore);

      if (
        incCore.length >= 2 &&
        existCore.length >= 2 &&
        (incCore === existCore || coreSim >= 0.85)
      ) {
        hasSimilarNameMatch = true;
        signals.push({
          type: 'BUSINESS_NAME',
          match: true,
          strength: 'WEAK',
          existingValue: existing.businessName,
          incomingValue: incoming.businessName,
          label: 'Similar business name (same core brand)',
          labelAr: 'تشابه في الاسم التجاري الأساسي',
        });
      } else {
        hasNameConflict = true;
        signals.push({
          type: 'BUSINESS_NAME',
          match: false,
          strength: 'CONFLICT',
          existingValue: existing.businessName,
          incomingValue: incoming.businessName,
          label: 'Different business name',
          labelAr: 'اختلاف الاسم التجاري',
        });
      }
    }
  }

  let hasExactOrStrongAddressMatch = false;
  let hasAddressBuildingConflict = false;
  const incNormAddr = incoming.normalizedAddress || normalizeAddress(incoming.address);
  const existNormAddr = existing.normalizedAddress || normalizeAddress(existing.address);

  const isSpecificStreetAddress = (
    rawAddr?: string | null,
    normAddr?: string | null,
    cityVal?: string | null
  ): boolean => {
    if (!normAddr) return false;
    const normCityVal = cityVal ? normalizeBusinessName(cityVal) : '';
    if (normCityVal && normAddr === normCityVal) return false;
    if (extractAddressBuildingNumber(rawAddr || normAddr)) return true;
    const rawStr = (rawAddr || '').trim();
    if (
      /\b(street|st|road|rd|avenue|ave|square|sq|plaza|mall|tower|bldg|building|corniche)\b/i.test(
        rawStr
      ) ||
      /(?:^|\s)(شارع|ش|ميدان|برج|عمارة|عماره|مول|طريق|كورنيش|محور|عقار|بوابة|بوابه)(?=\s|$)/.test(
        rawStr
      )
    ) {
      return true;
    }
    const tokens = normAddr.split(' ').filter((t) => t.length > 1);
    return tokens.length >= 3;
  };

  if (incNormAddr && existNormAddr) {
    const bldgConflict = doAddressesConflictOnBuildingNumber(
      incoming.address || incNormAddr,
      existing.address || existNormAddr
    );
    if (bldgConflict) {
      hasAddressBuildingConflict = true;
      signals.push({
        type: 'ADDRESS',
        match: false,
        strength: 'CONFLICT',
        existingValue: existing.address || existNormAddr,
        incomingValue: incoming.address || incNormAddr,
        label: 'Different building number in address',
        labelAr: 'اختلاف رقم العقار في العنوان',
      });
    } else {
      const addrSim = calculateTokenSimilarity(incNormAddr, existNormAddr);
      const bothSpecific =
        isSpecificStreetAddress(incoming.address, incNormAddr, incoming.city) &&
        isSpecificStreetAddress(existing.address, existNormAddr, existing.city);

      if ((incNormAddr === existNormAddr || addrSim >= 0.75) && bothSpecific) {
        hasExactOrStrongAddressMatch = true;
        signals.push({
          type: 'ADDRESS',
          match: true,
          strength: 'MODERATE',
          existingValue: existing.address || existNormAddr,
          incomingValue: incoming.address || incNormAddr,
          label: 'Same address',
          labelAr: 'تطابق العنوان التفصيلي',
        });
      } else if (incNormAddr === existNormAddr || addrSim >= 0.5) {
        signals.push({
          type: 'ADDRESS',
          match: true,
          strength: 'WEAK',
          existingValue: existing.address || existNormAddr,
          incomingValue: incoming.address || incNormAddr,
          label: 'Similar address',
          labelAr: 'تشابه جزئي أو منطقة عامة في العنوان',
        });
      }
    }
  }

  const strongMatchCount =
    (hasSourceIdMatch ? 1 : 0) +
    (hasDomainMatch ? 1 : 0) +
    (hasPhoneMatch ? 1 : 0) +
    (hasEmailMatch ? 1 : 0) +
    (hasSocialMatch ? 1 : 0);

  return {
    lead: existing,
    signals,
    conflicts,
    hasSourceIdMatch,
    hasDomainMatch,
    hasPhoneMatch,
    hasEmailMatch,
    hasSocialMatch,
    hasExactNameMatch,
    hasSimilarNameMatch,
    hasNameConflict,
    hasExactOrStrongAddressMatch,
    hasAddressBuildingConflict,
    hasCityMatch,
    hasCityConflict,
    hasDomainConflict,
    hasPhoneConflict,
    hasEmailConflict,
    strongMatchCount,
  };
}

/**
 * Evaluates a list of candidate Canonical Leads against an incoming normalized record
 * using the 5-Level Deterministic Matching Hierarchy, Ambiguity Protection, and Conflict Detection.
 */
export function evaluateDeduplicationCandidates(
  incoming: NormalizedLeadData,
  candidates: CandidateLeadWithRelations[],
  options?: DeduplicationPolicyOptions
): DeduplicationEvaluationResult {
  const startMs = Date.now();
  const conflictPolicy = options?.conflictPolicy || 'SAFE_PHONE_PRIORITY';

  // Filter out non-canonical archived leads that were already merged into another lead
  const activeCandidates = candidates.filter(
    (c) => c.isCanonical !== false && !c.mergedIntoLeadId
  );

  if (activeCandidates.length === 0) {
    return {
      decision: 'UNIQUE',
      isDuplicate: false,
      matchedLeadId: null,
      matchedLevel: null,
      signals: [],
      conflicts: [],
      hasConflicts: false,
      ambiguousCandidateIds: [],
      durationMs: Date.now() - startMs,
    };
  }

  const evaluations = activeCandidates.map((lead) => evaluateCandidateSignals(incoming, lead));

  // ============================================================================
  // LEVEL 1: Exact Source Identity (sourceType + externalId)
  // ============================================================================
  const level1Matches = evaluations.filter((e) => e.hasSourceIdMatch);
  if (level1Matches.length === 1) {
    const best = level1Matches[0];
    return {
      decision: 'DUPLICATE_CONFIRMED',
      isDuplicate: true,
      matchedLeadId: best.lead.id,
      matchedLead: best.lead,
      matchReason: 'SOURCE_EXTERNAL_ID_MATCH',
      matchedLevel: 1,
      signals: best.signals,
      conflicts: best.conflicts,
      hasConflicts: best.conflicts.length > 0,
      ambiguousCandidateIds: [],
      durationMs: Date.now() - startMs,
    };
  } else if (level1Matches.length > 1) {
    const primary = level1Matches[0];
    return {
      decision: 'CONFLICT',
      isDuplicate: false,
      matchedLeadId: primary.lead.id,
      matchedLead: primary.lead,
      matchReason: 'CONFLICTING_SIGNALS',
      matchedLevel: 1,
      signals: primary.signals,
      conflicts: primary.conflicts,
      hasConflicts: true,
      ambiguousCandidateIds: level1Matches.map((m) => m.lead.id),
      durationMs: Date.now() - startMs,
    };
  }

  // ============================================================================
  // CHECK FOR CROSS-LEAD STRONG SIGNAL CONFLICTS
  // (e.g. Incoming Phone matches Lead A, Incoming Domain matches Lead B)
  // ============================================================================
  const domainMatches = evaluations.filter((e) => e.hasDomainMatch);
  const phoneMatches = evaluations.filter((e) => e.hasPhoneMatch);
  const emailMatches = evaluations.filter((e) => e.hasEmailMatch);
  const socialMatches = evaluations.filter((e) => e.hasSocialMatch);

  const distinctStrongLeadIds = new Set<string>();
  for (const m of [...domainMatches, ...phoneMatches, ...emailMatches]) {
    distinctStrongLeadIds.add(m.lead.id);
  }

  if (distinctStrongLeadIds.size > 1) {
    // Check if two DIFFERENT strong signal types point to two DIFFERENT leads
    const domainLeadIds = new Set(domainMatches.map((m) => m.lead.id));
    const phoneLeadIds = new Set(phoneMatches.map((m) => m.lead.id));
    const emailLeadIds = new Set(emailMatches.map((m) => m.lead.id));

    const hasDisjointTypes =
      (domainLeadIds.size > 0 &&
        phoneLeadIds.size > 0 &&
        ![...domainLeadIds].some((id) => phoneLeadIds.has(id))) ||
      (domainLeadIds.size > 0 &&
        emailLeadIds.size > 0 &&
        ![...domainLeadIds].some((id) => emailLeadIds.has(id))) ||
      (phoneLeadIds.size > 0 &&
        emailLeadIds.size > 0 &&
        ![...phoneLeadIds].some((id) => emailLeadIds.has(id)));

    if (hasDisjointTypes) {
      const firstEval =
        phoneMatches[0] || domainMatches[0] || emailMatches[0] || evaluations[0];
      return {
        decision: 'CONFLICT',
        isDuplicate: false,
        matchedLeadId: firstEval.lead.id,
        matchedLead: firstEval.lead,
        matchReason: 'CONFLICTING_SIGNALS',
        matchedLevel: 2,
        signals: firstEval.signals,
        conflicts: [
          ...firstEval.conflicts,
          {
            field: 'canonicalIdentity',
            existingValue: Array.from(distinctStrongLeadIds)[0],
            incomingValue: Array.from(distinctStrongLeadIds)[1],
            resolution: 'FLAGGED_FOR_REVIEW',
            detectedAt: new Date().toISOString(),
          },
        ],
        hasConflicts: true,
        ambiguousCandidateIds: Array.from(distinctStrongLeadIds),
        durationMs: Date.now() - startMs,
      };
    }
  }

  // Helper to disambiguate when a single strong signal type matches multiple leads
  const disambiguateMultipleMatches = (
    matches: SingleCandidateEvaluation[]
  ): { unique?: SingleCandidateEvaluation; ambiguous?: SingleCandidateEvaluation[] } => {
    if (matches.length === 1) return { unique: matches[0] };
    // Try disambiguating by exact name + same city + non-conflicting address
    const byNameAndCity = matches.filter(
      (m) =>
        (m.hasExactNameMatch || m.hasSimilarNameMatch) &&
        m.hasCityMatch &&
        !m.hasAddressBuildingConflict
    );
    if (byNameAndCity.length === 1) {
      return { unique: byNameAndCity[0] };
    }
    return { ambiguous: matches };
  };

  // ============================================================================
  // LEVEL 2: Exact Website Domain
  // ============================================================================
  if (domainMatches.length > 0) {
    const { unique, ambiguous } = disambiguateMultipleMatches(domainMatches);
    if (ambiguous) {
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: ambiguous[0].lead.id,
        matchedLead: ambiguous[0].lead,
        matchReason: 'DOMAIN_MATCH',
        matchedLevel: 2,
        signals: ambiguous[0].signals,
        conflicts: ambiguous[0].conflicts,
        hasConflicts: ambiguous[0].conflicts.length > 0,
        ambiguousCandidateIds: ambiguous.map((m) => m.lead.id),
        durationMs: Date.now() - startMs,
      };
    }

    if (unique) {
      if (
        unique.hasPhoneConflict &&
        (conflictPolicy === 'STRICT_CONFLICT' || (unique.hasNameConflict && unique.hasCityConflict))
      ) {
        return {
          decision: 'CONFLICT',
          isDuplicate: false,
          matchedLeadId: unique.lead.id,
          matchedLead: unique.lead,
          matchReason: 'CONFLICTING_SIGNALS',
          matchedLevel: 2,
          signals: unique.signals,
          conflicts: unique.conflicts,
          hasConflicts: true,
          ambiguousCandidateIds: [unique.lead.id],
          durationMs: Date.now() - startMs,
        };
      }

      return {
        decision: 'DUPLICATE_CONFIRMED',
        isDuplicate: true,
        matchedLeadId: unique.lead.id,
        matchedLead: unique.lead,
        matchReason: 'DOMAIN_MATCH',
        matchedLevel: 2,
        signals: unique.signals,
        conflicts: unique.conflicts,
        hasConflicts: unique.conflicts.length > 0,
        ambiguousCandidateIds: [],
        durationMs: Date.now() - startMs,
      };
    }
  }

  // ============================================================================
  // LEVEL 3: Exact Phone
  // ============================================================================
  if (phoneMatches.length > 0) {
    const { unique, ambiguous } = disambiguateMultipleMatches(phoneMatches);
    if (ambiguous) {
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: ambiguous[0].lead.id,
        matchedLead: ambiguous[0].lead,
        matchReason: 'PHONE_MATCH',
        matchedLevel: 3,
        signals: ambiguous[0].signals,
        conflicts: ambiguous[0].conflicts,
        hasConflicts: ambiguous[0].conflicts.length > 0,
        ambiguousCandidateIds: ambiguous.map((m) => m.lead.id),
        durationMs: Date.now() - startMs,
      };
    }

    if (unique) {
      // Test E Policy: Same normalized phone, conflicting domain
      if (unique.hasDomainConflict) {
        if (
          conflictPolicy === 'STRICT_CONFLICT' ||
          (unique.hasNameConflict && unique.hasCityConflict)
        ) {
          return {
            decision: 'CONFLICT',
            isDuplicate: false,
            matchedLeadId: unique.lead.id,
            matchedLead: unique.lead,
            matchReason: 'CONFLICTING_SIGNALS',
            matchedLevel: 3,
            signals: unique.signals,
            conflicts: unique.conflicts,
            hasConflicts: true,
            ambiguousCandidateIds: [unique.lead.id],
            durationMs: Date.now() - startMs,
          };
        }

        // Default SAFE_PHONE_PRIORITY policy:
        // Normalized phone is a strong deterministic signal -> DUPLICATE_CONFIRMED
        // while preserving the domain conflict in `conflicts` for admin review and never overwriting existing domain.
        return {
          decision: 'DUPLICATE_CONFIRMED',
          isDuplicate: true,
          matchedLeadId: unique.lead.id,
          matchedLead: unique.lead,
          matchReason: 'PHONE_MATCH',
          matchedLevel: 3,
          signals: unique.signals,
          conflicts: unique.conflicts,
          hasConflicts: true,
          ambiguousCandidateIds: [],
          durationMs: Date.now() - startMs,
        };
      }

      return {
        decision: 'DUPLICATE_CONFIRMED',
        isDuplicate: true,
        matchedLeadId: unique.lead.id,
        matchedLead: unique.lead,
        matchReason: 'PHONE_MATCH',
        matchedLevel: 3,
        signals: unique.signals,
        conflicts: unique.conflicts,
        hasConflicts: unique.conflicts.length > 0,
        ambiguousCandidateIds: [],
        durationMs: Date.now() - startMs,
      };
    }
  }

  // ============================================================================
  // LEVEL 4: Exact Email
  // ============================================================================
  if (emailMatches.length > 0) {
    const { unique, ambiguous } = disambiguateMultipleMatches(emailMatches);
    if (ambiguous) {
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: ambiguous[0].lead.id,
        matchedLead: ambiguous[0].lead,
        matchReason: 'EMAIL_MATCH',
        matchedLevel: 4,
        signals: ambiguous[0].signals,
        conflicts: ambiguous[0].conflicts,
        hasConflicts: ambiguous[0].conflicts.length > 0,
        ambiguousCandidateIds: ambiguous.map((m) => m.lead.id),
        durationMs: Date.now() - startMs,
      };
    }

    if (unique) {
      if (
        (unique.hasPhoneConflict && unique.hasDomainConflict) ||
        ((unique.hasPhoneConflict || unique.hasDomainConflict) &&
          conflictPolicy === 'STRICT_CONFLICT')
      ) {
        return {
          decision: 'CONFLICT',
          isDuplicate: false,
          matchedLeadId: unique.lead.id,
          matchedLead: unique.lead,
          matchReason: 'CONFLICTING_SIGNALS',
          matchedLevel: 4,
          signals: unique.signals,
          conflicts: unique.conflicts,
          hasConflicts: true,
          ambiguousCandidateIds: [unique.lead.id],
          durationMs: Date.now() - startMs,
        };
      }

      return {
        decision: 'DUPLICATE_CONFIRMED',
        isDuplicate: true,
        matchedLeadId: unique.lead.id,
        matchedLead: unique.lead,
        matchReason: 'EMAIL_MATCH',
        matchedLevel: 4,
        signals: unique.signals,
        conflicts: unique.conflicts,
        hasConflicts: unique.conflicts.length > 0,
        ambiguousCandidateIds: [],
        durationMs: Date.now() - startMs,
      };
    }
  }

  // ============================================================================
  // LEVEL 5: Composite Identity (Social + City/Name, Name + Address + City, Name + City)
  // ============================================================================
  if (socialMatches.length > 0) {
    const { unique, ambiguous } = disambiguateMultipleMatches(socialMatches);
    if (ambiguous) {
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: ambiguous[0].lead.id,
        matchedLead: ambiguous[0].lead,
        matchReason: 'SOCIAL_MATCH',
        matchedLevel: 5,
        signals: ambiguous[0].signals,
        conflicts: ambiguous[0].conflicts,
        hasConflicts: ambiguous[0].conflicts.length > 0,
        ambiguousCandidateIds: ambiguous.map((m) => m.lead.id),
        durationMs: Date.now() - startMs,
      };
    }
    if (unique) {
      if (unique.hasPhoneConflict || unique.hasDomainConflict) {
        return {
          decision: 'CONFLICT',
          isDuplicate: false,
          matchedLeadId: unique.lead.id,
          matchedLead: unique.lead,
          matchReason: 'CONFLICTING_SIGNALS',
          matchedLevel: 5,
          signals: unique.signals,
          conflicts: unique.conflicts,
          hasConflicts: true,
          ambiguousCandidateIds: [unique.lead.id],
          durationMs: Date.now() - startMs,
        };
      }
      if (unique.hasCityMatch || unique.hasExactNameMatch || unique.hasSimilarNameMatch) {
        return {
          decision: 'DUPLICATE_CONFIRMED',
          isDuplicate: true,
          matchedLeadId: unique.lead.id,
          matchedLead: unique.lead,
          matchReason: 'SOCIAL_MATCH',
          matchedLevel: 5,
          signals: unique.signals,
          conflicts: unique.conflicts,
          hasConflicts: false,
          ambiguousCandidateIds: [],
          durationMs: Date.now() - startMs,
        };
      }
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: unique.lead.id,
        matchedLead: unique.lead,
        matchReason: 'SOCIAL_MATCH',
        matchedLevel: 5,
        signals: unique.signals,
        conflicts: unique.conflicts,
        hasConflicts: false,
        ambiguousCandidateIds: [unique.lead.id],
        durationMs: Date.now() - startMs,
      };
    }
  }

  // Filter candidates in the SAME city with matching or similar business name
  const sameCityNameCandidates = evaluations.filter(
    (e) => e.hasCityMatch && (e.hasExactNameMatch || e.hasSimilarNameMatch)
  );

  if (sameCityNameCandidates.length > 0) {
    // 5A. Exact Name + Strong Address Match + Same City (without building conflict)
    const compositeAddressMatches = sameCityNameCandidates.filter(
      (e) =>
        e.hasExactNameMatch &&
        e.hasExactOrStrongAddressMatch &&
        !e.hasAddressBuildingConflict
    );

    if (compositeAddressMatches.length === 1) {
      const comp = compositeAddressMatches[0];
      // If phones or domains explicitly conflict, flag as CONFLICT instead of merging
      if (comp.hasPhoneConflict || comp.hasDomainConflict || comp.hasEmailConflict) {
        return {
          decision: 'CONFLICT',
          isDuplicate: false,
          matchedLeadId: comp.lead.id,
          matchedLead: comp.lead,
          matchReason: 'CONFLICTING_SIGNALS',
          matchedLevel: 5,
          signals: comp.signals,
          conflicts: comp.conflicts,
          hasConflicts: true,
          ambiguousCandidateIds: [comp.lead.id],
          durationMs: Date.now() - startMs,
        };
      }

      return {
        decision: 'DUPLICATE_CONFIRMED',
        isDuplicate: true,
        matchedLeadId: comp.lead.id,
        matchedLead: comp.lead,
        matchReason: 'NAME_ADDRESS_CITY_MATCH',
        matchedLevel: 5,
        signals: comp.signals,
        conflicts: comp.conflicts,
        hasConflicts: false,
        ambiguousCandidateIds: [],
        durationMs: Date.now() - startMs,
      };
    } else if (compositeAddressMatches.length > 1) {
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: compositeAddressMatches[0].lead.id,
        matchedLead: compositeAddressMatches[0].lead,
        matchReason: 'AMBIGUOUS_NAME_CITY',
        matchedLevel: 5,
        signals: compositeAddressMatches[0].signals,
        conflicts: compositeAddressMatches[0].conflicts,
        hasConflicts: false,
        ambiguousCandidateIds: compositeAddressMatches.map((m) => m.lead.id),
        durationMs: Date.now() - startMs,
      };
    }

    // 5B. Same Name + Same City, but DIFFERENT Building Numbers on the street -> Distinct Neighboring Business!
    const nonBuildingConflictCandidates = sameCityNameCandidates.filter(
      (e) => !e.hasAddressBuildingConflict
    );

    if (nonBuildingConflictCandidates.length > 0) {
      const primary = nonBuildingConflictCandidates[0];

      // If exact name + same city, but explicit Phone or Domain conflicts -> CONFLICT (Section 22)
      if (
        primary.hasExactNameMatch &&
        (primary.hasPhoneConflict || primary.hasDomainConflict)
      ) {
        return {
          decision: 'CONFLICT',
          isDuplicate: false,
          matchedLeadId: primary.lead.id,
          matchedLead: primary.lead,
          matchReason: 'CONFLICTING_SIGNALS',
          matchedLevel: 5,
          signals: primary.signals,
          conflicts: primary.conflicts,
          hasConflicts: true,
          ambiguousCandidateIds: nonBuildingConflictCandidates.map((m) => m.lead.id),
          durationMs: Date.now() - startMs,
        };
      }

      // Section 12 & 14: Name + City alone (or fuzzy name/address similarity without deterministic confirmation)
      // MUST NOT automatically merge -> POSSIBLE_DUPLICATE
      return {
        decision: 'POSSIBLE_DUPLICATE',
        isDuplicate: false,
        matchedLeadId: primary.lead.id,
        matchedLead: primary.lead,
        matchReason: primary.hasExactNameMatch
          ? 'AMBIGUOUS_NAME_CITY'
          : 'ADDRESS_SIMILARITY_MATCH',
        matchedLevel: 5,
        signals: primary.signals,
        conflicts: primary.conflicts,
        hasConflicts: primary.conflicts.length > 0,
        ambiguousCandidateIds: nonBuildingConflictCandidates.map((m) => m.lead.id),
        durationMs: Date.now() - startMs,
      };
    }
  }

  // No deterministic match found (including same name in a different city -> Test D)
  return {
    decision: 'UNIQUE',
    isDuplicate: false,
    matchedLeadId: null,
    matchedLevel: null,
    signals: [],
    conflicts: [],
    hasConflicts: false,
    ambiguousCandidateIds: [],
    durationMs: Date.now() - startMs,
  };
}

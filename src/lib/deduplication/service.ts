import { Lead, Prisma, PrismaClient } from '@prisma/client';
import { NormalizedLeadData, validateAndNormalizeLead } from '../validator';
import {
  calculateLeadScore,
  loadScoringContext,
  logScoringOperation,
} from '../scoring-engine';
import { generateCanonicalIdentityKeys } from './identity';
import { logDeduplicationOperation } from './logger';
import {
  CandidateLeadWithRelations,
  DeduplicationPolicyOptions,
  evaluateCandidateSignals,
  evaluateDeduplicationCandidates,
} from './matcher';
import {
  buildInitialFieldProvenance,
  MergeLeadOptions,
  mergeSourceIntoCanonicalLead,
  unmergeLead,
} from './merge-service';
import { extractCoreBusinessName } from './normalizer';
import {
  DeduplicationDecision,
  DeduplicationEvaluationResult,
  DeduplicationSignal,
} from './types';
import { evaluateLeadQuality } from '../quality';

// ============================================================================
// CONCURRENCY LOCK MANAGER (Prevents Race Conditions Under Simultaneous Imports)
// ============================================================================
const keyLockMap = new Map<string, Promise<void>>();

/**
 * Serializes concurrent operations that share any canonical identity key
 * (PHONE, DOMAIN, EMAIL, SOURCE, SOCIAL, or NAME+CITY) so simultaneous imports
 * of the same business never create duplicate Canonical Leads.
 */
export async function withIdentityConcurrencyLock<T>(
  identityKeys: string[],
  work: () => Promise<T>
): Promise<T> {
  const expandedKeys: string[] = [];
  for (const key of identityKeys) {
    if (!key) continue;
    expandedKeys.push(key);
    if (key.startsWith('NAME:') && key.includes(':CITY:')) {
      const [namePart, cityPart] = key.slice(5).split(':CITY:');
      const coreName = extractCoreBusinessName(namePart);
      if (coreName && cityPart) {
        expandedKeys.push(`CORE:${coreName}:CITY:${cityPart}`);
      }
    }
  }
  const uniqueSortedKeys = Array.from(new Set(expandedKeys)).sort();
  if (uniqueSortedKeys.length === 0) {
    return work();
  }

  // Wait for any existing active locks on any of our keys, then acquire all keys atomically
  while (true) {
    const blockingPromises: Promise<void>[] = [];
    for (const k of uniqueSortedKeys) {
      const existing = keyLockMap.get(k);
      if (existing) {
        blockingPromises.push(existing);
      }
    }
    if (blockingPromises.length === 0) {
      break;
    }
    await Promise.allSettled(blockingPromises);
  }

  let releaseLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  for (const k of uniqueSortedKeys) {
    keyLockMap.set(k, lockPromise);
  }

  try {
    return await work();
  } finally {
    for (const k of uniqueSortedKeys) {
      if (keyLockMap.get(k) === lockPromise) {
        keyLockMap.delete(k);
      }
    }
    releaseLock();
  }
}

/**
 * Queries candidate Canonical Leads using ONLY indexed identity fields and bounded city queries.
 * Never performs a full-table scan across all Leads.
 */
export async function findCandidateLeadsByIndexes(
  prisma: PrismaClient,
  candidate: NormalizedLeadData
): Promise<CandidateLeadWithRelations[]> {
  const identityKeys = generateCanonicalIdentityKeys(candidate);
  const orConditions: Prisma.LeadWhereInput[] = [];

  // 1. Indexed Phone Lookup
  const phonesList = Array.from(
    new Set([
      ...(candidate.normalizedPhone ? [candidate.normalizedPhone] : []),
      ...(candidate.normalizedPhones || []),
    ])
  );
  if (phonesList.length > 0) {
    orConditions.push({ normalizedPhone: { in: phonesList } });
    orConditions.push({ phones: { hasSome: phonesList } });
  }

  // 2. Indexed Website Domain Lookup
  if (candidate.normalizedDomain) {
    orConditions.push({ normalizedDomain: candidate.normalizedDomain });
  }

  // 3. Indexed Email Lookup
  if (candidate.normalizedEmail) {
    orConditions.push({ normalizedEmail: candidate.normalizedEmail });
  }

  // 4. Indexed Social URL Lookup
  if (
    candidate.normalizedFacebook &&
    !candidate.normalizedFacebook.endsWith('/example.business')
  ) {
    orConditions.push({ normalizedFacebook: candidate.normalizedFacebook });
  }
  if (
    candidate.normalizedInstagram &&
    !candidate.normalizedInstagram.endsWith('/example.business')
  ) {
    orConditions.push({ normalizedInstagram: candidate.normalizedInstagram });
  }

  // 5. Indexed Source External ID Lookup
  if (candidate.externalId) {
    orConditions.push({
      sourceRecords: {
        some: {
          externalId: candidate.externalId,
        },
      },
    });
  }

  // 6. Indexed Canonical Identity Keys Lookup
  if (identityKeys.strongKeys.length > 0) {
    orConditions.push({
      identities: {
        some: {
          canonicalKey: { in: identityKeys.strongKeys },
        },
      },
    });
  }

  // 7. Indexed Composite Name + City Lookup
  if (candidate.normalizedName && candidate.city) {
    orConditions.push({
      normalizedName: candidate.normalizedName,
      city: candidate.city,
    });
  }

  // Build targeted same-city filters by core business name tokens and address tokens
  const sameCityOrConditions: Prisma.LeadWhereInput[] = [];
  if (candidate.normalizedName) {
    const coreName = extractCoreBusinessName(candidate.normalizedName);
    const nameTokens = Array.from(
      new Set(
        `${coreName || ''} ${candidate.normalizedName}`
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2)
      )
    );
    for (const token of nameTokens) {
      sameCityOrConditions.push({ normalizedName: { contains: token } });
    }
  }
  if (candidate.normalizedAddress) {
    const addrTokens = Array.from(
      new Set(
        candidate.normalizedAddress
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2 && t !== candidate.city)
      )
    );
    for (const token of addrTokens) {
      sameCityOrConditions.push({ normalizedAddress: { contains: token } });
    }
  }

  const [directMatches, sameCityBounded] = await Promise.all([
    orConditions.length > 0
      ? prisma.lead.findMany({
          where: {
            isCanonical: true,
            mergedIntoLeadId: null,
            OR: orConditions,
          },
          include: {
            identities: true,
            sourceRecords: true,
          },
          take: 50,
        })
      : Promise.resolve([]),
    candidate.city && sameCityOrConditions.length > 0
      ? prisma.lead.findMany({
          where: {
            city: candidate.city,
            isCanonical: true,
            mergedIntoLeadId: null,
            OR: sameCityOrConditions,
          },
          include: {
            identities: true,
            sourceRecords: true,
          },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const seenIds = new Set<string>();
  const combined: CandidateLeadWithRelations[] = [];

  for (const lead of [...directMatches, ...sameCityBounded]) {
    if (!seenIds.has(lead.id)) {
      seenIds.add(lead.id);
      combined.push(lead);
    }
  }

  return combined;
}

/**
 * Evaluates a normalized lead record against existing Canonical Leads in the database.
 */
export async function evaluateLeadDeduplication(
  prisma: PrismaClient,
  candidate: NormalizedLeadData,
  options?: DeduplicationPolicyOptions & { sourceRecordId?: string | null }
): Promise<DeduplicationEvaluationResult> {
  const candidates = await findCandidateLeadsByIndexes(prisma, candidate);
  const result = evaluateDeduplicationCandidates(candidate, candidates, options);

  logDeduplicationOperation({
    event:
      result.decision === 'CONFLICT'
        ? 'DEDUPLICATION_CONFLICT'
        : result.decision === 'POSSIBLE_DUPLICATE'
          ? 'POSSIBLE_DUPLICATE_FLAGGED'
          : 'DEDUPLICATION_EVALUATED',
    sourceRecordId: options?.sourceRecordId || null,
    source: candidate.source,
    decision: result.decision,
    matchedLeadId: result.matchedLeadId,
    matchedSignals: result.signals.map((s) => ({
      type: s.type,
      match: s.match,
      strength: s.strength,
    })),
    durationMs: result.durationMs,
  });

  return result;
}

// ============================================================================
// ADMIN DUPLICATE REVIEW & RESOLUTION SERVICE (Sections 32 & 33)
// ============================================================================

export interface DuplicateReviewFilters {
  status?:
    | 'PENDING'
    | 'CONFIRMED_MERGED'
    | 'KEPT_SEPARATE'
    | 'MARKED_INVALID'
    | 'RESOLVED'
    | 'ALL';
  decision?: 'POSSIBLE_DUPLICATE' | 'CONFLICT' | 'DUPLICATE_CONFIRMED' | 'ALL';
  leadId?: string;
  limit?: number;
}

export function formatHumanReadableEvidence(signals: DeduplicationSignal[]) {
  const items = signals.map((s) => {
    const icon = s.match
      ? s.strength === 'STRONG' || s.strength === 'MODERATE'
        ? '✓'
        : '△'
      : '⚠';
    return {
      icon,
      type: s.type,
      match: s.match,
      strength: s.strength,
      existingValue: s.existingValue ?? null,
      incomingValue: s.incomingValue ?? null,
      summaryEn: `${icon} ${s.label || s.type}`,
      summaryAr: `${icon} ${s.labelAr || s.label || s.type}`,
    };
  });
  return {
    items,
    duplicateEvidence: items
      .filter((i) => i.match && i.strength !== 'CONFLICT')
      .map((i) => i.summaryAr),
    conflictingEvidence: items
      .filter((i) => !i.match || i.strength === 'CONFLICT')
      .map((i) => i.summaryAr),
  };
}

export async function getAdminDuplicateCandidates(
  prisma: PrismaClient,
  filters: DuplicateReviewFilters = {}
) {
  const where: Prisma.DuplicateCandidateWhereInput = {};
  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }
  if (filters.decision && filters.decision !== 'ALL') {
    where.decision = filters.decision;
  }
  if (filters.leadId) {
    where.OR = [{ matchedLeadId: filters.leadId }, { candidateLeadId: filters.leadId }];
  }

  const limit = Math.min(Math.max(1, filters.limit || 50), 200);

  const [candidates, recentMerges, pendingPossibleCount, pendingConflictCount, totalMergesCount, revertedCount, sourceRecordsCount] =
    await Promise.all([
      prisma.duplicateCandidate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          matchedLead: true,
          candidateLead: true,
          sourceRecord: true,
        },
      }),
      prisma.leadMergeHistory.findMany({
        orderBy: { performedAt: 'desc' },
        take: 30,
        include: {
          targetLead: {
            select: {
              id: true,
              businessName: true,
              city: true,
              phone: true,
              website: true,
              score: true,
              temperature: true,
              sourceList: true,
            },
          },
          sourceLead: {
            select: {
              id: true,
              businessName: true,
              city: true,
              phone: true,
              website: true,
            },
          },
          sourceRecord: true,
        },
      }),
      prisma.duplicateCandidate.count({
        where: { status: 'PENDING', decision: 'POSSIBLE_DUPLICATE' },
      }),
      prisma.duplicateCandidate.count({
        where: { status: 'PENDING', decision: 'CONFLICT' },
      }),
      prisma.leadMergeHistory.count(),
      prisma.leadMergeHistory.count({ where: { isReverted: true } }),
      prisma.sourceRecord.count(),
    ]);

  const enrichedCandidates = candidates.map((c) => {
    const signals = Array.isArray(c.signals)
      ? (c.signals as unknown as DeduplicationSignal[])
      : [];
    const businessB = c.candidateLead
      ? {
          id: c.candidateLead.id,
          type: 'LEAD' as const,
          businessName: c.candidateLead.businessName,
          category: c.candidateLead.category,
          city: c.candidateLead.city,
          address: c.candidateLead.address,
          phone: c.candidateLead.phone,
          email: c.candidateLead.email,
          website: c.candidateLead.website,
          source: c.candidateLead.source,
        }
      : c.sourceRecord
        ? (() => {
            const norm = (c.sourceRecord.normalizedData || {}) as Record<string, unknown>;
            return {
              id: c.sourceRecord.id,
              type: 'SOURCE_RECORD' as const,
              businessName: String(norm.businessName || 'سجل وارد'),
              category: String(norm.category || 'Other'),
              city: String(norm.city || ''),
              address: (norm.address as string) || null,
              phone: (norm.phone as string) || null,
              email: (norm.email as string) || null,
              website: (norm.website as string) || null,
              source: c.sourceRecord.sourceName,
            };
          })()
        : null;

    return {
      ...c,
      businessA: c.matchedLead,
      businessB,
      evidence: formatHumanReadableEvidence(signals),
    };
  });

  return {
    candidates: enrichedCandidates,
    possibleDuplicates: enrichedCandidates.filter((c) => c.decision === 'POSSIBLE_DUPLICATE'),
    conflicts: enrichedCandidates.filter((c) => c.decision === 'CONFLICT'),
    recentMerges,
    stats: {
      pendingPossibleDuplicates: pendingPossibleCount,
      pendingConflicts: pendingConflictCount,
      totalMerges: totalMergesCount,
      revertedMerges: revertedCount,
      totalSourceRecords: sourceRecordsCount,
    },
  };
}

export async function getDuplicateCandidateEvidence(
  prisma: PrismaClient,
  candidateId: string
) {
  const candidate = await prisma.duplicateCandidate.findUnique({
    where: { id: candidateId },
    include: {
      matchedLead: {
        include: {
          identities: true,
          sourceRecords: true,
        },
      },
      candidateLead: {
        include: {
          identities: true,
          sourceRecords: true,
        },
      },
      sourceRecord: true,
    },
  });

  if (!candidate) {
    return null;
  }

  const signals = Array.isArray(candidate.signals)
    ? (candidate.signals as unknown as DeduplicationSignal[])
    : [];

  const businessBData = candidate.candidateLead
    ? candidate.candidateLead
    : candidate.sourceRecord
      ? (candidate.sourceRecord.normalizedData as Record<string, unknown>)
      : null;

  return {
    id: candidate.id,
    decision: candidate.decision,
    status: candidate.status,
    confidenceLevel: candidate.confidenceLevel,
    businessA: candidate.matchedLead,
    businessB: businessBData,
    sourceRecord: candidate.sourceRecord,
    signals,
    conflicts: candidate.conflicts,
    evidence: formatHumanReadableEvidence(signals),
    resolvedBy: candidate.resolvedBy,
    resolvedAt: candidate.resolvedAt,
    resolutionNotes: candidate.resolutionNotes,
    createdAt: candidate.createdAt,
  };
}

/**
 * Compares any two existing Leads directly and returns deterministic duplicate evidence.
 */
export async function compareTwoLeadsEvidence(
  prisma: PrismaClient,
  leadAId: string,
  leadBId: string
) {
  const [leadA, leadB] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadAId },
      include: { identities: true, sourceRecords: true },
    }),
    prisma.lead.findUnique({
      where: { id: leadBId },
      include: { identities: true, sourceRecords: true },
    }),
  ]);

  if (!leadA || !leadB) return null;

  const validatedB = validateAndNormalizeLead({
    businessName: leadB.businessName,
    category: leadB.category,
    city: leadB.city,
    governorate: leadB.governorate,
    area: leadB.area,
    address: leadB.address,
    phone: leadB.phone,
    phones: leadB.phones,
    email: leadB.email,
    website: leadB.website,
    websiteStatus: leadB.websiteStatus,
    facebook: leadB.facebook,
    instagram: leadB.instagram,
    rating: leadB.rating,
    reviewCount: leadB.reviewCount,
    branchCount: leadB.branchCount,
    source: leadB.source,
  });

  if (!validatedB.data) return null;
  const evalResult = evaluateDeduplicationCandidates(validatedB.data, [leadA]);

  return {
    decision: evalResult.decision,
    matchedLeadId: evalResult.matchedLeadId,
    businessA: leadA,
    businessB: leadB,
    signals: evalResult.signals,
    conflicts: evalResult.conflicts,
    evidence: formatHumanReadableEvidence(evalResult.signals),
  };
}

/**
 * Admin Action: Confirm Merge of a DuplicateCandidate (or two existing Leads).
 */
export async function confirmAdminDuplicateMerge(params: {
  prisma: PrismaClient;
  adminUserId: string;
  candidateId?: string;
  targetLeadId?: string;
  sourceLeadId?: string;
  sourceRecordId?: string;
  preferredFields?: MergeLeadOptions['preferredFields'];
  notes?: string;
}) {
  const {
    prisma,
    adminUserId,
    candidateId,
    targetLeadId,
    sourceLeadId,
    sourceRecordId,
    preferredFields,
    notes,
  } = params;

  if (candidateId) {
    const candidate = await prisma.duplicateCandidate.findUnique({
      where: { id: candidateId },
      include: {
        matchedLead: true,
        candidateLead: true,
        sourceRecord: true,
      },
    });

    if (!candidate) {
      throw new Error('طلب المراجعة غير موجود.');
    }

    if (candidate.status !== 'PENDING') {
      throw new Error('تم البت في طلب المراجعة هذا مسبقًا.');
    }

    let incomingNormalized: NormalizedLeadData | null = null;
    let sourceLeadSnapshot: Record<string, unknown> | null = null;

    if (candidate.candidateLead) {
      const existingSourceRecords = await prisma.sourceRecord.findMany({
        where: { leadId: candidate.candidateLead.id },
        select: { id: true },
      });
      sourceLeadSnapshot = {
        ...candidate.candidateLead,
        sourceRecordIds: existingSourceRecords.map((sr) => sr.id),
      };
      const val = validateAndNormalizeLead({
        businessName: candidate.candidateLead.businessName,
        category: candidate.candidateLead.category,
        city: candidate.candidateLead.city,
        governorate: candidate.candidateLead.governorate,
        area: candidate.candidateLead.area,
        address: candidate.candidateLead.address,
        phone: candidate.candidateLead.phone,
        phones: candidate.candidateLead.phones,
        email: candidate.candidateLead.email,
        website: candidate.candidateLead.website,
        websiteStatus: candidate.candidateLead.websiteStatus,
        facebook: candidate.candidateLead.facebook,
        instagram: candidate.candidateLead.instagram,
        rating: candidate.candidateLead.rating,
        reviewCount: candidate.candidateLead.reviewCount,
        branchCount: candidate.candidateLead.branchCount,
        source: candidate.candidateLead.source,
      });
      incomingNormalized = val.data || null;
    } else if (candidate.sourceRecord) {
      incomingNormalized =
        candidate.sourceRecord.normalizedData as unknown as NormalizedLeadData;
    }

    if (!incomingNormalized) {
      throw new Error('بيانات السجل المرشح للدمج غير متوفرة.');
    }

    const signals = Array.isArray(candidate.signals)
      ? (candidate.signals as unknown as DeduplicationSignal[])
      : [];

    const mergeResult = await mergeSourceIntoCanonicalLead(
      prisma,
      candidate.matchedLead,
      incomingNormalized,
      {
        sourceRecordId: candidate.sourceRecordId,
        sourceLeadId: candidate.candidateLeadId,
        sourceLeadSnapshot,
        reason: 'ADMIN_CONFIRMED_MERGE',
        decision: 'DUPLICATE_CONFIRMED',
        matchedSignals: signals,
        performedBy: adminUserId,
        mergeType: 'MANUAL_ADMIN',
        preferredFields,
      }
    );

    if (candidate.candidateLeadId) {
      await prisma.lead.update({
        where: { id: candidate.candidateLeadId },
        data: {
          isCanonical: false,
          mergedIntoLeadId: candidate.matchedLeadId,
          status: 'ARCHIVED',
          saleabilityStatus: 'DUPLICATE',
          qualityFlags: ['POSSIBLE_DUPLICATE'],
        },
      });
      await prisma.sourceRecord.updateMany({
        where: { leadId: candidate.candidateLeadId },
        data: { leadId: candidate.matchedLeadId, status: 'MERGED' },
      });
    }

    const updatedCandidate = await prisma.duplicateCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'CONFIRMED_MERGED',
        resolvedBy: adminUserId,
        resolvedAt: new Date(),
        resolutionNotes: notes || 'تم تأكيد الدمج بواسطة مدير النظام',
      },
    });

    return {
      candidate: updatedCandidate,
      mergeResult,
    };
  }

  // Direct merge of two Leads or a SourceRecord into a targetLead
  if (!targetLeadId) {
    throw new Error('معرف الفرصة الأساسية (targetLeadId) مطلوب.');
  }

  const targetLead = await prisma.lead.findUnique({ where: { id: targetLeadId } });
  if (!targetLead) {
    throw new Error('الفرصة الأساسية غير موجودة.');
  }

  if (sourceLeadId) {
    if (sourceLeadId === targetLeadId) {
      throw new Error('لا يمكن دمج الفرصة مع نفسها.');
    }
    const sourceLead = await prisma.lead.findUnique({ where: { id: sourceLeadId } });
    if (!sourceLead) {
      throw new Error('الفرصة المصدر غير موجودة.');
    }
    if (!sourceLead.isCanonical || sourceLead.mergedIntoLeadId) {
      throw new Error('تم دمج الفرصة المصدر مسبقًا.');
    }
    const existingSourceRecords = await prisma.sourceRecord.findMany({
      where: { leadId: sourceLead.id },
      select: { id: true },
    });
    const val = validateAndNormalizeLead({
      businessName: sourceLead.businessName,
      category: sourceLead.category,
      city: sourceLead.city,
      governorate: sourceLead.governorate,
      area: sourceLead.area,
      address: sourceLead.address,
      phone: sourceLead.phone,
      phones: sourceLead.phones,
      email: sourceLead.email,
      website: sourceLead.website,
      websiteStatus: sourceLead.websiteStatus,
      facebook: sourceLead.facebook,
      instagram: sourceLead.instagram,
      rating: sourceLead.rating,
      reviewCount: sourceLead.reviewCount,
      branchCount: sourceLead.branchCount,
      source: sourceLead.source,
    });

    if (!val.data) {
      throw new Error('تعذر تطبيع بيانات الفرصة المصدر.');
    }

    const sigEval = evaluateCandidateSignals(val.data, targetLead);
    const mergeResult = await mergeSourceIntoCanonicalLead(prisma, targetLead, val.data, {
      sourceLeadId: sourceLead.id,
      sourceLeadSnapshot: {
        ...sourceLead,
        sourceRecordIds: existingSourceRecords.map((sr) => sr.id),
      },
      reason: 'ADMIN_CONFIRMED_MERGE',
      decision: 'DUPLICATE_CONFIRMED',
      matchedSignals: sigEval.signals,
      performedBy: adminUserId,
      mergeType: 'MANUAL_ADMIN',
      preferredFields,
    });

    await prisma.lead.update({
      where: { id: sourceLead.id },
      data: {
        isCanonical: false,
        mergedIntoLeadId: targetLead.id,
        status: 'ARCHIVED',
        saleabilityStatus: 'DUPLICATE',
        qualityFlags: ['POSSIBLE_DUPLICATE'],
      },
    });

    await prisma.sourceRecord.updateMany({
      where: { leadId: sourceLead.id },
      data: { leadId: targetLead.id, status: 'MERGED' },
    });

    return {
      candidate: null,
      mergeResult,
    };
  }

  if (sourceRecordId) {
    const sr = await prisma.sourceRecord.findUnique({ where: { id: sourceRecordId } });
    if (!sr) {
      throw new Error('سجل المصدر غير موجود.');
    }
    const norm = sr.normalizedData as unknown as NormalizedLeadData;
    const sigEval = evaluateCandidateSignals(norm, targetLead);
    const mergeResult = await mergeSourceIntoCanonicalLead(prisma, targetLead, norm, {
      sourceRecordId: sr.id,
      reason: 'ADMIN_CONFIRMED_MERGE',
      decision: 'DUPLICATE_CONFIRMED',
      matchedSignals: sigEval.signals,
      performedBy: adminUserId,
      mergeType: 'MANUAL_ADMIN',
      preferredFields,
    });

    return {
      candidate: null,
      mergeResult,
    };
  }

  throw new Error('يجب تحديد candidateId أو sourceLeadId أو sourceRecordId للدمج.');
}

/**
 * Admin Action: Reject a DuplicateCandidate ('KEEP_SEPARATE' or 'MARK_INVALID').
 * When 'KEEP_SEPARATE' is chosen for a held SourceRecord, promotes it to an independent
 * Canonical Lead and runs Phase 1 scoring.
 */
export async function rejectAdminDuplicateCandidate(params: {
  prisma: PrismaClient;
  candidateId: string;
  action: 'KEEP_SEPARATE' | 'MARK_INVALID';
  adminUserId: string;
  notes?: string;
}) {
  const { prisma, candidateId, action, adminUserId, notes } = params;
  const candidate = await prisma.duplicateCandidate.findUnique({
    where: { id: candidateId },
    include: {
      sourceRecord: true,
      candidateLead: true,
      matchedLead: true,
    },
  });

  if (!candidate) {
    throw new Error('طلب المراجعة غير موجود.');
  }

  if (candidate.status !== 'PENDING') {
    throw new Error('تم البت في طلب المراجعة هذا مسبقًا.');
  }

  const now = new Date();

  if (action === 'MARK_INVALID') {
    const updated = await prisma.$transaction(async (tx) => {
      if (candidate.sourceRecordId) {
        await tx.sourceRecord.update({
          where: { id: candidate.sourceRecordId },
          data: { status: 'REJECTED' },
        });
      }
      if (candidate.candidateLeadId) {
        await tx.lead.update({
          where: { id: candidate.candidateLeadId },
          data: {
            status: 'INVALID',
            saleabilityStatus: 'INVALID',
          },
        });
      }
      return tx.duplicateCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'MARKED_INVALID',
          resolvedBy: adminUserId,
          resolvedAt: now,
          resolutionNotes: notes || 'تم تعليم السجل كغير صالح بواسطة مدير النظام',
        },
      });
    });

    return {
      candidate: updated,
      createdLead: null,
      createdSeparateLead: null,
    };
  }

  // action === 'KEEP_SEPARATE'
  let createdLead: Lead | null = candidate.candidateLead || null;

  // If the candidate has a SourceRecord that has not yet been created as its own Canonical Lead
  // (or was linked to matchedLead), create a standalone Canonical Lead for it!
  if (
    candidate.sourceRecord &&
    (!candidate.candidateLeadId || candidate.sourceRecord.leadId === candidate.matchedLeadId)
  ) {
    const norm = candidate.sourceRecord.normalizedData as unknown as NormalizedLeadData;
    if (norm && norm.businessName && norm.city) {
      const scoringCtx = await loadScoringContext(prisma);
      const scoreStartMs = Date.now();
      const scoreResult = calculateLeadScore(
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
          source: norm.source || candidate.sourceRecord.sourceName,
          sourceList: [norm.source || candidate.sourceRecord.sourceName],
          lastVerifiedAt: now,
        },
        scoringCtx.rules,
        {
          scoringVersion: scoringCtx.scoringVersion,
          thresholds: scoringCtx.thresholds,
          calculatedAt: now,
        }
      );

      const keys = generateCanonicalIdentityKeys(norm);
      const sepQualityEval = evaluateLeadQuality(
        {
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
          phones:
            norm.normalizedPhones || (norm.normalizedPhone ? [norm.normalizedPhone] : []),
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
          score: scoreResult.normalizedScore,
          isVerified: norm.isVerified ?? true,
          isCanonical: true,
          source: norm.source || candidate.sourceRecord.sourceName,
          sourceList: [norm.source || candidate.sourceRecord.sourceName],
          lastVerifiedAt: now,
        },
        { now }
      );

      createdLead = await prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
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
            phones:
              norm.normalizedPhones || (norm.normalizedPhone ? [norm.normalizedPhone] : []),
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
            score: scoreResult.normalizedScore,
            temperature: scoreResult.temperature,
            scoringVersion: scoreResult.scoringVersion,
            scoreExplanation: scoreResult.explanation as unknown as object,
            lastScoredAt: now,
            status: sepQualityEval.saleabilityStatus,
            confidence: scoreResult.confidence,
            qualificationReasons: scoreResult.qualificationReasons,
            qualificationRules: scoreResult.qualificationRules as unknown as object,
            leadType: norm.leadType || 'SHARED',
            exclusive: Boolean(norm.exclusive),
            creditCost: Boolean(norm.normalizedPhone) ? (Boolean(norm.exclusive) ? 25 : 5) : 1,
            creditCostReason: Boolean(norm.normalizedPhone)
              ? (Boolean(norm.exclusive) ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD')
              : 'FIELD_VISIT_DISCOUNT',
            maxPurchasers: norm.maxPurchasers || 3,
            currentPurchasers: 0,
            source: norm.source || candidate.sourceRecord!.sourceName,
            sourceList: [norm.source || candidate.sourceRecord!.sourceName],
            sourceId: candidate.sourceRecord!.sourceId,
            canonicalIdentityKeys: keys.allKeys,
            fieldProvenance: buildInitialFieldProvenance(
              norm,
              candidate.sourceRecord!.id,
              now
            ) as unknown as object,
            isCanonical: true,
            qualityScore: sepQualityEval.qualityScore,
            qualityStatus: sepQualityEval.qualityStatus,
            freshnessStatus: sepQualityEval.freshness.freshnessStatus,
            verificationStatus: sepQualityEval.verificationStatus,
            saleabilityStatus: sepQualityEval.saleabilityStatus,
            completenessScore: sepQualityEval.completeness.completenessScore,
            completenessBreakdown: sepQualityEval.completeness as unknown as object,
            qualityFlags: sepQualityEval.qualityFlags,
            qualitySummary: sepQualityEval.summary as unknown as object,
            businessStatus: sepQualityEval.businessStatus,
            phoneValidationStatus: sepQualityEval.phoneValidationStatus,
            emailValidationStatus: sepQualityEval.emailValidationStatus,
            websiteVerificationState: sepQualityEval.websiteVerificationState,
            lastVerifiedAt: now,
            nextVerificationAt: sepQualityEval.nextVerificationAt,
            isMock: Boolean((norm as any).isMock ?? false),
          },
        });

        await tx.leadScore.create({
          data: {
            leadId: lead.id,
            previousScore: null,
            rawScore: scoreResult.rawScore,
            normalizedScore: scoreResult.normalizedScore,
            newScore: scoreResult.normalizedScore,
            previousClassification: null,
            temperature: scoreResult.temperature,
            newClassification: scoreResult.classification,
            scoringVersion: scoreResult.scoringVersion,
            trigger: 'LEAD_CREATED',
            appliedRules: scoreResult.appliedRules as unknown as object,
            evaluatedRules: scoreResult.evaluatedRules as unknown as object,
            explanation: scoreResult.explanation as unknown as object,
            qualificationReasons: scoreResult.qualificationReasons,
            calculatedAt: now,
            evaluatedAt: now,
          },
        });

        await tx.sourceRecord.update({
          where: { id: candidate.sourceRecord!.id },
          data: {
            leadId: lead.id,
            status: 'ACTIVE',
          },
        });

        for (const k of keys.records) {
          await tx.leadIdentity
            .create({
              data: {
                leadId: lead.id,
                keyType: k.keyType,
                keyValue: k.keyValue,
                canonicalKey: k.canonicalKey,
                source: norm.source || candidate.sourceRecord!.sourceName,
                sourceRecordId: candidate.sourceRecord!.id,
                isPrimary: k.isPrimary,
              },
            })
            .catch(() => null);
        }

        return lead;
      });

      logScoringOperation({
        event: 'LEAD_SCORE_EVALUATED',
        leadId: createdLead.id,
        scoringVersion: scoreResult.scoringVersion,
        previousScore: null,
        newScore: scoreResult.normalizedScore,
        previousClassification: null,
        classification: scoreResult.classification,
        trigger: 'LEAD_CREATED',
        durationMs: Date.now() - scoreStartMs,
        rulesApplied: scoreResult.appliedRules.map((r) => r.ruleKey),
      });
    }
  }

  const updatedCandidate = await prisma.duplicateCandidate.update({
    where: { id: candidateId },
    data: {
      status: 'KEPT_SEPARATE',
      candidateLeadId: createdLead?.id || candidate.candidateLeadId,
      resolvedBy: adminUserId,
      resolvedAt: now,
      resolutionNotes: notes || 'تم الإبقاء على السجلين كأنشطة تجارية منفصلة',
    },
  });

  return {
    candidate: updatedCandidate,
    createdLead,
    createdSeparateLead: createdLead,
  };
}

export async function getAdminMergeHistory(
  prisma: PrismaClient,
  filters: {
    leadId?: string;
    targetLeadId?: string;
    performedBy?: string;
    isReverted?: boolean;
    includeReverted?: boolean;
    limit?: number;
  } = {}
) {
  const where: Prisma.LeadMergeHistoryWhereInput = {};
  const targetOrLeadId = filters.leadId || filters.targetLeadId;
  if (targetOrLeadId) {
    where.OR = [{ targetLeadId: targetOrLeadId }, { sourceLeadId: targetOrLeadId }];
  }
  if (filters.performedBy) {
    where.performedBy = filters.performedBy;
  }
  if (typeof filters.isReverted === 'boolean') {
    where.isReverted = filters.isReverted;
  } else if (filters.includeReverted === false) {
    where.isReverted = false;
  }

  const history = await prisma.leadMergeHistory.findMany({
    where,
    orderBy: { performedAt: 'desc' },
    take: Math.min(Math.max(1, filters.limit || 50), 200),
    include: {
      targetLead: {
        select: {
          id: true,
          businessName: true,
          city: true,
          phone: true,
          website: true,
          score: true,
          temperature: true,
          sourceList: true,
        },
      },
      sourceLead: {
        select: {
          id: true,
          businessName: true,
          city: true,
          phone: true,
          website: true,
          status: true,
        },
      },
      sourceRecord: true,
    },
  });

  return history;
}

export class DeduplicationService {
  static evaluate = evaluateLeadDeduplication;
  static findCandidates = findCandidateLeadsByIndexes;
  static withConcurrencyLock = withIdentityConcurrencyLock;
  static getDuplicateCandidates = getAdminDuplicateCandidates;
  static getDuplicateEvidence = getDuplicateCandidateEvidence;
  static compareTwoLeads = compareTwoLeadsEvidence;
  static confirmMerge = confirmAdminDuplicateMerge;
  static rejectCandidate = rejectAdminDuplicateCandidate;
  static getMergeHistory = getAdminMergeHistory;
  static unmerge = unmergeLead;
}

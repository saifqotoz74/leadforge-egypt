import { Prisma, PrismaClient, ScoringTrigger } from '@prisma/client';
import {
  DEFAULT_CLASSIFICATION_THRESHOLDS,
  resolveClassificationThresholds,
} from './classification';
import { DEFAULT_SCORING_RULES, ScoringEngine } from './engine';
import { logScoringOperation } from './logger';
import { normalizeRuleDefinition } from './rule-validator';
import {
  ClassificationThresholds,
  LeadScorableFields,
  LeadScoringResult,
  ScoringRuleDefinition,
  ScoringTriggerType,
} from './types';

export class LeadScoringError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'LeadScoringError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ActiveScoringContext {
  rules: ScoringRuleDefinition[];
  scoringVersion: string;
  versionNumber: number;
  thresholds: ClassificationThresholds;
}

/**
 * Loads active rules and scoring configuration from the database in 2 queries.
 * Falls back to deterministic defaults if tables are empty.
 */
export async function loadScoringContext(prisma: PrismaClient): Promise<ActiveScoringContext> {
  const [dbRules, dbConfig] = await Promise.all([
    prisma.scoringRule.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.scoringConfig
      .findUnique({ where: { id: 'default' } })
      .catch(() => null),
  ]);

  const rules: ScoringRuleDefinition[] =
    dbRules.length > 0
      ? dbRules.map((r) =>
          normalizeRuleDefinition({
            id: r.id,
            code: r.code,
            key: r.key || r.code,
            name: r.name,
            nameEn: r.nameEn,
            description: r.description,
            category: r.category,
            ruleGroup: r.ruleGroup,
            weight: r.weight,
            points: r.points || r.weight,
            priority: r.priority || r.sortOrder,
            sortOrder: r.sortOrder,
            enabled: r.enabled,
            field: r.field,
            operator: r.operator,
            targetValue: r.targetValue,
            conditions: (r.conditions as Record<string, unknown>) || {},
            version: r.version || dbConfig?.currentVersion || 'v1',
          })
        )
      : DEFAULT_SCORING_RULES;

  // Determine highest version across config and rules
  let versionNumber = dbConfig?.versionNumber ?? 1;
  let scoringVersion = dbConfig?.currentVersion || `v${versionNumber}`;

  for (const r of rules) {
    if (r.version) {
      const m = String(r.version).match(/^v(\d+)$/i);
      if (m && Number(m[1]) > versionNumber) {
        versionNumber = Number(m[1]);
        scoringVersion = `v${versionNumber}`;
      }
    }
  }

  const thresholds = dbConfig
    ? resolveClassificationThresholds({
        coldMax: dbConfig.coldMax,
        warmMin: dbConfig.warmMin,
        warmMax: dbConfig.warmMax,
        hotMin: dbConfig.hotMin,
        hotMax: dbConfig.hotMax,
        premiumMin: dbConfig.premiumMin,
      })
    : DEFAULT_CLASSIFICATION_THRESHOLDS;

  return {
    rules,
    scoringVersion,
    versionNumber,
    thresholds,
  };
}

/**
 * Bumps the active scoring version (e.g. v1 -> v2) when rules or thresholds change.
 */
export async function bumpScoringVersion(
  prisma: PrismaClient,
  explicitVersion?: string
): Promise<{ currentVersion: string; versionNumber: number }> {
  const existing = await prisma.scoringConfig
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);

  let nextNumber = (existing?.versionNumber ?? 1) + 1;
  let nextVersion = `v${nextNumber}`;

  if (explicitVersion && explicitVersion.trim()) {
    nextVersion = explicitVersion.trim();
    const m = nextVersion.match(/^v(\d+)$/i);
    if (m) {
      nextNumber = Number(m[1]);
    }
  }

  const updated = await prisma.scoringConfig.upsert({
    where: { id: 'default' },
    update: {
      currentVersion: nextVersion,
      versionNumber: nextNumber,
    },
    create: {
      id: 'default',
      currentVersion: nextVersion,
      versionNumber: nextNumber,
      ...DEFAULT_CLASSIFICATION_THRESHOLDS,
    },
  });

  return {
    currentVersion: updated.currentVersion,
    versionNumber: updated.versionNumber,
  };
}

/**
 * Ensures ScoringConfig.currentVersion is at least as new as explicitVersion so version progression never regresses.
 */
export async function syncScoringVersion(
  prisma: PrismaClient,
  explicitVersion?: string | null
): Promise<void> {
  if (!explicitVersion || !explicitVersion.trim()) return;
  const trimmed = explicitVersion.trim();
  const existing = await prisma.scoringConfig
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);

  const match = trimmed.match(/^v(\d+)$/i);
  const parsedNum = match ? Number(match[1]) : null;
  const currentNum = existing?.versionNumber ?? 1;

  if (parsedNum !== null) {
    if (!existing || parsedNum > currentNum || (parsedNum === currentNum && existing.currentVersion !== trimmed)) {
      await prisma.scoringConfig
        .upsert({
          where: { id: 'default' },
          update: {
            currentVersion: `v${parsedNum}`,
            versionNumber: parsedNum,
          },
          create: {
            id: 'default',
            currentVersion: `v${parsedNum}`,
            versionNumber: parsedNum,
            ...DEFAULT_CLASSIFICATION_THRESHOLDS,
          },
        })
        .catch(() => null);
    }
  } else if (!existing || existing.currentVersion !== trimmed) {
    await prisma.scoringConfig
      .upsert({
        where: { id: 'default' },
        update: {
          currentVersion: trimmed,
        },
        create: {
          id: 'default',
          currentVersion: trimmed,
          versionNumber: currentNum,
          ...DEFAULT_CLASSIFICATION_THRESHOLDS,
        },
      })
      .catch(() => null);
  }
}

export function mapLeadRecordToScorableFields(lead: {
  id?: string;
  businessName?: string;
  isVerified: boolean;
  websiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  website?: string | null;
  normalizedDomain?: string | null;
  websiteAnalysis?: Prisma.JsonValue | null;
  hasFacebook: boolean;
  facebook?: string | null;
  hasInstagram: boolean;
  instagram?: string | null;
  hasPhone: boolean;
  phone?: string | null;
  normalizedPhone?: string | null;
  hasEmail: boolean;
  email?: string | null;
  normalizedEmail?: string | null;
  branchCount: number;
  reviewCount: number;
  rating?: number | null;
  isRecentlyActive: boolean;
  category?: string;
  city?: string;
  governorate?: string;
  area?: string | null;
  estimatedBudget?: number;
  source?: string;
  sourceList?: string[];
  lastVerifiedAt?: Date | null;
  leadSource?: { isActive: boolean } | null;
}): LeadScorableFields {
  return {
    id: lead.id,
    businessName: lead.businessName,
    isVerified: lead.isVerified,
    websiteStatus: lead.websiteStatus,
    website: lead.website,
    normalizedDomain: lead.normalizedDomain,
    websiteAnalysis:
      lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
        ? (lead.websiteAnalysis as Record<string, unknown>)
        : null,
    hasFacebook: lead.hasFacebook,
    facebook: lead.facebook,
    hasInstagram: lead.hasInstagram,
    instagram: lead.instagram,
    hasPhone: lead.hasPhone,
    phone: lead.phone,
    normalizedPhone: lead.normalizedPhone,
    hasEmail: lead.hasEmail,
    email: lead.email,
    normalizedEmail: lead.normalizedEmail,
    branchCount: lead.branchCount,
    reviewCount: lead.reviewCount,
    rating: lead.rating,
    isRecentlyActive: lead.isRecentlyActive,
    category: lead.category,
    city: lead.city,
    governorate: lead.governorate,
    area: lead.area,
    estimatedBudget: lead.estimatedBudget,
    source: lead.source,
    sourceList: lead.sourceList,
    sourceVerified: lead.leadSource ? lead.leadSource.isActive : lead.isVerified,
    lastVerifiedAt: lead.lastVerifiedAt,
  };
}

function extractAppliedRulesSignature(appliedRules: unknown): string {
  if (!Array.isArray(appliedRules)) return '[]';
  return JSON.stringify(
    appliedRules.map((r: Record<string, unknown>) => ({
      code: r.code || r.ruleKey,
      weight: r.weight ?? r.points,
    }))
  );
}

/**
 * Determines whether a new score evaluation materially differs from the latest persisted LeadScore snapshot.
 * Prevents duplicate score snapshots on idempotent re-runs while recording snapshots whenever score,
 * classification, applied rules, or scoringVersion changes.
 */
export function hasScoreMateriallyChanged(
  latestSnapshot: {
    rawScore: number;
    normalizedScore: number;
    temperature: string;
    scoringVersion?: string | null;
    appliedRules: Prisma.JsonValue;
  } | null | undefined,
  newResult: LeadScoringResult
): boolean {
  if (!latestSnapshot) return true;
  if (latestSnapshot.normalizedScore !== newResult.normalizedScore) return true;
  if (latestSnapshot.rawScore !== newResult.rawScore) return true;
  if (latestSnapshot.temperature !== newResult.classification) return true;
  if ((latestSnapshot.scoringVersion || 'v1') !== newResult.scoringVersion) return true;

  const prevSig = extractAppliedRulesSignature(latestSnapshot.appliedRules);
  const nextSig = extractAppliedRulesSignature(newResult.appliedRules);
  return prevSig !== nextSig;
}

export interface RecalculateSingleLeadOptions {
  trigger?: ScoringTriggerType;
  scoringVersion?: string;
  rules?: ScoringRuleDefinition[];
  thresholds?: Partial<ClassificationThresholds>;
  forceSnapshot?: boolean;
}

/**
 * Recalculates and persists the score for a single Lead inside an atomic database transaction.
 */
export async function recalculateLeadScore(
  prisma: PrismaClient,
  leadId: string,
  options?: RecalculateSingleLeadOptions
) {
  const startMs = Date.now();
  if (!leadId || typeof leadId !== 'string' || !leadId.trim()) {
    throw new LeadScoringError('معرف الفرصة غير صالح.', 'INVALID_LEAD_ID', 400);
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      leadSource: { select: { isActive: true } },
      scores: {
        orderBy: [{ calculatedAt: 'desc' }, { evaluatedAt: 'desc' }],
        take: 1,
      },
    },
  });

  if (!lead) {
    throw new LeadScoringError('الفرصة المطلوبة غير موجودة.', 'LEAD_NOT_FOUND', 404);
  }

  if (options?.scoringVersion) {
    await syncScoringVersion(prisma, options.scoringVersion);
  }

  const context =
    options?.rules && options?.scoringVersion
      ? {
          rules: options.rules,
          scoringVersion: options.scoringVersion,
          thresholds: resolveClassificationThresholds(options.thresholds),
        }
      : await loadScoringContext(prisma);

  const rulesToUse = options?.rules || context.rules;
  const effectiveVersion = options?.scoringVersion || context.scoringVersion;
  const thresholdsToUse = options?.thresholds
    ? resolveClassificationThresholds(options.thresholds)
    : context.thresholds;
  const trigger: ScoringTriggerType = options?.trigger || 'MANUAL_RECALCULATION';
  const now = new Date();

  const scorable = mapLeadRecordToScorableFields(lead);
  const scoreResult = ScoringEngine.evaluate(scorable, rulesToUse, {
    scoringVersion: effectiveVersion,
    thresholds: thresholdsToUse,
    calculatedAt: now,
  });

  const latestSnapshot = lead.scores[0] || null;
  const shouldCreateSnapshot =
    Boolean(options?.forceSnapshot) || hasScoreMateriallyChanged(latestSnapshot, scoreResult);

  const previousScore = latestSnapshot ? latestSnapshot.normalizedScore : lead.score;
  const previousClassification = latestSnapshot ? latestSnapshot.temperature : lead.temperature;

  const { updatedLead, snapshot } = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: {
        score: scoreResult.normalizedScore,
        temperature: scoreResult.temperature,
        confidence: scoreResult.confidence,
        scoringVersion: scoreResult.scoringVersion,
        scoreExplanation: scoreResult.explanation as unknown as object,
        lastScoredAt: now,
        qualificationReasons: scoreResult.qualificationReasons,
        qualificationRules: scoreResult.qualificationRules as unknown as object,
      },
    });

    let createdSnapshot = latestSnapshot;
    if (shouldCreateSnapshot) {
      createdSnapshot = await tx.leadScore.create({
        data: {
          leadId: lead.id,
          previousScore: latestSnapshot ? previousScore : null,
          rawScore: scoreResult.rawScore,
          normalizedScore: scoreResult.normalizedScore,
          newScore: scoreResult.normalizedScore,
          previousClassification: latestSnapshot ? previousClassification : null,
          temperature: scoreResult.temperature,
          newClassification: scoreResult.classification,
          scoringVersion: scoreResult.scoringVersion,
          trigger: trigger as ScoringTrigger,
          appliedRules: scoreResult.appliedRules as unknown as object,
          evaluatedRules: scoreResult.evaluatedRules as unknown as object,
          explanation: scoreResult.explanation as unknown as object,
          qualificationReasons: scoreResult.qualificationReasons,
          calculatedAt: now,
          evaluatedAt: now,
        },
      });
    }

    return { updatedLead: updated, snapshot: createdSnapshot };
  });

  const durationMs = Date.now() - startMs;
  logScoringOperation({
    event: 'LEAD_SCORE_EVALUATED',
    leadId: lead.id,
    scoringVersion: scoreResult.scoringVersion,
    previousScore,
    newScore: scoreResult.normalizedScore,
    previousClassification,
    classification: scoreResult.classification,
    trigger,
    durationMs,
    rulesApplied: scoreResult.appliedRules.map((r) => r.ruleKey),
  });

  return {
    lead: updatedLead,
    scoreResult,
    snapshotCreated: shouldCreateSnapshot,
    snapshot,
  };
}

export interface BulkRecalculationFilters {
  city?: string;
  governorate?: string;
  category?: string;
  status?: 'AVAILABLE' | 'CLAIMED_FULL' | 'INVALID' | 'ARCHIVED';
  websiteStatus?: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  leadIds?: string[];
  scoringVersionNot?: string;
}

export interface BulkRecalculationOptions {
  batchSize?: number;
  maxLeads?: number;
  trigger?: ScoringTriggerType;
  scoringVersion?: string;
  rules?: ScoringRuleDefinition[];
  thresholds?: Partial<ClassificationThresholds>;
  forceSnapshot?: boolean;
}

export interface BulkRecalculationReport {
  totalProcessed: number;
  changedCount: number;
  unchangedCount: number;
  snapshotsCreated: number;
  scoringVersion: string;
  durationMs: number;
  batches: number;
}

/**
 * Safely recalculates lead scores in bounded batches without loading the entire database into memory.
 * Uses batch transactions and preserves historical score snapshots.
 */
export async function recalculateManyLeadScores(
  prisma: PrismaClient,
  filters: BulkRecalculationFilters = {},
  options: BulkRecalculationOptions = {}
): Promise<BulkRecalculationReport> {
  const startMs = Date.now();
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 50, 250));
  const maxLeads = Math.max(1, Math.min(options.maxLeads ?? 5000, 20000));
  const trigger: ScoringTriggerType = options.trigger || 'ADMIN_RECALCULATION';

  if (options.scoringVersion) {
    await syncScoringVersion(prisma, options.scoringVersion);
  }

  const context = await loadScoringContext(prisma);
  const rulesToUse = options.rules || context.rules;
  const effectiveVersion = options.scoringVersion || context.scoringVersion;
  const thresholdsToUse = options.thresholds
    ? resolveClassificationThresholds(options.thresholds)
    : context.thresholds;

  const where: Prisma.LeadWhereInput = {};
  if (filters.city && filters.city !== 'ALL') where.city = filters.city;
  if (filters.governorate && filters.governorate !== 'ALL') where.governorate = filters.governorate;
  if (filters.category && filters.category !== 'ALL') where.category = filters.category;
  if (filters.status) where.status = filters.status;
  if (filters.websiteStatus) where.websiteStatus = filters.websiteStatus;
  if (Array.isArray(filters.leadIds) && filters.leadIds.length > 0) {
    where.id = { in: filters.leadIds };
  } else {
    where.isCanonical = true;
  }
  if (filters.scoringVersionNot) {
    where.scoringVersion = { not: filters.scoringVersionNot };
  }

  let totalProcessed = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let snapshotsCreated = 0;
  let batches = 0;
  let cursorId = '';

  while (totalProcessed < maxLeads) {
    const remaining = maxLeads - totalProcessed;
    const takeCount = Math.min(batchSize, remaining);

    const batchLeads = await prisma.lead.findMany({
      where: cursorId ? { AND: [where, { id: { gt: cursorId } }] } : where,
      orderBy: { id: 'asc' },
      take: takeCount,
      include: {
        leadSource: { select: { isActive: true } },
        scores: {
          orderBy: [{ calculatedAt: 'desc' }, { evaluatedAt: 'desc' }],
          take: 1,
        },
      },
    });

    if (batchLeads.length === 0) break;

    batches += 1;
    cursorId = String(batchLeads[batchLeads.length - 1].id);
    const now = new Date();

    // Evaluate all leads in the batch purely in memory
    const evaluations = batchLeads.map((lead) => {
      const scorable = mapLeadRecordToScorableFields(lead);
      const scoreResult = ScoringEngine.evaluate(scorable, rulesToUse, {
        scoringVersion: effectiveVersion,
        thresholds: thresholdsToUse,
        calculatedAt: now,
      });
      const latestSnapshot = lead.scores[0] || null;
      const materiallyChanged =
        Boolean(options.forceSnapshot) || hasScoreMateriallyChanged(latestSnapshot, scoreResult);

      return {
        lead,
        latestSnapshot,
        scoreResult,
        materiallyChanged,
      };
    });

    // Persist batch inside a transaction
    await prisma.$transaction(async (tx) => {
      for (const item of evaluations) {
        const { lead, latestSnapshot, scoreResult, materiallyChanged } = item;
        const previousScore = latestSnapshot ? latestSnapshot.normalizedScore : lead.score;
        const previousClassification = latestSnapshot
          ? latestSnapshot.temperature
          : lead.temperature;

        await tx.lead.update({
          where: { id: lead.id },
          data: {
            score: scoreResult.normalizedScore,
            temperature: scoreResult.temperature,
            confidence: scoreResult.confidence,
            scoringVersion: scoreResult.scoringVersion,
            scoreExplanation: scoreResult.explanation as unknown as object,
            lastScoredAt: now,
            qualificationReasons: scoreResult.qualificationReasons,
            qualificationRules: scoreResult.qualificationRules as unknown as object,
          },
        });

        if (materiallyChanged) {
          await tx.leadScore.create({
            data: {
              leadId: lead.id,
              previousScore: latestSnapshot ? previousScore : null,
              rawScore: scoreResult.rawScore,
              normalizedScore: scoreResult.normalizedScore,
              newScore: scoreResult.normalizedScore,
              previousClassification: latestSnapshot ? previousClassification : null,
              temperature: scoreResult.temperature,
              newClassification: scoreResult.classification,
              scoringVersion: scoreResult.scoringVersion,
              trigger: trigger as ScoringTrigger,
              appliedRules: scoreResult.appliedRules as unknown as object,
              evaluatedRules: scoreResult.evaluatedRules as unknown as object,
              explanation: scoreResult.explanation as unknown as object,
              qualificationReasons: scoreResult.qualificationReasons,
              calculatedAt: now,
              evaluatedAt: now,
            },
          });
          snapshotsCreated += 1;
          changedCount += 1;
        } else {
          unchangedCount += 1;
        }
        totalProcessed += 1;
      }
    });

    if (batchLeads.length < takeCount) break;
  }

  const durationMs = Date.now() - startMs;
  logScoringOperation({
    event: 'BULK_SCORE_RECALCULATED',
    scoringVersion: effectiveVersion,
    trigger,
    durationMs,
    totalProcessed,
    changedCount,
    unchangedCount,
  });

  return {
    totalProcessed,
    changedCount,
    unchangedCount,
    snapshotsCreated,
    scoringVersion: effectiveVersion,
    durationMs,
    batches,
  };
}

/**
 * Retrieves detailed score explanation and versioned history for a Lead.
 */
export async function getLeadScoreDetails(
  prisma: PrismaClient,
  leadId: string,
  options?: { includeEvaluatedRules?: boolean; historyLimit?: number }
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      leadSource: { select: { isActive: true } },
      scores: {
        orderBy: [{ calculatedAt: 'desc' }, { evaluatedAt: 'desc' }],
        take: Math.min(options?.historyLimit ?? 25, 100),
      },
    },
  });

  if (!lead) {
    throw new LeadScoringError('الفرصة المطلوبة غير موجودة.', 'LEAD_NOT_FOUND', 404);
  }

  const context = await loadScoringContext(prisma);
  const liveEval = ScoringEngine.evaluate(mapLeadRecordToScorableFields(lead), context.rules, {
    scoringVersion: lead.scoringVersion || context.scoringVersion,
    thresholds: context.thresholds,
    calculatedAt: lead.lastScoredAt || lead.updatedAt,
  });

  const storedExplanation =
    lead.scoreExplanation && typeof lead.scoreExplanation === 'object'
      ? (lead.scoreExplanation as unknown as LeadScoringResult['explanation'])
      : liveEval.explanation;

  const persistedRawScore =
    typeof storedExplanation?.rawScore === 'number'
      ? storedExplanation.rawScore
      : lead.scores[0]?.rawScore ?? liveEval.rawScore;

  return {
    leadId: lead.id,
    businessName: lead.businessName,
    score: lead.score,
    rawScore: persistedRawScore,
    normalizedScore: lead.score,
    classification: lead.temperature,
    temperature: lead.temperature,
    confidence: lead.confidence,
    scoringVersion: lead.scoringVersion || context.scoringVersion,
    lastScoredAt: lead.lastScoredAt,
    explanation: {
      ...storedExplanation,
      evaluatedRules: options?.includeEvaluatedRules
        ? storedExplanation.evaluatedRules || liveEval.evaluatedRules
        : undefined,
    },
    reasons: storedExplanation.reasons || liveEval.explanation.reasons,
    appliedRules: lead.qualificationRules,
    qualificationReasons: lead.qualificationReasons,
    history: lead.scores.map((s) => ({
      id: s.id,
      previousScore: s.previousScore,
      rawScore: s.rawScore,
      normalizedScore: s.normalizedScore,
      newScore: s.newScore || s.normalizedScore,
      previousClassification: s.previousClassification,
      newClassification: s.newClassification || s.temperature,
      classification: s.newClassification || s.temperature,
      temperature: s.temperature,
      scoringVersion: s.scoringVersion || 'v1',
      trigger: s.trigger,
      appliedRules: s.appliedRules,
      qualificationReasons: s.qualificationReasons,
      calculatedAt: s.calculatedAt || s.evaluatedAt,
      evaluatedAt: s.evaluatedAt,
    })),
  };
}

export class ScoringService {
  static loadContext = loadScoringContext;
  static bumpVersion = bumpScoringVersion;
  static syncVersion = syncScoringVersion;
  static recalculateLeadScore = recalculateLeadScore;
  static recalculateManyLeadScores = recalculateManyLeadScores;
  static getLeadScoreDetails = getLeadScoreDetails;
}

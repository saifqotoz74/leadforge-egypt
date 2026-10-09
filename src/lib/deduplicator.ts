import { Lead, PrismaClient } from '@prisma/client';
import { NormalizedLeadData } from './validator';
import {
  ClassificationThresholds,
  DEFAULT_SCORING_RULES,
  ScoringRuleDefinition,
} from './scoring-engine';
import {
  calculateTokenSimilarity,
  DeduplicationDecision,
  DeduplicationEvaluationResult,
  DeduplicationMatchReason,
  DeduplicationPolicyOptions,
  DeduplicationSignal,
  evaluateLeadDeduplication,
  FieldConflictRecord,
  mergeSourceIntoCanonicalLead,
} from './deduplication';

export * from './deduplication';

export interface DeduplicationMatchResult extends DeduplicationEvaluationResult {
  isDuplicate: boolean;
  decision: DeduplicationDecision;
  matchedLead?: Lead;
  matchedLeadId: string | null;
  matchReason?: DeduplicationMatchReason;
  signals: DeduplicationSignal[];
  conflicts: FieldConflictRecord[];
}

/**
 * Evaluates a normalized lead record against existing Canonical Leads in the database
 * using the 5-Level Deterministic Matching Hierarchy, Ambiguity Protection, and Conflict Detection.
 */
export async function findDuplicateLead(
  prisma: PrismaClient,
  candidate: NormalizedLeadData,
  options?: DeduplicationPolicyOptions
): Promise<DeduplicationMatchResult> {
  return evaluateLeadDeduplication(prisma, candidate, options);
}

/**
 * Merges a duplicate candidate into the existing Canonical Lead record using MergeService:
 * - Preserves source provenance and field-level conflicts
 * - Appends new source to `sourceList`
 * - Enriches missing contact/social/rating fields
 * - Records auditable LeadMergeHistory
 * - Recalculates Phase 1 Lead Score
 */
export async function mergeDuplicateLead(
  prisma: PrismaClient,
  existing: Lead,
  incoming: NormalizedLeadData,
  rules: ScoringRuleDefinition[] = DEFAULT_SCORING_RULES,
  scoringVersion = 'v1',
  thresholds?: Partial<ClassificationThresholds>,
  options?: {
    sourceRecordId?: string | null;
    reason?: string;
    matchedSignals?: DeduplicationSignal[];
    performedBy?: string;
  }
): Promise<Lead> {
  const result = await mergeSourceIntoCanonicalLead(prisma, existing, incoming, {
    rules,
    scoringVersion,
    thresholds,
    sourceRecordId: options?.sourceRecordId || null,
    reason: options?.reason || 'DUPLICATE_CONFIRMED',
    matchedSignals: options?.matchedSignals || [],
    performedBy: options?.performedBy || 'SYSTEM',
  });
  return result.lead;
}

export { calculateTokenSimilarity };

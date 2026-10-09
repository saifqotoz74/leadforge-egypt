import { PrismaClient } from '@prisma/client';
import {
  recalculateManyLeadScores,
  ScoringTriggerType,
} from './scoring';

export * from './scoring';

/**
 * Loads rules from DB (or falls back to defaults) and recalculates scores for all leads in DB
 * in bounded, transaction-safe batches.
 */
export async function recalculateAllLeadsScores(
  prisma: PrismaClient,
  trigger: ScoringTriggerType = 'ADMIN_RECALCULATION'
): Promise<number> {
  const report = await recalculateManyLeadScores(prisma, {}, { trigger });
  return report.totalProcessed;
}

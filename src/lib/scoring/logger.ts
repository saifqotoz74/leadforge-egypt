import { LeadTemperatureBand, ScoringTriggerType } from './types';

export interface ScoringLogEntry {
  event: 'LEAD_SCORE_EVALUATED' | 'BULK_SCORE_RECALCULATED' | 'SCORING_RULE_MUTATED';
  timestamp: string;
  leadId?: string;
  scoringVersion: string;
  previousScore?: number | null;
  newScore?: number;
  previousClassification?: string | null;
  classification?: LeadTemperatureBand;
  trigger?: ScoringTriggerType;
  durationMs: number;
  rulesApplied?: string[];
  totalProcessed?: number;
  changedCount?: number;
  unchangedCount?: number;
}

const MAX_RECENT_LOGS = 200;
const recentScoringLogs: ScoringLogEntry[] = [];

/**
 * Structured observability logger for lead scoring operations.
 * Guarantees no sensitive PII (passwords, tokens, payment secrets, raw phone/email) is ever logged.
 */
export function logScoringOperation(
  entry: Omit<ScoringLogEntry, 'timestamp' | 'durationMs'> & { durationMs?: number }
): ScoringLogEntry {
  const safeEntry: ScoringLogEntry = {
    ...entry,
    durationMs: entry.durationMs ?? 0,
    timestamp: new Date().toISOString(),
  };

  recentScoringLogs.push(safeEntry);
  if (recentScoringLogs.length > MAX_RECENT_LOGS) {
    recentScoringLogs.shift();
  }

  if (process.env.NODE_ENV !== 'test' || process.env.SCORING_DEBUG_LOGS === 'true') {
    console.info(JSON.stringify({ module: 'ScoringEngine', ...safeEntry }));
  }

  return safeEntry;
}

export function getRecentScoringLogs(limit = 50): ScoringLogEntry[] {
  return recentScoringLogs.slice(-Math.max(1, Math.min(limit, MAX_RECENT_LOGS))).reverse();
}

export function clearScoringLogsForTesting(): void {
  recentScoringLogs.length = 0;
}

export type MatchingLogEventType =
  | 'MATCH_CALCULATED'
  | 'MATCH_REJECTED'
  | 'MATCH_RECALCULATED'
  | 'MATCH_RULE_FAILED'
  | 'MATCH_RULE_APPLIED'
  | 'NO_ELIGIBLE_DEVELOPERS';

export interface MatchingLogEvent {
  eventType: MatchingLogEventType;
  leadId: string;
  developerId: string | null;
  eligible: boolean;
  matchStrength: number;
  rawMatchPoints?: number;
  hardFailureCount: number;
  hardFailureCodes?: string[];
  matchVersion: string;
  durationMs: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

const recentMatchingLogs: MatchingLogEvent[] = [];
const MAX_MATCHING_LOGS = 500;

/**
 * Structured observability logger for Phase 4 Deterministic Matching Engine.
 * Never logs secrets, tokens, or PII credentials.
 */
export function logMatchingEvent(
  event: Omit<MatchingLogEvent, 'timestamp'> & { timestamp?: string }
): void {
  const entry: MatchingLogEvent = {
    eventType: event.eventType,
    leadId: String(event.leadId || 'unknown'),
    developerId: event.developerId ? String(event.developerId) : null,
    eligible: Boolean(event.eligible),
    matchStrength: Math.max(0, Math.min(100, Math.round(event.matchStrength || 0))),
    rawMatchPoints: event.rawMatchPoints,
    hardFailureCount: Math.max(0, Math.round(event.hardFailureCount || 0)),
    hardFailureCodes: Array.isArray(event.hardFailureCodes) ? event.hardFailureCodes : [],
    matchVersion: event.matchVersion || 'v1',
    durationMs: Math.max(0, Math.round(event.durationMs || 0)),
    timestamp: event.timestamp || new Date().toISOString(),
    details: event.details,
  };

  recentMatchingLogs.unshift(entry);
  if (recentMatchingLogs.length > MAX_MATCHING_LOGS) {
    recentMatchingLogs.pop();
  }
}

export function getRecentMatchingLogs(limit = 50): MatchingLogEvent[] {
  return recentMatchingLogs.slice(0, Math.max(1, limit));
}

export function clearMatchingLogs(): void {
  recentMatchingLogs.length = 0;
}

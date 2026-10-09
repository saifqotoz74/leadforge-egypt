export type ClaimEngineLogEvent =
  | 'claim_attempt_started'
  | 'claim_succeeded'
  | 'claim_failed'
  | 'claim_idempotent_replay'
  | 'credits_deducted'
  | 'credits_refunded'
  | 'credits_adjusted'
  | 'exclusive_lead_locked'
  | 'shared_lead_incremented'
  | 'concurrency_conflict_detected'
  | 'lead_post_claim_invalidation';

export interface StructuredClaimLogEntry {
  timestamp: string;
  event: ClaimEngineLogEvent;
  leadId?: string;
  developerId?: string;
  claimId?: string;
  transactionId?: string;
  code?: string;
  credits?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  details?: Record<string, unknown>;
}

const recentClaimLogs: StructuredClaimLogEntry[] = [];
const MAX_RECENT_LOGS = 500;

export function logClaimEngineEvent(
  event: ClaimEngineLogEvent,
  payload: Omit<StructuredClaimLogEntry, 'timestamp' | 'event'>
): StructuredClaimLogEntry {
  const entry: StructuredClaimLogEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...payload,
  };

  recentClaimLogs.push(entry);
  if (recentClaimLogs.length > MAX_RECENT_LOGS) {
    recentClaimLogs.shift();
  }

  return entry;
}

export function getRecentClaimEngineLogs(limit = 100): StructuredClaimLogEntry[] {
  return recentClaimLogs.slice(-limit);
}

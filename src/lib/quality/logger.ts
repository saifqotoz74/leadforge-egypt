export interface VerificationLogEvent {
  leadId: string;
  verificationType: string;
  source: string;
  previousStatus: string | null;
  newStatus: string;
  durationMs: number;
  result: string;
  errorType?: string | null;
  qualityScore?: number;
  saleabilityStatus?: string;
}

const recentVerificationLogs: VerificationLogEvent[] = [];
const MAX_RECENT_LOGS = 500;

/**
 * Structured observability logger for Phase 3 Verification & Quality Engine.
 * Never logs raw credentials, API keys, or secrets.
 */
export function logVerificationEvent(event: VerificationLogEvent): void {
  const sanitizedEvent: VerificationLogEvent = {
    leadId: event.leadId,
    verificationType: event.verificationType,
    source: event.source,
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    durationMs: Math.max(0, Math.round(event.durationMs)),
    result: event.result,
    errorType: event.errorType ?? null,
    qualityScore: event.qualityScore,
    saleabilityStatus: event.saleabilityStatus,
  };

  recentVerificationLogs.unshift(sanitizedEvent);
  if (recentVerificationLogs.length > MAX_RECENT_LOGS) {
    recentVerificationLogs.pop();
  }
}

export function getRecentVerificationLogs(limit = 50): VerificationLogEvent[] {
  return recentVerificationLogs.slice(0, Math.max(1, limit));
}

export function clearVerificationLogs(): void {
  recentVerificationLogs.length = 0;
}

export const getRecentQualityLogs = getRecentVerificationLogs;
export const clearQualityLogs = clearVerificationLogs;


import { createAuditLog } from '@/lib/audit';
import { redactSensitiveData } from './error-taxonomy';

export type SecurityAbuseSignalType =
  | 'REPEATED_AUTH_FAILURES'
  | 'REPEATED_FAILED_CLAIMS'
  | 'UNAVAILABLE_LEAD_CLAIM_SPAM'
  | 'EXCESSIVE_PREVIEW_REQUESTS'
  | 'EXCESSIVE_EXPORT_REQUESTS'
  | 'EXCESSIVE_INGESTION_TRIGGERS'
  | 'IDOR_PROBE_DETECTED'
  | 'SSRF_ATTEMPT_BLOCKED'
  | 'MASS_ASSIGNMENT_ATTEMPT'
  | 'CSRF_ORIGIN_MISMATCH';

export interface AbuseThresholdConfig {
  windowMs: number;
  repeatedAuthFailuresThreshold: number;
  repeatedFailedClaimsThreshold: number;
  unavailableLeadClaimSpamThreshold: number;
  excessivePreviewRequestsThreshold: number;
  excessiveExportRequestsThreshold: number;
  excessiveIngestionTriggersThreshold: number;
  idorProbeThreshold: number;
}

export const DEFAULT_ABUSE_THRESHOLDS: Readonly<AbuseThresholdConfig> = Object.freeze({
  windowMs: 15 * 60_000, // 15 minutes
  repeatedAuthFailuresThreshold: 5,
  repeatedFailedClaimsThreshold: 5,
  unavailableLeadClaimSpamThreshold: 4,
  excessivePreviewRequestsThreshold: 25,
  excessiveExportRequestsThreshold: 10,
  excessiveIngestionTriggersThreshold: 10,
  idorProbeThreshold: 3,
});

export interface SecurityAbuseEventRecord {
  id: string;
  signalType: SecurityAbuseSignalType;
  actorKey: string;
  userId?: string | null;
  ipAddress?: string | null;
  countInWindow: number;
  threshold: number;
  flagged: boolean;
  actionTaken: 'LOGGED_AND_FLAGGED_FOR_ADMIN_REVIEW' | 'TEMPORARY_THROTTLE_APPLIED';
  details?: Record<string, unknown>;
  createdAt: string;
}

let activeAbuseThresholds: AbuseThresholdConfig = { ...DEFAULT_ABUSE_THRESHOLDS };

const signalCounters = new Map<string, { timestamps: number[]; lastFlaggedAt?: number }>();
const recentAbuseFlags: SecurityAbuseEventRecord[] = [];
const MAX_RECENT_ABUSE_FLAGS = 250;

export function getAbuseThresholds(): AbuseThresholdConfig {
  return { ...activeAbuseThresholds };
}

export function updateAbuseThresholds(
  partial: Partial<AbuseThresholdConfig>
): AbuseThresholdConfig {
  activeAbuseThresholds = {
    windowMs:
      typeof partial.windowMs === 'number' && partial.windowMs >= 1000
        ? Math.floor(partial.windowMs)
        : activeAbuseThresholds.windowMs,
    repeatedAuthFailuresThreshold:
      typeof partial.repeatedAuthFailuresThreshold === 'number' &&
      partial.repeatedAuthFailuresThreshold >= 1
        ? Math.floor(partial.repeatedAuthFailuresThreshold)
        : activeAbuseThresholds.repeatedAuthFailuresThreshold,
    repeatedFailedClaimsThreshold:
      typeof partial.repeatedFailedClaimsThreshold === 'number' &&
      partial.repeatedFailedClaimsThreshold >= 1
        ? Math.floor(partial.repeatedFailedClaimsThreshold)
        : activeAbuseThresholds.repeatedFailedClaimsThreshold,
    unavailableLeadClaimSpamThreshold:
      typeof partial.unavailableLeadClaimSpamThreshold === 'number' &&
      partial.unavailableLeadClaimSpamThreshold >= 1
        ? Math.floor(partial.unavailableLeadClaimSpamThreshold)
        : activeAbuseThresholds.unavailableLeadClaimSpamThreshold,
    excessivePreviewRequestsThreshold:
      typeof partial.excessivePreviewRequestsThreshold === 'number' &&
      partial.excessivePreviewRequestsThreshold >= 1
        ? Math.floor(partial.excessivePreviewRequestsThreshold)
        : activeAbuseThresholds.excessivePreviewRequestsThreshold,
    excessiveExportRequestsThreshold:
      typeof partial.excessiveExportRequestsThreshold === 'number' &&
      partial.excessiveExportRequestsThreshold >= 1
        ? Math.floor(partial.excessiveExportRequestsThreshold)
        : activeAbuseThresholds.excessiveExportRequestsThreshold,
    excessiveIngestionTriggersThreshold:
      typeof partial.excessiveIngestionTriggersThreshold === 'number' &&
      partial.excessiveIngestionTriggersThreshold >= 1
        ? Math.floor(partial.excessiveIngestionTriggersThreshold)
        : activeAbuseThresholds.excessiveIngestionTriggersThreshold,
    idorProbeThreshold:
      typeof partial.idorProbeThreshold === 'number' && partial.idorProbeThreshold >= 1
        ? Math.floor(partial.idorProbeThreshold)
        : activeAbuseThresholds.idorProbeThreshold,
  };
  return getAbuseThresholds();
}

function getThresholdForSignal(signalType: SecurityAbuseSignalType): number {
  switch (signalType) {
    case 'REPEATED_AUTH_FAILURES':
      return activeAbuseThresholds.repeatedAuthFailuresThreshold;
    case 'REPEATED_FAILED_CLAIMS':
      return activeAbuseThresholds.repeatedFailedClaimsThreshold;
    case 'UNAVAILABLE_LEAD_CLAIM_SPAM':
      return activeAbuseThresholds.unavailableLeadClaimSpamThreshold;
    case 'EXCESSIVE_PREVIEW_REQUESTS':
      return activeAbuseThresholds.excessivePreviewRequestsThreshold;
    case 'EXCESSIVE_EXPORT_REQUESTS':
      return activeAbuseThresholds.excessiveExportRequestsThreshold;
    case 'EXCESSIVE_INGESTION_TRIGGERS':
      return activeAbuseThresholds.excessiveIngestionTriggersThreshold;
    case 'IDOR_PROBE_DETECTED':
      return activeAbuseThresholds.idorProbeThreshold;
    case 'SSRF_ATTEMPT_BLOCKED':
    case 'MASS_ASSIGNMENT_ATTEMPT':
    case 'CSRF_ORIGIN_MISMATCH':
      return 1;
  }
}

/**
 * Records a deterministic security/abuse signal and evaluates whether it crosses configured thresholds.
 * Never automatically bans a user; flags for Admin review and optionally applies temporary rate throttling.
 */
export async function recordSecuritySignal(params: {
  signalType: SecurityAbuseSignalType;
  userId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
  nowMs?: number;
  persistAudit?: boolean;
}): Promise<SecurityAbuseEventRecord> {
  const nowMs = params.nowMs ?? Date.now();
  const actorKey = params.userId
    ? `user:${params.userId}`
    : `ip:${params.ipAddress || 'unknown'}`;
  const bucketKey = `${params.signalType}:${actorKey}`;
  const windowStart = nowMs - activeAbuseThresholds.windowMs;

  const entry = signalCounters.get(bucketKey) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  entry.timestamps.push(nowMs);
  signalCounters.set(bucketKey, entry);

  const countInWindow = entry.timestamps.length;
  const threshold = getThresholdForSignal(params.signalType);
  const flagged = countInWindow >= threshold;

  const sanitizedDetails = params.details
    ? (redactSensitiveData(params.details) as Record<string, unknown>)
    : undefined;

  const record: SecurityAbuseEventRecord = {
    id: `abuse-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    signalType: params.signalType,
    actorKey,
    userId: params.userId || null,
    ipAddress: params.ipAddress || null,
    countInWindow,
    threshold,
    flagged,
    actionTaken:
      countInWindow >= threshold * 2
        ? 'TEMPORARY_THROTTLE_APPLIED'
        : 'LOGGED_AND_FLAGGED_FOR_ADMIN_REVIEW',
    details: sanitizedDetails,
    createdAt: new Date(nowMs).toISOString(),
  };

  if (flagged) {
    recentAbuseFlags.unshift(record);
    if (recentAbuseFlags.length > MAX_RECENT_ABUSE_FLAGS) {
      recentAbuseFlags.length = MAX_RECENT_ABUSE_FLAGS;
    }

    if (params.persistAudit !== false) {
      await createAuditLog({
        userId: params.userId || null,
        action: 'SECURITY_ABUSE_SIGNAL_FLAGGED',
        entityType: 'SecuritySignal',
        entityId: record.id,
        details: {
          signalType: record.signalType,
          actorKey: record.actorKey,
          countInWindow: record.countInWindow,
          threshold: record.threshold,
          actionTaken: record.actionTaken,
          ...sanitizedDetails,
        },
        ipAddress: params.ipAddress || null,
      }).catch(() => undefined);
    }
  }

  return record;
}

/**
 * Returns all flagged deterministic abuse signals for Admin Observability & Alerting.
 */
export function getFlaggedAbuseSignals(limit = 50): SecurityAbuseEventRecord[] {
  return recentAbuseFlags.slice(0, Math.max(1, Math.min(250, limit)));
}

/**
 * Clears in-memory abuse detection counters for isolated tests.
 */
export function clearAbuseStateForTests(): void {
  signalCounters.clear();
  recentAbuseFlags.length = 0;
  activeAbuseThresholds = { ...DEFAULT_ABUSE_THRESHOLDS };
}

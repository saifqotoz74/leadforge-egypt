import { logStructured } from './logger';
import { redactSensitiveData } from '@/lib/security/error-taxonomy';

export interface SlowQueryRecord {
  id: string;
  operation: string;
  model?: string | null;
  durationMs: number;
  thresholdMs: number;
  requestId?: string | null;
  sanitizedMeta?: Record<string, unknown>;
  recordedAt: string;
}

export interface AlertThresholdsConfig {
  errorRatePctThreshold: number;
  minRequestsForErrorRateAlert: number;
  failedClaimsAlertThreshold: number;
  openCircuitSourcesAlertThreshold: number;
  slowQueriesAlertThreshold: number;
  refundRatePctAlertThreshold: number;
  minClaimsForRefundRateAlert: number;
  deadLetterBacklogAlertThreshold: number;
  abuseSignalsAlertThreshold: number;
  slowQueryDurationThresholdMs: number;
}

export const DEFAULT_ALERT_THRESHOLDS: Readonly<AlertThresholdsConfig> = Object.freeze({
  errorRatePctThreshold: 10, // >= 10% 5xx error rate
  minRequestsForErrorRateAlert: 5,
  failedClaimsAlertThreshold: 5,
  openCircuitSourcesAlertThreshold: 1,
  slowQueriesAlertThreshold: 3,
  refundRatePctAlertThreshold: 25,
  minClaimsForRefundRateAlert: 4,
  deadLetterBacklogAlertThreshold: 10,
  abuseSignalsAlertThreshold: 1,
  slowQueryDurationThresholdMs: 250,
});

export interface OperationalAlert {
  id: string;
  code:
    | 'HIGH_ERROR_RATE'
    | 'REPEATED_FAILED_CLAIMS'
    | 'INGESTION_SOURCE_CIRCUIT_OPEN'
    | 'SLOW_QUERY_SPIKE'
    | 'HIGH_REFUND_RATE'
    | 'DEAD_LETTER_BACKLOG_GROWTH'
    | 'DATA_INTEGRITY_VIOLATION'
    | 'SECURITY_ABUSE_FLAGGED';
  severity: 'WARNING' | 'CRITICAL';
  title: string;
  observedValue: number;
  thresholdValue: number;
  details: Record<string, unknown>;
  triggeredAt: string;
}

let activeAlertThresholds: AlertThresholdsConfig = { ...DEFAULT_ALERT_THRESHOLDS };

const requestDurations: number[] = [];
const MAX_DURATION_SAMPLES = 1000;

let totalRequestsCount = 0;
let status2xxCount = 0;
let status4xxCount = 0;
let status5xxCount = 0;
let rateLimitHitsCount = 0;

let claimSuccessCount = 0;
let claimFailureCount = 0;
let claimConflictCount = 0;
let creditTransactionsCount = 0;
let refundsProcessedCount = 0;

const recentSlowQueries: SlowQueryRecord[] = [];
const MAX_SLOW_QUERIES = 200;

export function getAlertThresholds(): AlertThresholdsConfig {
  return { ...activeAlertThresholds };
}

export function updateAlertThresholds(
  partial: Partial<AlertThresholdsConfig>
): AlertThresholdsConfig {
  activeAlertThresholds = {
    errorRatePctThreshold:
      typeof partial.errorRatePctThreshold === 'number' && partial.errorRatePctThreshold >= 0
        ? partial.errorRatePctThreshold
        : activeAlertThresholds.errorRatePctThreshold,
    minRequestsForErrorRateAlert:
      typeof partial.minRequestsForErrorRateAlert === 'number' &&
      partial.minRequestsForErrorRateAlert >= 1
        ? Math.floor(partial.minRequestsForErrorRateAlert)
        : activeAlertThresholds.minRequestsForErrorRateAlert,
    failedClaimsAlertThreshold:
      typeof partial.failedClaimsAlertThreshold === 'number' &&
      partial.failedClaimsAlertThreshold >= 1
        ? Math.floor(partial.failedClaimsAlertThreshold)
        : activeAlertThresholds.failedClaimsAlertThreshold,
    openCircuitSourcesAlertThreshold:
      typeof partial.openCircuitSourcesAlertThreshold === 'number' &&
      partial.openCircuitSourcesAlertThreshold >= 1
        ? Math.floor(partial.openCircuitSourcesAlertThreshold)
        : activeAlertThresholds.openCircuitSourcesAlertThreshold,
    slowQueriesAlertThreshold:
      typeof partial.slowQueriesAlertThreshold === 'number' &&
      partial.slowQueriesAlertThreshold >= 1
        ? Math.floor(partial.slowQueriesAlertThreshold)
        : activeAlertThresholds.slowQueriesAlertThreshold,
    refundRatePctAlertThreshold:
      typeof partial.refundRatePctAlertThreshold === 'number' &&
      partial.refundRatePctAlertThreshold >= 0
        ? partial.refundRatePctAlertThreshold
        : activeAlertThresholds.refundRatePctAlertThreshold,
    minClaimsForRefundRateAlert:
      typeof partial.minClaimsForRefundRateAlert === 'number' &&
      partial.minClaimsForRefundRateAlert >= 1
        ? Math.floor(partial.minClaimsForRefundRateAlert)
        : activeAlertThresholds.minClaimsForRefundRateAlert,
    deadLetterBacklogAlertThreshold:
      typeof partial.deadLetterBacklogAlertThreshold === 'number' &&
      partial.deadLetterBacklogAlertThreshold >= 1
        ? Math.floor(partial.deadLetterBacklogAlertThreshold)
        : activeAlertThresholds.deadLetterBacklogAlertThreshold,
    abuseSignalsAlertThreshold:
      typeof partial.abuseSignalsAlertThreshold === 'number' &&
      partial.abuseSignalsAlertThreshold >= 1
        ? Math.floor(partial.abuseSignalsAlertThreshold)
        : activeAlertThresholds.abuseSignalsAlertThreshold,
    slowQueryDurationThresholdMs:
      typeof partial.slowQueryDurationThresholdMs === 'number' &&
      partial.slowQueryDurationThresholdMs >= 1
        ? Math.floor(partial.slowQueryDurationThresholdMs)
        : activeAlertThresholds.slowQueryDurationThresholdMs,
  };
  return getAlertThresholds();
}

export function recordHttpRequestMetric(params: {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestId?: string;
}): void {
  totalRequestsCount += 1;
  const dur = Math.max(0, Math.round(params.durationMs));
  requestDurations.push(dur);
  if (requestDurations.length > MAX_DURATION_SAMPLES) {
    requestDurations.shift();
  }

  if (params.statusCode >= 200 && params.statusCode < 400) {
    status2xxCount += 1;
  } else if (params.statusCode >= 400 && params.statusCode < 500) {
    status4xxCount += 1;
    if (params.statusCode === 429) {
      rateLimitHitsCount += 1;
    }
  } else if (params.statusCode >= 500) {
    status5xxCount += 1;
  }
}

export function recordClaimMetric(outcome: 'SUCCESS' | 'FAILED' | 'CONFLICT'): void {
  if (outcome === 'SUCCESS') {
    claimSuccessCount += 1;
  } else if (outcome === 'CONFLICT') {
    claimConflictCount += 1;
    claimFailureCount += 1;
  } else {
    claimFailureCount += 1;
  }
}

export function recordCreditTransactionMetric(isRefund = false): void {
  creditTransactionsCount += 1;
  if (isRefund) {
    refundsProcessedCount += 1;
  }
}

/**
 * Records a database or service query execution time and detects slow queries exceeding threshold.
 * Never logs raw sensitive query parameters.
 */
export function recordQueryExecution(params: {
  operation: string;
  model?: string | null;
  durationMs: number;
  requestId?: string | null;
  meta?: Record<string, unknown>;
  customThresholdMs?: number;
}): { isSlow: boolean; record?: SlowQueryRecord } {
  const thresholdMs =
    params.customThresholdMs ?? activeAlertThresholds.slowQueryDurationThresholdMs;
  const durationMs = Math.max(0, Math.round(params.durationMs));

  if (durationMs < thresholdMs) {
    return { isSlow: false };
  }

  const sanitizedMeta = params.meta
    ? (redactSensitiveData(params.meta) as Record<string, unknown>)
    : undefined;

  const slowRecord: SlowQueryRecord = {
    id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    operation: params.operation,
    model: params.model ?? null,
    durationMs,
    thresholdMs,
    requestId: params.requestId ?? null,
    sanitizedMeta,
    recordedAt: new Date().toISOString(),
  };

  recentSlowQueries.unshift(slowRecord);
  if (recentSlowQueries.length > MAX_SLOW_QUERIES) {
    recentSlowQueries.length = MAX_SLOW_QUERIES;
  }

  logStructured({
    level: 'WARN',
    event: 'SLOW_QUERY_DETECTED',
    requestId: params.requestId ?? undefined,
    durationMs,
    message: `Slow query detected in ${params.operation} (${durationMs}ms >= ${thresholdMs}ms)`,
    metadata: {
      operation: params.operation,
      model: params.model ?? null,
      thresholdMs,
      ...sanitizedMeta,
    },
  });

  return { isSlow: true, record: slowRecord };
}

/**
 * Wraps an async database/service operation with automatic timing and slow-query detection.
 */
export async function withSlowQueryTracking<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: {
    model?: string;
    requestId?: string;
    meta?: Record<string, unknown>;
    customThresholdMs?: number;
  }
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - start;
    recordQueryExecution({
      operation,
      model: options?.model,
      durationMs,
      requestId: options?.requestId,
      meta: options?.meta,
      customThresholdMs: options?.customThresholdMs,
    });
  }
}

export function getRecentSlowQueries(limit = 50): SlowQueryRecord[] {
  return recentSlowQueries.slice(0, Math.max(1, Math.min(200, limit)));
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function getOperationalMetricsSnapshot() {
  const sorted = [...requestDurations].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avgMs = sorted.length > 0 ? Math.round((sum / sorted.length) * 100) / 100 : 0;
  const errorRatePct =
    totalRequestsCount > 0
      ? Math.round((status5xxCount / totalRequestsCount) * 10000) / 100
      : 0;

  return {
    requests: {
      total: totalRequestsCount,
      status2xx: status2xxCount,
      status4xx: status4xxCount,
      status5xx: status5xxCount,
      rateLimitHits: rateLimitHitsCount,
      errorRatePct,
      latencyMs: {
        samples: sorted.length,
        avg: avgMs,
        p50: computePercentile(sorted, 50),
        p95: computePercentile(sorted, 95),
        p99: computePercentile(sorted, 99),
        max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      },
    },
    claimsAndCredits: {
      claimSuccessCount,
      claimFailureCount,
      claimConflictCount,
      creditTransactionsCount,
      refundsProcessedCount,
    },
    slowQueries: {
      thresholdMs: activeAlertThresholds.slowQueryDurationThresholdMs,
      totalDetected: recentSlowQueries.length,
      recent: recentSlowQueries.slice(0, 20),
    },
  };
}

/**
 * Evaluates configurable deterministic alert conditions against runtime & database metrics (Section 40).
 */
export function evaluateOperationalAlerts(context: {
  openCircuitSourcesCount?: number;
  deadLetterBacklogCount?: number;
  totalActiveClaimsCount?: number;
  totalRefundedClaimsCount?: number;
  integrityViolationsCount?: number;
  flaggedAbuseSignalsCount?: number;
} = {}): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  const snap = getOperationalMetricsSnapshot();
  const nowIso = new Date().toISOString();

  // 1. High Error Rate Alert
  if (
    snap.requests.total >= activeAlertThresholds.minRequestsForErrorRateAlert &&
    snap.requests.errorRatePct >= activeAlertThresholds.errorRatePctThreshold
  ) {
    alerts.push({
      id: `alert-error-rate`,
      code: 'HIGH_ERROR_RATE',
      severity: snap.requests.errorRatePct >= 25 ? 'CRITICAL' : 'WARNING',
      title: 'High API 5xx Error Rate Detected',
      observedValue: snap.requests.errorRatePct,
      thresholdValue: activeAlertThresholds.errorRatePctThreshold,
      details: {
        totalRequests: snap.requests.total,
        status5xx: snap.requests.status5xx,
      },
      triggeredAt: nowIso,
    });
  }

  // 2. Repeated Failed Claims Alert
  if (snap.claimsAndCredits.claimFailureCount >= activeAlertThresholds.failedClaimsAlertThreshold) {
    alerts.push({
      id: `alert-failed-claims`,
      code: 'REPEATED_FAILED_CLAIMS',
      severity: 'WARNING',
      title: 'Elevated Failed Lead Claim Attempts',
      observedValue: snap.claimsAndCredits.claimFailureCount,
      thresholdValue: activeAlertThresholds.failedClaimsAlertThreshold,
      details: {
        claimFailureCount: snap.claimsAndCredits.claimFailureCount,
        claimConflictCount: snap.claimsAndCredits.claimConflictCount,
      },
      triggeredAt: nowIso,
    });
  }

  // 3. Ingestion Source Circuit Open Alert
  const openCircuits = context.openCircuitSourcesCount ?? 0;
  if (openCircuits >= activeAlertThresholds.openCircuitSourcesAlertThreshold) {
    alerts.push({
      id: `alert-open-circuits`,
      code: 'INGESTION_SOURCE_CIRCUIT_OPEN',
      severity: 'CRITICAL',
      title: 'Ingestion Source Circuit Breaker Open',
      observedValue: openCircuits,
      thresholdValue: activeAlertThresholds.openCircuitSourcesAlertThreshold,
      details: { openCircuitSourcesCount: openCircuits },
      triggeredAt: nowIso,
    });
  }

  // 4. Slow Query Spike Alert
  if (recentSlowQueries.length >= activeAlertThresholds.slowQueriesAlertThreshold) {
    alerts.push({
      id: `alert-slow-queries`,
      code: 'SLOW_QUERY_SPIKE',
      severity: 'WARNING',
      title: 'Slow Database Query Spike Detected',
      observedValue: recentSlowQueries.length,
      thresholdValue: activeAlertThresholds.slowQueriesAlertThreshold,
      details: {
        thresholdMs: activeAlertThresholds.slowQueryDurationThresholdMs,
        slowQueryCount: recentSlowQueries.length,
      },
      triggeredAt: nowIso,
    });
  }

  // 5. High Refund Rate Alert
  const totalClaims =
    (context.totalActiveClaimsCount ?? snap.claimsAndCredits.claimSuccessCount) +
    (context.totalRefundedClaimsCount ?? snap.claimsAndCredits.refundsProcessedCount);
  const refundedClaims =
    context.totalRefundedClaimsCount ?? snap.claimsAndCredits.refundsProcessedCount;
  if (totalClaims >= activeAlertThresholds.minClaimsForRefundRateAlert) {
    const refundRatePct = Math.round((refundedClaims / totalClaims) * 10000) / 100;
    if (refundRatePct >= activeAlertThresholds.refundRatePctAlertThreshold) {
      alerts.push({
        id: `alert-refund-rate`,
        code: 'HIGH_REFUND_RATE',
        severity: 'WARNING',
        title: 'High Lead Claim Refund Rate',
        observedValue: refundRatePct,
        thresholdValue: activeAlertThresholds.refundRatePctAlertThreshold,
        details: {
          refundedClaims,
          totalClaims,
          refundRatePct,
        },
        triggeredAt: nowIso,
      });
    }
  }

  // 6. Dead-Letter Backlog Growth Alert
  const dlqCount = context.deadLetterBacklogCount ?? 0;
  if (dlqCount >= activeAlertThresholds.deadLetterBacklogAlertThreshold) {
    alerts.push({
      id: `alert-dlq-backlog`,
      code: 'DEAD_LETTER_BACKLOG_GROWTH',
      severity: 'WARNING',
      title: 'Ingestion Dead-Letter Queue Backlog Exceeds Threshold',
      observedValue: dlqCount,
      thresholdValue: activeAlertThresholds.deadLetterBacklogAlertThreshold,
      details: { deadLetterBacklogCount: dlqCount },
      triggeredAt: nowIso,
    });
  }

  // 7. Data Integrity Violation Alert
  const integrityViolations = context.integrityViolationsCount ?? 0;
  if (integrityViolations >= 1) {
    alerts.push({
      id: `alert-integrity-violation`,
      code: 'DATA_INTEGRITY_VIOLATION',
      severity: 'CRITICAL',
      title: 'Database Integrity Invariant Violation Detected',
      observedValue: integrityViolations,
      thresholdValue: 1,
      details: { integrityViolationsCount: integrityViolations },
      triggeredAt: nowIso,
    });
  }

  // 8. Security Abuse Signals Alert
  const abuseCount = context.flaggedAbuseSignalsCount ?? 0;
  if (abuseCount >= activeAlertThresholds.abuseSignalsAlertThreshold) {
    alerts.push({
      id: `alert-security-abuse`,
      code: 'SECURITY_ABUSE_FLAGGED',
      severity: 'WARNING',
      title: 'Deterministic Security Abuse Signals Flagged for Review',
      observedValue: abuseCount,
      thresholdValue: activeAlertThresholds.abuseSignalsAlertThreshold,
      details: { flaggedAbuseSignalsCount: abuseCount },
      triggeredAt: nowIso,
    });
  }

  return alerts;
}

const customCounters = new Map<string, number>();

export function incrementCounter(counterName: string, delta = 1): number {
  const current = customCounters.get(counterName) || 0;
  const next = current + delta;
  customCounters.set(counterName, next);
  return next;
}

export function getCustomCounters(): Record<string, number> {
  return Object.fromEntries(customCounters.entries());
}

export function recordLatencyMetric(
  routeOrOperation: string,
  durationMs: number,
  statusCode = 200
): void {
  recordHttpRequestMetric({
    route: routeOrOperation,
    method: 'INTERNAL',
    statusCode,
    durationMs,
  });
}

export function resetMetricsForTests(): void {
  requestDurations.length = 0;
  totalRequestsCount = 0;
  status2xxCount = 0;
  status4xxCount = 0;
  status5xxCount = 0;
  rateLimitHitsCount = 0;
  claimSuccessCount = 0;
  claimFailureCount = 0;
  claimConflictCount = 0;
  creditTransactionsCount = 0;
  refundsProcessedCount = 0;
  recentSlowQueries.length = 0;
  customCounters.clear();
  activeAlertThresholds = { ...DEFAULT_ALERT_THRESHOLDS };
}

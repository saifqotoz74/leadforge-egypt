import {
  CircuitBreakerConfig,
  CircuitBreakerState,
  IngestionError,
  IngestionErrorCode,
  RetryPolicyConfig,
} from './types';
import { logIngestionEvent } from './logger';

// ============================================================================
// 1. RETRY CLASSIFICATION & EXPONENTIAL BACKOFF WITH JITTER (Sections 17, 18)
// ============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  jitterFactor: 0.15,
};

/**
 * Classifies any thrown error into a deterministic IngestionError with retryability flags.
 * Transient errors (timeouts, 429, 5xx, temporary network/db lock) -> retryable: true
 * Permanent errors (400, 401, 403, 404, invalid credentials, policy violation, SSRF, schema invalid) -> retryable: false
 */
export function classifyIngestionError(error: unknown): IngestionError {
  if (error instanceof IngestionError) {
    return error;
  }

  const errObj = error as {
    message?: string;
    code?: string;
    status?: number;
    statusCode?: number;
    retryable?: boolean;
  };
  const message = errObj?.message || String(error || 'Unknown ingestion error');
  const status = errObj?.status ?? errObj?.statusCode;
  const lowerMsg = message.toLowerCase();

  // Check explicit HTTP status codes first
  if (status === 429 || lowerMsg.includes('429') || lowerMsg.includes('rate limit')) {
    return new IngestionError(message, 'SOURCE_RATE_LIMITED', {
      statusCode: 429,
      retryable: true,
    });
  }

  if (status === 401 || status === 403 || lowerMsg.includes('invalid credential') || lowerMsg.includes('unauthorized') || lowerMsg.includes('forbidden')) {
    return new IngestionError(message, 'INVALID_SOURCE_CONFIGURATION', {
      statusCode: status || 401,
      retryable: false,
    });
  }

  if (status && status >= 400 && status < 500) {
    return new IngestionError(message, 'INVALID_SOURCE_RECORD', {
      statusCode: status,
      retryable: false,
    });
  }

  if (status === 504 || lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('etimedout') || lowerMsg.includes('abort')) {
    return new IngestionError(message, 'SOURCE_TIMEOUT', {
      statusCode: 504,
      retryable: true,
    });
  }

  if (
    (status && status >= 500) ||
    lowerMsg.includes('500') ||
    lowerMsg.includes('502') ||
    lowerMsg.includes('503') ||
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('temporary') ||
    lowerMsg.includes('unavailable')
  ) {
    return new IngestionError(message, 'SOURCE_UNAVAILABLE', {
      statusCode: status || 503,
      retryable: true,
    });
  }

  if (lowerMsg.includes('ssrf') || lowerMsg.includes('blocked')) {
    return new IngestionError(message, 'SSRF_BLOCKED', {
      statusCode: 403,
      retryable: false,
    });
  }

  if (lowerMsg.includes('policy')) {
    return new IngestionError(message, 'POLICY_RESTRICTION', {
      statusCode: 403,
      retryable: false,
    });
  }

  if (lowerMsg.includes('schema') || lowerMsg.includes('malformed')) {
    return new IngestionError(message, 'SCHEMA_VALIDATION_FAILED', {
      statusCode: 400,
      retryable: false,
    });
  }

  if (errObj?.retryable === true) {
    return new IngestionError(message, 'SOURCE_UNAVAILABLE', {
      statusCode: 503,
      retryable: true,
    });
  }

  if (errObj?.retryable === false) {
    return new IngestionError(message, 'INVALID_SOURCE_RECORD', {
      statusCode: 400,
      retryable: false,
    });
  }

  return new IngestionError(message, 'SOURCE_UNAVAILABLE', {
    statusCode: 500,
    retryable: true,
  });
}

export function isRetryableIngestionError(error: unknown): boolean {
  return classifyIngestionError(error).retryable;
}

/**
 * Computes bounded exponential backoff delay in milliseconds:
 * baseDelayMs * 2^(attempt - 1), capped at maxDelayMs, with optional jitter.
 * Example (base=1000, max=16000, jitter=0):
 * attempt 1 -> 1000ms (1s)
 * attempt 2 -> 2000ms (2s)
 * attempt 3 -> 4000ms (4s)
 * attempt 4 -> 8000ms (8s)
 * attempt 5 -> 16000ms (16s)
 */
export function computeExponentialBackoffMs(
  attempt: number,
  policy: Partial<RetryPolicyConfig> = {},
  deterministicSeed?: number
): number {
  const baseDelayMs = Math.max(0, policy.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs);
  const maxDelayMs = Math.max(baseDelayMs, policy.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs);
  const jitterFactor = Math.max(0, Math.min(0.5, policy.jitterFactor ?? 0));

  const exponent = Math.max(0, attempt - 1);
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, exponent));

  if (jitterFactor === 0 || exponential === 0) {
    return Math.round(exponential);
  }

  const rand =
    deterministicSeed !== undefined
      ? Math.abs(Math.sin(deterministicSeed + attempt)) % 1
      : Math.random();
  const jitterOffset = exponential * jitterFactor * rand;
  return Math.min(maxDelayMs, Math.round(exponential + jitterOffset));
}

export interface RetryExecutionResult<T> {
  result: T;
  attempts: number;
  retryCount: number;
  totalDelayMs: number;
}

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    policy?: Partial<RetryPolicyConfig>;
    sourceName?: string;
    collectorVersion?: string;
    jobId?: string;
    externalId?: string | null;
    sleepFn?: (ms: number) => Promise<void>;
  } = {}
): Promise<RetryExecutionResult<T>> {
  const maxRetries = Math.max(0, options.policy?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries);
  const sleep =
    options.sleepFn ??
    ((ms: number) =>
      ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;
  let totalDelayMs = 0;
  let lastClassifiedError: IngestionError | null = null;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const value = await operation(attempt);
      return {
        result: value,
        attempts: attempt,
        retryCount: attempt - 1,
        totalDelayMs,
      };
    } catch (rawErr) {
      const classified = classifyIngestionError(rawErr);
      lastClassifiedError = classified;

      // Never retry permanent errors (400, invalid credentials, policy violation, SSRF, etc.)
      if (!classified.retryable) {
        logIngestionEvent({
          event: 'NON_RETRYABLE_FAILURE',
          jobId: options.jobId,
          source: options.sourceName || 'UNKNOWN',
          collectorVersion: options.collectorVersion || 'v1',
          externalId: options.externalId,
          stage: 'RETRY',
          status: 'FAILED',
          errorCode: classified.code,
          message: `Permanent failure (attempt ${attempt}): ${classified.message}`,
        });
        throw classified;
      }

      if (attempt > maxRetries) {
        break;
      }

      const delayMs = computeExponentialBackoffMs(attempt, options.policy);
      totalDelayMs += delayMs;

      logIngestionEvent({
        event: 'TRANSIENT_FAILURE_RETRYING',
        jobId: options.jobId,
        source: options.sourceName || 'UNKNOWN',
        collectorVersion: options.collectorVersion || 'v1',
        externalId: options.externalId,
        stage: 'RETRY',
        status: 'WARNING',
        errorCode: classified.code,
        durationMs: delayMs,
        message: `Retry ${attempt}/${maxRetries} scheduled in ${delayMs}ms after ${classified.code}: ${classified.message}`,
      });

      await sleep(delayMs);
    }
  }

  throw new IngestionError(
    `Retry exhausted after ${maxRetries} retries: ${lastClassifiedError?.message || 'Transient failure'}`,
    'RETRY_EXHAUSTED',
    {
      statusCode: lastClassifiedError?.statusCode || 503,
      retryable: false,
      details: {
        originalErrorCode: lastClassifiedError?.code || ('SOURCE_UNAVAILABLE' as IngestionErrorCode),
        originalMessage: lastClassifiedError?.message,
        attempts: attempt,
        maxRetries,
        totalDelayMs,
      },
    }
  );
}

// ============================================================================
// 2. PER-SOURCE RATE LIMITER & CONCURRENCY CONTROL (Sections 19, 82)
// ============================================================================

interface SourceRateState {
  windowStartMs: number;
  requestsInWindow: number;
  activeConcurrent: number;
}

const sourceRateMap = new Map<string, SourceRateState>();

export class SourceRateLimiter {
  static acquireSlot(
    sourceKey: string,
    limits: {
      requestsPerMinute?: number;
      maxConcurrentRequests?: number;
      nowMs?: number;
    } = {}
  ): { allowed: boolean; reason?: string; remainingInWindow: number } {
    const now = limits.nowMs ?? Date.now();
    const maxRpm = Math.max(1, limits.requestsPerMinute ?? 60);
    const maxConc = Math.max(1, limits.maxConcurrentRequests ?? 2);

    let state = sourceRateMap.get(sourceKey);
    if (!state || now - state.windowStartMs >= 60_000) {
      state = {
        windowStartMs: now,
        requestsInWindow: 0,
        activeConcurrent: state?.activeConcurrent ?? 0,
      };
      sourceRateMap.set(sourceKey, state);
    }

    if (state.activeConcurrent >= maxConc) {
      return {
        allowed: false,
        reason: `Source "${sourceKey}" reached maxConcurrentRequests (${maxConc})`,
        remainingInWindow: Math.max(0, maxRpm - state.requestsInWindow),
      };
    }

    if (state.requestsInWindow >= maxRpm) {
      return {
        allowed: false,
        reason: `Source "${sourceKey}" reached requestsPerMinute limit (${maxRpm}/min)`,
        remainingInWindow: 0,
      };
    }

    state.requestsInWindow += 1;
    state.activeConcurrent += 1;
    return {
      allowed: true,
      remainingInWindow: Math.max(0, maxRpm - state.requestsInWindow),
    };
  }

  static releaseSlot(sourceKey: string): void {
    const state = sourceRateMap.get(sourceKey);
    if (state && state.activeConcurrent > 0) {
      state.activeConcurrent -= 1;
    }
  }

  static resetForTesting(): void {
    sourceRateMap.clear();
  }
}

// ============================================================================
// 3. DETERMINISTIC CIRCUIT BREAKER (Section 20)
// ============================================================================

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 60_000, // 1 minute cooldown before HALF_OPEN probe
};

export interface CircuitBreakerSnapshot {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  circuitOpenedAt: Date | null;
}

/**
 * Evaluates whether a source's circuit breaker allows execution right now:
 * - CLOSED -> allowed (state remains CLOSED)
 * - OPEN -> if cooldownMs has elapsed since circuitOpenedAt, transitions to HALF_OPEN and allows a probe;
 *           otherwise blocks with CIRCUIT_OPEN
 * - HALF_OPEN -> allowed for probe test
 */
export function evaluateCircuitBreakerBeforeRun(
  snapshot: CircuitBreakerSnapshot,
  config: Partial<CircuitBreakerConfig> = {},
  now = new Date()
): {
  allowed: boolean;
  nextState: CircuitBreakerState;
  reason?: string;
} {
  const cooldownMs = config.cooldownMs ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.cooldownMs;

  if (snapshot.state === 'CLOSED') {
    return { allowed: true, nextState: 'CLOSED' };
  }

  if (snapshot.state === 'HALF_OPEN') {
    return { allowed: true, nextState: 'HALF_OPEN' };
  }

  // State is OPEN
  if (!snapshot.circuitOpenedAt) {
    return { allowed: true, nextState: 'HALF_OPEN' };
  }

  const elapsedMs = now.getTime() - new Date(snapshot.circuitOpenedAt).getTime();
  if (elapsedMs >= cooldownMs) {
    return {
      allowed: true,
      nextState: 'HALF_OPEN',
      reason: `Cooldown of ${cooldownMs}ms elapsed; transitioning OPEN -> HALF_OPEN for probe test`,
    };
  }

  const remainingMs = cooldownMs - elapsedMs;
  return {
    allowed: false,
    nextState: 'OPEN',
    reason: `Circuit breaker is OPEN after ${snapshot.consecutiveFailures} consecutive failures. Cooldown remaining: ${remainingMs}ms`,
  };
}

/**
 * Computes the next circuit breaker state after an ingestion run completes or fails:
 * - On success:
 *   CLOSED or HALF_OPEN -> CLOSED (consecutiveFailures reset to 0, circuitOpenedAt = null)
 * - On failure:
 *   HALF_OPEN -> immediately re-opens to OPEN
 *   CLOSED -> increments consecutiveFailures; if >= failureThreshold, transitions to OPEN
 */
export function recordCircuitBreakerOutcome(
  current: CircuitBreakerSnapshot,
  succeeded: boolean,
  config: Partial<CircuitBreakerConfig> = {},
  now = new Date()
): CircuitBreakerSnapshot {
  const failureThreshold = Math.max(
    1,
    config.failureThreshold ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold
  );

  if (succeeded) {
    return {
      state: 'CLOSED',
      consecutiveFailures: 0,
      circuitOpenedAt: null,
    };
  }

  const nextFailures = current.consecutiveFailures + 1;
  if (current.state === 'HALF_OPEN' || nextFailures >= failureThreshold) {
    return {
      state: 'OPEN',
      consecutiveFailures: nextFailures,
      circuitOpenedAt: now,
    };
  }

  return {
    state: 'CLOSED',
    consecutiveFailures: nextFailures,
    circuitOpenedAt: null,
  };
}

// ============================================================================
// 4. ACTIVE JOB LOCKING & COOPERATIVE CANCELLATION (Sections 55, 56, 57)
// ============================================================================

const activeSourceJobs = new Map<string, string>(); // sourceKey -> jobId
const cancelledJobIds = new Set<string>();

export function acquireSourceJobLock(sourceKey: string, jobId: string): boolean {
  const normalizedKey = sourceKey.trim().toLowerCase();
  const existingJobId = activeSourceJobs.get(normalizedKey);
  if (existingJobId && existingJobId !== jobId) {
    return false;
  }
  activeSourceJobs.set(normalizedKey, jobId);
  return true;
}

export function releaseSourceJobLock(sourceKey: string, jobId?: string): void {
  const normalizedKey = sourceKey.trim().toLowerCase();
  const current = activeSourceJobs.get(normalizedKey);
  if (!jobId || current === jobId) {
    activeSourceJobs.delete(normalizedKey);
  }
}

export function getActiveSourceJobId(sourceKey: string): string | null {
  return activeSourceJobs.get(sourceKey.trim().toLowerCase()) || null;
}

export function requestJobCancellationInMemory(jobId: string): void {
  cancelledJobIds.add(jobId);
}

export function isJobCancelledInMemory(jobId: string): boolean {
  return cancelledJobIds.has(jobId);
}

export function clearJobCancellationState(jobId: string): void {
  cancelledJobIds.delete(jobId);
}

export function resetJobLocksForTesting(): void {
  activeSourceJobs.clear();
  cancelledJobIds.clear();
}

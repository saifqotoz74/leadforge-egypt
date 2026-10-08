import { PrismaClient } from '@prisma/client';
import { isProductionAuthSecretConfigured } from '@/lib/auth';
import { ensureDbReady, prisma as defaultPrisma } from '@/lib/db';
import { AppSecurityError } from '@/lib/security/error-taxonomy';
import { logStructured } from './logger';

let shuttingDown = false;
let shutdownInitiatedAt: string | null = null;
const activeOperations = new Set<string>();
const shutdownCallbacks: Array<() => Promise<void> | void> = [];

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function getActiveOperationsCount(): number {
  return activeOperations.size;
}

export function registerShutdownCallback(cb: () => Promise<void> | void): void {
  shutdownCallbacks.push(cb);
}

/**
 * Tracks an in-flight background job or critical operation so graceful shutdown can drain cleanly.
 * Rejects new operations when the process is shutting down.
 */
export async function trackActiveOperation<T>(
  operationId: string,
  fn: () => Promise<T>
): Promise<T> {
  if (shuttingDown) {
    throw new AppSecurityError(
      'SERVICE_UNAVAILABLE',
      'Service is currently shutting down and not accepting new jobs.',
      503
    );
  }
  activeOperations.add(operationId);
  try {
    return await fn();
  } finally {
    activeOperations.delete(operationId);
  }
}

/**
 * Initiates a deterministic graceful shutdown:
 * 1. Marks service as shutting down (readiness transitions to NOT_READY)
 * 2. Waits up to drainTimeoutMs for in-flight operations to finish
 * 3. Runs registered cleanup callbacks (lock release, cache flush, etc.)
 */
export async function initiateGracefulShutdown(options?: {
  drainTimeoutMs?: number;
  reason?: string;
}): Promise<{
  drainedCleanly: boolean;
  remainingOperations: number;
  durationMs: number;
}> {
  const startMs = Date.now();
  const drainTimeoutMs = options?.drainTimeoutMs ?? 5000;
  shuttingDown = true;
  shutdownInitiatedAt = new Date().toISOString();

  logStructured({
    level: 'INFO',
    event: 'GRACEFUL_SHUTDOWN_INITIATED',
    message: options?.reason || 'Graceful shutdown initiated',
    metadata: {
      activeOperationsCount: activeOperations.size,
      drainTimeoutMs,
    },
  });

  const pollIntervalMs = 25;
  while (activeOperations.size > 0 && Date.now() - startMs < drainTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  for (const cb of shutdownCallbacks) {
    try {
      await cb();
    } catch {
      // ignore cleanup callback errors during shutdown
    }
  }

  const remaining = activeOperations.size;
  const durationMs = Math.max(1, Date.now() - startMs);

  logStructured({
    level: remaining === 0 ? 'INFO' : 'WARN',
    event: 'GRACEFUL_SHUTDOWN_COMPLETED',
    durationMs,
    metadata: {
      drainedCleanly: remaining === 0,
      remainingOperations: remaining,
    },
  });

  return {
    drainedCleanly: remaining === 0,
    remainingOperations: remaining,
    durationMs,
  };
}

export function resetShutdownStateForTests(): void {
  shuttingDown = false;
  shutdownInitiatedAt = null;
  activeOperations.clear();
  shutdownCallbacks.length = 0;
}

export interface LivenessReport {
  status: 'ALIVE' | 'SHUTTING_DOWN';
  alive: boolean;
  uptimeSeconds: number;
  shuttingDown: boolean;
  shutdownInitiatedAt: string | null;
  activeOperations: number;
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  checkedAt: string;
}

export function evaluateLivenessCheck(): LivenessReport {
  const mem = process.memoryUsage();
  return {
    status: shuttingDown ? 'SHUTTING_DOWN' : 'ALIVE',
    alive: !shuttingDown,
    uptimeSeconds: Math.round(process.uptime()),
    shuttingDown,
    shutdownInitiatedAt,
    activeOperations: activeOperations.size,
    memoryUsageMb: {
      rss: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      heapTotal: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
      heapUsed: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
    },
    checkedAt: new Date().toISOString(),
  };
}

export interface ReadinessReport {
  status: 'READY' | 'NOT_READY';
  ready: boolean;
  environment: string;
  version: string;
  durationMs: number;
  checkedAt: string;
  checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number };
    configuration: { status: 'ok' | 'error' };
    processLifecycle: { status: 'ok' | 'error' };
    jobQueue: { status: 'ok' | 'error'; runningJobs?: number };
  };
  components: {
    processLifecycle: { status: 'HEALTHY' | 'UNHEALTHY'; reason?: string };
    configuration: { status: 'HEALTHY' | 'UNHEALTHY'; reason?: string };
    database: { status: 'HEALTHY' | 'UNHEALTHY'; latencyMs?: number; reason?: string };
    jobQueue: { status: 'HEALTHY' | 'UNHEALTHY'; runningJobs?: number; reason?: string };
  };
}

/**
 * Evaluates full readiness check across process lifecycle, required configuration, database connectivity, and job queue (Section 33).
 */
export async function evaluateReadinessCheck(
  customPrisma?: PrismaClient
): Promise<ReadinessReport> {
  const startMs = Date.now();
  const db = customPrisma || defaultPrisma;

  const components: ReadinessReport['components'] = {
    processLifecycle: shuttingDown
      ? { status: 'UNHEALTHY', reason: 'Service is shutting down' }
      : { status: 'HEALTHY' },
    configuration: { status: 'HEALTHY' },
    database: { status: 'HEALTHY' },
    jobQueue: { status: 'HEALTHY', runningJobs: 0 },
  };

  if (process.env.NODE_ENV === 'production' && !isProductionAuthSecretConfigured()) {
    components.configuration = {
      status: 'UNHEALTHY',
      reason: 'Missing or insecure required production secret configuration (AUTH_SECRET / JWT_SECRET)',
    };
  }

  const dbStart = Date.now();
  try {
    if (!customPrisma) {
      await ensureDbReady();
    }
    await db.user.count();
    components.database = {
      status: 'HEALTHY',
      latencyMs: Math.max(1, Date.now() - dbStart),
    };
  } catch {
    components.database = {
      status: 'UNHEALTHY',
      latencyMs: Math.max(1, Date.now() - dbStart),
      reason: 'Database connectivity check failed',
    };
  }

  if (components.database.status === 'HEALTHY') {
    try {
      const runningJobs = await db.importJob.count({
        where: { status: 'RUNNING' },
      });
      components.jobQueue = {
        status: 'HEALTHY',
        runningJobs,
      };
    } catch {
      components.jobQueue = {
        status: 'UNHEALTHY',
        reason: 'Job queue state check failed',
      };
    }
  } else {
    components.jobQueue = {
      status: 'UNHEALTHY',
      reason: 'Database unavailable for job queue verification',
    };
  }

  const ready =
    components.processLifecycle.status === 'HEALTHY' &&
    components.configuration.status === 'HEALTHY' &&
    components.database.status === 'HEALTHY' &&
    components.jobQueue.status === 'HEALTHY';

  return {
    status: ready ? 'READY' : 'NOT_READY',
    ready,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    durationMs: Math.max(1, Date.now() - startMs),
    checkedAt: new Date().toISOString(),
    checks: {
      database: {
        status: components.database.status === 'HEALTHY' ? 'ok' : 'error',
        latencyMs: components.database.latencyMs,
      },
      configuration: {
        status: components.configuration.status === 'HEALTHY' ? 'ok' : 'error',
      },
      processLifecycle: {
        status: components.processLifecycle.status === 'HEALTHY' ? 'ok' : 'error',
      },
      jobQueue: {
        status: components.jobQueue.status === 'HEALTHY' ? 'ok' : 'error',
        runningJobs: components.jobQueue.runningJobs,
      },
    },
    components,
  };
}

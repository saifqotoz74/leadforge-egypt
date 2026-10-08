import crypto from 'crypto';
import { redactSensitiveData } from '@/lib/security/error-taxonomy';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SECURITY' | 'AUDIT';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  event: string;
  userId?: string | null;
  role?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  ipAddress?: string | null;
  errorCode?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

const recentStructuredLogs: StructuredLogEntry[] = [];
const MAX_RECENT_LOGS = 500;

/**
 * Extracts an existing correlation ID from request headers or generates a deterministic/UUIDv4 request ID.
 */
export function getOrGenerateRequestId(headers?: Headers | Record<string, string | undefined> | null): string {
  if (headers) {
    let candidate: string | null | undefined = null;
    if (typeof (headers as Headers).get === 'function') {
      const h = headers as Headers;
      candidate =
        h.get('x-request-id') ||
        h.get('X-Request-Id') ||
        h.get('x-correlation-id') ||
        h.get('X-Correlation-Id');
    } else {
      const rec = headers as Record<string, string | undefined>;
      candidate =
        rec['x-request-id'] ||
        rec['X-Request-Id'] ||
        rec['x-correlation-id'] ||
        rec['X-Correlation-Id'];
    }
    if (candidate && /^[A-Za-z0-9._\-:]{4,128}$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return `req_${crypto.randomUUID()}`;
}

/**
 * Emits a structured, redacted log entry and stores it in the bounded ring buffer for admin observability.
 * Guarantees passwords, JWTs, API keys, cookies, and raw SQL/stack traces are never logged.
 */
export function logStructured(input: {
  level: LogLevel;
  event: string;
  requestId?: string | null;
  userId?: string | null;
  role?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  ipAddress?: string | null;
  errorCode?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}): StructuredLogEntry {
  const sanitizedMeta = input.metadata
    ? (redactSensitiveData(input.metadata) as Record<string, unknown>)
    : undefined;

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level: input.level,
    requestId: input.requestId || `req_${crypto.randomUUID()}`,
    event: input.event,
    userId: input.userId ?? null,
    role: input.role ?? null,
    route: input.route ?? null,
    method: input.method ?? null,
    statusCode: input.statusCode ?? null,
    durationMs:
      typeof input.durationMs === 'number' ? Math.max(0, Math.round(input.durationMs)) : null,
    ipAddress: input.ipAddress ?? null,
    errorCode: input.errorCode ?? null,
    message: input.message ? String(redactSensitiveData(input.message)) : null,
    ...(sanitizedMeta ? { metadata: sanitizedMeta } : {}),
  };

  recentStructuredLogs.unshift(entry);
  if (recentStructuredLogs.length > MAX_RECENT_LOGS) {
    recentStructuredLogs.length = MAX_RECENT_LOGS;
  }

  return entry;
}

export function getRecentStructuredLogs(options?: {
  level?: LogLevel;
  requestId?: string;
  limit?: number;
}): StructuredLogEntry[] {
  const limit = Math.max(1, Math.min(250, options?.limit ?? 50));
  return recentStructuredLogs
    .filter((entry) => {
      if (options?.level && entry.level !== options.level) return false;
      if (options?.requestId && entry.requestId !== options.requestId) return false;
      return true;
    })
    .slice(0, limit);
}

export function clearStructuredLogsForTests(): void {
  recentStructuredLogs.length = 0;
}

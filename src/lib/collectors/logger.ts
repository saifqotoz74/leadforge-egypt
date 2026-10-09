import { IngestionErrorCode } from './types';

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
  /oauth/i,
  /cookie/i,
  /session/i,
];

/**
 * Redacts passwords, API keys, OAuth secrets, and authentication tokens from objects before logging or persisting.
 */
export function redactSensitiveObject(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_FIELD_PATTERNS.some((rx) => rx.test(key))) {
      result[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      result[key] = redactSensitiveObject(val, depth + 1);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export interface StructuredIngestionLogEntry {
  timestamp: string;
  component: 'INGESTION_PIPELINE';
  event: string;
  jobId?: string | null;
  source: string;
  sourceId?: string | null;
  collectorVersion: string;
  externalId?: string | null;
  stage:
    | 'JOB_INIT'
    | 'DISCOVERY'
    | 'FETCH'
    | 'SCHEMA_VALIDATION'
    | 'NORMALIZATION'
    | 'DEDUPLICATION'
    | 'PERSISTENCE'
    | 'QUALITY_VERIFICATION'
    | 'SCORING'
    | 'MATCHING'
    | 'CHECKPOINT'
    | 'RETRY'
    | 'DEAD_LETTER'
    | 'CIRCUIT_BREAKER'
    | 'JOB_FINALIZE';
  status: 'STARTED' | 'SUCCESS' | 'WARNING' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
  durationMs?: number;
  errorCode?: IngestionErrorCode | null;
  message?: string;
  metadata?: Record<string, unknown>;
}

const recentIngestionLogs: StructuredIngestionLogEntry[] = [];
const MAX_IN_MEMORY_LOGS = 500;

export function logIngestionEvent(
  entry: Omit<StructuredIngestionLogEntry, 'timestamp' | 'component'>
): StructuredIngestionLogEntry {
  const sanitizedMetadata = entry.metadata
    ? (redactSensitiveObject(entry.metadata) as Record<string, unknown>)
    : undefined;

  const fullEntry: StructuredIngestionLogEntry = {
    timestamp: new Date().toISOString(),
    component: 'INGESTION_PIPELINE',
    ...entry,
    metadata: sanitizedMetadata,
  };

  recentIngestionLogs.unshift(fullEntry);
  if (recentIngestionLogs.length > MAX_IN_MEMORY_LOGS) {
    recentIngestionLogs.pop();
  }

  return fullEntry;
}

export function getRecentIngestionLogs(filter?: {
  jobId?: string;
  source?: string;
  limit?: number;
}): StructuredIngestionLogEntry[] {
  let list = recentIngestionLogs;
  if (filter?.jobId) {
    list = list.filter((l) => l.jobId === filter.jobId);
  }
  if (filter?.source) {
    list = list.filter((l) => l.source.toLowerCase() === filter.source!.toLowerCase());
  }
  return list.slice(0, filter?.limit ?? 100);
}

export function clearIngestionLogsForTesting(): void {
  recentIngestionLogs.length = 0;
}

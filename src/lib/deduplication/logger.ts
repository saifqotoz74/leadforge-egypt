import { DeduplicationDecision, DeduplicationSignal } from './types';

export interface DeduplicationLogEntry {
  event: 'DEDUPLICATION_EVALUATED' | 'POSSIBLE_DUPLICATE_FLAGGED' | 'DEDUPLICATION_CONFLICT';
  sourceRecordId?: string | null;
  source: string;
  decision: DeduplicationDecision;
  matchedLeadId: string | null;
  matchedSignals: Pick<DeduplicationSignal, 'type' | 'match' | 'strength'>[];
  durationMs: number;
  timestamp: string;
}

export interface MergeLogEntry {
  event: 'LEAD_MERGED' | 'LEAD_UNMERGED';
  mergeId: string;
  sourceLeadId?: string | null;
  sourceRecordId?: string | null;
  targetLeadId: string;
  reason: string;
  performedBy: string;
  durationMs?: number;
  timestamp: string;
}

const recentDeduplicationLogs: DeduplicationLogEntry[] = [];
const recentMergeLogs: MergeLogEntry[] = [];
const MAX_BUFFER_SIZE = 200;

export function logDeduplicationOperation(
  payload: Omit<DeduplicationLogEntry, 'timestamp'>
): DeduplicationLogEntry {
  const entry: DeduplicationLogEntry = {
    ...payload,
    timestamp: new Date().toISOString(),
  };

  recentDeduplicationLogs.unshift(entry);
  if (recentDeduplicationLogs.length > MAX_BUFFER_SIZE) {
    recentDeduplicationLogs.pop();
  }

  if (process.env.NODE_ENV !== 'test' || process.env.DEBUG_DEDUP === 'true') {
    console.info(JSON.stringify(entry));
  }

  return entry;
}

export function logMergeOperation(payload: Omit<MergeLogEntry, 'timestamp'>): MergeLogEntry {
  const entry: MergeLogEntry = {
    ...payload,
    timestamp: new Date().toISOString(),
  };

  recentMergeLogs.unshift(entry);
  if (recentMergeLogs.length > MAX_BUFFER_SIZE) {
    recentMergeLogs.pop();
  }

  if (process.env.NODE_ENV !== 'test' || process.env.DEBUG_DEDUP === 'true') {
    console.info(JSON.stringify(entry));
  }

  return entry;
}

export function getRecentDeduplicationLogs(limit = 50): DeduplicationLogEntry[] {
  return recentDeduplicationLogs.slice(0, limit);
}

export function getRecentMergeLogs(limit = 50): MergeLogEntry[] {
  return recentMergeLogs.slice(0, limit);
}

export function clearDeduplicationLogs(): void {
  recentDeduplicationLogs.length = 0;
  recentMergeLogs.length = 0;
}

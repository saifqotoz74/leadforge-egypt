/**
 * Lightweight client-side in-memory cache to prevent skeleton flash
 * during internal tab navigation across admin views (UX-018).
 *
 * Safety & Invariant Guarantees:
 * 1. Session Isolation: Bound to active userId; switching accounts wipes the store.
 * 2. Stale-Write Protection: Tracks request start timestamps and invalidation marks.
 *    Any in-flight response initiated BEFORE an invalidation or a newer write is rejected.
 * 3. Mutation Invalidation: Mutation handlers explicitly invalidate their cache prefixes.
 * 4. Server-Side Authorization: Purely client-side UI optimization; all backend endpoints
 *    enforce strict session tokens and `requireAdmin` independently.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId?: string | null;
  requestStartedAt?: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();
const invalidationMarks = new Map<string, number>();
let activeSessionUserId: string | null = null;
let globalInvalidationTime = 0;

/**
 * Binds the client cache to a specific user session.
 * If the user changes (e.g. login/logout/switch), all previous cache is immediately cleared.
 */
export function bindAdminCacheSession(userId: string | null): void {
  if (activeSessionUserId !== null && activeSessionUserId !== userId) {
    invalidateAdminCache();
  }
  activeSessionUserId = userId;
}

export function getActiveAdminCacheSession(): string | null {
  return activeSessionUserId;
}

export interface GetCachedAdminDataOptions {
  ttlMs?: number;
  userId?: string | null;
}

export function getCachedAdminData<T>(
  key: string,
  optionsOrTtl: number | GetCachedAdminDataOptions = 60_000
): T | null {
  const options: GetCachedAdminDataOptions =
    typeof optionsOrTtl === 'number' ? { ttlMs: optionsOrTtl } : optionsOrTtl;

  const ttlMs = options.ttlMs ?? 60_000;
  const currentUserId = options.userId !== undefined ? options.userId : activeSessionUserId;

  const entry = memoryStore.get(key);
  if (!entry) return null;

  // Account leakage protection: If entry was recorded for a different user, reject
  if (entry.userId && currentUserId && entry.userId !== currentUserId) {
    memoryStore.delete(key);
    return null;
  }

  // TTL expiration
  if (Date.now() - entry.timestamp > ttlMs) {
    memoryStore.delete(key);
    return null;
  }

  return entry.data as T;
}

export interface SetCachedAdminDataOptions {
  requestStartedAt?: number;
  userId?: string | null;
}

export function setCachedAdminData<T>(
  key: string,
  data: T,
  options?: SetCachedAdminDataOptions
): boolean {
  const requestStartedAt = options?.requestStartedAt ?? Date.now();
  const currentUserId = options?.userId !== undefined ? options?.userId : activeSessionUserId;

  // Stale-write check 1: Global invalidation happened after this request started
  if (requestStartedAt < globalInvalidationTime) {
    return false; // Stale write rejected
  }

  // Stale-write check 2: Key-specific prefix invalidation happened after this request started
  for (const [prefix, time] of invalidationMarks.entries()) {
    if (key.startsWith(prefix) && requestStartedAt < time) {
      return false; // Stale write rejected
    }
  }

  // Stale-write check 3: Existing entry has a newer request timestamp
  const existing = memoryStore.get(key);
  if (existing?.requestStartedAt && existing.requestStartedAt > requestStartedAt) {
    return false; // Stale write rejected
  }

  memoryStore.set(key, {
    data,
    timestamp: Date.now(),
    userId: currentUserId,
    requestStartedAt,
  });

  return true;
}

export function invalidateAdminCache(keyPrefix?: string): void {
  const now = Date.now();
  if (!keyPrefix) {
    memoryStore.clear();
    invalidationMarks.clear();
    globalInvalidationTime = now;
    return;
  }

  invalidationMarks.set(keyPrefix, now);
  for (const key of memoryStore.keys()) {
    if (key.startsWith(keyPrefix)) {
      memoryStore.delete(key);
    }
  }
}

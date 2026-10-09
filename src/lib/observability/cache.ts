import { AppSecurityError } from '@/lib/security/error-taxonomy';

export type CacheScopeType = 'GLOBAL' | 'ADMIN' | 'TENANT';

interface CacheEntry<T = unknown> {
  key: string;
  scope: CacheScopeType;
  tenantDeveloperId: string | null;
  value: T;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface CacheStats {
  entriesCount: number;
  hits: number;
  misses: number;
  invalidations: number;
  tenantIsolationBlocks: number;
  hitRatePct: number;
}

/**
 * Deterministic, Tenant-Isolated Cache (Section 31).
 * Strictly enforces tenant scope isolation so Developer A can never access Developer B's cached data.
 */
export class TenantAwareCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private hits = 0;
  private misses = 0;
  private invalidations = 0;
  private tenantIsolationBlocks = 0;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  private buildGlobalKey(namespace: string, subKey = 'default'): string {
    return `GLOBAL:${namespace}:${subKey}`;
  }

  private buildAdminKey(namespace: string, subKey = 'default'): string {
    return `ADMIN:${namespace}:${subKey}`;
  }

  private buildTenantKey(developerId: string, namespace: string, subKey = 'default'): string {
    const cleanDevId = (developerId || '').trim();
    if (!cleanDevId) {
      throw new AppSecurityError(
        'VALIDATION_ERROR',
        'Tenant cache operation requires a valid developerId.',
        400
      );
    }
    return `TENANT:${cleanDevId}:${namespace}:${subKey}`;
  }

  private evictIfNeeded(nowMs: number): void {
    if (this.store.size < this.maxEntries) return;
    for (const [k, entry] of this.store.entries()) {
      if (entry.expiresAtMs <= nowMs) {
        this.store.delete(k);
      }
    }
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
  }

  public getGlobal<T>(namespace: string, subKey = 'default', nowMs = Date.now()): T | null {
    const fullKey = this.buildGlobalKey(namespace, subKey);
    const entry = this.store.get(fullKey);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAtMs <= nowMs || entry.scope !== 'GLOBAL') {
      this.store.delete(fullKey);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value as T;
  }

  public setGlobal<T>(
    namespace: string,
    subKey: string,
    value: T,
    ttlMs = 30_000,
    nowMs = Date.now()
  ): void {
    this.evictIfNeeded(nowMs);
    const fullKey = this.buildGlobalKey(namespace, subKey);
    this.store.set(fullKey, {
      key: fullKey,
      scope: 'GLOBAL',
      tenantDeveloperId: null,
      value,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + Math.max(100, ttlMs),
    });
  }

  public getAdmin<T>(namespace: string, subKey = 'default', nowMs = Date.now()): T | null {
    const fullKey = this.buildAdminKey(namespace, subKey);
    const entry = this.store.get(fullKey);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAtMs <= nowMs || entry.scope !== 'ADMIN') {
      this.store.delete(fullKey);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value as T;
  }

  public setAdmin<T>(
    namespace: string,
    subKey: string,
    value: T,
    ttlMs = 15_000,
    nowMs = Date.now()
  ): void {
    this.evictIfNeeded(nowMs);
    const fullKey = this.buildAdminKey(namespace, subKey);
    this.store.set(fullKey, {
      key: fullKey,
      scope: 'ADMIN',
      tenantDeveloperId: null,
      value,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + Math.max(100, ttlMs),
    });
  }

  /**
   * Retrieves a tenant-scoped cache entry, verifying both the key prefix AND embedded tenantDeveloperId.
   */
  public getForTenant<T>(
    developerId: string,
    namespace: string,
    subKey = 'default',
    nowMs = Date.now()
  ): T | null {
    const cleanDevId = (developerId || '').trim();
    const fullKey = this.buildTenantKey(cleanDevId, namespace, subKey);
    const entry = this.store.get(fullKey);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAtMs <= nowMs) {
      this.store.delete(fullKey);
      this.misses += 1;
      return null;
    }
    if (entry.scope !== 'TENANT' || entry.tenantDeveloperId !== cleanDevId) {
      this.tenantIsolationBlocks += 1;
      this.store.delete(fullKey);
      throw new AppSecurityError(
        'FORBIDDEN',
        'Cross-tenant cache access blocked by tenant isolation guard.',
        403
      );
    }
    this.hits += 1;
    return entry.value as T;
  }

  public setForTenant<T>(
    developerId: string,
    namespace: string,
    subKey: string,
    value: T,
    ttlMs = 15_000,
    nowMs = Date.now()
  ): void {
    const cleanDevId = (developerId || '').trim();
    this.evictIfNeeded(nowMs);
    const fullKey = this.buildTenantKey(cleanDevId, namespace, subKey);
    this.store.set(fullKey, {
      key: fullKey,
      scope: 'TENANT',
      tenantDeveloperId: cleanDevId,
      value,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + Math.max(100, ttlMs),
    });
  }

  /**
   * Guard against direct key lookups across tenants: verifies caller identity matches entry scope.
   */
  public getRawEntryWithTenantCheck<T>(
    rawKey: string,
    caller: { role: 'ADMIN' | 'DEVELOPER'; userId: string },
    nowMs = Date.now()
  ): T | null {
    const entry = this.store.get(rawKey);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAtMs <= nowMs) {
      this.store.delete(rawKey);
      this.misses += 1;
      return null;
    }
    if (entry.scope === 'ADMIN' && caller.role !== 'ADMIN') {
      this.tenantIsolationBlocks += 1;
      throw new AppSecurityError(
        'FORBIDDEN',
        'Developer cannot read ADMIN-scoped cache entries.',
        403
      );
    }
    if (entry.scope === 'TENANT' && entry.tenantDeveloperId !== caller.userId && caller.role !== 'ADMIN') {
      this.tenantIsolationBlocks += 1;
      throw new AppSecurityError(
        'FORBIDDEN',
        'Cross-tenant cache access denied.',
        403
      );
    }
    this.hits += 1;
    return entry.value as T;
  }

  public invalidateByNamespace(namespace: string): number {
    let removed = 0;
    const token = `:${namespace}:`;
    for (const key of this.store.keys()) {
      if (key.includes(token)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    this.invalidations += removed;
    return removed;
  }

  public invalidateNamespace(namespace: string): number {
    return this.invalidateByNamespace(namespace);
  }

  public async getOrSet<T>(
    options: {
      namespace: string;
      tenantId?: string;
      key: string;
      ttlMs?: number;
    },
    factory: () => Promise<T>
  ): Promise<T> {
    const scopeTenant = (options.tenantId || 'GLOBAL').trim();
    if (scopeTenant === 'GLOBAL') {
      const cached = this.getGlobal<T>(options.namespace, options.key);
      if (cached !== null) return cached;
      const computed = await factory();
      this.setGlobal(options.namespace, options.key, computed, options.ttlMs ?? 30_000);
      return computed;
    }
    if (scopeTenant === 'ADMIN') {
      const cached = this.getAdmin<T>(options.namespace, options.key);
      if (cached !== null) return cached;
      const computed = await factory();
      this.setAdmin(options.namespace, options.key, computed, options.ttlMs ?? 15_000);
      return computed;
    }
    const cached = this.getForTenant<T>(scopeTenant, options.namespace, options.key);
    if (cached !== null) return cached;
    const computed = await factory();
    this.setForTenant(scopeTenant, options.namespace, options.key, computed, options.ttlMs ?? 15_000);
    return computed;
  }

  public invalidateTenant(developerId: string, namespace?: string): number {
    const cleanDevId = (developerId || '').trim();
    const prefix = namespace
      ? `TENANT:${cleanDevId}:${namespace}:`
      : `TENANT:${cleanDevId}:`;
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    this.invalidations += removed;
    return removed;
  }

  public clearAll(): void {
    this.invalidations += this.store.size;
    this.store.clear();
  }

  public clear(): void {
    this.clearAll();
  }

  public resetStatsForTests(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
    this.tenantIsolationBlocks = 0;
  }

  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      entriesCount: this.store.size,
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
      tenantIsolationBlocks: this.tenantIsolationBlocks,
      hitRatePct: total > 0 ? Math.round((this.hits / total) * 10000) / 100 : 0,
    };
  }
}

export const globalAppCache = new TenantAwareCache(1000);

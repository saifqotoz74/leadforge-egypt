interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export function pruneExpiredEntries(now: number = Date.now()): number {
  let prunedCount = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
      prunedCount++;
    }
  }
  return prunedCount;
}

export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();

  // Bounded store cleanup: prune expired entries when store grows to prevent unbounded memory usage
  if (rateLimitStore.size >= 1000) {
    pruneExpiredEntries(now);
    if (rateLimitStore.size >= 2000) {
      const keysToDelete = Array.from(rateLimitStore.entries())
        .sort((a, b) => a[1].resetAt - b[1].resetAt)
        .slice(0, rateLimitStore.size - 1500)
        .map(([k]) => k);
      for (const k of keysToDelete) {
        rateLimitStore.delete(k);
      }
    }
  }

  const existing = rateLimitStore.get(config.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(config.key, { count: 1, resetAt });
    const retryAfterSeconds = Math.max(1, Math.ceil(config.windowMs / 1000));
    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.max(0, config.limit - 1),
      resetAt,
      retryAfterSeconds,
    };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds,
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'Retry-After': String(result.retryAfterSeconds),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}

export function resetRateLimits() {
  rateLimitStore.clear();
}

export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    const ip = cfConnectingIp.split(',')[0].trim();
    if (ip) return ip;
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) {
    const ip = realIp.split(',')[0].trim();
    if (ip) return ip;
  }
  const forwarded = headers.get('x-forwarded-for')?.trim();
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }
  return '127.0.0.1';
}



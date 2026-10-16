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
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(config.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(config.key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt,
    };
  }

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: config.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

export function resetRateLimits() {
  rateLimitStore.clear();
}

export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp.split(',')[0].trim() || '127.0.0.1';
  }
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp.split(',')[0].trim() || '127.0.0.1';
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || '127.0.0.1';
  }
  return '127.0.0.1';
}


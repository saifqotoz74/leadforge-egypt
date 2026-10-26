import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  getRateLimitStoreSize,
  pruneExpiredEntries,
  resetRateLimits,
} from '@/lib/rate-limit';
import { POST as registerPost } from '@/app/api/auth/register/route';
import { GET as getLeadsRoute } from '@/app/api/leads/route';
import { POST as subscribePost } from '@/app/api/subscription/route';
import { DEFAULT_PLANS } from '@/lib/payment/provider';

describe('Phase 1B: Rate-Limiting Architecture & Safeguards Suite', () => {
  let prisma: PrismaClient;
  let pglite: PGlite;
  let cleanupDb: () => Promise<void>;

  let userA: { id: string; email: string; token: string };
  let userB: { id: string; email: string; token: string };
  let starterPlanId: string;
  let freePlanId: string;

  let origEnvNodeEnv: string | undefined;
  let origAuthSecret: string | undefined;

  function setNodeEnv(value: string | undefined) {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = value;
    }
  }

  beforeAll(async () => {
    origEnvNodeEnv = process.env.NODE_ENV;
    origAuthSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'strong-test-secret-at-least-32-chars-long!';

    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    pglite = testDb.pglite;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(prisma, pglite);

    // Seed default plans for subscription tests
    for (const planDef of DEFAULT_PLANS) {
      const plan = await prisma.plan.upsert({
        where: { slug: planDef.slug },
        update: planDef,
        create: planDef,
      });
      if (plan.slug === 'starter') starterPlanId = plan.id;
      if (plan.slug === 'free') freePlanId = plan.id;
    }

    const passwordHash = await hashPassword('TestUserPassword123!');

    // Create User A
    const createdA = await prisma.user.create({
      data: {
        name: 'User Alpha',
        email: 'alpha@rate-limit.test',
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
      },
    });
    const tokenA = await signSessionToken({
      id: createdA.id,
      email: createdA.email,
      name: createdA.name,
      role: createdA.role,
    });
    userA = { id: createdA.id, email: createdA.email, token: tokenA };

    // Create User B
    const createdB = await prisma.user.create({
      data: {
        name: 'User Beta',
        email: 'beta@rate-limit.test',
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
      },
    });
    const tokenB = await signSessionToken({
      id: createdB.id,
      email: createdB.email,
      name: createdB.name,
      role: createdB.role,
    });
    userB = { id: createdB.id, email: createdB.email, token: tokenB };

    // Seed at least one lead for GET /api/leads tests
    await prisma.lead.create({
      data: {
        businessName: 'Rate Limit Test Lead',
        normalizedName: 'rate limit test lead',
        phone: '01012345678',
        normalizedPhone: '01012345678',
        hasPhone: true,
        email: 'contact@leadtest.eg',
        normalizedEmail: 'contact@leadtest.eg',
        hasEmail: true,
        governorate: 'Cairo',
        city: 'القاهرة',
        category: 'Tech',
        status: 'AVAILABLE',
        score: 85,
        qualityScore: 90,
      },
    });
  });

  afterAll(async () => {
    setNodeEnv(origEnvNodeEnv);
    if (origAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = origAuthSecret;
    }
    await cleanupDb();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  afterEach(() => {
    setNodeEnv(origEnvNodeEnv);
    resetRateLimits();
  });

  function createAuthedJsonRequest(
    url: string,
    token: string | null,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
  ): NextRequest {
    const headers: Record<string, string> = {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...(token ? { authorization: `Bearer ${token}`, cookie: `leadforge_session=${token}` } : {}),
      ...(extraHeaders || {}),
    };
    if (body) {
      headers['content-type'] = 'application/json';
    }

    return new NextRequest(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  // =========================================================================
  // Pillar 1: In-Process Rate Limiter Engine Unit Tests
  // =========================================================================
  describe('Pillar 1: In-Process Rate Limiter Core Engine', () => {
    it('allows requests within limit and decrements remaining tokens accurately', () => {
      const res1 = checkRateLimit({ key: 'test:client1', limit: 3, windowMs: 10_000 });
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);
      expect(res1.limit).toBe(3);
      expect(res1.retryAfterSeconds).toBeGreaterThanOrEqual(1);

      const res2 = checkRateLimit({ key: 'test:client1', limit: 3, windowMs: 10_000 });
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(1);

      const res3 = checkRateLimit({ key: 'test:client1', limit: 3, windowMs: 10_000 });
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);
    });

    it('blocks request exceeding limit with allowed=false, remaining=0, and positive Retry-After', () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit({ key: 'test:client2', limit: 5, windowMs: 60_000 });
      }

      const blocked = checkRateLimit({ key: 'test:client2', limit: 5, windowMs: 60_000 });
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.limit).toBe(5);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);

      const headers = getRateLimitHeaders(blocked);
      expect(headers['Retry-After']).toBe(String(blocked.retryAfterSeconds));
      expect(headers['X-RateLimit-Limit']).toBe('5');
      expect(headers['X-RateLimit-Remaining']).toBe('0');
      expect(Number(headers['X-RateLimit-Reset'])).toBeGreaterThan(0);
    });

    it('isolates counters between different keys completely', () => {
      for (let i = 0; i < 3; i++) {
        checkRateLimit({ key: 'test:keyA', limit: 3, windowMs: 10_000 });
      }
      expect(checkRateLimit({ key: 'test:keyA', limit: 3, windowMs: 10_000 }).allowed).toBe(false);

      // Key B is completely independent
      const resB = checkRateLimit({ key: 'test:keyB', limit: 3, windowMs: 10_000 });
      expect(resB.allowed).toBe(true);
      expect(resB.remaining).toBe(2);
    });

    it('resets window after expiration', () => {
      // Simulate expired window
      const now = Date.now();
      checkRateLimit({ key: 'test:expired', limit: 2, windowMs: -1000 }); // expired immediately
      const nextRes = checkRateLimit({ key: 'test:expired', limit: 2, windowMs: 10_000 });
      expect(nextRes.allowed).toBe(true);
      expect(nextRes.remaining).toBe(1);
    });

    it('prunes expired entries and preserves active entries in store', () => {
      const now = Date.now();
      // Add expired entry
      checkRateLimit({ key: 'test:old', limit: 1, windowMs: -5000 });
      // Add active entry
      checkRateLimit({ key: 'test:active', limit: 1, windowMs: 60_000 });

      expect(getRateLimitStoreSize()).toBe(2);

      const pruned = pruneExpiredEntries(now);
      expect(pruned).toBe(1);
      expect(getRateLimitStoreSize()).toBe(1);

      // Active entry remains and is still tracked
      const activeRes = checkRateLimit({ key: 'test:active', limit: 1, windowMs: 60_000 });
      expect(activeRes.allowed).toBe(false); // already reached limit of 1
    });

    it('resets all limits on resetRateLimits', () => {
      checkRateLimit({ key: 'test:toReset', limit: 1, windowMs: 60_000 });
      expect(checkRateLimit({ key: 'test:toReset', limit: 1, windowMs: 60_000 }).allowed).toBe(false);

      resetRateLimits();
      expect(getRateLimitStoreSize()).toBe(0);

      expect(checkRateLimit({ key: 'test:toReset', limit: 1, windowMs: 60_000 }).allowed).toBe(true);
    });
  });

  // =========================================================================
  // Pillar 2: Client IP Resolution & Anti-Spoofing Unit Tests
  // =========================================================================
  describe('Pillar 2: Client IP Resolution (getClientIp)', () => {
    it('prioritizes cf-connecting-ip over x-real-ip and x-forwarded-for', () => {
      const headers = new Headers({
        'cf-connecting-ip': '203.0.113.10',
        'x-real-ip': '203.0.113.20',
        'x-forwarded-for': '203.0.113.30, 10.0.0.1',
      });
      expect(getClientIp(headers)).toBe('203.0.113.10');
    });

    it('prioritizes x-real-ip when cf-connecting-ip is absent', () => {
      const headers = new Headers({
        'x-real-ip': '203.0.113.25',
        'x-forwarded-for': '203.0.113.30, 10.0.0.1',
      });
      expect(getClientIp(headers)).toBe('203.0.113.25');
    });

    it('extracts first IP from x-forwarded-for when other headers absent', () => {
      const headers = new Headers({
        'x-forwarded-for': '  198.51.100.44  , 10.0.0.2, 172.16.0.1',
      });
      expect(getClientIp(headers)).toBe('198.51.100.44');
    });

    it('falls back to 127.0.0.1 when no headers are supplied', () => {
      const headers = new Headers({});
      expect(getClientIp(headers)).toBe('127.0.0.1');
    });

    it('handles empty or whitespace-only headers gracefully', () => {
      const headers = new Headers({
        'cf-connecting-ip': '   ',
        'x-real-ip': '',
        'x-forwarded-for': '   ',
      });
      expect(getClientIp(headers)).toBe('127.0.0.1');
    });
  });

  // =========================================================================
  // Pillar 3: Registration Rate Limiting (POST /api/auth/register)
  // =========================================================================
  describe('Pillar 3: Registration Protection (POST /api/auth/register)', () => {
    it('allows up to 5 registration requests and rejects 6th with HTTP 429 and rate-limit headers', async () => {
      const clientIp = '198.51.100.99';

      for (let i = 1; i <= 5; i++) {
        const req = createAuthedJsonRequest(
          'http://localhost:3000/api/auth/register',
          null,
          'POST',
          {
            name: `Candidate ${i}`,
            email: `candidate_${i}@example.com`,
            password: 'TooShort', // Invalid body to fail fast at validation, after rate limit check
          },
          { 'cf-connecting-ip': clientIp }
        );

        const res = await registerPost(req);
        // Should not be 429
        expect(res.status).not.toBe(429);
      }

      // 6th request from same IP must be rejected with 429
      const blockedReq = createAuthedJsonRequest(
        'http://localhost:3000/api/auth/register',
        null,
        'POST',
        {
          name: 'Candidate 6',
          email: 'candidate_6@example.com',
          password: 'ValidPassword123!',
        },
        { 'cf-connecting-ip': clientIp }
      );

      const blockedRes = await registerPost(blockedReq);
      expect(blockedRes.status).toBe(429);

      const body = await blockedRes.json();
      expect(body.error).toContain('تم تجاوز الحد المسموح به لإنشاء الحسابات');

      // Rate limit headers verification
      expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      expect(Number(blockedRes.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(blockedRes.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(blockedRes.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(Number(blockedRes.headers.get('X-RateLimit-Reset'))).toBeGreaterThan(0);
    });

    it('isolates registration quotas between different client IPs', async () => {
      const ipA = '198.51.100.101';
      const ipB = '198.51.100.102';

      // Exhaust IP A
      for (let i = 0; i < 5; i++) {
        const req = createAuthedJsonRequest(
          'http://localhost:3000/api/auth/register',
          null,
          'POST',
          { name: 'Test', email: 'test@test.com' },
          { 'cf-connecting-ip': ipA }
        );
        await registerPost(req);
      }

      const blockedA = await registerPost(
        createAuthedJsonRequest(
          'http://localhost:3000/api/auth/register',
          null,
          'POST',
          { name: 'Test', email: 'test@test.com' },
          { 'cf-connecting-ip': ipA }
        )
      );
      expect(blockedA.status).toBe(429);

      // IP B must NOT be blocked
      const allowedB = await registerPost(
        createAuthedJsonRequest(
          'http://localhost:3000/api/auth/register',
          null,
          'POST',
          { name: 'Test', email: 'test@test.com' },
          { 'cf-connecting-ip': ipB }
        )
      );
      expect(allowedB.status).not.toBe(429);
    });
  });

  // =========================================================================
  // Pillar 4: Lead Query Rate Limiting (GET /api/leads)
  // =========================================================================
  describe('Pillar 4: Lead Query Protection (GET /api/leads)', () => {
    it('rejects unauthenticated requests with 401 without consuming rate-limit tokens', async () => {
      // Unauthenticated request
      const req = createAuthedJsonRequest('http://localhost:3000/api/leads', null, 'GET');
      const res = await getLeadsRoute(req);
      expect(res.status).toBe(401);

      // Store size should remain 0 because unauthenticated requests fail at requireAuth
      expect(getRateLimitStoreSize()).toBe(0);
    });

    it('allows requests within 60/min limit for authenticated user and blocks 61st with 429', async () => {
      // Execute 60 requests for userA
      for (let i = 1; i <= 60; i++) {
        const req = createAuthedJsonRequest('http://localhost:3000/api/leads', userA.token, 'GET');
        const res = await getLeadsRoute(req);
        expect(res.status).toBe(200);
      }

      // 61st request must trigger 429
      const blockedReq = createAuthedJsonRequest('http://localhost:3000/api/leads', userA.token, 'GET');
      const blockedRes = await getLeadsRoute(blockedReq);
      expect(blockedRes.status).toBe(429);

      const json = await blockedRes.json();
      expect(json.error).toContain('تم تجاوز حد الطلبات المسموح به');

      // Verify rate limit headers
      expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      expect(Number(blockedRes.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(blockedRes.headers.get('X-RateLimit-Limit')).toBe('60');
      expect(blockedRes.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(Number(blockedRes.headers.get('X-RateLimit-Reset'))).toBeGreaterThan(0);
    });

    it('isolates lead query quotas between different authenticated users', async () => {
      // Consume all 60 requests for userA
      for (let i = 0; i < 60; i++) {
        const req = createAuthedJsonRequest('http://localhost:3000/api/leads', userA.token, 'GET');
        await getLeadsRoute(req);
      }

      // userA is blocked
      const blockedA = await getLeadsRoute(
        createAuthedJsonRequest('http://localhost:3000/api/leads', userA.token, 'GET')
      );
      expect(blockedA.status).toBe(429);

      // userB is independent and must succeed with 200
      const allowedB = await getLeadsRoute(
        createAuthedJsonRequest('http://localhost:3000/api/leads', userB.token, 'GET')
      );
      expect(allowedB.status).toBe(200);
    });
  });

  // =========================================================================
  // Pillar 5: Subscription Mutation Protection (POST /api/subscription)
  // =========================================================================
  describe('Pillar 5: Subscription Mutation Protection (POST /api/subscription)', () => {
    it('rejects unauthenticated subscription request with 401 without consuming tokens', async () => {
      const req = createAuthedJsonRequest(
        'http://localhost:3000/api/subscription',
        null,
        'POST',
        { planId: freePlanId }
      );
      const res = await subscribePost(req);
      expect(res.status).toBe(401);
      expect(getRateLimitStoreSize()).toBe(0);
    });

    it('rejects CSRF origin mismatch with 403 before rate-limit is consumed', async () => {
      const req = new NextRequest('http://localhost:3000/api/subscription', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${userA.token}`,
          origin: 'http://malicious-site.com',
          host: 'localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ planId: freePlanId }),
      });
      const res = await subscribePost(req);
      expect(res.status).toBe(403);
      expect(getRateLimitStoreSize()).toBe(0);
    });

    it('allows 10 subscription requests per 5 minutes and blocks 11th with 429', async () => {
      // In non-production, subscribing to free plan works cleanly
      for (let i = 1; i <= 10; i++) {
        const req = createAuthedJsonRequest(
          'http://localhost:3000/api/subscription',
          userA.token,
          'POST',
          { planId: freePlanId }
        );
        const res = await subscribePost(req);
        // Expect success or valid validation
        expect(res.status).toBe(200);
      }

      // 11th request must fail with 429
      const blockedReq = createAuthedJsonRequest(
        'http://localhost:3000/api/subscription',
        userA.token,
        'POST',
        { planId: freePlanId }
      );
      const blockedRes = await subscribePost(blockedReq);
      expect(blockedRes.status).toBe(429);

      const json = await blockedRes.json();
      expect(json.error).toContain('تم تجاوز حد طلبات الاشتراك المسموح به');

      expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      expect(Number(blockedRes.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(blockedRes.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(blockedRes.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(Number(blockedRes.headers.get('X-RateLimit-Reset'))).toBeGreaterThan(0);
    });

    it('coexists cleanly with Phase 1A sandbox protection and stops execution before DB or mutations', async () => {
      setNodeEnv('production');

      // Attempt 1: In production, paid Starter plan is rejected by Phase 1A with 403 SANDBOX_PAYMENT_FORBIDDEN
      const initialPaymentsCount = await prisma.payment.count();

      const prodReq = createAuthedJsonRequest(
        'http://localhost:3000/api/subscription',
        userB.token,
        'POST',
        { planId: starterPlanId }
      );
      const prodRes = await subscribePost(prodReq);
      expect(prodRes.status).toBe(403);
      const prodJson = await prodRes.json();
      expect(prodJson.code).toBe('SANDBOX_PAYMENT_FORBIDDEN');

      // Now exhaust userB's remaining 9 requests
      for (let i = 0; i < 9; i++) {
        const req = createAuthedJsonRequest(
          'http://localhost:3000/api/subscription',
          userB.token,
          'POST',
          { planId: starterPlanId }
        );
        await subscribePost(req);
      }

      // 11th request: rate limiter should trigger 429 before Phase 1A sandbox check or DB query
      const rateLimitedReq = createAuthedJsonRequest(
        'http://localhost:3000/api/subscription',
        userB.token,
        'POST',
        { planId: starterPlanId }
      );
      const rateLimitedRes = await subscribePost(rateLimitedReq);
      expect(rateLimitedRes.status).toBe(429);
      const rateLimitedJson = await rateLimitedRes.json();
      expect(rateLimitedJson.error).toContain('تم تجاوز حد طلبات الاشتراك المسموح به');

      // Verify zero payments or mutations occurred
      const finalPaymentsCount = await prisma.payment.count();
      expect(finalPaymentsCount).toBe(initialPaymentsCount);
    });
  });
});

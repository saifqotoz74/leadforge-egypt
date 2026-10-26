import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import { POST as subscribePost } from '@/app/api/subscription/route';
import {
  DEFAULT_PLANS,
  SandboxPaymentProvider,
  isSandboxPaymentProvider,
  subscribeUserToPlan,
  submitTransferPayment,
  approveTransferPayment,
  PaymentProvider,
} from '@/lib/payment/provider';
import { AppSecurityError } from '@/lib/security/error-taxonomy';

describe('Phase 1A: Production Sandbox Payment Protection', () => {
  let prisma: PrismaClient;
  let pglite: PGlite;
  let cleanupDb: () => Promise<void>;

  let testUser: { id: string; email: string; token: string };
  let adminUser: { id: string; email: string; token: string };
  let freePlanId: string;
  let starterPlanId: string;
  let proPlanId: string;
  let businessPlanId: string;

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

    // Set strong secret so auth token verification works in production mode
    process.env.AUTH_SECRET = 'strong-production-auth-secret-32-chars-long-test-key';

    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    pglite = testDb.pglite;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(prisma, pglite);

    // Seed default plans
    for (const planDef of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { slug: planDef.slug },
        update: planDef,
        create: planDef,
      });
    }

    const [freePlan, starterPlan, proPlan, businessPlan] = await Promise.all([
      prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } }),
      prisma.plan.findUniqueOrThrow({ where: { slug: 'starter' } }),
      prisma.plan.findUniqueOrThrow({ where: { slug: 'pro' } }),
      prisma.plan.findUniqueOrThrow({ where: { slug: 'business' } }),
    ]);

    freePlanId = freePlan.id;
    starterPlanId = starterPlan.id;
    proPlanId = proPlan.id;
    businessPlanId = businessPlan.id;

    const passwordHash = await hashPassword('TestPassword123!');

    const admin = await prisma.user.create({
      data: {
        name: 'Admin Tester',
        email: 'admin-sandbox-test@leadforge.test',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const dev = await prisma.user.create({
      data: {
        name: 'Developer Tester',
        email: 'dev-sandbox-test@leadforge.test',
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        subscription: {
          create: {
            planId: freePlan.id,
            status: 'ACTIVE',
            credits: 3,
            totalCreditsGranted: 3,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    adminUser = {
      id: admin.id,
      email: admin.email,
      token: await signSessionToken({
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
      }),
    };

    testUser = {
      id: dev.id,
      email: dev.email,
      token: await signSessionToken({
        userId: dev.id,
        email: dev.email,
        name: dev.name,
        role: 'DEVELOPER',
      }),
    };
  });

  afterAll(async () => {
    // Restore environment
    setNodeEnv(origEnvNodeEnv);
    if (origAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = origAuthSecret;
    }
    await cleanupDb();
  });

  afterEach(() => {
    // Guarantee NODE_ENV restoration after each test case
    setNodeEnv(origEnvNodeEnv);
  });

  function createAuthedPostRequest(url: string, token: string, body: Record<string, unknown>): NextRequest {
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        cookie: `leadforge_session=${token}`,
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify(body),
    });
  }

  // =========================================================================
  // 1. Production Rejection via POST /api/subscription
  // =========================================================================
  describe('1. API Route Rejection in Production', () => {
    it('rejects activating a paid Starter plan in production with HTTP 403 Forbidden', async () => {
      setNodeEnv('production');

      const initialPaymentsCount = await prisma.payment.count();
      const initialSub = await prisma.subscription.findUniqueOrThrow({ where: { userId: testUser.id } });

      const req = createAuthedPostRequest('http://localhost:3000/api/subscription', testUser.token, {
        planId: starterPlanId,
      });

      const res = await subscribePost(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.code).toBe('SANDBOX_PAYMENT_FORBIDDEN');
      expect(json.error).toContain('لا يمكن تفعيل الباقات المدفوعة عبر بوابة الدفع التجريبية في بيئة الإنتاج');

      // Verify no changes were made to subscription, credits, or payments
      const subAfter = await prisma.subscription.findUniqueOrThrow({ where: { userId: testUser.id } });
      expect(subAfter.planId).toBe(initialSub.planId);
      expect(subAfter.credits).toBe(initialSub.credits);

      const finalPaymentsCount = await prisma.payment.count();
      expect(finalPaymentsCount).toBe(initialPaymentsCount);
    });

    it('rejects activating Pro and Business plans in production with HTTP 403', async () => {
      setNodeEnv('production');

      for (const paidPlanId of [proPlanId, businessPlanId]) {
        const req = createAuthedPostRequest('http://localhost:3000/api/subscription', testUser.token, {
          planId: paidPlanId,
        });

        const res = await subscribePost(req);
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.code).toBe('SANDBOX_PAYMENT_FORBIDDEN');
      }
    });

    it('returns 404 if planId does not exist', async () => {
      setNodeEnv('production');

      const req = createAuthedPostRequest('http://localhost:3000/api/subscription', testUser.token, {
        planId: 'non-existent-plan-cuid',
      });

      const res = await subscribePost(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('الباقة المختارة غير متاحة');
    });
  });

  // =========================================================================
  // 2. Direct Service-Level Guard in subscribeUserToPlan
  // =========================================================================
  describe('2. Direct Service Guard in subscribeUserToPlan', () => {
    it('throws AppSecurityError (403) when called in production with default sandbox provider for a paid plan', async () => {
      setNodeEnv('production');

      const paymentsBefore = await prisma.payment.count();
      const creditTxBefore = await prisma.creditTransaction.count();

      await expect(
        subscribeUserToPlan({
          prisma,
          userId: testUser.id,
          planId: starterPlanId,
        })
      ).rejects.toThrow(AppSecurityError);

      try {
        await subscribeUserToPlan({
          prisma,
          userId: testUser.id,
          planId: starterPlanId,
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppSecurityError);
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('FORBIDDEN');
      }

      // Verify zero side-effects: no payments or credit transactions created
      expect(await prisma.payment.count()).toBe(paymentsBefore);
      expect(await prisma.creditTransaction.count()).toBe(creditTxBefore);
    });

    it('throws AppSecurityError (403) even when an explicit SandboxPaymentProvider instance is passed in production', async () => {
      setNodeEnv('production');

      const customSandbox = new SandboxPaymentProvider();
      await expect(
        subscribeUserToPlan({
          prisma,
          userId: testUser.id,
          planId: proPlanId,
          paymentProvider: customSandbox,
        })
      ).rejects.toThrow(AppSecurityError);
    });

    it('rejects mock sandbox providers whose name contains SANDBOX', async () => {
      setNodeEnv('production');

      const mockSandbox: PaymentProvider = {
        providerName: 'MOCK_SANDBOX_EXTERNAL',
        processSubscriptionCharge: async () => ({
          success: true,
          provider: 'MOCK_SANDBOX_EXTERNAL',
          providerRef: 'mock-ref-1',
          status: 'COMPLETED',
        }),
      };

      expect(isSandboxPaymentProvider(mockSandbox)).toBe(true);

      await expect(
        subscribeUserToPlan({
          prisma,
          userId: testUser.id,
          planId: proPlanId,
          paymentProvider: mockSandbox,
        })
      ).rejects.toThrow(AppSecurityError);
    });
  });

  // =========================================================================
  // 3. Provider-Level Protection in SandboxPaymentProvider
  // =========================================================================
  describe('3. Provider-Level Protection in SandboxPaymentProvider', () => {
    it('returns success: false with FAILED status for positive amounts in production', async () => {
      setNodeEnv('production');

      const provider = new SandboxPaymentProvider();
      const result = await provider.processSubscriptionCharge({
        userId: testUser.id,
        planId: starterPlanId,
        planSlug: 'starter',
        amountEgp: 299,
        currency: 'EGP',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toContain('بوابة الدفع التجريبية (Sandbox) غير مسموح بها');
    });

    it('returns success: true for 0 EGP in production', async () => {
      setNodeEnv('production');

      const provider = new SandboxPaymentProvider();
      const result = await provider.processSubscriptionCharge({
        userId: testUser.id,
        planId: freePlanId,
        planSlug: 'free',
        amountEgp: 0,
        currency: 'EGP',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
    });

    it('returns success: true for positive amounts in non-production (test/dev)', async () => {
      setNodeEnv('test');

      const provider = new SandboxPaymentProvider();
      const result = await provider.processSubscriptionCharge({
        userId: testUser.id,
        planId: starterPlanId,
        planSlug: 'starter',
        amountEgp: 299,
        currency: 'EGP',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
    });
  });

  // =========================================================================
  // 4. Legitimate Production Payment Flows are NOT Blocked
  // =========================================================================
  describe('4. Legitimate Production Payment Flows', () => {
    it('allows Free plan (0 EGP) subscription in production via POST /api/subscription', async () => {
      setNodeEnv('production');

      const req = createAuthedPostRequest('http://localhost:3000/api/subscription', testUser.token, {
        planId: freePlanId,
      });

      const res = await subscribePost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.subscription.planId).toBe(freePlanId);
      expect(json.subscription.credits).toBe(3);
    });

    it('allows legitimate manual transfer payment flow (InstaPay/Vodafone Cash) in production', async () => {
      setNodeEnv('production');

      // 1. Submit manual transfer receipt
      const transferPayment = await submitTransferPayment({
        prisma,
        userId: testUser.id,
        planId: starterPlanId,
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        senderPhone: '01012345678',
      });

      expect(transferPayment.status).toBe('PENDING');
      expect(transferPayment.provider).toBe('INSTAPAY_WALLET');
      expect(transferPayment.amountEgp).toBe(299);

      // 2. Admin approves the transfer in production
      const approved = await approveTransferPayment({
        prisma,
        paymentId: transferPayment.id,
        adminId: adminUser.id,
      });

      expect(approved.payment.status).toBe('COMPLETED');
      expect(approved.subscription.status).toBe('ACTIVE');
      expect(approved.subscription.planId).toBe(starterPlanId);
      expect(approved.subscription.credits).toBeGreaterThanOrEqual(20);
    });

    it('allows legitimate production payment provider (non-sandbox) to execute', async () => {
      setNodeEnv('production');

      const realProductionProvider: PaymentProvider = {
        providerName: 'PAYMOB_PRODUCTION_GATEWAY',
        processSubscriptionCharge: async () => ({
          success: true,
          provider: 'PAYMOB_PRODUCTION_GATEWAY',
          providerRef: `PAYMOB-${Date.now()}`,
          status: 'COMPLETED',
        }),
      };

      expect(isSandboxPaymentProvider(realProductionProvider)).toBe(false);

      const res = await subscribeUserToPlan({
        prisma,
        userId: testUser.id,
        planId: proPlanId,
        paymentProvider: realProductionProvider,
      });

      expect(res.payment.provider).toBe('PAYMOB_PRODUCTION_GATEWAY');
      expect(res.payment.status).toBe('COMPLETED');
      expect(res.subscription.planId).toBe(proPlanId);
    });
  });

  // =========================================================================
  // 5. Non-Production Sandbox Behavior Remains Fully Compatible
  // =========================================================================
  describe('5. Non-Production Sandbox Compatibility', () => {
    it('allows sandbox subscription in non-production environments (test/development)', async () => {
      setNodeEnv('test');

      const req = createAuthedPostRequest('http://localhost:3000/api/subscription', testUser.token, {
        planId: businessPlanId,
      });

      const res = await subscribePost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.subscription.planId).toBe(businessPlanId);
      expect(json.subscription.credits).toBe(173); // FIN-03: preserves 73 unused credits + 100 new credits
      expect(json.payment.provider).toBe('SANDBOX_LOCAL_PROVIDER');
      expect(json.payment.status).toBe('COMPLETED');
    });
  });
});

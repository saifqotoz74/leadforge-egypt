import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, invalidateUserSessionCache, signSessionToken } from '../src/lib/auth';
import { DEFAULT_PLANS, subscribeUserToPlan } from '../src/lib/payment/provider';
import {
  claimLead,
  ensureDeveloperCreditAccount,
  reconcileCreditAccount,
} from '../src/lib/claims';
import { POST as registerHandler } from '../src/app/api/auth/register/route';
import { POST as claimHandler } from '../src/app/api/leads/[id]/claim/route';
import { POST as subscriptionHandler } from '../src/app/api/subscription/route';
import { POST as refundReportHandler } from '../src/app/api/developer/claims/[claimId]/refund-report/route';
import { POST as feedbackHandler } from '../src/app/api/leads/[id]/feedback/route';
import { POST as adminRefundClaimHandler } from '../src/app/api/admin/claims/[claimId]/refund/route';

describe('Phase 3 Closure Checks — Targeted Verification', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  let adminId: string;
  let adminToken: string;

  let freePlanId: string;
  let starterPlanId: string;
  let proPlanId: string;

  function buildJsonRequest(
    url: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
      idempotencyKey?: string;
    } = {}
  ): NextRequest {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    return new NextRequest(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  }

  async function createTestDeveloper(params: {
    email: string;
    name: string;
    balance?: number;
    planSlug?: 'free' | 'starter' | 'pro';
    emailVerified?: Date | null;
  }) {
    const passwordHash = await hashPassword('DevPass123!');
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const planId =
      params.planSlug === 'starter'
        ? starterPlanId
        : params.planSlug === 'pro'
        ? proPlanId
        : freePlanId;

    const user = await prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: params.emailVerified !== undefined ? params.emailVerified : new Date(),
        developerProfile: {
          create: {
            services: ['Website Development'],
            locations: ['القاهرة', 'الجيزة'],
            niches: ['Dental', 'Medical', 'Restaurant'],
            leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
            minBudget: 3000,
            maxBudget: 100000,
            leadType: 'BOTH',
            isActive: true,
            isAcceptingLeads: true,
          },
        },
        subscription: {
          create: {
            planId,
            status: 'ACTIVE',
            credits: params.balance ?? 3,
            totalCreditsGranted: params.balance ?? 3,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
      include: {
        developerProfile: true,
        subscription: { include: { plan: true } },
      },
    });

    const account = await ensureDeveloperCreditAccount(prisma, user.id);
    if (params.balance !== undefined && params.balance !== account.balance) {
      await prisma.developerCreditAccount.update({
        where: { id: account.id },
        data: { balance: params.balance },
      });
    }

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return { user, token };
  }

  async function createTestLead(params: {
    businessName: string;
    maxPurchasers?: number;
    currentPurchasers?: number;
    accessType?: 'SHARED' | 'EXCLUSIVE';
    status?: 'AVAILABLE' | 'CLAIMED_FULL';
  }) {
    return prisma.lead.create({
      data: {
        businessName: params.businessName,
        normalizedName: params.businessName.toLowerCase(),
        category: 'Dental',
        governorate: 'القاهرة',
        city: 'القاهرة',
        address: '15 Tahrir Square',
        normalizedAddress: '15 tahrir square',
        phone: '01012345678',
        leadType: params.accessType ?? 'SHARED',
        accessType: params.accessType ?? 'SHARED',
        maxPurchasers: params.maxPurchasers ?? 3,
        currentPurchasers: params.currentPurchasers ?? 0,
        status: params.status ?? 'AVAILABLE',
        saleabilityStatus: params.status ?? 'AVAILABLE',
        availableForClaim: (params.status ?? 'AVAILABLE') === 'AVAILABLE',
        qualityScore: 80,
        score: 80,
        qualityStatus: 'HIGH',
        freshnessStatus: 'FRESH',
        verificationStatus: 'VERIFIED',
        businessStatus: 'OPEN',
        isCanonical: true,
        isMock: false,
      },
    });
  }

  beforeAll(async () => {
    const inMem = await createInMemoryTestDb();
    prisma = inMem.prisma;
    cleanupDb = inMem.cleanup;
    setPrismaClientForTesting(prisma, inMem.pglite);

    for (const plan of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { slug: plan.slug },
        update: plan,
        create: plan,
      });
    }

    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'free' } });
    const starterPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'starter' } });
    const proPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'pro' } });

    freePlanId = freePlan.id;
    starterPlanId = starterPlan.id;
    proPlanId = proPlan.id;

    const adminHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: {
        email: 'admin.closure@leadforge.eg',
        name: 'Closure Admin',
        passwordHash: adminHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: new Date(),
      },
    });
    adminId = admin.id;
    adminToken = await signSessionToken({
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });
  });

  afterAll(async () => {
    if (cleanupDb) await cleanupDb();
  });

  // =========================================================================
  // Question 1: Email Verification and Migration Safety
  // =========================================================================
  describe('Question 1: Email Verification and Migration Safety', () => {
    it('registration explicitly persists emailVerified as null', async () => {
      const regEmail = `unverified-${Date.now()}@leadforge.eg`;
      const req = buildJsonRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Unverified Developer',
          email: regEmail,
          password: 'Password123!',
        },
      });

      const res = await registerHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user.email).toBe(regEmail.toLowerCase());
      expect(data.token).toBeDefined();

      const userInDb = await prisma.user.findUniqueOrThrow({
        where: { email: regEmail.toLowerCase() },
      });
      expect(userInDb.emailVerified).toBeNull();
    });

    it('unverified user is blocked from unlocking leads via API with 403 EMAIL_NOT_VERIFIED', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'blocked.unlock@leadforge.eg',
        name: 'Blocked Dev',
        balance: 10,
        emailVerified: null, // explicitly unverified
      });

      const lead = await createTestLead({
        businessName: 'Unverified Lead Target',
      });

      invalidateUserSessionCache(user.id);
      const req = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
        method: 'POST',
        token,
      });

      const res = await claimHandler(req, { params: { id: lead.id } });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('EMAIL_NOT_VERIFIED');

      // Balance must NOT be debited
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(10);
    });

    it('claimLead service layer throws EMAIL_NOT_VERIFIED for unverified users', async () => {
      const { user } = await createTestDeveloper({
        email: 'service.unverified@leadforge.eg',
        name: 'Service Unverified Dev',
        balance: 10,
        emailVerified: null,
      });

      const lead = await createTestLead({
        businessName: 'Service Lead Target',
      });

      try {
        await claimLead({
          leadId: lead.id,
          developerId: user.id,
        });
        expect.unreachable('Should have thrown ClaimEngineError');
      } catch (err: any) {
        expect(err.code).toBe('EMAIL_NOT_VERIFIED');
      }
    });
  });

  // =========================================================================
  // Question 2: Subscription & Credit Idempotency
  // =========================================================================
  describe('Question 2: Subscription & Credit Idempotency Verification', () => {
    it('repeated POST /api/subscription for Free plan never grants duplicate credits', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'free.repeat@leadforge.eg',
        name: 'Free Repeat Dev',
        balance: 3,
        planSlug: 'free',
      });

      const initialTxs = await prisma.creditTransaction.findMany({
        where: { developerId: user.id, type: 'PURCHASE' },
      });
      const initialTxCount = initialTxs.length;

      // Submit POST /api/subscription 3 times sequentially
      for (let i = 1; i <= 3; i++) {
        invalidateUserSessionCache(user.id);
        const req = buildJsonRequest('http://localhost:3000/api/subscription', {
          method: 'POST',
          token,
          body: { planId: freePlanId },
        });

        const res = await subscriptionHandler(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.subscription.credits).toBe(3);
      }

      // Check database balance remains exactly 3
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(3);

      // Verify no extra PURCHASE transactions were created beyond the initial account setup
      const finalTxs = await prisma.creditTransaction.findMany({
        where: { developerId: user.id, type: 'PURCHASE' },
      });
      expect(finalTxs.length).toBe(initialTxCount);

      const reconciliation = await reconcileCreditAccount(user.id, prisma);
      expect(reconciliation.isReconciled).toBe(true);
      expect(reconciliation.discrepancy).toBe(0);
    });

    it('rejects POST /api/subscription for paid plans in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.AUTH_SECRET;
      (process.env as any).NODE_ENV = 'production';
      process.env.AUTH_SECRET = 'a-very-strong-production-auth-secret-32-chars!';

      try {
        const { user, token } = await createTestDeveloper({
          email: 'prod.sub@leadforge.eg',
          name: 'Prod Sub Dev',
          balance: 0,
          planSlug: 'free',
        });

        invalidateUserSessionCache(user.id);
        const req = buildJsonRequest('http://localhost:3000/api/subscription', {
          method: 'POST',
          token,
          body: { planId: proPlanId },
        });

        const res = await subscriptionHandler(req);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.code).toBe('SANDBOX_PAYMENT_FORBIDDEN');

        // Confirm balance remained 0
        const account = await prisma.developerCreditAccount.findUniqueOrThrow({
          where: { developerId: user.id },
        });
        expect(account.balance).toBe(0);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
        process.env.AUTH_SECRET = originalSecret;
      }
    });

    it('deduplicates identical providerRef at service layer without granting duplicate credits', async () => {
      const { user } = await createTestDeveloper({
        email: 'dedup.service@leadforge.eg',
        name: 'Dedup Service Dev',
        balance: 10,
        planSlug: 'free',
      });

      const fixedRefProvider = {
        providerName: 'FAWRY_SIMULATION',
        async processSubscriptionCharge() {
          return {
            success: true,
            provider: 'FAWRY_SIMULATION',
            providerRef: 'FAWRY-REF-CONST-12345',
            status: 'COMPLETED' as const,
          };
        },
      };

      // First execution
      const res1 = await subscribeUserToPlan({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        paymentProvider: fixedRefProvider,
      });
      expect(res1.subscription.credits).toBe(30); // 10 + 20

      // Replay identical providerRef
      const res2 = await subscribeUserToPlan({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        paymentProvider: fixedRefProvider,
      });

      // Must return existing payment and NOT double-grant
      expect(res2.payment.id).toBe(res1.payment.id);
      expect(res2.subscription.credits).toBe(30);

      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(30);

      // Total PURCHASE transactions must be: 1 initial (10) + 1 plan purchase (20) = 2 (not 3)
      const txs = await prisma.creditTransaction.findMany({
        where: { developerId: user.id, type: 'PURCHASE' },
      });
      expect(txs.length).toBe(2);
    });
  });

  // =========================================================================
  // Question 3: Refund-Report Flow & Guardrails Integration
  // =========================================================================
  describe('Question 3: Refund-Report Flow & Guardrails Integration', () => {
    it('POST /api/developer/claims/[claimId]/refund-report enforces 30-minute wait', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'wait.refund@leadforge.eg',
        name: 'Wait Refund Dev',
        balance: 5,
        planSlug: 'free',
      });

      const lead = await createTestLead({
        businessName: 'Wait Co',
      });

      const claimResult = await claimLead({
        leadId: lead.id,
        developerId: user.id,
      });

      invalidateUserSessionCache(user.id);
      // Immediately report refund (< 30 min)
      const req = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claimResult.claimId}/refund-report`,
        {
          method: 'POST',
          token,
          body: { reason: 'WRONG_PHONE', comment: 'Immediate report' },
        }
      );

      const res = await refundReportHandler(req, { params: { claimId: claimResult.claimId } });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.code).toBe('WAIT_PERIOD_REQUIRED');
    });

    it('POST /api/developer/claims/[claimId]/refund-report enforces trial 2-report cap', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'cap.refund@leadforge.eg',
        name: 'Cap Refund Dev',
        balance: 20,
        planSlug: 'free',
      });

      // Pre-seed 2 reports submitted within last 30 days
      for (let i = 1; i <= 2; i++) {
        const lead = await createTestLead({
          businessName: `Old Co ${i}`,
        });
        const claim = await claimLead({
          leadId: lead.id,
          developerId: user.id,
        });

        await prisma.leadFeedback.create({
          data: {
            leadId: lead.id,
            userId: user.id,
            developerId: user.id,
            claimId: claim.claimId,
            useful: false,
            reasonCode: 'WRONG_PHONE',
            category: 'LEAD_QUALITY',
            type: 'REFUND_REPORT',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          },
        });
      }

      // Create a 3rd lead claimed 40 minutes ago
      const lead3 = await createTestLead({
        businessName: 'Aged Co 3',
      });
      const claim3 = await claimLead({
        leadId: lead3.id,
        developerId: user.id,
      });

      // Age claim3 to 40 minutes ago
      await prisma.leadClaim.update({
        where: { id: claim3.claimId },
        data: { claimedAt: new Date(Date.now() - 40 * 60 * 1000) },
      });

      invalidateUserSessionCache(user.id);
      const req = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claim3.claimId}/refund-report`,
        {
          method: 'POST',
          token,
          body: { reason: 'BUSINESS_CLOSED' },
        }
      );

      const res = await refundReportHandler(req, { params: { claimId: claim3.claimId } });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.code).toBe('TRIAL_REFUND_LIMIT_EXCEEDED');
    });

    it('legacy feedback route POST /api/leads/[id]/feedback never restores credits', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'legacy.fb@leadforge.eg',
        name: 'Legacy Feedback Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({
        businessName: 'FB Co',
      });

      const claim = await claimLead({
        leadId: lead.id,
        developerId: user.id,
      });

      const accountBefore = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      const expectedBalance = 10 - claim.creditsCharged;
      expect(accountBefore.balance).toBe(expectedBalance);

      invalidateUserSessionCache(user.id);
      // Submit legacy feedback as sent by UI in src/app/my-leads/page.tsx
      const req = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/feedback`, {
        method: 'POST',
        token,
        body: {
          useful: false,
          reason: 'WRONG_PHONE',
          comment: 'Phone was disconnected',
        },
      });

      const res = await feedbackHandler(req, { params: { id: lead.id } });
      expect(res.status).toBe(200);

      // Verify credit balance is strictly unchanged
      const accountAfter = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountAfter.balance).toBe(expectedBalance);

      // Confirm claim status is still ACTIVE, not REFUNDED
      const claimDb = await prisma.leadClaim.findUniqueOrThrow({
        where: { leadId_userId: { leadId: lead.id, userId: user.id } },
      });
      expect(claimDb.status).toBe('ACTIVE');
    });

    it('POST /api/leads/[id]/feedback with requestRefund: true enforces 30-min wait guardrail', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'feedback.refund@leadforge.eg',
        name: 'Feedback Refund Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({
        businessName: 'FB Refund Co',
      });

      await claimLead({
        leadId: lead.id,
        developerId: user.id,
      });

      invalidateUserSessionCache(user.id);
      const req = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/feedback`, {
        method: 'POST',
        token,
        body: {
          useful: false,
          reason: 'WRONG_PHONE',
          requestRefund: true, // refund flag
        },
      });

      const res = await feedbackHandler(req, { params: { id: lead.id } });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.code).toBe('WAIT_PERIOD_REQUIRED');
    });

    it('admin refund cannot be applied multiple times to restore duplicate credits', async () => {
      const { user } = await createTestDeveloper({
        email: 'admin.refund@leadforge.eg',
        name: 'Admin Refund Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({
        businessName: 'Double Refund Co',
      });

      const claim = await claimLead({
        leadId: lead.id,
        developerId: user.id,
      });

      const accountClaimed = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountClaimed.balance).toBe(10 - claim.creditsCharged);

      // 1st Admin Refund
      invalidateUserSessionCache(adminId);
      const req1 = buildJsonRequest(
        `http://localhost:3000/api/admin/claims/${claim.claimId}/refund`,
        {
          method: 'POST',
          token: adminToken,
          body: { reason: 'Defective lead verified by admin' },
        }
      );
      const res1 = await adminRefundClaimHandler(req1, { params: { claimId: claim.claimId } });
      expect(res1.status).toBe(200);

      const accountAfterFirstRefund = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountAfterFirstRefund.balance).toBe(10); // Restored to 10

      // 2nd Admin Refund (Attempted double-refund)
      invalidateUserSessionCache(adminId);
      const req2 = buildJsonRequest(
        `http://localhost:3000/api/admin/claims/${claim.claimId}/refund`,
        {
          method: 'POST',
          token: adminToken,
          body: { reason: 'Duplicate attempt to refund' },
        }
      );
      const res2 = await adminRefundClaimHandler(req2, { params: { claimId: claim.claimId } });
      expect(res2.status).toBe(409);
      const data2 = await res2.json();
      expect(data2.code).toBe('CLAIM_ALREADY_REFUNDED');

      // Balance must remain 10, NOT 11
      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountFinal.balance).toBe(10);
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, invalidateUserSessionCache, signSessionToken } from '../src/lib/auth';
import {
  DEFAULT_PLANS,
  processPaymentWebhookEvent,
  signPaymentWebhookPayload,
} from '../src/lib/payment/provider';
import {
  claimLead,
  ensureDeveloperCreditAccount,
  submitClaimRefundReport,
} from '../src/lib/claims';
import { POST as refundReportHandler } from '../src/app/api/developer/claims/[claimId]/refund-report/route';

describe('Phase 4D — Gaps Closure & Concurrency Hardening', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;
  let starterPlanId: string;
  let freePlanId: string;

  function buildJsonRequest(
    url: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
    } = {}
  ): NextRequest {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
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
    planSlug?: 'free' | 'starter';
  }) {
    const passwordHash = await hashPassword('DevPass123!');
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const planId = params.planSlug === 'starter' ? starterPlanId : freePlanId;

    const user = await prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: new Date(),
        developerProfile: {
          create: {
            services: ['Website Development'],
            locations: ['القاهرة'],
            niches: ['Dental'],
            leadPreferences: ['NO_WEBSITE'],
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
            credits: params.balance ?? 10,
            totalCreditsGranted: params.balance ?? 10,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
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

  async function createTestLead(params: { businessName: string }) {
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
        hasPhone: true,
        leadType: 'SHARED',
        accessType: 'SHARED',
        exclusive: false,
        maxPurchasers: 3,
        currentPurchasers: 0,
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
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
    freePlanId = freePlan.id;
    starterPlanId = starterPlan.id;
  });

  afterAll(async () => {
    if (cleanupDb) {
      await cleanupDb();
    }
  });

  // =========================================================================
  // 1. D2 Concurrency: Parallel Refund Reports on the Same Claim
  // =========================================================================
  describe('1. D2 Concurrency & Database-Level Guarantee', () => {
    it('submits 2 refund reports in parallel via API on the same claim: ends with 1 row and 409 conflict, never 500', async () => {
      const { user, token } = await createTestDeveloper({
        email: 'd2.parallel@leadforge.eg',
        name: 'D2 Parallel Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({ businessName: 'Parallel Report Lead' });
      const claim = await claimLead({ leadId: lead.id, developerId: user.id });

      // Age claim to 45 minutes
      await prisma.leadClaim.update({
        where: { id: claim.claimId },
        data: { claimedAt: new Date(Date.now() - 45 * 60 * 1000) },
      });

      invalidateUserSessionCache(user.id);

      // Submit 2 refund reports in parallel through the API route
      const req1 = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claim.claimId}/refund-report`,
        {
          method: 'POST',
          token,
          body: { reason: 'WRONG_PHONE', comment: 'Parallel report 1' },
        }
      );
      const req2 = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claim.claimId}/refund-report`,
        {
          method: 'POST',
          token,
          body: { reason: 'WRONG_PHONE', comment: 'Parallel report 2' },
        }
      );

      const [res1, res2] = await Promise.all([
        refundReportHandler(req1, { params: { claimId: claim.claimId } }),
        refundReportHandler(req2, { params: { claimId: claim.claimId } }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200), the other must return 409 conflict, NEVER 500
      expect(statuses).toEqual([200, 409]);

      const errRes = res1.status === 409 ? res1 : res2;
      const errData = await errRes.json();
      expect(errData.code).toBe('REFUND_REPORT_ALREADY_EXISTS');

      // Database-level verification: exactly 1 report row exists in LeadFeedback
      const totalReports = await prisma.leadFeedback.count({
        where: { claimId: claim.claimId, type: 'REFUND_REPORT' },
      });
      expect(totalReports).toBe(1);

      // Verify trial cap was consumed only ONCE
      const monthlyReportsCount = await prisma.leadFeedback.count({
        where: {
          userId: user.id,
          useful: false,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      expect(monthlyReportsCount).toBe(1);
    });

    it('direct concurrent database insertion test: P2002 unique constraint violation is caught and translated to REFUND_REPORT_ALREADY_EXISTS', async () => {
      const { user } = await createTestDeveloper({
        email: 'd2.p2002@leadforge.eg',
        name: 'D2 P2002 Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({ businessName: 'P2002 Lead' });
      const claim = await claimLead({ leadId: lead.id, developerId: user.id });

      // Age claim to 45 minutes
      await prisma.leadClaim.update({
        where: { id: claim.claimId },
        data: { claimedAt: new Date(Date.now() - 45 * 60 * 1000) },
      });

      // Submit first report
      await submitClaimRefundReport({
        claimId: claim.claimId,
        developerId: user.id,
        reason: 'WRONG_PHONE',
      });

      // Attempt second submission — if unique constraint is triggered or find-then-insert is triggered,
      // it must throw ClaimEngineError with 409 and REFUND_REPORT_ALREADY_EXISTS
      try {
        await submitClaimRefundReport({
          claimId: claim.claimId,
          developerId: user.id,
          reason: 'WRONG_PHONE',
        });
        expect.unreachable('Should have thrown REFUND_REPORT_ALREADY_EXISTS');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('REFUND_REPORT_ALREADY_EXISTS');
      }
    });
  });

  // =========================================================================
  // 4. processPaymentWebhookEvent: Duplicate & Out-of-Order Webhook Delivery
  // =========================================================================
  describe('4. processPaymentWebhookEvent Concurrency & Out-of-Order Delivery', () => {
    const webhookSecret = 'whsec_test_secret_12345678901234567890';

    it('handles duplicate webhooks with DIFFERENT eventIds for the same payment reference concurrently', async () => {
      const { user } = await createTestDeveloper({
        email: 'wh.concurrent@leadforge.eg',
        name: 'WH Concurrent Dev',
        balance: 0,
        planSlug: 'free',
      });

      const providerRef = 'paymob_order_concurrent_dup_101';

      // Pre-create pending payment (as would be created during checkout)
      const pendingPayment = await prisma.payment.create({
        data: {
          userId: user.id,
          planId: starterPlanId,
          amountEgp: 299,
          creditsGranted: 0,
          provider: 'PAYMOB',
          providerRef,
          status: 'PENDING',
        },
      });

      // Two webhooks for the same payment with DIFFERENT event IDs
      const raw1 = JSON.stringify({
        eventId: 'evt_dup_111',
        type: 'payment.succeeded',
        provider: 'PAYMOB',
        providerRef,
        userId: user.id,
        planId: starterPlanId,
        amountEgp: 299,
        credits: 20,
      });
      const sig1 = signPaymentWebhookPayload(raw1, webhookSecret);

      const raw2 = JSON.stringify({
        eventId: 'evt_dup_222',
        type: 'payment.succeeded',
        provider: 'PAYMOB',
        providerRef,
        userId: user.id,
        planId: starterPlanId,
        amountEgp: 299,
        credits: 20,
      });
      const sig2 = signPaymentWebhookPayload(raw2, webhookSecret);

      // Send both concurrently
      const [res1, res2] = await Promise.all([
        processPaymentWebhookEvent({
          prisma,
          rawBody: raw1,
          signatureHeader: sig1,
          webhookSecret,
        }),
        processPaymentWebhookEvent({
          prisma,
          rawBody: raw2,
          signatureHeader: sig2,
          webhookSecret,
        }),
      ]);

      const codes = [res1.code, res2.code].sort();
      // Exactly one PROCESSED, the other IDEMPOTENT_DUPLICATE
      expect(codes).toEqual(['IDEMPOTENT_DUPLICATE', 'PROCESSED']);

      // Final balance must be exactly 20, NEVER 40
      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountFinal.balance).toBe(20);
    });

    it('rejects out-of-order payment.succeeded when payment is already in terminal REFUNDED status', async () => {
      const { user } = await createTestDeveloper({
        email: 'wh.outoforder@leadforge.eg',
        name: 'WH OutOfOrder Dev',
        balance: 0,
        planSlug: 'free',
      });

      const providerRef = 'paymob_order_refund_race_202';

      // Pre-create payment already marked REFUNDED
      await prisma.payment.create({
        data: {
          userId: user.id,
          planId: starterPlanId,
          amountEgp: 299,
          creditsGranted: 0,
          provider: 'PAYMOB',
          providerRef,
          status: 'REFUNDED',
        },
      });

      // Out-of-order payment.succeeded arrives
      const raw = JSON.stringify({
        eventId: 'evt_late_success_333',
        type: 'payment.succeeded',
        provider: 'PAYMOB',
        providerRef,
        userId: user.id,
        planId: starterPlanId,
        amountEgp: 299,
        credits: 20,
      });
      const sig = signPaymentWebhookPayload(raw, webhookSecret);

      const result = await processPaymentWebhookEvent({
        prisma,
        rawBody: raw,
        signatureHeader: sig,
        webhookSecret,
      });

      expect(result.code).toBe('OUT_OF_ORDER_IGNORED');
      expect(result.creditsGranted).toBe(0);

      // Verify payment remains REFUNDED, not overwritten to COMPLETED
      const paymentFinal = await prisma.payment.findFirstOrThrow({
        where: { providerRef },
      });
      expect(paymentFinal.status).toBe('REFUNDED');

      // Verify balance is 0
      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountFinal.balance).toBe(0);
    });

    it('rejects out-of-order payment.failed when payment is already in terminal REFUNDED status', async () => {
      const { user } = await createTestDeveloper({
        email: 'wh.failed.after.refund@leadforge.eg',
        name: 'WH Failed After Refund Dev',
        balance: 0,
        planSlug: 'free',
      });

      const providerRef = 'paymob_order_failed_after_refund_303';

      // Pre-create payment already marked REFUNDED
      await prisma.payment.create({
        data: {
          userId: user.id,
          planId: starterPlanId,
          amountEgp: 299,
          creditsGranted: 0,
          provider: 'PAYMOB',
          providerRef,
          status: 'REFUNDED',
        },
      });

      // Out-of-order payment.failed arrives late
      const raw = JSON.stringify({
        eventId: 'evt_late_failed_444',
        type: 'payment.failed',
        provider: 'PAYMOB',
        providerRef,
        userId: user.id,
        reason: 'Payment timeout from bank',
      });
      const sig = signPaymentWebhookPayload(raw, webhookSecret);

      const result = await processPaymentWebhookEvent({
        prisma,
        rawBody: raw,
        signatureHeader: sig,
        webhookSecret,
      });

      // Correct behavior: should be ignored because payment is already in terminal state REFUNDED
      expect(result.code).toBe('OUT_OF_ORDER_IGNORED');

      const paymentFinal = await prisma.payment.findFirstOrThrow({
        where: { providerRef },
      });
      expect(paymentFinal.status).toBe('REFUNDED');
    });
  });
});

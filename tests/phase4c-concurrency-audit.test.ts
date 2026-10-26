import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, signSessionToken } from '../src/lib/auth';
import {
  DEFAULT_PLANS,
  approveTransferPayment,
  rejectTransferPayment,
  submitTransferPayment,
} from '../src/lib/payment/provider';
import {
  claimLead,
  ensureDeveloperCreditAccount,
  handleLeadInvalidationAfterClaim,
  refundClaim,
  submitClaimRefundReport,
} from '../src/lib/claims';

describe('Phase 4C — Money-Path Concurrency Audit Suite', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  let adminId: string;
  let starterPlanId: string;
  let freePlanId: string;

  async function createTestDeveloper(params: {
    email: string;
    name: string;
    balance?: number;
    planSlug?: 'free' | 'starter' | 'pro' | 'business';
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
            credits: params.balance ?? 0,
            totalCreditsGranted: params.balance ?? 0,
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

    return { user };
  }

  async function createTestLead(params: {
    businessName: string;
    maxPurchasers?: number;
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
        hasPhone: true,
        leadType: 'SHARED',
        accessType: 'SHARED',
        exclusive: false,
        maxPurchasers: params.maxPurchasers ?? 3,
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

    const adminHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: {
        email: 'audit.admin@leadforge.eg',
        name: 'Audit Admin',
        passwordHash: adminHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: new Date(),
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    if (cleanupDb) {
      await cleanupDb();
    }
  });

  // =========================================================================
  // 1. Audit Item: rejectTransferPayment Concurrency
  // =========================================================================
  describe('1. rejectTransferPayment Concurrency', () => {
    it('concurrent rejections on the same PENDING payment', async () => {
      const { user } = await createTestDeveloper({
        email: 'rej.race@leadforge.eg',
        name: 'Rej Race Dev',
        balance: 0,
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01011112222',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });
      expect(payment.status).toBe('PENDING');

      const results = await Promise.allSettled([
        rejectTransferPayment({ prisma, paymentId: payment.id, adminId, reason: 'Reject 1' }),
        rejectTransferPayment({ prisma, paymentId: payment.id, adminId, reason: 'Reject 2' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // With atomic compare-and-set: exactly 1 succeeds, 1 rejected with conflict error
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const paymentFinal = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(paymentFinal.status).toBe('REJECTED');
    });

    it('concurrent approve and reject on the same PENDING payment (approve vs reject race)', async () => {
      const { user } = await createTestDeveloper({
        email: 'app.rej.race@leadforge.eg',
        name: 'App Rej Race Dev',
        balance: 0,
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01022223333',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });
      expect(payment.status).toBe('PENDING');

      const results = await Promise.allSettled([
        approveTransferPayment({ prisma, paymentId: payment.id, adminId }),
        rejectTransferPayment({ prisma, paymentId: payment.id, adminId, reason: 'Concurrent reject' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must win; the other must fail with conflict
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const paymentFinal = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });

      if (paymentFinal.status === 'COMPLETED') {
        expect(accountFinal.balance).toBe(20);
      } else {
        expect(paymentFinal.status).toBe('REJECTED');
        expect(accountFinal.balance).toBe(0);
      }
    });
  });

  // =========================================================================
  // 2. Audit Item: refundClaim & handleLeadInvalidationAfterClaim Concurrency
  // =========================================================================
  describe('2. refundClaim & Lead Invalidation Concurrency', () => {
    it('concurrent refundClaim calls on the same active claim', async () => {
      const { user } = await createTestDeveloper({
        email: 'refund.concur@leadforge.eg',
        name: 'Refund Concur Dev',
        balance: 10,
        planSlug: 'starter',
      });

      const lead = await createTestLead({ businessName: 'Refund Concur Lead' });
      const claim = await claimLead({ leadId: lead.id, developerId: user.id });

      const results = await Promise.allSettled([
        refundClaim({ claimId: claim.claimId, reason: 'Duplicate call 1', refundedBy: adminId }),
        refundClaim({ claimId: claim.claimId, reason: 'Duplicate call 2', refundedBy: adminId }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectedResult = rejected[0] as PromiseRejectedResult;
      expect(rejectedResult.reason?.message).toMatch(/CLAIM_ALREADY_REFUNDED|already been refunded/);

      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      // Started with 10, spent 5 on claim -> 5, refunded 5 -> 10. NOT 15.
      expect(accountFinal.balance).toBe(10);
    });

    it('concurrent handleLeadInvalidationAfterClaim calls on the same lead', async () => {
      const { user: userA } = await createTestDeveloper({
        email: 'inval.userA@leadforge.eg',
        name: 'Inval User A',
        balance: 10,
        planSlug: 'starter',
      });
      const { user: userB } = await createTestDeveloper({
        email: 'inval.userB@leadforge.eg',
        name: 'Inval User B',
        balance: 10,
        planSlug: 'starter',
      });

      const lead = await createTestLead({ businessName: 'Double Invalidation Lead', maxPurchasers: 3 });
      await claimLead({ leadId: lead.id, developerId: userA.id });
      await claimLead({ leadId: lead.id, developerId: userB.id });

      // Run two invalidation calls concurrently for the same lead
      const [res1, res2] = await Promise.all([
        handleLeadInvalidationAfterClaim({
          leadId: lead.id,
          invalidationType: 'INVALID',
          triggeredBy: adminId,
          forceRefund: true,
        }),
        handleLeadInvalidationAfterClaim({
          leadId: lead.id,
          invalidationType: 'INVALID',
          triggeredBy: adminId,
          forceRefund: true,
        }),
      ]);

      const actualNewRefunds = [...res1.refundedClaims, ...res2.refundedClaims].filter(
        (r) => !r.idempotentReplay
      ).length;
      expect(actualNewRefunds).toBe(2);

      const accountA = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: userA.id },
      });
      const accountB = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: userB.id },
      });

      // Both developers must have exactly their 10 credits restored, never duplicated
      expect(accountA.balance).toBe(10);
      expect(accountB.balance).toBe(10);
    });
  });

  // =========================================================================
  // 3. Audit Item: Payment Approval Concurrently with Developer Claim
  // =========================================================================
  describe('3. Payment Approval Concurrently with Developer Claim (syncSubscriptionCreditsToLedgerInTx)', () => {
    it('concurrent approveTransferPayment (+20) and claimLead (-5) preserves both', async () => {
      const { user } = await createTestDeveloper({
        email: 'approve.and.claim@leadforge.eg',
        name: 'Approve & Claim Dev',
        balance: 10,
        planSlug: 'starter',
      });

      const lead = await createTestLead({ businessName: 'Concur Spend Lead' });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01055556666',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });

      // Concurrently approve payment (+20) and claim lead (-5)
      const results = await Promise.allSettled([
        approveTransferPayment({ prisma, paymentId: payment.id, adminId }),
        claimLead({ leadId: lead.id, developerId: user.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(2);

      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });

      // Expected final balance: 10 initial + 20 from approval - 5 from claim = 25
      console.log(`[CONCURRENCY AUDIT] Initial=10, Approve=+20, Claim=-5 => Final Balance=${accountFinal.balance}`);
      expect(accountFinal.balance).toBe(25);
    });
  });
});

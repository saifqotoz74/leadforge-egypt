import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, invalidateUserSessionCache, signSessionToken } from '../src/lib/auth';
import {
  DEFAULT_PLANS,
  approveTransferPayment,
  rejectTransferPayment,
  submitTransferPayment,
} from '../src/lib/payment/provider';
import {
  claimLead,
  ensureDeveloperCreditAccount,
  reconcileCreditAccount,
  refundClaim,
  submitClaimRefundReport,
} from '../src/lib/claims';
import { POST as registerHandler } from '../src/app/api/auth/register/route';
import { POST as claimHandler } from '../src/app/api/leads/[id]/claim/route';
import { POST as approvePaymentHandler } from '../src/app/api/admin/payments/[id]/approve/route';
import { POST as refundReportHandler } from '../src/app/api/developer/claims/[claimId]/refund-report/route';
import { POST as adminRefundHandler } from '../src/app/api/admin/claims/[claimId]/refund/route';

describe('Phase 4B — Money-Path Closure Checks 2', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  let adminId: string;
  let adminToken: string;

  let freePlanId: string;
  let starterPlanId: string;
  let proPlanId: string;
  let businessPlanId: string;

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
    planSlug?: 'free' | 'starter' | 'pro' | 'business';
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
        : params.planSlug === 'business'
        ? businessPlanId
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
    phone?: string | null;
    hasPhone?: boolean;
    exclusive?: boolean;
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
        phone: params.phone !== undefined ? params.phone : '01012345678',
        hasPhone: params.hasPhone !== undefined ? params.hasPhone : Boolean(params.phone ?? '01012345678'),
        leadType: params.accessType ?? (params.exclusive ? 'EXCLUSIVE' : 'SHARED'),
        accessType: params.accessType ?? (params.exclusive ? 'EXCLUSIVE' : 'SHARED'),
        exclusive: params.exclusive ?? false,
        maxPurchasers: params.exclusive ? 1 : params.maxPurchasers ?? 3,
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
    const businessPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'business' } });

    freePlanId = freePlan.id;
    starterPlanId = starterPlan.id;
    proPlanId = proPlan.id;
    businessPlanId = businessPlan.id;

    const adminHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: {
        email: 'admin.phase4b@leadforge.eg',
        name: 'Phase 4B Admin',
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
  // 1. approveTransferPayment & Transfer Lifecycle
  // =========================================================================
  describe('1. approveTransferPayment & Transfer Lifecycle', () => {
    it('approving the same PENDING transfer twice sequentially fails on second attempt', async () => {
      const { user } = await createTestDeveloper({
        email: 'transfer.seq@leadforge.eg',
        name: 'Transfer Seq Dev',
        balance: 5,
        planSlug: 'free',
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01011112222',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });
      expect(payment.status).toBe('PENDING');

      // First approval
      const firstApproval = await approveTransferPayment({
        prisma,
        paymentId: payment.id,
        adminId,
      });
      expect(firstApproval.payment.status).toBe('COMPLETED');
      expect(firstApproval.subscription.credits).toBe(25); // 5 initial + 20 starter

      const accountAfterFirst = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountAfterFirst.balance).toBe(25);

      // Second approval attempt must fail
      await expect(
        approveTransferPayment({
          prisma,
          paymentId: payment.id,
          adminId,
        })
      ).rejects.toThrow(/لا تسمح بالموافقة/);

      // Balance must remain 25, never 45
      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(accountFinal.balance).toBe(25);
    });

    it('concurrent approvals on the same PENDING payment (race condition test)', async () => {
      const { user } = await createTestDeveloper({
        email: 'transfer.race@leadforge.eg',
        name: 'Transfer Race Dev',
        balance: 0,
        planSlug: 'free',
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01099998888',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });
      expect(payment.status).toBe('PENDING');

      // Fire 2 approvals concurrently
      const results = await Promise.allSettled([
        approveTransferPayment({ prisma, paymentId: payment.id, adminId }),
        approveTransferPayment({ prisma, paymentId: payment.id, adminId }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      const accountFinal = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });

      // Correct behavior: Atomic compare-and-set ensures exactly 1 approval succeeds,
      // the second fails cleanly with a conflict error, and points are credited only once (20 points).
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(accountFinal.balance).toBe(20);

      const rejectedResult = rejected[0] as PromiseRejectedResult;
      expect(rejectedResult.reason?.message).toMatch(/لا تسمح بالموافقة|CONFLICT/);
    });

    it('reject after approve is rejected', async () => {
      const { user } = await createTestDeveloper({
        email: 'transfer.rej.after.app@leadforge.eg',
        name: 'Rej After App Dev',
        balance: 0,
        planSlug: 'free',
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01033334444',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });

      await approveTransferPayment({ prisma, paymentId: payment.id, adminId });

      await expect(
        rejectTransferPayment({
          prisma,
          paymentId: payment.id,
          adminId,
        })
      ).rejects.toThrow(/لا تسمح بالرفض/);
    });

    it('approve after reject is rejected', async () => {
      const { user } = await createTestDeveloper({
        email: 'transfer.app.after.rej@leadforge.eg',
        name: 'App After Rej Dev',
        balance: 0,
        planSlug: 'free',
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        senderPhone: '01055556666',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });

      await rejectTransferPayment({ prisma, paymentId: payment.id, adminId });

      await expect(
        approveTransferPayment({
          prisma,
          paymentId: payment.id,
          adminId,
        })
      ).rejects.toThrow(/لا تسمح بالموافقة/);
    });

    it('non-admin user cannot approve payments via API route', async () => {
      const { user: devUser, token: devToken } = await createTestDeveloper({
        email: 'attacker.dev@leadforge.eg',
        name: 'Attacker Dev',
        balance: 0,
        planSlug: 'free',
      });

      const payment = await submitTransferPayment({
        prisma,
        userId: devUser.id,
        planId: starterPlanId,
        senderPhone: '01077778888',
        receiptImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      });

      invalidateUserSessionCache(devUser.id);
      const req = buildJsonRequest(
        `http://localhost:3000/api/admin/payments/${payment.id}/approve`,
        {
          method: 'POST',
          token: devToken, // Developer token, NOT admin
        }
      );

      const res = await approvePaymentHandler(req, { params: { id: payment.id } });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 2. Concurrent Claims & Balance Integrity
  // =========================================================================
  describe('2. Concurrent Claims & Balance Integrity', () => {
    it('two simultaneous claims by the same user on the same lead: debits once, creates one claim', async () => {
      const { user } = await createTestDeveloper({
        email: 'concur.same.user@leadforge.eg',
        name: 'Concur Same User',
        balance: 20,
        planSlug: 'starter',
      });

      const lead = await createTestLead({
        businessName: 'Same User Lead Target',
        maxPurchasers: 3,
      });

      // Fire 2 simultaneous claims on the same lead
      const results = await Promise.allSettled([
        claimLead({ leadId: lead.id, developerId: user.id }),
        claimLead({ leadId: lead.id, developerId: user.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Confirm balance debited exactly once (20 - 5 = 15)
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(15);

      // Confirm only 1 claim record in database
      const claims = await prisma.leadClaim.findMany({
        where: { leadId: lead.id, userId: user.id },
      });
      expect(claims.length).toBe(1);
    });

    it('two users racing for the last shared seat: never exceeds maxPurchasers', async () => {
      const { user: userA } = await createTestDeveloper({
        email: 'race.usera@leadforge.eg',
        name: 'Race User A',
        balance: 10,
        planSlug: 'starter',
      });

      const { user: userB } = await createTestDeveloper({
        email: 'race.userb@leadforge.eg',
        name: 'Race User B',
        balance: 10,
        planSlug: 'starter',
      });

      // Shared lead with maxPurchasers: 1 (only 1 seat available)
      const lead = await createTestLead({
        businessName: 'Last Seat Lead',
        maxPurchasers: 1,
        currentPurchasers: 0,
      });

      const results = await Promise.allSettled([
        claimLead({ leadId: lead.id, developerId: userA.id }),
        claimLead({ leadId: lead.id, developerId: userB.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Lead purchasers count must be exactly 1, not 2
      const leadDb = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadDb.currentPurchasers).toBe(1);
      expect(leadDb.currentPurchasers).toBeLessThanOrEqual(leadDb.maxPurchasers);
    });

    it('user with balance 5 firing two 5-point claims at once: no negative balance', async () => {
      const { user } = await createTestDeveloper({
        email: 'exact5.concur@leadforge.eg',
        name: 'Exact 5 Concur User',
        balance: 5,
        planSlug: 'starter',
      });

      const lead1 = await createTestLead({ businessName: 'Lead One 5pt' });
      const lead2 = await createTestLead({ businessName: 'Lead Two 5pt' });

      // Fire claims for two different leads concurrently
      const results = await Promise.allSettled([
        claimLead({ leadId: lead1.id, developerId: user.id }),
        claimLead({ leadId: lead2.id, developerId: user.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const rejectedResult = rejected[0] as PromiseRejectedResult;
      expect(rejectedResult.reason?.message || rejectedResult.reason?.code).toMatch(
        /INSUFFICIENT_CREDITS|Insufficient credits/
      );

      // Balance must be 0, NEVER negative
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(0);
      expect(account.balance).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 3. Refund Reports & Guardrails Authorization
  // =========================================================================
  describe('3. Refund Reports & Guardrails Authorization', () => {
    it('submitting a refund report twice on the same claim', async () => {
      const { user } = await createTestDeveloper({
        email: 'double.report@leadforge.eg',
        name: 'Double Report Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({ businessName: 'Double Report Lead' });
      const claim = await claimLead({ leadId: lead.id, developerId: user.id });

      // Age claim to 45 minutes
      await prisma.leadClaim.update({
        where: { id: claim.claimId },
        data: { claimedAt: new Date(Date.now() - 45 * 60 * 1000) },
      });

      // First report
      const rep1 = await submitClaimRefundReport({
        claimId: claim.claimId,
        developerId: user.id,
        reason: 'WRONG_PHONE',
        comment: 'Phone disconnected',
      });
      expect(rep1.status).toBe('PENDING_MANUAL_REVIEW');

      // Second report on the exact same claim MUST be rejected
      await expect(
        submitClaimRefundReport({
          claimId: claim.claimId,
          developerId: user.id,
          reason: 'WRONG_PHONE',
          comment: 'Second submission for same claim',
        })
      ).rejects.toThrow(/REFUND_REPORT_ALREADY_EXISTS|تقرير استرداد|already exists/i);

      // Only 1 report must be created and active
      const totalReports = await prisma.leadFeedback.count({
        where: { claimId: claim.claimId, type: 'REFUND_REPORT' },
      });
      expect(totalReports).toBe(1);
    });

    it('submitting refund report after an admin refund throws error', async () => {
      const { user } = await createTestDeveloper({
        email: 'report.after.refund@leadforge.eg',
        name: 'Report After Refund Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({ businessName: 'Refunded Lead Target' });
      const claim = await claimLead({ leadId: lead.id, developerId: user.id });

      // Admin refunds the claim
      await refundClaim({
        claimId: claim.claimId,
        reason: 'Immediate admin refund',
        refundedBy: adminId,
      });

      // Developer tries to report on the refunded claim
      await expect(
        submitClaimRefundReport({
          claimId: claim.claimId,
          developerId: user.id,
          reason: 'BUSINESS_CLOSED',
        })
      ).rejects.toThrow(/Cannot report on a claim with status REFUNDED/);
    });

    it('cannot submit refund report on another user claim (authorization check)', async () => {
      const { user: victimUser } = await createTestDeveloper({
        email: 'victim.claim@leadforge.eg',
        name: 'Victim Dev',
        balance: 10,
        planSlug: 'free',
      });

      const { user: snoopingUser, token: snoopingToken } = await createTestDeveloper({
        email: 'snooper.claim@leadforge.eg',
        name: 'Snooper Dev',
        balance: 10,
        planSlug: 'free',
      });

      const lead = await createTestLead({ businessName: 'Victim Lead' });
      const claim = await claimLead({
        leadId: lead.id,
        developerId: victimUser.id,
      });

      invalidateUserSessionCache(snoopingUser.id);
      const req = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claim.claimId}/refund-report`,
        {
          method: 'POST',
          token: snoopingToken, // Snooper attempting to report on Victim's claim
          body: { reason: 'WRONG_PHONE' },
        }
      );

      const res = await refundReportHandler(req, { params: { claimId: claim.claimId } });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe('CLAIM_NOT_FOUND');
    });
  });

  // =========================================================================
  // 4. End-to-End Registration, Verification & Lead Unlock on Free Plan
  // =========================================================================
  describe('4. End-to-End Lead Unlock on Free Plan (3 Points Balance)', () => {
    it('E2E: Register -> Verify DB -> Onboard -> Unlock Shared Lead WITH Phone', async () => {
      const email = `e2e.shared.phone.${Date.now()}@leadforge.eg`;

      // 1. Register
      const regReq = buildJsonRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: {
          name: 'E2E Tester One',
          email,
          password: 'Password123!',
        },
      });
      const regRes = await registerHandler(regReq);
      expect(regRes.status).toBe(201);
      const regData = await regRes.json();
      const userId = regData.user.id;

      // 2. Simulate email verification in DB
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: new Date() },
      });

      // 3. User has Free plan with 3 credits
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: userId },
      });
      expect(account.balance).toBe(3);

      // 4. Create shared lead WITH phone
      const lead = await createTestLead({
        businessName: 'Dental Clinic Cairo',
        phone: '01011112222',
        hasPhone: true,
        accessType: 'SHARED',
      });

      invalidateUserSessionCache(userId);
      const claimReq = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
        method: 'POST',
        token: regData.token,
      });

      // Shared lead base cost is 5, user has 3
      const claimRes = await claimHandler(claimReq, { params: { id: lead.id } });
      const data = await claimRes.json();

      console.log(`[E2E Result - Shared Lead with Phone]: HTTP ${claimRes.status}`, data);
      expect(claimRes.status).toBe(422);
      expect(data.code).toBe('INSUFFICIENT_CREDITS');
      expect(data.details?.requiredCredits).toBe(5);
      expect(data.details?.currentBalance).toBe(3);
    });

    it('E2E: Register -> Verify DB -> Onboard -> Unlock Lead WITHOUT Phone (Field Visit)', async () => {
      const email = `e2e.no.phone.${Date.now()}@leadforge.eg`;

      // 1. Register
      const regReq = buildJsonRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: {
          name: 'E2E Tester Two',
          email,
          password: 'Password123!',
        },
      });
      const regRes = await registerHandler(regReq);
      expect(regRes.status).toBe(201);
      const regData = await regRes.json();
      const userId = regData.user.id;

      // 2. Simulate email verification in DB
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: new Date() },
      });

      // 3. Create lead WITHOUT phone (field visit)
      const lead = await createTestLead({
        businessName: 'No Phone Workshop',
        phone: null,
        hasPhone: false,
        accessType: 'SHARED',
      });

      invalidateUserSessionCache(userId);
      const claimReq = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
        method: 'POST',
        token: regData.token,
      });

      // Lead without phone has FIELD_VISIT_DISCOUNT cost = 1 point! User has 3 points.
      const claimRes = await claimHandler(claimReq, { params: { id: lead.id } });
      const data = await claimRes.json();

      console.log(`[E2E Result - Lead without Phone]: HTTP ${claimRes.status}`, data);
      expect(claimRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.claim.creditsCharged).toBe(1);

      // Balance reduced from 3 to 2
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: userId },
      });
      expect(account.balance).toBe(2);
    });

    it('E2E: Register -> Verify DB -> Onboard -> Unlock Exclusive Lead', async () => {
      const email = `e2e.exclusive.${Date.now()}@leadforge.eg`;

      // 1. Register
      const regReq = buildJsonRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        body: {
          name: 'E2E Tester Three',
          email,
          password: 'Password123!',
        },
      });
      const regRes = await registerHandler(regReq);
      expect(regRes.status).toBe(201);
      const regData = await regRes.json();
      const userId = regData.user.id;

      // 2. Simulate email verification in DB
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: new Date() },
      });

      // 3. Create exclusive lead
      const lead = await createTestLead({
        businessName: 'Exclusive Enterprise Lead',
        exclusive: true,
        accessType: 'EXCLUSIVE',
      });

      invalidateUserSessionCache(userId);
      const claimReq = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
        method: 'POST',
        token: regData.token,
      });

      const claimRes = await claimHandler(claimReq, { params: { id: lead.id } });
      const data = await claimRes.json();

      console.log(`[E2E Result - Exclusive Lead]: HTTP ${claimRes.status}`, data);
      // Free plan has allowsExclusive: false, rejected with LEAD_ACCESS_DENIED
      expect(claimRes.status).toBe(422);
      expect(data.code).toBe('LEAD_ACCESS_DENIED');
    });
  });
});

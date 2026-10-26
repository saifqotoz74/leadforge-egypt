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
  refundClaim,
  submitClaimRefundReport,
} from '../src/lib/claims';
import { POST as claimLeadHandler } from '../src/app/api/leads/[id]/claim/route';
import { POST as refundReportHandler } from '../src/app/api/developer/claims/[claimId]/refund-report/route';
import { POST as feedbackHandler } from '../src/app/api/leads/[id]/feedback/route';
import { POST as adminRefundClaimHandler } from '../src/app/api/admin/claims/[claimId]/refund/route';

describe('Phase 3 — Financial Integrity, Free-Seat Protection, Refund Guardrails & Email Verification', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  let adminId: string;
  let adminToken: string;

  let freePlanId: string;
  let proPlanId: string;
  let starterPlanId: string;

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
            credits: params.balance ?? 0,
            totalCreditsGranted: params.balance ?? 0,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
    });

    if (params.balance && params.balance > 0) {
      await prisma.developerCreditAccount.create({
        data: {
          developerId: user.id,
          balance: params.balance,
          lifetimePurchased: params.balance,
          totalGranted: params.balance,
        },
      });
      await prisma.creditTransaction.create({
        data: {
          accountId: (await prisma.developerCreditAccount.findUniqueOrThrow({ where: { developerId: user.id } })).id,
          developerId: user.id,
          type: 'PURCHASE',
          amount: params.balance,
          balanceBefore: 0,
          balanceAfter: params.balance,
          reason: 'Initial test balance',
        },
      });
    }

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'DEVELOPER',
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
        maxPurchasers: params.maxPurchasers ?? 2,
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

    // Initialize default plans
    for (const planData of DEFAULT_PLANS) {
      const plan = await prisma.plan.create({ data: planData });
      if (plan.slug === 'free') freePlanId = plan.id;
      if (plan.slug === 'pro') proPlanId = plan.id;
      if (plan.slug === 'starter') starterPlanId = plan.id;
    }

    // Create Admin User
    const adminHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: {
        email: 'admin.phase3@leadforge.eg',
        name: 'Phase 3 Super Admin',
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
      role: 'ADMIN',
    });
  });

  afterAll(async () => {
    await cleanupDb();
  });

  // =========================================================================
  // 1. FIN-03: Financial Integrity & Points Preservation
  // =========================================================================
  describe('FIN-03: Financial Integrity & Points Preservation', () => {
    it('preserves existing unused credits when upgrading subscription plan', async () => {
      // Developer starts with 15 credits
      const { user } = await createTestDeveloper({
        email: 'upgrade.dev@leadforge.eg',
        name: 'Upgrade Test Dev',
        balance: 15,
        planSlug: 'free',
      });

      // Subscribe to Pro plan (+50 credits)
      const subResult = await subscribeUserToPlan({
        prisma,
        userId: user.id,
        planId: proPlanId,
      });

      expect(subResult.subscription.planId).toBe(proPlanId);
      // Crucial: 15 existing + 50 granted = 65 total credits (NOT overwritten to 50)
      expect(subResult.subscription.credits).toBe(65);

      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(65);

      // Verify immutable CreditTransaction ledger entry
      const tx = await prisma.creditTransaction.findFirstOrThrow({
        where: {
          developerId: user.id,
          referenceId: subResult.payment.id,
        },
      });
      expect(tx.type).toBe('PURCHASE');
      expect(tx.amount).toBe(50);
      expect(tx.balanceBefore).toBe(15);
      expect(tx.balanceAfter).toBe(65);
      expect(tx.balanceBefore + tx.amount).toBe(tx.balanceAfter);

      // Reconcile account
      const reconciliation = await reconcileCreditAccount(user.id, prisma);
      expect(reconciliation.isReconciled).toBe(true);
      expect(reconciliation.discrepancy).toBe(0);
    });

    it('does not erase or destroy remaining unused credits when switching to Free plan', async () => {
      // Developer has 45 credits
      const { user } = await createTestDeveloper({
        email: 'downgrade.dev@leadforge.eg',
        name: 'Downgrade Test Dev',
        balance: 45,
        planSlug: 'pro',
      });

      // Switch to Free plan (0 EGP, free)
      const subResult = await subscribeUserToPlan({
        prisma,
        userId: user.id,
        planId: freePlanId,
      });

      expect(subResult.subscription.planId).toBe(freePlanId);
      // Crucial: 45 credits must NOT be zeroed out
      expect(subResult.subscription.credits).toBe(45);

      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(45);

      const reconciliation = await reconcileCreditAccount(user.id, prisma);
      expect(reconciliation.isReconciled).toBe(true);
      expect(reconciliation.discrepancy).toBe(0);
    });

    it('deduplicates payment webhook retries by providerRef without double-granting credits', async () => {
      const { user } = await createTestDeveloper({
        email: 'idempotent.payment@leadforge.eg',
        name: 'Idempotent Payment Dev',
        balance: 10,
        planSlug: 'free',
      });

      const customProvider = {
        providerName: 'SANDBOX_IDEMPOTENT',
        async processSubscriptionCharge() {
          return {
            success: true,
            provider: 'SANDBOX_IDEMPOTENT',
            providerRef: 'PAY-UNIQUE-REF-999',
            status: 'COMPLETED' as const,
          };
        },
      };

      // First payment
      const first = await subscribeUserToPlan({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        paymentProvider: customProvider,
      });
      expect(first.subscription.credits).toBe(30); // 10 + 20 = 30

      // Immediate retry of the identical payment (same providerRef)
      const retry = await subscribeUserToPlan({
        prisma,
        userId: user.id,
        planId: starterPlanId,
        paymentProvider: customProvider,
      });

      // Must return identical payment record and NOT add another 20 credits
      expect(retry.payment.id).toBe(first.payment.id);
      expect(retry.subscription.credits).toBe(30);

      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: user.id },
      });
      expect(account.balance).toBe(30);
    });
  });

  // =========================================================================
  // 2. SEC-04: Free-Plan Seats Protection
  // =========================================================================
  describe('SEC-04: Free-Plan Seats Protection', () => {
    it('free/trial unlocks do not increment currentPurchasers or mark shared leads CLAIMED_FULL', async () => {
      const { user: freeUser1 } = await createTestDeveloper({
        email: 'free1.seat@leadforge.eg',
        name: 'Free Dev One',
        balance: 5,
        planSlug: 'free',
      });

      const { user: freeUser2 } = await createTestDeveloper({
        email: 'free2.seat@leadforge.eg',
        name: 'Free Dev Two',
        balance: 5,
        planSlug: 'free',
      });

      const { user: paidUser } = await createTestDeveloper({
        email: 'paid.seat@leadforge.eg',
        name: 'Paid Pro Dev',
        balance: 50,
        planSlug: 'pro',
      });

      // Create a shared lead with maxPurchasers: 2
      const lead = await createTestLead({
        businessName: 'Al-Amal Dental Center',
        maxPurchasers: 2,
        currentPurchasers: 0,
        accessType: 'SHARED',
      });

      // Free User 1 claims the lead
      const claim1 = await claimLead({ leadId: lead.id, developerId: freeUser1.id });
      expect(claim1.success).toBe(true);

      // Lead purchasers must still be 0, status must still be AVAILABLE
      let refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(refreshedLead.currentPurchasers).toBe(0);
      expect(refreshedLead.status).toBe('AVAILABLE');

      // Free User 2 claims the lead
      const claim2 = await claimLead({ leadId: lead.id, developerId: freeUser2.id });
      expect(claim2.success).toBe(true);

      // Still 0 purchasers! Free unlocks have NOT consumed paid seats
      refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(refreshedLead.currentPurchasers).toBe(0);
      expect(refreshedLead.status).toBe('AVAILABLE');

      // Paid User claims the lead -> now currentPurchasers increments to 1
      const paidClaim = await claimLead({ leadId: lead.id, developerId: paidUser.id });
      expect(paidClaim.success).toBe(true);

      refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(refreshedLead.currentPurchasers).toBe(1);
      expect(refreshedLead.status).toBe('AVAILABLE');
    });

    it('enforces capacity limit when paid shared seats are fully purchased', async () => {
      const { user: paidUser1 } = await createTestDeveloper({
        email: 'paid1.cap@leadforge.eg',
        name: 'Paid Dev 1',
        balance: 50,
        planSlug: 'pro',
      });

      const { user: paidUser2 } = await createTestDeveloper({
        email: 'paid2.cap@leadforge.eg',
        name: 'Paid Dev 2',
        balance: 50,
        planSlug: 'pro',
      });

      const { user: paidUser3 } = await createTestDeveloper({
        email: 'paid3.cap@leadforge.eg',
        name: 'Paid Dev 3',
        balance: 50,
        planSlug: 'pro',
      });

      const lead = await createTestLead({
        businessName: 'Cairo Heart Hospital',
        maxPurchasers: 2,
        currentPurchasers: 0,
        accessType: 'SHARED',
      });

      // Paid Dev 1 claims -> 1/2
      await claimLead({ leadId: lead.id, developerId: paidUser1.id });
      // Paid Dev 2 claims -> 2/2 (full)
      await claimLead({ leadId: lead.id, developerId: paidUser2.id });

      const fullLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(fullLead.currentPurchasers).toBe(2);
      expect(fullLead.status).toBe('CLAIMED_FULL');

      // Paid Dev 3 attempt is rejected with 409 LEAD_SHARED_MAX_PURCHASERS_REACHED
      await expect(
        claimLead({ leadId: lead.id, developerId: paidUser3.id })
      ).rejects.toMatchObject({
        code: 'LEAD_SHARED_MAX_PURCHASERS_REACHED',
        statusCode: 409,
      });
    });

    it('refund recalculation counts only active paid claims towards currentPurchasers', async () => {
      const { user: freeUser } = await createTestDeveloper({
        email: 'free.recount@leadforge.eg',
        name: 'Free Recount Dev',
        balance: 5,
        planSlug: 'free',
      });

      const { user: paidUser } = await createTestDeveloper({
        email: 'paid.recount@leadforge.eg',
        name: 'Paid Recount Dev',
        balance: 50,
        planSlug: 'pro',
      });

      const lead = await createTestLead({
        businessName: 'Nile Dental Polyclinic',
        maxPurchasers: 2,
        currentPurchasers: 0,
        accessType: 'SHARED',
      });

      await claimLead({ leadId: lead.id, developerId: freeUser.id });
      const paidClaim = await claimLead({ leadId: lead.id, developerId: paidUser.id });

      let leadDb = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadDb.currentPurchasers).toBe(1);

      // Refund the paid claim
      const refundResult = await refundClaim({
        claimId: paidClaim.claimId,
        reason: 'Client requested refund',
        refundedBy: adminId,
      });
      expect(refundResult.status).toBe('REFUNDED');

      // Recalculated purchasers should now be 0 (free claim does NOT count as a purchaser)
      leadDb = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(leadDb.currentPurchasers).toBe(0);
      expect(leadDb.status).toBe('AVAILABLE');
    });
  });

  // =========================================================================
  // 3. SEC-03: Email Verification Gate
  // =========================================================================
  describe('SEC-03: Email Verification Gate', () => {
    it('blocks unverified accounts from claiming leads via claimLead and API route', async () => {
      const { user: unverifiedDev, token: unverifiedToken } = await createTestDeveloper({
        email: 'unverified.dev@leadforge.eg',
        name: 'Unverified Developer',
        balance: 50,
        planSlug: 'pro',
        emailVerified: null, // explicitly unverified
      });

      const lead = await createTestLead({
        businessName: 'Giza Specialized Clinic',
        maxPurchasers: 3,
        currentPurchasers: 0,
      });

      // 1. claimLead direct service call must reject with 403 EMAIL_NOT_VERIFIED
      await expect(
        claimLead({ leadId: lead.id, developerId: unverifiedDev.id })
      ).rejects.toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
        statusCode: 403,
      });

      // 2. HTTP POST /api/leads/[id]/claim must return HTTP 403 with code EMAIL_NOT_VERIFIED
      const req = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
        method: 'POST',
        token: unverifiedToken,
      });
      const res = await claimLeadHandler(req, { params: { id: lead.id } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('EMAIL_NOT_VERIFIED');

      // Verify that no credits were debited and no claim was created
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: unverifiedDev.id },
      });
      expect(account.balance).toBe(50);

      const claimsCount = await prisma.leadClaim.count({
        where: { userId: unverifiedDev.id },
      });
      expect(claimsCount).toBe(0);

      // Verify email now and invalidate auth cache
      await prisma.user.update({
        where: { id: unverifiedDev.id },
        data: { emailVerified: new Date() },
      });
      invalidateUserSessionCache(unverifiedDev.id);

      // Verified developer should now successfully claim the lead
      const successRes = await claimLeadHandler(req, { params: { id: lead.id } });
      expect(successRes.status).toBe(200);
      const successBody = await successRes.json();
      expect(successBody.claimId).toBeDefined();
    });
  });

  // =========================================================================
  // 4. FIN-04: Refund Policy & Guardrails
  // =========================================================================
  describe('FIN-04: Refund Policy & Guardrails', () => {
    it('rejects refund report submitted before 30 minutes since claim (WAIT_PERIOD_REQUIRED)', async () => {
      const { user: dev, token } = await createTestDeveloper({
        email: 'quick.refund@leadforge.eg',
        name: 'Quick Refund Dev',
        balance: 30,
        planSlug: 'pro',
      });

      const lead = await createTestLead({
        businessName: 'Speedy Dental Clinic',
      });

      const claim = await claimLead({ leadId: lead.id, developerId: dev.id });

      // Immediate refund report attempt (< 30 minutes)
      const reportReq = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claim.claimId}/refund-report`,
        {
          method: 'POST',
          token,
          body: { reason: 'WRONG_PHONE', comment: 'Immediate check' },
        }
      );
      const res = await refundReportHandler(reportReq, { params: { claimId: claim.claimId } });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('WAIT_PERIOD_REQUIRED');
      expect(body.details.minWaitMs).toBe(30 * 60 * 1000);
    });

    it('accepts refund report after 30 minutes and leaves it in PENDING_MANUAL_REVIEW without auto-refund', async () => {
      const { user: dev, token } = await createTestDeveloper({
        email: 'mature.refund@leadforge.eg',
        name: 'Mature Refund Dev',
        balance: 30,
        planSlug: 'pro',
      });

      const lead = await createTestLead({
        businessName: 'Aged Dental Practice',
      });

      const claim = await claimLead({ leadId: lead.id, developerId: dev.id });

      // Age the claim by 35 minutes
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
      await prisma.leadClaim.update({
        where: { id: claim.claimId },
        data: { claimedAt: thirtyFiveMinutesAgo },
      });

      const reportReq = buildJsonRequest(
        `http://localhost:3000/api/developer/claims/${claim.claimId}/refund-report`,
        {
          method: 'POST',
          token,
          body: { reason: 'WRONG_PHONE', comment: 'Called twice, person says residential flat' },
        }
      );
      const res = await refundReportHandler(reportReq, { params: { claimId: claim.claimId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('PENDING_MANUAL_REVIEW');
      expect(body.targetReviewHours).toBe(24);

      // Verify credits are NOT refunded automatically
      const account = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: dev.id },
      });
      expect(account.balance).toBe(25); // 30 - 5 = 25; no auto refund

      // Admin reviews and approves the refund
      const adminReq = buildJsonRequest(
        `http://localhost:3000/api/admin/claims/${claim.claimId}/refund`,
        {
          method: 'POST',
          token: adminToken,
          body: { reason: 'Approved after verification of residential phone' },
        }
      );
      const adminRes = await adminRefundClaimHandler(adminReq, { params: { claimId: claim.claimId } });
      expect(adminRes.status).toBe(200);

      // Credits now refunded exactly once
      const refundedAccount = await prisma.developerCreditAccount.findUniqueOrThrow({
        where: { developerId: dev.id },
      });
      expect(refundedAccount.balance).toBe(30);
    });

    it('enforces trial user cap of max 2 refund reports per rolling 30 days', async () => {
      const { user: trialDev, token: trialToken } = await createTestDeveloper({
        email: 'trial.disputes@leadforge.eg',
        name: 'Trial Dispute Dev',
        balance: 15,
        planSlug: 'free', // Free / trial plan
      });

      // Create 3 aged claims
      const lead1 = await createTestLead({ businessName: 'Trial Lead 1' });
      const lead2 = await createTestLead({ businessName: 'Trial Lead 2' });
      const lead3 = await createTestLead({ businessName: 'Trial Lead 3' });

      const claim1 = await claimLead({ leadId: lead1.id, developerId: trialDev.id });
      const claim2 = await claimLead({ leadId: lead2.id, developerId: trialDev.id });
      const claim3 = await claimLead({ leadId: lead3.id, developerId: trialDev.id });

      const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000);
      await prisma.leadClaim.updateMany({
        where: { id: { in: [claim1.claimId, claim2.claimId, claim3.claimId] } },
        data: { claimedAt: fortyMinutesAgo },
      });

      // Report 1: Succeeds
      const rep1 = await refundReportHandler(
        buildJsonRequest(`http://localhost:3000/api/developer/claims/${claim1.claimId}/refund-report`, {
          method: 'POST',
          token: trialToken,
          body: { reason: 'WRONG_PHONE' },
        }),
        { params: { claimId: claim1.claimId } }
      );
      expect(rep1.status).toBe(200);

      // Report 2: Succeeds
      const rep2 = await refundReportHandler(
        buildJsonRequest(`http://localhost:3000/api/developer/claims/${claim2.claimId}/refund-report`, {
          method: 'POST',
          token: trialToken,
          body: { reason: 'BUSINESS_CLOSED' },
        }),
        { params: { claimId: claim2.claimId } }
      );
      expect(rep2.status).toBe(200);

      // Report 3: Fails with TRIAL_REFUND_LIMIT_EXCEEDED
      const rep3 = await refundReportHandler(
        buildJsonRequest(`http://localhost:3000/api/developer/claims/${claim3.claimId}/refund-report`, {
          method: 'POST',
          token: trialToken,
          body: { reason: 'DUPLICATE' },
        }),
        { params: { claimId: claim3.claimId } }
      );
      expect(rep3.status).toBe(422);
      const rep3Body = await rep3.json();
      expect(rep3Body.code).toBe('TRIAL_REFUND_LIMIT_EXCEEDED');
      expect(rep3Body.details.maxAllowedPerMonth).toBe(2);
    });

    it('paid plan users are not constrained by the 2-per-month trial refund report cap', async () => {
      const { user: proDev, token: proToken } = await createTestDeveloper({
        email: 'pro.multireport@leadforge.eg',
        name: 'Pro Multi Report Dev',
        balance: 50,
        planSlug: 'pro',
      });

      const leads = await Promise.all([
        createTestLead({ businessName: 'Pro Dispute 1' }),
        createTestLead({ businessName: 'Pro Dispute 2' }),
        createTestLead({ businessName: 'Pro Dispute 3' }),
      ]);

      const claims = await Promise.all([
        claimLead({ leadId: leads[0].id, developerId: proDev.id }),
        claimLead({ leadId: leads[1].id, developerId: proDev.id }),
        claimLead({ leadId: leads[2].id, developerId: proDev.id }),
      ]);

      const fortyMinutesAgo = new Date(Date.now() - 40 * 60 * 1000);
      await prisma.leadClaim.updateMany({
        where: { id: { in: claims.map((c) => c.claimId) } },
        data: { claimedAt: fortyMinutesAgo },
      });

      for (let i = 0; i < 3; i++) {
        const rep = await refundReportHandler(
          buildJsonRequest(`http://localhost:3000/api/developer/claims/${claims[i].claimId}/refund-report`, {
            method: 'POST',
            token: proToken,
            body: { reason: 'WRONG_PHONE', comment: `Pro report ${i + 1}` },
          }),
          { params: { claimId: claims[i].claimId } }
        );
        expect(rep.status).toBe(200);
        const repBody = await rep.json();
        expect(repBody.success).toBe(true);
      }
    });
  });
});

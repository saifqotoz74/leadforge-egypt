import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, signSessionToken } from '../src/lib/auth';
import { DEFAULT_SCORING_RULES } from '../src/lib/scoring-engine';
import { DEFAULT_PLANS } from '../src/lib/payment/provider';
import { runIngestionPipeline } from '../src/lib/collectors';
import { resetRateLimits } from '../src/lib/rate-limit';
import {
  adjustDeveloperCreditsByAdmin,
  calculateLeadCreditCost,
  ClaimEngineError,
  claimLead,
  expireStaleClaims,
  getRecentClaimEngineLogs,
  handleLeadInvalidationAfterClaim,
  reconcileCreditAccount,
  refundClaim,
  resolveLeadAccessPolicy,
} from '../src/lib/claims';
import { POST as claimLeadPostHandler } from '../src/app/api/leads/[id]/claim/route';
import { GET as getLeadByIdHandler } from '../src/app/api/leads/[id]/route';
import { GET as getDeveloperClaimsHandler } from '../src/app/api/developer/claims/route';
import { GET as getDeveloperClaimByIdHandler } from '../src/app/api/developer/claims/[claimId]/route';
import { GET as getDeveloperCreditsHandler } from '../src/app/api/developer/credits/route';
import { POST as adminRefundClaimHandler } from '../src/app/api/admin/claims/[claimId]/refund/route';
import { POST as adminAdjustCreditsHandler } from '../src/app/api/admin/developers/[developerId]/credits/adjust/route';
import { GET as adminClaimsGetHandler } from '../src/app/api/admin/claims/route';
import { GET as adminCreditsGetHandler } from '../src/app/api/admin/credits/route';
import { PATCH as adminLeadPatchHandler } from '../src/app/api/admin/leads/[id]/route';
import { GET as getDeveloperDashboardHandler } from '../src/app/api/developer/dashboard/route';
import { GET as getLeadVerificationHandler } from '../src/app/api/leads/[id]/verification/route';
import { GET as getDeveloperMatchesHandler } from '../src/app/api/matching/developers/[developerId]/route';

describe('Phase 5 — Production-Grade Claim, Credits & Shared / Exclusive Leads Engine', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  let adminId: string;
  let adminToken: string;

  let proPlanId: string;
  let freePlanId: string;

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
    balance: number;
    planSlug?: 'pro' | 'free';
    status?: 'ACTIVE' | 'SUSPENDED';
    withProfile?: boolean;
    profileOverrides?: {
      services?: string[];
      locations?: string[];
      niches?: string[];
      minBudget?: number;
      maxBudget?: number;
      leadType?: string;
      isActive?: boolean;
      isAcceptingLeads?: boolean;
      maxActiveLeads?: number | null;
    };
  }) {
    const passwordHash = await hashPassword('DevTest@123');
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const planId = params.planSlug === 'free' ? freePlanId : proPlanId;

    const user = await prisma.user.create({
      data: {
        email: params.email,
        name: params.name,
        passwordHash,
        role: 'DEVELOPER',
        status: params.status ?? 'ACTIVE',
        emailVerified: new Date(),
        ...(params.withProfile !== false
          ? {
              developerProfile: {
                create: {
                  services: params.profileOverrides?.services ?? ['Website Development'],
                  locations: params.profileOverrides?.locations ?? ['القاهرة', 'الجيزة'],
                  niches: params.profileOverrides?.niches ?? ['Dental', 'Medical', 'Restaurant'],
                  leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
                  minBudget: params.profileOverrides?.minBudget ?? 3000,
                  maxBudget: params.profileOverrides?.maxBudget ?? 100000,
                  leadType: params.profileOverrides?.leadType ?? 'BOTH',
                  isActive: params.profileOverrides?.isActive ?? true,
                  isAcceptingLeads: params.profileOverrides?.isAcceptingLeads ?? true,
                  maxActiveLeads: params.profileOverrides?.maxActiveLeads ?? null,
                },
              },
            }
          : {}),
        subscription: {
          create: {
            planId,
            status: 'ACTIVE',
            credits: params.balance,
            totalCreditsGranted: params.balance,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
        creditAccount: {
          create: {
            balance: params.balance,
            lifetimePurchased: params.balance,
            totalGranted: params.balance,
            version: 1,
          },
        },
      },
      include: { creditAccount: true },
    });

    if (params.balance > 0 && user.creditAccount) {
      await prisma.creditTransaction.create({
        data: {
          accountId: user.creditAccount.id,
          developerId: user.id,
          type: 'PURCHASE',
          amount: params.balance,
          balanceBefore: 0,
          balanceAfter: params.balance,
          referenceType: 'TEST_INIT',
          referenceId: user.id,
          reason: 'Initial test credit grant',
          idempotencyKey: `test-init-${user.id}`,
        },
      });
    }

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      role: 'DEVELOPER',
      name: user.name,
    });

    return { user, token };
  }

  async function createSaleableLead(params: {
    name: string;
    phone: string;
    accessType?: 'SHARED' | 'EXCLUSIVE';
    maxPurchasers?: number;
    creditCost?: number | null;
    creditCostReason?: string | null;
    category?: string;
    city?: string;
    governorate?: string;
    estimatedBudget?: number;
    minClaimQualityScore?: number | null;
    minClaimOpportunityScore?: number | null;
    claimWindowEndsAt?: Date | null;
  }) {
    const accessType = params.accessType ?? 'SHARED';
    const report = await runIngestionPipeline({
      prisma,
      userId: adminId,
      sourceName: 'Phase 5 Test Source',
      rawRecords: [
        {
          name: params.name,
          category: params.category ?? 'Dental',
          city: params.city ?? 'القاهرة',
          governorate: params.governorate ?? 'القاهرة',
          phone: params.phone,
          facebook: `https://facebook.com/${params.phone}`,
          rating: 4.9,
          reviewCount: 180,
          leadType: accessType,
          maxPurchasers: accessType === 'EXCLUSIVE' ? 1 : (params.maxPurchasers ?? 3),
        },
      ],
    });

    const leadId = report.records[0].leadId!;
    return prisma.lead.update({
      where: { id: leadId },
      data: {
        accessType,
        leadType: accessType,
        exclusive: accessType === 'EXCLUSIVE',
        maxPurchasers: accessType === 'EXCLUSIVE' ? 1 : (params.maxPurchasers ?? 3),
        creditCost: params.creditCost ?? null,
        creditCostReason: params.creditCostReason ?? null,
        availableForClaim: true,
        ...(params.estimatedBudget !== undefined ? { estimatedBudget: params.estimatedBudget } : {}),
        ...(params.minClaimQualityScore !== undefined
          ? { minClaimQualityScore: params.minClaimQualityScore }
          : {}),
        ...(params.minClaimOpportunityScore !== undefined
          ? { minClaimOpportunityScore: params.minClaimOpportunityScore }
          : {}),
        ...(params.claimWindowEndsAt !== undefined
          ? { claimWindowEndsAt: params.claimWindowEndsAt }
          : {}),
      },
    });
  }

  beforeAll(async () => {
    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(testDb.prisma, testDb.pglite);

    for (const rule of DEFAULT_SCORING_RULES) {
      await prisma.scoringRule.create({
        data: {
          id: rule.id,
          code: rule.code,
          name: rule.name,
          nameEn: rule.nameEn,
          weight: rule.weight,
          enabled: rule.enabled,
          field: rule.field,
          operator: rule.operator,
          targetValue: rule.targetValue,
          sortOrder: rule.sortOrder || 0,
        },
      });
    }

    for (const p of DEFAULT_PLANS) {
      const created = await prisma.plan.create({ data: p });
      if (p.slug === 'pro') proPlanId = created.id;
      if (p.slug === 'free') freePlanId = created.id;
    }

    await prisma.creditPricingConfig.create({
      data: {
        id: 'default',
        version: 'v1',
        sharedLeadBaseCost: 5,
        exclusiveLeadBaseCost: 25,
        sharedBaseCost: 5,
        exclusiveBaseCost: 25,
      },
    });

    const adminPasswordHash = await hashPassword('Admin@12345');
    const admin = await prisma.user.create({
      data: {
        email: 'admin.phase5@leadforge.eg',
        name: 'Phase 5 Admin',
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
      },
    });
    adminId = admin.id;
    adminToken = await signSessionToken({
      userId: admin.id,
      email: admin.email,
      role: 'ADMIN',
      name: admin.name,
    });
  });

  afterAll(async () => {
    if (cleanupDb) {
      await cleanupDb();
    }
  });

  describe('1. Deterministic Credit Pricing & LeadAccessPolicy Engine', () => {
    it('calculates deterministic credit costs for SHARED (5), EXCLUSIVE (25), explicit override, and tier bonuses', () => {
      const sharedPricing = calculateLeadCreditCost({
        id: 'lead-shared-1',
        accessType: 'SHARED',
        leadType: 'SHARED',
      });
      expect(sharedPricing.creditCost).toBe(5);
      expect(sharedPricing.creditCostReason).toBe('SHARED_LEAD');
      expect(sharedPricing.explanation.baseReason).toBe('SHARED_LEAD');

      const exclusivePricing = calculateLeadCreditCost({
        id: 'lead-excl-1',
        accessType: 'EXCLUSIVE',
        leadType: 'EXCLUSIVE',
      });
      expect(exclusivePricing.creditCost).toBe(25);
      expect(exclusivePricing.creditCostReason).toBe('EXCLUSIVE_LEAD');
      expect(exclusivePricing.explanation.baseReason).toBe('EXCLUSIVE_LEAD');

      const explicitOverride = calculateLeadCreditCost({
        id: 'lead-custom-1',
        accessType: 'SHARED',
        creditCost: 12,
        creditCostReason: 'PREMIUM_MEDICAL_SHARED',
      });
      expect(explicitOverride.creditCost).toBe(12);
      expect(explicitOverride.creditCostReason).toBe('PREMIUM_MEDICAL_SHARED');
      expect(explicitOverride.explanation.baseReason).toBe('EXPLICIT_LEAD_COST');

      const tieredPricing = calculateLeadCreditCost(
        {
          id: 'lead-tiered-1',
          accessType: 'SHARED',
          score: 90,
          qualityScore: 92,
          estimatedBudget: 600000,
          freshnessStatus: 'FRESH',
        },
        {
          sharedLeadBaseCost: 5,
          highOpportunityCostBonus: 3,
          highOpportunityThreshold: 80,
          highQualityCostBonus: 2,
          highQualityThreshold: 85,
          highBudgetCostBonus: 4,
          highBudgetThresholdEgp: 500000,
          freshLeadBonus: 1,
        }
      );
      expect(tieredPricing.creditCost).toBe(15);
      expect(tieredPricing.explanation.factors).toHaveLength(4);
    });

    it('resolves LeadAccessPolicy accurately for available, full, and expired claim window leads', () => {
      const availableSharedPolicy = resolveLeadAccessPolicy({
        id: 'lead-p1',
        accessType: 'SHARED',
        maxPurchasers: 3,
        currentPurchasers: 1,
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
      });
      expect(availableSharedPolicy.accessType).toBe('SHARED');
      expect(availableSharedPolicy.creditCost).toBe(5);
      expect(availableSharedPolicy.maxPurchasers).toBe(3);
      expect(availableSharedPolicy.purchaserCount).toBe(1);
      expect(availableSharedPolicy.availableForClaim).toBe(true);

      const expiredWindowPolicy = resolveLeadAccessPolicy({
        id: 'lead-p2',
        accessType: 'EXCLUSIVE',
        maxPurchasers: 1,
        currentPurchasers: 0,
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
        claimWindowEndsAt: new Date(Date.now() - 60_000),
      });
      expect(expiredWindowPolicy.availableForClaim).toBe(false);
    });
  });

  describe('2. Credit Deduction, Insufficient Balance & Immutable Ledger Reconciliation', () => {
    it('Test 1 — Deducts exact credits (5 for Shared) and records immutable CLAIM transaction with reconciled balance', async () => {
      const { user: dev, token } = await createTestDeveloper({
        email: 'dev.deduct@leadforge.eg',
        name: 'Credit Deduction Dev',
        balance: 20,
      });

      const sharedLead = await createSaleableLead({
        name: 'Modern Dental Care Nasr City',
        phone: '01011122201',
        accessType: 'SHARED',
      });

      const req = buildJsonRequest(`http://localhost:3000/api/leads/${sharedLead.id}/claim`, {
        method: 'POST',
        token,
      });
      const res = await claimLeadPostHandler(req, { params: { id: sharedLead.id } });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.status).toBe('ACTIVE');
      expect(body.accessType).toBe('SHARED');
      expect(body.creditsCharged).toBe(5);
      expect(body.creditCostReason).toBe('SHARED_LEAD');
      expect(body.remainingBalance).toBe(15);
      expect(body.accessGranted).toBe(true);
      expect(body.lead.phone).toBe('01011122201');

      const reconciliation = await reconcileCreditAccount(dev.id, prisma);
      expect(reconciliation.currentBalance).toBe(15);
      expect(reconciliation.ledgerSum).toBe(15);
      expect(reconciliation.isReconciled).toBe(true);
      expect(reconciliation.transactionCount).toBe(2); // +20 PURCHASE, -5 CLAIM
    });

    it('Test 2 — Rejects claim with 422 INSUFFICIENT_CREDITS when balance (3) < lead cost (5), leaving balance and purchaserCount unchanged', async () => {
      const { user: dev, token } = await createTestDeveloper({
        email: 'dev.lowbalance@leadforge.eg',
        name: 'Low Balance Dev',
        balance: 3,
      });

      const sharedLead = await createSaleableLead({
        name: 'Heliopolis Smile Clinic',
        phone: '01011122202',
        accessType: 'SHARED',
      });

      const req = buildJsonRequest(`http://localhost:3000/api/leads/${sharedLead.id}/claim`, {
        method: 'POST',
        token,
      });
      const res = await claimLeadPostHandler(req, { params: { id: sharedLead.id } });
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('INSUFFICIENT_CREDITS');

      const reconciliation = await reconcileCreditAccount(dev.id, prisma);
      expect(reconciliation.currentBalance).toBe(3);
      expect(reconciliation.ledgerSum).toBe(3);
      expect(reconciliation.isReconciled).toBe(true);

      const refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: sharedLead.id } });
      expect(refreshedLead.currentPurchasers).toBe(0);
    });
  });

  describe('3. Exclusive & Shared Lead Ownership, Purchaser Cap & Double-Claim Prevention', () => {
    it('Test 3 — Exclusive Lead Single Claim: Dev A succeeds (cost 25), Dev B fails with 409 LEAD_EXCLUSIVE_ALREADY_CLAIMED', async () => {
      const { user: devA } = await createTestDeveloper({
        email: 'dev.excl.a@leadforge.eg',
        name: 'Exclusive Winner Dev',
        balance: 40,
      });
      const { user: devB, token: tokenB } = await createTestDeveloper({
        email: 'dev.excl.b@leadforge.eg',
        name: 'Exclusive Second Dev',
        balance: 40,
      });

      const exclusiveLead = await createSaleableLead({
        name: 'VIP Maadi Dental Implant Center',
        phone: '01011122203',
        accessType: 'EXCLUSIVE',
      });

      const claimA = await claimLead({
        leadId: exclusiveLead.id,
        developerId: devA.id,
      });
      expect(claimA.creditsCharged).toBe(25);
      expect(claimA.remainingBalance).toBe(15);
      expect(claimA.lead.availableForClaim).toBe(false);
      expect(claimA.lead.currentPurchasers).toBe(1);

      const resB = await claimLeadPostHandler(
        buildJsonRequest(`http://localhost:3000/api/leads/${exclusiveLead.id}/claim`, {
          method: 'POST',
          token: tokenB,
        }),
        { params: { id: exclusiveLead.id } }
      );
      expect(resB.status).toBe(409);
      const bodyB = await resB.json();
      expect(bodyB.code).toBe('LEAD_EXCLUSIVE_ALREADY_CLAIMED');

      // Dev B's credits must remain untouched at 40
      const recB = await reconcileCreditAccount(devB.id, prisma);
      expect(recB.currentBalance).toBe(40);
      expect(recB.isReconciled).toBe(true);
    });

    it('Test 4 — Shared Lead Max Purchasers (maxPurchasers = 3): 3 developers succeed, 4th fails with 409 LEAD_SHARED_MAX_PURCHASERS_REACHED', async () => {
      const devs = await Promise.all([
        createTestDeveloper({ email: 'shared.d1@leadforge.eg', name: 'Shared D1', balance: 20 }),
        createTestDeveloper({ email: 'shared.d2@leadforge.eg', name: 'Shared D2', balance: 20 }),
        createTestDeveloper({ email: 'shared.d3@leadforge.eg', name: 'Shared D3', balance: 20 }),
        createTestDeveloper({ email: 'shared.d4@leadforge.eg', name: 'Shared D4', balance: 20 }),
      ]);

      const sharedLead = await createSaleableLead({
        name: 'Zamalek Dental Studio',
        phone: '01011122204',
        accessType: 'SHARED',
        maxPurchasers: 3,
      });

      const c1 = await claimLead({ leadId: sharedLead.id, developerId: devs[0].user.id });
      expect(c1.lead.currentPurchasers).toBe(1);
      expect(c1.lead.availableForClaim).toBe(true);

      const c2 = await claimLead({ leadId: sharedLead.id, developerId: devs[1].user.id });
      expect(c2.lead.currentPurchasers).toBe(2);
      expect(c2.lead.availableForClaim).toBe(true);

      const c3 = await claimLead({ leadId: sharedLead.id, developerId: devs[2].user.id });
      expect(c3.lead.currentPurchasers).toBe(3);
      expect(c3.lead.availableForClaim).toBe(false);

      // 4th developer must fail with 409 LEAD_SHARED_MAX_PURCHASERS_REACHED
      await expect(
        claimLead({ leadId: sharedLead.id, developerId: devs[3].user.id })
      ).rejects.toMatchObject({
        code: 'LEAD_SHARED_MAX_PURCHASERS_REACHED',
        statusCode: 409,
      });

      const rec4 = await reconcileCreditAccount(devs[3].user.id, prisma);
      expect(rec4.currentBalance).toBe(20);
    });

    it('Test 5 — Double Claim by Same Developer: second attempt fails with 409 LEAD_ALREADY_CLAIMED_BY_DEVELOPER without deducting credits', async () => {
      const { user: dev } = await createTestDeveloper({
        email: 'double.claim@leadforge.eg',
        name: 'Double Claim Dev',
        balance: 30,
      });

      const sharedLead = await createSaleableLead({
        name: 'Dokki Dental Care',
        phone: '01011122205',
        accessType: 'SHARED',
        maxPurchasers: 3,
      });

      await claimLead({ leadId: sharedLead.id, developerId: dev.id });

      await expect(
        claimLead({ leadId: sharedLead.id, developerId: dev.id })
      ).rejects.toMatchObject({
        code: 'LEAD_ALREADY_CLAIMED_BY_DEVELOPER',
        statusCode: 409,
      });

      const rec = await reconcileCreditAccount(dev.id, prisma);
      expect(rec.currentBalance).toBe(25);
      expect(rec.isReconciled).toBe(true);
    });
  });

  describe('4. Idempotency Protection', () => {
    it('Test 6 — Idempotent Claim Request: same Idempotency-Key returns existing claim without second deduction; reusing key on different lead returns 409 IDEMPOTENCY_CONFLICT', async () => {
      const { user: dev, token } = await createTestDeveloper({
        email: 'idempotent.dev@leadforge.eg',
        name: 'Idempotent Dev',
        balance: 30,
      });

      const lead1 = await createSaleableLead({
        name: 'Idempotent Clinic One',
        phone: '01011122206',
        accessType: 'SHARED',
      });
      const lead2 = await createSaleableLead({
        name: 'Idempotent Clinic Two',
        phone: '01011122207',
        accessType: 'SHARED',
      });

      const idemKey = 'idem-claim-key-001';

      const res1 = await claimLeadPostHandler(
        buildJsonRequest(`http://localhost:3000/api/leads/${lead1.id}/claim`, {
          method: 'POST',
          token,
          idempotencyKey: idemKey,
        }),
        { params: { id: lead1.id } }
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.idempotentReplay).toBe(false);
      expect(body1.remainingBalance).toBe(25);

      // Replay with exact same Idempotency-Key and leadId
      const res2 = await claimLeadPostHandler(
        buildJsonRequest(`http://localhost:3000/api/leads/${lead1.id}/claim`, {
          method: 'POST',
          token,
          idempotencyKey: idemKey,
        }),
        { params: { id: lead1.id } }
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.idempotentReplay).toBe(true);
      expect(body2.claimId).toBe(body1.claimId);
      expect(body2.transactionId).toBe(body1.transactionId);
      expect(body2.remainingBalance).toBe(25);

      const refreshedLead1 = await prisma.lead.findUniqueOrThrow({ where: { id: lead1.id } });
      expect(refreshedLead1.currentPurchasers).toBe(1);

      // Reusing same Idempotency-Key on a DIFFERENT lead must fail with 409 IDEMPOTENCY_CONFLICT
      const resConflict = await claimLeadPostHandler(
        buildJsonRequest(`http://localhost:3000/api/leads/${lead2.id}/claim`, {
          method: 'POST',
          token,
          idempotencyKey: idemKey,
        }),
        { params: { id: lead2.id } }
      );
      expect(resConflict.status).toBe(409);
      const conflictBody = await resConflict.json();
      expect(conflictBody.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('5. Concurrency & Race Condition Protection', () => {
    it('Test 7 — Concurrent Exclusive Claim Race Condition: 5 developers claim 1 exclusive lead simultaneously -> 1 succeeds, 4 fail, 1 deduction', async () => {
      const devs = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          createTestDeveloper({
            email: `race.excl.${n}@leadforge.eg`,
            name: `Race Excl Dev ${n}`,
            balance: 30,
          })
        )
      );

      const exclusiveLead = await createSaleableLead({
        name: 'Race Condition Exclusive Dental Hospital',
        phone: '01011122208',
        accessType: 'EXCLUSIVE',
      });

      const outcomes = await Promise.allSettled(
        devs.map((d) =>
          claimLead({
            leadId: exclusiveLead.id,
            developerId: d.user.id,
          })
        )
      );

      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const failed = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(4);
      for (const f of failed) {
        expect(f.reason).toBeInstanceOf(ClaimEngineError);
        expect((f.reason as ClaimEngineError).code).toBe('LEAD_EXCLUSIVE_ALREADY_CLAIMED');
      }

      const refreshedLead = await prisma.lead.findUniqueOrThrow({
        where: { id: exclusiveLead.id },
      });
      expect(refreshedLead.currentPurchasers).toBe(1);
      expect(refreshedLead.availableForClaim).toBe(false);

      const activeClaims = await prisma.leadClaim.findMany({
        where: { leadId: exclusiveLead.id, status: 'ACTIVE' },
      });
      expect(activeClaims).toHaveLength(1);

      // Reconcile all 5 developers: 1 has balance 5, 4 have balance 30
      const reconciliations = await Promise.all(
        devs.map((d) => reconcileCreditAccount(d.user.id, prisma))
      );
      expect(reconciliations.every((r) => r.isReconciled)).toBe(true);
      expect(reconciliations.filter((r) => r.currentBalance === 5)).toHaveLength(1);
      expect(reconciliations.filter((r) => r.currentBalance === 30)).toHaveLength(4);
    });

    it('Test 8 — Concurrent Shared Claim Race Condition: 5 developers claim 1 shared lead (maxPurchasers = 3) simultaneously -> 3 succeed, 2 fail', async () => {
      const devs = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          createTestDeveloper({
            email: `race.shared.${n}@leadforge.eg`,
            name: `Race Shared Dev ${n}`,
            balance: 20,
          })
        )
      );

      const sharedLead = await createSaleableLead({
        name: 'Race Condition Shared Clinic Cairo',
        phone: '01011122209',
        accessType: 'SHARED',
        maxPurchasers: 3,
      });

      const outcomes = await Promise.allSettled(
        devs.map((d) =>
          claimLead({
            leadId: sharedLead.id,
            developerId: d.user.id,
          })
        )
      );

      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const failed = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

      expect(succeeded).toHaveLength(3);
      expect(failed).toHaveLength(2);
      for (const f of failed) {
        expect((f.reason as ClaimEngineError).code).toBe('LEAD_SHARED_MAX_PURCHASERS_REACHED');
      }

      const refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: sharedLead.id } });
      expect(refreshedLead.currentPurchasers).toBe(3);
      expect(refreshedLead.availableForClaim).toBe(false);
    });

    it('Test 9 — Concurrent Credit Race Condition: 1 developer with 5 credits claims 3 leads (cost 5 each) simultaneously -> 1 succeeds, 2 fail, balance = 0 (never negative)', async () => {
      const { user: dev } = await createTestDeveloper({
        email: 'race.credits.single@leadforge.eg',
        name: 'Single Dev Credit Race',
        balance: 5,
      });

      const leads = await Promise.all([
        createSaleableLead({ name: 'Race Credit Lead A', phone: '01011122210', accessType: 'SHARED' }),
        createSaleableLead({ name: 'Race Credit Lead B', phone: '01011122211', accessType: 'SHARED' }),
        createSaleableLead({ name: 'Race Credit Lead C', phone: '01011122212', accessType: 'SHARED' }),
      ]);

      const outcomes = await Promise.allSettled(
        leads.map((l) =>
          claimLead({
            leadId: l.id,
            developerId: dev.id,
          })
        )
      );

      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const failed = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(2);
      for (const f of failed) {
        expect((f.reason as ClaimEngineError).code).toBe('INSUFFICIENT_CREDITS');
      }

      const rec = await reconcileCreditAccount(dev.id, prisma);
      expect(rec.currentBalance).toBe(0);
      expect(rec.ledgerSum).toBe(0);
      expect(rec.isReconciled).toBe(true);
    });
  });

  describe('6. Phase 3 Quality & Phase 4 Matching Precondition Enforcement', () => {
    it('Test 11 & 12 — Blocks claiming when developer fails Phase 4 Matching or lead fails Phase 3 Quality/Freshness/Threshold gates', async () => {
      // Developer who ONLY serves Alexandria ('الإسكندرية')
      const { user: alexDev } = await createTestDeveloper({
        email: 'alex.only@leadforge.eg',
        name: 'Alexandria Only Dev',
        balance: 50,
        profileOverrides: {
          locations: ['الإسكندرية'],
          niches: ['Dental'],
        },
      });

      const cairoLead = await createSaleableLead({
        name: 'Cairo Only Dental Clinic',
        phone: '01011122213',
        city: 'القاهرة',
        governorate: 'القاهرة',
        accessType: 'SHARED',
      });

      // Must fail Phase 4 Matching with 422 LEAD_INELIGIBLE_MATCH
      await expect(
        claimLead({ leadId: cairoLead.id, developerId: alexDev.id })
      ).rejects.toMatchObject({
        code: 'LEAD_INELIGIBLE_MATCH',
        statusCode: 422,
      });

      // Developer in Cairo
      const { user: cairoDev } = await createTestDeveloper({
        email: 'cairo.elig@leadforge.eg',
        name: 'Cairo Eligible Dev',
        balance: 50,
      });

      // Lead with high minClaimQualityScore (99)
      const highThresholdLead = await createSaleableLead({
        name: 'High Quality Threshold Lead',
        phone: '01011122214',
        accessType: 'SHARED',
        minClaimQualityScore: 99,
      });

      await expect(
        claimLead({ leadId: highThresholdLead.id, developerId: cairoDev.id })
      ).rejects.toMatchObject({
        code: 'LEAD_QUALITY_BELOW_THRESHOLD',
        statusCode: 422,
      });

      // Lead with expired claimWindowEndsAt
      const expiredWindowLead = await createSaleableLead({
        name: 'Expired Claim Window Lead',
        phone: '01011122215',
        accessType: 'SHARED',
        claimWindowEndsAt: new Date(Date.now() - 3600_000),
      });

      await expect(
        claimLead({ leadId: expiredWindowLead.id, developerId: cairoDev.id })
      ).rejects.toMatchObject({
        code: 'LEAD_EXPIRED',
        statusCode: 422,
      });
    });

    it('Enforces DEVELOPER_SUSPENDED, DEVELOPER_INACTIVE, PROFILE_NOT_FOUND, LEAD_ACCESS_DENIED (free plan exclusive), and PLAN_LIMIT_REACHED', async () => {
      const validLead = await createSaleableLead({
        name: 'Precondition Check Dental',
        phone: '01011122216',
        accessType: 'SHARED',
      });
      const exclusiveLead = await createSaleableLead({
        name: 'Exclusive Plan Check Dental',
        phone: '01011122217',
        accessType: 'EXCLUSIVE',
      });

      const { user: suspendedDev } = await createTestDeveloper({
        email: 'suspended.dev@leadforge.eg',
        name: 'Suspended Dev',
        balance: 50,
        status: 'SUSPENDED',
      });
      await expect(
        claimLead({ leadId: validLead.id, developerId: suspendedDev.id })
      ).rejects.toMatchObject({
        code: 'DEVELOPER_SUSPENDED',
        statusCode: 403,
      });

      const { user: inactiveDev } = await createTestDeveloper({
        email: 'inactive.dev@leadforge.eg',
        name: 'Inactive Dev',
        balance: 50,
        profileOverrides: { isAcceptingLeads: false },
      });
      await expect(
        claimLead({ leadId: validLead.id, developerId: inactiveDev.id })
      ).rejects.toMatchObject({
        code: 'DEVELOPER_INACTIVE',
        statusCode: 403,
      });

      const { user: noProfileDev } = await createTestDeveloper({
        email: 'noprofile.dev@leadforge.eg',
        name: 'No Profile Dev',
        balance: 50,
        withProfile: false,
      });
      await expect(
        claimLead({ leadId: validLead.id, developerId: noProfileDev.id })
      ).rejects.toMatchObject({
        code: 'PROFILE_NOT_FOUND',
        statusCode: 403,
      });

      // Free plan does not allow claiming EXCLUSIVE leads
      const { user: freePlanDev } = await createTestDeveloper({
        email: 'freeplan.excl@leadforge.eg',
        name: 'Free Plan Dev',
        balance: 50,
        planSlug: 'free',
      });
      await expect(
        claimLead({ leadId: exclusiveLead.id, developerId: freePlanDev.id })
      ).rejects.toMatchObject({
        code: 'LEAD_ACCESS_DENIED',
        statusCode: 422,
      });

      // Developer with maxActiveLeads = 1
      const { user: cappedDev } = await createTestDeveloper({
        email: 'capped.dev@leadforge.eg',
        name: 'Capped Active Leads Dev',
        balance: 50,
        profileOverrides: { maxActiveLeads: 1 },
      });
      await claimLead({ leadId: validLead.id, developerId: cappedDev.id });
      const secondLead = await createSaleableLead({
        name: 'Second Capped Lead',
        phone: '01011122218',
        accessType: 'SHARED',
      });
      await expect(
        claimLead({ leadId: secondLead.id, developerId: cappedDev.id })
      ).rejects.toMatchObject({
        code: 'PLAN_LIMIT_REACHED',
        statusCode: 422,
      });
    });
  });

  describe('7. Refunds, Post-Claim Invalidation, Expiration & Admin Credit Adjustments', () => {
    it('Test 10 — Refund Flow: refunds credits, updates claim status to REFUNDED, revokes contact access, and prevents double refund', async () => {
      const { user: dev, token: devToken } = await createTestDeveloper({
        email: 'refund.dev@leadforge.eg',
        name: 'Refund Test Dev',
        balance: 30,
      });

      const lead = await createSaleableLead({
        name: 'Refundable Dental Center',
        phone: '01011122219',
        accessType: 'SHARED',
      });

      const claimRes = await claimLead({ leadId: lead.id, developerId: dev.id });
      expect(claimRes.remainingBalance).toBe(25);

      // Admin refunds the claim via POST /api/admin/claims/[claimId]/refund
      const refundReq = buildJsonRequest(
        `http://localhost:3000/api/admin/claims/${claimRes.claimId}/refund`,
        {
          method: 'POST',
          token: adminToken,
          body: { reason: 'Phone number disconnected verified by support' },
        }
      );
      const refundRes = await adminRefundClaimHandler(refundReq, {
        params: { claimId: claimRes.claimId },
      });
      expect(refundRes.status).toBe(200);
      const refundBody = await refundRes.json();
      expect(refundBody.status).toBe('REFUNDED');
      expect(refundBody.creditsRefunded).toBe(5);
      expect(refundBody.balanceBefore).toBe(25);
      expect(refundBody.balanceAfter).toBe(30);

      // Attempting to refund again must fail with 409 CLAIM_ALREADY_REFUNDED
      const secondRefundRes = await adminRefundClaimHandler(
        buildJsonRequest(`http://localhost:3000/api/admin/claims/${claimRes.claimId}/refund`, {
          method: 'POST',
          token: adminToken,
          body: { reason: 'Duplicate refund attempt' },
        }),
        { params: { claimId: claimRes.claimId } }
      );
      expect(secondRefundRes.status).toBe(409);
      const secondRefundBody = await secondRefundRes.json();
      expect(secondRefundBody.code).toBe('CLAIM_ALREADY_REFUNDED');

      // Developer viewing the refunded claim via GET /api/developer/claims/[claimId] has contact details redacted
      const claimDetailRes = await getDeveloperClaimByIdHandler(
        buildJsonRequest(`http://localhost:3000/api/developer/claims/${claimRes.claimId}`, {
          token: devToken,
        }),
        { params: { claimId: claimRes.claimId } }
      );
      expect(claimDetailRes.status).toBe(200);
      const claimDetailBody = await claimDetailRes.json();
      expect(claimDetailBody.claim.status).toBe('REFUNDED');
      expect(claimDetailBody.claim.accessGranted).toBe(false);
      expect(claimDetailBody.claim.lead.phone).toBeNull();

      // Developer viewing GET /api/leads/[id] also sees masked phone and isClaimedByMe = false
      const leadGetRes = await getLeadByIdHandler(
        buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}`, { token: devToken }),
        { params: { id: lead.id } }
      );
      const leadGetBody = await leadGetRes.json();
      expect(leadGetBody.lead.isClaimedByMe).toBe(false);
      expect(leadGetBody.lead.phone).toContain('****');

      const rec = await reconcileCreditAccount(dev.id, prisma);
      expect(rec.currentBalance).toBe(30);
      expect(rec.ledgerSum).toBe(30);
      expect(rec.isReconciled).toBe(true);
    });

    it('Automatically refunds active claims when a claimed lead is marked INVALID, DUPLICATE, or CLOSED after claim', async () => {
      const { user: dev } = await createTestDeveloper({
        email: 'autoinvalid.dev@leadforge.eg',
        name: 'Auto Invalidation Dev',
        balance: 40,
      });

      const leadToInvalidate = await createSaleableLead({
        name: 'Post-Claim Invalid Dental',
        phone: '01011122220',
        accessType: 'EXCLUSIVE',
      });

      const claimRes = await claimLead({
        leadId: leadToInvalidate.id,
        developerId: dev.id,
      });
      expect(claimRes.remainingBalance).toBe(15); // 40 - 25

      // Admin marks the lead INVALID via PATCH /api/admin/leads/[id]
      const patchRes = await adminLeadPatchHandler(
        buildJsonRequest(`http://localhost:3000/api/admin/leads/${leadToInvalidate.id}`, {
          method: 'PATCH',
          token: adminToken,
          body: { action: 'MARK_INVALID', reason: 'Confirmed invalid business number' },
        }),
        { params: { id: leadToInvalidate.id } }
      );
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.invalidationOutcome.refundedClaims).toHaveLength(1);
      expect(patchBody.invalidationOutcome.refundedClaims[0].creditsRefunded).toBe(25);

      const rec = await reconcileCreditAccount(dev.id, prisma);
      expect(rec.currentBalance).toBe(40);
      expect(rec.ledgerSum).toBe(40);
      expect(rec.isReconciled).toBe(true);

      // Test DUPLICATE post-claim invalidation via handleLeadInvalidationAfterClaim directly
      const leadDup = await createSaleableLead({
        name: 'Post-Claim Duplicate Dental',
        phone: '01011122221',
        accessType: 'SHARED',
      });
      await claimLead({ leadId: leadDup.id, developerId: dev.id });
      const dupOutcome = await handleLeadInvalidationAfterClaim({
        leadId: leadDup.id,
        invalidationType: 'DUPLICATE',
        triggeredBy: adminId,
      });
      expect(dupOutcome.refundedClaims).toHaveLength(1);
      expect(dupOutcome.refundedClaims[0].creditsRefunded).toBe(5);

      const recAfterDup = await reconcileCreditAccount(dev.id, prisma);
      expect(recAfterDup.currentBalance).toBe(40);
      expect(recAfterDup.isReconciled).toBe(true);
    });

    it('Supports claim expiration (expireStaleClaims) and Admin Credit Adjustments with negative-balance protection', async () => {
      const { user: dev, token: devToken } = await createTestDeveloper({
        email: 'adjust.dev@leadforge.eg',
        name: 'Admin Adjust Dev',
        balance: 10,
      });

      // 1. Admin adds +15 credits via POST /api/admin/developers/[developerId]/credits/adjust
      const addRes = await adminAdjustCreditsHandler(
        buildJsonRequest(
          `http://localhost:3000/api/admin/developers/${dev.id}/credits/adjust`,
          {
            method: 'POST',
            token: adminToken,
            idempotencyKey: 'admin-adj-add-15',
            body: {
              amount: 15,
              reason: 'Promotional bonus credits granted by admin',
              type: 'BONUS',
            },
          }
        ),
        { params: { developerId: dev.id } }
      );
      expect(addRes.status).toBe(200);
      const addBody = await addRes.json();
      expect(addBody.balanceBefore).toBe(10);
      expect(addBody.balanceAfter).toBe(25);
      expect(addBody.type).toBe('BONUS');

      // 2. Admin deducts -5 credits
      const deductRes = await adjustDeveloperCreditsByAdmin({
        developerId: dev.id,
        amount: -5,
        reason: 'Manual billing correction',
        performedById: adminId,
      });
      expect(deductRes.balanceBefore).toBe(25);
      expect(deductRes.balanceAfter).toBe(20);

      // 3. Admin attempts to deduct -50 credits (would cause negative balance -30) -> MUST FAIL 422
      const overDeductRes = await adminAdjustCreditsHandler(
        buildJsonRequest(
          `http://localhost:3000/api/admin/developers/${dev.id}/credits/adjust`,
          {
            method: 'POST',
            token: adminToken,
            body: {
              amount: -50,
              reason: 'Excessive deduction attempt',
            },
          }
        ),
        { params: { developerId: dev.id } }
      );
      expect(overDeductRes.status).toBe(422);
      const overDeductBody = await overDeductRes.json();
      expect(overDeductBody.code).toBe('INSUFFICIENT_CREDITS');

      // 4. Expire a claim whose expiresAt has passed
      const expLead = await createSaleableLead({
        name: 'Expiring Claim Clinic',
        phone: '01011122222',
        accessType: 'SHARED',
      });
      const claimToExpire = await claimLead({ leadId: expLead.id, developerId: dev.id });
      await prisma.leadClaim.update({
        where: { id: claimToExpire.claimId },
        data: { expiresAt: new Date(Date.now() - 10_000) },
      });

      const expiredCount = await expireStaleClaims(new Date());
      expect(expiredCount).toBe(1);

      const expiredClaimCheck = await prisma.leadClaim.findUniqueOrThrow({
        where: { id: claimToExpire.claimId },
      });
      expect(expiredClaimCheck.status).toBe('EXPIRED');
      expect(expiredClaimCheck.accessGranted).toBe(false);

      // 5. Verify Developer Credits API & Claims API
      const creditsApiRes = await getDeveloperCreditsHandler(
        buildJsonRequest('http://localhost:3000/api/developer/credits', { token: devToken })
      );
      expect(creditsApiRes.status).toBe(200);
      const creditsApiBody = await creditsApiRes.json();
      expect(creditsApiBody.account.balance).toBe(15); // 20 - 5
      expect(creditsApiBody.reconciliation.isReconciled).toBe(true);
      expect(creditsApiBody.transactions.length).toBeGreaterThanOrEqual(4);

      const claimsApiRes = await getDeveloperClaimsHandler(
        buildJsonRequest('http://localhost:3000/api/developer/claims', { token: devToken })
      );
      expect(claimsApiRes.status).toBe(200);
      const claimsApiBody = await claimsApiRes.json();
      expect(claimsApiBody.claims).toHaveLength(1);
      expect(claimsApiBody.claims[0].status).toBe('EXPIRED');
    });
  });

  describe('8. Security, RBAC, Cross-Developer Isolation, Rate Limiting & Global Ledger Reconciliation', () => {
    it('Enforces strict RBAC on Admin APIs, prevents cross-developer claim inspection, enforces rate limits, and reconciles 100% of credit accounts', async () => {
      resetRateLimits();
      const { user: dev1, token: dev1Token } = await createTestDeveloper({
        email: 'sec.dev1@leadforge.eg',
        name: 'Security Dev 1',
        balance: 25,
      });
      const { user: dev2, token: dev2Token } = await createTestDeveloper({
        email: 'sec.dev2@leadforge.eg',
        name: 'Security Dev 2',
        balance: 25,
      });

      const secLead = await createSaleableLead({
        name: 'Security Check Dental',
        phone: '01011122223',
        accessType: 'SHARED',
      });
      const dev1Claim = await claimLead({ leadId: secLead.id, developerId: dev1.id });

      // Dev 2 attempting to view Dev 1's claim via GET /api/developer/claims/[claimId] must get 403 FORBIDDEN
      const crossClaimRes = await getDeveloperClaimByIdHandler(
        buildJsonRequest(`http://localhost:3000/api/developer/claims/${dev1Claim.claimId}`, {
          token: dev2Token,
        }),
        { params: { claimId: dev1Claim.claimId } }
      );
      expect(crossClaimRes.status).toBe(403);
      const crossClaimBody = await crossClaimRes.json();
      expect(crossClaimBody.code).toBe('FORBIDDEN');

      // Dev 2 attempting to call Admin refund or Admin credit adjust or Admin claims/credits endpoints must get 403 FORBIDDEN
      const nonAdminRefund = await adminRefundClaimHandler(
        buildJsonRequest(`http://localhost:3000/api/admin/claims/${dev1Claim.claimId}/refund`, {
          method: 'POST',
          token: dev2Token,
          body: { reason: 'Unauthorized self refund' },
        }),
        { params: { claimId: dev1Claim.claimId } }
      );
      expect(nonAdminRefund.status).toBe(403);

      const nonAdminAdjust = await adminAdjustCreditsHandler(
        buildJsonRequest(`http://localhost:3000/api/admin/developers/${dev2.id}/credits/adjust`, {
          method: 'POST',
          token: dev2Token,
          body: { amount: 1000, reason: 'Unauthorized credit hack' },
        }),
        { params: { developerId: dev2.id } }
      );
      expect(nonAdminAdjust.status).toBe(403);

      const nonAdminClaimsList = await adminClaimsGetHandler(
        buildJsonRequest('http://localhost:3000/api/admin/claims', { token: dev2Token })
      );
      expect(nonAdminClaimsList.status).toBe(403);

      const nonAdminCreditsList = await adminCreditsGetHandler(
        buildJsonRequest('http://localhost:3000/api/admin/credits', { token: dev2Token })
      );
      expect(nonAdminCreditsList.status).toBe(403);

      // Admin calling GET /api/admin/claims and GET /api/admin/credits succeeds and verifies global ledger reconciliation
      const adminClaimsRes = await adminClaimsGetHandler(
        buildJsonRequest('http://localhost:3000/api/admin/claims', { token: adminToken })
      );
      expect(adminClaimsRes.status).toBe(200);
      const adminClaimsBody = await adminClaimsRes.json();
      expect(adminClaimsBody.summary.total).toBeGreaterThanOrEqual(8);

      const adminCreditsRes = await adminCreditsGetHandler(
        buildJsonRequest('http://localhost:3000/api/admin/credits', { token: adminToken })
      );
      expect(adminCreditsRes.status).toBe(200);
      const adminCreditsBody = await adminCreditsRes.json();
      expect(adminCreditsBody.allReconciled).toBe(true);
      expect(adminCreditsBody.accounts.length).toBeGreaterThanOrEqual(10);

      // Verify structured observability logs were emitted
      const recentLogs = getRecentClaimEngineLogs();
      expect(recentLogs.length).toBeGreaterThan(10);
      expect(recentLogs.some((l) => l.event === 'claim_succeeded')).toBe(true);
      expect(recentLogs.some((l) => l.event === 'credits_deducted')).toBe(true);
      expect(recentLogs.some((l) => l.event === 'credits_refunded')).toBe(true);
      expect(recentLogs.some((l) => l.event === 'credits_adjusted')).toBe(true);
    });
  });

  describe('9. Partial Refunds, Claims Filtering, Privacy Redaction & Matching Isolation', () => {
    it('Supports multi-step partial refunds, filters developer claims by niche/service/date, redacts private data on dashboard/verification/matching, and validates idempotency & subscription edge cases', async () => {
      resetRateLimits();
      const { user: devA, token: devAToken } = await createTestDeveloper({
        email: 'partial.deva@leadforge.eg',
        name: 'Partial Refund Dev A',
        balance: 30,
      });
      const { user: devB, token: devBToken } = await createTestDeveloper({
        email: 'partial.devb@leadforge.eg',
        name: 'Partial Refund Dev B',
        balance: 30,
      });

      const sharedLead = await createSaleableLead({
        name: 'Partial Refund Dental Center',
        phone: '01099887766',
        accessType: 'SHARED',
        maxPurchasers: 2,
        creditCost: 6,
        creditCostReason: 'CUSTOM_SHARED_6',
        category: 'Dental',
      });

      // 1. Invalid idempotency key (whitespace-only or > 128 chars) must fail with 422 INVALID_IDEMPOTENCY_KEY
      await expect(
        claimLead({
          leadId: sharedLead.id,
          developerId: devA.id,
          idempotencyKey: '   ',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_IDEMPOTENCY_KEY',
        statusCode: 422,
      });

      await expect(
        claimLead({
          leadId: sharedLead.id,
          developerId: devA.id,
          idempotencyKey: 'k'.repeat(130),
        })
      ).rejects.toMatchObject({
        code: 'INVALID_IDEMPOTENCY_KEY',
        statusCode: 422,
      });

      // 2. Claim lead for Dev A (6 credits) and Dev B (6 credits)
      const claimA = await claimLead({
        leadId: sharedLead.id,
        developerId: devA.id,
        idempotencyKey: 'partial-ref-claim-a',
      });
      expect(claimA.creditsCharged).toBe(6);

      await claimLead({
        leadId: sharedLead.id,
        developerId: devB.id,
        idempotencyKey: 'partial-ref-claim-b',
      });

      // 3. Partial refund of 2 credits for Dev A -> claim stays ACTIVE and accessGranted stays true
      const partial1 = await refundClaim({
        claimId: claimA.claimId,
        reason: 'Partial courtesy credit refund (step 1)',
        refundedBy: adminId,
        amount: 2,
      });
      expect(partial1.status).toBe('ACTIVE');
      expect(partial1.creditsRefunded).toBe(2);
      expect(partial1.totalCreditsRefundedForClaim).toBe(2);
      expect(partial1.balanceAfter).toBe(26);

      const claimAfterPartial1 = await prisma.leadClaim.findUniqueOrThrow({
        where: { id: claimA.claimId },
      });
      expect(claimAfterPartial1.status).toBe('ACTIVE');
      expect(claimAfterPartial1.accessGranted).toBe(true);

      // Over-refund attempt (> remaining 4 credits) must fail with 422 INVALID_REFUND_REQUEST
      await expect(
        refundClaim({
          claimId: claimA.claimId,
          reason: 'Over-refund attempt',
          refundedBy: adminId,
          amount: 5,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_REFUND_REQUEST',
        statusCode: 422,
      });

      // 4. Second partial refund of remaining 4 credits -> claim flips to REFUNDED, accessGranted = false, lead slot re-opens
      const partial2 = await refundClaim({
        claimId: claimA.claimId,
        reason: 'Remaining refund (step 2)',
        refundedBy: adminId,
        amount: 4,
      });
      expect(partial2.status).toBe('REFUNDED');
      expect(partial2.creditsRefunded).toBe(4);
      expect(partial2.totalCreditsRefundedForClaim).toBe(6);
      expect(partial2.balanceAfter).toBe(30);

      const subAfterFullRefund = await prisma.subscription.findUniqueOrThrow({
        where: { userId: devA.id },
      });
      expect(subAfterFullRefund.credits).toBe(30);
      expect(subAfterFullRefund.creditsUsed).toBe(0);

      // 5. After Dev A's claim is REFUNDED, GET /api/leads/[id]/verification for Dev A must redact phone/email in summaries
      const verifRes = await getLeadVerificationHandler(
        buildJsonRequest(`http://localhost:3000/api/leads/${sharedLead.id}/verification`, {
          token: devAToken,
        }),
        { params: { id: sharedLead.id } }
      );
      expect(verifRes.status).toBe(200);
      const verifBody = await verifRes.json();
      const verifJsonStr = JSON.stringify(verifBody);
      expect(verifJsonStr).not.toContain('01099887766');

      // 6. GET /api/matching/developers/me for Dev A must re-include sharedLead as eligible AND must NOT leak Dev B's userId in claimedDeveloperIds
      const matchRes = await getDeveloperMatchesHandler(
        buildJsonRequest(`http://localhost:3000/api/matching/developers/${devA.id}`, {
          token: devAToken,
        }),
        { params: { developerId: devA.id } }
      );
      expect(matchRes.status).toBe(200);
      const matchBody = await matchRes.json();
      const matchedItem = matchBody.matches.find(
        (m: { lead: { id: string } }) => m.lead.id === sharedLead.id
      );
      expect(matchedItem).toBeDefined();
      expect(matchedItem.lead.claimedDeveloperIds).toBeUndefined();
      expect(JSON.stringify(matchBody)).not.toContain(devB.id);

      // 7. GET /api/developer/dashboard for Dev A must redact contact info on topMatchedLeads and refunded recentClaims
      const dashRes = await getDeveloperDashboardHandler(
        buildJsonRequest('http://localhost:3000/api/developer/dashboard', {
          token: devAToken,
        })
      );
      expect(dashRes.status).toBe(200);
      const dashBody = await dashRes.json();
      expect(dashBody.stats.remainingCredits).toBe(30);
      expect(dashBody.stats.usedLeadsCount).toBe(0);
      for (const topLead of dashBody.topMatchedLeads) {
        expect(topLead.phone).toContain('****');
        expect(topLead.phone).not.toBe('01099887766');
        expect(topLead.normalizedPhone).toBeUndefined();
        expect(topLead.canonicalIdentityKeys).toBeUndefined();
        expect(topLead.exclusiveClaimedById).toBeUndefined();
      }
      const refundedRecent = dashBody.recentClaims.find(
        (c: { id: string }) => c.id === claimA.claimId
      );
      expect(refundedRecent).toBeDefined();
      expect(refundedRecent.lead.phone).toContain('****');
      expect(refundedRecent.lead.phone).not.toBe('01099887766');

      // 8. GET /api/developer/claims for Dev B supports filtering by niche, service, and date
      const todayIsoDate = new Date().toISOString().slice(0, 10);
      const claimsByNicheRes = await getDeveloperClaimsHandler(
        buildJsonRequest(
          `http://localhost:3000/api/developer/claims?niche=Dental&service=Website&date=${todayIsoDate}`,
          { token: devBToken }
        )
      );
      expect(claimsByNicheRes.status).toBe(200);
      const claimsByNicheBody = await claimsByNicheRes.json();
      expect(claimsByNicheBody.claims).toHaveLength(1);
      expect(claimsByNicheBody.claims[0].leadId).toBe(sharedLead.id);

      const claimsMismatchNicheRes = await getDeveloperClaimsHandler(
        buildJsonRequest(
          `http://localhost:3000/api/developer/claims?niche=Automotive`,
          { token: devBToken }
        )
      );
      const claimsMismatchNicheBody = await claimsMismatchNicheRes.json();
      expect(claimsMismatchNicheBody.claims).toHaveLength(0);
    });
  });
});

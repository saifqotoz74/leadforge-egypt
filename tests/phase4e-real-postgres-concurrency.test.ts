import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import {
  approveTransferPayment,
  processPaymentWebhookEvent,
  signPaymentWebhookPayload,
} from '../src/lib/payment/provider';
import { claimLead } from '../src/lib/claims/service';
import { submitClaimRefundReport, refundClaim } from '../src/lib/claims/refund-service';
import { ensureDeveloperCreditAccount } from '../src/lib/claims/credit-service';

const TEST_DB_URL = 'postgresql://testuser:testpassword@127.0.0.1:54332/leadforge_test?schema=public';
const DB_DIR = path.resolve(process.cwd(), '.pgdata-disposable-test');

describe('Phase 4E — Real PostgreSQL Concurrency & Admin Path Tests', () => {
  let prisma: PrismaClient;
  let pgInstance: any = null;

  beforeAll(async () => {
    // Ensure the real PostgreSQL server is running
    try {
      const probePrisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
      await probePrisma.$connect();
      await probePrisma.$disconnect();
    } catch {
      try {
        const mod = await import('embedded-postgres');
        const EmbeddedPostgres = mod.default || mod;
        pgInstance = new EmbeddedPostgres({
          port: 54332,
          databaseDir: DB_DIR,
          user: 'testuser',
          password: 'testpassword',
          persistent: true,
        });
        if (!fs.existsSync(DB_DIR)) {
          await pgInstance.initialise();
        }
        await pgInstance.start();
      } catch {
        // embedded-postgres not available in this environment
      }
    }

    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.USE_EXTERNAL_PG = 'true';

    // Point directly to real PostgreSQL 18.4 database via connection pool
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    });
    await prisma.$connect();

    // Ensure test plans exist for foreign keys
    await prisma.plan.upsert({
      where: { slug: 'plan_pro' },
      update: {},
      create: {
        id: 'plan_pro',
        slug: 'plan_pro',
        name: 'خطة احترافية',
        nameEn: 'Pro Plan',
        priceEgp: 500,
        monthlyCredits: 20,
        features: ['all'],
      },
    });

    await prisma.plan.upsert({
      where: { slug: 'plan_starter' },
      update: {},
      create: {
        id: 'plan_starter',
        slug: 'plan_starter',
        name: 'خطة بداية',
        nameEn: 'Starter Plan',
        priceEgp: 200,
        monthlyCredits: 10,
        features: ['basic'],
      },
    });

    // Enable lock bypassing to test pure database-level protection
    process.env.DISABLE_RESOURCE_LOCKS = 'true';
  });

  afterAll(async () => {
    process.env.DISABLE_RESOURCE_LOCKS = 'false';
    await prisma.$disconnect();
    if (pgInstance) {
      try {
        await pgInstance.stop();
      } catch {}
    }
  });

  it('1. approveTransferPayment concurrency: two parallel approvals on real Postgres credit exactly once via CAS', async () => {
    const user = await prisma.user.create({
      data: {
        email: `realpg-appr-${Date.now()}@example.com`,
        name: 'Real PG Approver',
        role: 'DEVELOPER',
        passwordHash: 'test_hash_123',
      },
    });

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        planId: 'plan_pro',
        amountEgp: 500,
        creditsGranted: 20,
        provider: 'BANK_TRANSFER',
        providerRef: `ref_appr_${Date.now()}`,
        status: 'PENDING',
      },
    });

    // Fire 2 concurrent approvals on the real PostgreSQL database
    const [res1, res2] = await Promise.allSettled([
      approveTransferPayment({ prisma, paymentId: payment.id, adminId: 'admin_super' }),
      approveTransferPayment({ prisma, paymentId: payment.id, adminId: 'admin_super' }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    if (successes.length === 0) {
      console.log('ClaimLead Failures:', failures[0]?.reason, failures[1]?.reason);
    }

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('COMPLETED');

    const account = await prisma.developerCreditAccount.findUnique({ where: { developerId: user.id } });
    expect(account?.balance).toBe(20);
  });

  it('2. claimLead concurrency: two developers race to claim the same EXCLUSIVE lead on real Postgres -> 1 succeeds, 1 fails cleanly via row locks & unique constraint', async () => {
    const dev1 = await prisma.user.create({
      data: { email: `realpg-claim1-${Date.now()}@example.com`, name: 'Dev 1', role: 'DEVELOPER', passwordHash: 'test_hash_123' },
    });
    const dev2 = await prisma.user.create({
      data: { email: `realpg-claim2-${Date.now()}@example.com`, name: 'Dev 2', role: 'DEVELOPER', passwordHash: 'test_hash_123' },
    });

    // Mark email verified so barrier does not reject
    await prisma.user.update({ where: { id: dev1.id }, data: { emailVerified: new Date() } });
    await prisma.user.update({ where: { id: dev2.id }, data: { emailVerified: new Date() } });

    // Create developer profiles
    await prisma.developerProfile.create({
      data: {
        userId: dev1.id,
        services: ['Website Development'],
        locations: ['القاهرة'],
        niches: ['Dental'],
        leadPreferences: ['NO_WEBSITE'],
        minBudget: 3000,
        maxBudget: 100000,
        leadType: 'BOTH',
        isActive: true,
        isAcceptingLeads: true,
        allLocationsMode: true,
      },
    });
    await prisma.developerProfile.create({
      data: {
        userId: dev2.id,
        services: ['Website Development'],
        locations: ['القاهرة'],
        niches: ['Dental'],
        leadPreferences: ['NO_WEBSITE'],
        minBudget: 3000,
        maxBudget: 100000,
        leadType: 'BOTH',
        isActive: true,
        isAcceptingLeads: true,
        allLocationsMode: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      const a1 = await ensureDeveloperCreditAccount(tx, dev1.id);
      await tx.developerCreditAccount.update({ where: { id: a1.id }, data: { balance: 50 } });
      const a2 = await ensureDeveloperCreditAccount(tx, dev2.id);
      await tx.developerCreditAccount.update({ where: { id: a2.id }, data: { balance: 50 } });
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: `Real PG Exclusive Lead ${Date.now()}`,
        normalizedName: `real pg exclusive lead ${Date.now()}`,
        category: 'Dental',
        governorate: 'القاهرة',
        city: 'القاهرة',
        leadType: 'EXCLUSIVE',
        accessType: 'EXCLUSIVE',
        exclusive: true,
        maxPurchasers: 1,
        currentPurchasers: 0,
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
        verificationStatus: 'VERIFIED',
        freshnessStatus: 'FRESH',
        qualityScore: 85,
        score: 85,
      },
    });

    const [res1, res2] = await Promise.allSettled([
      claimLead({ leadId: lead.id, developerId: dev1.id }),
      claimLead({ leadId: lead.id, developerId: dev2.id }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    if (successes.length === 0) {
      console.log('ClaimLead Failures:', failures[0]?.reason, failures[1]?.reason);
    }

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const claims = await prisma.leadClaim.findMany({ where: { leadId: lead.id } });
    expect(claims.length).toBe(1);

    const reloadedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(reloadedLead.currentPurchasers).toBe(1);
    expect(reloadedLead.availableForClaim).toBe(false);
  });

  it('3. refund report race: two parallel refund reports on the same claim on real Postgres -> 1 succeeds, 1 gets 409 conflict via DB unique partial index', async () => {
    const dev = await prisma.user.create({
      data: { email: `realpg-ref-race-${Date.now()}@example.com`, name: 'Report Racer', role: 'DEVELOPER', passwordHash: 'test_hash_123' },
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: `Real PG Lead For Report ${Date.now()}`,
        normalizedName: `real pg lead for report ${Date.now()}`,
        category: 'Development',
        governorate: 'Cairo',
        city: 'Cairo',
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
        verificationStatus: 'VERIFIED',
        freshnessStatus: 'FRESH',
      },
    });

    const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
    const claim = await prisma.leadClaim.create({
      data: {
        leadId: lead.id,
        userId: dev.id,
        developerId: dev.id,
        status: 'ACTIVE',
        claimedAt: thirtyOneMinutesAgo,
        createdAt: thirtyOneMinutesAgo,
        creditsSpent: 5,
        creditsCharged: 5,
      },
    });

    // Fire 2 concurrent reports with in-process locks disabled
    const [res1, res2] = await Promise.allSettled([
      submitClaimRefundReport({
        claimId: claim.id,
        developerId: dev.id,
        reason: 'WRONG_NUMBER',
        comment: 'Concurrent attempt 1',
      }),
      submitClaimRefundReport({
        claimId: claim.id,
        developerId: dev.id,
        reason: 'WRONG_NUMBER',
        comment: 'Concurrent attempt 2',
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    if (successes.length === 0) {
      console.log('ClaimLead Failures:', failures[0]?.reason, failures[1]?.reason);
    }

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const rejectedError = (failures[0] as PromiseRejectedResult).reason;
    expect(rejectedError.code).toBe('REFUND_REPORT_ALREADY_EXISTS');
    expect(rejectedError.statusCode).toBe(409);

    const reportRows = await prisma.leadFeedback.findMany({
      where: { claimId: claim.id, type: 'REFUND_REPORT' },
    });
    expect(reportRows.length).toBe(1);
  });

  it('4. webhook duplicates: simultaneous duplicate payment.succeeded webhooks credit points exactly once', async () => {
    const user = await prisma.user.create({
      data: { email: `realpg-wh-${Date.now()}@example.com`, name: 'Webhook User', role: 'DEVELOPER', passwordHash: 'test_hash_123' },
    });

    const providerRef = `ref_wh_order_${Date.now()}`;
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        planId: 'plan_starter',
        amountEgp: 200,
        creditsGranted: 10,
        provider: 'PAYMOB',
        providerRef,
        status: 'PENDING',
      },
    });

    const webhookSecret = 'whsec_test_secret_12345678901234567890';
    const payload1 = {
      eventId: `evt_1_${Date.now()}`,
      type: 'payment.succeeded',
      provider: 'PAYMOB',
      providerRef,
      userId: user.id,
      planId: 'plan_starter',
      amountEgp: 200,
      credits: 10,
    };
    const raw1 = JSON.stringify(payload1);
    const sig1 = signPaymentWebhookPayload(raw1, webhookSecret);

    const payload2 = {
      eventId: `evt_2_${Date.now()}`,
      type: 'payment.succeeded',
      provider: 'PAYMOB',
      providerRef,
      userId: user.id,
      planId: 'plan_starter',
      amountEgp: 200,
      credits: 10,
    };
    const raw2 = JSON.stringify(payload2);
    const sig2 = signPaymentWebhookPayload(raw2, webhookSecret);

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

    console.log('Webhook res1:', res1);
    console.log('Webhook res2:', res2);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);

    const codes = [res1.code, res2.code].sort();
    expect(codes).toEqual(['IDEMPOTENT_DUPLICATE', 'PROCESSED']);

    const account = await prisma.developerCreditAccount.findUnique({ where: { developerId: user.id } });
    expect(account?.balance).toBe(10);
  });

  it('5. F.2 Support Path: POST /api/admin/claims/[claimId]/refund CAN refund a claim whose refund report was rejected', async () => {
    const dev = await prisma.user.create({
      data: { email: `realpg-f2-dev-${Date.now()}@example.com`, name: 'Dev F2', role: 'DEVELOPER', passwordHash: 'test_hash_123' },
    });

    await prisma.$transaction(async (tx) => {
      const a = await ensureDeveloperCreditAccount(tx, dev.id);
      await tx.developerCreditAccount.update({ where: { id: a.id }, data: { balance: 10 } });
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: `Lead F2 ${Date.now()}`,
        normalizedName: `lead f2 ${Date.now()}`,
        category: 'Development',
        governorate: 'Cairo',
        city: 'Cairo',
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
        verificationStatus: 'VERIFIED',
        freshnessStatus: 'FRESH',
      },
    });

    const claim = await prisma.leadClaim.create({
      data: {
        leadId: lead.id,
        userId: dev.id,
        developerId: dev.id,
        status: 'ACTIVE',
        creditsSpent: 5,
        creditsCharged: 5,
      },
    });

    // Simulate an existing refund report that was reviewed and REJECTED by customer support
    await prisma.leadFeedback.create({
      data: {
        leadId: lead.id,
        userId: dev.id,
        developerId: dev.id,
        claimId: claim.id,
        type: 'REFUND_REPORT',
        useful: false,
        reasonCode: 'DISCONNECTED_NUMBER',
        comment: 'Phone not working',
        metadata: {
          status: 'REJECTED',
          reviewNote: 'Number was verified valid on callback check',
          reviewedBy: 'admin_triage',
          reviewedAt: new Date().toISOString(),
        },
      },
    });

    // Now Admin decides to grant a manual refund anyway via refundClaim
    const refundResult = await refundClaim({
      claimId: claim.id,
      reason: 'Customer goodwill exception after appeal',
      refundedBy: 'admin_supervisor',
    });

    expect(refundResult.success).toBe(true);
    expect(refundResult.creditsRefunded).toBe(5);
    expect(refundResult.status).toBe('REFUNDED');

    // Balance should be restored from 10 to 15
    const account = await prisma.developerCreditAccount.findUnique({ where: { developerId: dev.id } });
    expect(account?.balance).toBe(15);

    // Ledger transaction must reference the claim and admin
    const txRow = await prisma.creditTransaction.findUnique({ where: { id: refundResult.transactionId } });
    expect(txRow?.type).toBe('REFUND');
    expect(txRow?.claimId).toBe(claim.id);
    expect(txRow?.performedById).toBe('admin_supervisor');
  });

  it('6. F.4 Support Path: parallel admin refunds cannot refund twice (idempotency & status protection)', async () => {
    const dev = await prisma.user.create({
      data: { email: `realpg-f4-dev-${Date.now()}@example.com`, name: 'Dev F4', role: 'DEVELOPER', passwordHash: 'test_hash_123' },
    });

    await prisma.$transaction(async (tx) => {
      const a = await ensureDeveloperCreditAccount(tx, dev.id);
      await tx.developerCreditAccount.update({ where: { id: a.id }, data: { balance: 0 } });
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: `Lead F4 ${Date.now()}`,
        normalizedName: `lead f4 ${Date.now()}`,
        category: 'Development',
        governorate: 'Cairo',
        city: 'Cairo',
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
        verificationStatus: 'VERIFIED',
        freshnessStatus: 'FRESH',
      },
    });

    const claim = await prisma.leadClaim.create({
      data: {
        leadId: lead.id,
        userId: dev.id,
        developerId: dev.id,
        status: 'ACTIVE',
        creditsSpent: 5,
        creditsCharged: 5,
      },
    });

    // Simulate rapid double click by admin (two concurrent refundClaim requests)
    const [res1, res2] = await Promise.allSettled([
      refundClaim({
        claimId: claim.id,
        reason: 'Admin refund double-click test',
        refundedBy: 'admin_clicker',
      }),
      refundClaim({
        claimId: claim.id,
        reason: 'Admin refund double-click test',
        refundedBy: 'admin_clicker',
      }),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    if (successes.length === 0) {
      console.log('ClaimLead Failures:', failures[0]?.reason, failures[1]?.reason);
    }

    // Exactly 1 succeeds, second fails with CLAIM_ALREADY_REFUNDED (409)
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const rejectedError = (failures[0] as PromiseRejectedResult).reason;
    expect(rejectedError.code).toBe('CLAIM_ALREADY_REFUNDED');
    expect(rejectedError.statusCode).toBe(409);

    // Balance must be credited exactly once (+5, not +10)
    const account = await prisma.developerCreditAccount.findUnique({ where: { developerId: dev.id } });
    expect(account?.balance).toBe(5);
  });
});

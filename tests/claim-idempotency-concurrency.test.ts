import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, invalidateUserSessionCache, signSessionToken } from '../src/lib/auth';
import { DEFAULT_PLANS } from '../src/lib/payment/provider';
import { POST as claimHandler } from '../src/app/api/leads/[id]/claim/route';

describe('Duplicate Claim & Idempotency Protection Regression Suite', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  function buildClaimRequest(
    leadId: string,
    options: {
      token: string;
      idempotencyKey?: string;
    }
  ): NextRequest {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      authorization: `Bearer ${options.token}`,
      'content-type': 'application/json',
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    return new NextRequest(`http://localhost:3000/api/leads/${leadId}/claim`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
  }

  beforeAll(async () => {
    const inMem = await createInMemoryTestDb();
    prisma = inMem.prisma;
    cleanupDb = inMem.cleanup;
    setPrismaClientForTesting(prisma);

    // Seed default subscription plans
    for (const plan of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { slug: plan.slug },
        update: {},
        create: {
          slug: plan.slug,
          name: plan.name,
          nameEn: plan.nameEn,
          priceEgp: plan.priceEgp,
          monthlyCredits: plan.monthlyCredits,
          allowsExclusive: plan.allowsExclusive,
          features: plan.features,
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
        },
      });
    }
  });

  afterAll(async () => {
    setPrismaClientForTesting(null as any);
    await cleanupDb();
  });

  it('1. Enforces Idempotency-Key: repeated calls with same key replay result without double-charging', async () => {
    const devPassword = await hashPassword('DevSecure@123');
    const proPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'pro' } });

    const dev = await prisma.user.create({
      data: {
        email: `idemp-dev-${Date.now()}@leadforge.eg`,
        passwordHash: devPassword,
        name: 'Idempotency Test Dev',
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: new Date(),
        developerProfile: {
          create: {
            companyName: 'Idemp Dev Studio',
            services: ['Website Development'],
            locations: ['القاهرة'],
            allLocationsMode: true,
            allNichesMode: true,
            leadPreferences: ['NO_WEBSITE'],
            minBudget: 5000,
            maxBudget: 50000,
          },
        },
        subscription: {
          create: {
            planId: proPlan.id,
            status: 'ACTIVE',
            credits: 20,
            totalCreditsGranted: 20,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
        },
      },
      include: { subscription: true },
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: 'Idempotency Test Dental Clinic',
        normalizedName: 'idempotency test dental clinic',
        category: 'Dental',
        city: 'القاهرة',
        governorate: 'القاهرة',
        phone: '01012348888',
        hasPhone: true,
        websiteStatus: 'NO_WEBSITE',
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        verificationStatus: 'VERIFIED',
        isCanonical: true,
        creditCost: 5,
        score: 85,
        leadType: 'SHARED',
        maxPurchasers: 3,
        currentPurchasers: 0,
        lastVerifiedAt: new Date(),
      },
    });

    const devToken = await signSessionToken({
      userId: dev.id,
      email: dev.email,
      name: dev.name,
      role: dev.role,
    });

    const sharedIdempotencyKey = `idem-key-${Date.now()}`;

    // Request 1: Initial claim
    const req1 = buildClaimRequest(lead.id, { token: devToken, idempotencyKey: sharedIdempotencyKey });
    const res1 = await claimHandler(req1, { params: { id: lead.id } });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.idempotentReplay).toBeFalsy();
    expect(body1.remainingCredits).toBe(15); // 20 - 5 = 15

    // Request 2: Duplicate call with the same idempotency key (simulating network retry)
    const req2 = buildClaimRequest(lead.id, { token: devToken, idempotencyKey: sharedIdempotencyKey });
    const res2 = await claimHandler(req2, { params: { id: lead.id } });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.idempotentReplay).toBe(true);
    expect(body2.claimId).toBe(body1.claimId);
    expect(body2.remainingCredits).toBe(15); // Balance remained 15, NOT 10!

    // Verify exactly 1 claim in DB
    const claimsInDb = await prisma.leadClaim.findMany({
      where: { leadId: lead.id, userId: dev.id },
    });
    expect(claimsInDb).toHaveLength(1);

    // Verify subscription balance in DB is strictly 15
    const updatedSub = await prisma.subscription.findUniqueOrThrow({ where: { userId: dev.id } });
    expect(updatedSub.credits).toBe(15);
  });

  it('2. Enforces Unique Claims: concurrent duplicate requests without shared key reject duplicate claim cleanly', async () => {
    const devPassword = await hashPassword('DevSecure@123');
    const proPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'pro' } });

    const dev = await prisma.user.create({
      data: {
        email: `double-click-dev-${Date.now()}@leadforge.eg`,
        passwordHash: devPassword,
        name: 'Double Click Dev',
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: new Date(),
        developerProfile: {
          create: {
            companyName: 'Double Click Studio',
            services: ['Website Development'],
            locations: ['القاهرة'],
            allLocationsMode: true,
            allNichesMode: true,
            leadPreferences: ['NO_WEBSITE'],
            minBudget: 5000,
            maxBudget: 50000,
          },
        },
        subscription: {
          create: {
            planId: proPlan.id,
            status: 'ACTIVE',
            credits: 20,
            totalCreditsGranted: 20,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
        },
      },
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: 'Double Click Dental Clinic',
        normalizedName: 'double click dental clinic',
        category: 'Dental',
        city: 'القاهرة',
        governorate: 'القاهرة',
        phone: '01012349999',
        hasPhone: true,
        websiteStatus: 'NO_WEBSITE',
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        verificationStatus: 'VERIFIED',
        isCanonical: true,
        creditCost: 5,
        score: 80,
        leadType: 'SHARED',
        maxPurchasers: 3,
        currentPurchasers: 0,
        lastVerifiedAt: new Date(),
      },
    });

    const devToken = await signSessionToken({
      userId: dev.id,
      email: dev.email,
      name: dev.name,
      role: dev.role,
    });

    // Simulate two rapid parallel clicks with different keys
    const [resA, resB] = await Promise.all([
      claimHandler(buildClaimRequest(lead.id, { token: devToken, idempotencyKey: `click-1-${Date.now()}` }), {
        params: { id: lead.id },
      }),
      claimHandler(buildClaimRequest(lead.id, { token: devToken, idempotencyKey: `click-2-${Date.now()}` }), {
        params: { id: lead.id },
      }),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    // The second concurrent request must be rejected with 409 conflict
    expect(statuses).toContain(409);

    // Verify user balance deducted exactly once (15 credits remaining)
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: dev.id } });
    expect(sub.credits).toBe(15);

    // Exactly 1 claim record in database
    const totalClaims = await prisma.leadClaim.count({
      where: { leadId: lead.id, userId: dev.id },
    });
    expect(totalClaims).toBe(1);
  });

  it('3. Enforces Email Verification Policy: unverified legacy accounts are blocked from claiming', async () => {
    const devPassword = await hashPassword('DevSecure@123');
    const proPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'pro' } });

    // Legacy user created with emailVerified: null (no grandfathering)
    const legacyUser = await prisma.user.create({
      data: {
        email: `legacy-unverified-${Date.now()}@leadforge.eg`,
        passwordHash: devPassword,
        name: 'Legacy Unverified User',
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: null, // NOT verified
        developerProfile: {
          create: {
            companyName: 'Legacy Dev Co',
            services: ['Website Development'],
            locations: ['القاهرة'],
            allLocationsMode: true,
            allNichesMode: true,
            leadPreferences: ['NO_WEBSITE'],
            minBudget: 5000,
            maxBudget: 50000,
          },
        },
        subscription: {
          create: {
            planId: proPlan.id,
            status: 'ACTIVE',
            credits: 50,
            totalCreditsGranted: 50,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
        },
      },
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: 'Verification Gate Test Clinic',
        normalizedName: 'verification gate test clinic',
        category: 'Dental',
        city: 'القاهرة',
        governorate: 'القاهرة',
        phone: '01012347777',
        hasPhone: true,
        websiteStatus: 'NO_WEBSITE',
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        verificationStatus: 'VERIFIED',
        isCanonical: true,
        creditCost: 5,
        score: 82,
        leadType: 'SHARED',
        maxPurchasers: 3,
        currentPurchasers: 0,
        lastVerifiedAt: new Date(),
      },
    });

    const legacyToken = await signSessionToken({
      userId: legacyUser.id,
      email: legacyUser.email,
      name: legacyUser.name,
      role: legacyUser.role,
    });

    const claimRes = await claimHandler(
      buildClaimRequest(lead.id, { token: legacyToken, idempotencyKey: `legacy-key-${Date.now()}` }),
      { params: { id: lead.id } }
    );

    expect(claimRes.status).toBe(403);
    const body = await claimRes.json();
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');

    // Balance remains 50
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { userId: legacyUser.id } });
    expect(sub.credits).toBe(50);

    // Zero claims in DB
    const claims = await prisma.leadClaim.count({
      where: { leadId: lead.id, userId: legacyUser.id },
    });
    expect(claims).toBe(0);
  });
});

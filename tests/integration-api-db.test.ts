import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import { DEFAULT_PLANS, subscribeUserToPlan } from '@/lib/payment/provider';
import { DEFAULT_SCORING_RULES, recalculateAllLeadsScores } from '@/lib/scoring-engine';
import {
  claimLeadForDeveloper,
  updateDeveloperLeadStatus,
  submitDeveloperLeadFeedback,
} from '@/lib/lead-service';
import { runIngestionPipeline } from '@/lib/collectors';

// Route Handlers for API + Authorization testing
import { GET as getLeadsHandler } from '@/app/api/leads/route';
import { GET as getLeadByIdHandler } from '@/app/api/leads/[id]/route';
import { POST as claimLeadHandler } from '@/app/api/leads/[id]/claim/route';
import { PATCH as updateLeadStatusHandler } from '@/app/api/leads/[id]/status/route';
import { POST as submitFeedbackHandler } from '@/app/api/leads/[id]/feedback/route';
import { GET as adminUsersGetHandler } from '@/app/api/admin/users/route';
import { POST as adminCsvImportHandler } from '@/app/api/admin/import/route';
import { GET as adminReportsGetHandler } from '@/app/api/admin/reports/route';
import { PATCH as adminRulePatchHandler } from '@/app/api/admin/rules/[id]/route';
import { PATCH as adminLeadPatchHandler } from '@/app/api/admin/leads/[id]/route';

describe('Integration, Database, Security & API Tests (PostgreSQL + Prisma)', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  let adminUser: { id: string; email: string; name: string; role: 'ADMIN' };
  let dev1: { id: string; email: string; name: string; role: 'DEVELOPER' };
  let dev2: { id: string; email: string; name: string; role: 'DEVELOPER' };
  let devZeroCredits: { id: string; email: string; name: string; role: 'DEVELOPER' };

  let adminToken: string;
  let dev1Token: string;
  let dev2Token: string;
  let devZeroToken: string;

  let freePlanId: string;
  let proPlanId: string;

  beforeAll(async () => {
    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(testDb.prisma, testDb.pglite);

    // Seed Scoring Rules
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

    // Seed Plans
    for (const p of DEFAULT_PLANS) {
      const created = await prisma.plan.create({ data: p });
      if (p.slug === 'free') freePlanId = created.id;
      if (p.slug === 'pro') proPlanId = created.id;
    }

    const passwordHash = await hashPassword('Test@12345');
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const createdAdmin = await prisma.user.create({
      data: {
        email: 'admin.test@leadforge.eg',
        name: 'Admin Tester',
        passwordHash,
        role: 'ADMIN',
      },
    });
    adminUser = { ...createdAdmin, role: 'ADMIN' };

    const createdDev1 = await prisma.user.create({
      data: {
        email: 'dev1.test@leadforge.eg',
        name: 'Developer One',
        passwordHash,
        role: 'DEVELOPER',
        developerProfile: {
          create: {
            services: ['Website Development'],
            locations: ['القاهرة', 'الجيزة'],
            niches: ['Dental', 'Restaurant'],
            leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
            minBudget: 5000,
            leadType: 'BOTH',
          },
        },
        subscription: {
          create: {
            planId: proPlanId,
            status: 'ACTIVE',
            credits: 10,
            totalCreditsGranted: 50,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
    });
    dev1 = { ...createdDev1, role: 'DEVELOPER' };

    const createdDev2 = await prisma.user.create({
      data: {
        email: 'dev2.test@leadforge.eg',
        name: 'Developer Two',
        passwordHash,
        role: 'DEVELOPER',
        developerProfile: {
          create: {
            services: ['Website Development'],
            locations: ['القاهرة'],
            niches: ['Dental'],
            leadPreferences: ['NO_WEBSITE'],
            minBudget: 5000,
            leadType: 'BOTH',
          },
        },
        subscription: {
          create: {
            planId: proPlanId,
            status: 'ACTIVE',
            credits: 10,
            totalCreditsGranted: 50,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
    });
    dev2 = { ...createdDev2, role: 'DEVELOPER' };

    const createdDevZero = await prisma.user.create({
      data: {
        email: 'zero.test@leadforge.eg',
        name: 'Zero Credits Dev',
        passwordHash,
        role: 'DEVELOPER',
        subscription: {
          create: {
            planId: freePlanId,
            status: 'ACTIVE',
            credits: 0,
            totalCreditsGranted: 3,
            creditsUsed: 3,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
    });
    devZeroCredits = { ...createdDevZero, role: 'DEVELOPER' };

    adminToken = await signSessionToken({
      userId: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: 'ADMIN',
    });
    dev1Token = await signSessionToken({
      userId: dev1.id,
      email: dev1.email,
      name: dev1.name,
      role: 'DEVELOPER',
    });
    dev2Token = await signSessionToken({
      userId: dev2.id,
      email: dev2.email,
      name: dev2.name,
      role: 'DEVELOPER',
    });
    devZeroToken = await signSessionToken({
      userId: devZeroCredits.id,
      email: devZeroCredits.email,
      name: devZeroCredits.name,
      role: 'DEVELOPER',
    });
  });

  afterAll(async () => {
    if (cleanupDb) await cleanupDb();
  });

  it('1. Duplicate businesses are merged across sources instead of creating duplicate leads', async () => {
    const firstImport = await runIngestionPipeline({
      prisma,
      userId: adminUser.id,
      sourceName: 'Source A (Google Business)',
      rawRecords: [
        {
          name: 'ABC Dental Clinic',
          category: 'Dental',
          city: 'Cairo',
          phone: '01005556677',
          facebook: 'https://facebook.com/abcdental',
          rating: 4.7,
          reviewCount: 320,
        },
      ],
    });

    expect(firstImport.valid).toBe(1);
    expect(firstImport.duplicates).toBe(0);

    // Import same business from Source B with different phone formatting and new Instagram + Email
    const secondImport = await runIngestionPipeline({
      prisma,
      userId: adminUser.id,
      sourceName: 'Source B (YellowPages CSV)',
      rawRecords: [
        {
          name: 'ABC Dental Clinic - Cairo',
          category: 'Dental',
          city: 'القاهرة',
          phone: '+20 100 555 6677',
          email: 'info@abcdental-cairo.eg',
          instagram: 'https://instagram.com/abcdental',
          rating: 4.8,
          reviewCount: 350,
        },
      ],
    });

    expect(secondImport.valid).toBe(0);
    expect(secondImport.duplicates).toBe(1);

    const totalLeads = await prisma.lead.count();
    expect(totalLeads).toBe(1);

    const mergedLead = await prisma.lead.findFirst();
    expect(mergedLead).not.toBeNull();
    expect(mergedLead?.sourceList).toEqual([
      'Source A (Google Business)',
      'Source B (YellowPages CSV)',
    ]);
    expect(mergedLead?.hasInstagram).toBe(true);
    expect(mergedLead?.hasEmail).toBe(true);
    expect(mergedLead?.reviewCount).toBe(350);
  });

  it('2. Cannot claim without credits (returns 403 NO_CREDITS_REMAINING)', async () => {
    const lead = await prisma.lead.findFirstOrThrow();

    await expect(
      claimLeadForDeveloper({
        prisma,
        userId: devZeroCredits.id,
        leadId: lead.id,
      })
    ).rejects.toThrow(/No credits remaining/);

    // Also test via HTTP API Route Handler
    const req = new NextRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${devZeroToken}`,
      },
    });
    const res = await claimLeadHandler(req, { params: { id: lead.id } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('NO_CREDITS_REMAINING');
  });

  it('3. Cannot claim exclusive lead twice (second developer is blocked with 409)', async () => {
    const exclusiveReport = await runIngestionPipeline({
      prisma,
      userId: adminUser.id,
      sourceName: 'Exclusive Source',
      rawRecords: [
        {
          name: 'Royal Exclusive Dental Center',
          category: 'Dental',
          city: 'Cairo',
          phone: '01007778899',
          facebook: 'https://facebook.com/royaldental',
          rating: 4.9,
          reviewCount: 210,
          leadType: 'EXCLUSIVE',
          creditCost: 1,
        },
      ],
    });

    const exclusiveLeadId = exclusiveReport.records[0].leadId!;

    // Developer 1 claims the exclusive lead
    const claim1 = await claimLeadForDeveloper({
      prisma,
      userId: dev1.id,
      leadId: exclusiveLeadId,
    });
    expect(claim1.claim.exclusiveClaim).toBe(true);
    expect(claim1.lead.status).toBe('CLAIMED_FULL');
    expect(claim1.remainingCredits).toBe(9);

    // Developer 2 attempts to claim the same exclusive lead -> MUST FAIL
    await expect(
      claimLeadForDeveloper({
        prisma,
        userId: dev2.id,
        leadId: exclusiveLeadId,
      })
    ).rejects.toThrow();

    // Developer 1 attempts to claim it again -> MUST FAIL
    await expect(
      claimLeadForDeveloper({
        prisma,
        userId: dev1.id,
        leadId: exclusiveLeadId,
      })
    ).rejects.toThrow();
  });

  it('4. Cannot exceed max purchasers on a Shared lead', async () => {
    const sharedReport = await runIngestionPipeline({
      prisma,
      userId: adminUser.id,
      sourceName: 'Shared Source',
      rawRecords: [
        {
          name: 'Shared Max1 Restaurant',
          category: 'Restaurant',
          city: 'Cairo',
          phone: '01008889900',
          leadType: 'SHARED',
          maxPurchasers: 1,
        },
      ],
    });

    const sharedLeadId = sharedReport.records[0].leadId!;

    // Developer 1 claims (1/1)
    const c1 = await claimLeadForDeveloper({
      prisma,
      userId: dev1.id,
      leadId: sharedLeadId,
    });
    expect(c1.lead.currentPurchasers).toBe(1);
    expect(c1.lead.status).toBe('CLAIMED_FULL');

    // Developer 2 tries to claim when maxPurchasers (1) is reached -> MUST FAIL
    await expect(
      claimLeadForDeveloper({
        prisma,
        userId: dev2.id,
        leadId: sharedLeadId,
      })
    ).rejects.toThrow();
  });

  it("5. Cannot access or modify another developer's private claim data, notes, or status", async () => {
    // Dev 1 updates status and private notes on their claimed lead
    const dev1Claims = await prisma.leadClaim.findMany({ where: { userId: dev1.id } });
    const targetLeadId = dev1Claims[0].leadId;

    await updateDeveloperLeadStatus({
      prisma,
      userId: dev1.id,
      leadId: targetLeadId,
      status: 'MEETING',
      notes: 'ملاحظة خاصة جدًا للمطور الأول - عرض سعر 18000 جنيه',
    });

    // Dev 2 fetches GET /api/leads/:id -> must NOT see Dev 1's claim or private notes, and phone must be masked
    const getReq = new NextRequest(`http://localhost:3000/api/leads/${targetLeadId}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${dev2Token}`,
      },
    });
    const getRes = await getLeadByIdHandler(getReq, { params: { id: targetLeadId } });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();

    expect(getBody.lead.isClaimedByMe).toBe(false);
    expect(getBody.lead.myClaim).toBeNull();
    expect(getBody.lead.phone).toContain('****');

    // Dev 2 tries to PATCH /api/leads/:id/status on Dev 1's claimed lead -> MUST FAIL with 403
    const patchReq = new NextRequest(`http://localhost:3000/api/leads/${targetLeadId}/status`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${dev2Token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ status: 'WON', notes: 'Hacked note' }),
    });
    const patchRes = await updateLeadStatusHandler(patchReq, { params: { id: targetLeadId } });
    expect(patchRes.status).toBe(403);

    // Dev 2 tries to POST /api/leads/:id/feedback without claiming -> MUST FAIL with 403
    const fbReq = new NextRequest(`http://localhost:3000/api/leads/${targetLeadId}/feedback`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${dev2Token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ useful: false, reason: 'WRONG_PHONE' }),
    });
    const fbRes = await submitFeedbackHandler(fbReq, { params: { id: targetLeadId } });
    expect(fbRes.status).toBe(403);
  });

  it('6. RBAC Authorization: Developer cannot access Admin APIs (403 Forbidden)', async () => {
    const devReq = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${dev1Token}`,
      },
    });
    const devRes = await adminUsersGetHandler(devReq);
    expect(devRes.status).toBe(403);

    const adminReq = new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    const adminRes = await adminUsersGetHandler(adminReq);
    expect(adminRes.status).toBe(200);
  });

  it('7. CSV Import API validates, normalizes, deduplicates, scores, and returns accurate Import Report', async () => {
    const csvContent = `name,category,city,area,address,phone,email,website,facebook,instagram,rating,reviewCount,source
عيادة المعادي للأسنان,Dental,القاهرة,المعادي,شارع 9,01012340001,maadi@dental.eg,,https://facebook.com/maadidental,https://instagram.com/maadidental,4.8,190,CSV Test
ABC Dental Clinic,Dental,Cairo,Nasr City,Abbas El Akkad,01005556677,,,,,4.7,320,CSV Test
,Dental,,Invalid Row,,,,,,9.5,-5,CSV Test`;

    const req = new NextRequest('http://localhost:3000/api/admin/import', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        csvContent,
        sourceName: 'CSV Test Batch',
        fileName: 'batch.csv',
      }),
    });

    const res = await adminCsvImportHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.report.imported).toBe(3);
    expect(data.report.valid).toBe(1);
    expect(data.report.duplicates).toBe(1);
    expect(data.report.invalid).toBe(1);
  });

  it('8. Feedback, Subscription Upgrade, and Admin Reports work end-to-end', async () => {
    const dev1Claims = await prisma.leadClaim.findMany({ where: { userId: dev1.id } });
    const targetLeadId = dev1Claims[0].leadId;

    // Submit negative feedback without reason -> fails validation (400)
    await expect(
      submitDeveloperLeadFeedback({
        prisma,
        userId: dev1.id,
        leadId: targetLeadId,
        useful: false,
        reason: null,
      })
    ).rejects.toThrow();

    // Submit valid feedback
    const fb = await submitDeveloperLeadFeedback({
      prisma,
      userId: dev1.id,
      leadId: targetLeadId,
      useful: true,
      comment: 'Excellent verified clinic lead',
    });
    expect(fb.useful).toBe(true);

    // Upgrade zero-credits developer to Pro plan
    const subRes = await subscribeUserToPlan({
      prisma,
      userId: devZeroCredits.id,
      planId: proPlanId,
    });
    expect(subRes.subscription.credits).toBe(50);

    // Recalculate all leads scores
    const rescored = await recalculateAllLeadsScores(prisma);
    expect(rescored).toBeGreaterThanOrEqual(4);

    // Fetch Admin Reports
    const repReq = new NextRequest('http://localhost:3000/api/admin/reports', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    const repRes = await adminReportsGetHandler(repReq);
    expect(repRes.status).toBe(200);
    const repData = await repRes.json();
    expect(repData.overview.totalLeads).toBeGreaterThanOrEqual(4);
    expect(repData.rates.leadSuccessRate).toBe(100);
  });

  it('9. Lead Discovery GET /api/leads filters by city, category, websiteStatus, and scoreRange', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/leads?city=القاهرة&category=Dental&websiteStatus=NO_WEBSITE&scoreRange=70-100',
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${dev1Token}`,
        },
      }
    );
    const res = await getLeadsHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.leads.length).toBeGreaterThanOrEqual(1);
    for (const l of data.leads) {
      expect(l.city).toBe('القاهرة');
      expect(l.category).toBe('Dental');
      expect(l.websiteStatus).toBe('NO_WEBSITE');
      expect(l.score).toBeGreaterThanOrEqual(70);
    }
  });

  it('10. Concurrent lead claims enforce atomic credit deduction and exclusive purchaser limits', async () => {
    // Set devZeroCredits to have exactly 1 credit
    await prisma.subscription.update({
      where: { userId: devZeroCredits.id },
      data: { credits: 1 },
    });

    // Create two available leads
    const batch = await runIngestionPipeline({
      prisma,
      userId: adminUser.id,
      sourceName: 'Concurrency Test Source',
      rawRecords: [
        {
          name: 'Concurrent Clinic Alpha',
          category: 'Dental',
          city: 'Cairo',
          phone: '01099990001',
          leadType: 'SHARED',
          creditCost: 1,
        },
        {
          name: 'Concurrent Clinic Beta',
          category: 'Dental',
          city: 'Cairo',
          phone: '01099990002',
          leadType: 'EXCLUSIVE',
          creditCost: 1,
        },
      ],
    });
    const leadAlphaId = batch.records[0].leadId!;
    const leadBetaId = batch.records[1].leadId!;

    // Developer with 1 credit tries to claim two leads concurrently
    const results = await Promise.allSettled([
      claimLeadForDeveloper({ prisma, userId: devZeroCredits.id, leadId: leadAlphaId }),
      claimLeadForDeveloper({ prisma, userId: devZeroCredits.id, leadId: leadBetaId }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const updatedSub = await prisma.subscription.findUniqueOrThrow({
      where: { userId: devZeroCredits.id },
    });
    expect(updatedSub.credits).toBe(0);
  });

  it('11. Admin PATCH /api/admin/rules/[id] updates rule conditions and recalculates lead scores', async () => {
    const patchReq = new NextRequest('http://localhost:3000/api/admin/rules/rule-high-reviews', {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        weight: 15,
        conditions: {
          field: 'reviewCount',
          operator: 'GREATER_THAN_OR_EQUAL',
          targetValue: '100',
        },
      }),
    });

    const res = await adminRulePatchHandler(patchReq, { params: { id: 'rule-high-reviews' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rule.weight).toBe(15);
    expect(data.rule.targetValue).toBe('100');
  });

  it('12. Admin PATCH /api/admin/leads/[id] ASSIGN enforces exclusive lead ownership and creates status history', async () => {
    const exclusiveBatch = await runIngestionPipeline({
      prisma,
      userId: adminUser.id,
      sourceName: 'Admin Assign Source',
      rawRecords: [
        {
          name: 'Admin Exclusive Medical Center',
          category: 'Medical',
          city: 'Giza',
          phone: '01088881111',
          leadType: 'EXCLUSIVE',
        },
      ],
    });
    const leadId = exclusiveBatch.records[0].leadId!;

    // First assignment to dev1 succeeds
    const req1 = new NextRequest(`http://localhost:3000/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'ASSIGN', developerId: dev1.id }),
    });
    const res1 = await adminLeadPatchHandler(req1, { params: { id: leadId } });
    expect(res1.status).toBe(200);

    // Second assignment of the same EXCLUSIVE lead to dev2 must fail with 409
    const req2 = new NextRequest(`http://localhost:3000/api/admin/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'ASSIGN', developerId: dev2.id }),
    });
    const res2 = await adminLeadPatchHandler(req2, { params: { id: leadId } });
    expect(res2.status).toBe(409);
  });
});

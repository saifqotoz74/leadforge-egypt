import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth';
import { claimLead } from '../src/lib/claims';
import { ensureDbReady, prisma } from '../src/lib/db';
import {
  adminCorrectEngagementStatus,
  EngagementEngineError,
  getAdminEngagementsOverview,
  getDeveloperEngagementById,
  getDeveloperEngagements,
  getEngagementTimeline,
  recordContactAttempt,
  submitLeadFeedback,
  updateEngagementStatus,
} from '../src/lib/feedback';
import { seedDatabase } from '../src/lib/seed-data';

// API Route Handlers
import { GET as getAdminEngagementsRoute } from '../src/app/api/admin/engagements/route';
import { POST as postAdminCorrectStatusRoute } from '../src/app/api/admin/engagements/[id]/correct-status/route';
import { GET as getDevEngagementsRoute } from '../src/app/api/developer/engagements/route';
import { GET as getDevEngagementByIdRoute } from '../src/app/api/developer/engagements/[id]/route';
import { GET as getDevEngagementTimelineRoute } from '../src/app/api/developer/engagements/[id]/timeline/route';
import {
  GET as getContactAttemptsRoute,
  POST as postContactAttemptsRoute,
} from '../src/app/api/leads/[id]/contact-attempts/route';
import {
  GET as getEngagementStatusRoute,
  POST as postEngagementStatusRoute,
} from '../src/app/api/leads/[id]/engagement/status/route';
import {
  GET as getFeedbackRoute,
  POST as postFeedbackRoute,
} from '../src/app/api/leads/[id]/feedback/route';
import { PATCH as patchLegacyLeadStatusRoute } from '../src/app/api/leads/[id]/status/route';

function makeAuthRequest(
  url: string,
  method: string,
  token: string,
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    ...(body ? { 'content-type': 'application/json' } : {}),
    ...(extraHeaders ?? {}),
  };

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Phase 6 — Production-Grade Feedback & Outcome Engine', () => {
  let adminId: string;
  let adminToken: string;
  let devAId: string;
  let devAToken: string;
  let devBId: string;
  let devBToken: string;
  let devCId: string;
  let devCToken: string;
  let devNoClaimId: string;
  let devNoClaimToken: string;
  let proPlanId: string;

  async function createTestDeveloper(emailPrefix: string, credits = 200) {
    const email = `${emailPrefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@test.eg`;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({
      data: {
        email,
        name: `Phase6 Dev ${emailPrefix}`,
        passwordHash: 'hashed',
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: new Date(),
        developerProfile: {
          create: {
            companyName: `Studio ${emailPrefix}`,
            services: [
              'Website Development',
              'E-Commerce Development',
              'Landing Pages',
              'Website Redesign',
              'Booking & Clinic Systems',
              'Custom Web Applications',
            ],
            locations: ['القاهرة', 'الجيزة', 'الإسكندرية', 'القاهرة الجديدة'],
            niches: [
              'Dental',
              'Medical',
              'Restaurant',
              'Real Estate',
              'Education',
              'Retail',
              'Beauty',
              'Automotive',
              'Other',
            ],
            leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE', 'SOCIAL_ONLY'],
            minBudget: 1000,
            maxBudget: 500000,
            leadType: 'BOTH',
            maxActiveLeads: 200,
            isActive: true,
            isAcceptingLeads: true,
          },
        },
        subscription: {
          create: {
            planId: proPlanId,
            status: 'ACTIVE',
            credits,
            totalCreditsGranted: credits,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
          },
        },
        creditAccount: {
          create: {
            balance: credits,
            reservedBalance: 0,
            lifetimePurchased: credits,
            totalGranted: credits,
            version: 1,
          },
        },
      },
      include: { creditAccount: true },
    });

    if (user.creditAccount && credits > 0) {
      await prisma.creditTransaction.create({
        data: {
          accountId: user.creditAccount.id,
          developerId: user.id,
          type: 'PURCHASE',
          amount: credits,
          balanceBefore: 0,
          balanceAfter: credits,
          referenceType: 'SUBSCRIPTION',
          referenceId: user.id,
          reason: 'Initial Phase 6 test credit grant',
          idempotencyKey: `init-p6-${user.id}`,
        },
      });
    }

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'DEVELOPER',
    });

    return { user, token };
  }

  let leadCounter = 0;
  async function createSaleableTestLead(overrides?: {
    accessType?: 'SHARED' | 'EXCLUSIVE';
    maxPurchasers?: number;
    phone?: string;
    email?: string;
  }) {
    leadCounter += 1;
    const accessType = overrides?.accessType ?? 'SHARED';
    const isExclusive = accessType === 'EXCLUSIVE';
    const maxPurchasers = isExclusive ? 1 : (overrides?.maxPurchasers ?? 3);
    const phone =
      overrides?.phone ?? `0106${String(1000000 + leadCounter).slice(-7)}`;
    const email = overrides?.email ?? `lead.p6.${leadCounter}@clinic-eg.com`;
    const now = new Date();

    const lead = await prisma.lead.create({
      data: {
        businessName: `مركز النيل الطبي الحديث ${leadCounter}`,
        normalizedName: `مركز النيل الطبي الحديث ${leadCounter}`,
        category: 'Dental',
        governorate: 'القاهرة',
        city: 'القاهرة',
        area: 'مدينة نصر',
        address: 'شارع عباس العقاد، مدينة نصر',
        phone,
        normalizedPhone: `+20${phone.slice(1)}`,
        phones: [`+20${phone.slice(1)}`],
        hasPhone: true,
        phoneValidationStatus: 'VALID',
        email,
        normalizedEmail: email,
        hasEmail: true,
        emailValidationStatus: 'VALID',
        website: null,
        websiteStatus: 'NO_WEBSITE',
        websiteVerificationState: 'VERIFIED_NO_WEBSITE',
        hasFacebook: true,
        facebook: `https://facebook.com/nileclinic${leadCounter}`,
        estimatedBudget: 18000,
        minBudget: 12000,
        maxBudget: 25000,
        budgetCurrency: 'EGP',
        requiredService: 'Website Development',
        requiredServices: ['WEBSITE_DEVELOPMENT'],
        projectLeadType: 'NO_WEBSITE',
        isVerified: true,
        isRecentlyActive: true,
        score: 88,
        temperature: 'HOT',
        qualityScore: 92,
        qualityStatus: 'HIGH',
        completenessScore: 95,
        freshnessStatus: 'FRESH',
        verificationStatus: 'VERIFIED',
        saleabilityStatus: 'AVAILABLE',
        businessStatus: 'OPEN',
        isCanonical: true,
        leadType: accessType,
        accessType,
        exclusive: isExclusive,
        maxPurchasers,
        currentPurchasers: 0,
        availableForClaim: true,
        requiresMatching: false,
        source: 'Google Business Profile Export',
        sourceList: ['Google Business Profile Export'],
        lastVerifiedAt: now,
      },
    });

    await prisma.leadVerification.createMany({
      data: [
        {
          leadId: lead.id,
          verificationType: 'PHONE',
          status: 'VERIFIED',
          checkedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          resultSummary: 'Trusted source phone verified',
        },
        {
          leadId: lead.id,
          verificationType: 'BUSINESS_STATUS',
          status: 'VERIFIED',
          checkedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          resultSummary: 'Trusted source business active',
        },
      ],
    });

    return lead;
  }

  beforeAll(async () => {
    await ensureDbReady();
    await seedDatabase(prisma);

    const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    adminId = admin.id;
    adminToken = await createSessionToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: 'ADMIN',
    });

    const proPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'pro' } });
    proPlanId = proPlan.id;

    const devA = await createTestDeveloper('devA', 300);
    devAId = devA.user.id;
    devAToken = devA.token;

    const devB = await createTestDeveloper('devB', 300);
    devBId = devB.user.id;
    devBToken = devB.token;

    const devC = await createTestDeveloper('devC', 300);
    devCId = devC.user.id;
    devCToken = devC.token;

    const devNoClaim = await createTestDeveloper('devNoClaim', 100);
    devNoClaimId = devNoClaim.user.id;
    devNoClaimToken = devNoClaim.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. STATE MACHINE TESTS (Section 42)
  // =========================================================================
  describe('Section 42 — Deterministic Engagement State Machine', () => {
    it('allows full happy-path lifecycle: CLAIMED -> CONTACTED -> REPLIED -> INTERESTED -> MEETING -> PROPOSAL_SENT -> NEGOTIATION -> WON', async () => {
      const lead = await createSaleableTestLead();
      const claimRes = await claimLead({ leadId: lead.id, developerId: devAId });
      expect(claimRes.success).toBe(true);

      // Initial engagement created on claim
      const initialEng = await getDeveloperEngagementById(devAId, lead.id);
      expect(initialEng.currentStatus).toBe('CLAIMED');
      expect(initialEng.claimedAt).toBeTruthy();

      const s1 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'CONTACTED',
        note: 'Initial call made',
      });
      expect(s1.engagement.currentStatus).toBe('CONTACTED');
      expect(s1.engagement.firstContactedAt).toBeTruthy();

      const s2 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'REPLIED',
        note: 'Client replied on WhatsApp',
      });
      expect(s2.engagement.currentStatus).toBe('REPLIED');
      expect(s2.engagement.firstRepliedAt).toBeTruthy();

      const s3 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'INTERESTED',
        note: 'Interested in clinic booking portal',
      });
      expect(s3.engagement.currentStatus).toBe('INTERESTED');
      expect(s3.engagement.interestedAt).toBeTruthy();

      const s4 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'MEETING',
        note: 'Zoom demo completed',
      });
      expect(s4.engagement.currentStatus).toBe('MEETING');
      expect(s4.engagement.meetingAt).toBeTruthy();

      const s5 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'PROPOSAL_SENT',
        note: 'Sent PDF proposal for 22,000 EGP',
      });
      expect(s5.engagement.currentStatus).toBe('PROPOSAL_SENT');
      expect(s5.engagement.proposalSentAt).toBeTruthy();

      const s6 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'NEGOTIATION',
        note: 'Negotiating payment milestones',
      });
      expect(s6.engagement.currentStatus).toBe('NEGOTIATION');
      expect(s6.engagement.negotiationAt).toBeTruthy();

      const s7 = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'WON',
        estimatedProjectValue: 22000,
        currency: 'EGP',
        wonReason: 'Signed contract for website + booking system',
      });
      expect(s7.engagement.currentStatus).toBe('WON');
      expect(s7.engagement.finalOutcome).toBe('WON');
      expect(s7.engagement.estimatedProjectValue).toBe(22000);
      expect(s7.engagement.currency).toBe('EGP');
      expect(s7.engagement.wonAt).toBeTruthy();
    });

    it('supports MEETING -> WON and INTERESTED -> LOST valid transitions', async () => {
      const lead1 = await createSaleableTestLead();
      await claimLead({ leadId: lead1.id, developerId: devAId });
      await updateEngagementStatus({ leadId: lead1.id, developerId: devAId, status: 'CONTACTED' });
      await updateEngagementStatus({ leadId: lead1.id, developerId: devAId, status: 'REPLIED' });
      await updateEngagementStatus({ leadId: lead1.id, developerId: devAId, status: 'INTERESTED' });
      await updateEngagementStatus({ leadId: lead1.id, developerId: devAId, status: 'MEETING' });
      const wonFromMeeting = await updateEngagementStatus({
        leadId: lead1.id,
        developerId: devAId,
        status: 'WON',
        estimatedProjectValue: 'unknown',
      });
      expect(wonFromMeeting.engagement.currentStatus).toBe('WON');
      expect(wonFromMeeting.engagement.estimatedProjectValue).toBeNull();

      const lead2 = await createSaleableTestLead();
      await claimLead({ leadId: lead2.id, developerId: devAId });
      await updateEngagementStatus({ leadId: lead2.id, developerId: devAId, status: 'CONTACTED' });
      await updateEngagementStatus({ leadId: lead2.id, developerId: devAId, status: 'REPLIED' });
      await updateEngagementStatus({ leadId: lead2.id, developerId: devAId, status: 'INTERESTED' });
      const lostFromInterested = await updateEngagementStatus({
        leadId: lead2.id,
        developerId: devAId,
        status: 'LOST',
        reasonCode: 'COMPETITOR',
        note: 'Client chose an existing agency',
      });
      expect(lostFromInterested.engagement.currentStatus).toBe('LOST');
      expect(lostFromInterested.engagement.finalOutcome).toBe('LOST');
      expect(lostFromInterested.engagement.lostReasonCode).toBe('COMPETITOR');
    });

    it('rejects invalid transition CLAIMED -> WON and terminal transitions WON -> LOST, LOST -> WON, INVALID -> CONTACTED', async () => {
      const lead = await createSaleableTestLead({ maxPurchasers: 3 });
      await claimLead({ leadId: lead.id, developerId: devAId });
      await claimLead({ leadId: lead.id, developerId: devBId });
      await claimLead({ leadId: lead.id, developerId: devCId });

      // CLAIMED -> WON must fail with INVALID_STATUS_TRANSITION
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'WON',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
        statusCode: 422,
      });

      // Move devA to WON via valid path, then attempt WON -> LOST
      await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'CONTACTED' });
      await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'REPLIED' });
      await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'INTERESTED' });
      await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'WON' });

      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'LOST',
          reasonCode: 'PRICE',
        })
      ).rejects.toMatchObject({
        code: 'TERMINAL_STATUS',
        statusCode: 422,
      });

      // Move devB to LOST, then attempt LOST -> WON
      await updateEngagementStatus({ leadId: lead.id, developerId: devBId, status: 'CONTACTED' });
      await updateEngagementStatus({
        leadId: lead.id,
        developerId: devBId,
        status: 'LOST',
        reasonCode: 'NO_BUDGET',
      });

      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devBId,
          status: 'WON',
        })
      ).rejects.toMatchObject({
        code: 'TERMINAL_STATUS',
        statusCode: 422,
      });

      // Move devC to INVALID, then attempt INVALID -> CONTACTED
      await updateEngagementStatus({
        leadId: lead.id,
        developerId: devCId,
        status: 'INVALID',
        reasonCode: 'WRONG_PHONE',
      });

      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devCId,
          status: 'CONTACTED',
        })
      ).rejects.toMatchObject({
        code: 'TERMINAL_STATUS',
        statusCode: 422,
      });
    });
  });

  // =========================================================================
  // 2. SHARED LEAD INDEPENDENCE TESTS (Section 43)
  // =========================================================================
  describe('Section 43 — Shared Lead Independence Across Developers', () => {
    it('maintains completely independent engagement lifecycles for Developer A, Developer B, and Developer C on the same shared lead', async () => {
      const sharedLead = await createSaleableTestLead({ accessType: 'SHARED', maxPurchasers: 3 });

      await claimLead({ leadId: sharedLead.id, developerId: devAId });
      await claimLead({ leadId: sharedLead.id, developerId: devBId });
      await claimLead({ leadId: sharedLead.id, developerId: devCId });

      // Developer A progresses to CONTACTED -> REPLIED -> INTERESTED -> WON
      await updateEngagementStatus({
        leadId: sharedLead.id,
        developerId: devAId,
        status: 'CONTACTED',
      });

      // Verify Developer B and C are still CLAIMED
      const engBAfterAContacted = await getDeveloperEngagementById(devBId, sharedLead.id);
      const engCAfterAContacted = await getDeveloperEngagementById(devCId, sharedLead.id);
      expect(engBAfterAContacted.currentStatus).toBe('CLAIMED');
      expect(engCAfterAContacted.currentStatus).toBe('CLAIMED');

      // Developer B transitions to NOT_INTERESTED
      await updateEngagementStatus({
        leadId: sharedLead.id,
        developerId: devBId,
        status: 'NOT_INTERESTED',
        note: 'Client decided to wait until next quarter',
      });

      // Developer A continues to REPLIED -> INTERESTED -> WON
      await updateEngagementStatus({
        leadId: sharedLead.id,
        developerId: devAId,
        status: 'REPLIED',
      });
      await updateEngagementStatus({
        leadId: sharedLead.id,
        developerId: devAId,
        status: 'INTERESTED',
      });
      await updateEngagementStatus({
        leadId: sharedLead.id,
        developerId: devAId,
        status: 'WON',
        estimatedProjectValue: 28000,
        currency: 'EGP',
      });

      const finalEngA = await getDeveloperEngagementById(devAId, sharedLead.id);
      const finalEngB = await getDeveloperEngagementById(devBId, sharedLead.id);
      const finalEngC = await getDeveloperEngagementById(devCId, sharedLead.id);

      expect(finalEngA.currentStatus).toBe('WON');
      expect(finalEngA.finalOutcome).toBe('WON');
      expect(finalEngA.estimatedProjectValue).toBe(28000);

      expect(finalEngB.currentStatus).toBe('NOT_INTERESTED');
      expect(finalEngB.finalOutcome).toBe('NOT_INTERESTED');

      expect(finalEngC.currentStatus).toBe('CLAIMED');
      expect(finalEngC.finalOutcome).toBeNull();
    });
  });

  // =========================================================================
  // 3. AUTHORIZATION & OWNERSHIP ISOLATION TESTS (Section 44)
  // =========================================================================
  describe('Section 44 — Authorization & Claim Ownership Isolation', () => {
    it('blocks developers without a claim from updating status, submitting feedback, or logging contact attempts', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });

      // Developer without claim cannot update engagement status
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devNoClaimId,
          status: 'CONTACTED',
        })
      ).rejects.toMatchObject({
        code: 'CLAIM_REQUIRED',
        statusCode: 403,
      });

      // Developer without claim cannot submit feedback
      await expect(
        submitLeadFeedback({
          leadId: lead.id,
          developerId: devNoClaimId,
          category: 'CONTACT',
          reasonCode: 'PHONE_ANSWERED',
          rating: 5,
        })
      ).rejects.toMatchObject({
        code: 'CLAIM_REQUIRED',
        statusCode: 403,
      });

      // Developer without claim cannot log contact attempts
      await expect(
        recordContactAttempt({
          leadId: lead.id,
          developerId: devNoClaimId,
          channel: 'PHONE',
          result: 'ANSWERED',
        })
      ).rejects.toMatchObject({
        code: 'CLAIM_REQUIRED',
        statusCode: 403,
      });
    });

    it('blocks developers from viewing another developer’s engagement or timeline', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });
      const engA = await getDeveloperEngagementById(devAId, lead.id);

      await expect(getDeveloperEngagementById(devBId, engA.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });

      await expect(getEngagementTimeline(devBId, engA.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        statusCode: 403,
      });
    });

    it('blocks developers whose claim is REFUNDED / EXPIRED / CANCELLED from updating status or submitting feedback', async () => {
      const lead = await createSaleableTestLead();
      const claimRes = await claimLead({ leadId: lead.id, developerId: devAId });

      // Mark claim as REFUNDED
      await prisma.leadClaim.update({
        where: { id: claimRes.claimId },
        data: { status: 'REFUNDED', accessGranted: false },
      });

      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'CONTACTED',
        })
      ).rejects.toMatchObject({
        code: 'CLAIM_NOT_ACTIVE',
        statusCode: 422,
      });

      await expect(
        submitLeadFeedback({
          leadId: lead.id,
          developerId: devAId,
          category: 'CONTACT',
          reasonCode: 'PHONE_INVALID',
        })
      ).rejects.toMatchObject({
        code: 'CLAIM_NOT_ACTIVE',
        statusCode: 422,
      });
    });
  });

  // =========================================================================
  // 4. IDEMPOTENCY & DUPLICATE PREVENTION TESTS (Section 45)
  // =========================================================================
  describe('Section 45 — Idempotency & Duplicate Event Suppression', () => {
    it('handles idempotent status transitions and rejects duplicate status transitions without idempotencyKey', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });

      const firstCall = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'CONTACTED',
        idempotencyKey: 'status-idem-key-001',
      });
      expect(firstCall.idempotentReplay).toBe(false);

      // Replay with same idempotencyKey returns existing result without creating duplicate history
      const replayCall = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'CONTACTED',
        idempotencyKey: 'status-idem-key-001',
      });
      expect(replayCall.idempotentReplay).toBe(true);
      expect(replayCall.statusHistory.id).toBe(firstCall.statusHistory.id);

      const historyCount = await prisma.leadStatusHistory.count({
        where: { engagementId: firstCall.engagement.id, newStatus: 'CONTACTED' },
      });
      expect(historyCount).toBe(1);

      // Reusing same idempotencyKey for a different status transition fails with IDEMPOTENCY_CONFLICT
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'REPLIED',
          idempotencyKey: 'status-idem-key-001',
        })
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
        statusCode: 409,
      });

      // Duplicate status transition without idempotencyKey is rejected
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'CONTACTED',
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_EVENT',
        statusCode: 409,
      });
    });

    it('handles idempotent feedback & contact attempts and suppresses semantic duplicate feedback', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });

      const fb1 = await submitLeadFeedback({
        leadId: lead.id,
        developerId: devAId,
        category: 'CONTACT',
        reasonCode: 'WHATSAPP_ACTIVE',
        rating: 5,
        comment: 'Fast response on WhatsApp',
        idempotencyKey: 'fb-idem-001',
      });
      expect(fb1.idempotentReplay).toBe(false);

      // Idempotent replay with same key
      const fbReplay = await submitLeadFeedback({
        leadId: lead.id,
        developerId: devAId,
        category: 'CONTACT',
        reasonCode: 'WHATSAPP_ACTIVE',
        rating: 5,
        comment: 'Fast response on WhatsApp',
        idempotencyKey: 'fb-idem-001',
      });
      expect(fbReplay.idempotentReplay).toBe(true);
      expect(fbReplay.feedback.id).toBe(fb1.feedback.id);

      // Semantic duplicate without idempotencyKey is rejected with DUPLICATE_EVENT
      await expect(
        submitLeadFeedback({
          leadId: lead.id,
          developerId: devAId,
          category: 'CONTACT',
          reasonCode: 'WHATSAPP_ACTIVE',
          rating: 5,
          comment: 'Fast response on WhatsApp',
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_EVENT',
        statusCode: 409,
      });

      // Contact attempt idempotency
      const ca1 = await recordContactAttempt({
        leadId: lead.id,
        developerId: devAId,
        channel: 'WHATSAPP',
        result: 'MESSAGE_SENT',
        note: 'Sent intro portfolio',
        idempotencyKey: 'ca-idem-001',
      });
      expect(ca1.idempotentReplay).toBe(false);

      const caReplay = await recordContactAttempt({
        leadId: lead.id,
        developerId: devAId,
        channel: 'WHATSAPP',
        result: 'MESSAGE_SENT',
        note: 'Sent intro portfolio',
        idempotencyKey: 'ca-idem-001',
      });
      expect(caReplay.idempotentReplay).toBe(true);
      expect(caReplay.contactAttempt.id).toBe(ca1.contactAttempt.id);
    });
  });

  // =========================================================================
  // 5. INVALIDATION & PHASE 3 QUALITY INTEGRATION TESTS (Section 46)
  // =========================================================================
  describe('Section 46 — Non-Destructive Invalidation & Phase 3 Quality Integration', () => {
    it('validates required reasonCodes for LOST and INVALID and preserves trusted source data while emitting reverification signals', async () => {
      const lead = await createSaleableTestLead({
        accessType: 'SHARED',
        maxPurchasers: 3,
        phone: '01099112233',
        email: 'trusted@clinic-cairo.eg',
      });
      await claimLead({ leadId: lead.id, developerId: devAId });
      await claimLead({ leadId: lead.id, developerId: devBId });

      // INVALID without reasonCode fails
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'INVALID',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_REASON',
        statusCode: 422,
      });

      // INVALID with OTHER but no note fails
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'INVALID',
          reasonCode: 'OTHER',
          note: '   ',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_REASON',
        statusCode: 422,
      });

      // Developer A marks engagement INVALID with WRONG_PHONE
      const invRes = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'INVALID',
        reasonCode: 'WRONG_PHONE',
        note: 'Number belongs to a residential apartment',
      });

      expect(invRes.engagement.currentStatus).toBe('INVALID');
      expect(invRes.engagement.finalOutcome).toBe('INVALID');
      expect(invRes.engagement.invalidReasonCode).toBe('WRONG_PHONE');
      expect(invRes.qualitySignal?.signalTriggered).toBe(true);
      expect(invRes.qualitySignal?.signal).toBe('PHONE_REQUIRES_REVERIFICATION');
      expect(invRes.qualitySignal?.confidence).toBe('MEDIUM');
      expect(invRes.qualitySignal?.trustedSourceDataPreserved).toBe(true);

      // Verify Lead record is NOT deleted and trusted source data is NOT overwritten
      const refreshedLead = await prisma.lead.findUniqueOrThrow({
        where: { id: lead.id },
        include: {
          verifications: {
            where: { status: 'NEEDS_REVERIFICATION' },
            orderBy: { checkedAt: 'desc' },
          },
        },
      });
      expect(refreshedLead.phone).toBe('01099112233');
      expect(refreshedLead.email).toBe('trusted@clinic-cairo.eg');
      expect(refreshedLead.businessStatus).toBe('OPEN');
      expect(refreshedLead.phoneValidationStatus).toBe('VALID');
      expect(refreshedLead.qualityFlags).toContain('PHONE_REQUIRES_REVERIFICATION');
      expect(refreshedLead.verifications.length).toBeGreaterThanOrEqual(1);
      expect(refreshedLead.verifications[0].resultSummary).toContain(
        'PHONE_REQUIRES_REVERIFICATION'
      );

      // When Developer B also reports WRONG_PHONE on the same lead, confidence upgrades to HIGH (MULTIPLE_DEVELOPER_REPORTS)
      const secondReport = await submitLeadFeedback({
        leadId: lead.id,
        developerId: devBId,
        category: 'CONTACT',
        reasonCode: 'WRONG_PHONE',
        rating: 1,
        comment: 'Confirmed wrong number',
      });
      expect(secondReport.qualitySignal?.sourceType).toBe('MULTIPLE_DEVELOPER_REPORTS');
      expect(secondReport.qualitySignal?.confidence).toBe('HIGH');
      expect(secondReport.feedback.confidence).toBe('HIGH');
    });
  });

  // =========================================================================
  // 6. TERMINAL STATE & ADMIN CORRECTION TESTS (Section 47)
  // =========================================================================
  describe('Section 47 — Terminal State Locking & Admin Status Correction', () => {
    it('enforces terminal state lock for developers and allows controlled admin status correction with full audit trail', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });
      await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'CONTACTED' });
      const lostRes = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'LOST',
        reasonCode: 'TIMING',
        note: 'Postponed project',
      });

      const engagementId = lostRes.engagement.id;

      // Normal developer transition from LOST is rejected
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'NEGOTIATION',
        })
      ).rejects.toMatchObject({
        code: 'TERMINAL_STATUS',
        statusCode: 422,
      });

      // Admin correction without reason fails
      await expect(
        adminCorrectEngagementStatus({
          engagementId,
          adminId,
          previousState: 'LOST',
          newState: 'NEGOTIATION',
          reason: '   ',
        })
      ).rejects.toMatchObject({
        code: 'INVALID_REASON',
        statusCode: 422,
      });

      // Admin correction with valid reason succeeds and preserves original state
      const correction = await adminCorrectEngagementStatus({
        engagementId,
        adminId,
        previousState: 'LOST',
        newState: 'NEGOTIATION',
        reason: 'Developer marked LOST by mistake; client reopened negotiation',
      });

      expect(correction.success).toBe(true);
      expect(correction.previousState).toBe('LOST');
      expect(correction.newState).toBe('NEGOTIATION');
      expect(correction.engagement.currentStatus).toBe('NEGOTIATION');
      expect(correction.engagement.isTerminal).toBe(false);
      expect(correction.engagement.closedAt).toBeNull();
      expect(correction.engagement.lostAt).toBeNull();
      expect(correction.engagement.finalOutcome).toBeNull();
      expect(correction.statusHistory.actorType).toBe('ADMIN');
      expect(correction.statusHistory.actorId).toBe(adminId);
      expect(correction.statusHistory.isAdminCorrection).toBe(true);

      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          action: 'ADMIN_STATUS_CORRECTION',
          entityId: engagementId,
        },
      });
      expect(auditEntry).toBeTruthy();

      // Developer can now transition NEGOTIATION -> WON
      const wonAfterCorrection = await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'WON',
        estimatedProjectValue: 19500,
      });
      expect(wonAfterCorrection.engagement.currentStatus).toBe('WON');
    });
  });

  // =========================================================================
  // 7. TIMESTAMP VALIDATION TESTS (Section 48)
  // =========================================================================
  describe('Section 48 — Chronological Timestamp Validation', () => {
    it('rejects contactedAt < claimedAt, repliedAt < contactedAt, wonAt < meetingAt, and future timestamps', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });
      const eng = await getDeveloperEngagementById(devAId, lead.id);

      const beforeClaim = new Date(eng.claimedAt.getTime() - 60 * 1000);
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);

      // contactedAt < claimedAt fails
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'CONTACTED',
          contactedAt: beforeClaim,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_TIMESTAMP',
        statusCode: 422,
      });

      // Future timestamp fails
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'CONTACTED',
          contactedAt: futureDate,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_TIMESTAMP',
        statusCode: 422,
      });

      const tContacted = new Date();
      await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'CONTACTED',
        contactedAt: tContacted,
      });

      // repliedAt < contactedAt fails
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'REPLIED',
          repliedAt: new Date(tContacted.getTime() - 5000),
        })
      ).rejects.toMatchObject({
        code: 'INVALID_TIMESTAMP',
        statusCode: 422,
      });

      const tReplied = new Date();
      await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'REPLIED',
        repliedAt: tReplied,
      });

      const tInterested = new Date();
      await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'INTERESTED',
        interestedAt: tInterested,
      });

      const tMeeting = new Date();
      await updateEngagementStatus({
        leadId: lead.id,
        developerId: devAId,
        status: 'MEETING',
        meetingAt: tMeeting,
      });

      // wonAt < meetingAt fails
      await expect(
        updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'WON',
          wonAt: new Date(tMeeting.getTime() - 5000),
        })
      ).rejects.toMatchObject({
        code: 'INVALID_TIMESTAMP',
        statusCode: 422,
      });
    });
  });

  // =========================================================================
  // 8. ABUSE & RATE LIMIT TESTS + API ENDPOINT TESTS (Section 49 & Sections 27-31)
  // =========================================================================
  describe('Section 49 & API Routes — Abuse Protection, Rate Limiting & Route Handlers', () => {
    it('flags rapid status changes and frequent invalid reports and blocks excessive contact attempts with RATE_LIMITED', async () => {
      const { user: spamDev } = await createTestDeveloper('spamDev', 200);

      // Mark 3 leads as INVALID rapidly to trigger FREQUENT_INVALID_REPORTS + INVALID_SEQUENCE + ADMIN_REVIEW_REQUIRED
      const l1 = await createSaleableTestLead();
      const l2 = await createSaleableTestLead();
      const l3 = await createSaleableTestLead();

      await claimLead({ leadId: l1.id, developerId: spamDev.id });
      await claimLead({ leadId: l2.id, developerId: spamDev.id });
      await claimLead({ leadId: l3.id, developerId: spamDev.id });

      const r1 = await updateEngagementStatus({
        leadId: l1.id,
        developerId: spamDev.id,
        status: 'INVALID',
        reasonCode: 'WRONG_PHONE',
      });
      expect(r1.abuseFlags).toContain('INVALID_SEQUENCE');

      await updateEngagementStatus({
        leadId: l2.id,
        developerId: spamDev.id,
        status: 'INVALID',
        reasonCode: 'BUSINESS_CLOSED',
      });

      const r3 = await updateEngagementStatus({
        leadId: l3.id,
        developerId: spamDev.id,
        status: 'INVALID',
        reasonCode: 'FAKE_BUSINESS',
      });
      expect(r3.abuseFlags).toContain('FREQUENT_INVALID_REPORTS');
      expect(r3.abuseFlags).toContain('ADMIN_REVIEW_REQUIRED');

      // Excessive contact attempts (> 15 in 10 minutes on same engagement) blocked with RATE_LIMITED
      const l4 = await createSaleableTestLead();
      await claimLead({ leadId: l4.id, developerId: spamDev.id });

      for (let i = 0; i < 15; i++) {
        await recordContactAttempt({
          leadId: l4.id,
          developerId: spamDev.id,
          channel: 'PHONE',
          result: 'NO_ANSWER',
          note: `Attempt ${i + 1}`,
        });
      }

      await expect(
        recordContactAttempt({
          leadId: l4.id,
          developerId: spamDev.id,
          channel: 'PHONE',
          result: 'NO_ANSWER',
          note: 'Attempt 16 over limit',
        })
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
    });

    it('verifies all Phase 6 HTTP API Route Handlers end-to-end', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });

      // 1. POST /api/leads/[id]/contact-attempts
      const caReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/contact-attempts`,
        'POST',
        devAToken,
        {
          channel: 'PHONE',
          result: 'ANSWERED',
          note: 'Spoke with clinic manager',
        }
      );
      const caRes = await postContactAttemptsRoute(caReq, { params: { id: lead.id } });
      expect(caRes.status).toBe(200);
      const caJson = await caRes.json();
      expect(caJson.success).toBe(true);
      expect(caJson.contactAttempt.channel).toBe('PHONE');

      // GET /api/leads/[id]/contact-attempts
      const getCaReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/contact-attempts`,
        'GET',
        devAToken
      );
      const getCaRes = await getContactAttemptsRoute(getCaReq, { params: { id: lead.id } });
      expect(getCaRes.status).toBe(200);

      // 2. POST /api/leads/[id]/engagement/status
      const stReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/engagement/status`,
        'POST',
        devAToken,
        {
          status: 'CONTACTED',
          note: 'Moved to CONTACTED via API',
        }
      );
      const stRes = await postEngagementStatusRoute(stReq, { params: { id: lead.id } });
      expect(stRes.status).toBe(200);
      const stJson = await stRes.json();
      expect(stJson.engagement.currentStatus).toBe('CONTACTED');

      // GET /api/leads/[id]/engagement/status
      const getStReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/engagement/status`,
        'GET',
        devAToken
      );
      const getStRes = await getEngagementStatusRoute(getStReq, { params: { id: lead.id } });
      expect(getStRes.status).toBe(200);

      // 3. POST /api/leads/[id]/feedback (Phase 6 structured payload)
      const fbReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/feedback`,
        'POST',
        devAToken,
        {
          category: 'BUSINESS',
          reasonCode: 'NO_WEBSITE_CONFIRMED',
          rating: 5,
          comment: 'Confirmed clinic has no website and needs one',
        }
      );
      const fbRes = await postFeedbackRoute(fbReq, { params: { id: lead.id } });
      expect(fbRes.status).toBe(200);
      const fbJson = await fbRes.json();
      expect(fbJson.feedback.category).toBe('BUSINESS');
      expect(fbJson.feedback.reasonCode).toBe('NO_WEBSITE_CONFIRMED');

      // GET /api/leads/[id]/feedback
      const getFbReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/feedback`,
        'GET',
        devAToken
      );
      const getFbRes = await getFeedbackRoute(getFbReq, { params: { id: lead.id } });
      expect(getFbRes.status).toBe(200);

      // 4. GET /api/developer/engagements, /api/developer/engagements/[id], /api/developer/engagements/[id]/timeline
      const listEngReq = makeAuthRequest(
        'http://localhost:3000/api/developer/engagements?page=1&pageSize=10',
        'GET',
        devAToken
      );
      const listEngRes = await getDevEngagementsRoute(listEngReq);
      expect(listEngRes.status).toBe(200);
      const listEngJson = await listEngRes.json();
      expect(listEngJson.engagements.length).toBeGreaterThanOrEqual(1);

      const engagementId = stJson.engagement.id;
      const singleEngReq = makeAuthRequest(
        `http://localhost:3000/api/developer/engagements/${engagementId}`,
        'GET',
        devAToken
      );
      const singleEngRes = await getDevEngagementByIdRoute(singleEngReq, {
        params: { id: engagementId },
      });
      expect(singleEngRes.status).toBe(200);

      const timelineReq = makeAuthRequest(
        `http://localhost:3000/api/developer/engagements/${engagementId}/timeline`,
        'GET',
        devAToken
      );
      const timelineRes = await getDevEngagementTimelineRoute(timelineReq, {
        params: { id: engagementId },
      });
      expect(timelineRes.status).toBe(200);
      const timelineJson = await timelineRes.json();
      expect(timelineJson.timeline.length).toBeGreaterThanOrEqual(3);

      // 5. Developer forbidden from calling Admin Status Correction route
      const devAdminAttempt = makeAuthRequest(
        `http://localhost:3000/api/admin/engagements/${engagementId}/correct-status`,
        'POST',
        devAToken,
        {
          previousState: 'CONTACTED',
          newState: 'REPLIED',
          reason: 'Unauthorized attempt',
        }
      );
      const devAdminRes = await postAdminCorrectStatusRoute(devAdminAttempt, {
        params: { id: engagementId },
      });
      expect(devAdminRes.status).toBe(403);

      // 6. Admin Status Correction & Admin Engagements Overview routes
      const adminCorrectReq = makeAuthRequest(
        `http://localhost:3000/api/admin/engagements/${engagementId}/correct-status`,
        'POST',
        adminToken,
        {
          previousState: 'CONTACTED',
          newState: 'REPLIED',
          reason: 'Admin verified reply timestamp',
        }
      );
      const adminCorrectRes = await postAdminCorrectStatusRoute(adminCorrectReq, {
        params: { id: engagementId },
      });
      expect(adminCorrectRes.status).toBe(200);

      const adminOverviewReq = makeAuthRequest(
        'http://localhost:3000/api/admin/engagements',
        'GET',
        adminToken
      );
      const adminOverviewRes = await getAdminEngagementsRoute(adminOverviewReq);
      expect(adminOverviewRes.status).toBe(200);
      const adminOverviewJson = await adminOverviewRes.json();
      expect(adminOverviewJson.conversionFunnel).toBeDefined();
      expect(adminOverviewJson.wonSummary).toBeDefined();
    });

    it('allows INVALID transitions from INTERESTED, MEETING, PROPOSAL_SENT, and NEGOTIATION (ANY VALID SALES STATE -> INVALID)', async () => {
      const stagesToInvalidate = ['INTERESTED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION'] as const;

      for (const stage of stagesToInvalidate) {
        const lead = await createSaleableTestLead();
        await claimLead({ leadId: lead.id, developerId: devAId });
        await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'CONTACTED' });
        await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'REPLIED' });
        await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'INTERESTED' });

        if (stage === 'MEETING' || stage === 'PROPOSAL_SENT' || stage === 'NEGOTIATION') {
          await updateEngagementStatus({ leadId: lead.id, developerId: devAId, status: 'MEETING' });
        }
        if (stage === 'PROPOSAL_SENT' || stage === 'NEGOTIATION') {
          await updateEngagementStatus({
            leadId: lead.id,
            developerId: devAId,
            status: 'PROPOSAL_SENT',
          });
        }
        if (stage === 'NEGOTIATION') {
          await updateEngagementStatus({
            leadId: lead.id,
            developerId: devAId,
            status: 'NEGOTIATION',
          });
        }

        const invRes = await updateEngagementStatus({
          leadId: lead.id,
          developerId: devAId,
          status: 'INVALID',
          reasonCode: 'BUSINESS_CLOSED',
          note: `Discovered business permanently closed during ${stage} stage`,
        });

        expect(invRes.engagement.currentStatus).toBe('INVALID');
        expect(invRes.engagement.isTerminal).toBe(true);
        expect(invRes.engagement.closedAt).toBeTruthy();
        expect(invRes.engagement.invalidatedAt).toBeTruthy();
        expect(invRes.engagement.finalOutcome).toBe('INVALID');
      }
    });

    it('accepts all Section 9 & Section 36 structured feedback reason codes, emits quality signals on INVALID_NUMBER/BOUNCED contact attempts, and persists schema fields', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });

      // Section 36 exact payload: { category: 'LEAD_QUALITY', reasonCode: 'GOOD_LEAD', rating: 5, comment: '...' }
      const fbGood = await submitLeadFeedback({
        leadId: lead.id,
        developerId: devAId,
        category: 'LEAD_QUALITY',
        reasonCode: 'GOOD_LEAD',
        rating: 5,
        comment: 'Responsive business owner',
      });
      expect(fbGood.feedback.useful).toBe(true);
      expect(fbGood.feedback.developerId).toBe(devAId);
      expect(fbGood.feedback.note).toBe('Responsive business owner');

      // Section 9 BUSINESS_WRONG_CATEGORY triggers CATEGORY_REQUIRES_REVERIFICATION
      const fbCat = await submitLeadFeedback({
        leadId: lead.id,
        developerId: devAId,
        category: 'BUSINESS',
        reasonCode: 'BUSINESS_WRONG_CATEGORY',
        rating: 2,
        comment: 'Actually a pharmacy, not a dental clinic',
      });
      expect(fbCat.qualitySignal?.signalTriggered).toBe(true);
      expect(fbCat.qualitySignal?.signal).toBe('CATEGORY_REQUIRES_REVERIFICATION');

      // Section 9 SALES reason codes
      const fbSales = await submitLeadFeedback({
        leadId: lead.id,
        developerId: devAId,
        category: 'SALES',
        reasonCode: 'REQUESTED_QUOTE',
        rating: 4,
        comment: 'Client requested a formal price quote',
      });
      expect(fbSales.feedback.useful).toBe(true);
      expect(fbSales.feedback.reasonCode).toBe('REQUESTED_QUOTE');

      // ContactAttempt with INVALID_NUMBER triggers PHONE_REQUIRES_REVERIFICATION
      const caInvalidPhone = await recordContactAttempt({
        leadId: lead.id,
        developerId: devAId,
        channel: 'PHONE',
        result: 'INVALID_NUMBER',
        note: 'Automated operator says number is out of service',
      });
      expect(caInvalidPhone.qualitySignal?.signalTriggered).toBe(true);
      expect(caInvalidPhone.qualitySignal?.signal).toBe('PHONE_REQUIRES_REVERIFICATION');

      // ContactAttempt with BOUNCED triggers EMAIL_REQUIRES_REVERIFICATION
      const caBouncedEmail = await recordContactAttempt({
        leadId: lead.id,
        developerId: devAId,
        channel: 'EMAIL',
        result: 'BOUNCED',
        note: '550 5.1.1 User unknown',
      });
      expect(caBouncedEmail.qualitySignal?.signalTriggered).toBe(true);
      expect(caBouncedEmail.qualitySignal?.signal).toBe('EMAIL_REQUIRES_REVERIFICATION');
    });

    it('enforces terminal locking and PROPOSAL_SENT/NEGOTIATION support on legacy PATCH /api/leads/[id]/status and verifies multi-developer shared lead seed data', async () => {
      const lead = await createSaleableTestLead();
      await claimLead({ leadId: lead.id, developerId: devAId });

      // Legacy PATCH /api/leads/[id]/status supports PROPOSAL_SENT
      const propReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/status`,
        'PATCH',
        devAToken,
        { status: 'PROPOSAL_SENT', notes: 'Sent quotation via legacy status endpoint' }
      );
      const propRes = await patchLegacyLeadStatusRoute(propReq, { params: { id: lead.id } });
      expect(propRes.status).toBe(200);

      // Move to WON via legacy PATCH /api/leads/[id]/status
      const wonReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/status`,
        'PATCH',
        devAToken,
        { status: 'WON', notes: 'Closed deal' }
      );
      const wonRes = await patchLegacyLeadStatusRoute(wonReq, { params: { id: lead.id } });
      expect(wonRes.status).toBe(200);

      // Verify DB persisted isTerminal = true and closedAt != null
      const dbEng = await prisma.leadEngagement.findUniqueOrThrow({
        where: { leadId_developerId: { leadId: lead.id, developerId: devAId } },
      });
      expect(dbEng.isTerminal).toBe(true);
      expect(dbEng.closedAt).toBeTruthy();

      // Attempting to reopen terminal state via legacy PATCH /api/leads/[id]/status is rejected with 422 TERMINAL_STATUS
      const reopenReq = makeAuthRequest(
        `http://localhost:3000/api/leads/${lead.id}/status`,
        'PATCH',
        devAToken,
        { status: 'CONTACTED', notes: 'Try to reopen closed deal' }
      );
      const reopenRes = await patchLegacyLeadStatusRoute(reopenReq, { params: { id: lead.id } });
      expect(reopenRes.status).toBe(422);
      const reopenBody = await reopenRes.json();
      expect(reopenBody.code).toBe('TERMINAL_STATUS');

      // Verify seeded multi-developer shared lead has 3 distinct developer engagements
      const sharedMultiLead = await prisma.lead.findFirst({
        where: { businessName: { contains: 'مركز سمايل كير لطب وتجميل الأسنان' } },
        include: { engagements: true },
      });
      expect(sharedMultiLead).toBeTruthy();
      expect(sharedMultiLead!.engagements.length).toBeGreaterThanOrEqual(3);
      const statuses = new Set(sharedMultiLead!.engagements.map((e) => e.currentStatus));
      expect(statuses.has('MEETING')).toBe(true);
      expect(statuses.has('CLAIMED')).toBe(true);
      expect(statuses.has('NOT_INTERESTED')).toBe(true);
    });
  });
});

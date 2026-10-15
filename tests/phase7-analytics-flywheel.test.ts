import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth';
import { ensureDbReady, prisma } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed-data';
import {
  AnalyticsEngineError,
  buildRateMetric,
  buildValueMetric,
  calculateCentralizedFunnelMetrics,
  compareObservedVsBaseline,
  computeDeterministicRate,
  decideRuleReviewCandidate,
  detectDeterministicAnomalies,
  evaluateAndGenerateRuleReviewCandidates,
  exportAnalyticsDatasetToCsv,
  generateDailyMetricSnapshots,
  getAdminOverviewAnalytics,
  getDailyMetricSnapshots,
  getDataQualityDashboardAnalytics,
  getDeveloperAnalyticsForAdmin,
  getDeveloperOwnAnalytics,
  getFunnelAndReasonsAnalytics,
  getLeadPerformanceAnalytics,
  getLocationAnalytics,
  getNicheAnalytics,
  getRulePerformanceAnalytics,
  getServiceAnalytics,
  getSourceAnalytics,
  listRuleReviewCandidates,
  METRIC_DICTIONARY,
  normalizeAnalyticsFilters,
  resolveDateRange,
  resolvePrimaryOriginSource,
  evaluateClaimEngagementFlags,
  summarizeNumericValues,
} from '../src/lib/analytics';

// Route Handlers
import {
  GET as getOverviewRoute,
  POST as postOverviewRoute,
} from '../src/app/api/admin/analytics/overview/route';
import { GET as getLeadsAnalyticsRoute } from '../src/app/api/admin/analytics/leads/route';
import { GET as getSourcesAnalyticsRoute } from '../src/app/api/admin/analytics/sources/route';
import { GET as getNichesAnalyticsRoute } from '../src/app/api/admin/analytics/niches/route';
import { GET as getLocationsAnalyticsRoute } from '../src/app/api/admin/analytics/locations/route';
import { GET as getServicesAnalyticsRoute } from '../src/app/api/admin/analytics/services/route';
import { GET as getDevelopersAnalyticsRoute } from '../src/app/api/admin/analytics/developers/route';
import { GET as getRulesAnalyticsRoute } from '../src/app/api/admin/analytics/rules/route';
import { GET as getDataQualityAnalyticsRoute } from '../src/app/api/admin/analytics/data-quality/route';
import { GET as getFunnelAnalyticsRoute } from '../src/app/api/admin/analytics/funnel/route';
import {
  GET as getRuleReviewRoute,
  POST as postRuleReviewRoute,
} from '../src/app/api/admin/analytics/rule-review/route';
import { POST as postRuleReviewDecisionRoute } from '../src/app/api/admin/analytics/rule-review/[id]/decision/route';
import { GET as getExportRoute } from '../src/app/api/admin/analytics/export/route';
import { GET as getDeveloperAnalyticsRoute } from '../src/app/api/developer/analytics/route';
import { GET as getDeveloperDashboardRoute } from '../src/app/api/developer/dashboard/route';
import { GET as getAdminReportsRoute } from '../src/app/api/admin/reports/route';

function makeAuthRequest(
  url: string,
  method: string,
  token?: string,
  body?: Record<string, unknown>
): NextRequest {
  const headers: Record<string, string> = {
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    ...(body ? { 'content-type': 'application/json' } : {}),
  };

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Phase 7 — Production-Grade Analytics & Deterministic Data Flywheel', () => {
  let adminId: string;
  let adminToken: string;
  let devAId: string;
  let devAToken: string;
  let devBId: string;
  let devBToken: string;

  beforeAll(async () => {
    await ensureDbReady();
    await seedDatabase(prisma);

    const admin = await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
    });
    adminId = admin.id;
    adminToken = await createSessionToken({
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: 'ADMIN',
    });

    await prisma.user.updateMany({
      where: { role: 'DEVELOPER' },
      data: { status: 'ACTIVE' },
    });

    const devs = await prisma.user.findMany({
      where: { role: 'DEVELOPER', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take: 3,
    });
    expect(devs.length).toBeGreaterThanOrEqual(2);

    devAId = devs[0].id;
    devAToken = await createSessionToken({
      userId: devs[0].id,
      email: devs[0].email,
      name: devs[0].name,
      role: 'DEVELOPER',
    });

    devBId = devs[1].id;
    devBToken = await createSessionToken({
      userId: devs[1].id,
      email: devs[1].email,
      name: devs[1].name,
      role: 'DEVELOPER',
    });
  }, 60000);

  // ==========================================================================
  // 1. METRIC TESTS & DENOMINATOR DISCIPLINE (Section 5, 6, 45)
  // ==========================================================================
  describe('1. Centralized Metric Dictionary & Exact Formula Verification (Section 45)', () => {
    it('defines all 6 metric layers in METRIC_DICTIONARY with explicit versions and denominators', () => {
      const requiredKeys = [
        'CONTACT_RATE',
        'REPLY_RATE',
        'INTEREST_RATE',
        'MEETING_RATE',
        'PROPOSAL_RATE',
        'WIN_RATE',
        'WIN_RATE_OF_MEETINGS',
        'WIN_RATE_OF_CONTACTED',
        'WIN_RATE_OF_COMPLETED',
        'LOSS_RATE',
        'INVALID_RATE',
        'DUPLICATE_RATE',
        'REFUND_RATE',
        'CLAIM_RATE',
        'REVENUE_PER_LEAD',
        'REVENUE_PER_CLAIM',
      ];
      for (const key of requiredKeys) {
        expect(METRIC_DICTIONARY[key]).toBeDefined();
        expect(METRIC_DICTIONARY[key].version).toBeTruthy();
        expect(METRIC_DICTIONARY[key].numerator).toBeTruthy();
        expect(METRIC_DICTIONARY[key].denominator).toBeTruthy();
      }
    });

    it('computes exact Section 45 synthetic funnel rates and denominators without ambiguity', () => {
      // Section 45 synthetic dataset:
      // 10 claimed leads -> 8 contacted -> 5 replied -> 4 interested -> 3 meetings -> 1 won, 2 lost, 1 invalid
      const filters = normalizeAnalyticsFilters({ preset: 'all_time' });
      const funnel = calculateCentralizedFunnelMetrics(
        {
          claimed: 10,
          contacted: 8,
          replied: 5,
          interested: 4,
          meetings: 3,
          proposals: 2,
          negotiations: 1,
          won: 1,
          lost: 2,
          notInterested: 0,
          invalid: 1,
        },
        filters
      );

      // 1. Contact Rate = 8 / 10 = 0.80 (80%)
      expect(funnel.stageRates.contactRate.numerator).toBe(8);
      expect(funnel.stageRates.contactRate.denominator).toBe(10);
      expect(funnel.stageRates.contactRate.value).toBe(0.8);
      expect(funnel.stageRates.contactRate.percentage).toBe(80);
      expect(funnel.stageRates.contactRate.status).toBe('VALID');

      // 2. Reply Rate = 5 / 8 = 0.625 (62.5%)
      expect(funnel.stageRates.replyRate.numerator).toBe(5);
      expect(funnel.stageRates.replyRate.denominator).toBe(8);
      expect(funnel.stageRates.replyRate.value).toBe(0.625);
      expect(funnel.stageRates.replyRate.percentage).toBe(62.5);

      // 3. Interest Rate from Replied = 4 / 5 = 0.80 (80%) & from Contacted = 4 / 8 = 0.50 (50%)
      expect(funnel.stageRates.interestRateOfReplied.numerator).toBe(4);
      expect(funnel.stageRates.interestRateOfReplied.denominator).toBe(5);
      expect(funnel.stageRates.interestRateOfReplied.value).toBe(0.8);
      expect(funnel.stageRates.interestRate.numerator).toBe(4);
      expect(funnel.stageRates.interestRate.denominator).toBe(8);
      expect(funnel.stageRates.interestRate.value).toBe(0.5);

      // 4. Meeting Rate from Replied = 3 / 5 = 0.60 (60%) & from Interested = 3 / 4 = 0.75 (75%)
      expect(funnel.stageRates.meetingRate.numerator).toBe(3);
      expect(funnel.stageRates.meetingRate.denominator).toBe(5);
      expect(funnel.stageRates.meetingRate.value).toBe(0.6);
      expect(funnel.stageRates.meetingRateOfInterested.numerator).toBe(3);
      expect(funnel.stageRates.meetingRateOfInterested.denominator).toBe(4);
      expect(funnel.stageRates.meetingRateOfInterested.value).toBe(0.75);

      // 5. Proposal Rate from Meetings = 2 / 3 = 0.6667 (66.67%)
      expect(funnel.stageRates.proposalRate.numerator).toBe(2);
      expect(funnel.stageRates.proposalRate.denominator).toBe(3);
      expect(funnel.stageRates.proposalRate.value).toBe(0.6667);

      // 6. Win Rate from Meetings = 1 / 3 = 0.3333 (33.33%)
      expect(funnel.stageRates.winRate.numerator).toBe(1);
      expect(funnel.stageRates.winRate.denominator).toBe(3);
      expect(funnel.stageRates.winRate.value).toBe(0.3333);
      expect(funnel.stageRates.winRate.percentage).toBe(33.33);

      // 7. Win Rate from Claimed = 1 / 10 = 0.10 (10%)
      expect(funnel.overallRates.winRateOfClaimed.numerator).toBe(1);
      expect(funnel.overallRates.winRateOfClaimed.denominator).toBe(10);
      expect(funnel.overallRates.winRateOfClaimed.value).toBe(0.1);
      expect(funnel.overallRates.winRateOfClaimed.percentage).toBe(10);

      // 8. Win Rate from Contacted = 1 / 8 = 0.125 (12.5%)
      expect(funnel.overallRates.winRateOfContacted.numerator).toBe(1);
      expect(funnel.overallRates.winRateOfContacted.denominator).toBe(8);
      expect(funnel.overallRates.winRateOfContacted.value).toBe(0.125);

      // 9. Win Rate from Completed (1 won + 2 lost = 3 eligible completed) = 1 / 3 = 0.3333
      expect(funnel.overallRates.winRateOfCompleted.numerator).toBe(1);
      expect(funnel.overallRates.winRateOfCompleted.denominator).toBe(3);
      expect(funnel.overallRates.winRateOfCompleted.value).toBe(0.3333);

      // 10. Loss Rate from Claimed = 2 / 10 = 0.20 (20%)
      expect(funnel.overallRates.lossRateOfClaimed.numerator).toBe(2);
      expect(funnel.overallRates.lossRateOfClaimed.denominator).toBe(10);
      expect(funnel.overallRates.lossRateOfClaimed.value).toBe(0.2);

      // 11. Invalid Rate from Claimed = 1 / 10 = 0.10 (10%)
      expect(funnel.overallRates.invalidEngagementRate.numerator).toBe(1);
      expect(funnel.overallRates.invalidEngagementRate.denominator).toBe(10);
      expect(funnel.overallRates.invalidEngagementRate.value).toBe(0.1);
    });

    it('never divides by zero and returns INSUFFICIENT_DATA or INSUFFICIENT_SAMPLE appropriately', () => {
      const filters = normalizeAnalyticsFilters({ preset: 'all_time' });

      const zeroRate = buildRateMetric('WIN_RATE', 0, 0, filters);
      expect(zeroRate.value).toBeNull();
      expect(zeroRate.percentage).toBeNull();
      expect(zeroRate.status).toBe('INSUFFICIENT_DATA');
      expect(zeroRate.displayValue).toBe('INSUFFICIENT_DATA');

      const zeroValue = buildValueMetric('REVENUE_PER_CLAIM', 0, 0, filters);
      expect(zeroValue.value).toBeNull();
      expect(zeroValue.status).toBe('INSUFFICIENT_DATA');

      const smallSample = buildRateMetric('WIN_RATE', 2, 3, filters, {
        minimumSampleSize: 5,
      });
      expect(smallSample.status).toBe('INSUFFICIENT_SAMPLE');
      expect(smallSample.value).toBe(0.6667);
      expect(smallSample.minimumSampleSize).toBe(5);

      const emptyStats = summarizeNumericValues([]);
      expect(emptyStats.average).toBeNull();
      expect(emptyStats.median).toBeNull();
      expect(emptyStats.status).toBe('INSUFFICIENT_DATA');
    });

    it('computes remaining core formulas (duplicateRate, refundRate, claimRate, revenuePerLead, revenuePerClaim)', () => {
      const filters = normalizeAnalyticsFilters({ preset: 'all_time' });

      const dupRate = buildRateMetric('DUPLICATE_RATE', 5, 50, filters);
      expect(dupRate.value).toBe(0.1);
      expect(dupRate.percentage).toBe(10);

      const refundRate = buildRateMetric('REFUND_RATE', 5, 25, filters);
      expect(refundRate.value).toBe(0.2);
      expect(refundRate.percentage).toBe(20);

      const claimRate = buildRateMetric('CLAIM_RATE', 12, 48, filters);
      expect(claimRate.value).toBe(0.25);
      expect(claimRate.percentage).toBe(25);

      const revPerLead = buildValueMetric('REVENUE_PER_LEAD', 2400, 48, filters);
      expect(revPerLead.value).toBe(50);

      const revPerClaim = buildValueMetric('REVENUE_PER_CLAIM', 2400, 12, filters);
      expect(revPerClaim.value).toBe(200);
    });

    it('validates timezone-consistent date ranges and rejects invalid custom ranges', () => {
      const refNow = new Date('2026-10-08T12:00:00.000Z');
      const todayRange = resolveDateRange({
        preset: 'today',
        timezone: 'Africa/Cairo',
        referenceNow: refNow,
      });
      expect(todayRange.from).toBeTruthy();
      expect(todayRange.to).toBeTruthy();
      expect(todayRange.timezone).toBe('Africa/Cairo');

      expect(() =>
        resolveDateRange({
          preset: 'custom',
          from: '2026-10-10',
          to: '2026-10-01',
        })
      ).toThrowError(AnalyticsEngineError);
    });
  });

  // ==========================================================================
  // 2. COHORT TESTS (Section 8, 46)
  // ==========================================================================
  describe('2. Cohort Analysis Across All Required Dimensions (Section 46)', () => {
    it('groups leads and outcomes into acquisition date, claimed date, source, niche, location, score band, quality band, and claim mode cohorts', async () => {
      const [
        byCreatedDate,
        byClaimedDate,
        bySourceCohort,
        byNicheCohort,
        byCityCohort,
      ] = await Promise.all([
        getLeadPerformanceAnalytics({ preset: 'all_time', cohortBy: 'created_date' }),
        getLeadPerformanceAnalytics({ preset: 'all_time', cohortBy: 'claimed_date' }),
        getLeadPerformanceAnalytics({ preset: 'all_time', cohortBy: 'source' }),
        getLeadPerformanceAnalytics({ preset: 'all_time', cohortBy: 'niche' }),
        getLeadPerformanceAnalytics({ preset: 'all_time', cohortBy: 'city' }),
      ]);

      expect(Array.isArray(byCreatedDate.cohorts)).toBe(true);
      expect(byCreatedDate.cohorts.length).toBeGreaterThan(0);
      expect(byCreatedDate.cohorts[0].cohortBy).toBe('created_date');

      expect(Array.isArray(byClaimedDate.cohorts)).toBe(true);
      expect(byClaimedDate.cohorts.length).toBeGreaterThan(0);
      expect(byClaimedDate.cohorts[0].cohortBy).toBe('claimed_date');

      expect(Array.isArray(bySourceCohort.cohorts)).toBe(true);
      expect(bySourceCohort.cohorts.length).toBeGreaterThan(0);
      expect(bySourceCohort.cohorts[0].cohortBy).toBe('source');

      expect(Array.isArray(byNicheCohort.cohorts)).toBe(true);
      expect(byNicheCohort.cohorts.length).toBeGreaterThan(0);
      expect(byNicheCohort.cohorts[0].cohortBy).toBe('niche');

      expect(Array.isArray(byCityCohort.cohorts)).toBe(true);
      expect(byCityCohort.cohorts.length).toBeGreaterThan(0);
      expect(byCityCohort.cohorts[0].cohortBy).toBe('city');

      expect(byCreatedDate.byScoreBand.map((b) => b.scoreBand)).toEqual([
        'PREMIUM',
        'HOT',
        'WARM',
        'COLD',
      ]);

      expect(byCreatedDate.byQualityBand.map((b) => b.qualityBand)).toEqual([
        'EXCELLENT',
        'HIGH',
        'MEDIUM',
        'LOW',
        'VERY_LOW',
      ]);

      expect(byCreatedDate.sharedVsExclusive.map((m) => m.accessType)).toEqual([
        'SHARED',
        'EXCLUSIVE',
      ]);
    });
  });

  // ==========================================================================
  // 3. ATTRIBUTION & PROVENANCE TESTS (Section 9, 10, 11, 12, 13, 34, 47)
  // ==========================================================================
  describe('3. Single-Origin Attribution & Zero Double-Counting Invariants (Section 47)', () => {
    it('enforces single-origin source attribution without double counting canonical leads or revenue across sources, niches, locations, services, or developers', async () => {
      const [overview, sources, niches, locations, services, developers] =
        await Promise.all([
          getAdminOverviewAnalytics({ preset: 'all_time' }),
          getSourceAnalytics({ preset: 'all_time' }),
          getNicheAnalytics({ preset: 'all_time' }),
          getLocationAnalytics({ preset: 'all_time', pageSize: 100 }),
          getServiceAnalytics({ preset: 'all_time', pageSize: 100 }),
          getDeveloperAnalyticsForAdmin({ preset: 'all_time', pageSize: 100 }),
        ]);

      const totalCanonical = overview.executiveSummary.totalLeads;
      const totalAttrRevenue = overview.executiveSummary.attributedClaimRevenueEgp;

      // 1. Source attribution sum of uniqueLeads == totalCanonical
      const sumSourceUniqueLeads = sources.allSourcesSummary.reduce(
        (acc, s) => acc + s.uniqueLeads,
        0
      );
      expect(sumSourceUniqueLeads).toBe(totalCanonical);

      // And enrichment contributions are tracked separately in attribution without inflating uniqueLeads
      const directorySource = sources.allSourcesSummary.find(
        (s) => s.sourceName === 'Egypt Business Directory Feed'
      );
      expect(directorySource).toBeDefined();
      expect(
        (directorySource?.attribution.enrichmentLeadsCount ?? 0) +
          (directorySource?.duplicates ?? 0)
      ).toBeGreaterThanOrEqual(1);

      // 2. Niche attribution sum of leads == totalCanonical
      const sumNicheLeads = niches.allNichesSummary.reduce(
        (acc, n) => acc + n.leads,
        0
      );
      expect(sumNicheLeads).toBe(totalCanonical);

      // 3. Location attribution sum of governorates & cities == totalCanonical
      const sumGovLeads = locations.governorates.reduce(
        (acc, g) => acc + g.totalLeads,
        0
      );
      expect(sumGovLeads).toBe(totalCanonical);

      // 4. Service attribution sum of leads == totalCanonical
      const sumServiceLeads = services.allServicesSummary.reduce(
        (acc, s) => acc + s.totalLeads,
        0
      );
      expect(sumServiceLeads).toBe(totalCanonical);

      // 5. Revenue attribution invariant: sum across sources == sum across niches == sum across developers == totalAttrRevenue
      const sumSourceRev = Number(
        sources.allSourcesSummary
          .reduce((acc, s) => acc + s.attributedRevenueEgp, 0)
          .toFixed(2)
      );
      const sumNicheRev = Number(
        niches.allNichesSummary
          .reduce((acc, n) => acc + n.revenueEgp, 0)
          .toFixed(2)
      );
      const sumDevRev = Number(
        developers.allDevelopersSummary
          .reduce((acc, d) => acc + d.attributedRevenueEgp, 0)
          .toFixed(2)
      );

      expect(sumSourceRev).toBeCloseTo(totalAttrRevenue, 1);
      expect(sumNicheRev).toBeCloseTo(totalAttrRevenue, 1);
      expect(sumDevRev).toBeCloseTo(totalAttrRevenue, 1);
    });

    it('correctly attributes multi-developer shared lead outcomes and refunded claims', async () => {
      const overview = await getAdminOverviewAnalytics({ preset: 'all_time' });
      const credits = overview.layers.layer6Economics.credits;

      // Seed data includes a refunded claim of 5 credits on seventhLead
      expect(credits.creditsRefunded).toBeGreaterThanOrEqual(5);
      expect(credits.creditsConsumed).toBe(
        credits.creditsChargedGross - credits.creditsRefunded
      );
    });
  });

  // ==========================================================================
  // 4. RULE PERFORMANCE & HUMAN-IN-THE-LOOP REVIEW QUEUE TESTS (Section 29, 30, 32, 48)
  // ==========================================================================
  describe('4. Deterministic Rule Performance & Human-Reviewed Data Flywheel (Section 48)', () => {
    it('evaluates scoring, matching, and quality rules and enforces minimumSampleSize threshold', async () => {
      // With high minimumSampleSize (e.g., 999), all rules must report INSUFFICIENT_SAMPLE
      const highThresholdPerf = await getRulePerformanceAnalytics({
        preset: 'all_time',
        minimumSampleSize: 999,
      });

      expect(highThresholdPerf.minimumSampleSize).toBe(999);
      expect(highThresholdPerf.scoringRules.length).toBeGreaterThan(0);
      expect(highThresholdPerf.matchingRules.length).toBeGreaterThan(0);
      expect(highThresholdPerf.qualityRules.length).toBeGreaterThan(0);

      for (const r of highThresholdPerf.allRules) {
        expect(r.sampleStatus).toBe('INSUFFICIENT_SAMPLE');
        expect(r.comparison.flaggedForReview).toBe(false);
      }

      // Candidate generation with minimumSampleSize=999 must skip all rules and create 0 new candidates
      const genHigh = await evaluateAndGenerateRuleReviewCandidates({
        preset: 'all_time',
        minimumSampleSize: 999,
      });
      expect(genHigh.candidatesGeneratedOrUpdated.length).toBe(0);
      expect(genHigh.skippedInsufficientSample.length).toBe(
        highThresholdPerf.allRules.length
      );
    });

    it('supports full Admin RuleReviewCandidate lifecycle (list, generate/create, approve/reject) without auto-mutating active ScoringRule or MatchingRule weights', async () => {
      // Snapshot active scoring and matching rule weights before flywheel operations
      const scoringBefore = await prisma.scoringRule.findMany({
        orderBy: { code: 'asc' },
      });
      const matchingBefore = await prisma.matchingRule.findMany({
        orderBy: { key: 'asc' },
      });

      // 1. List existing seeded candidates via API route
      const listReq = makeAuthRequest(
        'http://localhost:3000/api/admin/analytics/rule-review',
        'GET',
        adminToken
      );
      const listRes = await getRuleReviewRoute(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(Array.isArray(listJson.candidates)).toBe(true);
      expect(listJson.candidates.length).toBeGreaterThanOrEqual(3);

      // 2. Create a new candidate via POST /api/admin/analytics/rule-review
      const createReq = makeAuthRequest(
        'http://localhost:3000/api/admin/analytics/rule-review',
        'POST',
        adminToken,
        {
          ruleType: 'SCORING',
          ruleKey: 'NO_WEBSITE',
          version: 'v1',
          sampleSize: 15,
          baselineRate: 0.12,
          observedRate: 0.28,
          deltaRate: 0.16,
          evidenceSummary: 'Businesses without websites show +16% higher win rate across 15 claims.',
          suggestedAction: 'Review NO_WEBSITE weight in next quarterly scoring calibration.',
        }
      );
      const createRes = await postRuleReviewRoute(createReq);
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      const candidateId = createJson.candidate.id;
      expect(createJson.candidate.status).toBe('OPEN');

      // 3. Approve the candidate via POST /api/admin/analytics/rule-review/[id]/decision
      const decisionReq = makeAuthRequest(
        `http://localhost:3000/api/admin/analytics/rule-review/${candidateId}/decision`,
        'POST',
        adminToken,
        {
          status: 'APPROVED',
          decisionNotes: 'Approved by Admin after verifying Cairo & Giza cohort conversion lift.',
        }
      );
      const decisionRes = await postRuleReviewDecisionRoute(decisionReq, {
        params: { id: candidateId },
      });
      expect(decisionRes.status).toBe(200);
      const decisionJson = await decisionRes.json();
      expect(decisionJson.candidate.status).toBe('APPROVED');
      expect(decisionJson.candidate.reviewedBy).toBe(adminId);
      expect(decisionJson.candidate.reviewedAt).toBeTruthy();

      // 4. Verify AuditLog entry was created for the decision
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          action: 'RULE_REVIEW_DECISION_RECORDED',
          entityId: candidateId,
        },
      });
      expect(auditEntry).toBeTruthy();

      // 5. CRITICAL INVARIANT: Production ScoringRule and MatchingRule weights were NOT auto-mutated
      const scoringAfter = await prisma.scoringRule.findMany({
        orderBy: { code: 'asc' },
      });
      const matchingAfter = await prisma.matchingRule.findMany({
        orderBy: { key: 'asc' },
      });
      expect(
        scoringAfter.map((r) => ({ code: r.code, points: r.points, enabled: r.enabled }))
      ).toEqual(
        scoringBefore.map((r) => ({ code: r.code, points: r.points, enabled: r.enabled }))
      );
      expect(
        matchingAfter.map((r) => ({ key: r.key, points: r.points, enabled: r.enabled }))
      ).toEqual(
        matchingBefore.map((r) => ({ key: r.key, points: r.points, enabled: r.enabled }))
      );
    });
  });

  // ==========================================================================
  // 5. SECURITY & ACCESS CONTROL TESTS (Section 37, 42, 49)
  // ==========================================================================
  describe('5. Analytics Security, Developer Isolation & Safe CSV Export Tests (Section 49)', () => {
    it('rejects unauthenticated requests (401) across all admin and developer analytics endpoints', async () => {
      const endpoints = [
        () =>
          getOverviewRoute(
            makeAuthRequest('http://localhost:3000/api/admin/analytics/overview', 'GET')
          ),
        () =>
          getLeadsAnalyticsRoute(
            makeAuthRequest('http://localhost:3000/api/admin/analytics/leads', 'GET')
          ),
        () =>
          getSourcesAnalyticsRoute(
            makeAuthRequest('http://localhost:3000/api/admin/analytics/sources', 'GET')
          ),
        () =>
          getExportRoute(
            makeAuthRequest('http://localhost:3000/api/admin/analytics/export?report=sources', 'GET')
          ),
        () =>
          getDeveloperAnalyticsRoute(
            makeAuthRequest('http://localhost:3000/api/developer/analytics', 'GET')
          ),
      ];

      for (const callEndpoint of endpoints) {
        const res = await callEndpoint();
        expect(res.status).toBe(401);
      }
    });

    it('rejects developer role (403) from all /api/admin/analytics/* endpoints and CSV exports', async () => {
      const adminEndpointsWithDevToken = [
        () =>
          getOverviewRoute(
            makeAuthRequest(
              'http://localhost:3000/api/admin/analytics/overview',
              'GET',
              devAToken
            )
          ),
        () =>
          getDevelopersAnalyticsRoute(
            makeAuthRequest(
              'http://localhost:3000/api/admin/analytics/developers',
              'GET',
              devAToken
            )
          ),
        () =>
          getRulesAnalyticsRoute(
            makeAuthRequest(
              'http://localhost:3000/api/admin/analytics/rules',
              'GET',
              devAToken
            )
          ),
        () =>
          getRuleReviewRoute(
            makeAuthRequest(
              'http://localhost:3000/api/admin/analytics/rule-review',
              'GET',
              devAToken
            )
          ),
        () =>
          getExportRoute(
            makeAuthRequest(
              'http://localhost:3000/api/admin/analytics/export?report=developers',
              'GET',
              devAToken
            )
          ),
      ];

      for (const callEndpoint of adminEndpointsWithDevToken) {
        const res = await callEndpoint();
        expect(res.status).toBe(403);
      }
    });

    it('strictly scopes /api/developer/analytics to the authenticated developer and rejects cross-developer access with 403', async () => {
      // Dev A accesses their own analytics -> 200 OK
      const ownReq = makeAuthRequest(
        'http://localhost:3000/api/developer/analytics',
        'GET',
        devAToken
      );
      const ownRes = await getDeveloperAnalyticsRoute(ownReq);
      expect(ownRes.status).toBe(200);
      const ownJson = await ownRes.json();
      expect(ownJson.developerId).toBe(devAId);
      expect(ownJson.performance.developerId).toBe(devAId);

      // Dev A attempts to query Dev B's analytics via query param -> 403 Forbidden
      const crossReq = makeAuthRequest(
        `http://localhost:3000/api/developer/analytics?developerId=${devBId}`,
        'GET',
        devAToken
      );
      const crossRes = await getDeveloperAnalyticsRoute(crossReq);
      expect(crossRes.status).toBe(403);

      // Direct service call with mismatched developerId also throws 403
      await expect(
        getDeveloperOwnAnalytics(devAId, { developerId: devBId })
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('produces sanitized Admin CSV exports without secrets or raw credentials', async () => {
      const exportReq = makeAuthRequest(
        'http://localhost:3000/api/admin/analytics/export?report=developers',
        'GET',
        adminToken
      );
      const exportRes = await getExportRoute(exportReq);
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('content-type')).toContain('text/csv');

      const csvText = await exportRes.text();
      expect(csvText).toContain('developerId,name,companyName,planName');
      expect(csvText).not.toContain('passwordHash');
      expect(csvText).not.toContain('$2a$');
      expect(csvText).not.toContain('$2b$');
    });
  });

  // ==========================================================================
  // 6. PERFORMANCE, SNAPSHOTS & FULL API SUITE TESTS (Section 36, 38, 50)
  // ==========================================================================
  describe('6. Daily Snapshots, Anomaly Flags, Pagination & Query Performance (Section 50)', () => {
    it('materializes idempotent DailyMetricSnapshot records and serves all 11 Admin Analytics API endpoints swiftly', async () => {
      const startMs = Date.now();

      const snapReq = makeAuthRequest(
        'http://localhost:3000/api/admin/analytics/overview',
        'POST',
        adminToken,
        {}
      );
      const snapRes = await postOverviewRoute(snapReq);
      expect(snapRes.status).toBe(200);
      const snapJson = await snapRes.json();
      expect(snapJson.success).toBe(true);
      expect(snapJson.snapshotsCount).toBeGreaterThanOrEqual(5);

      const [
        overviewRes,
        leadsRes,
        sourcesRes,
        nichesRes,
        locationsRes,
        servicesRes,
        devsRes,
        rulesRes,
        qualityRes,
        funnelRes,
      ] = await Promise.all([
        getOverviewRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/overview?preset=all_time',
            'GET',
            adminToken
          )
        ),
        getLeadsAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/leads?page=1&pageSize=10',
            'GET',
            adminToken
          )
        ),
        getSourcesAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/sources',
            'GET',
            adminToken
          )
        ),
        getNichesAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/niches',
            'GET',
            adminToken
          )
        ),
        getLocationsAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/locations',
            'GET',
            adminToken
          )
        ),
        getServicesAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/services',
            'GET',
            adminToken
          )
        ),
        getDevelopersAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/developers',
            'GET',
            adminToken
          )
        ),
        getRulesAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/rules',
            'GET',
            adminToken
          )
        ),
        getDataQualityAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/data-quality',
            'GET',
            adminToken
          )
        ),
        getFunnelAnalyticsRoute(
          makeAuthRequest(
            'http://localhost:3000/api/admin/analytics/funnel',
            'GET',
            adminToken
          )
        ),
      ]);

      expect(overviewRes.status).toBe(200);
      expect(leadsRes.status).toBe(200);
      expect(sourcesRes.status).toBe(200);
      expect(nichesRes.status).toBe(200);
      expect(locationsRes.status).toBe(200);
      expect(servicesRes.status).toBe(200);
      expect(devsRes.status).toBe(200);
      expect(rulesRes.status).toBe(200);
      expect(qualityRes.status).toBe(200);
      expect(funnelRes.status).toBe(200);

      const leadsJson = await leadsRes.json();
      expect(leadsJson.pagination.page).toBe(1);
      expect(leadsJson.pagination.pageSize).toBe(10);
      expect(leadsJson.leadsTable.length).toBeLessThanOrEqual(10);

      const elapsedMs = Date.now() - startMs;
      expect(elapsedMs).toBeLessThan(15000);
    });

    it('maintains 100% cross-report attribution consistency under narrow date ranges and claimed_date cohorts, and preserves chronological origin source', async () => {
      // Chronological origin source priority when sourceList[0] predates a later source edit
      expect(
        resolvePrimaryOriginSource({
          source: 'Facebook Business Page Import',
          sourceList: ['Google Business Profile Export', 'Facebook Business Page Import'],
        })
      ).toBe('Google Business Profile Export');

      // Test both last_7_days and cohortBy=claimed_date
      for (const filterInput of [
        { preset: 'last_7_days' as const },
        { preset: 'last_30_days' as const, cohortBy: 'claimed_date' as const },
        { preset: 'previous_month' as const },
      ]) {
        const [overview, sources, niches, locations, services, devs] = await Promise.all([
          getAdminOverviewAnalytics(filterInput),
          getSourceAnalytics(filterInput),
          getNicheAnalytics(filterInput),
          getLocationAnalytics(filterInput),
          getServiceAnalytics(filterInput),
          getDeveloperAnalyticsForAdmin(filterInput),
        ]);

        const overviewClaims = overview.executiveSummary.claimsCount;
        const overviewRevenue = overview.executiveSummary.attributedClaimRevenueEgp;

        const sourceClaimsSum = sources.allSourcesSummary.reduce(
          (acc, s) => acc + s.claimsCount,
          0
        );
        const sourceRevSum =
          Math.round(
            sources.allSourcesSummary.reduce((acc, s) => acc + s.attributedRevenueEgp, 0) * 100
          ) / 100;
        const nicheClaimsSum = niches.allNichesSummary.reduce((acc, n) => acc + n.claims, 0);
        const govClaimsSum = locations.governorates.reduce((acc, g) => acc + g.claims, 0);
        const srvClaimsSum = services.allServicesSummary.reduce((acc, s) => acc + s.claims, 0);
        const devClaimsSum = devs.allDevelopersSummary.reduce(
          (acc, d) => acc + d.leadsClaimed,
          0
        );

        expect(sourceClaimsSum).toBe(overviewClaims);
        expect(sourceRevSum).toBeCloseTo(overviewRevenue, 2);
        expect(nicheClaimsSum).toBe(overviewClaims);
        expect(govClaimsSum).toBe(overviewClaims);
        expect(srvClaimsSum).toBe(overviewClaims);
        expect(devClaimsSum).toBe(overviewClaims);
      }
    });

    it('records ANALYTICS_CSV_EXPORTED audit log when exporting via /api/admin/analytics/export and supports DEFERRED rule review decisions', async () => {
      const beforeExportCount = await prisma.auditLog.count({
        where: { action: 'ANALYTICS_CSV_EXPORTED', userId: adminId },
      });

      const exportReq = makeAuthRequest(
        'http://localhost:3000/api/admin/analytics/export?report=sources',
        'GET',
        adminToken
      );
      const exportRes = await getExportRoute(exportReq);
      expect(exportRes.status).toBe(200);

      const afterExportCount = await prisma.auditLog.count({
        where: { action: 'ANALYTICS_CSV_EXPORTED', userId: adminId },
      });
      expect(afterExportCount).toBe(beforeExportCount + 1);

      // Test DEFERRED decision on a RuleReviewCandidate
      const candidates = await listRuleReviewCandidates();
      expect(candidates.candidates.length).toBeGreaterThan(0);
      const targetId = candidates.candidates[0].id;

      const deferRes = await decideRuleReviewCandidate({
        candidateId: targetId,
        status: 'DEFERRED',
        decisionNotes: 'Deferring weight adjustment until next 30-day cohort completes.',
        reviewerUserId: adminId,
      });
      expect(deferRes.status).toBe('DEFERRED');
      expect(deferRes.reviewedBy).toBe(adminId);
    });

    it('exposes centralized Phase 7 funnel metrics on /api/developer/dashboard and /api/admin/reports and counts PROPOSAL_SENT / NEGOTIATION accurately', async () => {
      // Verify evaluateClaimEngagementFlags treats PROPOSAL_SENT and NEGOTIATION as cumulative contacted/replied/interested/meeting stages
      const proposalFlags = evaluateClaimEngagementFlags(
        {
          id: 'test-claim-prop',
          leadId: 'test-lead-prop',
          userId: devAId,
          status: 'ACTIVE',
          pipelineStatus: 'PROPOSAL_SENT',
          claimedAt: new Date(),
        },
        null
      );
      expect(proposalFlags.isContacted).toBe(true);
      expect(proposalFlags.isReplied).toBe(true);
      expect(proposalFlags.isInterested).toBe(true);
      expect(proposalFlags.isMeeting).toBe(true);
      expect(proposalFlags.isProposal).toBe(true);
      expect(proposalFlags.isNegotiation).toBe(false);

      const devDashRes = await getDeveloperDashboardRoute(
        makeAuthRequest('http://localhost:3000/api/developer/dashboard', 'GET', devAToken)
      );
      expect(devDashRes.status).toBe(200);
      const devDashJson = await devDashRes.json();
      expect(devDashJson.centralizedFunnel).toBeDefined();
      expect(devDashJson.centralizedFunnel.counts.claimed).toBe(
        devDashJson.conversion.totalClaimed
      );

      const adminRepRes = await getAdminReportsRoute(
        makeAuthRequest('http://localhost:3000/api/admin/reports', 'GET', adminToken)
      );
      expect(adminRepRes.status).toBe(200);
      const adminRepJson = await adminRepRes.json();
      expect(adminRepJson.centralizedMetrics).toBeDefined();
      expect(adminRepJson.centralizedMetrics.metricDictionaryVersion).toBe('WIN_RATE_V1');
      expect(adminRepJson.centralizedMetrics.funnel.counts.claimed).toBe(
        adminRepJson.overview.leadsClaimed
      );
    });
  });
});

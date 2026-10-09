import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import {
  evaluateMatch,
  rankDevelopersForLead,
  rankLeadsForDeveloper,
  generateAdminMatchDebugReport,
  DEFAULT_MATCHING_CONFIG,
  DEFAULT_MATCHING_RULES,
  clearMatchingLogs,
  getRecentMatchingLogs,
  MatchableLeadInput,
  DeveloperMatchingContext,
  MatchingRuleDefinition,
} from '@/lib/matching';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import { DEFAULT_PLANS } from '@/lib/payment/provider';
import { GET as getLeadMatchesRoute } from '@/app/api/matching/leads/[leadId]/route';
import { GET as getDeveloperMatchesRoute } from '@/app/api/matching/developers/[developerId]/route';
import { GET as getPairMatchRoute } from '@/app/api/matching/leads/[leadId]/developers/[developerId]/route';
import { POST as previewMatchRoute } from '@/app/api/matching/preview/route';
import { POST as recalculateMatchesRoute } from '@/app/api/admin/matching/recalculate/route';
import {
  GET as getMatchingRulesRoute,
  POST as postMatchingRulesRoute,
} from '@/app/api/admin/matching/rules/route';
import {
  PATCH as patchMatchingRuleRoute,
  DELETE as deleteMatchingRuleRoute,
} from '@/app/api/admin/matching/rules/[id]/route';
import { PATCH as patchDeveloperProfileRoute } from '@/app/api/developer/profile/route';
import { PATCH as patchAdminLeadRoute } from '@/app/api/admin/leads/[id]/route';
import { GET as getLeadsRoute } from '@/app/api/leads/route';
import { GET as getDashboardRoute } from '@/app/api/developer/dashboard/route';

function makeAuthRequest(
  url: string,
  token?: string,
  options?: { method?: string; body?: unknown }
): NextRequest {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
    host: 'localhost:3000',
  });
  if (token) {
    headers.set('cookie', `leadforge_session=${token}`);
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options?.method || 'GET',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

const BASE_SALEABLE_LEAD: MatchableLeadInput = {
  id: 'lead-dental-cairo-1',
  businessName: 'عيادة دار الأسنان التخصصي - Dar Dental',
  category: 'DENTAL_CLINIC',
  governorate: 'القاهرة',
  city: 'القاهرة الجديدة',
  area: 'التجمع الخامس',
  websiteStatus: 'NO_WEBSITE',
  requiredService: 'WEBSITE_DEVELOPMENT',
  requiredServices: ['WEBSITE_DEVELOPMENT'],
  projectLeadType: 'NEW_WEBSITE',
  estimatedBudget: 18000,
  minBudget: 15000,
  maxBudget: 22000,
  budgetCurrency: 'EGP',
  budgetType: 'RANGE',
  leadType: 'SHARED',
  exclusive: false,
  maxPurchasers: 3,
  currentPurchasers: 0,
  score: 88,
  opportunityScore: 88,
  qualityScore: 92,
  qualityStatus: 'HIGH_QUALITY',
  freshnessStatus: 'FRESH',
  verificationStatus: 'VERIFIED',
  saleabilityStatus: 'AVAILABLE',
  status: 'AVAILABLE',
  businessStatus: 'OPEN',
  isCanonical: true,
};

const BASE_ELIGIBLE_DEV: DeveloperMatchingContext = {
  developerId: 'dev-cairo-dental',
  name: 'م. عمر عبد الرحمن',
  userStatus: 'ACTIVE',
  profile: {
    services: ['WEBSITE_DEVELOPMENT', 'BOOKING_SYSTEM', 'WEBSITE_REDESIGN'],
    preferredServices: ['WEBSITE_DEVELOPMENT'],
    excludedServices: [],
    locations: ['القاهرة', 'القاهرة الجديدة'],
    supportedCities: ['القاهرة الجديدة', 'القاهرة'],
    supportedGovernorates: ['القاهرة', 'الجيزة'],
    preferredCities: ['القاهرة الجديدة'],
    allLocationsMode: false,
    niches: ['DENTAL_CLINIC', 'MEDICAL'],
    preferredNiches: ['DENTAL_CLINIC'],
    excludedNiches: [],
    allNichesMode: false,
    supportedLeadTypes: ['NEW_WEBSITE', 'WEBSITE_REDESIGN'],
    preferredLeadTypes: ['NEW_WEBSITE'],
    excludedLeadTypes: [],
    minBudget: 10000,
    maxBudget: 50000,
    preferredMinBudget: 12000,
    preferredMaxBudget: 35000,
    budgetCurrency: 'EGP',
    leadType: 'BOTH',
    isActive: true,
    isAcceptingLeads: true,
    isVerified: true,
    isComplete: true,
  },
  subscription: {
    status: 'ACTIVE',
    credits: 25,
    plan: {
      slug: 'pro',
      nameEn: 'Pro',
      allowsExclusive: true,
      maxConcurrentClaims: 50,
      isActive: true,
    },
  },
};

describe('Phase 4: Deterministic Lead-to-Developer Matching Engine', () => {
  // =========================================================================
  // 1. LAYER A — HARD ELIGIBILITY UNIT TESTS
  // =========================================================================
  describe('Layer A — Hard Eligibility Gates', () => {
    it('passes all hard gates for an eligible developer and saleable lead', () => {
      const res = evaluateMatch(BASE_SALEABLE_LEAD, BASE_ELIGIBLE_DEV);
      expect(res.eligible).toBe(true);
      expect(res.hardFailures).toHaveLength(0);
      expect(res.matchStrength).toBeGreaterThanOrEqual(85);
      expect(res.matchVersion).toBe('v1');
    });

    it('rejects inactive and suspended developers with DEVELOPER_INACTIVE / DEVELOPER_SUSPENDED', () => {
      const inactiveDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-inactive',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          isAcceptingLeads: false,
        },
      };
      const resInactive = evaluateMatch(BASE_SALEABLE_LEAD, inactiveDev);
      expect(resInactive.eligible).toBe(false);
      expect(resInactive.matchStrength).toBe(0);
      expect(resInactive.hardFailures.some((f) => f.key === 'DEVELOPER_INACTIVE')).toBe(true);

      const suspendedDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-suspended',
        userStatus: 'SUSPENDED',
        suspended: true,
      };
      const resSuspended = evaluateMatch(BASE_SALEABLE_LEAD, suspendedDev);
      expect(resSuspended.eligible).toBe(false);
      expect(resSuspended.matchStrength).toBe(0);
      expect(resSuspended.hardFailures.some((f) => f.key === 'DEVELOPER_SUSPENDED')).toBe(true);
    });

    it('rejects developers with missing or incomplete profiles with PROFILE_INCOMPLETE', () => {
      const noProfileDev: DeveloperMatchingContext = {
        developerId: 'dev-no-profile',
        userStatus: 'ACTIVE',
        profile: null,
      };
      const resNoProfile = evaluateMatch(BASE_SALEABLE_LEAD, noProfileDev);
      expect(resNoProfile.eligible).toBe(false);
      expect(resNoProfile.matchStrength).toBe(0);
      expect(resNoProfile.hardFailures.some((f) => f.key === 'PROFILE_INCOMPLETE')).toBe(true);

      const emptyServicesDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-empty-services',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          services: [],
        },
      };
      const resEmptyServices = evaluateMatch(BASE_SALEABLE_LEAD, emptyServicesDev);
      expect(resEmptyServices.eligible).toBe(false);
      expect(resEmptyServices.hardFailures.some((f) => f.key === 'PROFILE_INCOMPLETE')).toBe(true);
      expect(resEmptyServices.hardFailures.some((f) => f.key === 'SERVICE_NOT_SUPPORTED')).toBe(true);
    });

    it('enforces subscription, plan, credit, and capacity limits with PLAN_NOT_ELIGIBLE', () => {
      // 1. Expired subscription
      const expiredSubDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        subscription: {
          status: 'EXPIRED',
          credits: 10,
        },
      };
      const resExpired = evaluateMatch(BASE_SALEABLE_LEAD, expiredSubDev);
      expect(resExpired.eligible).toBe(false);
      expect(resExpired.hardFailures.some((f) => f.key === 'PLAN_NOT_ELIGIBLE')).toBe(true);

      // 2. Zero credits
      const zeroCreditsDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        subscription: {
          status: 'ACTIVE',
          credits: 0,
        },
      };
      const resZeroCredits = evaluateMatch(BASE_SALEABLE_LEAD, zeroCreditsDev);
      expect(resZeroCredits.eligible).toBe(false);
      expect(resZeroCredits.hardFailures.some((f) => f.key === 'PLAN_NOT_ELIGIBLE')).toBe(true);

      // 3. Exclusive lead vs non-exclusive plan
      const exclusiveLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        leadType: 'EXCLUSIVE',
        exclusive: true,
      };
      const basicPlanDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        subscription: {
          status: 'ACTIVE',
          credits: 10,
          plan: {
            slug: 'starter',
            nameEn: 'Starter',
            allowsExclusive: false,
            isActive: true,
          },
        },
      };
      const resExclusiveBlocked = evaluateMatch(exclusiveLead, basicPlanDev);
      expect(resExclusiveBlocked.eligible).toBe(false);
      expect(resExclusiveBlocked.hardFailures.some((f) => f.key === 'PLAN_NOT_ELIGIBLE')).toBe(true);

      // 4. Capacity limit reached
      const atCapacityDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        activeClaimsCount: 10,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          maxActiveLeads: 10,
        },
      };
      const resCapacity = evaluateMatch(BASE_SALEABLE_LEAD, atCapacityDev);
      expect(resCapacity.eligible).toBe(false);
      expect(resCapacity.hardFailures.some((f) => f.key === 'PLAN_NOT_ELIGIBLE')).toBe(true);
    });

    it('enforces Phase 3 Lead Quality & Saleability gates with LEAD_NOT_SALEABLE', () => {
      // 1. INVALID lead
      const invalidLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        verificationStatus: 'INVALID',
        qualityStatus: 'INVALID',
      };
      const resInvalid = evaluateMatch(invalidLead, BASE_ELIGIBLE_DEV);
      expect(resInvalid.eligible).toBe(false);
      expect(resInvalid.matchStrength).toBe(0);
      expect(resInvalid.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);
      expect(resInvalid.hardFailures.some((f) => f.subCode === 'LEAD_INVALID')).toBe(true);

      // 2. DUPLICATE / Non-Canonical lead
      const duplicateLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        isCanonical: false,
        mergedIntoLeadId: 'canonical-lead-1',
      };
      const resDup = evaluateMatch(duplicateLead, BASE_ELIGIBLE_DEV);
      expect(resDup.eligible).toBe(false);
      expect(resDup.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);
      expect(resDup.hardFailures.some((f) => f.subCode === 'LEAD_DUPLICATE')).toBe(true);

      // 3. CLOSED business
      const closedLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        businessStatus: 'CLOSED',
      };
      const resClosed = evaluateMatch(closedLead, BASE_ELIGIBLE_DEV);
      expect(resClosed.eligible).toBe(false);
      expect(resClosed.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);
      expect(resClosed.hardFailures.some((f) => f.subCode === 'LEAD_CLOSED')).toBe(true);

      // 4. STALE lead
      const staleLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        freshnessStatus: 'STALE',
      };
      const resStale = evaluateMatch(staleLead, BASE_ELIGIBLE_DEV);
      expect(resStale.eligible).toBe(false);
      expect(resStale.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);
      expect(resStale.hardFailures.some((f) => f.subCode === 'LEAD_STALE')).toBe(true);

      // 5. CLAIMED_FULL lead
      const claimedFullLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        maxPurchasers: 3,
        currentPurchasers: 3,
        saleabilityStatus: 'CLAIMED_FULL',
      };
      const resFull = evaluateMatch(claimedFullLead, BASE_ELIGIBLE_DEV);
      expect(resFull.eligible).toBe(false);
      expect(resFull.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);

      // 6. REQUIRES_VERIFICATION policy modes
      const needsVerifyLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        verificationStatus: 'REQUIRES_VERIFICATION',
        qualityStatus: 'NEEDS_REVIEW',
      };
      // Default policy is EXCLUDE
      const resExclude = evaluateMatch(needsVerifyLead, BASE_ELIGIBLE_DEV, {
        config: { requiresVerificationPolicy: 'EXCLUDE' },
      });
      expect(resExclude.eligible).toBe(false);
      expect(resExclude.hardFailures.some((f) => f.subCode === 'LEAD_REQUIRES_VERIFICATION')).toBe(true);

      // INCLUDE_WITH_WARNING policy allows with warning
      const resIncludeWarn = evaluateMatch(needsVerifyLead, BASE_ELIGIBLE_DEV, {
        config: { requiresVerificationPolicy: 'INCLUDE_WITH_WARNING' },
      });
      expect(resIncludeWarn.eligible).toBe(true);
      expect(
        resIncludeWarn.warnings.some((w) => w.key === 'LEAD_REQUIRES_VERIFICATION_WARNING')
      ).toBe(true);
    });

    it('enforces Service compatibility in ALL_REQUIRED and ANY_REQUIRED modes', () => {
      const multiServiceLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        requiredServices: ['WEBSITE_DEVELOPMENT', 'SEO'],
      };

      const partialServiceDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          services: ['WEBSITE_DEVELOPMENT'],
        },
      };

      // Fails in ALL_REQUIRED mode
      const resAllReq = evaluateMatch(multiServiceLead, partialServiceDev, {
        config: { serviceMatchMode: 'ALL_REQUIRED' },
      });
      expect(resAllReq.eligible).toBe(false);
      expect(resAllReq.hardFailures.some((f) => f.key === 'SERVICE_NOT_SUPPORTED')).toBe(true);

      // Passes in ANY_REQUIRED mode
      const resAnyReq = evaluateMatch(multiServiceLead, partialServiceDev, {
        config: { serviceMatchMode: 'ANY_REQUIRED' },
      });
      expect(resAnyReq.eligible).toBe(true);

      // Multi-service developer passes ALL_REQUIRED and gets SERVICE_MULTI_MATCH_BONUS
      const fullServiceDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          services: ['WEBSITE_DEVELOPMENT', 'SEO'],
        },
      };
      const resFullMulti = evaluateMatch(multiServiceLead, fullServiceDev, {
        config: { serviceMatchMode: 'ALL_REQUIRED' },
      });
      expect(resFullMulti.eligible).toBe(true);
      expect(
        resFullMulti.matchedCriteria.some((c) => c.key === 'SERVICE_MULTI_MATCH_BONUS')
      ).toBe(true);
    });

    it('enforces Niche compatibility and explicit exclusions (explicit exclusion beats allNichesMode)', () => {
      const restaurantLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        category: 'RESTAURANT',
      };

      // Developer with allNichesMode = true but excludedNiches = ['RESTAURANT']
      const allNichesWithExclusionDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          allNichesMode: true,
          niches: ['ALL'],
          excludedNiches: ['RESTAURANT'],
        },
      };

      const resExcluded = evaluateMatch(restaurantLead, allNichesWithExclusionDev);
      expect(resExcluded.eligible).toBe(false);
      expect(resExcluded.matchStrength).toBe(0);
      expect(resExcluded.hardFailures.some((f) => f.key === 'NICHE_EXCLUDED')).toBe(true);

      // Developer without RESTAURANT and allNichesMode = false
      const resUnsupported = evaluateMatch(restaurantLead, BASE_ELIGIBLE_DEV);
      expect(resUnsupported.eligible).toBe(false);
      expect(resUnsupported.hardFailures.some((f) => f.key === 'NICHE_EXCLUDED')).toBe(true);
    });

    it('enforces Egyptian Location hierarchy (City -> Governorate -> All Egypt) and Unknown Location policy', () => {
      const newCairoLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        area: 'التجمع الخامس',
      };

      // 1. Alexandria developer fails with LOCATION_NOT_SUPPORTED
      const alexDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          locations: ['الإسكندرية'],
          supportedCities: ['الإسكندرية'],
          supportedGovernorates: ['الإسكندرية'],
        },
      };
      const resAlex = evaluateMatch(newCairoLead, alexDev);
      expect(resAlex.eligible).toBe(false);
      expect(resAlex.hardFailures.some((f) => f.key === 'LOCATION_NOT_SUPPORTED')).toBe(true);

      // 2. Unknown location handling
      const unknownLocLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        governorate: '',
        city: '',
        area: null,
      };
      const resUnknownFail = evaluateMatch(unknownLocLead, BASE_ELELIGIBLE_DEV_ALIAS(), {
        config: { unknownLocationPolicy: 'FAIL' },
      });
      expect(resUnknownFail.eligible).toBe(false);
      expect(resUnknownFail.hardFailures.some((f) => f.key === 'LOCATION_NOT_SUPPORTED')).toBe(true);

      const resUnknownAllow = evaluateMatch(unknownLocLead, BASE_ELIGIBLE_DEV, {
        config: { unknownLocationPolicy: 'ALLOW_WITH_PENALTY' },
      });
      expect(resUnknownAllow.eligible).toBe(true);
      expect(resUnknownAllow.warnings.some((w) => w.key === 'UNKNOWN_LOCATION_PENALTY')).toBe(true);
      expect(
        resUnknownAllow.matchedCriteria.some((c) => c.key === 'LOCATION_UNKNOWN_PENALTY')
      ).toBe(true);
    });

    it('enforces Budget interval compatibility, currency match, and Unknown Budget policy', () => {
      // Lead with budget 3,000 EGP vs developer with minBudget 15,000 EGP
      const lowBudgetLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        estimatedBudget: 3000,
        minBudget: 3000,
        maxBudget: 3000,
      };
      const highMinDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          minBudget: 15000,
          maxBudget: 60000,
        },
      };
      const resLow = evaluateMatch(lowBudgetLead, highMinDev);
      expect(resLow.eligible).toBe(false);
      expect(resLow.matchStrength).toBe(0);
      expect(resLow.hardFailures.some((f) => f.key === 'BUDGET_INCOMPATIBLE')).toBe(true);

      // Lead with budget above developer maxBudget
      const highBudgetLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        estimatedBudget: 120000,
        minBudget: 100000,
        maxBudget: 150000,
      };
      const resHigh = evaluateMatch(highBudgetLead, highMinDev);
      expect(resHigh.eligible).toBe(false);
      expect(resHigh.hardFailures.some((f) => f.key === 'BUDGET_INCOMPATIBLE')).toBe(true);

      // Currency mismatch
      const usdLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        budgetCurrency: 'USD',
      };
      const resCurrency = evaluateMatch(usdLead, highMinDev);
      expect(resCurrency.eligible).toBe(false);
      expect(resCurrency.hardFailures.some((f) => f.key === 'BUDGET_INCOMPATIBLE')).toBe(true);
    });

    it('enforces Lead Type (Ownership & Project Lead Type) compatibility', () => {
      const redesignLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        websiteStatus: 'POOR_WEBSITE',
        requiredService: 'WEBSITE_REDESIGN',
        projectLeadType: 'WEBSITE_REDESIGN',
        leadType: 'SHARED',
        exclusive: false,
      };

      // Developer who only accepts EXCLUSIVE leads
      const exclusiveOnlyDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          leadType: 'EXCLUSIVE',
        },
      };
      const resExclMismatch = evaluateMatch(redesignLead, exclusiveOnlyDev);
      expect(resExclMismatch.eligible).toBe(false);
      expect(resExclMismatch.hardFailures.some((f) => f.key === 'LEAD_TYPE_NOT_SUPPORTED')).toBe(true);

      // Developer who excluded WEBSITE_REDESIGN project lead type
      const excludedProjectTypeDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          excludedLeadTypes: ['WEBSITE_REDESIGN'],
        },
      };
      const resProjExcluded = evaluateMatch(redesignLead, excludedProjectTypeDev);
      expect(resProjExcluded.eligible).toBe(false);
      expect(resProjExcluded.hardFailures.some((f) => f.key === 'LEAD_TYPE_NOT_SUPPORTED')).toBe(true);
    });
  });

  // =========================================================================
  // 2. LAYER B — SOFT SCORING, SEPARATE SCORES & RANKING UNIT TESTS
  // =========================================================================
  describe('Layer B — Soft Matching Rules, Separate Scores & Deterministic Ranking', () => {
    it('keeps opportunityScore, qualityScore, and matchStrength strictly separate', () => {
      const lead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        score: 64,
        opportunityScore: 64,
        qualityScore: 82,
      };

      // Developer with general niche and governorate match (moderate matchStrength)
      const govGeneralDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          supportedCities: [],
          locations: ['القاهرة'],
          supportedGovernorates: ['القاهرة'],
          preferredCities: [],
          niches: [],
          preferredNiches: [],
          allNichesMode: true,
          preferredServices: [],
        },
      };

      const res = evaluateMatch(lead, govGeneralDev);
      expect(res.eligible).toBe(true);
      expect(res.opportunityScore).toBe(64);
      expect(res.qualityScore).toBe(82);
      expect(res.matchStrength).not.toBe(res.opportunityScore);
      expect(res.matchStrength).not.toBe(res.qualityScore);
    });

    it('ranks exact city developer above governorate-only developer for a New Cairo lead', () => {
      const newCairoLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
      };

      const exactNewCairoDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-new-cairo-exact',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          locations: ['القاهرة الجديدة'],
          supportedCities: ['القاهرة الجديدة'],
          supportedGovernorates: ['القاهرة'],
          preferredCities: [],
        },
      };

      const cairoGovOnlyDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-cairo-gov-only',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          locations: ['القاهرة'],
          supportedCities: [],
          supportedGovernorates: ['القاهرة'],
          preferredCities: [],
        },
      };

      const ranked = rankDevelopersForLead(newCairoLead, [cairoGovOnlyDev, exactNewCairoDev]);
      expect(ranked.eligibleDevelopers).toHaveLength(2);
      expect(ranked.eligibleDevelopers[0].developerId).toBe('dev-new-cairo-exact');
      expect(ranked.eligibleDevelopers[0].rank).toBe(1);
      expect(ranked.eligibleDevelopers[1].developerId).toBe('dev-cairo-gov-only');
      expect(ranked.eligibleDevelopers[1].rank).toBe(2);
      expect(ranked.eligibleDevelopers[0].matchStrength).toBeGreaterThan(
        ranked.eligibleDevelopers[1].matchStrength
      );
    });

    it('breaks ties deterministically by qualityScore DESC, opportunityScore DESC, freshness, then ID ASC', () => {
      const devA: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-alpha',
      };
      const devB: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-beta',
      };

      const ranked = rankDevelopersForLead(BASE_SALEABLE_LEAD, [devB, devA]);
      expect(ranked.eligibleDevelopers[0].developerId).toBe('dev-alpha');
      expect(ranked.eligibleDevelopers[1].developerId).toBe('dev-beta');

      // Lead ranking tie-breakers for a developer
      const leadLowQuality: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        id: 'lead-1',
        qualityScore: 81,
        opportunityScore: 90,
      };
      const leadHighQuality: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        id: 'lead-2',
        qualityScore: 95,
        opportunityScore: 85,
      };

      const rankedLeads = rankLeadsForDeveloper(devA, [leadLowQuality, leadHighQuality]);
      expect(rankedLeads.eligibleLeads[0].lead.id).toBe('lead-2');
      expect(rankedLeads.eligibleLeads[1].lead.id).toBe('lead-1');
    });

    it('produces NO_ELIGIBLE_DEVELOPERS diagnostics when 0 developers match a lead', () => {
      clearMatchingLogs();
      const alexRestaurantDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'dev-alex-rest',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          locations: ['الإسكندرية'],
          supportedCities: ['الإسكندرية'],
          supportedGovernorates: ['الإسكندرية'],
          niches: ['RESTAURANT'],
          allNichesMode: false,
        },
      };

      const ranked = rankDevelopersForLead(BASE_SALEABLE_LEAD, [alexRestaurantDev]);
      expect(ranked.eligibleDevelopers).toHaveLength(0);
      expect(ranked.rejectedDevelopers).toHaveLength(1);
      expect(ranked.diagnostics.eligibleCount).toBe(0);
      expect(ranked.diagnostics.rejectedCount).toBe(1);
      expect(ranked.diagnostics.failureBreakdown.NICHE_EXCLUDED).toBe(1);
      expect(ranked.diagnostics.failureBreakdown.LOCATION_NOT_SUPPORTED).toBe(1);

      const logs = getRecentMatchingLogs(10);
      expect(logs.some((l) => l.eventType === 'NO_ELIGIBLE_DEVELOPERS')).toBe(true);
    });

    it('generates a complete AdminMatchDebugReport with passed/failed checks and applied/unapplied rules', () => {
      const report = generateAdminMatchDebugReport(BASE_SALEABLE_LEAD, BASE_ELIGIBLE_DEV);
      expect(report.eligible).toBe(true);
      expect(report.resultLabel).toBe('ELIGIBLE');
      expect(report.passedChecks.length).toBeGreaterThanOrEqual(8);
      expect(report.failedChecks).toHaveLength(0);
      expect(report.appliedRules.length).toBeGreaterThan(0);
      expect(report.finalMatchStrength).toBe(report.matchResult.matchStrength);
    });
  });

  // =========================================================================
  // 3. MANDATORY REALISTIC REGRESSION SCENARIOS
  // =========================================================================
  describe('Mandatory Realistic Regression Scenarios (1–8)', () => {
    it('Scenario 1 & 2: Cairo dental clinic lead matches Cairo dental developer with high strength, rejects Alexandria restaurant developer', () => {
      const cairoDentalLead: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        id: 'reg-lead-1',
        category: 'Dental',
        governorate: 'القاهرة',
        city: 'القاهرة',
        websiteStatus: 'NO_WEBSITE',
        estimatedBudget: 15000,
      };

      const cairoDentalDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'reg-dev-cairo-dental',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          services: ['Website Development'],
          locations: ['القاهرة'],
          supportedCities: ['القاهرة'],
          niches: ['Dental'],
        },
      };

      const alexRestaurantDev: DeveloperMatchingContext = {
        ...BASE_ELIGIBLE_DEV,
        developerId: 'reg-dev-alex-restaurant',
        profile: {
          ...BASE_ELIGIBLE_DEV.profile!,
          services: ['Website Development'],
          locations: ['الإسكندرية'],
          supportedCities: ['الإسكندرية'],
          supportedGovernorates: ['الإسكندرية'],
          niches: ['Restaurant'],
          allNichesMode: false,
        },
      };

      const match1 = evaluateMatch(cairoDentalLead, cairoDentalDev);
      expect(match1.eligible).toBe(true);
      expect(match1.matchStrength).toBeGreaterThanOrEqual(85);

      const match2 = evaluateMatch(cairoDentalLead, alexRestaurantDev);
      expect(match2.eligible).toBe(false);
      expect(match2.matchStrength).toBe(0);
      expect(match2.hardFailures.some((f) => f.key === 'NICHE_EXCLUDED')).toBe(true);
      expect(match2.hardFailures.some((f) => f.key === 'LOCATION_NOT_SUPPORTED')).toBe(true);
    });

    it('Scenario 3 & 8: High-opportunity lead that is STALE, INVALID, or DUPLICATE is strictly rejected', () => {
      const highOppStale: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        score: 98,
        opportunityScore: 98,
        freshnessStatus: 'STALE',
      };
      const resStale = evaluateMatch(highOppStale, BASE_ELIGIBLE_DEV);
      expect(resStale.eligible).toBe(false);
      expect(resStale.matchStrength).toBe(0);
      expect(resStale.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);

      const highOppDuplicate: MatchableLeadInput = {
        ...BASE_SALEABLE_LEAD,
        score: 96,
        opportunityScore: 96,
        isCanonical: false,
      };
      const resDup = evaluateMatch(highOppDuplicate, BASE_ELIGIBLE_DEV);
      expect(resDup.eligible).toBe(false);
      expect(resDup.matchStrength).toBe(0);
      expect(resDup.hardFailures.some((f) => f.key === 'LEAD_NOT_SALEABLE')).toBe(true);
    });
  });

  // =========================================================================
  // 4. DETERMINISM & PROPERTY-STYLE TESTS
  // =========================================================================
  describe('Determinism & Property-Style Invariants', () => {
    it('produces byte-for-byte identical outputs across 100 repeated evaluations', () => {
      const fixedTimestamp = '2026-05-01T12:00:00.000Z';
      const baseline = JSON.stringify(
        evaluateMatch(BASE_SALEABLE_LEAD, BASE_ELIGIBLE_DEV, {
          calculatedAt: fixedTimestamp,
        })
      );

      for (let i = 0; i < 100; i++) {
        const current = JSON.stringify(
          evaluateMatch(BASE_SALEABLE_LEAD, BASE_ELIGIBLE_DEV, {
            calculatedAt: fixedTimestamp,
          })
        );
        expect(current).toBe(baseline);
      }
    });

    it('enforces invariant: eligible === false ALWAYS implies matchStrength === 0, and 0 <= matchStrength <= 100 across extreme rule weights', () => {
      const extremeRules: MatchingRuleDefinition[] = DEFAULT_MATCHING_RULES.map((r) => ({
        ...r,
        points: r.points * 10, // +300 points on exact service, etc.
      }));

      const resHigh = evaluateMatch(BASE_SALEABLE_LEAD, BASE_ELIGIBLE_DEV, {
        rules: extremeRules,
      });
      expect(resHigh.eligible).toBe(true);
      expect(resHigh.rawMatchPoints).toBeGreaterThan(100);
      expect(resHigh.matchStrength).toBeLessThanOrEqual(100);
      expect(resHigh.matchStrength).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(resHigh.matchStrength)).toBe(false);

      const negativeRules: MatchingRuleDefinition[] = DEFAULT_MATCHING_RULES.map((r) => ({
        ...r,
        points: -50,
      }));
      const resLow = evaluateMatch(BASE_SALEABLE_LEAD, BASE_ELIGIBLE_DEV, {
        rules: negativeRules,
      });
      expect(resLow.eligible).toBe(true);
      expect(resLow.matchStrength).toBe(0);
      expect(Number.isNaN(resLow.matchStrength)).toBe(false);
    });
  });

  // =========================================================================
  // 5. FULL API & DATABASE INTEGRATION TESTS
  // =========================================================================
  describe('API Endpoints & Database Integration', () => {
    let prisma: PrismaClient;
    let cleanupDb: () => Promise<void>;
    let adminToken = '';
    let devToken = '';
    let devUserId = '';
    let sampleLeadId = '';

    beforeAll(async () => {
      const testEnv = await createInMemoryTestDb();
      prisma = testEnv.prisma;
      cleanupDb = testEnv.cleanup;
      setPrismaClientForTesting(testEnv.prisma, testEnv.pglite);

      const passwordHash = await hashPassword('TestPass123!');
      const adminUser = await prisma.user.create({
        data: {
          name: 'Admin Matching Tester',
          email: 'admin-matching@leadforge.eg',
          passwordHash,
          role: 'ADMIN',
        },
      });

      let proPlanId = '';
      for (const p of DEFAULT_PLANS) {
        const created = await prisma.plan.create({ data: p });
        if (p.slug === 'pro') proPlanId = created.id;
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const devUser = await prisma.user.create({
        data: {
          name: 'م. عمر عبد الرحمن',
          email: 'dev@leadforge.eg',
          passwordHash,
          role: 'DEVELOPER',
          status: 'ACTIVE',
          developerProfile: {
            create: {
              services: ['Website Development', 'Landing Page', 'SEO'],
              locations: ['القاهرة', 'الجيزة'],
              supportedGovernorates: ['القاهرة', 'الجيزة'],
              supportedCities: ['القاهرة الجديدة', 'مدينة نصر', 'المعادي'],
              niches: ['Dental', 'Medical', 'Real Estate'],
              preferredNiches: ['Dental', 'Medical'],
              excludedNiches: ['Restaurant'],
              minBudget: 5000,
              maxBudget: 60000,
              leadType: 'BOTH',
              supportedLeadTypes: ['NEW_WEBSITE', 'REDESIGN', 'LANDING_PAGE', 'SEO'],
            },
          },
          subscription: {
            create: {
              planId: proPlanId,
              status: 'ACTIVE',
              credits: 25,
              totalCreditsGranted: 50,
              currentPeriodEnd: periodEnd,
            },
          },
        },
      });

      const sampleLead = await prisma.lead.create({
        data: {
          businessName: 'عيادة دار الأسنان التخصصي - Dar Dental',
          normalizedName: 'عيادة دار الأسنان التخصصي dar dental',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة الجديدة',
          area: 'التجمع الخامس',
          phone: '01012345678',
          normalizedPhone: '+201012345678',
          hasPhone: true,
          websiteStatus: 'NO_WEBSITE',
          requiredService: 'WEBSITE_DEVELOPMENT',
          requiredServices: ['WEBSITE_DEVELOPMENT'],
          projectLeadType: 'NEW_WEBSITE',
          estimatedBudget: 18000,
          minBudget: 15000,
          maxBudget: 22000,
          score: 88,
          temperature: 'PREMIUM',
          qualityScore: 92,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
          saleabilityStatus: 'AVAILABLE',
          status: 'AVAILABLE',
          businessStatus: 'OPEN',
          isCanonical: true,
          source: 'Google Maps',
        },
      });

      devUserId = devUser.id;
      sampleLeadId = sampleLead.id;

      adminToken = await signSessionToken({
        userId: adminUser.id,
        email: adminUser.email,
        role: 'ADMIN',
        name: adminUser.name,
      });
      devToken = await signSessionToken({
        userId: devUser.id,
        email: devUser.email,
        role: 'DEVELOPER',
        name: devUser.name,
      });
    }, 60000);

    afterAll(async () => {
      if (cleanupDb) {
        await cleanupDb();
      }
    });

    it('GET /api/matching/leads/:leadId returns ranked eligible developers and diagnostics', async () => {
      const req = makeAuthRequest(
        `http://localhost:3000/api/matching/leads/${sampleLeadId}?includeRejected=true`,
        adminToken
      );
      const res = await getLeadMatchesRoute(req, { params: { leadId: sampleLeadId } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.lead.id).toBe(sampleLeadId);
      expect(Array.isArray(data.eligibleDevelopers)).toBe(true);
      expect(Array.isArray(data.rejectedDevelopers)).toBe(true);
      expect(data.diagnostics).toBeDefined();
      expect(data.diagnostics.totalEvaluated).toBeGreaterThan(0);
    });

    it('GET /api/matching/developers/:developerId returns ranked eligible leads and enforces RBAC', async () => {
      // Developer accessing own matches via 'me'
      const reqOwn = makeAuthRequest(
        `http://localhost:3000/api/matching/developers/me?limit=10`,
        devToken
      );
      const resOwn = await getDeveloperMatchesRoute(reqOwn, {
        params: { developerId: 'me' },
      });
      expect(resOwn.status).toBe(200);
      const dataOwn = await resOwn.json();
      expect(dataOwn.developer.id).toBe(devUserId);
      expect(Array.isArray(dataOwn.matches)).toBe(true);

      // Developer attempting to access another developer's matches -> 403
      const reqForbidden = makeAuthRequest(
        `http://localhost:3000/api/matching/developers/other-dev-id`,
        devToken
      );
      const resForbidden = await getDeveloperMatchesRoute(reqForbidden, {
        params: { developerId: 'other-dev-id' },
      });
      expect(resForbidden.status).toBe(403);
    });

    it('GET /api/matching/leads/:leadId/developers/:developerId returns full pair explanation and AdminMatchDebugReport', async () => {
      const req = makeAuthRequest(
        `http://localhost:3000/api/matching/leads/${sampleLeadId}/developers/${devUserId}?persist=true`,
        adminToken
      );
      const res = await getPairMatchRoute(req, {
        params: { leadId: sampleLeadId, developerId: devUserId },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.leadId).toBe(sampleLeadId);
      expect(data.developerId).toBe(devUserId);
      expect(Array.isArray(data.hardEligibilityChecks)).toBe(true);
      expect(data.hardEligibilityChecks.length).toBeGreaterThanOrEqual(8);
      expect(data.matchResult).toBeDefined();
    });

    it('POST /api/matching/preview previews pair, lead, and developer matching without persisting', async () => {
      const reqPair = makeAuthRequest(
        'http://localhost:3000/api/matching/preview',
        devToken,
        {
          method: 'POST',
          body: {
            lead: BASE_SALEABLE_LEAD,
            developer: BASE_ELIGIBLE_DEV,
          },
        }
      );
      const resPair = await previewMatchRoute(reqPair);
      expect(resPair.status).toBe(200);
      const dataPair = await resPair.json();
      expect(dataPair.mode).toBe('PAIR_PREVIEW');
      expect(dataPair.persisted).toBe(false);
      expect(dataPair.matchResult.eligible).toBe(true);

      const reqDevPreview = makeAuthRequest(
        'http://localhost:3000/api/matching/preview',
        devToken,
        {
          method: 'POST',
          body: {
            profile: {
              services: ['Website Development'],
              locations: ['القاهرة'],
              niches: ['Dental'],
              minBudget: 5000,
              maxBudget: 50000,
              leadType: 'BOTH',
            },
          },
        }
      );
      const resDevPreview = await previewMatchRoute(reqDevPreview);
      expect(resDevPreview.status).toBe(200);
      const dataDevPreview = await resDevPreview.json();
      expect(dataDevPreview.mode).toBe('DEVELOPER_PREVIEW');
      expect(typeof dataDevPreview.totalEligible).toBe('number');
    });

    it('Admin Matching Rules CRUD bumps matchVersion and POST /api/admin/matching/recalculate updates snapshots', async () => {
      // 1. GET rules
      const getReq = makeAuthRequest(
        'http://localhost:3000/api/admin/matching/rules',
        adminToken
      );
      const getRes = await getMatchingRulesRoute(getReq);
      expect(getRes.status).toBe(200);
      const initialData = await getRes.json();
      expect(initialData.rules.length).toBeGreaterThanOrEqual(10);
      const initialVersion = initialData.matchVersion;

      // 2. POST create custom rule
      const createReq = makeAuthRequest(
        'http://localhost:3000/api/admin/matching/rules',
        adminToken,
        {
          method: 'POST',
          body: {
            key: 'TEST_CUSTOM_PERFORMANCE_BOOST',
            name: 'مكافأة أداء تجريبية',
            nameEn: 'Test Custom Performance Boost',
            category: 'PERFORMANCE',
            points: 5,
            priority: 200,
            enabled: true,
            condition: {
              field: 'leadOpportunityScore',
              operator: 'gte',
              value: 80,
            },
          },
        }
      );
      const createRes = await postMatchingRulesRoute(createReq);
      expect(createRes.status).toBe(201);
      const createdData = await createRes.json();
      expect(createdData.rule.key).toBe('TEST_CUSTOM_PERFORMANCE_BOOST');
      expect(createdData.matchVersion).not.toBe(initialVersion);

      const createdRuleId = createdData.rule.id;

      // 3. PATCH update custom rule points & enabled state
      const patchReq = makeAuthRequest(
        `http://localhost:3000/api/admin/matching/rules/${createdRuleId}`,
        adminToken,
        {
          method: 'PATCH',
          body: {
            points: 8,
            enabled: false,
          },
        }
      );
      const patchRes = await patchMatchingRuleRoute(patchReq, {
        params: { id: createdRuleId },
      });
      expect(patchRes.status).toBe(200);
      const patchedData = await patchRes.json();
      expect(patchedData.rule.points).toBe(8);
      expect(patchedData.rule.enabled).toBe(false);

      // 4. DELETE custom rule
      const delReq = makeAuthRequest(
        `http://localhost:3000/api/admin/matching/rules/${createdRuleId}`,
        adminToken,
        { method: 'DELETE' }
      );
      const delRes = await deleteMatchingRuleRoute(delReq, {
        params: { id: createdRuleId },
      });
      expect(delRes.status).toBe(200);

      // 5. POST /api/admin/matching/recalculate
      const recalcReq = makeAuthRequest(
        'http://localhost:3000/api/admin/matching/recalculate',
        adminToken,
        {
          method: 'POST',
          body: {
            leadId: sampleLeadId,
          },
        }
      );
      const recalcRes = await recalculateMatchesRoute(recalcReq);
      expect(recalcRes.status).toBe(200);
      const recalcData = await recalcRes.json();
      expect(recalcData.success).toBe(true);
      expect(recalcData.recalculatedPairs).toBeGreaterThan(0);
    });

    it('recalculates matches when developer profile is updated or lead is marked CLOSED/INVALID', async () => {
      // Update developer profile
      const profileReq = makeAuthRequest(
        'http://localhost:3000/api/developer/profile',
        devToken,
        {
          method: 'PATCH',
          body: {
            minBudget: 7000,
            maxBudget: 65000,
            excludedNiches: ['LAW_FIRM'],
          },
        }
      );
      const profileRes = await patchDeveloperProfileRoute(profileReq);
      expect(profileRes.status).toBe(200);
      const profileData = await profileRes.json();
      expect(profileData.profile.minBudget).toBe(7000);
      expect(profileData.profile.excludedNiches).toContain('LAW_FIRM');

      // Create a temporary lead, verify it matches, then mark it INVALID via admin route and verify it becomes ineligible
      const tempLead = await prisma.lead.create({
        data: {
          businessName: 'عيادة اختبار المطابقة المؤقتة',
          normalizedName: 'عيادة اختبار المطابقة المؤقتة',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '01099881122',
          normalizedPhone: '+201099881122',
          hasPhone: true,
          websiteStatus: 'NO_WEBSITE',
          estimatedBudget: 16000,
          score: 85,
          temperature: 'PREMIUM',
          qualityScore: 88,
          qualityStatus: 'HIGH',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
          saleabilityStatus: 'AVAILABLE',
          status: 'AVAILABLE',
          businessStatus: 'OPEN',
          isCanonical: true,
          source: 'Manual Entry',
        },
      });

      const beforePairRes = await getPairMatchRoute(
        makeAuthRequest(
          `http://localhost:3000/api/matching/leads/${tempLead.id}/developers/${devUserId}`,
          adminToken
        ),
        { params: { leadId: tempLead.id, developerId: devUserId } }
      );
      const beforePairData = await beforePairRes.json();
      expect(beforePairData.eligible).toBe(true);

      // Admin marks tempLead INVALID
      const markInvalidReq = makeAuthRequest(
        `http://localhost:3000/api/admin/leads/${tempLead.id}`,
        adminToken,
        {
          method: 'PATCH',
          body: { action: 'MARK_INVALID' },
        }
      );
      const markInvalidRes = await patchAdminLeadRoute(markInvalidReq, {
        params: { id: tempLead.id },
      });
      expect(markInvalidRes.status).toBe(200);

      const afterPairRes = await getPairMatchRoute(
        makeAuthRequest(
          `http://localhost:3000/api/matching/leads/${tempLead.id}/developers/${devUserId}`,
          adminToken
        ),
        { params: { leadId: tempLead.id, developerId: devUserId } }
      );
      const afterPairData = await afterPairRes.json();
      expect(afterPairData.eligible).toBe(false);
      expect(afterPairData.finalMatchStrength).toBe(0);
      expect(
        afterPairData.matchResult.hardFailures.some(
          (hf: { key: string }) => hf.key === 'LEAD_NOT_SALEABLE'
        )
      ).toBe(true);

      // Clean up temp lead
      await prisma.lead.delete({ where: { id: tempLead.id } });
    });

    it('enforces Phase 3 FreshnessState taxonomy (VERY_STALE, RECENT, NEEDS_VERIFICATION), dynamic lastVerifiedAt decay, and already-claimed exclusion', () => {
      // 1. VERY_STALE fails hard gate with LEAD_STALE
      const veryStaleRes = evaluateMatch(
        {
          ...BASE_SALEABLE_LEAD,
          id: 'lead-very-stale',
          freshnessStatus: 'VERY_STALE',
        },
        BASE_ELIGIBLE_DEV
      );
      expect(veryStaleRes.eligible).toBe(false);
      expect(veryStaleRes.matchStrength).toBe(0);
      expect(
        veryStaleRes.hardFailures.some(
          (hf) => hf.key === 'LEAD_NOT_SALEABLE' && hf.subCode === 'LEAD_STALE'
        )
      ).toBe(true);

      // 2. RECENT passes hard gate and receives +2 FRESHNESS_AGING_BOOST points
      const recentRes = evaluateMatch(
        {
          ...BASE_SALEABLE_LEAD,
          id: 'lead-recent',
          freshnessStatus: 'RECENT',
        },
        BASE_ELIGIBLE_DEV
      );
      expect(recentRes.eligible).toBe(true);
      expect(
        recentRes.matchedCriteria.some(
          (c) => c.key === 'FRESHNESS_AGING_BOOST' && c.points === 2
        )
      ).toBe(true);

      // 3. NEEDS_VERIFICATION freshness state triggers requiresVerification policy (excluded by default)
      const needsVerifRes = evaluateMatch(
        {
          ...BASE_SALEABLE_LEAD,
          id: 'lead-needs-verif-freshness',
          freshnessStatus: 'NEEDS_VERIFICATION',
        },
        BASE_ELIGIBLE_DEV
      );
      expect(needsVerifRes.eligible).toBe(false);
      expect(
        needsVerifRes.hardFailures.some((hf) => hf.subCode === 'LEAD_REQUIRES_VERIFICATION')
      ).toBe(true);

      // 4. Dynamic lastVerifiedAt decay (120 days ago -> STALE) even when freshnessStatus is 'FRESH'
      const decayedRes = evaluateMatch(
        {
          ...BASE_SALEABLE_LEAD,
          id: 'lead-time-decayed',
          freshnessStatus: 'FRESH',
          lastVerifiedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
        },
        BASE_ELIGIBLE_DEV
      );
      expect(decayedRes.eligible).toBe(false);
      expect(decayedRes.hardFailures.some((hf) => hf.subCode === 'LEAD_STALE')).toBe(true);

      // 5. Already claimed by developer -> rejected with LEAD_NOT_SALEABLE
      const alreadyClaimedRes = evaluateMatch(
        {
          ...BASE_SALEABLE_LEAD,
          id: 'lead-already-claimed',
          claimedDeveloperIds: [BASE_ELIGIBLE_DEV.developerId!],
        },
        BASE_ELIGIBLE_DEV
      );
      expect(alreadyClaimedRes.eligible).toBe(false);
      expect(alreadyClaimedRes.hardFailures.some((hf) => hf.key === 'LEAD_NOT_SALEABLE')).toBe(
        true
      );

      // 6. No-match output includes reason: 'NO_ELIGIBLE_DEVELOPERS'
      const noMatchRanked = rankDevelopersForLead(
        {
          ...BASE_SALEABLE_LEAD,
          saleabilityStatus: 'INVALID',
        },
        [BASE_ELIGIBLE_DEV]
      );
      expect(noMatchRanked.eligibleDevelopers).toHaveLength(0);
      expect(noMatchRanked.reason).toBe('NO_ELIGIBLE_DEVELOPERS');
    });

    it('enforces RBAC on POST /api/matching/preview and supports Section 27 filters, dashboard integration, and admin lead budget/service updates', async () => {
      // 1. Non-admin developer attempting to override MatchingConfig in preview -> 403
      const forbiddenConfigReq = makeAuthRequest(
        'http://localhost:3000/api/matching/preview',
        devToken,
        {
          method: 'POST',
          body: {
            lead: BASE_SALEABLE_LEAD,
            developer: BASE_ELIGIBLE_DEV,
            config: {
              requiresVerificationPolicy: 'INCLUDE_WITH_WARNING',
              budgetHardRequirement: false,
            },
          },
        }
      );
      const forbiddenConfigRes = await previewMatchRoute(forbiddenConfigReq);
      expect(forbiddenConfigRes.status).toBe(403);

      // 2. Non-admin developer attempting to preview another developerId in Case 3 -> 403
      const forbiddenDevPreviewReq = makeAuthRequest(
        'http://localhost:3000/api/matching/preview',
        devToken,
        {
          method: 'POST',
          body: {
            developerId: 'other-developer-id',
          },
        }
      );
      const forbiddenDevPreviewRes = await previewMatchRoute(forbiddenDevPreviewReq);
      expect(forbiddenDevPreviewRes.status).toBe(403);

      // 3. Admin PATCH /api/admin/leads/:id updates budget and requiredService and persists them
      const updateLeadReq = makeAuthRequest(
        `http://localhost:3000/api/admin/leads/${sampleLeadId}`,
        adminToken,
        {
          method: 'PATCH',
          body: {
            estimatedBudget: 24000,
            minBudget: 20000,
            maxBudget: 30000,
            requiredService: 'WEBSITE_DEVELOPMENT',
            requiredServices: ['WEBSITE_DEVELOPMENT', 'SEO'],
            projectLeadType: 'NEW_WEBSITE',
          },
        }
      );
      const updateLeadRes = await patchAdminLeadRoute(updateLeadReq, {
        params: { id: sampleLeadId },
      });
      expect(updateLeadRes.status).toBe(200);
      const updatedLeadData = await updateLeadRes.json();
      expect(updatedLeadData.lead.estimatedBudget).toBe(24000);
      expect(updatedLeadData.lead.minBudget).toBe(20000);
      expect(updatedLeadData.lead.maxBudget).toBe(30000);
      expect(updatedLeadData.lead.requiredServices).toContain('SEO');

      // 4. GET /api/matching/developers/me supports Section 27 filters (service, niche, city, minQuality)
      const filteredDevMatchesReq = makeAuthRequest(
        'http://localhost:3000/api/matching/developers/me?service=WEBSITE_DEVELOPMENT&niche=DENTAL_CLINIC&city=القاهرة الجديدة&minQuality=80',
        devToken
      );
      const filteredDevMatchesRes = await getDeveloperMatchesRoute(filteredDevMatchesReq, {
        params: { developerId: 'me' },
      });
      expect(filteredDevMatchesRes.status).toBe(200);
      const filteredDevMatchesData = await filteredDevMatchesRes.json();
      expect(filteredDevMatchesData.totalEligible).toBeGreaterThanOrEqual(1);
      expect(filteredDevMatchesData.matches[0].lead.id).toBe(sampleLeadId);

      // 5. GET /api/leads supports Phase 4 service, niche, minMatchStrength, and sortBy=MATCH_STRENGTH
      const discoveryReq = makeAuthRequest(
        'http://localhost:3000/api/leads?service=WEBSITE_DEVELOPMENT&niche=DENTAL_CLINIC&minMatchStrength=70&sortBy=MATCH_STRENGTH',
        devToken
      );
      const discoveryRes = await getLeadsRoute(discoveryReq);
      expect(discoveryRes.status).toBe(200);
      const discoveryData = await discoveryRes.json();
      expect(discoveryData.leads.length).toBeGreaterThanOrEqual(1);
      expect(discoveryData.matchVersion).toBeDefined();
      expect(discoveryData.leads[0].matchEvaluation.matchStrength).toBeGreaterThanOrEqual(70);

      // 6. GET /api/developer/dashboard returns Phase 4 fields on topMatchedLeads
      const dashReq = makeAuthRequest(
        'http://localhost:3000/api/developer/dashboard',
        devToken
      );
      const dashRes = await getDashboardRoute(dashReq);
      expect(dashRes.status).toBe(200);
      const dashData = await dashRes.json();
      expect(dashData.topMatchedLeads.length).toBeGreaterThanOrEqual(1);
      expect(typeof dashData.topMatchedLeads[0].matchStrength).toBe('number');
      expect(typeof dashData.topMatchedLeads[0].qualityScore).toBe('number');
      expect(typeof dashData.topMatchedLeads[0].opportunityScore).toBe('number');
      expect(dashData.topMatchedLeads[0].explanation).toBeDefined();
    });
  });
});

function BASE_ELELIGIBLE_DEV_ALIAS(): DeveloperMatchingContext {
  return BASE_ELIGIBLE_DEV;
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import { DEFAULT_SCORING_RULES } from '@/lib/scoring-engine';
import {
  calculateLeadFreshness,
  evaluateVerificationExpiration,
  computeVerificationExpiryDate,
  validateLeadPhone,
  validateLeadEmail,
  evaluateWebsiteVerification,
  verifyWebsiteHttpWithTimeout,
  validateLeadCategory,
  validateLeadLocation,
  evaluateLeadCompleteness,
  evaluateLeadQuality,
  classifyQualityStatus,
  VerificationService,
  computeRetryBackoffMs,
  getRecentQualityLogs,
  getRecentVerificationLogs,
  clearQualityLogs,
} from '@/lib/quality';
import {
  claimLeadForDeveloper,
  submitDeveloperLeadFeedback,
} from '@/lib/lead-service';
import { DEFAULT_PLANS } from '@/lib/payment/provider';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { runIngestionPipeline } from '@/lib/collectors';

// API Route Handlers
import { GET as leadQualityGetHandler } from '@/app/api/leads/[id]/quality/route';
import {
  GET as leadVerificationGetHandler,
  POST as leadVerificationPostHandler,
} from '@/app/api/leads/[id]/verification/route';
import { GET as adminQualityGetHandler } from '@/app/api/admin/quality/route';
import { POST as adminVerifyBatchPostHandler } from '@/app/api/admin/quality/verify-batch/route';
import { GET as adminQualityFlagsGetHandler } from '@/app/api/admin/quality/flags/route';
import { GET as adminQualityStaleGetHandler } from '@/app/api/admin/quality/stale/route';
import { GET as adminNeedsVerificationGetHandler } from '@/app/api/admin/quality/needs-verification/route';
import { GET as leadsGetHandler } from '@/app/api/leads/route';
import { GET as adminReportsGetHandler } from '@/app/api/admin/reports/route';

describe('PHASE 3 — Lead Quality + Freshness + Verification Engine', () => {
  describe('1. Deterministic Validators, Completeness, Freshness & Quality Engine (Unit Tests)', () => {
    it('strictly separates Opportunity Score from Quality Score and supports configurable QualityConfig thresholds', () => {
      // A lead WITH a modern HTTPS website has LOWER Opportunity Score (since it already has a site)
      // but HIGH/EXCELLENT Data Quality Score (since all data is valid and verified).
      const now = new Date();
      const qualityEval = evaluateLeadQuality(
        {
          businessName: 'عيادة النور التخصصية للأسنان',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'مدينة نصر',
          area: 'عباس العقاد',
          address: '15 شارع عباس العقاد، مدينة نصر',
          phone: '01001234567',
          email: 'info@elnour-dental.com',
          website: 'https://elnour-dental.com',
          facebook: 'https://facebook.com/elnourdental',
          instagram: 'https://instagram.com/elnourdental',
          rating: 4.8,
          reviewCount: 120,
          source: 'google_maps',
          lastVerifiedAt: now,
        },
        { now }
      );

      expect(qualityEval.qualityScore).toBeGreaterThanOrEqual(85);
      expect(qualityEval.qualityStatus).toBe('EXCELLENT');
      expect(qualityEval.saleabilityStatus).toBe('AVAILABLE');
      expect(qualityEval.isSaleable).toBe(true);

      // Verify default thresholds
      expect(classifyQualityStatus(90)).toBe('EXCELLENT');
      expect(classifyQualityStatus(75)).toBe('HIGH');
      expect(classifyQualityStatus(60)).toBe('MEDIUM');
      expect(classifyQualityStatus(35)).toBe('LOW');
      expect(classifyQualityStatus(15)).toBe('VERY_LOW');

      // Custom QualityConfig overrides
      expect(
        classifyQualityStatus(90, {
          veryLowMax: 24,
          lowMax: 49,
          mediumMax: 69,
          highMax: 92,
        })
      ).toBe('HIGH');
    });

    it('Test A — Fresh Valid Lead: complete lead verified today produces HIGH/EXCELLENT quality and AVAILABLE saleability', () => {
      const now = new Date();
      const result = evaluateLeadQuality(
        {
          businessName: 'مركز النخبة لطب الأسنان',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'مصر الجديدة',
          area: 'الميرغني',
          address: '22 شارع الميرغني، مصر الجديدة',
          phone: '01012345678',
          email: 'contact@elite-dental-eg.com',
          website: null,
          facebook: 'https://facebook.com/elitedentaleg',
          instagram: 'https://instagram.com/elitedentaleg',
          rating: 4.9,
          reviewCount: 85,
          source: 'google_maps',
          lastVerifiedAt: now,
        },
        { now }
      );

      expect(['HIGH', 'EXCELLENT']).toContain(result.qualityStatus);
      expect(result.freshness.freshnessStatus).toBe('FRESH');
      expect(result.verificationStatus).toBe('VERIFIED');
      expect(result.saleabilityStatus).toBe('AVAILABLE');
      expect(result.isSaleable).toBe(true);
      expect(result.qualityFlags).toEqual([]);
    });

    it('Test B — Invalid Phone Lead: phone = 12345 sets INVALID_PHONE, reduces qualityScore, and marks lead NOT SALEABLE (INVALID)', () => {
      const now = new Date();
      const phoneCheck = validateLeadPhone('12345');
      expect(phoneCheck.status).toBe('INVALID');

      // Also test Egyptian 5-digit hotline (19xxx) vs bogus repeated digits
      expect(validateLeadPhone('19011').status).toBe('VALID');
      expect(validateLeadPhone('19011').phoneType).toBe('HOTLINE');
      expect(validateLeadPhone('01000000000').status).toBe('INVALID');

      const result = evaluateLeadQuality(
        {
          businessName: 'شركة الأمل للتطوير العقاري',
          category: 'Real Estate',
          governorate: 'القاهرة',
          city: 'التجمع الخامس',
          address: 'شارع التسعين الشمالي',
          phone: '12345',
          source: 'yellow_pages',
          lastVerifiedAt: now,
        },
        { now }
      );

      expect(result.qualityFlags).toContain('INVALID_PHONE');
      expect(result.qualityScore).toBeLessThan(70);
      expect(result.saleabilityStatus).toBe('INVALID');
      expect(result.isSaleable).toBe(false);
    });

    it('Test C — Stale Lead: evaluates 120d -> STALE, 200d -> VERY_STALE, and null -> UNKNOWN', () => {
      const now = new Date('2026-10-08T12:00:00Z');
      const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

      // 0-7 days -> FRESH
      expect(calculateLeadFreshness(daysAgo(3), undefined, now).freshnessStatus).toBe('FRESH');
      // 8-30 days -> RECENT
      expect(calculateLeadFreshness(daysAgo(15), undefined, now).freshnessStatus).toBe('RECENT');
      // 31-90 days -> NEEDS_VERIFICATION
      expect(calculateLeadFreshness(daysAgo(45), undefined, now).freshnessStatus).toBe(
        'NEEDS_VERIFICATION'
      );

      // Case 1: lastVerifiedAt = 120 days ago -> STALE, STALE_DATA flag, not saleable
      const stale120 = evaluateLeadQuality(
        {
          businessName: 'مطعم قصر الشام',
          category: 'Restaurant',
          governorate: 'الجيزة',
          city: 'الدقي',
          address: '10 شارع مصدق، الدقي',
          phone: '01122334455',
          lastVerifiedAt: daysAgo(120),
        },
        { now }
      );
      expect(stale120.freshness.freshnessStatus).toBe('STALE');
      expect(stale120.qualityFlags).toContain('STALE_DATA');
      expect(stale120.saleabilityStatus).toBe('STALE');
      expect(stale120.isSaleable).toBe(false);

      // Case 2: lastVerifiedAt = 200 days ago -> VERY_STALE
      const stale200 = evaluateLeadQuality(
        {
          businessName: 'مطعم قصر الشام',
          category: 'Restaurant',
          governorate: 'الجيزة',
          city: 'الدقي',
          address: '10 شارع مصدق، الدقي',
          phone: '01122334455',
          lastVerifiedAt: daysAgo(200),
        },
        { now }
      );
      expect(stale200.freshness.freshnessStatus).toBe('VERY_STALE');
      expect(stale200.qualityFlags).toContain('STALE_DATA');
      expect(stale200.saleabilityStatus).toBe('STALE');
      expect(stale200.isSaleable).toBe(false);

      // Case 3: lastVerifiedAt = null -> UNKNOWN freshness, REQUIRES_VERIFICATION
      const unknownFreshness = evaluateLeadQuality(
        {
          businessName: 'مطعم قصر الشام',
          category: 'Restaurant',
          governorate: 'الجيزة',
          city: 'الدقي',
          address: '10 شارع مصدق، الدقي',
          phone: '01122334455',
          lastVerifiedAt: null,
          lastDiscoveredAt: null,
        },
        { now }
      );
      expect(unknownFreshness.freshness.freshnessStatus).toBe('UNKNOWN');
      expect(unknownFreshness.saleabilityStatus).toBe('REQUIRES_VERIFICATION');
      expect(unknownFreshness.isSaleable).toBe(false);
    });

    it('Test D — Website Verification: distinguishes HTTPS, HTTP, missing, invalid domain, social-only URL, redirected, and unreachable', () => {
      // 1. https://valid-clinic.com -> WEBSITE_HTTPS
      const httpsRes = evaluateWebsiteVerification('https://valid-clinic.com');
      expect(httpsRes.state).toBe('WEBSITE_HTTPS');
      expect(httpsRes.websiteStatus).toBe('HAS_WEBSITE');
      expect(httpsRes.hasHttps).toBe(true);

      // 2. http://broken-domain.invalid -> DOMAIN_INVALID
      const invalidDomRes = evaluateWebsiteVerification('http://broken-domain.invalid');
      expect(invalidDomRes.state).toBe('DOMAIN_INVALID');
      expect(invalidDomRes.errorType).toBe('PERMANENT_FAILURE');

      // 3. Unreachable probe result -> WEBSITE_UNREACHABLE
      const unreachableRes = evaluateWebsiteVerification('https://down-clinic.com', null, {
        reachable: false,
        statusCode: 503,
        errorType: 'TEMPORARY_FAILURE',
        errorMessage: 'Connection timeout',
      });
      expect(unreachableRes.state).toBe('WEBSITE_UNREACHABLE');
      expect(unreachableRes.websiteStatus).toBe('POOR_WEBSITE');
      expect(unreachableRes.errorType).toBe('TEMPORARY_FAILURE');

      // 4. Redirected website -> WEBSITE_REDIRECT
      const redirectRes = evaluateWebsiteVerification('https://old-clinic.com', null, {
        reachable: true,
        statusCode: 301,
        redirected: true,
        finalUrl: 'https://new-clinic.com',
      });
      expect(redirectRes.state).toBe('WEBSITE_REDIRECT');
      expect(redirectRes.redirectedTo).toBe('https://new-clinic.com');

      // 5. Active HTTP website -> WEBSITE_HTTP
      const httpRes = evaluateWebsiteVerification('http://legacy-clinic.com');
      expect(httpRes.state).toBe('WEBSITE_HTTP');
      expect(httpRes.websiteStatus).toBe('POOR_WEBSITE');

      // 6. Social page placed in website field -> DOMAIN_INVALID with isSocialOnly = true
      const socialOnlyRes = evaluateWebsiteVerification('https://facebook.com/myclinicpage');
      expect(socialOnlyRes.state).toBe('DOMAIN_INVALID');
      expect(socialOnlyRes.isSocialOnly).toBe(true);
      expect(socialOnlyRes.websiteStatus).toBe('NO_WEBSITE');

      // 7. null -> WEBSITE_MISSING
      const missingRes = evaluateWebsiteVerification(null);
      expect(missingRes.state).toBe('WEBSITE_MISSING');
      expect(missingRes.websiteStatus).toBe('NO_WEBSITE');
    });

    it('Test E — Duplicate Lead & Test F — Closed Business: prevents saleability', () => {
      const now = new Date();

      // Test E: Non-canonical duplicate lead -> saleabilityStatus = DUPLICATE
      const dupEval = evaluateLeadQuality(
        {
          businessName: 'عيادة الصفوة',
          category: 'Medical',
          governorate: 'القاهرة',
          city: 'المعادي',
          address: 'شارع 9 المعادي',
          phone: '01099887766',
          isCanonical: false,
          duplicateConfidence: 95,
          lastVerifiedAt: now,
        },
        { now }
      );
      expect(dupEval.saleabilityStatus).toBe('DUPLICATE');
      expect(dupEval.isSaleable).toBe(false);

      // Possible duplicate (pending review) -> POSSIBLE_DUPLICATE flag & REQUIRES_VERIFICATION gate (not saleable)
      const possibleDupEval = evaluateLeadQuality(
        {
          businessName: 'عيادة الصفوة',
          category: 'Medical',
          governorate: 'القاهرة',
          city: 'المعادي',
          address: 'شارع 9 المعادي',
          phone: '01099887766',
          isCanonical: true,
          hasPendingDuplicateCandidate: true,
          lastVerifiedAt: now,
        },
        { now }
      );
      expect(possibleDupEval.qualityFlags).toContain('POSSIBLE_DUPLICATE');
      expect(possibleDupEval.saleabilityStatus).toBe('REQUIRES_VERIFICATION');
      expect(possibleDupEval.isSaleable).toBe(false);

      // Test F: Closed Business -> CLOSED_BUSINESS flag & CLOSED saleability
      const closedEval = evaluateLeadQuality(
        {
          businessName: 'مطعم الواحة (مغلق نهائياً)',
          category: 'Restaurant',
          governorate: 'القاهرة',
          city: 'مدينة نصر',
          address: 'شارع الطيران',
          phone: '01234567890',
          businessStatus: 'CLOSED',
          lastVerifiedAt: now,
        },
        { now }
      );
      expect(closedEval.businessStatus).toBe('CLOSED');
      expect(closedEval.qualityFlags).toContain('CLOSED_BUSINESS');
      expect(closedEval.saleabilityStatus).toBe('CLOSED');
      expect(closedEval.isSaleable).toBe(false);
    });

    it('Test G — Verification Expiration: expired checks transition to NEEDS_REVERIFICATION (NOT FAILED)', () => {
      const now = new Date('2026-10-08T12:00:00Z');
      const checked40DaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
      const expiresAt10DaysAgo = computeVerificationExpiryDate('PHONE', checked40DaysAgo);

      // PHONE expires after 30 days -> at day 40 it must be NEEDS_REVERIFICATION, NOT FAILED
      const checkOutcome = evaluateVerificationExpiration(
        {
          verificationType: 'PHONE',
          status: 'VERIFIED',
          checkedAt: checked40DaysAgo,
          expiresAt: expiresAt10DaysAgo,
        },
        undefined,
        now
      );
      expect(checkOutcome.isExpired).toBe(true);
      expect(checkOutcome.effectiveStatus).toBe('NEEDS_REVERIFICATION');
      expect(checkOutcome.effectiveStatus).not.toBe('FAILED');

      // Lead whose previous verification records have all expired transitions to UNVERIFIED
      const evalWithExpiredVerifications = evaluateLeadQuality(
        {
          businessName: 'شركة الرواد للمقاولات',
          category: 'Real Estate',
          governorate: 'القاهرة',
          city: 'مصر الجديدة',
          address: 'شارع الثورة',
          phone: '01011223344',
          lastVerifiedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          verifications: [
            {
              verificationType: 'PHONE',
              status: 'VERIFIED',
              checkedAt: checked40DaysAgo,
              expiresAt: expiresAt10DaysAgo,
            },
            {
              verificationType: 'IDENTITY',
              status: 'VERIFIED',
              checkedAt: checked40DaysAgo,
              expiresAt: expiresAt10DaysAgo,
            },
          ],
        },
        { now }
      );

      expect(evalWithExpiredVerifications.verificationStatus).toBe('UNVERIFIED');
      expect(evalWithExpiredVerifications.saleabilityStatus).toBe('REQUIRES_VERIFICATION');
    });

    it('detects CATEGORY_MISMATCH, LOCATION_MISMATCH, MISSING_REQUIRED_DATA, INVALID_EMAIL, and CONFLICTING_SOURCE_DATA', () => {
      const now = new Date();

      // Category mismatch: dental clinic name labeled as Restaurant
      const catCheck = validateLeadCategory('Restaurant', 'عيادة دكتور أحمد لتقويم الأسنان');
      expect(catCheck.hasCategoryMismatch).toBe(true);

      // Location mismatch: Mansoura (Dakahlia) paired with Cairo governorate
      const locCheck = validateLeadLocation('القاهرة', 'المنصورة');
      expect(locCheck.hasLocationMismatch).toBe(true);
      expect(locCheck.expectedGovernorate).toBe('الدقهلية');

      // Email validation states
      expect(validateLeadEmail('bad-email-format').status).toBe('INVALID_FORMAT');
      expect(validateLeadEmail('user@example.com').status).toBe('DOMAIN_INVALID');
      expect(validateLeadEmail('info@alborg-labs.com').status).toBe('DOMAIN_VALID');
      expect(validateLeadEmail(null).status).toBe('UNKNOWN');

      // Completeness check with missing required fields
      const comp = evaluateLeadCompleteness({
        businessName: 'نشاط بدون هاتف أو مدينة',
        category: 'Retail',
        governorate: 'القاهرة',
        city: null,
        phone: null,
      });
      expect(comp.missingRequiredFields).toContain('city');
      expect(comp.missingRequiredFields).toContain('primaryContact');
      expect(comp.missingOptionalFields).toContain('phone');

      // Combined quality evaluation with multiple flags
      const multiFlagEval = evaluateLeadQuality(
        {
          businessName: 'عيادة أسنان دكتور كريم',
          category: 'Restaurant', // mismatch with dental clinic
          governorate: 'القاهرة',
          city: 'المنصورة', // mismatch with Cairo
          phone: '01012345678',
          email: 'not-an-email',
          fieldConflicts: { phone: ['201012345678', '201199887766'] },
          lastVerifiedAt: now,
        },
        { now }
      );

      expect(multiFlagEval.qualityFlags).toContain('CATEGORY_MISMATCH');
      expect(multiFlagEval.qualityFlags).toContain('LOCATION_MISMATCH');
      expect(multiFlagEval.qualityFlags).toContain('INVALID_EMAIL');
      expect(multiFlagEval.qualityFlags).toContain('CONFLICTING_SOURCE_DATA');
    });

    it('calculates exponential backoff retry delays for TEMPORARY_FAILURE vs PERMANENT_FAILURE', () => {
      const d1 = computeRetryBackoffMs(1);
      const d2 = computeRetryBackoffMs(2);
      const d3 = computeRetryBackoffMs(3);
      expect(d2).toBeGreaterThan(d1);
      expect(d3).toBeGreaterThan(d2);
    });

    it('performs HTTP website verification with timeout, status code, and redirect handling + explainable quality reasons & source corroboration', async () => {
      // 1. HTTP 200 OK active website
      const okProbe = await verifyWebsiteHttpWithTimeout(
        'https://active-clinic.eg',
        1000,
        async () => new Response('<html><head><title>Clinic</title></head></html>', { status: 200 })
      );
      expect(okProbe.reachable).toBe(true);
      expect(okProbe.statusCode).toBe(200);
      expect(okProbe.errorType).toBeUndefined();
      const okOutcome = evaluateWebsiteVerification('https://active-clinic.eg', null, okProbe);
      expect(okOutcome.state).toBe('WEBSITE_HTTPS');

      // 2. HTTP 503 temporary server failure
      const tempProbe = await verifyWebsiteHttpWithTimeout(
        'https://busy-clinic.eg',
        1000,
        async () => new Response('Service Unavailable', { status: 503 })
      );
      expect(tempProbe.reachable).toBe(false);
      expect(tempProbe.errorType).toBe('TEMPORARY_FAILURE');
      const tempOutcome = evaluateWebsiteVerification('https://busy-clinic.eg', null, tempProbe);
      expect(tempOutcome.state).toBe('WEBSITE_UNREACHABLE');

      // 3. HTTP 404 permanent failure
      const notFoundProbe = await verifyWebsiteHttpWithTimeout(
        'https://dead-clinic.eg',
        1000,
        async () => new Response('Not Found', { status: 404 })
      );
      expect(notFoundProbe.reachable).toBe(false);
      expect(notFoundProbe.errorType).toBe('PERMANENT_FAILURE');

      // 4. Timeout / AbortError
      const timeoutProbe = await verifyWebsiteHttpWithTimeout(
        'https://slow-clinic.eg',
        50,
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'AbortError';
              reject(abortErr);
            });
          })
      );
      expect(timeoutProbe.reachable).toBe(false);
      expect(timeoutProbe.errorType).toBe('TEMPORARY_FAILURE');

      // 5. Completeness source provenance + Quality reasons + MULTIPLE_SOURCES corroboration
      const compMissingSource = evaluateLeadCompleteness({
        businessName: 'عيادة الصفوة',
        category: 'Dental',
        governorate: 'القاهرة',
        city: 'المعادي',
        phone: '01012345678',
        source: null,
        sourceList: [],
      });
      expect(compMissingSource.missingOptionalFields).toContain('source');

      const corroboratedEval = evaluateLeadQuality(
        {
          businessName: 'عيادة الصفوة للأسنان',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'المعادي',
          address: 'شارع 9 المعادي',
          phone: '01012345678',
          source: 'google_maps',
          sourceList: ['google_maps', 'yellow_pages_egypt'],
          lastVerifiedAt: new Date(),
        },
        { now: new Date() }
      );
      expect(corroboratedEval.qualityVersion).toBe('v1');
      expect(Array.isArray(corroboratedEval.reasons)).toBe(true);
      expect(corroboratedEval.reasons.some((r) => r.signal === 'MULTIPLE_SOURCES' && r.impact > 0)).toBe(
        true
      );
    });
  });

  describe('2. Integration & Database Pipeline Tests (VerificationService, Ingestion, Deduplication, Claiming, Feedback & APIs)', () => {
    let prisma: PrismaClient;
    let cleanupDb: () => Promise<void>;
    let adminToken: string;
    let devToken: string;
    let adminId: string;
    let devId: string;

    beforeAll(async () => {
      const testEnv = await createInMemoryTestDb();
      prisma = testEnv.prisma;
      cleanupDb = testEnv.cleanup;
      setPrismaClientForTesting(testEnv.prisma, testEnv.pglite);

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

      const passwordHash = await hashPassword('TestPass123!');
      const admin = await prisma.user.create({
        data: {
          name: 'Admin Quality Tester',
          email: 'admin-quality@leadforge.eg',
          passwordHash,
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

      let proPlanId = '';
      for (const p of DEFAULT_PLANS) {
        const created = await prisma.plan.create({ data: p });
        if (p.slug === 'pro') proPlanId = created.id;
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const dev = await prisma.user.create({
        data: {
          name: 'Dev Quality Tester',
          email: 'dev-quality@leadforge.eg',
          passwordHash,
          emailVerified: new Date(),
          role: 'DEVELOPER',
          developerProfile: {
            create: {
              niches: ['Dental', 'Medical', 'Real Estate'],
              locations: ['القاهرة', 'مدينة نصر', 'المعادي'],
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
      devId = dev.id;
      devToken = await signSessionToken({
        userId: dev.id,
        email: dev.email,
        role: 'DEVELOPER',
        name: dev.name,
      });
    }, 60000);

    afterAll(async () => {
      if (cleanupDb) {
        await cleanupDb();
      }
    });

    function buildRequest(
      url: string,
      options?: {
        method?: string;
        token?: string;
        body?: unknown;
      }
    ): NextRequest {
      const headers = new Headers({
        Origin: 'http://localhost:3000',
        Host: 'localhost:3000',
      });
      if (options?.token) {
        headers.set('Authorization', `Bearer ${options.token}`);
      }
      if (options?.body !== undefined) {
        headers.set('Content-Type', 'application/json');
      }
      return new NextRequest(url, {
        method: options?.method || 'GET',
        headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    }

    it('evaluates Quality, Freshness, Completeness, and Verification automatically during Ingestion and Merge', async () => {
      clearQualityLogs();

      const report = await runIngestionPipeline({
        prisma,
        userId: adminId,
        sourceName: 'google_maps_cairo',
        sourceType: 'CSV_IMPORT',
        rawRecords: [
          {
            businessName: 'مركز النيل لطب وتجميل الأسنان',
            category: 'Dental',
            governorate: 'القاهرة',
            city: 'مدينة نصر',
            address: '30 شارع مكرم عبيد، مدينة نصر',
            phone: '01055667788',
            email: 'info@niledental-eg.com',
            facebook: 'https://facebook.com/niledentaleg',
            rating: 4.8,
            reviewCount: 65,
          },
        ],
      });

      expect(report.valid).toBe(1);
      const leadId = report.records[0].leadId!;
      const createdLead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { verifications: true, scores: true },
      });

      expect(createdLead).not.toBeNull();
      // Both Opportunity Score (score) and Quality Score (qualityScore) exist independently
      expect(createdLead!.score).toBeGreaterThanOrEqual(70);
      expect(createdLead!.qualityScore).toBeGreaterThanOrEqual(75);
      expect(['HIGH', 'EXCELLENT']).toContain(createdLead!.qualityStatus);
      expect(createdLead!.completenessScore).toBeGreaterThanOrEqual(80);
      expect(createdLead!.freshnessStatus).toBe('FRESH');
      expect(createdLead!.verificationStatus).toBe('VERIFIED');
      expect(createdLead!.saleabilityStatus).toBe('AVAILABLE');
      expect(createdLead!.verifications.length).toBeGreaterThanOrEqual(4);

      // Merging a second source with additional social data preserves/improves quality
      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminId,
        sourceName: 'yellow_pages_egypt',
        sourceType: 'DIRECTORY',
        rawRecords: [
          {
            businessName: 'مركز النيل لطب وتجميل الأسنان',
            category: 'Dental',
            governorate: 'القاهرة',
            city: 'مدينة نصر',
            phone: '+20 105 566 7788',
            instagram: 'https://instagram.com/niledentaleg',
          },
        ],
      });
      expect(r2.duplicates).toBe(1);

      const mergedLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(mergedLead.qualityScore).toBeGreaterThanOrEqual(createdLead!.qualityScore);
      expect(getRecentQualityLogs().length).toBeGreaterThan(0);
    });

    it('VerificationService executes individual & full lead verifications and records immutable LeadVerification history', async () => {
      const lead = await prisma.lead.findFirst({
        where: { normalizedPhone: '201055667788' },
      });
      expect(lead).not.toBeNull();

      const phoneRecord = await VerificationService.verifyPhone(lead!.id);
      expect(phoneRecord.verificationType).toBe('PHONE');
      expect(phoneRecord.status).toBe('VERIFIED');
      expect(phoneRecord.expiresAt).not.toBeNull();

      const emailRecord = await VerificationService.verifyEmail(lead!.id);
      expect(emailRecord.verificationType).toBe('EMAIL');
      expect(emailRecord.status).toBe('VERIFIED');

      const websiteRecord = await VerificationService.verifyWebsite(lead!.id);
      expect(websiteRecord.verificationType).toBe('WEBSITE');
      expect(websiteRecord.status).toBe('VERIFIED');

      const businessRecord = await VerificationService.verifyBusiness(lead!.id);
      expect(businessRecord.verificationType).toBe('BUSINESS_STATUS');
      expect(businessRecord.status).toBe('VERIFIED');

      const fullSummary = await VerificationService.verifyLead(lead!.id, {
        source: 'TEST_MANUAL_VERIFY',
      });
      expect(fullSummary.newVerificationStatus).toBe('VERIFIED');
      expect(fullSummary.qualityEvaluation.saleabilityStatus).toBe('AVAILABLE');
      expect(getRecentVerificationLogs().length).toBeGreaterThan(0);
    });

    it('enforces Quality Gates on Claiming, Developer Browse API, and Matching Engine while keeping CRM pipelineStatus independent', async () => {
      // 1. Create a CLOSED business lead and a STALE lead
      const closedLead = await prisma.lead.create({
        data: {
          businessName: 'كافيه النيل المغلق',
          normalizedName: 'كافيه النيل المغلق',
          category: 'Restaurant',
          governorate: 'القاهرة',
          city: 'مدينة نصر',
          phone: '01066778899',
          hasPhone: true,
          businessStatus: 'CLOSED',
          qualityScore: 20,
          qualityStatus: 'VERY_LOW',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
          saleabilityStatus: 'CLOSED',
          qualityFlags: ['CLOSED_BUSINESS'],
          status: 'CLOSED',
          score: 85,
          temperature: 'HOT',
        },
      });

      const staleDate = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000);
      const staleLead = await prisma.lead.create({
        data: {
          businessName: 'عيادة الشروق القديمة',
          normalizedName: 'عياده الشروق القديمه',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'مدينة نصر',
          phone: '01077889900',
          hasPhone: true,
          businessStatus: 'OPEN',
          qualityScore: 45,
          qualityStatus: 'LOW',
          freshnessStatus: 'STALE',
          verificationStatus: 'UNVERIFIED',
          saleabilityStatus: 'STALE',
          qualityFlags: ['STALE_DATA'],
          lastVerifiedAt: staleDate,
          createdAt: staleDate,
          status: 'STALE',
          score: 90,
          temperature: 'PREMIUM',
        },
      });

      // Attempting to claim a CLOSED lead or STALE lead must throw an error and NOT deduct credits
      const subBefore = await prisma.subscription.findUnique({ where: { userId: devId } });
      await expect(
        claimLeadForDeveloper({ prisma, userId: devId, leadId: closedLead.id })
      ).rejects.toThrow();
      await expect(
        claimLeadForDeveloper({ prisma, userId: devId, leadId: staleLead.id })
      ).rejects.toThrow();
      const subAfter = await prisma.subscription.findUnique({ where: { userId: devId } });
      expect(subAfter!.credits).toBe(subBefore!.credits);

      // Matching engine must NOT match non-saleable leads
      const matchClosed = evaluateDeveloperLeadMatch(closedLead);
      expect(matchClosed.isMatch).toBe(false);
      const matchStale = evaluateDeveloperLeadMatch(staleLead);
      expect(matchStale.isMatch).toBe(false);

      // Developer GET /api/leads must exclude non-saleable leads by default
      const browseReq = buildRequest('http://localhost:3000/api/leads', { token: devToken });
      const browseRes = await leadsGetHandler(browseReq);
      expect(browseRes.status).toBe(200);
      const browseData = await browseRes.json();
      const returnedIds = browseData.leads.map((l: { id: string }) => l.id);
      expect(returnedIds).not.toContain(closedLead.id);
      expect(returnedIds).not.toContain(staleLead.id);
    });

    it('Test H — Feedback-Triggered Re-Verification: developer negative feedback updates quality flags, verification status, and saleability', async () => {
      // Create a fresh saleable lead and let the developer claim it
      const report = await runIngestionPipeline({
        prisma,
        userId: adminId,
        sourceName: 'manual_entry',
        sourceType: 'MANUAL',
        rawRecords: [
          {
            businessName: 'عيادة دار الشفاء للأسنان',
            category: 'Dental',
            governorate: 'القاهرة',
            city: 'المعادي',
            address: '12 شارع النصر، المعادي',
            phone: '01033445566',
          },
        ],
      });

      const leadId = report.records[0].leadId!;
      const claimResult = await claimLeadForDeveloper({
        prisma,
        userId: devId,
        leadId,
      });
      expect(claimResult.claim.pipelineStatus).toBe('NEW');

      // Developer reports WRONG_PHONE feedback
      await submitDeveloperLeadFeedback({
        prisma,
        userId: devId,
        leadId,
        useful: false,
        reason: 'WRONG_PHONE',
        comment: 'الرقم مفصول نهائياً خارج الخدمة',
      });

      const updatedAfterWrongPhone = await prisma.lead.findUnique({
        where: { id: leadId },
      });
      expect(updatedAfterWrongPhone!.qualityFlags).toContain('INVALID_PHONE');
      expect(updatedAfterWrongPhone!.verificationStatus).toBe('FAILED_VERIFICATION');
      expect(updatedAfterWrongPhone!.saleabilityStatus).toBe('INVALID');

      // CRM pipelineStatus on the developer's claim remains untouched ('NEW')
      const myClaim = await prisma.leadClaim.findUnique({
        where: { leadId_userId: { leadId, userId: devId } },
      });
      expect(myClaim!.pipelineStatus).toBe('NEW');

      // Developer updates feedback to BUSINESS_CLOSED
      await submitDeveloperLeadFeedback({
        prisma,
        userId: devId,
        leadId,
        useful: false,
        reason: 'BUSINESS_CLOSED',
        comment: 'العيادة أغلقت نهائياً',
      });
      const updatedAfterClosed = await prisma.lead.findUnique({
        where: { id: leadId },
      });
      expect(updatedAfterClosed!.businessStatus).toBe('CLOSED');
      expect(updatedAfterClosed!.qualityFlags).toContain('CLOSED_BUSINESS');
      expect(updatedAfterClosed!.saleabilityStatus).toBe('CLOSED');
    });

    it('executes bounded Batch Verification ordered by Freshness priority (VERY_STALE -> STALE -> NEEDS_VERIFICATION) and Opportunity Score', async () => {
      const now = Date.now();
      const veryStaleLead = await prisma.lead.create({
        data: {
          businessName: 'مركز القاهرة للعلاج الطبيعي',
          normalizedName: 'مركز القاهره للعلاج الطبيعي',
          category: 'Medical',
          governorate: 'القاهرة',
          city: 'مدينة نصر',
          address: 'شارع عباس العقاد',
          phone: '01288776655',
          normalizedPhone: '201288776655',
          hasPhone: true,
          score: 92,
          temperature: 'PREMIUM',
          estimatedBudget: 15000,
          freshnessStatus: 'VERY_STALE',
          verificationStatus: 'UNVERIFIED',
          saleabilityStatus: 'STALE',
          status: 'STALE',
          lastVerifiedAt: new Date(now - 210 * 24 * 60 * 60 * 1000),
          createdAt: new Date(now - 210 * 24 * 60 * 60 * 1000),
        },
      });

      const batchResult = await VerificationService.verifyLeadsBatch({
        batchSize: 5,
        source: 'ADMIN_BATCH_TEST',
      });

      expect(batchResult.processedCount).toBeGreaterThanOrEqual(1);
      const processedIds = batchResult.results.map((r) => r.leadId);
      expect(processedIds).toContain(veryStaleLead.id);

      // After verification, the formerly VERY_STALE valid lead is now FRESH, VERIFIED, and AVAILABLE
      const refreshedLead = await prisma.lead.findUnique({
        where: { id: veryStaleLead.id },
      });
      expect(refreshedLead!.freshnessStatus).toBe('FRESH');
      expect(refreshedLead!.verificationStatus).toBe('VERIFIED');
      expect(refreshedLead!.saleabilityStatus).toBe('AVAILABLE');
    });

    it('serves Developer & Admin Quality/Verification APIs and enforces RBAC', async () => {
      const sampleLead = await prisma.lead.findFirst({
        where: { isCanonical: true, saleabilityStatus: 'AVAILABLE' },
      });
      expect(sampleLead).not.toBeNull();

      // 1. GET /api/leads/:id/quality (accessible to authenticated developer)
      const qReq = buildRequest(
        `http://localhost:3000/api/leads/${sampleLead!.id}/quality`,
        { token: devToken }
      );
      const qRes = await leadQualityGetHandler(qReq, {
        params: Promise.resolve({ id: sampleLead!.id }),
      });
      expect(qRes.status).toBe(200);
      const qData = await qRes.json();
      expect(qData.leadId).toBe(sampleLead!.id);
      expect(typeof qData.opportunity.score).toBe('number');
      expect(typeof qData.quality.qualityScore).toBe('number');
      expect(qData.quality.qualityStatus).toBeDefined();

      // 2. GET /api/leads/:id/verification (accessible to authenticated developer)
      const vReq = buildRequest(
        `http://localhost:3000/api/leads/${sampleLead!.id}/verification`,
        { token: devToken }
      );
      const vRes = await leadVerificationGetHandler(vReq, {
        params: Promise.resolve({ id: sampleLead!.id }),
      });
      expect(vRes.status).toBe(200);
      const vData = await vRes.json();
      expect(Array.isArray(vData.verifications)).toBe(true);
      expect(vData.latestByDimension).toBeDefined();

      // 3. POST /api/leads/:id/verification (Admin only -> 403 for developer, 200 for admin)
      const devPostVerifyReq = buildRequest(
        `http://localhost:3000/api/leads/${sampleLead!.id}/verification`,
        {
          method: 'POST',
          token: devToken,
          body: { force: true },
        }
      );
      const devPostVerifyRes = await leadVerificationPostHandler(devPostVerifyReq, {
        params: Promise.resolve({ id: sampleLead!.id }),
      });
      expect(devPostVerifyRes.status).toBe(403);

      const adminPostVerifyReq = buildRequest(
        `http://localhost:3000/api/leads/${sampleLead!.id}/verification`,
        {
          method: 'POST',
          token: adminToken,
          body: { force: true },
        }
      );
      const adminPostVerifyRes = await leadVerificationPostHandler(adminPostVerifyReq, {
        params: Promise.resolve({ id: sampleLead!.id }),
      });
      expect(adminPostVerifyRes.status).toBe(200);

      // 4. GET /api/admin/quality (403 for developer, 200 for admin)
      const devAdminQualityReq = buildRequest('http://localhost:3000/api/admin/quality', {
        token: devToken,
      });
      const devAdminQualityRes = await adminQualityGetHandler(devAdminQualityReq);
      expect(devAdminQualityRes.status).toBe(403);

      const adminQualityReq = buildRequest('http://localhost:3000/api/admin/quality', {
        token: adminToken,
      });
      const adminQualityRes = await adminQualityGetHandler(adminQualityReq);
      expect(adminQualityRes.status).toBe(200);
      const adminQualityData = await adminQualityRes.json();
      expect(adminQualityData.overview).toBeDefined();
      expect(adminQualityData.qualityDistribution).toBeDefined();
      expect(adminQualityData.freshnessDistribution).toBeDefined();
      expect(adminQualityData.verificationDistribution).toBeDefined();
      expect(adminQualityData.flagBreakdown).toBeDefined();

      // 5. GET /api/admin/quality/flags, /stale, /needs-verification, and POST /verify-batch
      const flagsReq = buildRequest(
        'http://localhost:3000/api/admin/quality/flags?flag=CLOSED_BUSINESS',
        { token: adminToken }
      );
      const flagsRes = await adminQualityFlagsGetHandler(flagsReq);
      expect(flagsRes.status).toBe(200);
      const flagsData = await flagsRes.json();
      expect(flagsData.leads.length).toBeGreaterThanOrEqual(1);

      const staleReq = buildRequest('http://localhost:3000/api/admin/quality/stale', {
        token: adminToken,
      });
      const staleRes = await adminQualityStaleGetHandler(staleReq);
      expect(staleRes.status).toBe(200);

      const needsVerReq = buildRequest(
        'http://localhost:3000/api/admin/quality/needs-verification',
        { token: adminToken }
      );
      const needsVerRes = await adminNeedsVerificationGetHandler(needsVerReq);
      expect(needsVerRes.status).toBe(200);

      const batchApiReq = buildRequest(
        'http://localhost:3000/api/admin/quality/verify-batch',
        {
          method: 'POST',
          token: adminToken,
          body: { batchSize: 5 },
        }
      );
      const batchApiRes = await adminVerifyBatchPostHandler(batchApiReq);
      expect(batchApiRes.status).toBe(200);

      // 6. GET /api/admin/reports includes Phase 3 qualityOverview metrics
      const reportsReq = buildRequest('http://localhost:3000/api/admin/reports', {
        token: adminToken,
      });
      const reportsRes = await adminReportsGetHandler(reportsReq);
      expect(reportsRes.status).toBe(200);
      const reportsData = await reportsRes.json();
      expect(reportsData.qualityOverview).toBeDefined();
      expect(typeof reportsData.qualityOverview.averageQualityScore).toBe('number');
    });

    it('recovers lead saleability when Admin re-verifies a lead after developer negative feedback, and enforces dynamic freshness at claim/browse time', async () => {
      // 1. Create a valid lead, claim it, and submit WRONG_PHONE + BUSINESS_CLOSED feedback
      const report = await runIngestionPipeline({
        prisma,
        userId: adminId,
        sourceName: 'recovery_test_source',
        sourceType: 'MANUAL',
        rawRecords: [
          {
            businessName: 'عيادة الأمل التخصصية للأسنان',
            category: 'Dental',
            governorate: 'القاهرة',
            city: 'المعادي',
            address: '10 شارع النصر، المعادي',
            phone: '01099112233',
          },
        ],
      });
      const leadId = report.records[0].leadId!;

      await claimLeadForDeveloper({ prisma, userId: devId, leadId });
      await submitDeveloperLeadFeedback({
        prisma,
        userId: devId,
        leadId,
        useful: false,
        reason: 'BUSINESS_CLOSED',
        comment: 'ظننت أنها مغلقة',
      });

      const afterFeedback = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(afterFeedback.businessStatus).toBe('CLOSED');
      expect(afterFeedback.saleabilityStatus).toBe('CLOSED');
      expect(afterFeedback.status).toBe('CLOSED');

      // Wait 15ms so Admin re-verification timestamp is strictly newer than feedback createdAt
      await new Promise((r) => setTimeout(r, 15));

      const reverifyOutcome = await VerificationService.verifyLead(leadId, {
        source: 'ADMIN_MANUAL_RECOVERY',
      });
      expect(reverifyOutcome.newVerificationStatus).toBe('VERIFIED');
      expect(reverifyOutcome.qualityEvaluation.businessStatus).toBe('OPEN');
      expect(reverifyOutcome.qualityEvaluation.saleabilityStatus).toBe('AVAILABLE');

      const recoveredLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(recoveredLead.businessStatus).toBe('OPEN');
      expect(recoveredLead.saleabilityStatus).toBe('AVAILABLE');
      expect(recoveredLead.status).toBe('AVAILABLE');

      // 2. Dynamic freshness decay at browse/claim time when DB saleabilityStatus was still 'AVAILABLE'
      const decayedReport = await runIngestionPipeline({
        prisma,
        userId: adminId,
        sourceName: 'decay_test_source',
        sourceType: 'MANUAL',
        rawRecords: [
          {
            businessName: 'مركز الزمالك لطب الأسنان',
            category: 'Dental',
            governorate: 'القاهرة',
            city: 'مدينة نصر',
            address: '18 شارع الطيران',
            phone: '01122334455',
          },
        ],
      });
      const decayedLeadId = decayedReport.records[0].leadId!;

      // Simulate time passing (45 days -> NEEDS_VERIFICATION) without running a background job to update saleabilityStatus
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      await prisma.lead.update({
        where: { id: decayedLeadId },
        data: {
          lastVerifiedAt: fortyFiveDaysAgo,
          saleabilityStatus: 'AVAILABLE',
          status: 'AVAILABLE',
        },
      });

      // Developer browse API must dynamically exclude NEEDS_VERIFICATION leads
      const browseReq = buildRequest('http://localhost:3000/api/leads', { token: devToken });
      const browseRes = await leadsGetHandler(browseReq);
      const browseData = await browseRes.json();
      const browsedIds = browseData.leads.map((l: { id: string }) => l.id);
      expect(browsedIds).not.toContain(decayedLeadId);

      // Claiming a dynamically decayed NEEDS_VERIFICATION lead must be blocked without deducting credits
      const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { userId: devId } });
      await expect(
        claimLeadForDeveloper({ prisma, userId: devId, leadId: decayedLeadId })
      ).rejects.toThrow();
      const subAfter = await prisma.subscription.findUniqueOrThrow({ where: { userId: devId } });
      expect(subAfter.credits).toBe(subBefore.credits);

      // 3. Single-dimension POST /api/leads/:id/verification, 404 on missing lead, and concurrent lock safety
      const notFoundVerifyReq = buildRequest(
        'http://localhost:3000/api/leads/non-existent-lead-id/verification',
        {
          method: 'POST',
          token: adminToken,
          body: { dimension: 'PHONE' },
        }
      );
      const notFoundVerifyRes = await leadVerificationPostHandler(notFoundVerifyReq, {
        params: Promise.resolve({ id: 'non-existent-lead-id' }),
      });
      expect(notFoundVerifyRes.status).toBe(404);

      const singleDimReq = buildRequest(
        `http://localhost:3000/api/leads/${decayedLeadId}/verification`,
        {
          method: 'POST',
          token: adminToken,
          body: { dimension: 'PHONE' },
        }
      );
      const singleDimRes = await leadVerificationPostHandler(singleDimReq, {
        params: Promise.resolve({ id: decayedLeadId }),
      });
      expect(singleDimRes.status).toBe(200);
      const singleDimData = await singleDimRes.json();
      expect(singleDimData.dimension).toBe('PHONE');
      expect(singleDimData.verificationRecord.status).toBe('VERIFIED');

      // Concurrent verifyLead calls on the same lead serialize cleanly via per-lead lock
      const [c1, c2] = await Promise.all([
        VerificationService.verifyLead(decayedLeadId, { source: 'CONCURRENT_1' }),
        VerificationService.verifyLead(decayedLeadId, { source: 'CONCURRENT_2' }),
      ]);
      expect(c1.newVerificationStatus).toBe('VERIFIED');
      expect(c2.newVerificationStatus).toBe('VERIFIED');
    });
  });
});


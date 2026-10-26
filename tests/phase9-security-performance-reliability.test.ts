import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import {
  hashPassword,
  signSessionToken,
  verifyCsrfOrigin,
  verifyPassword,
} from '@/lib/auth';
import { resetRateLimits } from '@/lib/rate-limit';
import {
  AppSecurityError,
  applySecurityHeaders,
  buildCorsHeaders,
  clearAbuseStateForTests,
  createSafeErrorResponse,
  detectForbiddenFieldsInPayload,
  getFlaggedAbuseSignals,
  redactSensitiveData,
   sanitizeCsvExportCell,
  validateCorsOrigin,
  validateImportUploadSafety,
} from '@/lib/security';
import {
  clearStructuredLogsForTests,
  evaluateLivenessCheck,
  evaluateOperationalAlerts,
  evaluateReadinessCheck,
  getOrGenerateRequestId,
  getRecentSlowQueries,
  getRecentStructuredLogs,
  globalAppCache,
  initiateGracefulShutdown,
  logStructured,
  recordHttpRequestMetric,
  recordQueryExecution,
  resetMetricsForTests,
  resetShutdownStateForTests,
  runDataIntegrityChecks,
  trackActiveOperation,
  updateAlertThresholds,
  withSlowQueryTracking,
} from '@/lib/observability';
import {
  assertSafeExternalUrl,
  assertSafeExternalUrlWithDns,
  isPrivateOrReservedIp,
  safeExternalFetch,
  sanitizeSpreadsheetFormula,
} from '@/lib/collectors/security';
import { analyzeWebsiteUrl } from '@/lib/website-analyzer';
import { verifyWebsiteHttpWithTimeout } from '@/lib/quality/validators';
import {
  claimLead,
  ensureDeveloperCreditAccount,
  getAdminCreditsOverview,
  reconcileCreditAccount,
  refundClaim,
} from '@/lib/claims';
import { runIngestionPipeline } from '@/lib/collectors';
import { exportAnalyticsDatasetToCsv } from '@/lib/analytics/service';

// Route handlers
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { POST as registerPost } from '@/app/api/auth/register/route';
import { GET as getLeadsRoute } from '@/app/api/leads/route';
import { GET as getLeadDetailRoute } from '@/app/api/leads/[id]/route';
import { POST as claimLeadRoute } from '@/app/api/leads/[id]/claim/route';
import { POST as verifyLeadRoute } from '@/app/api/leads/[id]/verification/route';
import { PATCH as updateDeveloperProfileRoute } from '@/app/api/developer/profile/route';
import { GET as getPairMatchRoute } from '@/app/api/matching/leads/[leadId]/developers/[developerId]/route';
import { POST as previewMatchRoute } from '@/app/api/matching/preview/route';
import { GET as getAdminUsersRoute, PATCH as patchAdminUsersRoute } from '@/app/api/admin/users/route';
import { GET as getAdminLeadsRoute } from '@/app/api/admin/leads/route';
import { POST as adminImportPost } from '@/app/api/admin/import/route';
import { GET as adminAnalyticsExportGet } from '@/app/api/admin/analytics/export/route';
import { PATCH as adminQualityPatch } from '@/app/api/admin/quality/route';
import { POST as adminVerifyBatchPost } from '@/app/api/admin/quality/verify-batch/route';
import { GET as healthLiveGet } from '@/app/api/health/live/route';
import { GET as healthReadyGet } from '@/app/api/health/ready/route';
import {
  GET as adminObservabilityGet,
  POST as adminObservabilityPost,
} from '@/app/api/admin/observability/route';
import {
  GET as adminPlansGet,
  PATCH as adminPlansPatch,
} from '@/app/api/admin/plans/route';
import { GET as adminReportsGet } from '@/app/api/admin/reports/route';
import { createAuditLog } from '@/lib/audit';
import { getSafeClientErrorMessage } from '@/lib/security/error-taxonomy';
import {
  DEFAULT_DEV_AUTH_SECRET,
  isProductionAuthSecretConfigured,
} from '@/lib/auth';

function makeRequest(
  url: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };

  return new NextRequest(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe('Phase 9 — Production-Grade Security, Performance, Concurrency & Reliability Suite', () => {
  let prisma: PrismaClient;
  let pglite: PGlite;
  let cleanupDb: () => Promise<void>;

  let adminUser: { id: string; email: string; token: string };
  let devA: { id: string; email: string; token: string };
  let devB: { id: string; email: string; token: string };
  let suspendedDev: { id: string; email: string; token: string };
  let proPlanId: string;

  beforeAll(async () => {
    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    pglite = testDb.pglite;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(prisma, pglite);

    const passwordHash = await hashPassword('StrongPass!2026');

    const plan = await prisma.plan.create({
      data: {
        slug: 'pro-plan-p9',
        name: 'باقة المحترفين',
        nameEn: 'Pro Plan',
        priceEgp: 1500,
        monthlyCredits: 50,
        allowsExclusive: true,
        maxConcurrentClaims: 50,
        sortOrder: 1,
      },
    });
    proPlanId = plan.id;

    const admin = await prisma.user.create({
      data: {
        name: 'System Admin',
        email: 'admin-p9@leadforge.eg',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const userA = await prisma.user.create({
      data: {
        name: 'Developer Alpha',
        email: 'deva-p9@leadforge.eg',
        passwordHash,
        emailVerified: new Date(),
        role: 'DEVELOPER',
        status: 'ACTIVE',
        developerProfile: {
          create: {
            companyName: 'Alpha Digital Egypt',
            services: ['Website Development', 'E-Commerce'],
            preferredServices: ['Website Development'],
            niches: ['Dental', 'Medical', 'Restaurant'],
            locations: ['القاهرة', 'الجيزة'],
            supportedGovernorates: ['القاهرة', 'الجيزة'],
            supportedCities: ['القاهرة', 'مدينة نصر', 'المعادي'],
            allLocationsMode: true,
            allNichesMode: true,
            minBudget: 3000,
            maxBudget: 200000,
            leadType: 'BOTH',
            isActive: true,
            isAcceptingLeads: true,
            isVerified: true,
          },
        },
        subscription: {
          create: {
            planId: plan.id,
            status: 'ACTIVE',
            credits: 50,
            totalCreditsGranted: 50,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
          },
        },
      },
    });

    const userB = await prisma.user.create({
      data: {
        name: 'Developer Beta',
        email: 'devb-p9@leadforge.eg',
        passwordHash,
        emailVerified: new Date(),
        role: 'DEVELOPER',
        status: 'ACTIVE',
        developerProfile: {
          create: {
            companyName: 'Beta Tech Cairo',
            services: ['Website Development'],
            niches: ['Dental', 'Medical'],
            locations: ['القاهرة'],
            allLocationsMode: true,
            allNichesMode: true,
            minBudget: 3000,
            maxBudget: 200000,
            leadType: 'BOTH',
            isActive: true,
            isAcceptingLeads: true,
            isVerified: true,
          },
        },
        subscription: {
          create: {
            planId: plan.id,
            status: 'ACTIVE',
            credits: 50,
            totalCreditsGranted: 50,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
          },
        },
      },
    });

    const userSuspended = await prisma.user.create({
      data: {
        name: 'Suspended User',
        email: 'suspended-p9@leadforge.eg',
        passwordHash,
        role: 'DEVELOPER',
        status: 'SUSPENDED',
      },
    });

    await ensureDeveloperCreditAccount(prisma, userA.id);
    await ensureDeveloperCreditAccount(prisma, userB.id);

    adminUser = {
      id: admin.id,
      email: admin.email,
      token: await signSessionToken({
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
      }),
    };

    devA = {
      id: userA.id,
      email: userA.email,
      token: await signSessionToken({
        userId: userA.id,
        email: userA.email,
        name: userA.name,
        role: 'DEVELOPER',
      }),
    };

    devB = {
      id: userB.id,
      email: userB.email,
      token: await signSessionToken({
        userId: userB.id,
        email: userB.email,
        name: userB.name,
        role: 'DEVELOPER',
      }),
    };

    suspendedDev = {
      id: userSuspended.id,
      email: userSuspended.email,
      token: await signSessionToken({
        userId: userSuspended.id,
        email: userSuspended.email,
        name: userSuspended.name,
        role: 'DEVELOPER',
      }),
    };
  });

  beforeEach(() => {
    resetRateLimits();
    clearAbuseStateForTests();
    clearStructuredLogsForTests();
    resetMetricsForTests();
    resetShutdownStateForTests();
    globalAppCache.resetStatsForTests();
  });

  afterAll(async () => {
    await cleanupDb();
  });

  // ==========================================================================
  // 1. AUTHENTICATION, SESSION, & PASSWORD SECURITY TESTS
  // ==========================================================================
  describe('1. Authentication, Session, & Password Security', () => {
    it('hashes passwords with bcrypt and rejects invalid passwords', async () => {
      const hash = await hashPassword('MySecretPass#1');
      expect(hash).not.toBe('MySecretPass#1');
      expect(hash.startsWith('$2')).toBe(true);
      expect(await verifyPassword('MySecretPass#1', hash)).toBe(true);
      expect(await verifyPassword('WrongPass#1', hash)).toBe(false);
    });

    it('rejects unauthenticated requests, forged JWTs, and suspended user tokens', async () => {
      // Unauthenticated request to protected endpoint
      const unauthRes = await getLeadsRoute(makeRequest('http://localhost:3000/api/leads'));
      expect(unauthRes.status).toBe(401);

      // Tampered JWT token
      const tamperedRes = await getLeadsRoute(
        makeRequest('http://localhost:3000/api/leads', {
          token: `${devA.token}tampered`,
        })
      );
      expect(tamperedRes.status).toBe(401);

      // Suspended user with otherwise valid JWT signature is denied access
      const suspendedRes = await getLeadsRoute(
        makeRequest('http://localhost:3000/api/leads', {
          token: suspendedDev.token,
        })
      );
      expect(suspendedRes.status).toBe(401);
    });

    it('never exposes passwordHash in login or admin user update responses', async () => {
      const loginRes = await loginPost(
        makeRequest('http://localhost:3000/api/auth/login', {
          method: 'POST',
          body: { email: devA.email, password: 'StrongPass!2026' },
        })
      );
      expect(loginRes.status).toBe(200);
      const loginBody = await loginRes.json();
      expect(loginBody.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(loginBody)).not.toContain('$2a$');
      expect(JSON.stringify(loginBody)).not.toContain('$2b$');

      // PATCH /api/admin/users must also strip passwordHash
      const patchRes = await patchAdminUsersRoute(
        makeRequest('http://localhost:3000/api/admin/users', {
          method: 'PATCH',
          token: adminUser.token,
          body: { userId: devA.id, status: 'ACTIVE', planId: proPlanId, credits: 50 },
        })
      );
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.user).toBeDefined();
      expect(patchData.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(patchData)).not.toContain('passwordHash');
    });
  });

  // ==========================================================================
  // 2. AUTHORIZATION, RBAC, IDOR & LEAD PRIVACY PROTECTION
  // ==========================================================================
  describe('2. Authorization, RBAC, IDOR & Lead Contact Privacy', () => {
    let privateLeadId: string;

    beforeAll(async () => {
      const lead = await prisma.lead.create({
        data: {
          businessName: 'عيادة النيل التخصصية',
          normalizedName: 'عياده النيل التخصصيه',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          area: 'المعادي',
          address: '15 شارع التسعين الجنوبي، المعادي، القاهرة',
          phone: '+201011223344',
          normalizedPhone: '+201011223344',
          hasPhone: true,
          email: 'contact@nile-dental-clinic.eg',
          normalizedEmail: 'contact@nile-dental-clinic.eg',
          hasEmail: true,
          website: 'https://nile-dental-clinic.eg',
          normalizedDomain: 'nile-dental-clinic.eg',
          facebook: 'https://facebook.com/niledental',
          hasFacebook: true,
          instagram: 'https://instagram.com/niledental',
          hasInstagram: true,
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          accessType: 'SHARED',
          leadType: 'SHARED',
          maxPurchasers: 3,
          currentPurchasers: 0,
          score: 85,
          temperature: 'HOT',
          qualityScore: 88,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
        },
      });
      privateLeadId = lead.id;
    });

    it('blocks non-admin developers from all /api/admin/** endpoints (403 FORBIDDEN)', async () => {
      const adminUsersRes = await getAdminUsersRoute(
        makeRequest('http://localhost:3000/api/admin/users', { token: devA.token })
      );
      expect(adminUsersRes.status).toBe(403);

      const adminLeadsRes = await getAdminLeadsRoute(
        makeRequest('http://localhost:3000/api/admin/leads', { token: devA.token })
      );
      expect(adminLeadsRes.status).toBe(403);

      const adminObsRes = await adminObservabilityGet(
        makeRequest('http://localhost:3000/api/admin/observability', { token: devA.token })
      );
      expect(adminObsRes.status).toBe(403);

      const adminExportRes = await adminAnalyticsExportGet(
        makeRequest('http://localhost:3000/api/admin/analytics/export?report=overview', {
          token: devA.token,
        })
      );
      expect(adminExportRes.status).toBe(403);
    });

    it('prevents IDOR across developer matching explanations and blocks non-admin GET snapshot persistence', async () => {
      // Dev A tries to view Dev B's match explanation -> 403
      const idorRes = await getPairMatchRoute(
        makeRequest(
          `http://localhost:3000/api/matching/leads/${privateLeadId}/developers/${devB.id}`,
          { token: devA.token }
        ),
        { params: { leadId: privateLeadId, developerId: devB.id } }
      );
      expect(idorRes.status).toBe(403);

      // Dev A queries own match with ?persist=true -> 200 OK, but snapshot is NOT persisted by non-admin GET
      await prisma.matchSnapshot.deleteMany({
        where: { leadId: privateLeadId, developerId: devA.id },
      });
      const selfRes = await getPairMatchRoute(
        makeRequest(
          `http://localhost:3000/api/matching/leads/${privateLeadId}/developers/${devA.id}?persist=true`,
          { token: devA.token }
        ),
        { params: { leadId: privateLeadId, developerId: devA.id } }
      );
      expect(selfRes.status).toBe(200);
      const countAfterDevGet = await prisma.matchSnapshot.count({
        where: { leadId: privateLeadId, developerId: devA.id },
      });
      expect(countAfterDevGet).toBe(0);
    });

    it('masks all sensitive contact fields on unclaimed leads and reveals them only to the claiming developer', async () => {
      // Before claiming: Dev A sees masked contact data
      const beforeRes = await getLeadDetailRoute(
        makeRequest(`http://localhost:3000/api/leads/${privateLeadId}`, { token: devA.token }),
        { params: { id: privateLeadId } }
      );
      expect(beforeRes.status).toBe(200);
      const beforeData = await beforeRes.json();
      expect(beforeData.lead.isClaimedByMe).toBe(false);
      expect(beforeData.lead.phone).not.toBe('+201011223344');
      expect(beforeData.lead.phone).toContain('*');
      expect(beforeData.lead.email).not.toBe('contact@nile-dental-clinic.eg');
      expect(beforeData.lead.address).toBeNull();
      expect(beforeData.lead.facebook).not.toBe('https://facebook.com/niledental');
      expect(beforeData.lead.instagram).not.toBe('https://instagram.com/niledental');

      // Dev A claims the lead
      const claimRes = await claimLeadRoute(
        makeRequest(`http://localhost:3000/api/leads/${privateLeadId}/claim`, {
          method: 'POST',
          token: devA.token,
          headers: { 'Idempotency-Key': 'p9-privacy-claim-deva' },
        }),
        { params: { id: privateLeadId } }
      );
      expect(claimRes.status).toBe(200);

      // After claiming: Dev A sees unmasked contact data
      const afterDevARes = await getLeadDetailRoute(
        makeRequest(`http://localhost:3000/api/leads/${privateLeadId}`, { token: devA.token }),
        { params: { id: privateLeadId } }
      );
      const afterDevAData = await afterDevARes.json();
      expect(afterDevAData.lead.isClaimedByMe).toBe(true);
      expect(afterDevAData.lead.phone).toBe('+201011223344');
      expect(afterDevAData.lead.email).toBe('contact@nile-dental-clinic.eg');
      expect(afterDevAData.lead.address).toBe('15 شارع التسعين الجنوبي، المعادي، القاهرة');
      expect(afterDevAData.lead.facebook).toBe('https://facebook.com/niledental');

      // Meanwhile, Dev B (who has NOT claimed this lead) STILL receives masked contact data!
      const devBRes = await getLeadDetailRoute(
        makeRequest(`http://localhost:3000/api/leads/${privateLeadId}`, { token: devB.token }),
        { params: { id: privateLeadId } }
      );
      const devBData = await devBRes.json();
      expect(devBData.lead.isClaimedByMe).toBe(false);
      expect(devBData.lead.phone).not.toBe('+201011223344');
      expect(devBData.lead.address).toBeNull();
      expect(devBData.lead.facebook).not.toBe('https://facebook.com/niledental');
    });
  });

  // ==========================================================================
  // 3. CSRF, CORS, CSP & SECURITY HEADERS TESTS
  // ==========================================================================
  describe('3. CSRF, CORS, CSP & Security Headers', () => {
    it('enforces CSRF Origin and Referer verification across state-changing endpoints', async () => {
      // Cross-origin Origin header -> blocked
      const crossOriginReq = makeRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'https://evil-attacker.example.com',
        },
      });
      expect(verifyCsrfOrigin(crossOriginReq)).toBe(false);
      const logoutBlocked = await logoutPost(crossOriginReq);
      expect(logoutBlocked.status).toBe(403);

      // Origin: null -> blocked
      const nullOriginReq = makeRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'null',
        },
      });
      expect(verifyCsrfOrigin(nullOriginReq)).toBe(false);

      // Missing Origin but cross-origin Referer -> blocked
      const evilRefererReq = makeRequest('http://localhost:3000/api/admin/quality', {
        method: 'PATCH',
        token: adminUser.token,
        headers: {
          Host: 'localhost:3000',
          Referer: 'https://evil-attacker.example.com/csrf-exploit.html',
        },
        body: { minSaleableQualityScore: 10 },
      });
      expect(verifyCsrfOrigin(evilRefererReq)).toBe(false);
      const patchQualityBlocked = await adminQualityPatch(evilRefererReq);
      expect(patchQualityBlocked.status).toBe(403);

      // Cross-origin POST to /api/leads/[id]/verification and /api/admin/quality/verify-batch -> blocked
      const verifyBlocked = await verifyLeadRoute(
        makeRequest('http://localhost:3000/api/leads/any-id/verification', {
          method: 'POST',
          token: adminUser.token,
          headers: { Host: 'localhost:3000', Origin: 'https://phishing.site' },
        }),
        { params: { id: 'any-id' } }
      );
      expect(verifyBlocked.status).toBe(403);

      const batchVerifyBlocked = await adminVerifyBatchPost(
        makeRequest('http://localhost:3000/api/admin/quality/verify-batch', {
          method: 'POST',
          token: adminUser.token,
          headers: { Host: 'localhost:3000', Origin: 'https://phishing.site' },
        })
      );
      expect(batchVerifyBlocked.status).toBe(403);

      // Same-origin Origin header -> allowed
      const sameOriginReq = makeRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
        },
      });
      expect(verifyCsrfOrigin(sameOriginReq)).toBe(true);
      const logoutOk = await logoutPost(sameOriginReq);
      expect(logoutOk.status).toBe(200);
    });

    it('applies CSP, HSTS, X-Frame-Options, nosniff, and correlation X-Request-Id headers and validates CORS strictly', async () => {
      const liveRes = await healthLiveGet(
        makeRequest('http://localhost:3000/api/health/live', {
          headers: { 'X-Request-Id': 'req_custom_corr_99' },
        })
      );
      expect(liveRes.status).toBe(200);
      expect(liveRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(liveRes.headers.get('X-Frame-Options')).toBe('DENY');
      expect(liveRes.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(liveRes.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(liveRes.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(liveRes.headers.get('Strict-Transport-Security')).toContain('max-age=63072000');
      expect(liveRes.headers.get('X-Request-Id')).toBe('req_custom_corr_99');

      // CORS validation: blocks wildcard, null, and untrusted origins
      expect(validateCorsOrigin('*', 'localhost:3000').allowed).toBe(false);
      expect(validateCorsOrigin('null', 'localhost:3000').allowed).toBe(false);
      expect(validateCorsOrigin('https://evil.org', 'localhost:3000').allowed).toBe(false);
      expect(validateCorsOrigin('http://localhost:3000', 'localhost:3000')).toEqual({
        allowed: true,
        allowedOrigin: 'http://localhost:3000',
      });

      const corsHeaders = buildCorsHeaders('http://localhost:3000', 'localhost:3000');
      expect(corsHeaders['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      expect(corsHeaders['Access-Control-Allow-Origin']).not.toBe('*');
    });
  });

  // ==========================================================================
  // 4. INPUT VALIDATION, MASS ASSIGNMENT, SQLi, UPLOAD & CSV INJECTION TESTS
  // ==========================================================================
  describe('4. Input Validation, Mass Assignment, SQLi, File Upload & CSV Injection', () => {
    it('rejects invalid enum filters on admin endpoints and safely handles SQL injection payloads', async () => {
      const badLeadFilter = await getAdminLeadsRoute(
        makeRequest('http://localhost:3000/api/admin/leads?status=INVALID_ENUM_VALUE', {
          token: adminUser.token,
        })
      );
      expect(badLeadFilter.status).toBe(400);

      const badUserFilter = await getAdminUsersRoute(
        makeRequest('http://localhost:3000/api/admin/users?role=SUPER_ROOT', {
          token: adminUser.token,
        })
      );
      expect(badUserFilter.status).toBe(400);

      // SQL injection payload in search query is safely parameterized by Prisma
      const sqliSearch = await getAdminLeadsRoute(
        makeRequest(
          `http://localhost:3000/api/admin/leads?search=${encodeURIComponent(
            "' OR 1=1; DROP TABLE \"Lead\"; --"
          )}`,
          { token: adminUser.token }
        )
      );
      expect(sqliSearch.status).toBe(200);
      const leadCountAfterSqli = await prisma.lead.count();
      expect(leadCountAfterSqli).toBeGreaterThan(0);
    });

    it('prevents mass assignment of privileged fields on developer profile updates', async () => {
      const check = detectForbiddenFieldsInPayload(
        {
          companyName: 'Safe Update Co',
          role: 'ADMIN',
          balance: 999999,
          passwordHash: 'hacked',
        },
        ['companyName', 'bio', 'services']
      );
      expect(check.hasForbiddenFields).toBe(true);
      expect(check.forbiddenFields).toEqual(['role', 'balance', 'passwordHash']);

      // Attempt mass assignment on PATCH /api/developer/profile
      const res = await updateDeveloperProfileRoute(
        makeRequest('http://localhost:3000/api/developer/profile', {
          method: 'PATCH',
          token: devA.token,
          body: {
            companyName: 'Alpha Digital Updated',
            role: 'ADMIN',
            balance: 1000000,
          },
        })
      );
      expect(res.status).toBe(200);

      const dbUser = await prisma.user.findUnique({ where: { id: devA.id } });
      expect(dbUser?.role).toBe('DEVELOPER');
      const creditAcc = await ensureDeveloperCreditAccount(prisma, devA.id);
      expect(creditAcc.balance).toBeLessThan(1000000);
    });

    it('blocks executable/script file uploads, path traversal, and neutralizes CSV formula injection on import and export', async () => {
      // Block .exe upload
      expect(() =>
        validateImportUploadSafety({ fileName: 'malware.exe', payloadBytes: 100 })
      ).toThrow(AppSecurityError);

      // Block double extension .csv.js or .svg
      expect(() =>
        validateImportUploadSafety({ fileName: 'leads.js.csv', payloadBytes: 100 })
      ).toThrow(AppSecurityError);

      // Block path traversal
      expect(() =>
        validateImportUploadSafety({ fileName: '../../etc/passwd.csv', payloadBytes: 100 })
      ).toThrow(AppSecurityError);

      // Block oversized payload (> 5MB)
      expect(() =>
        validateImportUploadSafety({
          fileName: 'huge.csv',
          payloadBytes: 6 * 1024 * 1024,
        })
      ).toThrow(AppSecurityError);

      // POST /api/admin/import rejects .exe fileName
      const badImportRes = await adminImportPost(
        makeRequest('http://localhost:3000/api/admin/import', {
          method: 'POST',
          token: adminUser.token,
          body: {
            fileName: 'exploit.exe',
            csvContent: 'businessName,phone,city,category\nTest,+201012345678,القاهرة,Dental',
          },
        })
      );
      expect(badImportRes.status).toBe(400);

      // Formula injection sanitization on import & export
      expect(sanitizeSpreadsheetFormula("=CMD|' /C calc'!A0")).not.toMatch(/^[=+\-@]/);
      expect(sanitizeSpreadsheetFormula('+201012345678')).toBe('+201012345678');

      expect(sanitizeCsvExportCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvExportCell('=HYPERLINK("http://evil.com")')).toBe(
        '"\'=HYPERLINK(""http://evil.com"")"'
      );
      expect(sanitizeCsvExportCell('\t=1+1')).toBe("'\t=1+1");
      expect(sanitizeCsvExportCell('  @SUM(1)')).toBe("'  @SUM(1)");
      expect(sanitizeCsvExportCell('  @SUM(1,2)')).toBe('"\'  @SUM(1,2)"');

      // Verify analytics CSV export escapes dangerous prefixes if a lead has a formula-like name
      await prisma.lead.create({
        data: {
          businessName: '=SUM(10,20) Clinic',
          normalizedName: 'sum 10 20 clinic',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201055544433',
          normalizedPhone: '+201055544433',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
        },
      });
      const exported = await exportAnalyticsDatasetToCsv('leads', {}, adminUser.id);
      expect(exported.csv).toContain("'=SUM(10,20) Clinic");
    });
  });

  // ==========================================================================
  // 5. SSRF, DNS REBINDING, & REDIRECT REVALIDATION TESTS
  // ==========================================================================
  describe('5. SSRF, DNS Rebinding, & Redirect Revalidation', () => {
    it('blocks localhost, private IPv4/IPv6 ranges, cloud metadata IPs, and non-HTTP schemes', () => {
      const blockedUrls = [
        'http://127.0.0.1:8080/admin',
        'http://localhost:3000/api/admin/users',
        'http://0.0.0.0/',
        'http://10.0.0.1/internal',
        'http://172.16.0.5/secret',
        'http://172.31.255.255/',
        'http://192.168.1.1/router',
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        'http://100.100.100.200/latest/meta-data/',
        'http://[::1]:8080/',
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:169.254.169.254]/',
        'http://[fe80::1]/',
        'http://[fc00::1]/',
        'http://redis:6379/',
        'http://internal.service.local/',
        'file:///etc/passwd',
        'ftp://files.example.com/dump.sql',
        'gopher://127.0.0.1:6379/_INFO',
      ];

      for (const unsafeUrl of blockedUrls) {
        expect(() => assertSafeExternalUrl(unsafeUrl)).toThrow(/SSRF|protocol|internal|blocked/i);
      }

      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
    });

    it('blocks DNS rebinding attacks when a public hostname resolves to a private or metadata IP', async () => {
      await expect(
        assertSafeExternalUrlWithDns('https://rebind-attack.example.com/feed', {
          dnsLookup: async () => [{ address: '169.254.169.254', family: 4 }],
        })
      ).rejects.toThrow(/SSRF protection blocked DNS resolution/i);

      await expect(
        assertSafeExternalUrlWithDns('https://rebind-ipv6.example.com/feed', {
          dnsLookup: async () => [{ address: '::1', family: 6 }],
        })
      ).rejects.toThrow(/SSRF protection blocked DNS resolution/i);

      // Safe public IP resolution succeeds
      const safeUrl = await assertSafeExternalUrlWithDns('https://safe-clinic.example.com/about', {
        dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
      });
      expect(safeUrl).toBe('https://safe-clinic.example.com/about');
    });

    it('blocks redirect-based SSRF on every hop in safeExternalFetch, analyzeWebsiteUrl, and verifyWebsiteHttpWithTimeout', async () => {
      // Redirect hop from safe public domain -> 169.254.169.254 metadata endpoint
      await expect(
        safeExternalFetch('https://public-site.example.com/start', {
          dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
          fetchImpl: async () =>
            new Response(null, {
              status: 302,
              headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
            }),
        })
      ).rejects.toThrow(/SSRF/i);

      // analyzeWebsiteUrl with allowNetwork: true blocks SSRF
      await expect(
        analyzeWebsiteUrl('http://169.254.169.254/latest/meta-data/', { allowNetwork: true })
      ).rejects.toThrow(/SSRF/i);

      // verifyWebsiteHttpWithTimeout blocks SSRF before calling fetchImpl
      let fetchCalled = false;
      const probeRes = await verifyWebsiteHttpWithTimeout(
        'http://127.0.0.1:9000/internal',
        2000,
        async () => {
          fetchCalled = true;
          return new Response('ok', { status: 200 });
        }
      );
      expect(fetchCalled).toBe(false);
      expect(probeRes.reachable).toBe(false);
      expect(probeRes.errorType).toBe('PERMANENT_FAILURE');
      expect(probeRes.errorMessage).toContain('SSRF_BLOCKED');
    });
  });

  // ==========================================================================
  // 6. ERROR TAXONOMY, SECRET REDACTION & LOG SANITIZATION TESTS
  // ==========================================================================
  describe('6. Error Taxonomy, Secret Redaction & Log Sanitization', () => {
    it('redacts passwords, tokens, API keys, SQL statements, connection strings, and file paths from errors and logs', async () => {
      const rawDirty = {
        userId: 'u-1',
        password: 'PlainPassword123!',
        passwordHash: '$2a$10$abcdefg',
        apiKey: 'sk_live_9988776655',
        jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        dbError: 'postgres://admin:supersecret@db.internal:5432/leadforge failed at C:\\Users\\saifh\\Desktop\\LeadForge Egypt\\src\\lib\\db.ts',
        stack: 'Error: boom\n    at Object.<anonymous> (C:\\Users\\saifh\\Desktop\\LeadForge Egypt\\src\\lib\\db.ts:40:12)',
      };

      const sanitized = redactSensitiveData(rawDirty) as Record<string, unknown>;
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.passwordHash).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.jwtToken).toBe('[REDACTED]');
      expect(sanitized.stack).toBeUndefined();
      expect(String(sanitized.dbError)).toContain('[REDACTED_URI]');
      expect(String(sanitized.dbError)).toContain('[REDACTED_PATH]');
      expect(String(sanitized.dbError)).not.toContain('supersecret');

      // SQL error is scrubbed in safe API error responses
      const sqlError = new Error(
        'Invalid `prisma.user.findUnique()` invocation: SELECT "id", "passwordHash" FROM "User" WHERE "email" = $1'
      );
      const errRes = createSafeErrorResponse(sqlError, {
        defaultMessage: 'Internal system error',
        requestId: 'req_test_safe_err',
      });
      expect(errRes.status).toBe(500);
      const errBody = await errRes.json();
      expect(errBody.standardCode).toBe('INTERNAL_ERROR');
      expect(errBody.requestId).toBe('req_test_safe_err');
      expect(JSON.stringify(errBody)).not.toContain('SELECT');
      expect(JSON.stringify(errBody)).not.toContain('passwordHash');

      // Structured logger redacts sensitive fields automatically
      const logEntry = logStructured({
        level: 'SECURITY',
        event: 'TEST_REDACTION',
        requestId: getOrGenerateRequestId({ 'x-request-id': 'req_corr_1234' }),
        metadata: {
          secretKey: 'top-secret-value',
          normalField: 'visible',
        },
      });
      expect(logEntry.requestId).toBe('req_corr_1234');
      expect(logEntry.metadata?.secretKey).toBe('[REDACTED]');
      expect(logEntry.metadata?.normalField).toBe('visible');
      expect(getRecentStructuredLogs({ requestId: 'req_corr_1234' })).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 7. LAYERED RATE LIMITING & DETERMINISTIC ABUSE DETECTION TESTS
  // ==========================================================================
  describe('7. Layered Rate Limiting & Deterministic Abuse Protection', () => {
    it('flags REPEATED_AUTH_FAILURES deterministically without permanently banning the account', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await loginPost(
          makeRequest('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.55' },
            body: { email: devA.email, password: `WrongPass_${i}` },
          })
        );
        expect(res.status).toBe(401);
      }

      const flags = getFlaggedAbuseSignals();
      expect(flags.some((f) => f.signalType === 'REPEATED_AUTH_FAILURES')).toBe(true);

      // Account is NOT permanently auto-banned: valid login from another IP or within limit still works
      const validLogin = await loginPost(
        makeRequest('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.56' },
          body: { email: devA.email, password: 'StrongPass!2026' },
        })
      );
      expect(validLogin.status).toBe(200);
    });
  });

  // ==========================================================================
  // 8. CONCURRENCY & LOAD TESTS (Section 42 — Mandatory 5 Race Tests)
  // ==========================================================================
  describe('8. Concurrency & Race-Condition Load Tests', () => {
    it('Test 1 — Exclusive Lead Race Test: 20 developers concurrently claim the same EXCLUSIVE lead -> 1 succeeds, 19 fail cleanly, 1 claim row, 1 credit deduction', async () => {
      const exclusiveLead = await prisma.lead.create({
        data: {
          businessName: 'مستشفى الصفوة التخصصي',
          normalizedName: 'مستشفي الصفوه التخصصي',
          category: 'Medical',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201099001122',
          normalizedPhone: '+201099001122',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          accessType: 'EXCLUSIVE',
          leadType: 'EXCLUSIVE',
          maxPurchasers: 1,
          currentPurchasers: 0,
          creditCost: 10,
          score: 92,
          temperature: 'PREMIUM',
          qualityScore: 90,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
        },
      });

      const passwordHash = await hashPassword('RaceTest!2026');
      const racers = await Promise.all(
        Array.from({ length: 20 }, async (_, idx) => {
          const u = await prisma.user.create({
            data: {
              name: `Racer Exclusive ${idx}`,
              email: `racer-excl-${idx}-${Date.now()}@leadforge.eg`,
              passwordHash,
              emailVerified: new Date(),
              role: 'DEVELOPER',
              status: 'ACTIVE',
              developerProfile: {
                create: {
                  companyName: `Exclusive Racer Co ${idx}`,
                  services: ['Website Development'],
                  niches: ['Medical', 'Dental', 'Restaurant'],
                  locations: ['القاهرة'],
                  allLocationsMode: true,
                  allNichesMode: true,
                  leadType: 'BOTH',
                  isActive: true,
                  isAcceptingLeads: true,
                  isVerified: true,
                },
              },
              subscription: {
                create: {
                  planId: proPlanId,
                  status: 'ACTIVE',
                  credits: 30,
                  totalCreditsGranted: 30,
                  creditsUsed: 0,
                  currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
                },
              },
            },
          });
          await ensureDeveloperCreditAccount(prisma, u.id);
          return u;
        })
      );

      const outcomes = await Promise.allSettled(
        racers.map((racer) =>
          claimLead({
            leadId: exclusiveLead.id,
            developerId: racer.id,
          })
        )
      );

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(19);

      const activeClaims = await prisma.leadClaim.findMany({
        where: { leadId: exclusiveLead.id, status: 'ACTIVE' },
      });
      expect(activeClaims).toHaveLength(1);

      const claimTxCount = await prisma.creditTransaction.count({
        where: { leadId: exclusiveLead.id, type: 'CLAIM' },
      });
      expect(claimTxCount).toBe(1);
    });

    it('Test 2 — Shared Lead Limit Race Test: maxPurchasers = 3 with 20 concurrent claims -> 3 succeed, 17 fail cleanly', async () => {
      const sharedLead = await prisma.lead.create({
        data: {
          businessName: 'مجموعة مطاعم الشرق',
          normalizedName: 'مجموعه مطاعم الشرق',
          category: 'Restaurant',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201088776655',
          normalizedPhone: '+201088776655',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          accessType: 'SHARED',
          leadType: 'SHARED',
          maxPurchasers: 3,
          currentPurchasers: 0,
          creditCost: 5,
          score: 80,
          temperature: 'HOT',
          qualityScore: 85,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
        },
      });

      const passwordHash = await hashPassword('RaceShared!2026');
      const racers = await Promise.all(
        Array.from({ length: 20 }, async (_, idx) => {
          const u = await prisma.user.create({
            data: {
              name: `Racer Shared ${idx}`,
              email: `racer-shared-${idx}-${Date.now()}@leadforge.eg`,
              passwordHash,
              emailVerified: new Date(),
              role: 'DEVELOPER',
              status: 'ACTIVE',
              developerProfile: {
                create: {
                  companyName: `Shared Racer Co ${idx}`,
                  services: ['Website Development'],
                  niches: ['Restaurant', 'Dental', 'Medical'],
                  locations: ['القاهرة'],
                  allLocationsMode: true,
                  allNichesMode: true,
                  leadType: 'BOTH',
                  isActive: true,
                  isAcceptingLeads: true,
                  isVerified: true,
                },
              },
              subscription: {
                create: {
                  planId: proPlanId,
                  status: 'ACTIVE',
                  credits: 20,
                  totalCreditsGranted: 20,
                  creditsUsed: 0,
                  currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
                },
              },
            },
          });
          await ensureDeveloperCreditAccount(prisma, u.id);
          return u;
        })
      );

      const outcomes = await Promise.allSettled(
        racers.map((racer) =>
          claimLead({
            leadId: sharedLead.id,
            developerId: racer.id,
          })
        )
      );

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(17);

      const updatedLead = await prisma.lead.findUnique({ where: { id: sharedLead.id } });
      expect(updatedLead?.currentPurchasers).toBe(3);
      expect(updatedLead?.availableForClaim).toBe(false);
    });

    it('Test 3 — Credit Balance Race Test: 1 developer with credits for only 1 claim (5 credits) sends 10 concurrent claim requests -> at most 1 succeeds, balance never goes negative', async () => {
      const passwordHash = await hashPassword('SingleCredit!2026');
      const singleCreditDev = await prisma.user.create({
        data: {
          name: 'Low Balance Dev',
          email: `low-balance-${Date.now()}@leadforge.eg`,
          passwordHash,
          emailVerified: new Date(),
          role: 'DEVELOPER',
          status: 'ACTIVE',
          developerProfile: {
            create: {
              companyName: 'Low Balance Tech',
              services: ['Website Development'],
              niches: ['Dental', 'Medical', 'Restaurant'],
              locations: ['القاهرة'],
              allLocationsMode: true,
              allNichesMode: true,
              leadType: 'BOTH',
              isActive: true,
              isAcceptingLeads: true,
              isVerified: true,
            },
          },
          subscription: {
            create: {
              planId: proPlanId,
              status: 'ACTIVE',
              credits: 5,
              totalCreditsGranted: 5,
              creditsUsed: 0,
              currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
            },
          },
        },
      });
      await ensureDeveloperCreditAccount(prisma, singleCreditDev.id);

      const targetLeads = await Promise.all(
        Array.from({ length: 10 }, (_, idx) =>
          prisma.lead.create({
            data: {
              businessName: `عيادة اختبار الرصيد ${idx}`,
              normalizedName: `عياده اختبار الرصيد ${idx}`,
              category: 'Dental',
              governorate: 'القاهرة',
              city: 'القاهرة',
              phone: `+20107766554${idx}`,
              normalizedPhone: `+20107766554${idx}`,
              status: 'AVAILABLE',
              saleabilityStatus: 'AVAILABLE',
              availableForClaim: true,
              requiresMatching: false,
              accessType: 'SHARED',
              leadType: 'SHARED',
              maxPurchasers: 3,
              currentPurchasers: 0,
              creditCost: 5,
              score: 75,
              temperature: 'WARM',
              qualityScore: 80,
              qualityStatus: 'HIGH',
              freshnessStatus: 'FRESH',
              verificationStatus: 'VERIFIED',
            },
          })
        )
      );

      const outcomes = await Promise.allSettled(
        targetLeads.map((lead) =>
          claimLead({
            leadId: lead.id,
            developerId: singleCreditDev.id,
          })
        )
      );

      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);

      const reconciliation = await reconcileCreditAccount(singleCreditDev.id, prisma);
      expect(reconciliation.currentBalance).toBe(0);
      expect(reconciliation.currentBalance).toBeGreaterThanOrEqual(0);
      expect(reconciliation.isReconciled).toBe(true);
    });

    it('Test 4 — Deduplication Concurrency Test: 10 concurrent imports of the same business -> 1 canonical lead, zero duplicate explosion', async () => {
      const sharedPhone = '+201066554433';
      const concurrentRuns = await Promise.all(
        Array.from({ length: 10 }, (_, idx) =>
          runIngestionPipeline({
            prisma,
            userId: adminUser.id,
            sourceName: `ConcurrentImport_${idx}`,
            sourceType: 'MANUAL',
            triggerType: 'MANUAL',
            rawRecords: [
              {
                businessName: 'مركز النور للأسنان',
                category: 'Dental',
                governorate: 'القاهرة',
                city: 'القاهرة',
                phone: sharedPhone,
                externalId: `ext-dedup-race-${idx}`,
              },
            ],
          })
        )
      );

      expect(concurrentRuns).toHaveLength(10);
      const canonicalLeads = await prisma.lead.findMany({
        where: { normalizedPhone: '201066554433', isCanonical: true },
      });
      expect(canonicalLeads).toHaveLength(1);
    });

    it('Test 5 — Refund Idempotency Concurrency Test: 10 concurrent refund calls for the same claim -> refunded once, credits restored once', async () => {
      const refundableLead = await prisma.lead.create({
        data: {
          businessName: 'مركز استرداد الرصيد',
          normalizedName: 'مركز استرداد الرصيد',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201044332211',
          normalizedPhone: '+201044332211',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          accessType: 'SHARED',
          leadType: 'SHARED',
          maxPurchasers: 3,
          currentPurchasers: 0,
          creditCost: 5,
          score: 80,
          temperature: 'HOT',
          qualityScore: 85,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
        },
      });

      const claimResult = await claimLead({
        leadId: refundableLead.id,
        developerId: devB.id,
      });

      const balanceBeforeRefund = (await reconcileCreditAccount(devB.id, prisma)).currentBalance;

      const refundOutcomes = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          refundClaim({
            claimId: claimResult.claimId,
            reason: 'Concurrent refund race test',
            refundedBy: adminUser.id,
            idempotencyKey: `refund-idem-${claimResult.claimId}`,
          })
        )
      );

      const fulfilledRefunds = refundOutcomes.filter((o) => o.status === 'fulfilled');
      expect(fulfilledRefunds.length).toBeGreaterThanOrEqual(1);

      const refundTxCount = await prisma.creditTransaction.count({
        where: { claimId: claimResult.claimId, type: 'REFUND' },
      });
      expect(refundTxCount).toBe(1);

      const afterReconcile = await reconcileCreditAccount(devB.id, prisma);
      expect(afterReconcile.currentBalance).toBe(balanceBeforeRefund + claimResult.creditsCharged);
      expect(afterReconcile.isReconciled).toBe(true);
    });
  });

  // ==========================================================================
  // 9. CACHE TENANT ISOLATION, N+1 PREVENTION & SLOW QUERY DETECTION TESTS
  // ==========================================================================
  describe('9. Cache Tenant Isolation, Batch Reconciliation & Slow Query Detection', () => {
    it('strictly isolates tenant cache entries so Developer A cannot read Developer B or ADMIN cache entries', () => {
      globalAppCache.setForTenant(devA.id, 'analytics', 'summary', {
        secretPipelineValue: 150000,
        owner: devA.id,
      });
      globalAppCache.setAdmin('revenue', 'global', { totalCashEgp: 950000 });

      // Dev A reads own cached data -> hit
      const devAData = globalAppCache.getForTenant<{ secretPipelineValue: number }>(
        devA.id,
        'analytics',
        'summary'
      );
      expect(devAData?.secretPipelineValue).toBe(150000);

      // Dev B queries same namespace/subKey -> miss (null)
      const devBMiss = globalAppCache.getForTenant(devB.id, 'analytics', 'summary');
      expect(devBMiss).toBeNull();

      // Dev B attempts raw key access to Dev A's key -> 403 FORBIDDEN
      expect(() =>
        globalAppCache.getRawEntryWithTenantCheck(`TENANT:${devA.id}:analytics:summary`, {
          role: 'DEVELOPER',
          userId: devB.id,
        })
      ).toThrow(AppSecurityError);

      // Dev A attempts raw key access to ADMIN cache key -> 403 FORBIDDEN
      expect(() =>
        globalAppCache.getRawEntryWithTenantCheck('ADMIN:revenue:global', {
          role: 'DEVELOPER',
          userId: devA.id,
        })
      ).toThrow(AppSecurityError);

      const stats = globalAppCache.getStats();
      expect(stats.tenantIsolationBlocks).toBe(2);
      expect(stats.hits).toBe(1);
    });

    it('detects slow queries and executes batch credit reconciliation without N+1 queries', async () => {
      await withSlowQueryTracking(
        'Lead.heavyAnalyticsScan',
        async () => {
          await new Promise((r) => setTimeout(r, 30));
          return 'done';
        },
        {
          model: 'Lead',
          customThresholdMs: 10,
          meta: { password: 'should-be-redacted', filter: 'canonical' },
        }
      );

      const slowQueries = getRecentSlowQueries();
      expect(slowQueries.length).toBeGreaterThanOrEqual(1);
      expect(slowQueries[0].operation).toBe('Lead.heavyAnalyticsScan');
      expect(slowQueries[0].sanitizedMeta?.password).toBe('[REDACTED]');

      // Verify batch credit overview reconciliation succeeds and reconciles all accounts
      const overview = await getAdminCreditsOverview({ page: 1, pageSize: 25 });
      expect(overview.allReconciled).toBe(true);
      expect(overview.accounts.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // 10. HEALTH CHECKS, GRACEFUL SHUTDOWN, DATA INTEGRITY & OBSERVABILITY TESTS
  // ==========================================================================
  describe('10. Health Checks, Graceful Shutdown, Data Integrity & Observability Dashboard', () => {
    it('passes all 7 deterministic Data Integrity Check categories on the live test database', async () => {
      const report = await runDataIntegrityChecks(prisma);
      expect(report.healthy).toBe(true);
      expect(report.totalViolations).toBe(0);
      expect(report.checks.orphanedSourceRecords.passed).toBe(true);
      expect(report.checks.orphanedClaims.passed).toBe(true);
      expect(report.checks.exclusiveLeadMultipleOwners.passed).toBe(true);
      expect(report.checks.creditLedgerInvariants.passed).toBe(true);
      expect(report.checks.crossTenantEngagements.passed).toBe(true);
      expect(report.checks.impossibleLifecycleStates.passed).toBe(true);
      expect(report.checks.orphanedCriticalRecords.passed).toBe(true);
    });

    it('supports Liveness (/api/health/live), Readiness (/api/health/ready), and Graceful Shutdown draining', async () => {
      const liveBefore = await healthLiveGet(
        makeRequest('http://localhost:3000/api/health/live')
      );
      expect(liveBefore.status).toBe(200);
      const liveBeforeBody = await liveBefore.json();
      expect(liveBeforeBody.status).toBe('ALIVE');

      const readyBefore = await healthReadyGet(
        makeRequest('http://localhost:3000/api/health/ready')
      );
      expect(readyBefore.status).toBe(200);
      const readyBeforeBody = await readyBefore.json();
      expect(readyBeforeBody.status).toBe('READY');
      expect(readyBeforeBody.components.database.status).toBe('HEALTHY');

      // Track an in-flight operation and initiate graceful shutdown
      let opCompleted = false;
      const inFlightPromise = trackActiveOperation('job-drain-test', async () => {
        await new Promise((r) => setTimeout(r, 40));
        opCompleted = true;
        return 'drained';
      });

      const shutdownResult = await initiateGracefulShutdown({
        drainTimeoutMs: 500,
        reason: 'Unit test shutdown verification',
      });
      await inFlightPromise;

      expect(opCompleted).toBe(true);
      expect(shutdownResult.drainedCleanly).toBe(true);
      expect(shutdownResult.remainingOperations).toBe(0);

      // While shutting down, liveness and readiness return 503 and new background jobs are rejected
      expect(evaluateLivenessCheck().alive).toBe(false);
      expect((await evaluateReadinessCheck(prisma)).ready).toBe(false);
      await expect(
        trackActiveOperation('rejected-job', async () => 'nope')
      ).rejects.toThrow(/shutting down/i);

      resetShutdownStateForTests();
    });

    it('exposes Admin Operational Observability Dashboard and evaluates configurable deterministic alerts', async () => {
      // Simulate elevated 5xx error metrics and a slow query to trigger deterministic alerts
      for (let i = 0; i < 6; i++) {
        recordHttpRequestMetric({
          route: '/api/test',
          method: 'GET',
          statusCode: 500,
          durationMs: 120,
        });
      }
      recordQueryExecution({
        operation: 'Test.slowOp',
        durationMs: 600,
        customThresholdMs: 100,
      });

      updateAlertThresholds({
        errorRatePctThreshold: 20,
        minRequestsForErrorRateAlert: 5,
        slowQueriesAlertThreshold: 1,
      });

      const alerts = evaluateOperationalAlerts({
        openCircuitSourcesCount: 1,
        deadLetterBacklogCount: 15,
      });
      const alertCodes = alerts.map((a) => a.code);
      expect(alertCodes).toContain('HIGH_ERROR_RATE');
      expect(alertCodes).toContain('SLOW_QUERY_SPIKE');
      expect(alertCodes).toContain('INGESTION_SOURCE_CIRCUIT_OPEN');
      expect(alertCodes).toContain('DEAD_LETTER_BACKLOG_GROWTH');

      // GET /api/admin/observability
      const obsGetRes = await adminObservabilityGet(
        makeRequest('http://localhost:3000/api/admin/observability', {
          token: adminUser.token,
        })
      );
      expect(obsGetRes.status).toBe(200);
      const obsData = await obsGetRes.json();
      expect(obsData.systemHealth.liveness.alive).toBe(true);
      expect(obsData.systemHealth.readiness.ready).toBe(true);
      expect(obsData.dataIntegrity.healthy).toBe(true);
      expect(obsData.alerts.activeAlerts.length).toBeGreaterThanOrEqual(1);

      // POST /api/admin/observability actions: RUN_INTEGRITY_CHECKS & CLEAR_CACHE
      const runIntegrityRes = await adminObservabilityPost(
        makeRequest('http://localhost:3000/api/admin/observability', {
          method: 'POST',
          token: adminUser.token,
          body: { action: 'RUN_INTEGRITY_CHECKS' },
        })
      );
      expect(runIntegrityRes.status).toBe(200);
      const runIntegrityBody = await runIntegrityRes.json();
      expect(runIntegrityBody.report.healthy).toBe(true);

      const clearCacheRes = await adminObservabilityPost(
        makeRequest('http://localhost:3000/api/admin/observability', {
          method: 'POST',
          token: adminUser.token,
          body: { action: 'CLEAR_CACHE' },
        })
      );
      expect(clearCacheRes.status).toBe(200);
    });

    it('blocks non-canonical SSRF IP representations (dotted-octal, dotted-hex, shorthand IPv4, IPv6 zone IDs, and NAT64)', () => {
      const nonCanonicalPrivateIps = [
        '0177.0.0.1',
        '0x7f.0.0.1',
        '010.0.0.1',
        '127.1',
        '10.1',
        '192.168.1',
        '2130706433',
        '0x7f000001',
        'fe80::1%eth0',
        '[fe80::1%25eth0]',
        '64:ff9b::127.0.0.1',
        '2001:db8::1',
        '::127.0.0.1',
        '::ffff:7f00:1',
      ];
      for (const ip of nonCanonicalPrivateIps) {
        expect(isPrivateOrReservedIp(ip)).toBe(true);
      }
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    });

    it('redacts sensitive fields in createAuditLog, /api/admin/reports, and getSafeClientErrorMessage', async () => {
      const audit = await createAuditLog(
        {
          userId: adminUser.id,
          action: 'SENSITIVE_AUDIT_TEST',
          entityType: 'SystemConfig',
          entityId: 'cfg-1',
          details: {
            apiKey: 'sk_live_secret_12345',
            passwordHash: '$2a$10$secret',
            webhookSecret: 'whsec_999',
            safeField: 'allowed-value',
          },
        },
        prisma
      );
      expect(audit).not.toBeNull();
      const storedDetails = audit?.details as Record<string, unknown>;
      expect(storedDetails.apiKey).toBe('[REDACTED]');
      expect(storedDetails.passwordHash).toBe('[REDACTED]');
      expect(storedDetails.webhookSecret).toBe('[REDACTED]');
      expect(storedDetails.safeField).toBe('allowed-value');

      // Verify /api/admin/reports also redacts recentAuditLogs
      const reportsRes = await adminReportsGet(
        makeRequest('http://localhost:3000/api/admin/reports', {
          token: adminUser.token,
        })
      );
      expect(reportsRes.status).toBe(200);
      const reportsBody = await reportsRes.json();
      expect(JSON.stringify(reportsBody.recentAuditLogs)).not.toContain('sk_live_secret_12345');

      // Verify getSafeClientErrorMessage hides SQL and Prisma internals while preserving domain errors
      const prismaSqlErr = new Error(
        'Invalid `prisma.plan.findUnique()` invocation: SELECT "id" FROM "Plan" WHERE "id" = $1'
      );
      expect(getSafeClientErrorMessage(prismaSqlErr, 'تعذر تفعيل الباقة.')).toBe(
        'تعذر تفعيل الباقة.'
      );
      const domainErr = new Error('الباقة المطلوبة غير متاحة حالياً.');
      expect(getSafeClientErrorMessage(domainErr, 'تعذر تفعيل الباقة.')).toBe(
        'الباقة المطلوبة غير متاحة حالياً.'
      );
    });

    it('validates AUTH_SECRET and JWT_SECRET consistently in production readiness check and initializes credit account on register', async () => {
      const prevNodeEnv = process.env.NODE_ENV;
      const prevAuthSecret = process.env.AUTH_SECRET;
      const prevJwtSecret = process.env.JWT_SECRET;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.AUTH_SECRET = DEFAULT_DEV_AUTH_SECRET;
        delete process.env.JWT_SECRET;

        expect(isProductionAuthSecretConfigured()).toBe(false);
        const unreadyReport = await evaluateReadinessCheck(prisma);
        expect(unreadyReport.ready).toBe(false);
        expect(unreadyReport.components.configuration.status).toBe('UNHEALTHY');

        // Setting AUTH_SECRET (without JWT_SECRET) satisfies production readiness
        process.env.AUTH_SECRET = 'production-grade-secret-key-at-least-32-bytes-long';
        expect(isProductionAuthSecretConfigured()).toBe(true);
        const readyWithAuthSecret = await evaluateReadinessCheck(prisma);
        expect(readyWithAuthSecret.ready).toBe(true);
        expect(readyWithAuthSecret.components.configuration.status).toBe('HEALTHY');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
        if (prevAuthSecret === undefined) delete process.env.AUTH_SECRET;
        else process.env.AUTH_SECRET = prevAuthSecret;
        if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = prevJwtSecret;
      }

      // Verify POST /api/auth/register initializes DeveloperCreditAccount immediately
      const regEmail = `new-phase9-dev-${Date.now()}@leadforge.eg`;
      const regRes = await registerPost(
        makeRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          body: {
            name: 'مطور جديد مرحلة 9',
            email: regEmail,
            password: 'StrongPassword!9',
            companyName: 'New Dev Studio',
          },
        })
      );
      expect(regRes.status).toBe(201);
      const regBody = await regRes.json();
      const creditAccount = await prisma.developerCreditAccount.findUnique({
        where: { developerId: regBody.user.id },
      });
      expect(creditAccount).not.toBeNull();
      expect(creditAccount?.balance).toBeGreaterThanOrEqual(0);

      // Verify GET /api/admin/plans caches in globalAppCache and PATCH invalidates it
      globalAppCache.resetStatsForTests();
      const plansRes1 = await adminPlansGet(
        makeRequest('http://localhost:3000/api/admin/plans', { token: adminUser.token })
      );
      expect(plansRes1.status).toBe(200);
      const plansRes2 = await adminPlansGet(
        makeRequest('http://localhost:3000/api/admin/plans', { token: adminUser.token })
      );
      expect(plansRes2.status).toBe(200);
      expect(globalAppCache.getStats().hits).toBeGreaterThanOrEqual(1);

      const patchPlanRes = await adminPlansPatch(
        makeRequest('http://localhost:3000/api/admin/plans', {
          method: 'PATCH',
          token: adminUser.token,
          body: {
            planId: proPlanId,
            priceEgp: 1600,
          },
        })
      );
      expect(patchPlanRes.status).toBe(200);
      expect(globalAppCache.getStats().invalidations).toBeGreaterThanOrEqual(1);
    });
  });
});

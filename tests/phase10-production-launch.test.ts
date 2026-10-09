import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import {
  hashPassword,
  resetRevokedSessionsForTesting,
  revokeAllSessions,
  revokeAllSessionsForUser,
  revokeSessionToken,
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth';
import { resetRateLimits } from '@/lib/rate-limit';
import { clearAbuseStateForTests } from '@/lib/security';
import {
  clearStructuredLogsForTests,
  globalAppCache,
  resetMetricsForTests,
  resetShutdownStateForTests,
  runDataIntegrityChecks,
} from '@/lib/observability';
import {
  assertProductionEnvironmentValid,
  assertSeedAllowedInEnvironment,
  auditCollectorProductionReadiness,
  classifySqlMigrationSafety,
  computeBackupChecksum,
  createLogicalBackupSnapshot,
  DISASTER_RECOVERY_TARGETS,
  evaluateProductionLaunchGate,
  executeScheduledWorkerJob,
  executeStagingRestoreVerification,
  exportDeveloperPersonalData,
  getFeatureFlagAuditHistory,
  getFeatureFlagsSnapshot,
  isFeatureFlagEnabled,
  PRODUCTION_API_INVENTORY,
  PRODUCTION_DATA_RETENTION_POLICIES,
  PRODUCTION_DATABASE_INVENTORY,
  PRODUCTION_SUBSYSTEM_INVENTORY,
  resetFeatureFlagsForTesting,
  resolveEnvironmentTier,
  runDatabaseProductionReadinessAudit,
  runProductionDataQualityGate,
  runProductionSmokeTests,
  setFeatureFlagOverride,
  validateEnvironmentConfiguration,
  WORKER_JOB_DEFINITIONS,
} from '@/lib/production';
import {
  DEFAULT_PLANS,
  processPaymentWebhookEvent,
  reconcilePaymentsWithLedger,
  signPaymentWebhookPayload,
  verifyPaymentWebhookSignature,
} from '@/lib/payment/provider';
import {
  createInAppNotification,
  dispatchTransactionalEmailSafe,
  sanitizeNotificationContent,
} from '@/lib/notifications';
import { seedDatabase } from '@/lib/seed-data';
import { runIngestionPipeline } from '@/lib/collectors';
import { claimLead } from '@/lib/claims';

// Route Handlers
import { POST as registerPost } from '@/app/api/auth/register/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import {
  GET as getDeveloperProfileRoute,
  PATCH as patchDeveloperProfileRoute,
  DELETE as deleteDeveloperProfileRoute,
} from '@/app/api/developer/profile/route';
import { GET as getDeveloperCreditsRoute } from '@/app/api/developer/credits/route';
import { GET as getDeveloperClaimsRoute } from '@/app/api/developer/claims/route';
import { GET as getDeveloperAnalyticsRoute } from '@/app/api/developer/analytics/route';
import { GET as getDeveloperEngagementsRoute } from '@/app/api/developer/engagements/route';
import { POST as subscribePost } from '@/app/api/subscription/route';
import { GET as getLeadsRoute } from '@/app/api/leads/route';
import { GET as getLeadDetailRoute } from '@/app/api/leads/[id]/route';
import { POST as claimLeadRoute } from '@/app/api/leads/[id]/claim/route';
import { POST as contactAttemptPost } from '@/app/api/leads/[id]/contact-attempts/route';
import { POST as engagementStatusPost } from '@/app/api/leads/[id]/engagement/status/route';
import { POST as feedbackPost } from '@/app/api/leads/[id]/feedback/route';
import { POST as paymentWebhookPost } from '@/app/api/webhooks/payment/route';
import { GET as healthRootGet } from '@/app/api/health/route';
import { GET as healthLiveGet } from '@/app/api/health/live/route';
import { GET as healthReadyGet } from '@/app/api/health/ready/route';
import {
  GET as adminObservabilityGet,
  POST as adminObservabilityPost,
} from '@/app/api/admin/observability/route';
import { GET as adminLeadsGet } from '@/app/api/admin/leads/route';
import { GET as adminQualityGet } from '@/app/api/admin/quality/route';
import { GET as adminIngestionHealthGet } from '@/app/api/admin/ingestion/health/route';
import { GET as adminMatchingRulesGet } from '@/app/api/admin/matching/rules/route';
import { GET as adminClaimsGet } from '@/app/api/admin/claims/route';
import { GET as adminCreditsGet } from '@/app/api/admin/credits/route';
import { GET as adminAnalyticsOverviewGet } from '@/app/api/admin/analytics/overview/route';
import { POST as adminAdjustCreditsPost } from '@/app/api/admin/developers/[developerId]/credits/adjust/route';
import { POST as adminImportPost } from '@/app/api/admin/import/route';

function makeRequest(
  url: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const headers: Record<string, string> = {
    Host: 'localhost:3000',
    Origin: 'http://localhost:3000',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.token ? { Cookie: `${SESSION_COOKIE_NAME}=${options.token}` } : {}),
    ...(options.headers || {}),
  };

  return new NextRequest(url, {
    method: options.method || 'GET',
    headers,
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });
}

describe('PHASE 10 — PRODUCTION HARDENING, DEPLOYMENT & LAUNCH VERIFICATION SUITE', () => {
  let prisma: PrismaClient;
  let pglite: PGlite;
  let adminUser: { id: string; email: string; token: string };
  let devA: { id: string; email: string; token: string };
  let devB: { id: string; email: string; token: string };
  let proPlanId: string;

  beforeAll(async () => {
    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    pglite = testDb.pglite;
    setPrismaClientForTesting(prisma);

    // Seed baseline plans
    for (const p of DEFAULT_PLANS) {
      const created = await prisma.plan.upsert({
        where: { slug: p.slug },
        update: p,
        create: p,
      });
      if (p.slug === 'pro') proPlanId = created.id;
    }

    const passwordHash = await hashPassword('ProdPass@2026!');

    const adminRecord = await prisma.user.create({
      data: {
        email: 'ops.admin@company-eg.com',
        name: 'LeadForge Production Admin',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    adminUser = {
      id: adminRecord.id,
      email: adminRecord.email,
      token: await signSessionToken({
        userId: adminRecord.id,
        email: adminRecord.email,
        name: adminRecord.name,
        role: 'ADMIN',
      }),
    };

    const devARecord = await prisma.user.create({
      data: {
        email: 'dev.alpha@agency-eg.com',
        name: 'Alpha Web Studio',
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        developerProfile: {
          create: {
            companyName: 'Alpha Web Studio',
            phone: '+201011223344',
            services: ['Website Development', 'E-Commerce Development'],
            locations: ['القاهرة', 'الجيزة'],
            niches: ['Dental', 'Medical', 'Restaurant'],
            minBudget: 5000,
            maxBudget: 100000,
            isActive: true,
            isAcceptingLeads: true,
          },
        },
        subscription: {
          create: {
            planId: proPlanId,
            status: 'ACTIVE',
            credits: 50,
            totalCreditsGranted: 50,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
          },
        },
        creditAccount: {
          create: {
            balance: 50,
            lifetimePurchased: 50,
            totalGranted: 50,
          },
        },
      },
      include: { creditAccount: true },
    });

    await prisma.creditTransaction.create({
      data: {
        accountId: devARecord.creditAccount!.id,
        developerId: devARecord.id,
        type: 'PURCHASE',
        amount: 50,
        balanceBefore: 0,
        balanceAfter: 50,
        referenceType: 'SUBSCRIPTION_INIT',
        referenceId: devARecord.id,
        reason: 'Initial Pro plan credits',
        idempotencyKey: `init-devA-${devARecord.id}`,
      },
    });

    devA = {
      id: devARecord.id,
      email: devARecord.email,
      token: await signSessionToken({
        userId: devARecord.id,
        email: devARecord.email,
        name: devARecord.name,
        role: 'DEVELOPER',
      }),
    };

    const devBRecord = await prisma.user.create({
      data: {
        email: 'dev.beta@agency-eg.com',
        name: 'Beta Digital Lab',
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        developerProfile: {
          create: {
            companyName: 'Beta Digital Lab',
            phone: '+201055667788',
            services: ['Website Development'],
            locations: ['القاهرة'],
            niches: ['Dental'],
            minBudget: 5000,
            maxBudget: 80000,
            isActive: true,
            isAcceptingLeads: true,
          },
        },
        subscription: {
          create: {
            planId: proPlanId,
            status: 'ACTIVE',
            credits: 30,
            totalCreditsGranted: 30,
            creditsUsed: 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
          },
        },
        creditAccount: {
          create: {
            balance: 30,
            lifetimePurchased: 30,
            totalGranted: 30,
          },
        },
      },
      include: { creditAccount: true },
    });

    await prisma.creditTransaction.create({
      data: {
        accountId: devBRecord.creditAccount!.id,
        developerId: devBRecord.id,
        type: 'PURCHASE',
        amount: 30,
        balanceBefore: 0,
        balanceAfter: 30,
        referenceType: 'SUBSCRIPTION_INIT',
        referenceId: devBRecord.id,
        reason: 'Initial credits for Beta',
        idempotencyKey: `init-devB-${devBRecord.id}`,
      },
    });

    devB = {
      id: devBRecord.id,
      email: devBRecord.email,
      token: await signSessionToken({
        userId: devBRecord.id,
        email: devBRecord.email,
        name: devBRecord.name,
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
    resetFeatureFlagsForTesting();
    resetRevokedSessionsForTesting();
    globalAppCache.clearAll();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pglite.close();
  });

  // ==========================================================================
  // 1. ENVIRONMENT SEPARATION & PRODUCTION CONFIG VALIDATOR (SECTIONS 3 & 4)
  // ==========================================================================
  describe('1. Environment Separation & Production Configuration Validator', () => {
    it('classifies development, test, staging, and production tiers accurately', () => {
      expect(resolveEnvironmentTier({ NODE_ENV: 'development' })).toBe('development');
      expect(resolveEnvironmentTier({ NODE_ENV: 'test' })).toBe('test');
      expect(resolveEnvironmentTier({ NODE_ENV: 'production', APP_ENV: 'staging' })).toBe('staging');
      expect(resolveEnvironmentTier({ NODE_ENV: 'production' })).toBe('production');
    });

    it('rejects missing, insecure, localhost, or test/demo configurations in production and redacts all secrets', () => {
      const unsafeProdEnv = {
        NODE_ENV: 'production',
        APP_URL: 'http://localhost:3000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/leadforge_dev',
        USE_EXTERNAL_PG: 'false',
        AUTH_SECRET: 'leadforge-egypt-secret-key-2025-deterministic-mvp',
        DEBUG: 'true',
        ALLOW_PRODUCTION_SEED: 'true',
        PAYMENT_ENABLED: 'true',
        PAYMENT_MODE: 'SANDBOX',
        PAYMENT_SECRET_KEY: 'sk_test_123456',
        PAYMENT_PUBLIC_KEY: 'pk_test_123456',
        PAYMENT_WEBHOOK_SECRET: 'short',
        EMAIL_PROVIDER: 'CONSOLE',
        EMAIL_FROM: 'noreply@localhost',
        COLLECTORS_ENABLED: 'true',
        COLLECTOR_ALLOWED_SOURCES: '',
      };

      const report = validateEnvironmentConfiguration(unsafeProdEnv);
      expect(report.status).toBe('ENVIRONMENT_VALIDATION_FAILED');
      expect(report.tier).toBe('production');
      expect(report.summary.criticalErrors).toBeGreaterThanOrEqual(10);

      const codes = report.issues.map((i) => `${i.variable}:${i.code}`);
      expect(codes).toContain('APP_URL:INSECURE_URL');
      expect(codes).toContain('APP_URL:LOCALHOST_FORBIDDEN_IN_PRODUCTION');
      expect(codes).toContain('DEBUG:DEBUG_ENABLED_IN_PRODUCTION');
      expect(codes).toContain('ALLOW_PRODUCTION_SEED:SEED_ENABLED_IN_PRODUCTION');
      expect(codes).toContain('USE_EXTERNAL_PG:DEV_DATABASE_FORBIDDEN_IN_PRODUCTION');
      expect(codes).toContain('DATABASE_URL:LOCALHOST_FORBIDDEN_IN_PRODUCTION');
      expect(codes).toContain('AUTH_SECRET:WEAK_SECRET');
      expect(codes).toContain('PAYMENT_MODE:TEST_CREDENTIALS_IN_PRODUCTION');
      expect(codes).toContain('PAYMENT_SECRET_KEY:TEST_CREDENTIALS_IN_PRODUCTION');
      expect(codes).toContain('PAYMENT_WEBHOOK_SECRET:WEAK_SECRET');
      expect(codes).toContain('EMAIL_PROVIDER:FAKE_PROVIDER_IN_PRODUCTION');
      expect(codes).toContain('COLLECTOR_ALLOWED_SOURCES:MISSING_REQUIRED_VARIABLE');

      // Secrets must be strictly redacted in snapshot and error message
      expect(report.redactedSnapshot.DATABASE_URL).toBe('<REDACTED>');
      expect(report.redactedSnapshot.AUTH_SECRET).toBe('<REDACTED>');
      expect(report.redactedSnapshot.PAYMENT_SECRET_KEY).toBe('<REDACTED>');
      expect(report.redactedSnapshot.PAYMENT_WEBHOOK_SECRET).toBe('<REDACTED>');

      expect(() => assertProductionEnvironmentValid(unsafeProdEnv)).toThrowError(
        /ENVIRONMENT_VALIDATION_FAILED/
      );
      try {
        assertProductionEnvironmentValid(unsafeProdEnv);
      } catch (err: any) {
        expect(err.message).not.toContain('sk_test_123456');
        expect(err.message).not.toContain('postgres:postgres');
      }
    });

    it('passes validation for a properly hardened production environment configuration', () => {
      const validProdEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'production',
        APP_URL: 'https://app.leadforge.eg',
        API_URL: 'https://api.leadforge.eg',
        ALLOWED_ORIGINS: 'https://app.leadforge.eg',
        DEBUG: 'false',
        ALLOW_PRODUCTION_SEED: 'false',
        DATABASE_URL: 'postgresql://lf_prod_user:StrongDbPass99!@db.internal.leadforge.eg:5432/leadforge_prod?sslmode=require',
        USE_EXTERNAL_PG: 'true',
        AUTH_SECRET: 'v9K#mP2$xL8@qR5!wZ7^nB4&jF1*yT6_cH3+dG0-sA9',
        PAYMENT_ENABLED: 'true',
        PAYMENT_MODE: 'LIVE',
        PAYMENT_PUBLIC_KEY: 'pk_live_9876543210abcdef',
        PAYMENT_SECRET_KEY: 'sk_live_9876543210abcdef_secret',
        PAYMENT_WEBHOOK_SECRET: 'whsec_live_cryptographic_signing_secret_2026_egypt',
        EMAIL_PROVIDER: 'API',
        EMAIL_FROM: 'notifications@leadforge.eg',
        EMAIL_API_KEY: 're_live_api_key_99887766',
        COLLECTORS_ENABLED: 'true',
        COLLECTOR_ALLOWED_SOURCES: 'manual,csv',
        LOG_LEVEL: 'info',
      };

      const report = assertProductionEnvironmentValid(validProdEnv);
      expect(report.status).toBe('VALID');
      expect(report.summary.criticalErrors).toBe(0);
    });
  });

  // ==========================================================================
  // 2. MIGRATION SAFETY, SEED PROTECTION & DATABASE READINESS (SECTIONS 5, 6, 29, 42)
  // ==========================================================================
  describe('2. Safe Database Migrations, Seed Blocking & Retention Policies', () => {
    it('classifies additive SQL migrations as SAFE and destructive DDL as DANGEROUS', () => {
      const safeSql = `
        CREATE TABLE IF NOT EXISTS "AuditArchive" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
        CREATE INDEX IF NOT EXISTS "Lead_archiveReason_idx" ON "Lead"("archiveReason");
      `;
      const safeResult = classifySqlMigrationSafety(safeSql);
      expect(safeResult.classification).toBe('SAFE');
      expect(safeResult.safeToAutoExecute).toBe(true);
      expect(safeResult.hazards).toHaveLength(0);

      const dangerousSql = `
        ALTER TABLE "Lead" DROP COLUMN "phone";
        ALTER TABLE "CreditTransaction" ALTER COLUMN "amount" TYPE VARCHAR(50);
        TRUNCATE TABLE "AuditLog";
        DROP TABLE "LeadClaim";
        DELETE FROM "SourceRecord";
      `;
      const dangerousResult = classifySqlMigrationSafety(dangerousSql);
      expect(dangerousResult.classification).toBe('DANGEROUS');
      expect(dangerousResult.safeToAutoExecute).toBe(false);
      const hazardTypes = dangerousResult.hazards.map((h) => h.pattern);
      expect(hazardTypes).toContain('DROP_COLUMN');
      expect(hazardTypes).toContain('ALTER_COLUMN_TYPE');
      expect(hazardTypes).toContain('TRUNCATE_TABLE');
      expect(hazardTypes).toContain('DROP_TABLE');
      expect(hazardTypes).toContain('DELETE_WITHOUT_WHERE');
    });

    it('blocks demo/seed execution in production (SEED_BLOCKED_IN_PRODUCTION)', async () => {
      expect(() =>
        assertSeedAllowedInEnvironment({ NODE_ENV: 'production' })
      ).toThrowError(/SEED_BLOCKED_IN_PRODUCTION/);

      await expect(
        seedDatabase(prisma, { env: { NODE_ENV: 'production' } })
      ).rejects.toThrowError(/SEED_BLOCKED_IN_PRODUCTION/);
    });

    it('verifies database production readiness and immutable retention policies', async () => {
      const readiness = await runDatabaseProductionReadinessAudit(prisma);
      expect(readiness.healthy).toBe(true);
      expect(readiness.integrityReport.totalViolations).toBe(0);

      const immutableCategories = PRODUCTION_DATA_RETENTION_POLICIES.filter(
        (p) => p.disposalMethod === 'NEVER_DELETE'
      ).map((p) => p.category);
      expect(immutableCategories).toContain('Financial Credit Ledger');
      expect(immutableCategories).toContain('Payments & Subscriptions');
      expect(immutableCategories).toContain('Lead Claims & Outcomes');
      expect(immutableCategories).toContain('Security & Administrative Audit Logs');
    });
  });

  // ==========================================================================
  // 3. BACKUP STRATEGY & STAGING RESTORE VERIFICATION (SECTIONS 7, 8, 9)
  // ==========================================================================
  describe('3. Logical Backup Checksum & Isolated Staging Restore Verification', () => {
    it('creates a SHA-256 verified logical backup and restores it into an isolated staging DB with 100% row and invariant parity', async () => {
      // Ingest a canonical business lead first so backup includes leads, sourceRecords, identities
      await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Backup Verification Source',
        rawRecords: [
          {
            name: 'مركز النيل التخصصي للأسنان - Nile Dental Center',
            category: 'Dental',
            city: 'القاهرة',
            area: 'المعادي',
            address: '15 شارع 9، المعادي، القاهرة',
            phone: '01012349001',
            email: 'info@niledental-maadi.eg',
            website: '',
            rating: 4.8,
            reviewCount: 150,
            leadType: 'SHARED',
            source: 'Backup Verification Source',
          },
        ],
      });

      const backupArtifact = await createLogicalBackupSnapshot(prisma, 'staging');
      expect(backupArtifact.backupId).toMatch(/^bkp_/);
      expect(backupArtifact.checksumSha256).toHaveLength(64);
      expect(backupArtifact.totalRows).toBeGreaterThan(10);
      expect(backupArtifact.rowCounts.users).toBeGreaterThanOrEqual(3);
      expect(backupArtifact.rowCounts.leads).toBeGreaterThanOrEqual(1);
      expect(backupArtifact.rowCounts.creditTransactions).toBeGreaterThanOrEqual(2);

      // Verify tamper detection on corrupted backup
      const tamperedArtifact = {
        ...backupArtifact,
        checksumSha256: '0000000000000000000000000000000000000000000000000000000000000000',
      };
      const stagingDb1 = await createInMemoryTestDb();
      try {
        const failedRestore = await executeStagingRestoreVerification(
          tamperedArtifact,
          stagingDb1.prisma
        );
        expect(failedRestore.result).toBe('FAILED');
        expect(failedRestore.checksumVerified).toBe(false);
      } finally {
        await stagingDb1.prisma.$disconnect();
        await stagingDb1.pglite.close();
      }

      // Restore valid backup into an isolated staging DB
      const stagingDb2 = await createInMemoryTestDb();
      try {
        const restoreReport = await executeStagingRestoreVerification(
          backupArtifact,
          stagingDb2.prisma
        );
        expect(restoreReport.result).toBe('SUCCESS');
        expect(restoreReport.checksumVerified).toBe(true);
        expect(restoreReport.rowCountMatch).toBe(true);
        expect(restoreReport.stagingRestoreStatus).toBe('VERIFIED');
        expect(restoreReport.productionLiveRestoreStatus).toBe('NOT_EXECUTED');
        expect(restoreReport.invariantVerification.healthy).toBe(true);
        expect(restoreReport.invariantVerification.totalViolations).toBe(0);
        expect(restoreReport.restoredRowCounts).toEqual(backupArtifact.rowCounts);
      } finally {
        await stagingDb2.prisma.$disconnect();
        await stagingDb2.pglite.close();
      }

      expect(DISASTER_RECOVERY_TARGETS.rpoMinutes).toBeLessThanOrEqual(15);
      expect(DISASTER_RECOVERY_TARGETS.rtoMinutes).toBeLessThanOrEqual(30);
    });
  });

  // ==========================================================================
  // 4. PRODUCTION HEALTH CHECK ENDPOINTS (SECTION 16)
  // ==========================================================================
  describe('4. Machine-Readable Health & Readiness Endpoints', () => {
    it('serves GET /api/health, GET /api/health/live, and GET /api/health/ready without leaking secrets', async () => {
      const rootRes = await healthRootGet();
      expect(rootRes.status).toBe(200);
      const rootBody = await rootRes.json();
      expect(rootBody.status).toBe('ok');
      expect(rootBody.checks.database).toBe('ok');
      expect(rootBody.checks.configuration).toBe('ok');
      expect(JSON.stringify(rootBody)).not.toContain('postgresql://');
      expect(JSON.stringify(rootBody)).not.toContain('AUTH_SECRET');

      const liveRes = await healthLiveGet(makeRequest('http://localhost:3000/api/health/live'));
      expect(liveRes.status).toBe(200);
      const liveBody = await liveRes.json();
      expect(liveBody.alive).toBe(true);

      const readyRes = await healthReadyGet(makeRequest('http://localhost:3000/api/health/ready'));
      expect(readyRes.status).toBe(200);
      const readyBody = await readyRes.json();
      expect(readyBody.ready).toBe(true);
      expect(readyBody.checks.database.status).toBe('ok');
      expect(readyBody.components.database.status).toBe('HEALTHY');
    });
  });

  // ==========================================================================
  // 5. PAYMENT & WEBHOOK PRODUCTION TESTING (SECTIONS 21 & 22)
  // ==========================================================================
  describe('5. Payment Provider & Webhook Security, Idempotency & Reconciliation', () => {
    const webhookSecret = 'whsec_test_production_grade_secret_32_bytes_minimum';

    it('rejects missing signature, invalid signature, expired timestamp, malformed payload, unsupported event, and handles provider timeout', async () => {
      const samplePayload = JSON.stringify({
        eventId: 'evt_sec_1',
        type: 'payment.succeeded',
        userId: devB.id,
        planId: proPlanId,
      });

      // Missing signature
      const missingSigRes = await processPaymentWebhookEvent({
        prisma,
        rawBody: samplePayload,
        signatureHeader: '',
        webhookSecret,
      });
      expect(missingSigRes.ok).toBe(false);
      expect(missingSigRes.httpStatus).toBe(401);
      expect(missingSigRes.code).toBe('MISSING_SIGNATURE');

      // Invalid signature
      const badSigRes = await processPaymentWebhookEvent({
        prisma,
        rawBody: samplePayload,
        signatureHeader: 't=1700000000,v1=deadbeef',
        webhookSecret,
      });
      expect(badSigRes.ok).toBe(false);
      expect(badSigRes.httpStatus).toBe(401);
      expect(badSigRes.code).toBe('INVALID_SIGNATURE');

      // Expired timestamp (1 hour ago)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
      const expiredSig = signPaymentWebhookPayload(samplePayload, webhookSecret, oldTimestamp);
      const expiredCheck = verifyPaymentWebhookSignature({
        rawBody: samplePayload,
        signatureHeader: expiredSig,
        webhookSecret,
      });
      expect(expiredCheck.valid).toBe(false);
      expect(expiredCheck.errorCode).toBe('TIMESTAMP_EXPIRED');

      // Malformed JSON
      const malformedRaw = '{bad-json';
      const malformedSig = signPaymentWebhookPayload(malformedRaw, webhookSecret);
      const malformedRes = await processPaymentWebhookEvent({
        prisma,
        rawBody: malformedRaw,
        signatureHeader: malformedSig,
        webhookSecret,
      });
      expect(malformedRes.httpStatus).toBe(400);
      expect(malformedRes.code).toBe('MALFORMED_PAYLOAD');

      // Unsupported event
      const unsupportedRaw = JSON.stringify({
        eventId: 'evt_unsup_1',
        type: 'crypto.mining.completed',
      });
      const unsupportedSig = signPaymentWebhookPayload(unsupportedRaw, webhookSecret);
      const unsupportedRes = await processPaymentWebhookEvent({
        prisma,
        rawBody: unsupportedRaw,
        signatureHeader: unsupportedSig,
        webhookSecret,
      });
      expect(unsupportedRes.httpStatus).toBe(422);
      expect(unsupportedRes.code).toBe('UNSUPPORTED_EVENT');

      // Simulated provider timeout
      const timeoutRaw = JSON.stringify({
        eventId: 'evt_timeout_1',
        type: 'payment.succeeded',
        simulateTimeout: true,
      });
      const timeoutSig = signPaymentWebhookPayload(timeoutRaw, webhookSecret);
      const timeoutRes = await processPaymentWebhookEvent({
        prisma,
        rawBody: timeoutRaw,
        signatureHeader: timeoutSig,
        webhookSecret,
      });
      expect(timeoutRes.httpStatus).toBe(504);
      expect(timeoutRes.code).toBe('PROVIDER_TIMEOUT');
    });

    it('processes valid payment.succeeded webhook idempotently (never granting credits twice on duplicate delivery) and handles out-of-order/refund webhooks', async () => {
      process.env.PAYMENT_WEBHOOK_SECRET = webhookSecret;

      const beforeAccount = await prisma.developerCreditAccount.findUnique({
        where: { developerId: devB.id },
      });
      const initialBalance = beforeAccount!.balance;

      const successPayload = JSON.stringify({
        eventId: 'evt_pay_success_100',
        type: 'payment.succeeded',
        provider: 'PAYMOB_LIVE',
        providerRef: 'paymob_tx_990011',
        userId: devB.id,
        planId: proPlanId,
        amountEgp: 599,
        credits: 50,
      });
      const validSig = signPaymentWebhookPayload(successPayload, webhookSecret);

      // 1st delivery via HTTP route handler
      const res1 = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: successPayload,
          headers: { 'x-webhook-signature': validSig },
        })
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.code).toBe('PROCESSED');
      expect(body1.idempotentReplay).toBe(false);
      expect(body1.creditsGranted).toBe(50);

      // 2nd duplicate delivery (same eventId) -> must NOT grant credits again
      const res2 = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: successPayload,
          headers: { 'x-webhook-signature': validSig },
        })
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.code).toBe('IDEMPOTENT_DUPLICATE');
      expect(body2.idempotentReplay).toBe(true);
      expect(body2.creditsGranted).toBe(0);

      // 3rd duplicate delivery (different eventId but same providerRef) -> must NOT grant credits again
      const duplicateRefPayload = JSON.stringify({
        eventId: 'evt_pay_success_100_retry',
        type: 'payment.succeeded',
        provider: 'PAYMOB_LIVE',
        providerRef: 'paymob_tx_990011',
        userId: devB.id,
        planId: proPlanId,
        amountEgp: 599,
        credits: 50,
      });
      const dupRefSig = signPaymentWebhookPayload(duplicateRefPayload, webhookSecret);
      const res3 = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: duplicateRefPayload,
          headers: { 'x-webhook-signature': dupRefSig },
        })
      );
      expect(res3.status).toBe(200);
      const body3 = await res3.json();
      expect(body3.code).toBe('IDEMPOTENT_DUPLICATE');
      expect(body3.creditsGranted).toBe(0);

      const afterGrantAccount = await prisma.developerCreditAccount.findUnique({
        where: { developerId: devB.id },
      });
      expect(afterGrantAccount!.balance).toBe(initialBalance + 50);

      // Out-of-order payment.failed arriving AFTER payment.succeeded -> must be ignored
      const outOfOrderFailPayload = JSON.stringify({
        eventId: 'evt_pay_fail_late_100',
        type: 'payment.failed',
        providerRef: 'paymob_tx_990011',
        userId: devB.id,
      });
      const outOfOrderFailSig = signPaymentWebhookPayload(outOfOrderFailPayload, webhookSecret);
      const resOut = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: outOfOrderFailPayload,
          headers: { 'x-webhook-signature': outOfOrderFailSig },
        })
      );
      const bodyOut = await resOut.json();
      expect(bodyOut.code).toBe('OUT_OF_ORDER_IGNORED');

      // Refund webhook -> reverses granted 50 credits safely without negative balance
      const refundPayload = JSON.stringify({
        eventId: 'evt_pay_refund_100',
        type: 'payment.refunded',
        providerRef: 'paymob_tx_990011',
        userId: devB.id,
      });
      const refundSig = signPaymentWebhookPayload(refundPayload, webhookSecret);
      const resRefund = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: refundPayload,
          headers: { 'x-webhook-signature': refundSig },
        })
      );
      const bodyRefund = await resRefund.json();
      expect(bodyRefund.code).toBe('PROCESSED');
      expect(bodyRefund.creditsReversed).toBe(50);

      const afterRefundAccount = await prisma.developerCreditAccount.findUnique({
        where: { developerId: devB.id },
      });
      expect(afterRefundAccount!.balance).toBe(initialBalance);

      // Duplicate refund webhook with a new eventId for already-REFUNDED payment -> must return IDEMPOTENT_DUPLICATE
      const dupRefundPayload = JSON.stringify({
        eventId: 'evt_pay_refund_100_dup',
        type: 'payment.refunded',
        providerRef: 'paymob_tx_990011',
        userId: devB.id,
      });
      const dupRefundSig = signPaymentWebhookPayload(dupRefundPayload, webhookSecret);
      const resDupRefund = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: dupRefundPayload,
          headers: { 'x-webhook-signature': dupRefundSig },
        })
      );
      const bodyDupRefund = await resDupRefund.json();
      expect(bodyDupRefund.code).toBe('IDEMPOTENT_DUPLICATE');
      expect(bodyDupRefund.idempotentReplay).toBe(true);
      expect(bodyDupRefund.creditsReversed).toBe(0);

      // Delayed payment.succeeded arriving AFTER refund -> must be ignored (OUT_OF_ORDER_IGNORED)
      const delayedSuccessAfterRefund = JSON.stringify({
        eventId: 'evt_pay_delayed_after_refund',
        type: 'payment.succeeded',
        providerRef: 'paymob_tx_990011',
        userId: devB.id,
        planId: proPlanId,
        credits: 50,
      });
      const delayedSig = signPaymentWebhookPayload(delayedSuccessAfterRefund, webhookSecret);
      const resDelayed = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: delayedSuccessAfterRefund,
          headers: { 'x-webhook-signature': delayedSig },
        })
      );
      const bodyDelayed = await resDelayed.json();
      expect(bodyDelayed.code).toBe('OUT_OF_ORDER_IGNORED');
      expect(bodyDelayed.creditsGranted).toBe(0);

      // Concurrent duplicate webhook race: 4 simultaneous deliveries of the same payment
      const concurrentPayload = JSON.stringify({
        eventId: 'evt_pay_concurrent_200',
        type: 'payment.succeeded',
        provider: 'PAYMOB_LIVE',
        providerRef: 'paymob_tx_concurrent_200',
        userId: devB.id,
        planId: proPlanId,
        amountEgp: 599,
        credits: 20,
      });
      const concurrentSig = signPaymentWebhookPayload(concurrentPayload, webhookSecret);
      const concurrentResults = await Promise.all(
        [1, 2, 3, 4].map(() =>
          processPaymentWebhookEvent({
            prisma,
            rawBody: concurrentPayload,
            signatureHeader: concurrentSig,
            webhookSecret,
          })
        )
      );
      const processedCount = concurrentResults.filter((r) => r.code === 'PROCESSED').length;
      const duplicateCount = concurrentResults.filter((r) => r.code === 'IDEMPOTENT_DUPLICATE').length;
      expect(processedCount).toBe(1);
      expect(duplicateCount).toBe(3);

      // Reconcile payments with ledger (all valid payments linked)
      const reconciliation = await reconcilePaymentsWithLedger(prisma);
      expect(reconciliation.reconciled).toBe(true);

      // Verify reconcilePaymentsWithLedger catches an unlinked COMPLETED webhook payment even when user has prior PURCHASE tx
      const roguePayment = await prisma.payment.create({
        data: {
          userId: devB.id,
          planId: proPlanId,
          amountEgp: 599,
          creditsGranted: 50,
          provider: 'PAYMOB_LIVE',
          providerRef: 'rogue_unlinked_ref_999',
          status: 'COMPLETED',
        },
      });
      const rogueReconciliation = await reconcilePaymentsWithLedger(prisma);
      expect(rogueReconciliation.reconciled).toBe(false);
      expect(rogueReconciliation.unlinkedCompletedPaymentIds).toContain(roguePayment.id);
      await prisma.payment.delete({ where: { id: roguePayment.id } });
    });
  });

  // ==========================================================================
  // 6. EMAIL & NOTIFICATION PRODUCTION READINESS (SECTION 23)
  // ==========================================================================
  describe('6. Notification Deduplication, Retry & Lead Contact Redaction', () => {
    it('redacts private phone numbers and emails from unclaimed lead notifications and prevents duplicate notifications', async () => {
      const rawText =
        'فرصة جديدة مطابقة: عيادة النور اتصل على 01012345678 أو راسل info@alnoor-clinic.eg فوراً';
      const redacted = sanitizeNotificationContent(rawText, { redactContactDetails: true });
      expect(redacted).not.toContain('01012345678');
      expect(redacted).not.toContain('info@alnoor-clinic.eg');
      expect(redacted).toContain('[REDACTED_PHONE]');
      expect(redacted).toContain('[REDACTED_EMAIL]');

      const notif1 = await createInAppNotification(
        {
          userId: devA.id,
          title: 'فرصة جديدة',
          message: rawText,
          type: 'MATCHED_LEADS',
          idempotencyKey: 'notif-match-dedup-1',
        },
        prisma
      );
      const notif2 = await createInAppNotification(
        {
          userId: devA.id,
          title: 'فرصة جديدة',
          message: rawText,
          type: 'MATCHED_LEADS',
          idempotencyKey: 'notif-match-dedup-1',
        },
        prisma
      );
      expect(notif1.id).toBe(notif2.id);
      expect(notif1.message).not.toContain('01012345678');

      // Email dispatch retry & deduplication
      let attempts = 0;
      const flakyProvider = {
        name: 'FlakyTestEmailProvider',
        async sendEmail() {
          attempts++;
          if (attempts === 1) throw new Error('Transient SMTP timeout');
          return { delivered: true, messageId: 'msg-recovered-1' };
        },
      };

      const emailRes1 = await dispatchTransactionalEmailSafe({
        message: {
          to: devA.email,
          subject: 'New matched lead 01099887766',
          bodyText: 'Contact secret@business.eg',
        },
        idempotencyKey: 'email-idem-1',
        redactLeadContacts: true,
        maxRetries: 2,
        provider: flakyProvider,
      });
      expect(emailRes1.delivered).toBe(true);
      expect(emailRes1.attempts).toBe(2);
      expect(emailRes1.deduplicated).toBe(false);

      const emailRes2 = await dispatchTransactionalEmailSafe({
        message: {
          to: devA.email,
          subject: 'New matched lead 01099887766',
          bodyText: 'Contact secret@business.eg',
        },
        idempotencyKey: 'email-idem-1',
        redactLeadContacts: true,
        provider: flakyProvider,
      });
      expect(emailRes2.delivered).toBe(true);
      expect(emailRes2.deduplicated).toBe(true);
    });
  });

  // ==========================================================================
  // 7. WORKERS, SCHEDULER SAFETY & COLLECTOR READINESS (SECTIONS 24, 25, 26, 27)
  // ==========================================================================
  describe('7. Worker Scheduler Locking, Batch Clamping & Collector Production Readiness', () => {
    it('prevents concurrent duplicate job execution with exclusive locks, clamps batch sizes, and executes all 8 built-in worker jobs', async () => {
      const jobKeys = Object.keys(WORKER_JOB_DEFINITIONS) as Array<keyof typeof WORKER_JOB_DEFINITIONS>;
      expect(jobKeys).toHaveLength(8);

      let releaseSlowJob!: () => void;
      const slowJobGate = new Promise<void>((resolve) => {
        releaseSlowJob = resolve;
      });

      const firstRunPromise = executeScheduledWorkerJob({
        jobKey: 'verification_batch_refresh',
        requestedBatchSize: 999_999, // Attempts unbounded batch
        db: prisma,
        customHandler: async ({ batchLimit }) => {
          expect(batchLimit).toBeLessThanOrEqual(
            WORKER_JOB_DEFINITIONS.verification_batch_refresh.maxBatchSize
          );
          await slowJobGate;
          return { recordsProcessed: batchLimit };
        },
      });

      // Concurrent second run while first holds the lock -> must immediately return LOCK_CONFLICT
      const concurrentSecondRun = await executeScheduledWorkerJob({
        jobKey: 'verification_batch_refresh',
        db: prisma,
      });
      expect(concurrentSecondRun.status).toBe('LOCK_CONFLICT');

      releaseSlowJob();
      const firstRunResult = await firstRunPromise;
      expect(firstRunResult.status).toBe('COMPLETED');
      expect(firstRunResult.batchSizeLimit).toBe(100);

      // Execute all 8 built-in worker job handlers and verify they complete cleanly
      for (const jobKey of jobKeys) {
        const execRecord = await executeScheduledWorkerJob({
          jobKey,
          db: prisma,
        });
        expect(execRecord.status).toBe('COMPLETED');
      }

      // Verify analytics_daily_snapshot created DailyMetricSnapshot records
      const snapshotsCount = await prisma.dailyMetricSnapshot.count();
      expect(snapshotsCount).toBeGreaterThanOrEqual(2);
    });

    it('verifies collector production readiness, legal/auth status, and absence of bypasses', async () => {
      const collectorAudit = await auditCollectorProductionReadiness(prisma, {
        NODE_ENV: 'production',
        COLLECTORS_ENABLED: 'false',
        COLLECTOR_ALLOWED_SOURCES: 'manual,csv',
      });

      expect(collectorAudit.parallelBypassPathsExist).toBe(false);
      expect(collectorAudit.allCollectorsControlled).toBe(true);
      expect(collectorAudit.canonicalPipelineStages).toEqual([
        'INGESTION',
        'NORMALIZATION',
        'DEDUPLICATION',
        'QUALITY',
        'VERIFICATION',
        'SCORING',
        'SALEABILITY',
        'MATCHING',
      ]);

      for (const col of collectorAudit.collectors) {
        expect(col.prohibitedBehaviorsVerifiedAbsent.noCaptchaBypass).toBe(true);
        expect(col.prohibitedBehaviorsVerifiedAbsent.noAntiBotBypass).toBe(true);
        expect(col.prohibitedBehaviorsVerifiedAbsent.noAuthBypass).toBe(true);
        expect(col.prohibitedBehaviorsVerifiedAbsent.noStealthScraping).toBe(true);
        expect(col.prohibitedBehaviorsVerifiedAbsent.noRateLimitEvasion).toBe(true);
      }

      const googleCollector = collectorAudit.collectors.find(
        (c) => c.sourceType === 'GOOGLE_BUSINESS'
      );
      expect(googleCollector?.productionStatus).toBe('CONTROLLED_DISABLED_UNTIL_CONFIGURED');
    });
  });

  // ==========================================================================
  // 8. AUTHORIZATION AUDIT, IDOR REJECTION & USER DATA CONTROLS (SECTIONS 19, 20, 30, 31)
  // ==========================================================================
  describe('8. Endpoint-by-Endpoint Authorization, IDOR Rejection & User Data Controls', () => {
    it('rejects all cross-developer IDOR attempts and unauthorized admin endpoint access with 403', async () => {
      // Dev A attempting to read Dev B's credits
      const idorCredits = await getDeveloperCreditsRoute(
        makeRequest(`http://localhost:3000/api/developer/credits?developerId=${devB.id}`, {
          token: devA.token,
        })
      );
      expect(idorCredits.status).toBe(403);

      // Dev A attempting to read Dev B's claims
      const idorClaims = await getDeveloperClaimsRoute(
        makeRequest(`http://localhost:3000/api/developer/claims?developerId=${devB.id}`, {
          token: devA.token,
        })
      );
      expect(idorClaims.status).toBe(403);

      // Dev A attempting to read Dev B's analytics
      const idorAnalytics = await getDeveloperAnalyticsRoute(
        makeRequest(`http://localhost:3000/api/developer/analytics?developerId=${devB.id}`, {
          token: devA.token,
        })
      );
      expect(idorAnalytics.status).toBe(403);

      // Dev A attempting to read Dev B's engagements
      const idorEngagements = await getDeveloperEngagementsRoute(
        makeRequest(`http://localhost:3000/api/developer/engagements?developerId=${devB.id}`, {
          token: devA.token,
        })
      );
      expect(idorEngagements.status).toBe(403);

      // Dev A attempting to read/modify/delete Dev B's profile
      const idorProfileGet = await getDeveloperProfileRoute(
        makeRequest(`http://localhost:3000/api/developer/profile?developerId=${devB.id}`, {
          token: devA.token,
        })
      );
      expect(idorProfileGet.status).toBe(403);

      const idorProfilePatch = await patchDeveloperProfileRoute(
        makeRequest(`http://localhost:3000/api/developer/profile?developerId=${devB.id}`, {
          method: 'PATCH',
          token: devA.token,
          body: { companyName: 'Hacked Name' },
        })
      );
      expect(idorProfilePatch.status).toBe(403);

      const idorProfileDelete = await deleteDeveloperProfileRoute(
        makeRequest(`http://localhost:3000/api/developer/profile?developerId=${devB.id}`, {
          method: 'DELETE',
          token: devA.token,
        })
      );
      expect(idorProfileDelete.status).toBe(403);

      // Dev A attempting to access Admin endpoints
      const devOnAdminObs = await adminObservabilityGet(
        makeRequest('http://localhost:3000/api/admin/observability', {
          token: devA.token,
        })
      );
      expect(devOnAdminObs.status).toBe(403);

      const devOnAdminCredits = await adminCreditsGet(
        makeRequest('http://localhost:3000/api/admin/credits', {
          token: devA.token,
        })
      );
      expect(devOnAdminCredits.status).toBe(403);
    });

    it('exports personal developer data and performs controlled account deletion/anonymization preserving financial/audit records', async () => {
      // Export Dev A's data via GET /api/developer/profile?export=true
      const exportRes = await getDeveloperProfileRoute(
        makeRequest('http://localhost:3000/api/developer/profile?export=true', {
          token: devA.token,
        })
      );
      expect(exportRes.status).toBe(200);
      const exportBody = await exportRes.json();
      expect(exportBody.schemaVersion).toBe('USER_DATA_EXPORT_V1');
      expect(exportBody.user.id).toBe(devA.id);
      expect(exportBody.creditAccount.balance).toBeGreaterThanOrEqual(0);

      // Create a temporary developer to test controlled account deletion
      const tempUser = await prisma.user.create({
        data: {
          email: 'to.delete@agency-eg.com',
          name: 'Temporary Developer',
          passwordHash: await hashPassword('TempPass@123!'),
          role: 'DEVELOPER',
          status: 'ACTIVE',
          developerProfile: {
            create: {
              companyName: 'Temp Co',
              phone: '01088776655',
              bio: 'Personal bio',
            },
          },
          creditAccount: {
            create: {
              balance: 10,
              lifetimePurchased: 10,
              totalGranted: 10,
            },
          },
        },
        include: { creditAccount: true },
      });

      await prisma.creditTransaction.create({
        data: {
          accountId: tempUser.creditAccount!.id,
          developerId: tempUser.id,
          type: 'PURCHASE',
          amount: 10,
          balanceBefore: 0,
          balanceAfter: 10,
          reason: 'Temp user initial purchase',
        },
      });

      const tempToken = await signSessionToken({
        userId: tempUser.id,
        email: tempUser.email,
        name: tempUser.name,
        role: 'DEVELOPER',
      });

      const delRes = await deleteDeveloperProfileRoute(
        makeRequest('http://localhost:3000/api/developer/profile', {
          method: 'DELETE',
          token: tempToken,
          body: { reason: 'Closing agency operations' },
        })
      );
      expect(delRes.status).toBe(200);
      const delBody = await delRes.json();
      expect(delBody.success).toBe(true);
      expect(delBody.status).toBe('SUSPENDED');
      expect(delBody.sessionsRevoked).toBe(true);
      expect(delBody.preservedImmutableRecords.creditTransactionsCount).toBe(1);
      expect(delBody.preservedImmutableRecords.auditLogsCount).toBeGreaterThanOrEqual(1);

      // Session token must now be revoked immediately
      const verifiedAfterDelete = await verifySessionToken(tempToken);
      expect(verifiedAfterDelete).toBeNull();

      // Verify session revocation cutoff allows newly issued tokens after revocation (non-permanent lockout)
      const oldDevAToken = await signSessionToken({
        userId: devA.id,
        email: devA.email,
        name: 'م. طارق المنشاوي',
        role: 'DEVELOPER',
      });
      expect(await verifySessionToken(oldDevAToken)).not.toBeNull();
      revokeAllSessionsForUser(devA.id);
      expect(await verifySessionToken(oldDevAToken)).toBeNull();

      const newDevATokenAfterUserRevoke = await signSessionToken({
        userId: devA.id,
        email: devA.email,
        name: 'م. طارق المنشاوي',
        role: 'DEVELOPER',
      });
      expect((await verifySessionToken(newDevATokenAfterUserRevoke))?.userId).toBe(devA.id);

      // Verify global session revocation invalidates existing tokens while allowing fresh logins afterwards
      revokeAllSessions();
      expect(await verifySessionToken(newDevATokenAfterUserRevoke)).toBeNull();
      devA.token = await signSessionToken({
        userId: devA.id,
        email: devA.email,
        name: 'م. طارق المنشاوي',
        role: 'DEVELOPER',
      });
      devB.token = await signSessionToken({
        userId: devB.id,
        email: devB.email,
        name: 'م. سلمى حجازي',
        role: 'DEVELOPER',
      });
      adminUser.token = await signSessionToken({
        userId: adminUser.id,
        email: adminUser.email,
        name: 'مدير العمليات التنفيذي',
        role: 'ADMIN',
      });
      expect((await verifySessionToken(devA.token))?.userId).toBe(devA.id);
    });
  });

  // ==========================================================================
  // 9. COMPLETE END-TO-END BUSINESS FLOW (SECTION 39)
  // ==========================================================================
  describe('9. Complete End-to-End Business Flow (Developer 18 Steps + Admin 12 Steps)', () => {
    it('executes the complete 18-step Developer journey and 12-step Admin journey end-to-end', async () => {
      // --- DEVELOPER E2E JOURNEY ---
      // Step 1: Developer registers
      const regRes = await registerPost(
        makeRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          body: {
            name: 'م. كريم عادل',
            email: 'karim.e2e@cairoweb.eg',
            password: 'KarimStrong@2026!',
            companyName: 'CairoWeb Solutions',
            phone: '01066554433',
          },
        })
      );
      expect(regRes.status).toBe(201);
      const regData = await regRes.json();
      expect(regData.user.email).toBe('karim.e2e@cairoweb.eg');
      const e2eUserId = regData.user.id;

      // Step 2: Logs in and obtains session cookie
      const loginRes = await loginPost(
        makeRequest('http://localhost:3000/api/auth/login', {
          method: 'POST',
          body: {
            email: 'karim.e2e@cairoweb.eg',
            password: 'KarimStrong@2026!',
          },
        })
      );
      expect(loginRes.status).toBe(200);
      const e2eToken = await signSessionToken({
        userId: e2eUserId,
        email: 'karim.e2e@cairoweb.eg',
        name: 'م. كريم عادل',
        role: 'DEVELOPER',
      });

      // Steps 3, 4, 5, 6, 7: Updates profile (services, locations, niches, preferences, budget)
      const profRes = await patchDeveloperProfileRoute(
        makeRequest('http://localhost:3000/api/developer/profile', {
          method: 'PATCH',
          token: e2eToken,
          body: {
            companyName: 'CairoWeb Digital Agency',
            services: ['Website Development', 'Booking & Clinic Systems'],
            locations: ['القاهرة', 'القاهرة الجديدة', 'الجيزة'],
            niches: ['Dental', 'Medical'],
            leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
            minBudget: 5000,
            maxBudget: 75000,
            leadType: 'BOTH',
            isActive: true,
            isAcceptingLeads: true,
          },
        })
      );
      expect(profRes.status).toBe(200);

      // Steps 8 & 9: Subscribes to Pro plan & receives 50 credits
      const subRes = await subscribePost(
        makeRequest('http://localhost:3000/api/subscription', {
          method: 'POST',
          token: e2eToken,
          body: { planId: proPlanId },
        })
      );
      expect(subRes.status).toBe(200);
      const subData = await subRes.json();
      expect(subData.subscription.credits).toBe(50);

      // Ingest a fresh high-quality Dental lead in Cairo
      await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'E2E Verified Medical Directory',
        rawRecords: [
          {
            name: 'عيادة رويال دنت للأسنان التجميلية - Royal Dent Clinic',
            category: 'Dental',
            city: 'القاهرة',
            area: 'مدينة نصر',
            address: '80 شارع عباس العقاد، مدينة نصر، القاهرة',
            phone: '01022334455',
            email: 'contact@royaldent-nasr.eg',
            website: '',
            rating: 4.9,
            reviewCount: 280,
            branchCount: 2,
            leadType: 'SHARED',
            source: 'E2E Verified Medical Directory',
          },
        ],
      });

      // Step 10: Browses eligible leads
      const browseRes = await getLeadsRoute(
        makeRequest('http://localhost:3000/api/leads?category=Dental', {
          token: e2eToken,
        })
      );
      expect(browseRes.status).toBe(200);
      const browseData = await browseRes.json();
      expect(browseData.leads.length).toBeGreaterThanOrEqual(1);
      const targetLead = browseData.leads.find((l: any) =>
        l.businessName.includes('Royal Dent Clinic')
      );
      expect(targetLead).toBeDefined();

      // Step 11: Opens lead details (contact fields are masked before claiming)
      const detailBeforeRes = await getLeadDetailRoute(
        makeRequest(`http://localhost:3000/api/leads/${targetLead.id}`, {
          token: e2eToken,
        }),
        { params: { id: targetLead.id } }
      );
      expect(detailBeforeRes.status).toBe(200);
      const detailBefore = await detailBeforeRes.json();
      expect(detailBefore.lead.isClaimedByMe).toBe(false);
      expect(detailBefore.lead.phone).toContain('****');

      // Steps 12 & 13: Claims lead & spends credits
      const claimRes = await claimLeadRoute(
        makeRequest(`http://localhost:3000/api/leads/${targetLead.id}/claim`, {
          method: 'POST',
          token: e2eToken,
          body: {
            accessType: 'SHARED',
            idempotencyKey: 'e2e-claim-royaldent-1',
          },
        }),
        { params: { id: targetLead.id } }
      );
      expect(claimRes.status).toBe(200);
      const claimData = await claimRes.json();
      expect(claimData.success).toBe(true);
      expect(claimData.lead.phone).toContain('1022334455');
      expect(claimData.remainingBalance).toBeLessThan(50);

      // Steps 14 & 15: Contacts business & records contact attempt
      const attemptRes = await contactAttemptPost(
        makeRequest(`http://localhost:3000/api/leads/${targetLead.id}/contact-attempts`, {
          method: 'POST',
          token: e2eToken,
          body: {
            channel: 'PHONE',
            result: 'ANSWERED',
            note: 'تحدثت مع مدير العيادة وطلب عرض فني لموقع الحجز',
            idempotencyKey: 'e2e-contact-attempt-1',
          },
        }),
        { params: { id: targetLead.id } }
      );
      expect(attemptRes.status).toBe(200);

      // Step 16: Updates engagement through pipeline (CONTACTED -> REPLIED -> INTERESTED -> MEETING -> PROPOSAL_SENT -> NEGOTIATION)
      for (const nextStage of [
        'CONTACTED',
        'REPLIED',
        'INTERESTED',
        'MEETING',
        'PROPOSAL_SENT',
        'NEGOTIATION',
      ]) {
        const stRes = await engagementStatusPost(
          makeRequest(`http://localhost:3000/api/leads/${targetLead.id}/engagement/status`, {
            method: 'POST',
            token: e2eToken,
            body: {
              status: nextStage,
              note: `Transitioned to ${nextStage}`,
            },
          }),
          { params: { id: targetLead.id } }
        );
        expect(stRes.status).toBe(200);
      }

      // Step 17: Submits structured feedback
      const fbRes = await feedbackPost(
        makeRequest(`http://localhost:3000/api/leads/${targetLead.id}/feedback`, {
          method: 'POST',
          token: e2eToken,
          body: {
            category: 'LEAD_QUALITY',
            reasonCode: 'GREAT_LEAD',
            rating: 5,
            useful: true,
            comment: 'بيانات اتصال دقيقة والعميل جاهز للتعاقد',
            idempotencyKey: 'e2e-feedback-1',
          },
        }),
        { params: { id: targetLead.id } }
      );
      expect(fbRes.status).toBe(200);

      // Step 18: Updates final outcome to WON
      const wonRes = await engagementStatusPost(
        makeRequest(`http://localhost:3000/api/leads/${targetLead.id}/engagement/status`, {
          method: 'POST',
          token: e2eToken,
          body: {
            status: 'WON',
            estimatedProjectValue: 25000,
            wonReason: 'تم توقيع عقد تطوير موقع وحجز مواعيد العيادة',
            idempotencyKey: 'e2e-outcome-won-1',
          },
        }),
        { params: { id: targetLead.id } }
      );
      expect(wonRes.status).toBe(200);
      const wonData = await wonRes.json();
      expect(wonData.engagement.currentStatus).toBe('WON');
      expect(wonData.engagement.isTerminal).toBe(true);

      // --- ADMIN 12-STEP E2E JOURNEY ---
      // Step 1: Admin logs in via POST /api/auth/login
      const adminLoginRes = await loginPost(
        makeRequest('http://localhost:3000/api/auth/login', {
          method: 'POST',
          body: {
            email: adminUser.email,
            password: 'ProdPass@2026!',
          },
        })
      );
      expect(adminLoginRes.status).toBe(200);
      const adminLoginBody = await adminLoginRes.json();
      expect(adminLoginBody.user.role).toBe('ADMIN');

      // Step 2: Admin checks system health & observability dashboard
      const obsRes = await adminObservabilityGet(
        makeRequest('http://localhost:3000/api/admin/observability', {
          token: adminUser.token,
        })
      );
      expect(obsRes.status).toBe(200);
      const obsData = await obsRes.json();
      expect(obsData.systemHealth.liveness.alive).toBe(true);
      expect(obsData.systemHealth.readiness.ready).toBe(true);
      expect(obsData.production.featureFlags).toBeDefined();

      // Step 3: Admin sees lead inventory
      const admLeadsRes = await adminLeadsGet(
        makeRequest('http://localhost:3000/api/admin/leads', { token: adminUser.token })
      );
      expect(admLeadsRes.status).toBe(200);

      // Step 4: Admin sees quality overview
      const admQualRes = await adminQualityGet(
        makeRequest('http://localhost:3000/api/admin/quality', { token: adminUser.token })
      );
      expect(admQualRes.status).toBe(200);

      // Step 5: Admin sees ingestion & source health
      const admIngHealthRes = await adminIngestionHealthGet(
        makeRequest('http://localhost:3000/api/admin/ingestion/health', {
          token: adminUser.token,
        })
      );
      expect(admIngHealthRes.status).toBe(200);

      // Step 6: Admin sees matching rules & configuration
      const admMatchingRes = await adminMatchingRulesGet(
        makeRequest('http://localhost:3000/api/admin/matching/rules', {
          token: adminUser.token,
        })
      );
      expect(admMatchingRes.status).toBe(200);

      // Step 7 & 8: Admin sees claims & credits
      const admClaimsRes = await adminClaimsGet(
        makeRequest('http://localhost:3000/api/admin/claims', { token: adminUser.token })
      );
      expect(admClaimsRes.status).toBe(200);

      const admCreditsRes = await adminCreditsGet(
        makeRequest('http://localhost:3000/api/admin/credits', { token: adminUser.token })
      );
      expect(admCreditsRes.status).toBe(200);

      // Step 9: Admin sees analytics overview
      const admAnalyticsRes = await adminAnalyticsOverviewGet(
        makeRequest('http://localhost:3000/api/admin/analytics/overview', {
          token: adminUser.token,
        })
      );
      expect(admAnalyticsRes.status).toBe(200);

      // Step 10: Admin verifies audit logs
      const auditCount = await prisma.auditLog.count();
      expect(auditCount).toBeGreaterThan(5);

      // Step 11: Admin manages production configuration (updates feature flag with audit trail)
      const flagRes = await adminObservabilityPost(
        makeRequest('http://localhost:3000/api/admin/observability', {
          method: 'POST',
          token: adminUser.token,
          body: {
            action: 'UPDATE_FEATURE_FLAG',
            key: 'collector_scheduled_runs',
            enabled: false,
            reason: 'Keep external collectors paused during initial launch window',
          },
        })
      );
      expect(flagRes.status).toBe(200);
      expect(isFeatureFlagEnabled('collector_scheduled_runs')).toBe(false);
      expect(getFeatureFlagAuditHistory().length).toBeGreaterThanOrEqual(1);

      // Step 12: Admin handles operational issue (runs smoke tests & integrity check)
      const smokeAdminRes = await adminObservabilityPost(
        makeRequest('http://localhost:3000/api/admin/observability', {
          method: 'POST',
          token: adminUser.token,
          body: { action: 'RUN_SMOKE_TESTS' },
        })
      );
      expect(smokeAdminRes.status).toBe(200);
      const smokeAdminData = await smokeAdminRes.json();
      expect(smokeAdminData.report.allPassed).toBe(true);
    });
  });

  // ==========================================================================
  // 10. NEGATIVE E2E TESTS (SECTION 40)
  // ==========================================================================
  describe('10. Negative E2E Scenarios (Safe Failure Verification across all 18 Cases)', () => {
    it('safely rejects all 18 negative scenarios: unauthorized, suspended, expired, zero-credit, stale, closed, invalid phone, duplicate, exclusive claimed, shared full, duplicate click, invalid transition, invalid feedback, malformed CSV, duplicate job lock, failing source, bad webhook sig, and malicious input', async () => {
      // 1. Unauthorized developer
      const unauthClaim = await claimLeadRoute(
        makeRequest('http://localhost:3000/api/leads/nonexistent/claim', {
          method: 'POST',
          body: { accessType: 'SHARED' },
        }),
        { params: { id: 'nonexistent' } }
      );
      expect(unauthClaim.status).toBe(401);

      // Create a sample lead for negative claim tests
      const negLead = await prisma.lead.create({
        data: {
          businessName: 'شركة اختبار الحالات السلبية',
          normalizedName: 'شركة اختبار الحالات السلبية',
          category: 'Retail',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201055551111',
          normalizedPhone: '+201055551111',
          hasPhone: true,
          score: 75,
          qualityScore: 80,
          qualityStatus: 'HIGH',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          isCanonical: true,
          leadType: 'EXCLUSIVE',
          accessType: 'EXCLUSIVE',
          exclusive: true,
          creditCost: 25,
          maxPurchasers: 1,
          currentPurchasers: 0,
        },
      });

      // 2. Suspended developer
      const suspendedDev = await prisma.user.create({
        data: {
          email: 'suspended.dev@agency-eg.com',
          name: 'Suspended Dev',
          passwordHash: await hashPassword('Pass@12345'),
          role: 'DEVELOPER',
          status: 'SUSPENDED',
          creditAccount: { create: { balance: 100 } },
        },
      });
      const suspendedToken = await signSessionToken({
        userId: suspendedDev.id,
        email: suspendedDev.email,
        name: suspendedDev.name,
        role: 'DEVELOPER',
      });
      const suspendedClaimRes = await claimLeadRoute(
        makeRequest(`http://localhost:3000/api/leads/${negLead.id}/claim`, {
          method: 'POST',
          token: suspendedToken,
          body: { accessType: 'EXCLUSIVE' },
        }),
        { params: { id: negLead.id } }
      );
      expect(suspendedClaimRes.status).toBe(401);
      await expect(
        claimLead({ leadId: negLead.id, developerId: suspendedDev.id })
      ).rejects.toThrow();

      // 3. Expired subscription developer
      const expiredSubDev = await prisma.user.create({
        data: {
          email: 'expired.sub@agency-eg.com',
          name: 'Expired Sub Dev',
          passwordHash: await hashPassword('Pass@12345'),
          role: 'DEVELOPER',
          status: 'ACTIVE',
          developerProfile: {
            create: {
              services: ['Website Development'],
              locations: ['القاهرة'],
              niches: ['Retail'],
              isActive: true,
              isAcceptingLeads: true,
            },
          },
          subscription: {
            create: {
              planId: proPlanId,
              status: 'EXPIRED',
              credits: 0,
              totalCreditsGranted: 50,
              creditsUsed: 50,
              currentPeriodStart: new Date(Date.now() - 60 * 86400_000),
              currentPeriodEnd: new Date(Date.now() - 30 * 86400_000),
            },
          },
          creditAccount: { create: { balance: 0 } },
        },
      });
      await expect(
        claimLead({ leadId: negLead.id, developerId: expiredSubDev.id })
      ).rejects.toThrow();

      // 4. Insufficient credits developer
      const brokeDev = await prisma.user.create({
        data: {
          email: 'broke.dev@agency-eg.com',
          name: 'Zero Credit Dev',
          passwordHash: await hashPassword('Pass@12345'),
          role: 'DEVELOPER',
          status: 'ACTIVE',
          developerProfile: {
            create: {
              services: ['Website Development'],
              locations: ['القاهرة'],
              niches: ['Retail'],
              isActive: true,
              isAcceptingLeads: true,
            },
          },
          subscription: {
            create: {
              planId: proPlanId,
              status: 'ACTIVE',
              credits: 0,
              totalCreditsGranted: 0,
              creditsUsed: 0,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 86400_000),
            },
          },
          creditAccount: {
            create: { balance: 0 },
          },
        },
      });
      await expect(
        claimLead({
          leadId: negLead.id,
          developerId: brokeDev.id,
        })
      ).rejects.toThrow();

      // 5. Stale lead -> cannot be claimed
      const staleLead = await prisma.lead.create({
        data: {
          businessName: 'نشاط قديم غير محدث',
          normalizedName: 'نشاط قديم غير محدث',
          category: 'Retail',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201055552222',
          normalizedPhone: '+201055552222',
          hasPhone: true,
          score: 60,
          qualityScore: 60,
          freshnessStatus: 'STALE',
          status: 'STALE',
          saleabilityStatus: 'STALE',
          availableForClaim: false,
          isCanonical: true,
        },
      });
      await expect(
        claimLead({
          leadId: staleLead.id,
          developerId: devA.id,
        })
      ).rejects.toThrow();

      // 6. Closed business -> cannot be claimed
      const closedLead = await prisma.lead.create({
        data: {
          businessName: 'نشاط مغلق نهائياً',
          normalizedName: 'نشاط مغلق نهائياً',
          category: 'Retail',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201055553333',
          normalizedPhone: '+201055553333',
          hasPhone: true,
          businessStatus: 'CLOSED',
          status: 'CLOSED',
          saleabilityStatus: 'CLOSED',
          availableForClaim: false,
          isCanonical: true,
        },
      });
      await expect(
        claimLead({
          leadId: closedLead.id,
          developerId: devA.id,
        })
      ).rejects.toThrow();

      // 7. Invalid phone lead -> cannot be claimed
      const invalidPhoneLead = await prisma.lead.create({
        data: {
          businessName: 'نشاط بدون هاتف صالح',
          normalizedName: 'نشاط بدون هاتف صالح',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: null,
          normalizedPhone: null,
          hasPhone: false,
          phoneValidationStatus: 'INVALID',
          status: 'INVALID',
          saleabilityStatus: 'INVALID',
          availableForClaim: false,
          isCanonical: true,
        },
      });
      await expect(
        claimLead({ leadId: invalidPhoneLead.id, developerId: devA.id })
      ).rejects.toThrow();

      // 8. Non-canonical / duplicate lead -> cannot be claimed
      const duplicateNonCanonicalLead = await prisma.lead.create({
        data: {
          businessName: 'فرع مكرر غير أساسي',
          normalizedName: 'فرع مكرر غير أساسي',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201055554444',
          normalizedPhone: '+201055554444',
          hasPhone: true,
          isCanonical: false,
          mergedIntoLeadId: negLead.id,
          status: 'DUPLICATE',
          saleabilityStatus: 'DUPLICATE',
          availableForClaim: false,
        },
      });
      await expect(
        claimLead({ leadId: duplicateNonCanonicalLead.id, developerId: devA.id })
      ).rejects.toThrow();

      // 9. Exclusive lead claimed by devA -> cannot be claimed by devB, and 11. Duplicate claim click by devA is idempotent
      const firstExClaim = await claimLead({
        leadId: negLead.id,
        developerId: devA.id,
        idempotencyKey: 'neg-ex-claim-idem-1',
      });
      expect(firstExClaim.status).toBe('ACTIVE');

      // 11. Duplicate claim click with same idempotencyKey -> returns same claim without double-charging
      const duplicateClickClaim = await claimLead({
        leadId: negLead.id,
        developerId: devA.id,
        idempotencyKey: 'neg-ex-claim-idem-1',
      });
      expect(duplicateClickClaim.claimId).toBe(firstExClaim.claimId);
      expect(duplicateClickClaim.idempotentReplay).toBe(true);

      // 9. Already-claimed exclusive lead -> devB rejected
      await expect(
        claimLead({ leadId: negLead.id, developerId: devB.id })
      ).rejects.toThrow();

      // 10. Shared lead at max capacity -> rejected
      const fullSharedLead = await prisma.lead.create({
        data: {
          businessName: 'عيادة مشتركة مكتملة العدد',
          normalizedName: 'عيادة مشتركة مكتملة العدد',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201055556666',
          normalizedPhone: '+201055556666',
          hasPhone: true,
          isCanonical: true,
          leadType: 'SHARED',
          accessType: 'SHARED',
          exclusive: false,
          maxPurchasers: 1,
          currentPurchasers: 1,
          status: 'CLAIMED_FULL',
          saleabilityStatus: 'CLAIMED_FULL',
          availableForClaim: false,
        },
      });
      await expect(
        claimLead({ leadId: fullSharedLead.id, developerId: devB.id })
      ).rejects.toThrow();

      // 12. Invalid engagement status transition (jumping from CLAIMED directly to WON without intermediate steps)
      const invalidTransRes = await engagementStatusPost(
        makeRequest(`http://localhost:3000/api/leads/${negLead.id}/engagement/status`, {
          method: 'POST',
          token: devA.token,
          body: {
            status: 'WON',
            note: 'Illegal direct jump from CLAIMED to WON',
          },
        }),
        { params: { id: negLead.id } }
      );
      expect(invalidTransRes.status).toBeGreaterThanOrEqual(400);

      // 13. Invalid feedback submission (devB submitting feedback on a lead devB has NOT claimed)
      const unclaimedFbRes = await feedbackPost(
        makeRequest(`http://localhost:3000/api/leads/${negLead.id}/feedback`, {
          method: 'POST',
          token: devB.token,
          body: {
            category: 'LEAD_QUALITY',
            reasonCode: 'WRONG_PHONE',
            rating: 1,
            useful: false,
          },
        }),
        { params: { id: negLead.id } }
      );
      expect(unclaimedFbRes.status).toBeGreaterThanOrEqual(400);

      // 14. Malformed/empty CSV import payload -> 400
      const emptyCsvRes = await adminImportPost(
        makeRequest('http://localhost:3000/api/admin/import', {
          method: 'POST',
          token: adminUser.token,
          body: {
            sourceName: 'Empty CSV Test',
            csvContent: '',
          },
        })
      );
      expect(emptyCsvRes.status).toBe(400);

      // 15. Duplicate collector / scheduled job run while lock held -> LOCK_CONFLICT
      let releaseHold!: () => void;
      const holdPromise = new Promise<void>((r) => {
        releaseHold = r;
      });
      const activeRun = executeScheduledWorkerJob({
        jobKey: 'ingestion_scheduled_sync',
        db: prisma,
        customHandler: async () => {
          await holdPromise;
          return { recordsProcessed: 1 };
        },
      });
      const duplicateJobRun = await executeScheduledWorkerJob({
        jobKey: 'ingestion_scheduled_sync',
        db: prisma,
      });
      expect(duplicateJobRun.status).toBe('LOCK_CONFLICT');
      releaseHold();
      await activeRun;

      // 16. Failing external source with OPEN circuit breaker -> skipped safely by scheduled sync
      setFeatureFlagOverride({
        key: 'collector_scheduled_runs',
        enabled: true,
        actorId: adminUser.id,
        reason: 'Test open circuit skip',
      });
      const openCircuitSource = await prisma.leadSource.create({
        data: {
          name: 'Failing External Directory Source',
          type: 'DIRECTORY',
          isActive: true,
          enabled: true,
          circuitState: 'OPEN',
          consecutiveFailures: 5,
          nextRunAt: new Date(Date.now() - 60_000),
        },
      });
      const syncResult = await executeScheduledWorkerJob({
        jobKey: 'ingestion_scheduled_sync',
        db: prisma,
      });
      expect(syncResult.status).toBe('COMPLETED');
      await prisma.leadSource.delete({ where: { id: openCircuitSource.id } });
      setFeatureFlagOverride({
        key: 'collector_scheduled_runs',
        enabled: false,
        actorId: adminUser.id,
        reason: 'Restore default',
      });

      // 17. Invalid webhook signature on HTTP route -> 401
      const badWhRes = await paymentWebhookPost(
        makeRequest('http://localhost:3000/api/webhooks/payment', {
          method: 'POST',
          rawBody: JSON.stringify({ eventId: 'evt_bad_17', type: 'payment.succeeded' }),
          headers: { 'x-webhook-signature': 't=1700000000,v1=invalid_hmac' },
        })
      );
      expect(badWhRes.status).toBe(401);

      // 18. Malicious CSV formula injection payload -> sanitized during import, and public_registration_enabled kill switch blocks registration
      const csvImportRes = await adminImportPost(
        makeRequest('http://localhost:3000/api/admin/import', {
          method: 'POST',
          token: adminUser.token,
          body: {
            sourceName: 'Negative Test CSV',
            fileName: 'negative_test.csv',
            csvContent:
              'name,category,city,phone\n"=cmd|\'/C calc\'!A0 Evil Clinic",Dental,القاهرة,01077889900',
          },
        })
      );
      expect(csvImportRes.status).toBe(200);
      const importedLead = await prisma.lead.findFirst({
        where: { normalizedPhone: '+201077889900' },
      });
      if (importedLead) {
        expect(importedLead.businessName.startsWith('=')).toBe(false);
      }

      // Verify public_registration_enabled kill switch blocks POST /api/auth/register with 503
      setFeatureFlagOverride({
        key: 'public_registration_enabled',
        enabled: false,
        actorId: adminUser.id,
        reason: 'Pause registration',
      });
      const blockedRegRes = await registerPost(
        makeRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          body: {
            name: 'Blocked User',
            email: 'blocked.reg@agency-eg.com',
            password: 'StrongPassword@123!',
          },
        })
      );
      expect(blockedRegRes.status).toBe(503);
      const blockedRegBody = await blockedRegRes.json();
      expect(blockedRegBody.code).toBe('PUBLIC_REGISTRATION_DISABLED');
      setFeatureFlagOverride({
        key: 'public_registration_enabled',
        enabled: true,
        actorId: adminUser.id,
        reason: 'Re-enable registration',
      });
    });
  });

  // ==========================================================================
  // 11. DATA QUALITY GATE, CONCURRENT LOAD TEST & LAUNCH GATE (SECTIONS 17, 37, 38, 41, 50)
  // ==========================================================================
  describe('11. Production Data Quality Gate, Concurrent Claim Load Test & Launch Gate', () => {
    it('passes the 14-point non-destructive Production Data Quality Gate', async () => {
      const qualityGate = await runProductionDataQualityGate(prisma);
      expect(qualityGate.checks).toHaveLength(14);
      expect(qualityGate.criticalViolations).toBe(0);
      expect(qualityGate.gatePassed).toBe(true);
    });

    it('enforces strict financial and capacity invariants under concurrent load on shared and exclusive leads (Section 38)', async () => {
      // Create 6 concurrent developers each with 50 credits
      const concurrentDevs: string[] = [];
      for (let i = 0; i < 6; i++) {
        const u = await prisma.user.create({
          data: {
            email: `load.dev.${i}@agency-eg.com`,
            name: `Load Tester ${i}`,
            passwordHash: 'hash',
            role: 'DEVELOPER',
            status: 'ACTIVE',
            developerProfile: {
              create: {
                services: ['Website Development'],
                locations: ['القاهرة'],
                niches: ['Dental'],
                isActive: true,
                isAcceptingLeads: true,
              },
            },
            subscription: {
              create: {
                planId: proPlanId,
                status: 'ACTIVE',
                credits: 50,
                totalCreditsGranted: 50,
                creditsUsed: 0,
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 86400_000),
              },
            },
            creditAccount: {
              create: {
                balance: 50,
                lifetimePurchased: 50,
                totalGranted: 50,
              },
            },
          },
          include: { creditAccount: true },
        });
        await prisma.creditTransaction.create({
          data: {
            accountId: u.creditAccount!.id,
            developerId: u.id,
            type: 'PURCHASE',
            amount: 50,
            balanceBefore: 0,
            balanceAfter: 50,
            reason: 'Load test init',
          },
        });
        concurrentDevs.push(u.id);
      }

      // 1. Exclusive lead concurrent race: 6 developers attempt to claim simultaneously -> only 1 can succeed
      const exclusiveRaceLead = await prisma.lead.create({
        data: {
          businessName: 'عيادة التنافس الحصري',
          normalizedName: 'عيادة التنافس الحصري',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201066661111',
          normalizedPhone: '+201066661111',
          hasPhone: true,
          score: 88,
          temperature: 'PREMIUM',
          qualityScore: 90,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          isCanonical: true,
          leadType: 'EXCLUSIVE',
          accessType: 'EXCLUSIVE',
          exclusive: true,
          creditCost: 25,
          maxPurchasers: 1,
          currentPurchasers: 0,
        },
      });

      const exclusiveResults = await Promise.allSettled(
        concurrentDevs.map((devId) =>
          claimLead({
            leadId: exclusiveRaceLead.id,
            developerId: devId,
          })
        )
      );
      const exclusiveSuccesses = exclusiveResults.filter((r) => r.status === 'fulfilled');
      expect(exclusiveSuccesses).toHaveLength(1);

      // 2. Shared lead concurrent race: maxPurchasers = 3, 6 developers race -> exactly 3 succeed
      const sharedRaceLead = await prisma.lead.create({
        data: {
          businessName: 'عيادة التنافس المشترك',
          normalizedName: 'عيادة التنافس المشترك',
          category: 'Dental',
          governorate: 'القاهرة',
          city: 'القاهرة',
          phone: '+201066662222',
          normalizedPhone: '+201066662222',
          hasPhone: true,
          score: 78,
          temperature: 'HOT',
          qualityScore: 85,
          qualityStatus: 'EXCELLENT',
          freshnessStatus: 'FRESH',
          verificationStatus: 'VERIFIED',
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          availableForClaim: true,
          requiresMatching: false,
          isCanonical: true,
          leadType: 'SHARED',
          accessType: 'SHARED',
          exclusive: false,
          creditCost: 5,
          maxPurchasers: 3,
          currentPurchasers: 0,
        },
      });

      const sharedResults = await Promise.allSettled(
        concurrentDevs.map((devId) =>
          claimLead({
            leadId: sharedRaceLead.id,
            developerId: devId,
          })
        )
      );
      const sharedSuccesses = sharedResults.filter((r) => r.status === 'fulfilled');
      expect(sharedSuccesses).toHaveLength(3);

      // Verify all 7 financial and capacity invariants hold after concurrent load
      const postLoadIntegrity = await runDataIntegrityChecks(prisma);
      expect(postLoadIntegrity.healthy).toBe(true);
      expect(postLoadIntegrity.totalViolations).toBe(0);
    });

    it('runs the 16-step Smoke Test Suite, verifies Production Inventories, and evaluates the Production Launch Gate honestly', async () => {
      expect(PRODUCTION_SUBSYSTEM_INVENTORY.length).toBeGreaterThanOrEqual(20);
      expect(PRODUCTION_API_INVENTORY.length).toBeGreaterThanOrEqual(20);
      expect(PRODUCTION_DATABASE_INVENTORY).toHaveLength(35);

      const smoke = await runProductionSmokeTests(prisma);
      expect(smoke.allPassed).toBe(true);
      expect(smoke.passedCount).toBe(16);
      expect(smoke.failedCount).toBe(0);

      const launchGate = await evaluateProductionLaunchGate(prisma, process.env);
      expect(launchGate.applicationAndCodeReadiness).toBe('READY');
      expect(launchGate.gates.buildAndTests.status).toBe('VERIFIED');
      expect(launchGate.gates.databaseMigrationSafety.status).toBe('VERIFIED');
      expect(launchGate.gates.backupAndStagingRestore.status).toBe('VERIFIED');
      expect(launchGate.gates.claimsAndCredits.status).toBe('VERIFIED');
      expect(launchGate.gates.dataQualityGate.status).toBe('VERIFIED');
      // External live infrastructure items must be honestly marked NOT_VERIFIED in local test env
      expect(launchGate.gates.liveProductionRestoreTest.status).toBe('NOT_VERIFIED');
      expect(launchGate.gates.domainAndHttps.status).toBe('NOT_VERIFIED');
    });
  });
});

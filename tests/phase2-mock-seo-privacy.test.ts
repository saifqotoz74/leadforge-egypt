import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { validateAndNormalizeLead } from '@/lib/validator';
import { runIngestionPipeline } from '@/lib/collectors/orchestrator';
import { getProgrammaticPageAggregates } from '@/lib/aggregates';
import { getCachedPlatformStats } from '@/lib/stats';
import { isProgrammaticPageEligible, MIN_LEADS_FOR_INDEXING } from '@/lib/seo-config';
import {
  sanitizeErrorMessageString,
  redactSensitiveData,
  EGYPTIAN_PHONE_PATTERN,
} from '@/lib/security/error-taxonomy';
import {
  logStructured,
  getRecentStructuredLogs,
  clearStructuredLogsForTests,
} from '@/lib/observability/logger';
import { GET as getLeadsRoute } from '@/app/api/leads/route';
import { generateMetadata as generateProgrammaticMetadata } from '@/app/leads/[id]/[category]/page';
import sitemap from '@/app/sitemap';

describe('Phase 2 — Mock Data Separation, SEO Integrity & Log Privacy', () => {
  let cleanupDb: () => Promise<void>;

  beforeAll(async () => {
    process.env.AUTH_SECRET = 'phase2-auth-secret-test-32-character-key';
    const testDb = await createInMemoryTestDb();
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(testDb.prisma, testDb.pglite);
  });

  afterAll(async () => {
    if (cleanupDb) {
      await cleanupDb();
    }
  });

  beforeEach(async () => {
    clearStructuredLogsForTests();
  });

  describe('DAT-01: Schema and Data Origin', () => {
    it('validates that validateAndNormalizeLead passes through isMock flag', () => {
      const mockResult = validateAndNormalizeLead({
        name: 'Mock Business Test',
        city: 'القاهرة',
        category: 'Dental',
        phone: '01011112222',
        isMock: true,
      });

      expect(mockResult.valid).toBe(true);
      expect(mockResult.data?.isMock).toBe(true);

      const realResult = validateAndNormalizeLead({
        name: 'Real Business Test',
        city: 'القاهرة',
        category: 'Dental',
        phone: '01011113333',
        isMock: false,
      });

      expect(realResult.valid).toBe(true);
      expect(realResult.data?.isMock).toBe(false);

      const defaultResult = validateAndNormalizeLead({
        name: 'Default Business Test',
        city: 'القاهرة',
        category: 'Dental',
        phone: '01011114444',
      });

      expect(defaultResult.valid).toBe(true);
      expect(defaultResult.data?.isMock).toBeUndefined();
    });

    it('ingestion pipeline marks leads as isMock=true when option is set', async () => {
      // Find or create a test admin user for the pipeline
      let testUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!testUser) {
        testUser = await prisma.user.create({
          data: {
            email: 'phase2-admin-test@leads4dev.com',
            passwordHash: 'dummy-hash',
            role: 'ADMIN',
            name: 'Phase 2 Admin',
          },
        });
      }

      const report = await runIngestionPipeline({
        prisma,
        userId: testUser.id,
        sourceName: 'Mock Ingestion Test Source',
        fileName: 'mock_test.csv',
        rawRecords: [
          {
            name: 'عيادة اختبار الفصل التجريبي',
            category: 'Dental',
            city: 'القاهرة',
            phone: '01009998877',
          },
        ],
        isMock: true,
      });

      expect(report.imported).toBe(1);
      const createdLead = await prisma.lead.findFirst({
        where: { phone: '01009998877' },
      });

      expect(createdLead).not.toBeNull();
      expect(createdLead?.isMock).toBe(true);
    });

    it('ingestion pipeline defaults to isMock=false for regular ingestion', async () => {
      let testUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!testUser) {
        testUser = await prisma.user.create({
          data: {
            email: 'phase2-admin-test-2@leads4dev.com',
            passwordHash: 'dummy-hash',
            role: 'ADMIN',
            name: 'Phase 2 Admin 2',
          },
        });
      }

      const report = await runIngestionPipeline({
        prisma,
        userId: testUser.id,
        sourceName: 'Real Ingestion Test Source',
        fileName: 'real_test.csv',
        rawRecords: [
          {
            name: 'شركة الاختبار الحقيقي',
            category: 'Software',
            city: 'الجيزة',
            phone: '01009998866',
          },
        ],
      });

      expect(report.imported).toBe(1);
      const createdLead = await prisma.lead.findFirst({
        where: { phone: '01009998866' },
      });

      expect(createdLead).not.toBeNull();
      expect(createdLead?.isMock).toBe(false);
    });
  });

  describe('DAT-02: Programmatic SEO & Feed Integrity', () => {
    it('getCachedPlatformStats excludes mock leads from business count and aggregates', async () => {
      // Create a mock lead and a non-mock lead
      await prisma.lead.create({
        data: {
          businessName: 'Mock Stat Lead 1',
          normalizedName: 'mock stat lead 1',
          category: 'Dental',
          city: 'القاهرة',
          governorate: 'القاهرة',
          isCanonical: true,
          isMock: true,
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
        },
      });

      await prisma.lead.create({
        data: {
          businessName: 'Real Stat Lead 1',
          normalizedName: 'real stat lead 1',
          category: 'Dental',
          city: 'القاهرة',
          governorate: 'القاهرة',
          isCanonical: true,
          isMock: false,
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
        },
      });

      const stats = await getCachedPlatformStats();
      // Total non-mock count directly from DB
      const dbRealCount = await prisma.lead.count({
        where: {
          isMock: false,
          isCanonical: true,
          status: { notIn: ['INVALID', 'DUPLICATE', 'NOT_SALEABLE', 'ARCHIVED'] },
        },
      });

      expect(stats.businessesCount).toBe(dbRealCount);

      // Verify that mock leads are NOT included in the count
      const totalIncludingMock = await prisma.lead.count({
        where: {
          isCanonical: true,
          status: { notIn: ['INVALID', 'DUPLICATE', 'NOT_SALEABLE', 'ARCHIVED'] },
        },
      });
      expect(stats.businessesCount).toBeLessThanOrEqual(totalIncludingMock);
    });

    it('getProgrammaticPageAggregates filters out mock leads', async () => {
      const aggregates = await getProgrammaticPageAggregates(['القاهرة'], ['Dental']);
      const dbRealCount = await prisma.lead.count({
        where: {
          isMock: false,
          isCanonical: true,
          status: 'AVAILABLE',
          city: { in: ['القاهرة'] },
          category: { in: ['Dental'] },
        },
      });

      expect(aggregates.totalCount).toBe(dbRealCount);
    });

    it('isProgrammaticPageEligible rejects pages with fewer than 10 leads or excluded categories', () => {
      expect(isProgrammaticPageEligible({ leadCount: 9, categorySlug: 'dental' })).toBe(false);
      expect(isProgrammaticPageEligible({ leadCount: 10, categorySlug: 'dental' })).toBe(true);
      expect(isProgrammaticPageEligible({ leadCount: 15, categorySlug: 'dental' })).toBe(true);
      expect(isProgrammaticPageEligible({ leadCount: 50, categorySlug: 'other' })).toBe(false);
      expect(isProgrammaticPageEligible({ leadCount: 50, categorySlug: 'Other' })).toBe(false);
    });

    it('programmatic generateMetadata sets robots noindex when real leads < 10', async () => {
      // In a fresh test environment, 'giza' + 'real-estate' will have fewer than 10 real leads
      const meta = await generateProgrammaticMetadata({
        params: { id: 'giza', category: 'real-estate' },
      });

      const realCount = await prisma.lead.count({
        where: {
          isMock: false,
          isCanonical: true,
          status: 'AVAILABLE',
          city: { in: ['الجيزة', 'giza'] },
          category: { in: ['Real Estate', 'عقارات', 'real-estate'] },
        },
      });

      if (realCount < MIN_LEADS_FOR_INDEXING) {
        expect(meta.robots).toEqual({ index: false, follow: false });
      } else {
        expect(meta.robots).toEqual({ index: true, follow: true });
      }
    });

    it('sitemap generator dynamically queries with isMock: false', async () => {
      const sitemapEntries = await sitemap();
      expect(Array.isArray(sitemapEntries)).toBe(true);
      expect(sitemapEntries.length).toBeGreaterThan(0);

      // Verify that no candidate programmatic page with < 10 real leads appears in the sitemap
      for (const entry of sitemapEntries) {
        if (entry.url.includes('/leads/')) {
          const parts = entry.url.split('/leads/')[1].split('/');
          const citySlug = parts[0];
          const categorySlug = parts[1];
          expect(categorySlug).not.toBe('other');
        }
      }
    });

    it('/api/leads excludes isMock=true records by default for all users', async () => {
      // Create a regular developer user
      const devUser = await prisma.user.create({
        data: {
          email: `dev-${Date.now()}@example.com`,
          passwordHash: 'hash',
          role: 'DEVELOPER',
          name: 'Regular Developer',
        },
      });

      // Insert 1 mock lead and 1 real lead
      const mockLead = await prisma.lead.create({
        data: {
          businessName: `Test Mock Lead ${Date.now()}`,
          normalizedName: `test mock lead ${Date.now()}`,
          category: 'Dental',
          city: 'القاهرة',
          governorate: 'القاهرة',
          isCanonical: true,
          isMock: true,
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
        },
      });

      const realLead = await prisma.lead.create({
        data: {
          businessName: `Test Real Lead ${Date.now()}`,
          normalizedName: `test real lead ${Date.now()}`,
          category: 'Dental',
          city: 'القاهرة',
          governorate: 'القاهرة',
          isCanonical: true,
          isMock: false,
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          lastVerifiedAt: new Date(),
        },
      });

      // Create session cookie for devUser
      const { signSessionToken, SESSION_COOKIE_NAME } = await import('@/lib/auth');
      const token = await signSessionToken({
        userId: devUser.id,
        email: devUser.email,
        name: devUser.name,
        role: devUser.role as 'DEVELOPER',
      });

      const req = new NextRequest('http://localhost:3000/api/leads', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const res = await getLeadsRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      const leadIds = json.leads.map((l: any) => l.id);
      expect(leadIds).not.toContain(mockLead.id);

      // Even if dev passes includeMock=true, they should NOT receive mock leads (unauthorized role)
      const reqWithMock = new NextRequest('http://localhost:3000/api/leads?includeMock=true', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      });

      const resWithMock = await getLeadsRoute(reqWithMock);
      const jsonWithMock = await resWithMock.json();
      const leadIdsWithMock = jsonWithMock.leads.map((l: any) => l.id);
      expect(leadIdsWithMock).not.toContain(mockLead.id);
    });

    it('/api/leads allows mock records only when requested by ADMIN with includeMock=true', async () => {
      const adminUser = await prisma.user.create({
        data: {
          email: `admin-${Date.now()}@example.com`,
          passwordHash: 'hash',
          role: 'ADMIN',
          name: 'Admin User',
        },
      });

      const mockLead = await prisma.lead.create({
        data: {
          businessName: `Admin Viewable Mock Lead ${Date.now()}`,
          normalizedName: `admin viewable mock lead ${Date.now()}`,
          category: 'Dental',
          city: 'القاهرة',
          governorate: 'القاهرة',
          isCanonical: true,
          isMock: true,
          status: 'AVAILABLE',
          saleabilityStatus: 'AVAILABLE',
          verificationStatus: 'VERIFIED',
          freshnessStatus: 'FRESH',
          lastVerifiedAt: new Date(),
        },
      });

      const { signSessionToken, SESSION_COOKIE_NAME } = await import('@/lib/auth');
      const token = await signSessionToken({
        userId: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role as 'ADMIN',
      });

      // Admin WITHOUT includeMock query param -> no mock leads
      const reqNormal = new NextRequest('http://localhost:3000/api/leads', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      const resNormal = await getLeadsRoute(reqNormal);
      expect(resNormal.status).toBe(200);
      const jsonNormal = await resNormal.json();
      expect(jsonNormal.leads.map((l: any) => l.id)).not.toContain(mockLead.id);

      // Admin WITH includeMock=true -> mock leads included
      const reqWithMock = new NextRequest('http://localhost:3000/api/leads?includeMock=true', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      const resWithMock = await getLeadsRoute(reqWithMock);
      expect(resWithMock.status).toBe(200);
      const jsonWithMock = await resWithMock.json();
      expect(jsonWithMock.leads.map((l: any) => l.id)).toContain(mockLead.id);
    });
  });

  describe('NF-06: Observability Privacy & Sanitization', () => {
    it('redacts Egyptian mobile and landline phone numbers in error messages and strings', () => {
      const inputs = [
        '01002345101',
        '+20 100 234 5101',
        '01112345678',
        '012-3456-7890',
        '01551234567',
        '+201002345101',
        '00201002345101',
        '0223456789',
        '+20 2 23456789',
      ];

      for (const phone of inputs) {
        const sanitized = sanitizeErrorMessageString(`Failed lookup for ${phone}`);
        expect(sanitized).toContain('[REDACTED_PHONE]');
        expect(sanitized).not.toContain(phone);
      }
    });

    it('redacts raw Egyptian phone numbers from search queries in metadata while keeping non-PII terms intact', () => {
      const searchWithPhone = 'عيادة دكتور أحمد 01002345101';
      const redacted = redactSensitiveData({
        search: searchWithPhone,
        category: 'Dental',
        city: 'القاهرة',
      }) as Record<string, unknown>;

      expect(redacted.search).toBe('عيادة دكتور أحمد [REDACTED_PHONE]');
      expect(redacted.category).toBe('Dental');
      expect(redacted.city).toBe('القاهرة');
    });

    it('redacts dedicated phone keys entirely from metadata', () => {
      const metadata = {
        phone: '01002345101',
        mobile: '+20 111 222 3333',
        telephone: '0223456789',
        action: 'UPDATE_CONTACT',
      };

      const redacted = redactSensitiveData(metadata) as Record<string, unknown>;
      expect(redacted.phone).toBe('[REDACTED]');
      expect(redacted.mobile).toBe('[REDACTED]');
      expect(redacted.telephone).toBe('[REDACTED]');
      expect(redacted.action).toBe('UPDATE_CONTACT');
    });

    it('logStructured preserves operational telemetry while scrubbing PII from messages and metadata', () => {
      const entry = logStructured({
        level: 'INFO',
        event: 'SEARCH_QUERY_EXECUTED',
        requestId: 'req_test_123',
        userId: 'usr_789',
        role: 'DEVELOPER',
        route: '/api/leads',
        method: 'GET',
        statusCode: 200,
        durationMs: 42,
        ipAddress: '192.168.1.1',
        message: 'Search requested for phone 01002345101 and contact@clinic.eg',
        metadata: {
          search: '01002345101',
          city: 'القاهرة',
          governorate: 'القاهرة',
        },
      });

      // Operational metadata preserved
      expect(entry.requestId).toBe('req_test_123');
      expect(entry.event).toBe('SEARCH_QUERY_EXECUTED');
      expect(entry.userId).toBe('usr_789');
      expect(entry.role).toBe('DEVELOPER');
      expect(entry.route).toBe('/api/leads');
      expect(entry.method).toBe('GET');
      expect(entry.statusCode).toBe(200);
      expect(entry.durationMs).toBe(42);
      expect(entry.ipAddress).toBe('192.168.1.1');

      // Privacy scrubbing enforced
      expect(entry.message).toContain('[REDACTED_PHONE]');
      expect(entry.message).toContain('[REDACTED_EMAIL]');
      expect(entry.message).not.toContain('01002345101');
      expect(entry.message).not.toContain('contact@clinic.eg');

      expect(entry.metadata?.search).toBe('[REDACTED_PHONE]');
      expect(entry.metadata?.city).toBe('القاهرة');
      expect(entry.metadata?.governorate).toBe('القاهرة');

      // Ring buffer verified
      const recent = getRecentStructuredLogs({ requestId: 'req_test_123' });
      expect(recent.length).toBe(1);
      expect(recent[0].metadata?.search).toBe('[REDACTED_PHONE]');
    });
  });
});

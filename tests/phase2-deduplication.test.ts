import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import { DEFAULT_SCORING_RULES } from '@/lib/scoring-engine';
import {
  NormalizationService,
  normalizeBusinessName,
  extractCoreBrandName,
  compareBusinessNames,
  normalizePhone,
  normalizePhones,
  parsePhoneDetails,
  normalizeEmail,
  normalizeDomain,
  normalizeSocialUrl,
  normalizeAddress,
  parseAddressDetails,
  compareAddresses,
  generateCanonicalIdentityKeys,
  evaluateDeduplicationCandidates,
  evaluateLeadDeduplication,
  mergeSourceIntoCanonicalLead,
  unmergeLead,
  getRecentDeduplicationLogs,
  getRecentMergeLogs,
} from '@/lib/deduplication';
import { validateAndNormalizeLead } from '@/lib/validator';
import { runIngestionPipeline } from '@/lib/collectors';

// API Route Handlers
import { POST as adminLeadsPostHandler, GET as adminLeadsGetHandler } from '@/app/api/admin/leads/route';
import { POST as adminImportPostHandler } from '@/app/api/admin/import/route';
import {
  GET as adminDuplicatesGetHandler,
  POST as adminDuplicatesPostHandler,
} from '@/app/api/admin/duplicates/route';
import {
  GET as adminDuplicateByIdGetHandler,
  POST as adminDuplicateByIdPostHandler,
} from '@/app/api/admin/duplicates/[id]/route';
import { POST as adminDuplicateMergeHandler } from '@/app/api/admin/duplicates/[id]/merge/route';
import { POST as adminDuplicateRejectHandler } from '@/app/api/admin/duplicates/[id]/reject/route';
import { GET as adminDuplicateHistoryHandler } from '@/app/api/admin/duplicates/history/route';
import { POST as adminDuplicateUnmergeHandler } from '@/app/api/admin/duplicates/unmerge/route';
import { GET as adminReportsGetHandler } from '@/app/api/admin/reports/route';
import { GET as leadsGetHandler } from '@/app/api/leads/route';

describe('PHASE 2 — Deterministic Lead Deduplication & Entity Resolution Engine', () => {
  describe('1. Centralized Normalization Service (Unit Tests)', () => {
    it('normalizes Arabic & English business names, removes corporate suffixes, and extracts core brand without aggressive transliteration', () => {
      const n1 = normalizeBusinessName('  شركة   النور  للتجارة   والتوزيع  ش.م.م  ');
      expect(n1).toBe('شركه النور للتجاره والتوزيع');

      const core1 = extractCoreBrandName('شركة النور للتجارة والتوزيع ش.م.م');
      expect(core1).toBe('النور للتجاره والتوزيع');

      const n2 = normalizeBusinessName('El-Nour Trading & Distribution Co. LLC');
      expect(n2).toBe('el nour trading and distribution');

      // Must NOT equate Arabic and English names via aggressive transliteration
      const crossLang = compareBusinessNames('شركة النور للتجارة', 'El Nour Trading');
      expect(crossLang.exactNormalizedMatch).toBe(false);
      expect(crossLang.coreBrandMatch).toBe(false);

      // Same Arabic brand with & without generic prefix "شركة" matches on coreBrandMatch
      const sameBrand = compareBusinessNames('شركة النور للتجارة ش.م.م', 'النور للتجارة ذ.م.م');
      expect(sameBrand.coreBrandMatch).toBe(true);
    });

    it('normalizes Egyptian mobile, landline, international phones, extensions, and multiple phone numbers', () => {
      // Mobile variations
      expect(normalizePhone('01001234567')).toBe('201001234567');
      expect(normalizePhone('+20 100 123 4567')).toBe('201001234567');
      expect(normalizePhone('0020-100-123-4567')).toBe('201001234567');
      expect(normalizePhone('٠١٠٠١٢٣٤٥٦٧')).toBe('201001234567');
      expect(normalizePhone('(+20) 100 123 4567')).toBe('201001234567');

      const mobileDetails = parsePhoneDetails('+20 100 123 4567');
      expect(mobileDetails).not.toBeNull();
      expect(mobileDetails?.e164).toBe('+201001234567');
      expect(mobileDetails?.type).toBe('MOBILE');

      // Egyptian landline with extension
      const landlineDetails = parsePhoneDetails('02-2795-1234 ext. 105');
      expect(landlineDetails).not.toBeNull();
      expect(landlineDetails?.normalized).toBe('20227951234');
      expect(landlineDetails?.e164).toBe('+20227951234');
      expect(landlineDetails?.type).toBe('LANDLINE');
      expect(landlineDetails?.extension).toBe('105');

      // Multiple phone numbers separated by slash/comma
      const multi = normalizePhones('01001234567 / +20 111 222 3333');
      expect(multi).toEqual(['201001234567', '201112223333']);

      // Invalid phones rejected
      expect(normalizePhone('12345')).toBeNull();
      expect(normalizePhone('not-a-phone')).toBeNull();
    });

    it('normalizes emails, website domains (filtering social URLs), and social handles', () => {
      expect(normalizeEmail('  Info@ABC-Dental.EG  ')).toBe('info@abc-dental.eg');
      expect(normalizeEmail('invalid-email')).toBeNull();

      expect(normalizeDomain('https://www.Example.com/')).toBe('example.com');
      expect(normalizeDomain('http://sub.example.com/contact?ref=ads#top')).toBe(
        'sub.example.com'
      );
      // Social media URLs must NOT be treated as standalone business website domains
      expect(normalizeDomain('https://www.facebook.com/MyClinicPage')).toBeNull();
      expect(normalizeDomain('https://instagram.com/myclinic')).toBeNull();

      // Social URL normalization
      expect(
        normalizeSocialUrl(
          'https://m.facebook.com/ExampleBusiness/?ref=page_internal&utm_source=fb',
          'FACEBOOK'
        )
      ).toBe('facebook.com/examplebusiness');
      expect(
        normalizeSocialUrl('https://www.instagram.com/Nile.Dental.Clinic/', 'INSTAGRAM')
      ).toBe('instagram.com/nile.dental.clinic');
    });

    it('normalizes addresses and detects building number conflicts for neighboring businesses', () => {
      const addr1 = normalizeAddress('١٥ ش عباس العقاد، مدينة نصر، القاهرة');
      const addr2 = normalizeAddress('15 شارع عباس العقاد - مدينة نصر - القاهرة');
      expect(addr1).toBe(addr2);

      const details1 = parseAddressDetails('15 شارع عباس العقاد، مدينة نصر');
      expect(details1?.buildingNumber).toBe('15');

      // Same street, DIFFERENT building numbers -> buildingConflict = true!
      const cmp = compareAddresses(
        '15 شارع عباس العقاد، مدينة نصر',
        '25 شارع عباس العقاد، مدينة نصر'
      );
      expect(cmp.buildingConflict).toBe(true);
      expect(cmp.exactMatch).toBe(false);
    });

    it('generates deterministic Canonical Identity Keys in the exact required format', () => {
      const keys = generateCanonicalIdentityKeys({
        businessName: 'عيادة النيل للأسنان',
        city: 'القاهرة',
        address: '15 شارع عباس العقاد، مدينة نصر',
        phone: '01001234567',
        phones: ['01112223333'],
        email: 'info@niledental.eg',
        website: 'https://www.niledental.eg/contact',
        facebook: 'https://facebook.com/NileDentalEg',
        sourceType: 'GOOGLE_BUSINESS',
        externalId: 'ChIJ_NileDental_123',
      });

      expect(keys.allKeys).toContain('SOURCE:GOOGLE_BUSINESS:ChIJ_NileDental_123');
      expect(keys.allKeys).toContain('DOMAIN:niledental.eg');
      expect(keys.allKeys).toContain('PHONE:201001234567');
      expect(keys.allKeys).toContain('PHONE:201112223333');
      expect(keys.allKeys).toContain('EMAIL:info@niledental.eg');
      expect(keys.allKeys).toContain('SOCIAL:facebook.com/niledentaleg');
      expect(keys.allKeys.some((k) => k.startsWith('NAME:') && k.includes(':CITY:'))).toBe(true);
      expect(
        keys.allKeys.some((k) => k.startsWith('NAME:') && k.includes(':ADDRESS:'))
      ).toBe(true);
    });
  });

  describe('2. Required Test Cases A–H & Integration Pipeline (PostgreSQL / PGlite)', () => {
    let prisma: PrismaClient;
    let cleanupDb: () => Promise<void>;
    let adminUser: { id: string; email: string; name: string; role: 'ADMIN' };
    let devUser: { id: string; email: string; name: string; role: 'DEVELOPER' };
    let adminToken: string;
    let devToken: string;

    beforeAll(async () => {
      const testDb = await createInMemoryTestDb();
      prisma = testDb.prisma;
      cleanupDb = testDb.cleanup;
      setPrismaClientForTesting(testDb.prisma, testDb.pglite);

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

      const passwordHash = await hashPassword('Test@12345');
      const createdAdmin = await prisma.user.create({
        data: {
          email: 'admin.phase2@leadforge.eg',
          name: 'Phase 2 Admin',
          passwordHash,
          role: 'ADMIN',
        },
      });
      adminUser = { ...createdAdmin, role: 'ADMIN' };

      const createdDev = await prisma.user.create({
        data: {
          email: 'dev.phase2@leadforge.eg',
          name: 'Phase 2 Developer',
          passwordHash,
          role: 'DEVELOPER',
        },
      });
      devUser = { ...createdDev, role: 'DEVELOPER' };

      adminToken = await signSessionToken({
        userId: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: 'ADMIN',
      });

      devToken = await signSessionToken({
        userId: devUser.id,
        email: devUser.email,
        name: devUser.name,
        role: 'DEVELOPER',
      });
    });

    afterAll(async () => {
      if (cleanupDb) await cleanupDb();
    });

    it('Test A — Phone Variations (01001234567, +20 100 123 4567, ٠١٠٠١٢٣٤٥٦٧) resolve to 1 canonical lead', async () => {
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source 1',
        rawRecords: [
          {
            name: 'مركز ألفا الطبي',
            category: 'Medical',
            city: 'القاهرة',
            phone: '01001234567',
          },
        ],
      });
      expect(r1.valid).toBe(1);
      const canonicalLeadId = r1.records[0].leadId!;

      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source 2',
        rawRecords: [
          {
            name: 'مركز ألفا الطبي التخصصي',
            category: 'Medical',
            city: 'القاهرة',
            phone: '+20 100 123 4567',
          },
        ],
      });
      expect(r2.duplicates).toBe(1);
      expect(r2.records[0].decision).toBe('DUPLICATE_CONFIRMED');
      expect(r2.records[0].leadId).toBe(canonicalLeadId);

      const r3 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source 3',
        rawRecords: [
          {
            name: 'Alpha Medical Center',
            category: 'Medical',
            city: 'Cairo',
            phone: '٠١٠٠١٢٣٤٥٦٧',
          },
        ],
      });
      expect(r3.duplicates).toBe(1);
      expect(r3.records[0].decision).toBe('DUPLICATE_CONFIRMED');
      expect(r3.records[0].leadId).toBe(canonicalLeadId);

      const matchingLeads = await prisma.lead.findMany({
        where: { normalizedPhone: '201001234567', isCanonical: true },
      });
      expect(matchingLeads).toHaveLength(1);
    });

    it('Test B — Domain Variations (http://www.example.com vs https://example.com/about) resolve to 1 canonical lead', async () => {
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Website Registry',
        rawRecords: [
          {
            name: 'شركة دلتا للحلول الهندسية',
            category: 'Real Estate',
            city: 'الجيزة',
            website: 'http://www.delta-eng-eg.com',
          },
        ],
      });
      expect(r1.valid).toBe(1);
      const canonicalLeadId = r1.records[0].leadId!;

      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory Export',
        rawRecords: [
          {
            name: 'دلتا للحلول الهندسية والمقاولات',
            category: 'Real Estate',
            city: 'الجيزة',
            website: 'https://delta-eng-eg.com/about?lang=ar',
          },
        ],
      });
      expect(r2.duplicates).toBe(1);
      expect(r2.records[0].decision).toBe('DUPLICATE_CONFIRMED');
      expect(r2.records[0].leadId).toBe(canonicalLeadId);

      const domainLeads = await prisma.lead.findMany({
        where: { normalizedDomain: 'delta-eng-eg.com', isCanonical: true },
      });
      expect(domainLeads).toHaveLength(1);
    });

    it('Test C — Same Name + City Only (no phone, no domain, weak address) returns POSSIBLE_DUPLICATE and does NOT auto-merge', async () => {
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory A',
        rawRecords: [
          {
            name: 'شركة النور للتجارة',
            category: 'Retail',
            city: 'القاهرة',
            address: 'وسط البلد',
          },
        ],
      });
      expect(r1.valid).toBe(1);
      const lead1Id = r1.records[0].leadId!;

      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory B',
        rawRecords: [
          {
            name: 'شركة النور للتجارة',
            category: 'Retail',
            city: 'القاهرة',
            address: 'القاهرة',
          },
        ],
      });

      // Must return POSSIBLE_DUPLICATE and NOT auto-merge
      expect(r2.duplicates).toBe(0);
      expect(r2.possibleDuplicates).toBe(1);
      expect(r2.records[0].decision).toBe('POSSIBLE_DUPLICATE');
      expect(r2.records[0].duplicateCandidateId).toBeTruthy();

      // Verify Lead 1 was NOT modified by an automatic merge
      const lead1 = await prisma.lead.findUniqueOrThrow({ where: { id: lead1Id } });
      expect(lead1.sourceList).toEqual(['Directory A']);

      // Verify DuplicateCandidate was created with PENDING status
      const candidate = await prisma.duplicateCandidate.findUnique({
        where: { id: r2.records[0].duplicateCandidateId! },
      });
      expect(candidate).not.toBeNull();
      expect(candidate?.decision).toBe('POSSIBLE_DUPLICATE');
      expect(candidate?.status).toBe('PENDING');
      expect(candidate?.matchedLeadId).toBe(lead1Id);
    });

    it('Test D — Same Name, Different Cities (Cairo vs Alexandria, no shared phone/domain) must NOT merge', async () => {
      const cairoImport = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Cairo Source',
        rawRecords: [
          {
            name: 'مطعم السرايا المشويات',
            category: 'Restaurant',
            city: 'القاهرة',
            address: 'مدينة نصر',
          },
        ],
      });
      expect(cairoImport.valid).toBe(1);

      const alexImport = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Alex Source',
        rawRecords: [
          {
            name: 'مطعم السرايا المشويات',
            category: 'Restaurant',
            city: 'الإسكندرية',
            address: 'سموحة',
          },
        ],
      });
      expect(alexImport.valid).toBe(1);
      expect(alexImport.duplicates).toBe(0);
      expect(alexImport.possibleDuplicates).toBe(0);
      expect(alexImport.records[0].decision).toBe('UNIQUE');
      expect(alexImport.records[0].leadId).not.toBe(cairoImport.records[0].leadId);
    });

    it('Test E — Conflicting Domain (same normalized phone, different website domain) flags conflict and does NOT overwrite existing domain', async () => {
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Google Business Profile',
        sourceType: 'GOOGLE_BUSINESS',
        rawRecords: [
          {
            name: 'عيادة الشروق للعيون',
            category: 'Medical',
            city: 'القاهرة',
            phone: '01055554444',
            website: 'https://shorouk-eye-clinic.eg',
          },
        ],
      });
      expect(r1.valid).toBe(1);
      const leadId = r1.records[0].leadId!;

      // Incoming record has the SAME normalized phone, but a DIFFERENT website domain
      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'CSV Directory',
        sourceType: 'CSV_IMPORT',
        rawRecords: [
          {
            name: 'عيادة الشروق للعيون',
            category: 'Medical',
            city: 'القاهرة',
            phone: '+20 105 555 4444',
            website: 'https://totally-different-domain.com',
            instagram: 'https://instagram.com/shoroukeye',
          },
        ],
      });

      // Confirms duplicate on phone, flags conflict, preserves existing domain!
      expect(r2.duplicates).toBe(1);
      expect(r2.conflicts).toBe(1);

      const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(updatedLead.normalizedDomain).toBe('shorouk-eye-clinic.eg');
      expect(updatedLead.website).toBe('https://shorouk-eye-clinic.eg');
      // Non-conflicting Instagram field is still enriched!
      expect(updatedLead.hasInstagram).toBe(true);

      const conflicts = updatedLead.fieldConflicts as unknown as Array<{
        field: string;
        existingValue: string;
        incomingValue: string;
      }>;
      expect(Array.isArray(conflicts)).toBe(true);
      expect(conflicts.some((c) => c.field === 'website')).toBe(true);

      // Also verify STRICT_CONFLICT mode blocks auto-merge and returns decision === 'CONFLICT'
      const strictEval = await evaluateLeadDeduplication(
        prisma,
        validateAndNormalizeLead({
          name: 'عيادة الشروق للعيون',
          category: 'Medical',
          city: 'القاهرة',
          phone: '01055554444',
          website: 'https://another-conflicting-site.org',
        }).data!,
        { conflictPolicy: 'STRICT_CONFLICT' }
      );
      expect(strictEval.decision).toBe('CONFLICT');
    });

    it('Test F — Merge Enrichment & Automatic Phase 1 Score Recalculation', async () => {
      // 1. Create Lead with phone only (no social, no email, low reviewCount)
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Initial Source',
        rawRecords: [
          {
            name: 'مركز كليوباترا للتجميل والليزر',
            category: 'Beauty',
            city: 'القاهرة',
            phone: '01066667777',
            reviewCount: 10,
            isRecentlyActive: false,
          },
        ],
      });
      expect(r1.valid).toBe(1);
      const leadId = r1.records[0].leadId!;

      const initialLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const initialScore = initialLead.score;
      expect(initialLead.hasFacebook).toBe(false);
      expect(initialLead.hasInstagram).toBe(false);
      expect(initialLead.hasEmail).toBe(false);

      // 2. Incoming record has same phone + Facebook + Instagram + Email + 180 reviews + active
      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Enrichment Source',
        rawRecords: [
          {
            name: 'مركز كليوباترا للتجميل والليزر',
            category: 'Beauty',
            city: 'القاهرة',
            phone: '+20 106 666 7777',
            email: 'contact@cleopatra-beauty.eg',
            facebook: 'https://facebook.com/cleopatrabeauty.eg',
            instagram: 'https://instagram.com/cleopatrabeauty.eg',
            reviewCount: 180,
            isRecentlyActive: true,
          },
        ],
      });

      expect(r2.duplicates).toBe(1);
      const enrichedLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(enrichedLead.hasFacebook).toBe(true);
      expect(enrichedLead.normalizedFacebook).toBe('facebook.com/cleopatrabeauty.eg');
      expect(enrichedLead.hasInstagram).toBe(true);
      expect(enrichedLead.normalizedInstagram).toBe('instagram.com/cleopatrabeauty.eg');
      expect(enrichedLead.hasEmail).toBe(true);
      expect(enrichedLead.reviewCount).toBe(180);

      // Phase 1 score must have increased and created a new LeadScore snapshot
      expect(enrichedLead.score).toBeGreaterThan(initialScore);
      const scoreHistory = await prisma.leadScore.findMany({
        where: { leadId },
        orderBy: { calculatedAt: 'asc' },
      });
      expect(scoreHistory.length).toBeGreaterThanOrEqual(2);
      expect(scoreHistory[scoreHistory.length - 1].trigger).toBe('SOURCE_REFRESH');
    });

    it('Test G — Multi-Source Provenance: both SourceRecords remain linked to canonical lead and fieldProvenance is tracked', async () => {
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Google Maps Feed',
        sourceType: 'GOOGLE_BUSINESS',
        rawRecords: [
          {
            name: 'أكاديمية المستقبل الدولية',
            category: 'Education',
            city: 'الجيزة',
            phone: '01233334444',
            externalId: 'gmp_future_001',
          },
        ],
      });
      const leadId = r1.records[0].leadId!;

      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Ministry Open Dataset',
        sourceType: 'OPEN_DATA',
        rawRecords: [
          {
            name: 'أكاديمية المستقبل الدولية',
            category: 'Education',
            city: 'الجيزة',
            phone: '+201233334444',
            email: 'admissions@future-academy.edu.eg',
            address: '40 شارع محيي الدين أبو العز، الدقي',
          },
        ],
      });
      expect(r2.duplicates).toBe(1);

      const sourceRecords = await prisma.sourceRecord.findMany({
        where: { leadId },
        orderBy: { firstSeenAt: 'asc' },
      });
      expect(sourceRecords).toHaveLength(2);
      expect(sourceRecords[0].sourceName).toBe('Google Maps Feed');
      expect(sourceRecords[0].status).toBe('ACTIVE');
      expect(sourceRecords[1].sourceName).toBe('Ministry Open Dataset');
      expect(sourceRecords[1].status).toBe('MERGED');

      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const provenance = lead.fieldProvenance as Record<string, { source: string }>;
      expect(provenance.phone.source).toBe('Google Maps Feed');
      expect(provenance.email.source).toBe('Ministry Open Dataset');
      expect(provenance.address.source).toBe('Ministry Open Dataset');
    });

    it('Test H — Unmerge Recovery: merges two records, then unmerges them and restores both leads and Phase 1 scores', async () => {
      const r1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source Primary',
        rawRecords: [
          {
            name: 'عيادة الأمل التخصصية',
            category: 'Medical',
            city: 'القاهرة',
            phone: '01511112222',
          },
        ],
      });
      const targetLeadId = r1.records[0].leadId!;
      const beforeMergeLead = await prisma.lead.findUniqueOrThrow({ where: { id: targetLeadId } });
      expect(beforeMergeLead.hasEmail).toBe(false);
      expect(beforeMergeLead.hasInstagram).toBe(false);

      const r2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source Secondary',
        rawRecords: [
          {
            name: 'عيادة الأمل التخصصية - فرع المعادي',
            category: 'Medical',
            city: 'القاهرة',
            phone: '+20 151 111 2222',
            email: 'info@alamal-clinic.eg',
            instagram: 'https://instagram.com/alamalclinic',
            reviewCount: 250,
          },
        ],
      });
      expect(r2.duplicates).toBe(1);
      const mergeId = r2.records[0].mergeId!;
      expect(mergeId).toBeTruthy();

      const afterMergeLead = await prisma.lead.findUniqueOrThrow({ where: { id: targetLeadId } });
      expect(afterMergeLead.hasEmail).toBe(true);
      expect(afterMergeLead.hasInstagram).toBe(true);
      expect(afterMergeLead.score).toBeGreaterThan(beforeMergeLead.score);

      // Now execute Unmerge via API route POST /api/admin/duplicates/unmerge
      const unmergeReq = new NextRequest('http://localhost:3000/api/admin/duplicates/unmerge', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          mergeId,
          reason: 'Separated Maadi branch after admin verification',
        }),
      });
      const unmergeRes = await adminDuplicateUnmergeHandler(unmergeReq);
      expect(unmergeRes.status).toBe(200);
      const unmergeBody = await unmergeRes.json();

      expect(unmergeBody.success).toBe(true);
      expect(unmergeBody.mergeHistory.isReverted).toBe(true);
      expect(unmergeBody.targetLead.id).toBe(targetLeadId);
      expect(unmergeBody.targetLead.hasEmail).toBe(false);
      expect(unmergeBody.targetLead.hasInstagram).toBe(false);
      expect(unmergeBody.targetLead.score).toBe(beforeMergeLead.score);

      // A separate Canonical Lead must now exist for the unmerged SourceRecord
      expect(unmergeBody.restoredLead).not.toBeNull();
      expect(unmergeBody.restoredLead.isCanonical).toBe(true);
      expect(unmergeBody.restoredLead.normalizedEmail).toBe('info@alamal-clinic.eg');
    });

    it('prevents neighboring businesses on the same street with different building numbers from merging', async () => {
      const b1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Street Survey',
        rawRecords: [
          {
            name: 'صيدلية الشفاء',
            category: 'Medical',
            city: 'القاهرة',
            address: '10 شارع التحرير، الدقي',
          },
        ],
      });
      expect(b1.valid).toBe(1);

      const b2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Street Survey',
        rawRecords: [
          {
            name: 'صيدلية الشفاء',
            category: 'Medical',
            city: 'القاهرة',
            address: '42 شارع التحرير، الدقي',
          },
        ],
      });
      // Different building numbers (10 vs 42) on the same street -> UNIQUE (must NOT merge or flag as same address)
      expect(b2.valid).toBe(1);
      expect(b2.duplicates).toBe(0);
      expect(b2.records[0].decision).toBe('UNIQUE');
    });

    it('handles concurrent duplicate imports safely with zero duplicate canonical leads created', async () => {
      const payload = {
        name: 'شركة النيل الأزرق للاستثمار العقاري',
        category: 'Real Estate',
        city: 'القاهرة',
        phone: '01098761234',
        website: 'https://bluenile-realestate.eg',
      };

      const [resA, resB, resC] = await Promise.all([
        runIngestionPipeline({
          prisma,
          userId: adminUser.id,
          sourceName: 'Concurrent Worker A',
          rawRecords: [payload],
        }),
        runIngestionPipeline({
          prisma,
          userId: adminUser.id,
          sourceName: 'Concurrent Worker B',
          rawRecords: [{ ...payload, phone: '+20 109 876 1234' }],
        }),
        runIngestionPipeline({
          prisma,
          userId: adminUser.id,
          sourceName: 'Concurrent Worker C',
          rawRecords: [{ ...payload, phone: '٠١٠٩٨٧٦١٢٣٤' }],
        }),
      ]);

      const totalCreated = resA.valid + resB.valid + resC.valid;
      const totalDuplicates = resA.duplicates + resB.duplicates + resC.duplicates;
      expect(totalCreated).toBe(1);
      expect(totalDuplicates).toBe(2);

      const canonicalLeads = await prisma.lead.findMany({
        where: { normalizedPhone: '201098761234', isCanonical: true },
      });
      expect(canonicalLeads).toHaveLength(1);
      expect(canonicalLeads[0].sourceList).toHaveLength(3);
    });

    it('enforces RBAC on Admin Duplicate Review APIs and supports Confirm Merge & Reject workflows', async () => {
      // 1. Developer cannot access GET /api/admin/duplicates (403)
      const devGetReq = new NextRequest('http://localhost:3000/api/admin/duplicates', {
        method: 'GET',
        headers: { authorization: `Bearer ${devToken}` },
      });
      const devGetRes = await adminDuplicatesGetHandler(devGetReq);
      expect(devGetRes.status).toBe(403);

      // 2. Admin fetches pending duplicate candidates
      const adminGetReq = new NextRequest(
        'http://localhost:3000/api/admin/duplicates?status=PENDING&includeLogs=true',
        {
          method: 'GET',
          headers: { authorization: `Bearer ${adminToken}` },
        }
      );
      const adminGetRes = await adminDuplicatesGetHandler(adminGetReq);
      expect(adminGetRes.status).toBe(200);
      const adminGetData = await adminGetRes.json();
      expect(adminGetData.candidates.length).toBeGreaterThanOrEqual(1);

      const pendingCandidate = adminGetData.candidates.find(
        (c: { decision: string }) => c.decision === 'POSSIBLE_DUPLICATE'
      );
      expect(pendingCandidate).toBeTruthy();

      // 3. Admin views detailed duplicate evidence via GET /api/admin/duplicates/[id]
      const detailReq = new NextRequest(
        `http://localhost:3000/api/admin/duplicates/${pendingCandidate.id}`,
        {
          method: 'GET',
          headers: { authorization: `Bearer ${adminToken}` },
        }
      );
      const detailRes = await adminDuplicateByIdGetHandler(detailReq, {
        params: { id: pendingCandidate.id },
      });
      expect(detailRes.status).toBe(200);
      const detailData = await detailRes.json();
      expect(detailData.candidate.id).toBe(pendingCandidate.id);
      expect(detailData.candidate.evidence.duplicateEvidence.length).toBeGreaterThan(0);

      // 4. Admin confirms merge on the POSSIBLE_DUPLICATE candidate
      const mergeReq = new NextRequest(
        `http://localhost:3000/api/admin/duplicates/${pendingCandidate.id}/merge`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${adminToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ notes: 'Confirmed same business in Downtown Cairo' }),
        }
      );
      const mergeRes = await adminDuplicateMergeHandler(mergeReq, {
        params: { id: pendingCandidate.id },
      });
      expect(mergeRes.status).toBe(200);
      const mergeData = await mergeRes.json();
      expect(mergeData.candidate.status).toBe('CONFIRMED_MERGED');
      expect(mergeData.mergeResult.mergeId).toBeTruthy();

      // 5. Create another POSSIBLE_DUPLICATE candidate and test Reject (KEEP_SEPARATE)
      await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory X',
        rawRecords: [
          {
            name: 'شركة النور للتجارة',
            category: 'Retail',
            city: 'القاهرة',
            address: 'الزمالك',
          },
        ],
      });
      const rCand2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory Y',
        rawRecords: [
          {
            name: 'شركة النور للتجارة',
            category: 'Retail',
            city: 'القاهرة',
          },
        ],
      });
      const cand2Id = rCand2.records[0].duplicateCandidateId!;

      const rejectReq = new NextRequest(
        `http://localhost:3000/api/admin/duplicates/${cand2Id}/reject`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${adminToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            action: 'KEEP_SEPARATE',
            notes: 'Different branch in Cairo',
          }),
        }
      );
      const rejectRes = await adminDuplicateRejectHandler(rejectReq, {
        params: { id: cand2Id },
      });
      expect(rejectRes.status).toBe(200);
      const rejectData = await rejectRes.json();
      expect(rejectData.candidate.status).toBe('KEPT_SEPARATE');
      expect(rejectData.createdSeparateLead).not.toBeNull();
      expect(rejectData.createdSeparateLead.isCanonical).toBe(true);

      // 6. Fetch Merge History via GET /api/admin/duplicates/history
      const histReq = new NextRequest('http://localhost:3000/api/admin/duplicates/history', {
        method: 'GET',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const histRes = await adminDuplicateHistoryHandler(histReq);
      expect(histRes.status).toBe(200);
      const histData = await histRes.json();
      expect(histData.history.length).toBeGreaterThanOrEqual(4);

      // 7. Verify observability logs were emitted
      expect(getRecentDeduplicationLogs().length).toBeGreaterThan(0);
      expect(getRecentMergeLogs().length).toBeGreaterThan(0);
    });

    it('detects duplicates during Manual Lead Creation (POST /api/admin/leads) and returns existing canonical lead', async () => {
      const manualReq1 = new NextRequest('http://localhost:3000/api/admin/leads', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          businessName: 'عيادة دار الشفاء للأسنان',
          category: 'Dental',
          city: 'القاهرة',
          phone: '01077771111',
        }),
      });
      const res1 = await adminLeadsPostHandler(manualReq1);
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      expect(body1.wasDuplicate).toBe(false);
      expect(body1.decision).toBe('UNIQUE');

      // Second manual submission with formatted phone + website
      const manualReq2 = new NextRequest('http://localhost:3000/api/admin/leads', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          businessName: 'عيادة دار الشفاء للأسنان',
          category: 'Dental',
          city: 'القاهرة',
          phone: '+20 107 777 1111',
          website: 'https://dar-elshifa-dental.eg',
        }),
      });
      const res2 = await adminLeadsPostHandler(manualReq2);
      expect(res2.status).toBe(201);
      const body2 = await res2.json();
      expect(body2.wasDuplicate).toBe(true);
      expect(body2.decision).toBe('DUPLICATE_CONFIRMED');
      expect(body2.lead.id).toBe(body1.lead.id);
      expect(body2.lead.normalizedDomain).toBe('dar-elshifa-dental.eg');
    });

    it('supports Level 1 (Source External ID), Level 4 (Email), Level 5 (Social + City & Name + Address + City), and Cross-Lead Conflicts', async () => {
      // 1. Level 1: Exact Source External ID match even if phone was omitted in second sync
      const ext1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Google Places Feed',
        sourceType: 'GOOGLE_BUSINESS',
        rawRecords: [
          {
            name: 'مركز هليوبوليس للعلاج الطبيعي',
            category: 'Medical',
            city: 'القاهرة',
            externalId: 'place_helio_999',
            phone: '01033339999',
          },
        ],
      });
      expect(ext1.valid).toBe(1);

      const ext2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Google Places Feed',
        sourceType: 'GOOGLE_BUSINESS',
        rawRecords: [
          {
            name: 'مركز هليوبوليس للعلاج الطبيعي والتأهيل',
            category: 'Medical',
            city: 'القاهرة',
            externalId: 'place_helio_999',
            website: 'https://heliopolis-physio.eg',
          },
        ],
      });
      expect(ext2.duplicates).toBe(1);
      expect(ext2.records[0].matchReason).toBe('SOURCE_EXTERNAL_ID_MATCH');
      expect(ext2.records[0].leadId).toBe(ext1.records[0].leadId);

      // 2. Level 4: Exact Email match
      const em1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Email Source A',
        rawRecords: [
          {
            name: 'شركة اللوتس للبرمجيات',
            category: 'Other',
            city: 'القاهرة',
            email: 'Sales@LotusSoft.EG',
          },
        ],
      });
      const em2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Email Source B',
        rawRecords: [
          {
            name: 'اللوتس للبرمجيات والحلول الرقمية',
            category: 'Other',
            city: 'القاهرة',
            email: 'sales@lotussoft.eg',
            phone: '01288887777',
          },
        ],
      });
      expect(em2.duplicates).toBe(1);
      expect(em2.records[0].matchReason).toBe('EMAIL_MATCH');
      expect(em2.records[0].leadId).toBe(em1.records[0].leadId);

      // 3. Level 5: Exact Social URL + City match
      const soc1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Social Source A',
        rawRecords: [
          {
            name: 'كافيه زمان الإسكندرية',
            category: 'Restaurant',
            city: 'الإسكندرية',
            facebook: 'https://www.facebook.com/ZamanCafeAlex/?ref=bookmarks',
          },
        ],
      });
      const soc2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Social Source B',
        rawRecords: [
          {
            name: 'Zaman Cafe',
            category: 'Restaurant',
            city: 'الإسكندرية',
            facebook: 'https://m.facebook.com/zamancafealex',
            instagram: 'https://instagram.com/zamancafealex',
          },
        ],
      });
      expect(soc2.duplicates).toBe(1);
      expect(soc2.records[0].matchReason).toBe('SOCIAL_MATCH');
      expect(soc2.records[0].leadId).toBe(soc1.records[0].leadId);

      // 4. Cross-Lead Strong Signal Conflict: Phone matches Lead 1 (ext1), Website matches Lead 2 (dar-elshifa-dental.eg)
      const crossConflict = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Corrupted Aggregator',
        rawRecords: [
          {
            name: 'سجل متعارض بين جهتين',
            category: 'Medical',
            city: 'القاهرة',
            phone: '01033339999', // Matches ext1
            website: 'https://dar-elshifa-dental.eg', // Matches manualReq1
          },
        ],
      });
      expect(crossConflict.duplicates).toBe(0);
      expect(crossConflict.conflicts).toBe(1);
      expect(crossConflict.records[0].decision).toBe('CONFLICT');

      // 5. Same Exact Name + Exact Address + City, but conflicting phones -> CONFLICT (Section 22 Example 1)
      await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Address Source 1',
        rawRecords: [
          {
            name: 'مركز الزمالك للأشعة',
            category: 'Medical',
            city: 'القاهرة',
            address: '12 شارع البرازيل، الزمالك',
            phone: '01011110099',
          },
        ],
      });
      const phoneConflictImport = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Address Source 2',
        rawRecords: [
          {
            name: 'مركز الزمالك للأشعة',
            category: 'Medical',
            city: 'القاهرة',
            address: '12 شارع البرازيل، الزمالك',
            phone: '01022220088',
          },
        ],
      });
      expect(phoneConflictImport.duplicates).toBe(0);
      expect(phoneConflictImport.conflicts).toBe(1);
      expect(phoneConflictImport.records[0].decision).toBe('CONFLICT');
    });

    it('processes CSV Batch Import with unique, duplicate, possible duplicate, conflict, and invalid rows accurately', async () => {
      const csvContent = [
        'name,category,city,address,phone,website,source',
        'عيادة الفيروز للأسنان,Dental,القاهرة,18 شارع مكرم عبيد,01044445555,https://fayrouz-dental.eg,CSV Batch',
        'عيادة الفيروز للأسنان - مدينة نصر,Dental,القاهرة,18 ش مكرم عبيد,+20 104 444 5555,https://www.fayrouz-dental.eg/contact,CSV Batch',
        'شركة النور للتجارة,Retail,القاهرة,,,,CSV Batch',
        ',Dental,,Invalid Row,,,CSV Batch',
      ].join('\n');

      const csvReq = new NextRequest('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          csvContent,
          sourceName: 'Phase 2 CSV Verification',
          fileName: 'phase2-batch.csv',
        }),
      });

      const csvRes = await adminImportPostHandler(csvReq);
      expect(csvRes.status).toBe(200);
      const csvData = await csvRes.json();

      expect(csvData.report.imported).toBe(4);
      expect(csvData.report.valid).toBe(1);
      expect(csvData.report.duplicates).toBe(1);
      expect(csvData.report.possibleDuplicates).toBe(1);
      expect(csvData.report.invalid).toBe(1);
    });

    it('extracts Facebook/Instagram identity when a social URL is placed in the website field and preserves phoneType/extension metadata', () => {
      const validated = validateAndNormalizeLead({
        businessName: 'عيادة الشروق للعيون',
        category: 'Medical',
        city: 'القاهرة',
        phone: '02 27941234 ext 105',
        website: 'https://www.facebook.com/ShoroukEyeClinic/?ref=page_internal',
      });
      expect(validated.valid).toBe(true);
      expect(validated.data?.normalizedDomain).toBeNull();
      expect(validated.data?.websiteStatus).toBe('NO_WEBSITE');
      expect(validated.data?.normalizedFacebook).toBe('facebook.com/shoroukeyeclinic');
      expect(validated.data?.hasFacebook).toBe(true);
      expect(validated.data?.phoneType).toBe('LANDLINE');
      expect(validated.data?.phoneExtension).toBe('105');
      expect(validated.data?.phoneDetails?.[0]?.e164).toBe('+20227941234');
    });

    it('treats bare city or district name in address field as POSSIBLE_DUPLICATE rather than auto-merging, and covers exact Test C English strings', async () => {
      // Exact Test C: "Dr. Ahmed Dental Clinic" vs "DR AHMED DENTAL CLINIC" in Cairo without phone/website
      const testC1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory C1',
        rawRecords: [
          {
            name: 'Dr. Ahmed Dental Clinic',
            category: 'Dental',
            city: 'Cairo',
          },
        ],
      });
      expect(testC1.valid).toBe(1);

      const testC2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory C2',
        rawRecords: [
          {
            name: 'DR AHMED DENTAL CLINIC',
            category: 'Dental',
            city: 'Cairo',
          },
        ],
      });
      expect(testC2.duplicates).toBe(0);
      expect(testC2.possibleDuplicates).toBe(1);
      expect(testC2.records[0].decision).toBe('POSSIBLE_DUPLICATE');

      // Bare city/district in address field ("مدينة نصر") must NOT trigger Level 5 street address auto-merge
      const bareAddr1 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory Bare 1',
        rawRecords: [
          {
            name: 'عيادة الحياة للأسنان',
            category: 'Dental',
            city: 'القاهرة',
            address: 'مدينة نصر',
          },
        ],
      });
      expect(bareAddr1.valid).toBe(1);

      const bareAddr2 = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Directory Bare 2',
        rawRecords: [
          {
            name: 'عيادة الحياة للأسنان',
            category: 'Dental',
            city: 'القاهرة',
            address: 'مدينة نصر',
          },
        ],
      });
      expect(bareAddr2.duplicates).toBe(0);
      expect(bareAddr2.possibleDuplicates).toBe(1);
      expect(bareAddr2.records[0].decision).toBe('POSSIBLE_DUPLICATE');
    });

    it('Test G (Exact Manual -> CSV Flow): manual lead creation followed by CSV import reuses canonical lead and attaches both SourceRecords', async () => {
      const manualReq = new NextRequest('http://localhost:3000/api/admin/leads', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          businessName: 'مركز الصفوة للجلدية والليزر',
          category: 'Beauty',
          city: 'القاهرة',
          phone: '01061239876',
          address: 'مدينة نصر',
        }),
      });
      const manualRes = await adminLeadsPostHandler(manualReq);
      expect(manualRes.status).toBe(201);
      const manualData = await manualRes.json();
      expect(manualData.wasDuplicate).toBe(false);
      const canonicalId = manualData.lead.id;

      const csvContent = [
        'name,category,city,address,phone,website,email,source',
        'مركز الصفوة للجلدية والليزر,Beauty,القاهرة,"25 شارع عباس العقاد، مدينة نصر",+20 106 123 9876,https://alsafwa-laser.eg,contact@alsafwa-laser.eg,CSV Import Source',
      ].join('\n');

      const csvReq = new NextRequest('http://localhost:3000/api/admin/import', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          csvContent,
          sourceName: 'CSV Import Source',
          fileName: 'test-g.csv',
        }),
      });
      const csvRes = await adminImportPostHandler(csvReq);
      expect(csvRes.status).toBe(200);
      const csvBody = await csvRes.json();
      expect(csvBody.report.duplicates).toBe(1);
      expect(csvBody.report.valid).toBe(0);

      const updatedLead = await prisma.lead.findUniqueOrThrow({
        where: { id: canonicalId },
        include: { sourceRecords: true },
      });
      expect(updatedLead.sourceRecords).toHaveLength(2);
      expect(updatedLead.normalizedDomain).toBe('alsafwa-laser.eg');
      expect(updatedLead.normalizedEmail).toBe('contact@alsafwa-laser.eg');
      expect(updatedLead.address).toBe('25 شارع عباس العقاد، مدينة نصر');
    });

    it('handles chained merges (M1 then M2) and out-of-order unmerge (unmerging M1 first preserves M2, then unmerging M2 restores initial state)', async () => {
      // Create initial Lead A (phone only)
      const rA = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source A (Initial)',
        rawRecords: [
          {
            name: 'مركز الرواد للعيون',
            category: 'Medical',
            city: 'القاهرة',
            phone: '01155556666',
          },
        ],
      });
      const leadId = rA.records[0].leadId!;
      const initialLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

      // Merge M1 (Source B adds email)
      const rB = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source B (Email)',
        rawRecords: [
          {
            name: 'مركز الرواد للعيون',
            category: 'Medical',
            city: 'القاهرة',
            phone: '+201155556666',
            email: 'info@alrowad-eye.eg',
          },
        ],
      });
      const mergeId1 = rB.records[0].mergeId!;
      expect(mergeId1).toBeTruthy();

      // Merge M2 (Source C adds instagram + higher reviewCount)
      const rC = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Source C (Instagram)',
        rawRecords: [
          {
            name: 'مركز الرواد للعيون',
            category: 'Medical',
            city: 'القاهرة',
            phone: '00201155556666',
            instagram: 'https://instagram.com/alrowadeye',
            reviewCount: 320,
          },
        ],
      });
      const mergeId2 = rC.records[0].mergeId!;
      expect(mergeId2).toBeTruthy();

      // Unmerge M1 OUT OF ORDER (before M2!)
      const unmerge1 = await unmergeLead({
        prisma,
        mergeId: mergeId1,
        performedBy: adminUser.id,
        reason: 'Out-of-order unmerge of M1',
      });

      // M1's email must be removed, while M2's instagram and reviewCount=320 MUST be preserved!
      expect(unmerge1.targetLead.id).toBe(leadId);
      expect(unmerge1.targetLead.email).toBeNull();
      expect(unmerge1.targetLead.hasEmail).toBe(false);
      expect(unmerge1.targetLead.normalizedInstagram).toBe('instagram.com/alrowadeye');
      expect(unmerge1.targetLead.hasInstagram).toBe(true);
      expect(unmerge1.targetLead.reviewCount).toBe(320);
      expect(unmerge1.targetLead.sourceList).toContain('Source C (Instagram)');
      expect(unmerge1.targetLead.sourceList).not.toContain('Source B (Email)');

      // Now unmerge M2 as well -> must restore Lead A to its initial pre-M1 state (no email, no instagram, reviewCount=0)
      const unmerge2 = await unmergeLead({
        prisma,
        mergeId: mergeId2,
        performedBy: adminUser.id,
        reason: 'Subsequent unmerge of M2',
      });
      expect(unmerge2.targetLead.email).toBeNull();
      expect(unmerge2.targetLead.instagram).toBeNull();
      expect(unmerge2.targetLead.hasInstagram).toBe(false);
      expect(unmerge2.targetLead.reviewCount).toBe(initialLead.reviewCount);
      expect(unmerge2.targetLead.score).toBe(initialLead.score);
    });

    it('restores SourceRecords on Lead-to-Lead unmerge and excludes non-canonical merged leads from reports and browse queries', async () => {
      const lead1Res = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Direct Lead 1 Source',
        rawRecords: [
          {
            name: 'مطعم قصر الكبابجي فرع التجمع',
            category: 'Restaurant',
            city: 'القاهرة',
            phone: '01099990011',
          },
        ],
      });
      const lead2Res = await runIngestionPipeline({
        prisma,
        userId: adminUser.id,
        sourceName: 'Direct Lead 2 Source',
        rawRecords: [
          {
            name: 'مطعم قصر الكبابجي التجمع الخامس',
            category: 'Restaurant',
            city: 'القاهرة',
            phone: '01099990022',
            website: 'https://kababgy-newcairo.eg',
          },
        ],
      });
      const lead1Id = lead1Res.records[0].leadId!;
      const lead2Id = lead2Res.records[0].leadId!;

      const reportsBeforeReq = new NextRequest('http://localhost:3000/api/admin/reports', {
        method: 'GET',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const reportsBefore = await (await adminReportsGetHandler(reportsBeforeReq)).json();
      const canonicalCountBefore = reportsBefore.overview.totalLeads;

      // Admin merges Lead 2 into Lead 1 directly
      const mergeLeadsReq = new NextRequest('http://localhost:3000/api/admin/duplicates', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'CONFIRM_MERGE',
          targetLeadId: lead1Id,
          sourceLeadId: lead2Id,
        }),
      });
      const mergeLeadsRes = await adminDuplicatesPostHandler(mergeLeadsReq);
      expect(mergeLeadsRes.status).toBe(200);
      const mergeLeadsBody = await mergeLeadsRes.json();
      const mergeId = mergeLeadsBody.mergeResult.mergeId;

      // Verify Lead 2 is now non-canonical and excluded from admin reports
      const reportsAfterMerge = await (
        await adminReportsGetHandler(
          new NextRequest('http://localhost:3000/api/admin/reports', {
            method: 'GET',
            headers: { authorization: `Bearer ${adminToken}` },
          })
        )
      ).json();
      expect(reportsAfterMerge.overview.totalLeads).toBe(canonicalCountBefore - 1);

      // Verify Lead 1 has both SourceRecords
      const lead1SourcesDuring = await prisma.sourceRecord.findMany({
        where: { leadId: lead1Id },
      });
      expect(lead1SourcesDuring).toHaveLength(2);

      // Now unmerge the Lead-to-Lead merge
      const unmergeRes = await unmergeLead({
        prisma,
        mergeId,
        performedBy: adminUser.id,
        reason: 'Revert Lead-to-Lead merge',
      });
      expect(unmergeRes.restoredLead?.id).toBe(lead2Id);
      expect(unmergeRes.restoredLead?.isCanonical).toBe(true);

      // Verify Lead 2's SourceRecord was restored back to Lead 2!
      const lead2SourcesAfter = await prisma.sourceRecord.findMany({
        where: { leadId: lead2Id },
      });
      expect(lead2SourcesAfter).toHaveLength(1);
      expect(lead2SourcesAfter[0].sourceName).toBe('Direct Lead 2 Source');
    });
  });
});



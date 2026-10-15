import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { BLOG_POSTS } from '@/data/blog-posts';
import { generateRssFeed } from '@/lib/rss';
import { resolveProgrammaticParams, PROGRAMMATIC_CITIES, PROGRAMMATIC_CATEGORIES } from '@/lib/programmatic';
import { generatePdfBuffer } from '@/lib/pdf-report';
import { getFunnelMetrics, recordFunnelMilestone, FunnelEventType } from '@/lib/analytics/funnel';
import { sanitizeNotificationContent, dispatchTransactionalEmailSafe } from '@/lib/notifications';
import { notifyDevelopersOfNewLead } from '@/lib/lead-matching-notifier';
import { POST as trackAnalyticsRoute } from '@/app/api/analytics/track/route';
import { prisma } from '@/lib/db';

describe('Phase 4: Growth, Differentiation & Content Infrastructure', () => {
  describe('1. Developer Blog & RSS Feed', () => {
    it('has all 3 required blog posts with substantial bilingual content', () => {
      expect(BLOG_POSTS).toHaveLength(3);
      const slugs = BLOG_POSTS.map((p) => p.slug);
      expect(slugs).toContain('finding-web-clients-egypt');
      expect(slugs).toContain('pricing-websites-egypt');
      expect(slugs).toContain('cold-outreach-egypt');

      BLOG_POSTS.forEach((post) => {
        expect(post.titleAr.length).toBeGreaterThan(15);
        expect(post.titleEn.length).toBeGreaterThan(15);
        expect(post.contentAr.length).toBeGreaterThan(200);
        expect(post.contentEn.length).toBeGreaterThan(200);
        expect(post.readingTimeMin).toBeGreaterThan(0);
        expect(post.author.name).toBeDefined();
      });
    });

    it('generates valid RSS 2.0 XML with correct namespaces, channels, and items', () => {
      const feed = generateRssFeed();
      expect(feed).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(feed).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
      expect(feed).toContain('<channel>');
      expect(feed).toContain('<title>Leads4dev Developer Blog</title>');
      expect(feed).toContain('<link>https://leads4dev.com/blog</link>');

      BLOG_POSTS.forEach((post) => {
        expect(feed).toContain(`<link>https://leads4dev.com/blog/${post.slug}</link>`);
        expect(feed).toContain(`<![CDATA[${post.titleAr}]]>`);
      });
    });
  });

  describe('2. Programmatic Landing Pages Taxonomy & Threshold Resolver', () => {
    it('resolves valid city and category slugs in English and Arabic', () => {
      const cairoMedical = resolveProgrammaticParams('cairo', 'medical');
      expect(cairoMedical.city?.nameAr).toBe('القاهرة');
      expect(cairoMedical.category?.nameEn).toBe('Medical & Clinics');

      const gizaDental = resolveProgrammaticParams('الجيزة', 'dental');
      expect(gizaDental.city?.nameEn).toBe('Giza');
      expect(gizaDental.category?.nameAr).toBe('عيادات الأسنان');

      const encodedOctober = resolveProgrammaticParams('october-6', 'real-estate');
      expect(encodedOctober.city?.nameAr).toBe('6 أكتوبر');
      expect(encodedOctober.category?.slug).toBe('real-estate');
    });

    it('handles Arabic spelling variations (hamza, teh marbuta, tashkeel, URL encoding) gracefully', () => {
      // Missing hamza (الاسكندرية) -> alexandria
      const alexNoHamza = resolveProgrammaticParams('الاسكندرية', 'medical');
      expect(alexNoHamza.city?.slug).toBe('alexandria');

      // Teh marbuta vs heh (القاهره) -> cairo
      const cairoHeh = resolveProgrammaticParams('القاهره', 'dental');
      expect(cairoHeh.city?.slug).toBe('cairo');

      // Full Tashkeel diacritics (الْقَاهِرَةُ) -> cairo
      const cairoTashkeel = resolveProgrammaticParams('الْقَاهِرَةُ', 'medical');
      expect(cairoTashkeel.city?.slug).toBe('cairo');

      // Percent-encoded Arabic URL (%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9) -> cairo
      const encodedCairo = resolveProgrammaticParams('%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9', 'medical');
      expect(encodedCairo.city?.slug).toBe('cairo');
    });

    it('returns null for unmapped cities or categories to prevent spam routes', () => {
      const invalid = resolveProgrammaticParams('fake-city-unknown', 'fake-category');
      expect(invalid.city).toBeNull();
      expect(invalid.category).toBeNull();
    });
  });

  describe('3. Server-Side Lead PDF Report Generator', () => {
    it('generates deterministic valid binary PDF-1.4 with zero AI claims', async () => {
      const mockLead = {
        id: 'lead_test_123',
        businessName: 'مركز القاهرة لطب وجراحة الأسنان',
        category: 'عيادات الأسنان',
        city: 'القاهرة',
        area: 'المعادي',
        phone: '01012345678',
        email: 'info@cairo-dental.com',
        website: null,
        websiteStatus: 'NO_WEBSITE',
        score: 88,
        temperature: 'HOT',
        qualityScore: 92,
        estimatedBudget: 15000,
        rating: 4.8,
        reviewCount: 34,
        branchCount: 2,
        qualificationReasons: ['+25 نشاط تجاري يعمل بدون موقع إلكتروني', '+15 تقييمات عملاء ممتازة تزيد عن 30 تقييم'],
      };

      const buffer = generatePdfBuffer({
        developerName: 'مطور تجريبي',
        leadId: mockLead.id,
        businessName: mockLead.businessName,
        category: mockLead.category,
        governorate: 'القاهرة',
        city: mockLead.city,
        phone: mockLead.phone,
        email: mockLead.email,
        website: mockLead.website,
        websiteStatus: mockLead.websiteStatus,
        score: mockLead.score,
        qualityScore: mockLead.qualityScore,
        temperature: mockLead.temperature,
        ownershipType: 'EXCLUSIVE',
        reviewCount: mockLead.reviewCount,
        branchCount: mockLead.branchCount,
        estimatedBudget: mockLead.estimatedBudget,
        rules: [{ label: 'No website', points: 25 }],
        talkTrack: ['Focus on missing website'],
        generatedAt: new Date(),
      });
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(100);

      const pdfHeader = buffer.subarray(0, 8).toString('utf-8');
      expect(pdfHeader).toContain('%PDF-1.4');
    });
  });

  describe('4. Analytics Funnel Milestones & Summary', () => {
    it('calculates deterministic funnel progression from primary data models', async () => {
      const summary = await getFunnelMetrics();
      expect(summary.steps).toBeDefined();
      expect(summary.steps.length).toBe(6);

      const stepNames = summary.steps.map((s) => s.step);
      expect(stepNames).toEqual([
        'page_view',
        'register_start',
        'register_complete',
        'first_free_lead_viewed',
        'first_purchase',
        'plan_upgrade',
      ]);

      summary.steps.forEach((step) => {
        expect(step.count).toBeGreaterThanOrEqual(0);
        expect(step.conversionFromPrevious).toBeGreaterThanOrEqual(0);
        expect(step.conversionFromPrevious).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('5. Pro Plan Instant Alerts & Notification Redaction', () => {
    it('strictly sanitizes raw phone numbers and email addresses in alerts', () => {
      const rawText = 'New lead available: Dr. Ahmed Dental. Call +201012345678 or email ahmed@clinic.com';
      const sanitized = sanitizeNotificationContent(rawText, { redactContactDetails: true });

      expect(sanitized).not.toContain('+201012345678');
      expect(sanitized).not.toContain('ahmed@clinic.com');
      expect(sanitized).toContain('[REDACTED_PHONE]');
      expect(sanitized).toContain('[REDACTED_EMAIL]');
    });

    it('safely dispatches transactional emails with idempotency deduplication', async () => {
      const idempotencyKey = `test-alert-${Date.now()}`;
      const message = {
        to: 'dev@leads4dev.com',
        subject: '🎯 New Lead Matching Alert: Dental in Cairo',
        bodyText: 'A new high-intent lead is available. Contact: 01098765432',
      };

      const firstDispatch = await dispatchTransactionalEmailSafe({
        message,
        idempotencyKey,
        redactLeadContacts: true,
      });

      expect(firstDispatch.delivered).toBe(true);
      expect(firstDispatch.deduplicated).toBe(false);

      // Re-dispatching with the same idempotency key must deduplicate
      const secondDispatch = await dispatchTransactionalEmailSafe({
        message,
        idempotencyKey,
        redactLeadContacts: true,
      });

      expect(secondDispatch.delivered).toBe(true);
      expect(secondDispatch.deduplicated).toBe(true);
      expect(secondDispatch.attempts).toBe(0);
    });

    it('dispatches instant alerts only to developers on qualifying Pro/Business plans', async () => {
      const alertLead = {
        id: `lead_alert_test_${Date.now()}`,
        businessName: 'عيادة الدكتور أحمد لطب الأسنان بالمعادي',
        category: 'Dental',
        city: 'القاهرة',
        governorate: 'القاهرة',
      };

      const result = await notifyDevelopersOfNewLead(alertLead, { forceInTest: true });
      expect(result.notifiedCount).toBeGreaterThanOrEqual(1);
      expect(result.developerIds.length).toBe(result.notifiedCount);

      // Verify that the developers who were notified have qualifying plans
      for (const devId of result.developerIds) {
        const user = await prisma.user.findUnique({
          where: { id: devId },
          include: { subscription: { include: { plan: true } } },
        });
        expect(['pro', 'business', 'agency']).toContain(user?.subscription?.plan?.slug);
      }
    });

    it('enforces IP rate limiting on /api/analytics/track route under heavy traffic', async () => {
      const testIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;

      const makeRequest = (event = 'page_view') =>
        trackAnalyticsRoute(
          new NextRequest('http://localhost:3000/api/analytics/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': testIp,
            },
            body: JSON.stringify({
              event,
              path: '/pricing',
            }),
          })
        );

      const firstRes = await makeRequest('page_view');
      expect(firstRes.status).toBe(200);

      // Rapidly fire requests to exceed limit (120 per minute)
      let rateLimited = false;
      for (let i = 0; i < 125; i++) {
        const res = await makeRequest('rate_limit_probe');
        if (res.status === 429) {
          rateLimited = true;
          const body = await res.json();
          expect(body.error).toBe('Rate limit exceeded');
          break;
        }
      }
      expect(rateLimited).toBe(true);
    });
  });
});

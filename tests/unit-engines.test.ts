import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizeDomain,
  normalizeEmail,
  normalizeBusinessName,
  normalizeCategory,
  normalizeCityAndGovernorate,
} from '@/lib/normalizer';
import { validateAndNormalizeLead } from '@/lib/validator';
import {
  calculateLeadScore,
  classifyTemperature,
  DEFAULT_SCORING_RULES,
} from '@/lib/scoring-engine';
import { evaluateWebsiteRules } from '@/lib/website-analyzer';
import { evaluateLeadFreshness } from '@/lib/freshness';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { parseCsvString } from '@/lib/collectors';

describe('1. Normalizer & Validator Unit Tests', () => {
  it('normalizes Egyptian phone numbers across different formats to canonical 201... format', () => {
    expect(normalizePhone('01001234567')).toBe('201001234567');
    expect(normalizePhone('+20 100 123 4567')).toBe('201001234567');
    expect(normalizePhone('0020-100-123-4567')).toBe('201001234567');
    // Excel CSV stripped leading zero (10-digit Egyptian mobile) & trunk zero after +20
    expect(normalizePhone('1001234567')).toBe('201001234567');
    expect(normalizePhone('+20 (0) 100 123 4567')).toBe('201001234567');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('normalizes website domains and filters out social media URLs as standalone domains', () => {
    expect(normalizeDomain('https://www.ExampleDental.com/about?ref=1')).toBe('exampledental.com');
    expect(normalizeDomain('http://clinic.eg/')).toBe('clinic.eg');
    expect(normalizeDomain('https://facebook.com/mypage')).toBeNull();
    expect(normalizeDomain('https://www.instagram.com/mypage')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
  });

  it('normalizes Arabic and English business names deterministically', () => {
    const n1 = normalizeBusinessName('عيادة الأمل لطب الأسنان!');
    const n2 = normalizeBusinessName('عياده الامل لطب الاسنان');
    expect(n1).toBe(n2);
  });

  it('normalizes categories and Egyptian cities accurately', () => {
    expect(normalizeCategory('Dental Clinic')).toBe('Dental');
    expect(normalizeCategory('عيادة أسنان')).toBe('Dental');
    expect(normalizeCategory('مطعم ومشويات')).toBe('Restaurant');
    expect(normalizeCityAndGovernorate('Cairo')).toEqual({
      city: 'القاهرة',
      governorate: 'القاهرة',
    });
    expect(normalizeCityAndGovernorate('Sheikh Zayed')).toEqual({
      city: 'الشيخ زايد',
      governorate: 'الجيزة',
    });
  });

  it('validates raw leads and rejects invalid entries', () => {
    const invalid = validateAndNormalizeLead({
      name: 'A',
      city: '',
      rating: 9,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(2);

    const valid = validateAndNormalizeLead({
      name: 'ABC Dental Clinic',
      category: 'Dental',
      city: 'Cairo',
      phone: '01002223344',
      facebook: 'https://facebook.com/abcdental',
      instagram: 'https://instagram.com/abcdental',
      rating: 4.7,
      reviewCount: 320,
    });
    expect(valid.valid).toBe(true);
    expect(valid.data?.websiteStatus).toBe('NO_WEBSITE');
    expect(valid.data?.normalizedPhone).toBe('201002223344');
  });
});

describe('2. Deterministic Rule-Based Scoring Engine Tests', () => {
  it('Scoring is deterministic: identical inputs always produce identical score, temperature, and reasons', () => {
    const leadInput = {
      isVerified: true, // +20
      websiteStatus: 'NO_WEBSITE' as const, // +30
      hasFacebook: true, // +10
      hasInstagram: true, // +10
      hasPhone: true, // +10
      hasEmail: false, // 0
      branchCount: 1, // 0
      reviewCount: 320, // +10
      rating: 4.7,
      isRecentlyActive: true, // +10
    };

    const run1 = calculateLeadScore(leadInput, DEFAULT_SCORING_RULES);
    const run2 = calculateLeadScore(leadInput, DEFAULT_SCORING_RULES);
    const run3 = calculateLeadScore(leadInput, DEFAULT_SCORING_RULES);

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
    expect(run1.normalizedScore).toBe(100);
    expect(run1.temperature).toBe('PREMIUM');
    expect(run1.qualificationRules.map((r) => r.code)).toContain('NO_WEBSITE');
    expect(run1.qualificationRules.map((r) => r.code)).toContain('BUSINESS_VERIFIED');
  });

  it('classifies temperature bands accurately (COLD, WARM, HOT, PREMIUM)', () => {
    expect(classifyTemperature(0)).toBe('COLD');
    expect(classifyTemperature(49)).toBe('COLD');
    expect(classifyTemperature(50)).toBe('WARM');
    expect(classifyTemperature(69)).toBe('WARM');
    expect(classifyTemperature(70)).toBe('HOT');
    expect(classifyTemperature(84)).toBe('HOT');
    expect(classifyTemperature(85)).toBe('PREMIUM');
    expect(classifyTemperature(100)).toBe('PREMIUM');
  });

  it('respects rule enabled/disabled flags, custom weights, and structured conditions JSON', () => {
    const customRules = DEFAULT_SCORING_RULES.map((r) =>
      r.code === 'NO_WEBSITE'
        ? { ...r, enabled: false }
        : r.code === 'HIGH_REVIEW_COUNT'
          ? {
              ...r,
              conditions: {
                field: 'reviewCount',
                operator: 'GREATER_THAN_OR_EQUAL',
                targetValue: '50',
              },
            }
          : r
    );
    const res = calculateLeadScore(
      {
        isVerified: true,
        websiteStatus: 'NO_WEBSITE',
        hasFacebook: true,
        hasInstagram: false,
        hasPhone: true,
        hasEmail: false,
        branchCount: 1,
        reviewCount: 60,
        isRecentlyActive: false,
      },
      customRules
    );
    // 20 (verified) + 10 (FB) + 10 (Phone) + 10 (High reviews >= 50) = 50 (WARM)
    expect(res.normalizedScore).toBe(50);
    expect(res.temperature).toBe('WARM');
  });
});

describe('3. Website Analyzer (Rule-Based, No AI) Tests', () => {
  it('flags No HTTPS (+15), No Mobile Viewport (+15), and Old Structure (+10) as POOR_WEBSITE', () => {
    const res = evaluateWebsiteRules({
      url: 'http://old-clinic-site.com',
      httpStatus: 200,
      reachable: true,
      html: '<html><head><title>Old Clinic</title></head><body><center><font>Welcome</font></center></body></html>',
    });

    expect(res.isHttps).toBe(false);
    expect(res.hasMobileViewport).toBe(false);
    expect(res.isOldBasicStructure).toBe(true);
    expect(res.opportunityScore).toBe(40); // 15 + 15 + 10
    expect(res.recommendedWebsiteStatus).toBe('POOR_WEBSITE');
  });

  it('flags unreachable website (+20 opportunity) as POOR_WEBSITE', () => {
    const res = evaluateWebsiteRules({
      url: 'https://broken-domain.eg',
      httpStatus: 503,
      reachable: false,
      html: '',
    });

    expect(res.reachable).toBe(false);
    expect(res.opportunityReasons.map((r) => r.code)).toContain('WEBSITE_UNREACHABLE');
    expect(res.recommendedWebsiteStatus).toBe('POOR_WEBSITE');
  });

  it('classifies modern HTTPS responsive HTML5 website as HAS_WEBSITE with 0 deficit points', () => {
    const res = evaluateWebsiteRules({
      url: 'https://modern-dental.eg',
      httpStatus: 200,
      reachable: true,
      html: '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Best clinic"><title>Modern Dental</title></head><body><main class="flex">Hello</main></body></html>',
    });

    expect(res.isHttps).toBe(true);
    expect(res.hasMobileViewport).toBe(true);
    expect(res.isOldBasicStructure).toBe(false);
    expect(res.opportunityScore).toBe(0);
    expect(res.recommendedWebsiteStatus).toBe('HAS_WEBSITE');
  });
});

describe('4. Lead Freshness & Developer Matching Engine Tests', () => {
  it('calculates Fresh, Recently Verified, Needs Verification, and Stale accurately', () => {
    const now = new Date('2026-10-08T00:00:00Z');
    expect(evaluateLeadFreshness(new Date('2026-10-05T00:00:00Z'), undefined, now).status).toBe(
      'FRESH'
    );
    expect(evaluateLeadFreshness(new Date('2026-09-20T00:00:00Z'), undefined, now).status).toBe(
      'RECENTLY_VERIFIED'
    );
    expect(evaluateLeadFreshness(new Date('2026-08-15T00:00:00Z'), undefined, now).status).toBe(
      'NEEDS_VERIFICATION'
    );
    expect(evaluateLeadFreshness(new Date('2026-05-01T00:00:00Z'), undefined, now).status).toBe(
      'STALE'
    );
  });

  it('matches leads accurately against DeveloperProfile criteria (both Arabic and English labels + budgetRange)', () => {
    const devProfileArabic = {
      services: ['Website Development'],
      locations: ['القاهرة', 'الجيزة'],
      niches: ['Dental'],
      leadPreferences: ['NO_WEBSITE'],
      minBudget: 10000,
      leadType: 'BOTH',
    };

    const devProfileEnglish = {
      services: ['Website Development'],
      locations: ['Cairo', 'Giza'],
      niches: ['Dental Clinics', 'Medical Centers', 'Restaurants'],
      leadPreferences: ['Businesses without websites'],
      budgetRange: '10000-50000',
      leadType: 'BOTH',
    };

    const matchingLead = {
      id: '1',
      businessName: 'Cairo Dental',
      category: 'Dental',
      governorate: 'القاهرة',
      city: 'القاهرة',
      websiteStatus: 'NO_WEBSITE' as const,
      estimatedBudget: 12000,
      leadType: 'SHARED' as const,
      exclusive: false,
      score: 90,
      temperature: 'PREMIUM' as const,
    };

    const nonMatchingLead = {
      ...matchingLead,
      id: '2',
      city: 'الإسكندرية',
      governorate: 'الإسكندرية',
      category: 'Automotive',
    };

    const lowBudgetLead = {
      ...matchingLead,
      id: '3',
      estimatedBudget: 4000,
    };

    expect(evaluateDeveloperLeadMatch(matchingLead, devProfileArabic).isMatch).toBe(true);
    expect(evaluateDeveloperLeadMatch(matchingLead, devProfileEnglish).isMatch).toBe(true);
    expect(evaluateDeveloperLeadMatch(nonMatchingLead, devProfileArabic).isMatch).toBe(false);
    expect(evaluateDeveloperLeadMatch(lowBudgetLead, devProfileEnglish).isMatch).toBe(false);
  });

  it('parses CSV strings with quoted fields and commas accurately', () => {
    const csv = `name,category,city,address,phone\n"عيادة النور, فرع مدينة نصر",Dental,القاهرة,"40 شارع عباس العقاد, مدينة نصر",01001112223`;
    const rows = parseCsvString(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('عيادة النور, فرع مدينة نصر');
    expect(rows[0].address).toBe('40 شارع عباس العقاد, مدينة نصر');
  });
});

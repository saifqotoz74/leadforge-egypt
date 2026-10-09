import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken } from '@/lib/auth';
import {
  calculateLeadScore,
  classifyTemperature,
  LeadClassification,
  normalizeLeadScore,
  ScoreNormalizer,
  evaluateConditionTriState,
  RuleEvaluator,
  validateScoringRulePayload,
  ScoreExplanation,
  recalculateLeadScore,
  DEFAULT_SCORING_RULES,
  DEFAULT_CLASSIFICATION_THRESHOLDS,
  QUARTILE_CLASSIFICATION_THRESHOLDS,
  ScoringRuleDefinition,
} from '@/lib/scoring-engine';
import { runIngestionPipeline } from '@/lib/collectors';

// Route Handlers
import {
  GET as adminRulesGetHandler,
  POST as adminRulesPostHandler,
} from '@/app/api/admin/rules/route';
import {
  PATCH as adminRulePatchHandler,
  DELETE as adminRuleDeleteHandler,
} from '@/app/api/admin/rules/[id]/route';
import {
  GET as leadScoreGetHandler,
  POST as leadScorePostHandler,
} from '@/app/api/leads/[id]/score/route';
import { PATCH as adminLeadPatchHandler } from '@/app/api/admin/leads/[id]/route';
import { POST as adminLeadRecalcPostHandler } from '@/app/api/admin/leads/[id]/recalculate/route';
import { POST as adminBulkRecalcPostHandler } from '@/app/api/admin/scoring/recalculate/route';

describe('Phase 1 — Production-Grade Deterministic Lead Scoring Engine', () => {
  describe('Unit Tests: Operators, Validator, Rule Groups, Normalizer, Classification & Missing Data', () => {
    it('evaluates all 14 deterministic operators in both uppercase and lowercase formats', () => {
      const lead = {
        isVerified: true,
        websiteStatus: 'NO_WEBSITE' as const,
        hasFacebook: true,
        hasInstagram: false,
        hasPhone: true,
        phone: '+201001234567',
        hasEmail: false,
        email: null,
        branchCount: 3,
        reviewCount: 150,
        rating: 4.6,
        isRecentlyActive: true,
        category: 'Dental Clinic',
        city: 'القاهرة',
        governorate: 'القاهرة',
      };

      expect(evaluateConditionTriState(lead, 'websiteStatus', 'equals', 'NO_WEBSITE')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'websiteStatus', 'EQUALS', 'HAS_WEBSITE')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'websiteStatus', 'not_equals', 'HAS_WEBSITE')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'websiteStatus', 'NOT_EQUALS', 'NO_WEBSITE')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'reviewCount', 'greater_than', '100')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'reviewCount', 'greater_than', '200')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'rating', 'greater_than_or_equal', '4.6')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'rating', 'greater_than_or_equal', '4.7')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'branchCount', 'less_than', '5')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'branchCount', 'less_than', '2')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'branchCount', 'less_than_or_equal', '3')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'branchCount', 'less_than_or_equal', '2')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'category', 'contains', 'dental')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'category', 'contains', 'medical')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'category', 'not_contains', 'restaurant')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'category', 'not_contains', 'dental')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'phone', 'exists', '')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'email', 'exists', '')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'email', 'not_exists', '')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'phone', 'not_exists', '')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'category', 'in', 'Dental Clinic, Medical')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'category', 'in', 'Restaurant, Retail')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'category', 'not_in', 'Restaurant, Retail')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'category', 'not_in', 'Dental Clinic, Retail')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'hasFacebook', 'is_true', 'true')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'hasInstagram', 'is_true', 'true')).toBe('FALSE');

      expect(evaluateConditionTriState(lead, 'hasInstagram', 'is_false', 'false')).toBe('TRUE');
      expect(evaluateConditionTriState(lead, 'hasFacebook', 'is_false', 'false')).toBe('FALSE');
    });

    it('treats missing/null/empty/UNKNOWN fields as UNKNOWN tri-state without false matches on not_exists or is_false', () => {
      const leadWithMissing = {
        isVerified: true,
        websiteStatus: 'UNKNOWN' as const,
        hasFacebook: false,
        hasInstagram: false,
        hasPhone: true,
        hasEmail: false,
        email: null,
        rating: null,
        reviewCount: 0,
        branchCount: 1,
        isRecentlyActive: false,
      };

      // websiteStatus = UNKNOWN should return UNKNOWN for equals, not_equals, in, not_in, exists, not_exists
      expect(
        evaluateConditionTriState(leadWithMissing, 'websiteStatus', 'equals', 'NO_WEBSITE')
      ).toBe('UNKNOWN');
      expect(
        evaluateConditionTriState(leadWithMissing, 'websiteStatus', 'not_equals', 'HAS_WEBSITE')
      ).toBe('UNKNOWN');
      expect(
        evaluateConditionTriState(leadWithMissing, 'websiteStatus', 'not_in', 'HAS_WEBSITE')
      ).toBe('UNKNOWN');
      expect(
        evaluateConditionTriState(leadWithMissing, 'website', 'not_exists', '')
      ).toBe('UNKNOWN');

      // rating = null should return UNKNOWN for less_than, not_equals, and not_exists
      expect(evaluateConditionTriState(leadWithMissing, 'rating', 'less_than', '3.0')).toBe(
        'UNKNOWN'
      );
      expect(
        evaluateConditionTriState(leadWithMissing, 'rating', 'not_equals', '5.0')
      ).toBe('UNKNOWN');
      expect(
        evaluateConditionTriState(leadWithMissing, 'rating', 'not_exists', '')
      ).toBe('UNKNOWN');

      // Totally empty lead {} must return UNKNOWN for website, phone, email, email_verified, source.multiple
      const emptyLead = {};
      expect(evaluateConditionTriState(emptyLead, 'website', 'not_exists', '')).toBe('UNKNOWN');
      expect(evaluateConditionTriState(emptyLead, 'website', 'exists', '')).toBe('UNKNOWN');
      expect(evaluateConditionTriState(emptyLead, 'hasPhone', 'is_false', 'false')).toBe('UNKNOWN');
      expect(evaluateConditionTriState({ phone: '' }, 'hasPhone', 'is_false', 'false')).toBe('UNKNOWN');
      expect(evaluateConditionTriState({ email: '' }, 'hasEmail', 'is_false', 'false')).toBe('UNKNOWN');
      expect(evaluateConditionTriState({ email: null }, 'email_verified', 'equals', 'false')).toBe('UNKNOWN');
      expect(evaluateConditionTriState({ email: null }, 'contact.emailVerified', 'not_exists', '')).toBe('UNKNOWN');
      expect(evaluateConditionTriState(emptyLead, 'source.multiple', 'is_false', 'false')).toBe('UNKNOWN');
    });

    it('validates rule definitions and rejects dynamic code, SQL injection, non-numeric targets on numeric operators, and malformed compound arrays', () => {
      const valid = validateScoringRulePayload({
        code: 'VALID_RULE_1',
        name: 'قاعدة صحيحة',
        nameEn: 'Valid Rule',
        field: 'reviewCount',
        operator: 'greater_than_or_equal',
        targetValue: '50',
        points: 10,
      });
      expect(valid.valid).toBe(true);

      const validAlias = validateScoringRulePayload({
        code: 'VALID_EMAIL_VERIFIED',
        name: 'بريد موثق',
        nameEn: 'Email verified',
        field: 'email_verified',
        operator: 'equals',
        targetValue: 'true',
        points: 15,
      });
      expect(validAlias.valid).toBe(true);

      const badEval = validateScoringRulePayload({
        code: 'BAD_EVAL',
        name: 'Bad',
        nameEn: 'Bad',
        field: 'reviewCount',
        operator: 'greater_than',
        targetValue: 'eval("process.exit()")',
        points: 10,
      });
      expect(badEval.valid).toBe(false);

      const badProto = validateScoringRulePayload({
        code: 'BAD_PROTO',
        name: 'Bad',
        nameEn: 'Bad',
        field: '__proto__',
        operator: 'equals',
        targetValue: 'polluted',
        points: 10,
      });
      expect(badProto.valid).toBe(false);

      const badOperator = validateScoringRulePayload({
        code: 'BAD_OP',
        name: 'Bad',
        nameEn: 'Bad',
        field: 'rating',
        operator: 'REGEX_EXEC',
        targetValue: '.*',
        points: 10,
      });
      expect(badOperator.valid).toBe(false);

      // Non-numeric targetValue on numeric operator must be rejected
      const badNumericTarget = validateScoringRulePayload({
        code: 'BAD_NUM_TARGET',
        name: 'Bad Numeric',
        nameEn: 'Bad Numeric',
        field: 'reviewCount',
        operator: 'greater_than',
        targetValue: 'not-a-number',
        points: 10,
      });
      expect(badNumericTarget.valid).toBe(false);

      // Empty targetValue on IN operator must be rejected
      const badEmptyList = validateScoringRulePayload({
        code: 'BAD_EMPTY_IN',
        name: 'Bad Empty In',
        nameEn: 'Bad Empty In',
        field: 'category',
        operator: 'in',
        targetValue: '   ',
        points: 10,
      });
      expect(badEmptyList.valid).toBe(false);

      // Array element inside condition.all must be rejected
      const badCompoundArray = validateScoringRulePayload({
        code: 'BAD_COMPOUND_ARR',
        name: 'Bad Compound',
        nameEn: 'Bad Compound',
        field: 'rating',
        operator: 'greater_than',
        targetValue: '4.0',
        points: 10,
        condition: {
          all: [[] as unknown as { field: string; operator: string; value: unknown }],
        },
      });
      expect(badCompoundArray.valid).toBe(false);
    });

    it('resolves mutually exclusive ruleGroup conflicts deterministically even when lower-points rule has higher priority or identical condition', () => {
      const customRules: ScoringRuleDefinition[] = [
        {
          id: 'r1',
          code: 'WEB_LOWER_POINTS_FIRST',
          name: 'موقع نقاط أقل أولوية أولى',
          nameEn: 'Lower points higher priority',
          ruleGroup: 'website_quality',
          priority: 1,
          weight: 20,
          points: 20,
          enabled: true,
          field: 'websiteStatus',
          operator: 'EQUALS',
          targetValue: 'NO_WEBSITE',
        },
        {
          id: 'r2',
          code: 'WEB_HIGHER_POINTS_SECOND',
          name: 'موقع نقاط أعلى أولوية ثانية',
          nameEn: 'Higher points lower priority',
          ruleGroup: 'website_quality',
          priority: 2,
          weight: 30,
          points: 30,
          enabled: true,
          field: 'websiteStatus',
          operator: 'EQUALS',
          targetValue: 'NO_WEBSITE',
        },
      ];

      const evalRes = RuleEvaluator.evaluateRules(
        {
          isVerified: true,
          websiteStatus: 'NO_WEBSITE',
          hasFacebook: true,
          hasInstagram: false,
          hasPhone: true,
          hasEmail: false,
          branchCount: 1,
          reviewCount: 10,
          rating: 4.5,
          isRecentlyActive: true,
        },
        customRules
      );

      expect(evalRes.appliedRules).toHaveLength(1);
      expect(evalRes.appliedRules[0].code).toBe('WEB_HIGHER_POINTS_SECOND');
      expect(evalRes.rawScore).toBe(30);

      const superseded = evalRes.evaluatedRules.find((r) => r.code === 'WEB_LOWER_POINTS_FIRST');
      expect(superseded?.outcome).toBe('SUPERSEDED_BY_GROUP');
      expect(superseded?.applied).toBe(false);
      expect(superseded?.pointsAwarded).toBe(0);
    });

    it('evaluates multiple distinct compound rules sharing a default top-level field without false DUPLICATE_RULE_SKIPPED', () => {
      const compoundRules: ScoringRuleDefinition[] = [
        {
          id: 'c1',
          code: 'COMPOUND_SOCIAL_AND_PHONE',
          name: 'تواصل اجتماعي وهاتف',
          nameEn: 'Social and phone',
          weight: 15,
          points: 15,
          priority: 1,
          enabled: true,
          field: 'isVerified',
          operator: 'IS_TRUE',
          targetValue: 'true',
          condition: {
            all: [
              { field: 'social.facebook', operator: 'equals', value: true },
              { field: 'contact.hasPhone', operator: 'equals', value: true },
            ],
          },
        },
        {
          id: 'c2',
          code: 'COMPOUND_REVIEWS_AND_BRANCHES',
          name: 'تقييمات وفروع',
          nameEn: 'Reviews and branches',
          weight: 20,
          points: 20,
          priority: 2,
          enabled: true,
          field: 'isVerified',
          operator: 'IS_TRUE',
          targetValue: 'true',
          condition: {
            all: [
              { field: 'reviews.count', operator: 'greater_than_or_equal', value: 50 },
              { field: 'business.branches', operator: 'greater_than', value: 1 },
            ],
          },
        },
      ];

      const evalRes = RuleEvaluator.evaluateRules(
        {
          isVerified: true,
          hasFacebook: true,
          hasPhone: true,
          reviewCount: 80,
          branchCount: 3,
        },
        compoundRules
      );

      expect(evalRes.appliedRules).toHaveLength(2);
      expect(evalRes.rawScore).toBe(35);
    });

    it('normalizes and clamps raw scores safely into 0..100 integer range', () => {
      expect(normalizeLeadScore(-25)).toBe(0);
      expect(normalizeLeadScore(0)).toBe(0);
      expect(normalizeLeadScore(67.4)).toBe(67);
      expect(normalizeLeadScore(67.6)).toBe(68);
      expect(normalizeLeadScore(145)).toBe(100);
      expect(ScoreNormalizer.normalize(Number.NaN)).toBe(0);
      expect(ScoreNormalizer.normalize(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('supports both default (50/70/85) and quartile (25/50/75) configurable classification thresholds', () => {
      // Default thresholds
      expect(classifyTemperature(20, DEFAULT_CLASSIFICATION_THRESHOLDS)).toBe('COLD');
      expect(classifyTemperature(55, DEFAULT_CLASSIFICATION_THRESHOLDS)).toBe('WARM');
      expect(classifyTemperature(75, DEFAULT_CLASSIFICATION_THRESHOLDS)).toBe('HOT');
      expect(classifyTemperature(90, DEFAULT_CLASSIFICATION_THRESHOLDS)).toBe('PREMIUM');

      // Quartile thresholds (0-24 COLD, 25-49 WARM, 50-74 HOT, 75-100 PREMIUM)
      expect(LeadClassification.classify(24, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('COLD');
      expect(LeadClassification.classify(25, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('WARM');
      expect(LeadClassification.classify(49, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('WARM');
      expect(LeadClassification.classify(50, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('HOT');
      expect(LeadClassification.classify(74, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('HOT');
      expect(LeadClassification.classify(75, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('PREMIUM');
      expect(LeadClassification.classify(100, QUARTILE_CLASSIFICATION_THRESHOLDS)).toBe('PREMIUM');
    });

    it('evaluates website technical analysis signals, compound all/any conditions, and 100x deterministic repeatability', () => {
      const leadWithTechSignals = {
        isVerified: true,
        websiteStatus: 'POOR_WEBSITE' as const,
        website: 'http://legacy-clinic.eg',
        websiteAnalysis: {
          reachable: true,
          isHttps: false,
          sslValid: false,
          responseTimeMs: 2400,
          hasMobileViewport: false,
          hasResponsiveIndicators: false,
          isOldBasicStructure: true,
          hasTitle: false,
          hasMetaDescription: false,
          domainStatus: 'ACTIVE',
          opportunityScore: 45,
        },
        hasFacebook: true,
        hasInstagram: false,
        hasPhone: true,
        hasEmail: false,
        branchCount: 2,
        reviewCount: 75,
        rating: 4.6,
        isRecentlyActive: true,
      };

      expect(evaluateConditionTriState(leadWithTechSignals, 'website.sslValid', 'is_false', 'false')).toBe('TRUE');
      expect(evaluateConditionTriState(leadWithTechSignals, 'website.slow', 'is_true', 'true')).toBe('TRUE');
      expect(evaluateConditionTriState(leadWithTechSignals, 'website.weakMetadata', 'is_true', 'true')).toBe('TRUE');
      expect(evaluateConditionTriState(leadWithTechSignals, 'website.hasMobileViewport', 'is_false', 'false')).toBe('TRUE');

      const compoundRules: ScoringRuleDefinition[] = [
        {
          id: 'compound-1',
          code: 'COMPOUND_ALL_MATCH',
          name: 'شرط مركب',
          nameEn: 'Compound all match',
          weight: 25,
          points: 25,
          priority: 1,
          enabled: true,
          field: 'rating',
          operator: 'GREATER_THAN_OR_EQUAL',
          targetValue: '4.5',
          condition: {
            all: [
              { field: 'reviews.rating', operator: 'greater_than_or_equal', value: 4.5 },
              { field: 'reviews.count', operator: 'greater_than_or_equal', value: 50 },
              { field: 'website.sslValid', operator: 'is_false', value: false },
            ],
          },
        },
        {
          id: 'penalty-1',
          code: 'HEAVY_PENALTY',
          name: 'خصم تجريبي',
          nameEn: 'Heavy penalty',
          weight: -60,
          points: -60,
          priority: 2,
          enabled: true,
          field: 'hasInstagram',
          operator: 'IS_FALSE',
          targetValue: 'false',
        },
      ];

      const penaltyResult = calculateLeadScore(leadWithTechSignals, compoundRules);
      // 25 - 60 = -35 -> clamped to 0 (COLD)
      expect(penaltyResult.rawScore).toBe(-35);
      expect(penaltyResult.normalizedScore).toBe(0);
      expect(penaltyResult.classification).toBe('COLD');

      // 100x deterministic repeatability check
      const baseline = calculateLeadScore(leadWithTechSignals, DEFAULT_SCORING_RULES);
      for (let i = 0; i < 100; i++) {
        const current = calculateLeadScore(leadWithTechSignals, DEFAULT_SCORING_RULES);
        expect(current).toEqual(baseline);
      }
    });
  });

  describe('Required Test Scenarios (Scenarios A through F — Unit Verification)', () => {
    it('Scenario A — High-Value Lead: no website, active FB & IG, phone, email, 2 branches, 65 reviews -> HOT or PREMIUM with clear reasons', () => {
      const result = calculateLeadScore(
        {
          isVerified: true,
          websiteStatus: 'NO_WEBSITE',
          hasFacebook: true,
          hasInstagram: true,
          hasPhone: true,
          hasEmail: true,
          branchCount: 2,
          rating: 4.7,
          reviewCount: 65,
          isRecentlyActive: true,
        },
        DEFAULT_SCORING_RULES
      );

      // +20 BUSINESS_VERIFIED + 30 NO_WEBSITE + 10 FB + 10 IG + 10 PHONE + 5 EMAIL + 10 MULTIPLE_BRANCHES + 10 HIGH_REVIEW_COUNT + 10 RECENTLY_ACTIVE = 115 -> clamped to 100
      expect(result.rawScore).toBe(115);
      expect(result.normalizedScore).toBe(100);
      expect(['HOT', 'PREMIUM']).toContain(result.classification);
      expect(result.classification).toBe('PREMIUM');
      const labels = result.explanation.reasons.map((r) => `${r.points >= 0 ? `+${r.points}` : r.points} ${r.label}`);
      expect(labels).toContain('+30 No website');
      expect(labels).toContain('+10 Active Facebook');
      expect(labels).toContain('+10 Active Instagram');
      expect(labels).toContain('+10 Phone available');
      expect(labels).toContain('+5 Email available');
      expect(labels).toContain('+10 Multiple branches');

      expect(result.explanation.summary).toContain('Score: 100/100');
      expect(result.explanation.summary).toContain('PREMIUM');
    });

    it('Scenario B — Low-Opportunity Lead: good website, no social, no email, no phone, low reviews -> COLD', () => {
      const result = calculateLeadScore(
        {
          isVerified: false,
          websiteStatus: 'HAS_WEBSITE',
          website: 'https://good-website.eg',
          hasFacebook: false,
          hasInstagram: false,
          hasPhone: false,
          hasEmail: false,
          branchCount: 1,
          rating: 3.9,
          reviewCount: 5,
          isRecentlyActive: false,
        },
        DEFAULT_SCORING_RULES
      );

      const appliedCodes = result.appliedRules.map((r) => r.code);
      expect(appliedCodes).not.toContain('NO_WEBSITE');
      expect(appliedCodes).not.toContain('POOR_WEBSITE');
      expect(result.rawScore).toBe(0);
      expect(result.normalizedScore).toBe(0);
      expect(result.classification).toBe('COLD');
    });

    it('Scenario C — Missing Data Lead: missing website, missing phone, missing email -> no crash, valid score, valid reasons', () => {
      const result = calculateLeadScore(
        {
          isVerified: true,
          websiteStatus: 'UNKNOWN',
          website: null,
          hasFacebook: true,
          hasInstagram: false,
          phone: null,
          email: null,
          branchCount: 1,
          rating: null,
          reviewCount: 0,
          isRecentlyActive: false,
        },
        DEFAULT_SCORING_RULES
      );

      // Only BUSINESS_VERIFIED (+20) and ACTIVE_FACEBOOK (+10) match -> 30 (COLD)
      expect(result.rawScore).toBe(30);
      expect(result.normalizedScore).toBe(30);
      expect(result.classification).toBe('COLD');
      const appliedCodes = result.appliedRules.map((r) => r.code);
      expect(appliedCodes).toEqual(['BUSINESS_VERIFIED', 'ACTIVE_FACEBOOK']);
    });

    it('Scenario D — Mutually Exclusive Website Rules: No website + Poor website rules never both apply', () => {
      // Even if a custom rule set has overlapping conditions in the website_quality group, only one applies
      const overlappingWebsiteRules: ScoringRuleDefinition[] = [
        {
          ...DEFAULT_SCORING_RULES.find((r) => r.code === 'NO_WEBSITE')!,
          condition: { field: 'business.verified', operator: 'equals', value: true },
        },
        {
          ...DEFAULT_SCORING_RULES.find((r) => r.code === 'POOR_WEBSITE')!,
          condition: { field: 'business.verified', operator: 'equals', value: true },
        },
      ];

      const result = calculateLeadScore(
        {
          isVerified: true,
          websiteStatus: 'POOR_WEBSITE',
          website: 'http://broken-clinic.eg',
        },
        overlappingWebsiteRules
      );

      const appliedCodes = result.appliedRules.map((r) => r.code);
      expect(appliedCodes).toHaveLength(1);
      expect(appliedCodes).toContain('NO_WEBSITE');
      expect(appliedCodes).not.toContain('POOR_WEBSITE');

      // Standard default rules with POOR_WEBSITE lead
      const poorWebResult = calculateLeadScore(
        {
          isVerified: true,
          websiteStatus: 'POOR_WEBSITE',
          website: 'http://broken-clinic.eg',
          hasFacebook: true,
          hasPhone: true,
          isRecentlyActive: true,
        },
        DEFAULT_SCORING_RULES
      );
      expect(poorWebResult.appliedRules.map((r) => r.code)).toContain('POOR_WEBSITE');
      expect(poorWebResult.appliedRules.map((r) => r.code)).not.toContain('NO_WEBSITE');
    });

    it('Scenario E — Deterministic Repeatability: running scoring twice produces identical score, reasons, classification, and timestamp', () => {
      const leadInput = {
        isVerified: true,
        websiteStatus: 'NO_WEBSITE' as const,
        hasFacebook: true,
        hasInstagram: true,
        hasPhone: true,
        hasEmail: false,
        branchCount: 2,
        reviewCount: 60,
        rating: 4.5,
        isRecentlyActive: true,
      };

      const run1 = calculateLeadScore(leadInput, DEFAULT_SCORING_RULES);
      const run2 = calculateLeadScore(leadInput, DEFAULT_SCORING_RULES);

      expect(run1.score).toBe(run2.score);
      expect(run1.classification).toBe(run2.classification);
      expect(run1.explanation.reasons).toEqual(run2.explanation.reasons);
      expect(run1.calculatedAt).toBe(run2.calculatedAt);
      expect(run1).toEqual(run2);
    });

    it('Scenario F — Rule Disabled by Admin: disabling NO_WEBSITE removes +30 from score and explanation', () => {
      const rulesWithDisabledNoWebsite = DEFAULT_SCORING_RULES.map((r) =>
        r.code === 'NO_WEBSITE' ? { ...r, enabled: false } : r
      );

      const result = calculateLeadScore(
        {
          isVerified: true,
          websiteStatus: 'NO_WEBSITE',
          hasFacebook: true,
          hasInstagram: false,
          hasPhone: true,
          hasEmail: false,
          branchCount: 1,
          rating: 4.5,
          reviewCount: 20,
          isRecentlyActive: true,
        },
        rulesWithDisabledNoWebsite
      );

      expect(result.appliedRules.map((r) => r.code)).not.toContain('NO_WEBSITE');
      // +20 BUSINESS_VERIFIED + 10 FB + 10 PHONE + 10 RECENTLY_ACTIVE = 50 (instead of 80)
      expect(result.rawScore).toBe(50);
      expect(result.normalizedScore).toBe(50);
      expect(result.explanation.reasons.map((r) => r.code)).not.toContain('NO_WEBSITE');

      const disabledAudit = result.evaluatedRules.find((r) => r.code === 'NO_WEBSITE');
      expect(disabledAudit?.outcome).toBe('DISABLED');
    });
  });

  describe('Integration & API Tests: Persistence, Recalculation, Versioning & Idempotency (Scenario G)', () => {
    let prisma: PrismaClient;
    let cleanupDb: () => Promise<void>;
    let adminToken: string;
    let devToken: string;
    let adminUserId: string;
    let testLeadId: string;

    beforeAll(async () => {
      const testDb = await createInMemoryTestDb();
      prisma = testDb.prisma;
      cleanupDb = testDb.cleanup;
      setPrismaClientForTesting(testDb.prisma, testDb.pglite);

      await prisma.scoringConfig.create({
        data: {
          id: 'default',
          currentVersion: 'v1',
          versionNumber: 1,
          coldMax: 49,
          warmMin: 50,
          warmMax: 69,
          hotMin: 70,
          hotMax: 84,
          premiumMin: 85,
          minScore: 0,
          maxScore: 100,
        },
      });

      for (const rule of DEFAULT_SCORING_RULES) {
        await prisma.scoringRule.create({
          data: {
            id: rule.id,
            code: rule.code,
            key: rule.key || rule.code,
            name: rule.name,
            nameEn: rule.nameEn,
            category: rule.category || 'GENERAL',
            ruleGroup: rule.ruleGroup || null,
            points: rule.points ?? rule.weight,
            weight: rule.weight,
            priority: rule.priority ?? rule.sortOrder ?? 100,
            version: rule.version || 'v1',
            enabled: rule.enabled,
            field: rule.field,
            operator: rule.operator,
            targetValue: rule.targetValue,
            sortOrder: rule.sortOrder || 0,
          },
        });
      }

      const passwordHash = await hashPassword('Pass@12345');
      const admin = await prisma.user.create({
        data: {
          email: 'phase1.admin@leadforge.eg',
          name: 'Phase1 Admin',
          passwordHash,
          role: 'ADMIN',
        },
      });
      adminUserId = admin.id;

      const dev = await prisma.user.create({
        data: {
          email: 'phase1.dev@leadforge.eg',
          name: 'Phase1 Dev',
          passwordHash,
          role: 'DEVELOPER',
        },
      });

      adminToken = await signSessionToken({
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
      });
      devToken = await signSessionToken({
        userId: dev.id,
        email: dev.email,
        name: dev.name,
        role: 'DEVELOPER',
      });
    });

    afterAll(async () => {
      if (cleanupDb) await cleanupDb();
    });

    it('persists initial LeadScore snapshot with trigger LEAD_CREATED and structured explanation on ingestion', async () => {
      const report = await runIngestionPipeline({
        prisma,
        userId: adminUserId,
        sourceName: 'Phase 1 Ingestion Test',
        rawRecords: [
          {
            name: 'عيادة النخبة للأسنان - Elite Dental',
            category: 'Dental',
            city: 'القاهرة',
            phone: '01001112233',
            email: 'info@elitedental-test.eg',
            website: '',
            facebook: 'https://facebook.com/elitedental',
            instagram: 'https://instagram.com/elitedental',
            rating: 4.8,
            reviewCount: 220,
            branchCount: 2,
          },
        ],
      });

      expect(report.valid).toBe(1);
      testLeadId = report.records[0].leadId!;

      const lead = await prisma.lead.findUniqueOrThrow({
        where: { id: testLeadId },
        include: { scores: true },
      });

      expect(lead.score).toBe(100);
      expect(lead.temperature).toBe('PREMIUM');
      expect(lead.scoringVersion).toBe('v1');
      expect(lead.lastScoredAt).not.toBeNull();
      expect(lead.scoreExplanation).not.toBeNull();

      expect(lead.scores).toHaveLength(1);
      expect(lead.scores[0].trigger).toBe('LEAD_CREATED');
      expect(lead.scores[0].newScore).toBe(100);
      expect(lead.scores[0].newClassification).toBe('PREMIUM');
      expect(lead.scores[0].scoringVersion).toBe('v1');
    });

    it('does not create duplicate LeadScore snapshots on idempotent recalculation or non-material lead edits', async () => {
      const r1 = await recalculateLeadScore(prisma, testLeadId, {
        trigger: 'MANUAL_RECALCULATION',
      });
      expect(r1.snapshotCreated).toBe(false);
      expect(r1.scoreResult.normalizedScore).toBe(100);

      // Non-material edit (updating address only) via PATCH /api/admin/leads/[id]
      const patchLeadReq = new NextRequest(`http://localhost:3000/api/admin/leads/${testLeadId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          address: 'شارع التحرير، الدقي - تحديث عنوان فقط',
        }),
      });
      const patchLeadRes = await adminLeadPatchHandler(patchLeadReq, {
        params: { id: testLeadId },
      });
      expect(patchLeadRes.status).toBe(200);
      const patchLeadData = await patchLeadRes.json();
      expect(patchLeadData.snapshotCreated).toBe(false);

      const snapshotCount = await prisma.leadScore.count({ where: { leadId: testLeadId } });
      expect(snapshotCount).toBe(1);
    });

    it('Scenario G — Scoring Version v2: updating rule weight and version to v2 keeps old score attributable to v1 and new score attributable to v2', async () => {
      const patchReq = new NextRequest('http://localhost:3000/api/admin/rules/rule-no-website', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          weight: 5,
          points: 5,
          version: 'v2',
        }),
      });

      const res = await adminRulePatchHandler(patchReq, { params: { id: 'rule-no-website' } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rule.weight).toBe(5);
      expect(data.rule.version).toBe('v2');

      const updatedLead = await prisma.lead.findUniqueOrThrow({
        where: { id: testLeadId },
        include: {
          scores: {
            orderBy: { calculatedAt: 'desc' },
          },
        },
      });

      // Was 115 raw (clamped to 100) under v1; now 115 - 25 = 90 under v2
      expect(updatedLead.score).toBe(90);
      expect(updatedLead.scoringVersion).toBe('v2');
      expect(updatedLead.scores).toHaveLength(2);
      // Latest snapshot is v2
      expect(updatedLead.scores[0].previousScore).toBe(100);
      expect(updatedLead.scores[0].newScore).toBe(90);
      expect(updatedLead.scores[0].scoringVersion).toBe('v2');
      expect(updatedLead.scores[0].trigger).toBe('ADMIN_RECALCULATION');
      // Historical snapshot remains attributable to v1
      expect(updatedLead.scores[1].newScore).toBe(100);
      expect(updatedLead.scores[1].scoringVersion).toBe('v1');
      expect(updatedLead.scores[1].trigger).toBe('LEAD_CREATED');
    });

    it('exposes GET /api/leads/[id]/score and POST /api/leads/[id]/score with full breakdown and RBAC protection', async () => {
      // Developer can GET score breakdown
      const getReq = new NextRequest(`http://localhost:3000/api/leads/${testLeadId}/score`, {
        method: 'GET',
        headers: { authorization: `Bearer ${devToken}` },
      });
      const getRes = await leadScoreGetHandler(getReq, { params: { id: testLeadId } });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.score).toBe(90);
      expect(getData.explanation.summary).toContain('Score: 90/100');
      expect(getData.history.length).toBeGreaterThanOrEqual(2);

      // Developer CANNOT POST recalculate (403 Forbidden)
      const devPostReq = new NextRequest(`http://localhost:3000/api/leads/${testLeadId}/score`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${devToken}`,
          'content-type': 'application/json',
        },
      });
      const devPostRes = await leadScorePostHandler(devPostReq, { params: { id: testLeadId } });
      expect(devPostRes.status).toBe(403);

      // Admin CAN POST recalculate on /api/admin/leads/[id]/recalculate
      const adminRecalcReq = new NextRequest(
        `http://localhost:3000/api/admin/leads/${testLeadId}/recalculate`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${adminToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ forceSnapshot: true }),
        }
      );
      const adminRecalcRes = await adminLeadRecalcPostHandler(adminRecalcReq, {
        params: { id: testLeadId },
      });
      expect(adminRecalcRes.status).toBe(200);
      const adminRecalcData = await adminRecalcRes.json();
      expect(adminRecalcData.snapshotCreated).toBe(true);
    });

    it('supports admin rule creation, unsafe rule rejection, version persistence, and bulk recalculation via /api/admin/scoring/recalculate', async () => {
      // Reject invalid/unsafe rule creation
      const badCreateReq = new NextRequest('http://localhost:3000/api/admin/rules', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code: 'UNSAFE_RULE',
          name: 'قاعدة غير آمنة',
          nameEn: 'Unsafe Rule',
          field: 'rating',
          operator: 'EVAL_JS',
          targetValue: '4.5',
          weight: 10,
        }),
      });
      const badCreateRes = await adminRulesPostHandler(badCreateReq);
      expect(badCreateRes.status).toBe(400);

      // Create valid rule under v3
      const createReq = new NextRequest('http://localhost:3000/api/admin/rules', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code: 'HIGH_RATING_4_7',
          name: 'تقييم جوجل فوق 4.7',
          nameEn: 'Google rating >= 4.7',
          category: 'BUSINESS_STRENGTH',
          field: 'rating',
          operator: 'GREATER_THAN_OR_EQUAL',
          targetValue: '4.7',
          weight: 5,
          priority: 55,
          version: 'v3',
        }),
      });
      const createRes = await adminRulesPostHandler(createReq);
      expect(createRes.status).toBe(201);
      const createdData = await createRes.json();
      expect(createdData.rule.code).toBe('HIGH_RATING_4_7');
      expect(createdData.rule.version).toBe('v3');

      // Bulk recalculate with version v3
      const bulkReq = new NextRequest('http://localhost:3000/api/admin/scoring/recalculate', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          scoringVersion: 'v3',
          batchSize: 10,
        }),
      });
      const bulkRes = await adminBulkRecalcPostHandler(bulkReq);
      expect(bulkRes.status).toBe(200);
      const bulkData = await bulkRes.json();
      expect(bulkData.report.scoringVersion).toBe('v3');
      expect(bulkData.report.totalProcessed).toBe(1);

      // Clean up the newly created v3 rule and verify active scoringVersion does NOT regress backward to v2
      const delReq = new NextRequest(
        `http://localhost:3000/api/admin/rules/${createdData.rule.id}`,
        {
          method: 'DELETE',
          headers: { authorization: `Bearer ${adminToken}` },
        }
      );
      const delRes = await adminRuleDeleteHandler(delReq, {
        params: { id: createdData.rule.id },
      });
      expect(delRes.status).toBe(200);

      // Verify GET /api/admin/rules returns rules and persisted scoringVersion v3
      const listReq = new NextRequest('http://localhost:3000/api/admin/rules', {
        method: 'GET',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listRes = await adminRulesGetHandler(listReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.scoringVersion).toBe('v3');
    });
  });
});

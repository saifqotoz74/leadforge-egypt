import { LeadTemperature } from '@/components/domain/OpportunityBadge';
import { QualityState } from '@/components/domain/QualityIndicator';

export interface DemoLabInputs {
  hasWebsite: boolean;
  reviewsCount: number;
  branchesCount: number;
  daysSinceVerification: number;
  preset?: 'dental' | 'restaurant' | 'training';
}

export interface DemoBreakdownItem {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface DemoLabResult {
  opportunityScore: number;
  opportunityTier: LeadTemperature;
  qualityScore: number;
  qualityStatus: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT';
  freshnessStatus: QualityState;
  breakdown: DemoBreakdownItem[];
}

export const DEMO_PRESETS: Record<'dental' | 'restaurant' | 'training', DemoLabInputs> = {
  dental: {
    hasWebsite: false,
    reviewsCount: 120,
    branchesCount: 3,
    daysSinceVerification: 3,
    preset: 'dental',
  },
  restaurant: {
    hasWebsite: true,
    reviewsCount: 85,
    branchesCount: 2,
    daysSinceVerification: 18,
    preset: 'restaurant',
  },
  training: {
    hasWebsite: false,
    reviewsCount: 20,
    branchesCount: 1,
    daysSinceVerification: 45,
    preset: 'training',
  },
};

export function calculateDemoScore(
  inputs: DemoLabInputs,
  t?: (key: string) => string
): DemoLabResult {
  const { hasWebsite, reviewsCount, branchesCount, daysSinceVerification } = inputs;

  // 1. Opportunity Score calculation
  // Website need weight (max 45)
  const websiteScore = hasWebsite ? 12 : 45;
  const websiteReason = hasWebsite
    ? (t ? t('scoreLabRuleWebsiteHas') : 'يمتلك موقعاً يحتاج إلى تحسين أو إعادة تصميم')
    : (t ? t('scoreLabRuleWebsiteNone') : 'لا يمتلك موقعاً إلكترونياً مع حاجة واضحة للتواجد الرقمي');

  // Reviews & trust weight (max 25) — 120 reviews => +21
  const safeReviews = Math.max(0, reviewsCount);
  const reviewScore = Math.min(25, Math.round((safeReviews / 120) * 21));
  const reviewReason = safeReviews > 30
    ? (t ? t('scoreLabRuleReviewsHigh') : 'قاعدة عملاء قوية وتفاعل مستمر')
    : (t ? t('scoreLabRuleReviewsLow') : 'تفاعل أولي مع العملاء بحاجة للتطوير');

  // Branches & scale weight (max 20) — 3 branches => +14
  const safeBranches = Math.max(1, branchesCount);
  const branchScore = Math.min(
    20,
    safeBranches === 1 ? 5 : safeBranches === 2 ? 10 : 14 + (safeBranches - 3) * 3
  );
  const branchReason = safeBranches > 1
    ? (t ? t('scoreLabRuleBranchesMulti') : 'نشاط متعدد الفروع وميزانية توسعية')
    : (t ? t('scoreLabRuleBranchesSingle') : 'فرع رئيسي مع إمكانية نمو وتوسع');

  // Industry & location factor (max 10) => +5
  const categoryScore = 5;
  const categoryReason = t ? t('scoreLabRuleCategoryReason') : 'قطاع خدمي نشط في النطاق المستهدف';

  const opportunityScore = Math.min(100, websiteScore + reviewScore + branchScore + categoryScore);

  let opportunityTier: LeadTemperature = 'COLD';
  if (opportunityScore >= 90) opportunityTier = 'PREMIUM';
  else if (opportunityScore >= 75) opportunityTier = 'HOT';
  else if (opportunityScore >= 50) opportunityTier = 'WARM';

  // 2. Freshness & Quality Calculation
  let freshnessStatus: QualityState = 'FRESH';
  let freshnessPoints = 40;

  if (daysSinceVerification <= 14) {
    freshnessStatus = 'FRESH';
    freshnessPoints = 40;
  } else if (daysSinceVerification <= 45) {
    freshnessStatus = 'AGING';
    freshnessPoints = 25;
  } else {
    freshnessStatus = 'STALE';
    freshnessPoints = 12;
  }

  const dataCompletenessPoints = 55; // Verified address, phone, and category
  const qualityScore = Math.min(100, freshnessPoints + dataCompletenessPoints);

  let qualityStatus: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCELLENT' = 'MEDIUM';
  if (qualityScore >= 85) qualityStatus = 'EXCELLENT';
  else if (qualityScore >= 70) qualityStatus = 'HIGH';
  else if (qualityScore >= 50) qualityStatus = 'MEDIUM';
  else if (qualityScore >= 30) qualityStatus = 'LOW';
  else qualityStatus = 'VERY_LOW';

  const breakdown: DemoBreakdownItem[] = [
    {
      name: t ? t('scoreLabRuleWebsite') : 'حالة الموقع الإلكتروني',
      score: websiteScore,
      maxScore: 45,
      reason: websiteReason,
    },
    {
      name: t ? t('scoreLabRuleReviews') : 'تقييمات وثقة العملاء',
      score: reviewScore,
      maxScore: 25,
      reason: reviewReason,
    },
    {
      name: t ? t('scoreLabRuleBranches') : 'حجم النشاط وتعدد الفروع',
      score: branchScore,
      maxScore: 20,
      reason: branchReason,
    },
    {
      name: t ? t('scoreLabRuleCategory') : 'تطابق القطاع والنطاق الجغرافي',
      score: categoryScore,
      maxScore: 10,
      reason: categoryReason,
    },
  ];

  return {
    opportunityScore,
    opportunityTier,
    qualityScore,
    qualityStatus,
    freshnessStatus,
    breakdown,
  };
}

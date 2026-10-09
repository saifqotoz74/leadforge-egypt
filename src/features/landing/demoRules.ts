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
    reviewsCount: 42,
    branchesCount: 2,
    daysSinceVerification: 3,
    preset: 'dental',
  },
  restaurant: {
    hasWebsite: true,
    reviewsCount: 120,
    branchesCount: 3,
    daysSinceVerification: 18,
    preset: 'restaurant',
  },
  training: {
    hasWebsite: false,
    reviewsCount: 15,
    branchesCount: 1,
    daysSinceVerification: 45,
    preset: 'training',
  },
};

export function calculateDemoScore(inputs: DemoLabInputs): DemoLabResult {
  const { hasWebsite, reviewsCount, branchesCount, daysSinceVerification } = inputs;

  // 1. Opportunity Score calculation
  // Website need weight (max 45)
  const websiteScore = hasWebsite ? 12 : 45;
  const websiteReason = hasWebsite
    ? 'يمتلك موقعاً، يحتاج إلى تحسين أو إعادة تصميم'
    : 'لا يمتلك موقعاً إلكترونياً مع حاجة ماسة للتواجد الرقمي';

  // Reviews & trust weight (max 25)
  const safeReviews = Math.max(0, reviewsCount);
  const reviewScore = Math.min(25, Math.round((safeReviews / 50) * 25));
  const reviewReason = safeReviews > 30
    ? 'قاعدة عملاء قوية وتفاعل مستمر'
    : 'تفاعل أولي مع العملاء بحاجة للتطوير';

  // Branches & scale weight (max 20)
  const safeBranches = Math.max(1, branchesCount);
  const branchScore = Math.min(20, safeBranches * 7);
  const branchReason = safeBranches > 1
    ? 'نشاط متعدد الفروع وميزانية توسعية'
    : 'فرع رئيسي مع إمكانية نمو وتوسع';

  // Industry factor (max 10)
  const categoryScore = 10;
  const categoryReason = 'قطاع خدمي نشط في السوق المصري';

  const opportunityScore = Math.min(100, websiteScore + reviewScore + branchScore + categoryScore);

  let opportunityTier: LeadTemperature = 'COLD';
  if (opportunityScore >= 85) opportunityTier = 'PREMIUM';
  else if (opportunityScore >= 70) opportunityTier = 'HOT';
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
      name: 'حالة الموقع الإلكتروني',
      score: websiteScore,
      maxScore: 45,
      reason: websiteReason,
    },
    {
      name: 'تقييمات وثقة العملاء',
      score: reviewScore,
      maxScore: 25,
      reason: reviewReason,
    },
    {
      name: 'حجم النشاط وتعدد الفروع',
      score: branchScore,
      maxScore: 20,
      reason: branchReason,
    },
    {
      name: 'النشاط التجاري والقطاع',
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

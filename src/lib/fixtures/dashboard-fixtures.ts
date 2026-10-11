import { MatchedLeadData } from '@/components/domain/MatchRow';
import { PipelineStage } from '@/components/domain/StageBadge';

export interface DashboardFixtureData {
  stats: {
    newMatchedLeadsCount: number;
    hotLeadsCount: number;
    warmLeadsCount: number;
    usedLeadsCount: number;
    availableLeadsCount: number;
    remainingCredits: number;
    leadsThisWeekCount: number;
  };
  conversion: {
    totalClaimed: number;
    contactedCount: number;
    repliedCount: number;
    meetingCount: number;
    wonCount: number;
    contactRate: number;
    replyRate: number;
    conversionRate: number;
  };
  subscription: {
    status: string;
    credits: number;
    totalCreditsGranted: number;
    creditsUsed: number;
    currentPeriodEnd: string;
    plan: {
      slug: string;
      name: string;
      nameEn: string;
      priceEgp: number;
    };
  };
  profile: {
    services: string[];
    locations: string[];
    niches: string[];
    minBudget: number;
    leadType: string;
  };
  topMatchedLeads: MatchedLeadData[];
  recentClaims: {
    id: string;
    leadId: string;
    pipelineStatus: PipelineStage;
    claimedAt: string;
    lead: {
      businessName: string;
      city: string;
      category: string;
      phone?: string;
    };
  }[];
}

/**
 * Standard developer dashboard dev fixtures with varied tiers, scores,
 * match percentages, freshness states, and pipeline stages.
 * For use in /design-system, stories, and screenshot visual testing.
 */
export const DASHBOARD_FIXTURES: DashboardFixtureData = {
  stats: {
    newMatchedLeadsCount: 213,
    hotLeadsCount: 226,
    warmLeadsCount: 142,
    usedLeadsCount: 38,
    availableLeadsCount: 580,
    remainingCredits: 150,
    leadsThisWeekCount: 250,
  },
  conversion: {
    totalClaimed: 38,
    contactedCount: 32,
    repliedCount: 24,
    meetingCount: 14,
    wonCount: 8,
    contactRate: 84,
    replyRate: 75,
    conversionRate: 25,
  },
  subscription: {
    status: 'ACTIVE',
    credits: 150,
    totalCreditsGranted: 200,
    creditsUsed: 50,
    currentPeriodEnd: '2026-11-01T00:00:00.000Z',
    plan: {
      slug: 'pro',
      name: 'الباقة الاحترافية',
      nameEn: 'Pro Plan',
      priceEgp: 599,
    },
  },
  profile: {
    services: ['Website Development', 'E-Commerce Development', 'Website Redesign'],
    locations: ['Cairo', 'Giza', 'New Cairo'],
    niches: ['Dental', 'Medical', 'Real Estate'],
    minBudget: 15000,
    leadType: 'exclusive',
  },
  topMatchedLeads: [
    {
      id: 'fix-lead-1',
      businessName: 'عيادات النيل التخصصية لطب الأسنان',
      category: 'Dental',
      city: 'Cairo',
      governorate: 'Cairo',
      score: 96,
      opportunityScore: 96,
      qualityScore: 94,
      freshnessStatus: 'FRESH',
      verificationStatus: 'VERIFIED',
      temperature: 'PREMIUM',
      websiteStatus: 'NO_WEBSITE',
      matchStrength: 98,
      matchPercentage: 98,
    },
    {
      id: 'fix-lead-2',
      businessName: 'مجمع الأمل الطبي التخصصي',
      category: 'Medical',
      city: 'Giza',
      governorate: 'Giza',
      score: 84,
      opportunityScore: 84,
      qualityScore: 88,
      freshnessStatus: 'FRESH',
      verificationStatus: 'VERIFIED',
      temperature: 'HOT',
      websiteStatus: 'POOR_WEBSITE',
      matchStrength: 92,
      matchPercentage: 92,
    },
    {
      id: 'fix-lead-3',
      businessName: 'شركة التعمير للاستثمار العقاري',
      category: 'Real Estate',
      city: 'New Cairo',
      governorate: 'Cairo',
      score: 78,
      opportunityScore: 78,
      qualityScore: 82,
      freshnessStatus: 'AGING',
      verificationStatus: 'PARTIALLY_VERIFIED',
      temperature: 'HOT',
      websiteStatus: 'POOR_WEBSITE',
      matchStrength: 88,
      matchPercentage: 88,
    },
    {
      id: 'fix-lead-4',
      businessName: 'مطاعم وكافيهات قصر الشوق',
      category: 'Restaurant',
      city: 'Alexandria',
      governorate: 'Alexandria',
      score: 65,
      opportunityScore: 65,
      qualityScore: 70,
      freshnessStatus: 'AGING',
      verificationStatus: 'NEEDS_REVERIFICATION',
      temperature: 'WARM',
      websiteStatus: 'NO_WEBSITE',
      matchStrength: 80,
      matchPercentage: 80,
    },
    {
      id: 'fix-lead-5',
      businessName: 'معارض الأفق الحديثة للأثاث',
      category: 'Retail',
      city: 'Mansoura',
      governorate: 'Dakahlia',
      score: 42,
      opportunityScore: 42,
      qualityScore: 55,
      freshnessStatus: 'STALE',
      verificationStatus: 'UNVERIFIED',
      temperature: 'COLD',
      websiteStatus: 'HAS_WEBSITE',
      matchStrength: 60,
      matchPercentage: 60,
    },
  ],
  recentClaims: [
    {
      id: 'fix-claim-1',
      leadId: 'fix-lead-1',
      pipelineStatus: 'NEW',
      claimedAt: '2026-10-10T10:00:00.000Z',
      lead: {
        businessName: 'مركز الشروق لطب وجراحة الفم',
        city: 'Cairo',
        category: 'Dental',
        phone: '+20 100 123 4567',
      },
    },
    {
      id: 'fix-claim-2',
      leadId: 'fix-lead-2',
      pipelineStatus: 'CONTACTED',
      claimedAt: '2026-10-09T14:30:00.000Z',
      lead: {
        businessName: 'مختبرات الدلتا للتحاليل الطبية',
        city: 'Giza',
        category: 'Medical',
        phone: '+20 102 987 6543',
      },
    },
    {
      id: 'fix-claim-3',
      leadId: 'fix-lead-3',
      pipelineStatus: 'MEETING',
      claimedAt: '2026-10-08T11:15:00.000Z',
      lead: {
        businessName: 'مجموعة كافيهات ومطاعم الميناء',
        city: 'Alexandria',
        category: 'Restaurant',
        phone: '+20 111 456 7890',
      },
    },
    {
      id: 'fix-claim-4',
      leadId: 'fix-lead-4',
      pipelineStatus: 'WON',
      claimedAt: '2026-10-06T09:00:00.000Z',
      lead: {
        businessName: 'مكتب المعمار للاستشارات الهندسية',
        city: 'New Cairo',
        category: 'Real Estate',
        phone: '+20 122 345 6789',
      },
    },
  ],
};

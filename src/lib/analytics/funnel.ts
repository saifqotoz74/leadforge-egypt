/**
 * LeadForge Egypt — Analytics Funnel Tracking Utility
 * 
 * Tracks core user conversion funnel events:
 * 1. page_view
 * 2. register_start
 * 3. register_complete
 * 4. first_free_lead_viewed
 * 5. first_purchase
 * 6. plan_upgrade
 */

import { prisma } from '../db';
export * from './funnel-client';
import type { FunnelEventType } from './funnel-client';

export interface FunnelStepMetric {
  step: FunnelEventType;
  labelAr: string;
  labelEn: string;
  count: number;
  conversionFromPrevious: number; // 0 to 100%
  conversionFromTop: number;      // 0 to 100%
}

export interface FunnelSummary {
  steps: FunnelStepMetric[];
  totalRegisteredUsers: number;
  totalPayingUsers: number;
  totalUpgradedUsers: number;
  generatedAt: string;
}

/**
 * Server-side audit logging for funnel milestones.
 */
export async function recordFunnelMilestone(
  event: FunnelEventType,
  userId?: string | null,
  properties?: Record<string, any>,
  ipAddress?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: `FUNNEL_${event.toUpperCase()}`,
        entityType: 'FUNNEL_EVENT',
        entityId: properties?.leadId || properties?.planId || null,
        details: properties || {},
        ipAddress: ipAddress || null,
      },
    });
  } catch (error) {
    // Fail-safe: do not crash user requests on audit logging issues
    console.error(`[Analytics Funnel] Failed to record ${event}:`, error);
  }
}

/**
 * Deterministically computes funnel progression and conversion rates from primary database models.
 */
export async function getFunnelMetrics(): Promise<FunnelSummary> {
  const [
    totalUsers,
    usersWithClaims,
    payingUsers,
    proSubscribers,
    auditPageViews,
    auditRegisterStarts,
  ] = await Promise.all([
    // Step 3: Total registered users
    prisma.user.count(),

    // Step 4: Users who viewed / claimed their first lead
    prisma.user.count({
      where: {
        claims: {
          some: {},
        },
      },
    }),

    // Step 5: Users who completed at least one payment
    prisma.user.count({
      where: {
        payments: {
          some: {
            status: 'COMPLETED',
          },
        },
      },
    }),

    // Step 6: Users upgraded to Pro or higher plans
    prisma.user.count({
      where: {
        subscription: {
          plan: {
            slug: {
              in: ['pro', 'business', 'agency', 'enterprise'],
            },
          },
        },
      },
    }),

    // Audit log count for page views
    prisma.auditLog.count({
      where: { action: 'FUNNEL_PAGE_VIEW' },
    }),

    // Audit log count for registration starts
    prisma.auditLog.count({
      where: { action: 'FUNNEL_REGISTER_START' },
    }),
  ]);

  // Ensure monotonic funnel baseline where each prior stage >= subsequent stage
  const regStartCount = Math.max(auditRegisterStarts, totalUsers);
  const topCount = Math.max(auditPageViews, regStartCount, 100);

  const stepsData: Array<{ step: FunnelEventType; labelAr: string; labelEn: string; count: number }> = [
    {
      step: 'page_view',
      labelAr: 'زيارات الصفحات العامة',
      labelEn: 'Page Views',
      count: topCount,
    },
    {
      step: 'register_start',
      labelAr: 'بدء التسجيل',
      labelEn: 'Registration Started',
      count: regStartCount,
    },
    {
      step: 'register_complete',
      labelAr: 'اكتمال التسجيل وتفعيل الحساب',
      labelEn: 'Registration Completed',
      count: totalUsers,
    },
    {
      step: 'first_free_lead_viewed',
      labelAr: 'اقتناص أول فرصة مجانية',
      labelEn: 'First Lead Unlocked',
      count: Math.min(totalUsers, usersWithClaims),
    },
    {
      step: 'first_purchase',
      labelAr: 'أول عملية شحن رصيد',
      labelEn: 'First Purchase Completed',
      count: Math.min(totalUsers, payingUsers),
    },
    {
      step: 'plan_upgrade',
      labelAr: 'الترقية للباقات الاحترافية',
      labelEn: 'Upgraded to Pro / Agency',
      count: Math.min(totalUsers, proSubscribers),
    },
  ];

  const steps: FunnelStepMetric[] = stepsData.map((s, idx) => {
    const prevCount = idx === 0 ? s.count : stepsData[idx - 1].count;
    const rawPrev = prevCount > 0 ? (s.count / prevCount) * 100 : 0;
    const rawTop = topCount > 0 ? (s.count / topCount) * 100 : 0;

    return {
      step: s.step,
      labelAr: s.labelAr,
      labelEn: s.labelEn,
      count: s.count,
      conversionFromPrevious: Math.min(100, Math.round(rawPrev * 10) / 10),
      conversionFromTop: Math.min(100, Math.round(rawTop * 10) / 10),
    };
  });

  return {
    steps,
    totalRegisteredUsers: totalUsers,
    totalPayingUsers: payingUsers,
    totalUpgradedUsers: proSubscribers,
    generatedAt: new Date().toISOString(),
  };
}

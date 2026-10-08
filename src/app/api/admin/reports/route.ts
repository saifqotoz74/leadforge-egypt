import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAdminEngagementsOverview } from '@/lib/feedback';
import { redactSensitiveData } from '@/lib/security/error-taxonomy';
import {
  buildRateMetric,
  calculateCentralizedFunnelMetrics,
  evaluateClaimEngagementFlags,
  METRIC_DICTIONARY,
  normalizeAnalyticsFilters,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [
      totalUsers,
      activeSubscribers,
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      claims,
      feedbacks,
      payments,
      allLeads,
      recentAuditLogs,
      engagementsOverview,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'DEVELOPER' } }),
      prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          plan: { priceEgp: { gt: 0 } },
        },
      }),
      prisma.lead.count({ where: { isCanonical: true } }),
      prisma.lead.count({ where: { isCanonical: true, temperature: { in: ['HOT', 'PREMIUM'] } } }),
      prisma.lead.count({ where: { isCanonical: true, temperature: 'WARM' } }),
      prisma.lead.count({ where: { isCanonical: true, temperature: 'COLD' } }),
      prisma.leadClaim.findMany({ include: { engagement: true } }),
      prisma.leadFeedback.findMany({
        select: {
          id: true,
          useful: true,
          reasonCode: true,
          reason: true,
        },
      }),
      prisma.payment.findMany({
        where: { status: 'COMPLETED' },
        select: {
          id: true,
          amountEgp: true,
        },
      }),
      prisma.lead.findMany({
        where: { isCanonical: true },
        select: {
          id: true,
          city: true,
          category: true,
          websiteStatus: true,
          status: true,
          qualityScore: true,
          qualityStatus: true,
          freshnessStatus: true,
          verificationStatus: true,
          saleabilityStatus: true,
          qualityFlags: true,
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      getAdminEngagementsOverview({ page: 1, pageSize: 20 }),
    ]);

    const evaluatedFlags = claims
      .filter((c) => c.status !== 'FAILED' && c.status !== 'CANCELLED')
      .map((c) => evaluateClaimEngagementFlags(c, c.engagement));

    const totalClaims = evaluatedFlags.length;
    const contactedClaims = evaluatedFlags.filter((f) => f.isContacted).length;
    const repliedClaims = evaluatedFlags.filter((f) => f.isReplied).length;
    const interestedClaims = evaluatedFlags.filter((f) => f.isInterested).length;
    const meetingClaims = evaluatedFlags.filter((f) => f.isMeeting).length;
    const proposalClaims = evaluatedFlags.filter((f) => f.isProposal).length;
    const negotiationClaims = evaluatedFlags.filter((f) => f.isNegotiation).length;
    const wonClaims = evaluatedFlags.filter((f) => f.isWon).length;
    const lostClaims = evaluatedFlags.filter((f) => f.isLost).length;
    const notInterestedClaims = evaluatedFlags.filter((f) => f.isNotInterested).length;
    const invalidClaims = evaluatedFlags.filter((f) => f.isInvalid).length;

    const totalFeedbacks = feedbacks.length;
    const usefulFeedbacks = feedbacks.filter((f) => f.useful).length;
    const negativeFeedbacks = feedbacks.filter((f) => !f.useful);

    const feedbackReasonBreakdown: Record<string, number> = {};
    for (const f of negativeFeedbacks) {
      const r = f.reasonCode || f.reason || 'OTHER';
      feedbackReasonBreakdown[r] = (feedbackReasonBreakdown[r] || 0) + 1;
    }

    const distinctInvalidLeadIds = new Set<string>();
    for (const l of allLeads) {
      if (l.status === 'INVALID' || l.saleabilityStatus === 'INVALID') {
        distinctInvalidLeadIds.add(l.id);
      }
    }
    for (const f of evaluatedFlags) {
      if (f.isInvalid) distinctInvalidLeadIds.add(f.leadId);
    }

    const filters = normalizeAnalyticsFilters({ preset: 'all_time' });
    const centralizedFunnel = calculateCentralizedFunnelMetrics(
      {
        claimed: totalClaims,
        contacted: contactedClaims,
        replied: repliedClaims,
        interested: interestedClaims,
        meetings: meetingClaims,
        proposals: proposalClaims,
        negotiations: negotiationClaims,
        won: wonClaims,
        lost: lostClaims,
        notInterested: notInterestedClaims,
        invalid: invalidClaims,
      },
      filters
    );
    const centralizedInvalidRate = buildRateMetric(
      'INVALID_RATE',
      distinctInvalidLeadIds.size,
      totalLeads,
      filters
    );

    const leadSuccessRate =
      totalFeedbacks > 0 ? Math.round((usefulFeedbacks / totalFeedbacks) * 100) : 100;
    const invalidRate =
      centralizedInvalidRate.value !== null
        ? Math.min(100, Math.round(centralizedInvalidRate.value * 100))
        : 0;
    const contactRate =
      centralizedFunnel.stageRates.contactRate.value !== null
        ? Math.round(centralizedFunnel.stageRates.contactRate.value * 100)
        : 0;
    const replyRate =
      totalClaims > 0 ? Math.round((repliedClaims / totalClaims) * 100) : 0;
    const meetingRate =
      centralizedFunnel.overallRates.meetingRateOfClaimed.value !== null
        ? Math.round(centralizedFunnel.overallRates.meetingRateOfClaimed.value * 100)
        : 0;
    const wonRate =
      centralizedFunnel.overallRates.winRateOfClaimed.value !== null
        ? Math.round(centralizedFunnel.overallRates.winRateOfClaimed.value * 100)
        : 0;

    const totalRevenueEgp = payments.reduce((acc, p) => acc + p.amountEgp, 0);

    const byCity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byWebsiteStatus: Record<string, number> = {};
    const byQualityStatus: Record<string, number> = {};
    const byFreshnessStatus: Record<string, number> = {};
    const byVerificationStatus: Record<string, number> = {};
    const bySaleabilityStatus: Record<string, number> = {};

    for (const l of allLeads) {
      byCity[l.city] = (byCity[l.city] || 0) + 1;
      byCategory[l.category] = (byCategory[l.category] || 0) + 1;
      byWebsiteStatus[l.websiteStatus] = (byWebsiteStatus[l.websiteStatus] || 0) + 1;
      byQualityStatus[l.qualityStatus] = (byQualityStatus[l.qualityStatus] || 0) + 1;
      byFreshnessStatus[l.freshnessStatus] = (byFreshnessStatus[l.freshnessStatus] || 0) + 1;
      byVerificationStatus[l.verificationStatus] =
        (byVerificationStatus[l.verificationStatus] || 0) + 1;
      bySaleabilityStatus[l.saleabilityStatus] =
        (bySaleabilityStatus[l.saleabilityStatus] || 0) + 1;
    }

    return NextResponse.json({
      overview: {
        totalUsers,
        activeSubscribers,
        totalLeads,
        hotLeads,
        warmLeads,
        coldLeads,
        leadsClaimed: totalClaims,
        leadsWon: wonClaims,
        revenueEgp: totalRevenueEgp,
      },
      rates: {
        leadSuccessRate,
        invalidRate,
        contactRate,
        replyRate,
        meetingRate,
        wonRate,
      },
      centralizedMetrics: {
        funnel: centralizedFunnel,
        invalidRate: centralizedInvalidRate,
        metricDictionaryVersion: METRIC_DICTIONARY.WIN_RATE.version,
      },
      feedbackStats: {
        totalFeedbacks,
        usefulFeedbacks,
        notUsefulFeedbacks: negativeFeedbacks.length,
        reasonsBreakdown: feedbackReasonBreakdown,
      },
      engagementsOverview,
      distributions: {
        byCity,
        byCategory,
        byWebsiteStatus,
        byQualityStatus,
        byFreshnessStatus,
        byVerificationStatus,
        bySaleabilityStatus,
      },
      qualityOverview: {
        byQualityStatus,
        byFreshnessStatus,
        byVerificationStatus,
        bySaleabilityStatus,
        averageQualityScore:
          allLeads.length > 0
            ? Math.round(
                (allLeads.reduce((acc, l) => acc + (l.qualityScore ?? 0), 0) /
                  allLeads.length) *
                  10
              ) / 10
            : 0,
      },
      recentAuditLogs: recentAuditLogs.map((log) => ({
        ...log,
        details: redactSensitiveData(log.details),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب التقارير.' }, { status: 500 });
  }
}

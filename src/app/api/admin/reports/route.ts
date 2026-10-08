import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

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
      prisma.leadClaim.findMany(),
      prisma.leadFeedback.findMany(),
      prisma.payment.findMany({ where: { status: 'COMPLETED' } }),
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
    ]);

    const totalClaims = claims.length;
    const contactedClaims = claims.filter((c) =>
      ['CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'WON', 'LOST', 'NOT_INTERESTED'].includes(
        c.pipelineStatus
      )
    ).length;
    const repliedClaims = claims.filter((c) =>
      ['REPLIED', 'INTERESTED', 'MEETING', 'WON'].includes(c.pipelineStatus)
    ).length;
    const meetingClaims = claims.filter((c) =>
      ['MEETING', 'WON'].includes(c.pipelineStatus)
    ).length;
    const wonClaims = claims.filter((c) => c.pipelineStatus === 'WON').length;

    const totalFeedbacks = feedbacks.length;
    const usefulFeedbacks = feedbacks.filter((f) => f.useful).length;
    const negativeFeedbacks = feedbacks.filter((f) => !f.useful);

    const feedbackReasonBreakdown: Record<string, number> = {};
    for (const f of negativeFeedbacks) {
      const r = f.reason || 'OTHER';
      feedbackReasonBreakdown[r] = (feedbackReasonBreakdown[r] || 0) + 1;
    }

    const distinctInvalidLeadIds = new Set<string>();
    for (const l of allLeads) {
      if (l.status === 'INVALID' || l.saleabilityStatus === 'INVALID') {
        distinctInvalidLeadIds.add(l.id);
      }
    }
    for (const c of claims) {
      if (c.pipelineStatus === 'INVALID') distinctInvalidLeadIds.add(c.leadId);
    }

    const leadSuccessRate =
      totalFeedbacks > 0 ? Math.round((usefulFeedbacks / totalFeedbacks) * 100) : 100;
    const invalidRate =
      totalLeads > 0
        ? Math.min(100, Math.round((distinctInvalidLeadIds.size / Math.max(1, totalLeads)) * 100))
        : 0;
    const contactRate =
      totalClaims > 0 ? Math.round((contactedClaims / totalClaims) * 100) : 0;
    const replyRate =
      totalClaims > 0 ? Math.round((repliedClaims / totalClaims) * 100) : 0;
    const meetingRate =
      totalClaims > 0 ? Math.round((meetingClaims / totalClaims) * 100) : 0;
    const wonRate =
      totalClaims > 0 ? Math.round((wonClaims / totalClaims) * 100) : 0;

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
      feedbackStats: {
        totalFeedbacks,
        usefulFeedbacks,
        notUsefulFeedbacks: negativeFeedbacks.length,
        reasonsBreakdown: feedbackReasonBreakdown,
      },
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
      recentAuditLogs,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/reports error:', err);
    return NextResponse.json({ error: 'تعذر جلب التقارير.' }, { status: 500 });
  }
}

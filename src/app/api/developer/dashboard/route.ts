import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEFAULT_FRESHNESS_THRESHOLDS, evaluateLeadFreshness } from '@/lib/freshness';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { getActiveMatchingConfigAndRules } from '@/lib/matching/service';
import { resolveLeadProjectType, resolveLeadRequiredServices } from '@/lib/matching/taxonomy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [allAvailableLeads, myClaims, notifications, freshnessRow, matchingCtx] =
      await Promise.all([
        prisma.lead.findMany({
          where: {
            status: 'AVAILABLE',
            isCanonical: true,
            saleabilityStatus: 'AVAILABLE',
          },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
          take: 250,
        }),
        prisma.leadClaim.findMany({
          where: { userId: user.id },
          include: { lead: true },
          orderBy: { claimedAt: 'desc' },
        }),
        prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.freshnessConfig.findUnique({ where: { id: 'default' } }),
        getActiveMatchingConfigAndRules(),
      ]);

    const thresholds = freshnessRow || DEFAULT_FRESHNESS_THRESHOLDS;
    const { config: matchingConfig, rules: matchingRules } = matchingCtx;

    const claimedLeadIds = new Set(myClaims.map((c) => c.leadId));
    const activeClaimsCount = myClaims.filter((c) =>
      ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'].includes(c.pipelineStatus)
    ).length;

    const unclaimedLeads = allAvailableLeads.filter((l) => !claimedLeadIds.has(l.id));

    const matchedLeads = unclaimedLeads
      .map((lead) => {
        const freshness = evaluateLeadFreshness(lead.lastVerifiedAt, thresholds);
        const dynamicSaleabilityStatus =
          lead.saleabilityStatus === 'AVAILABLE' && freshness.isStale
            ? 'STALE'
            : lead.saleabilityStatus === 'AVAILABLE' && freshness.requiresVerification
              ? 'REQUIRES_VERIFICATION'
              : lead.saleabilityStatus;

        const matchableLead = {
          id: lead.id,
          businessName: lead.businessName,
          category: lead.category,
          governorate: lead.governorate,
          city: lead.city,
          area: lead.area,
          websiteStatus: lead.websiteStatus,
          requiredService: lead.requiredService,
          requiredServices: lead.requiredServices,
          projectLeadType: lead.projectLeadType,
          estimatedBudget: lead.estimatedBudget,
          minBudget: lead.minBudget,
          maxBudget: lead.maxBudget,
          budgetCurrency: lead.budgetCurrency,
          budgetType: lead.budgetType,
          leadType: lead.leadType,
          exclusive: lead.exclusive,
          score: lead.score,
          qualityScore: lead.qualityScore,
          qualityStatus: lead.qualityStatus,
          freshnessStatus: freshness.freshnessStatus,
          verificationStatus: lead.verificationStatus,
          saleabilityStatus: dynamicSaleabilityStatus,
          isCanonical: lead.isCanonical,
          businessStatus: lead.businessStatus,
          temperature: lead.temperature,
        };

        const matchEvaluation = evaluateDeveloperLeadMatch(
          matchableLead,
          user.developerProfile,
          {
            config: matchingConfig,
            rules: matchingRules,
            matchVersion: matchingConfig.currentVersion,
            activeClaimsCount,
            subscription: user.subscription
              ? {
                  id: user.subscription.id,
                  status: user.subscription.status,
                  credits: user.subscription.credits,
                  currentPeriodEnd: user.subscription.currentPeriodEnd,
                  plan: user.subscription.plan
                    ? {
                        id: user.subscription.plan.id,
                        slug: user.subscription.plan.slug,
                        name: user.subscription.plan.name,
                        nameEn: user.subscription.plan.nameEn,
                        allowsExclusive: user.subscription.plan.allowsExclusive,
                        isActive: user.subscription.plan.isActive,
                      }
                    : null,
                }
              : null,
            userStatus: user.status,
          }
        );

        const resolvedServices = resolveLeadRequiredServices(matchableLead);
        const resolvedProjectType = resolveLeadProjectType(matchableLead);

        return {
          ...lead,
          opportunityScore: lead.score,
          freshnessStatus: freshness.freshnessStatus,
          saleabilityStatus: dynamicSaleabilityStatus,
          freshness,
          requiredService: lead.requiredService || resolvedServices.primary,
          requiredServices:
            lead.requiredServices && lead.requiredServices.length > 0
              ? lead.requiredServices
              : resolvedServices.allRequired,
          projectLeadType: lead.projectLeadType || resolvedProjectType,
          niche: lead.category,
          location: `${lead.city}${lead.area ? ` — ${lead.area}` : ''} (${lead.governorate})`,
          matchStrength: matchEvaluation.matchStrength,
          matchPercentage: matchEvaluation.matchPercentage,
          matchVersion: matchEvaluation.matchVersion,
          explanation: matchEvaluation.explanation,
          warnings: matchEvaluation.warnings || [],
          matchEvaluation,
        };
      })
      .filter((item) => {
        if (
          item.freshness.isStale ||
          (item.freshness.requiresVerification &&
            matchingConfig.requiresVerificationPolicy === 'EXCLUDE') ||
          item.businessStatus === 'CLOSED' ||
          item.verificationStatus === 'FAILED_VERIFICATION'
        ) {
          return false;
        }
        return item.matchEvaluation.isMatch;
      })
      .sort((a, b) => {
        if (b.matchEvaluation.matchStrength !== a.matchEvaluation.matchStrength) {
          return b.matchEvaluation.matchStrength - a.matchEvaluation.matchStrength;
        }
        if (b.qualityScore !== a.qualityScore) {
          return b.qualityScore - a.qualityScore;
        }
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.id.localeCompare(b.id);
      });

    const hotLeadsCount = allAvailableLeads.filter(
      (l) => l.temperature === 'HOT' || l.temperature === 'PREMIUM'
    ).length;
    const warmLeadsCount = allAvailableLeads.filter((l) => l.temperature === 'WARM').length;
    const leadsThisWeekCount = allAvailableLeads.filter(
      (l) => new Date(l.createdAt) >= sevenDaysAgo
    ).length;

    const totalUsed = myClaims.length;
    const contactedCount = myClaims.filter((c) =>
      ['CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'WON'].includes(c.pipelineStatus)
    ).length;
    const repliedCount = myClaims.filter((c) =>
      ['REPLIED', 'INTERESTED', 'MEETING', 'WON'].includes(c.pipelineStatus)
    ).length;
    const meetingCount = myClaims.filter((c) =>
      ['MEETING', 'WON'].includes(c.pipelineStatus)
    ).length;
    const wonCount = myClaims.filter((c) => c.pipelineStatus === 'WON').length;

    const conversionRate =
      totalUsed > 0 ? Math.round((wonCount / totalUsed) * 100) : 0;
    const contactRate =
      totalUsed > 0 ? Math.round((contactedCount / totalUsed) * 100) : 0;
    const replyRate =
      totalUsed > 0 ? Math.round((repliedCount / totalUsed) * 100) : 0;

    return NextResponse.json({
      stats: {
        newMatchedLeadsCount: matchedLeads.length,
        hotLeadsCount,
        warmLeadsCount,
        usedLeadsCount: totalUsed,
        availableLeadsCount: unclaimedLeads.length,
        remainingCredits: user.subscription?.credits ?? 0,
        leadsThisWeekCount,
      },
      conversion: {
        totalClaimed: totalUsed,
        contactedCount,
        repliedCount,
        meetingCount,
        wonCount,
        contactRate,
        replyRate,
        conversionRate,
      },
      matchVersion: matchingConfig.currentVersion,
      subscription: user.subscription,
      profile: user.developerProfile,
      topMatchedLeads: matchedLeads.slice(0, 6),
      recentClaims: myClaims.slice(0, 5),
      notifications,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/developer/dashboard error:', err);
    return NextResponse.json({ error: 'تعذر جلب إحصائيات لوحة التحكم.' }, { status: 500 });
  }
}

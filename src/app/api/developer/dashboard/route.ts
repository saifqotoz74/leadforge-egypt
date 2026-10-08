import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEFAULT_FRESHNESS_THRESHOLDS, evaluateLeadFreshness } from '@/lib/freshness';
import { sanitizeLeadForDeveloper } from '@/lib/lead-service';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { getActiveMatchingConfigAndRules } from '@/lib/matching/service';
import { resolveLeadProjectType, resolveLeadRequiredServices } from '@/lib/matching/taxonomy';
import {
  calculateCentralizedFunnelMetrics,
  evaluateClaimEngagementFlags,
  normalizeAnalyticsFilters,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [allAvailableLeads, myClaims, notifications, freshnessRow, matchingCtx, creditAccount] =
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
          include: { lead: true, engagement: true },
          orderBy: { claimedAt: 'desc' },
        }),
        prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.freshnessConfig.findUnique({ where: { id: 'default' } }),
        getActiveMatchingConfigAndRules(),
        prisma.developerCreditAccount.findUnique({ where: { developerId: user.id } }),
      ]);

    const thresholds = freshnessRow || DEFAULT_FRESHNESS_THRESHOLDS;
    const { config: matchingConfig, rules: matchingRules } = matchingCtx;

    const activeMyClaims = myClaims.filter(
      (c) => c.status === 'ACTIVE' && c.accessGranted !== false
    );
    const claimedLeadIds = new Set(activeMyClaims.map((c) => c.leadId));
    const activeClaimsCount = activeMyClaims.filter((c) =>
      ['NEW', 'CLAIMED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'PROPOSAL_SENT', 'NEGOTIATION'].includes(
        c.pipelineStatus
      )
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
                  credits: creditAccount?.balance ?? user.subscription.credits,
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
        const sanitizedLead = sanitizeLeadForDeveloper(lead, false);

        return {
          ...sanitizedLead,
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

    const evaluatedFlags = activeMyClaims.map((c) =>
      evaluateClaimEngagementFlags(c, c.engagement)
    );
    const totalUsed = evaluatedFlags.length;
    const contactedCount = evaluatedFlags.filter((f) => f.isContacted).length;
    const repliedCount = evaluatedFlags.filter((f) => f.isReplied).length;
    const interestedCount = evaluatedFlags.filter((f) => f.isInterested).length;
    const meetingCount = evaluatedFlags.filter((f) => f.isMeeting).length;
    const proposalCount = evaluatedFlags.filter((f) => f.isProposal).length;
    const negotiationCount = evaluatedFlags.filter((f) => f.isNegotiation).length;
    const wonCount = evaluatedFlags.filter((f) => f.isWon).length;
    const lostCount = evaluatedFlags.filter((f) => f.isLost).length;
    const notInterestedCount = evaluatedFlags.filter((f) => f.isNotInterested).length;
    const invalidCount = evaluatedFlags.filter((f) => f.isInvalid).length;

    const centralizedFunnel = calculateCentralizedFunnelMetrics(
      {
        claimed: totalUsed,
        contacted: contactedCount,
        replied: repliedCount,
        interested: interestedCount,
        meetings: meetingCount,
        proposals: proposalCount,
        negotiations: negotiationCount,
        won: wonCount,
        lost: lostCount,
        notInterested: notInterestedCount,
        invalid: invalidCount,
      },
      normalizeAnalyticsFilters({ developerId: user.id })
    );

    const conversionRate =
      centralizedFunnel.overallRates.winRateOfClaimed.value !== null
        ? Math.round(centralizedFunnel.overallRates.winRateOfClaimed.value * 100)
        : 0;
    const contactRate =
      centralizedFunnel.stageRates.contactRate.value !== null
        ? Math.round(centralizedFunnel.stageRates.contactRate.value * 100)
        : 0;
    const replyRate =
      totalUsed > 0 ? Math.round((repliedCount / totalUsed) * 100) : 0;

    const sanitizedRecentClaims = myClaims.slice(0, 5).map((c) => {
      const canViewSensitive = c.status === 'ACTIVE' && c.accessGranted !== false;
      return {
        ...c,
        lead: sanitizeLeadForDeveloper(c.lead, canViewSensitive),
      };
    });

    return NextResponse.json({
      stats: {
        newMatchedLeadsCount: matchedLeads.length,
        hotLeadsCount,
        warmLeadsCount,
        usedLeadsCount: totalUsed,
        availableLeadsCount: unclaimedLeads.length,
        remainingCredits: creditAccount?.balance ?? user.subscription?.credits ?? 0,
        leadsThisWeekCount,
      },
      conversion: {
        totalClaimed: totalUsed,
        contactedCount,
        repliedCount,
        interestedCount,
        meetingCount,
        proposalCount,
        negotiationCount,
        wonCount,
        contactRate,
        replyRate,
        conversionRate,
      },
      centralizedFunnel,
      matchVersion: matchingConfig.currentVersion,
      subscription: user.subscription,
      profile: user.developerProfile,
      topMatchedLeads: matchedLeads.slice(0, 6),
      recentClaims: sanitizedRecentClaims,
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

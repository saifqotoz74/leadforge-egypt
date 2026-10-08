import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { evaluateLeadFreshness, DEFAULT_FRESHNESS_THRESHOLDS } from '@/lib/freshness';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { getActiveMatchingConfigAndRules } from '@/lib/matching/service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const leadId = params.id;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        claims: {
          where: { userId: user.id },
          include: {
            statusHistories: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        feedbacks: {
          where: { userId: user.id },
        },
        scores: {
          orderBy: { calculatedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 });
    }

    const [freshnessRow, matchingCtx] = await Promise.all([
      prisma.freshnessConfig.findUnique({ where: { id: 'default' } }),
      getActiveMatchingConfigAndRules(),
    ]);
    const thresholds = freshnessRow || DEFAULT_FRESHNESS_THRESHOLDS;
    const { config: matchingConfig, rules: matchingRules } = matchingCtx;
    const freshness = evaluateLeadFreshness(lead.lastVerifiedAt, thresholds);

    const dynamicSaleabilityStatus =
      lead.saleabilityStatus === 'AVAILABLE' && freshness.isStale
        ? 'STALE'
        : lead.saleabilityStatus === 'AVAILABLE' && freshness.requiresVerification
          ? 'REQUIRES_VERIFICATION'
          : lead.saleabilityStatus;

    const matchEvaluation = evaluateDeveloperLeadMatch(
      {
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
        temperature: lead.temperature,
        saleabilityStatus: dynamicSaleabilityStatus,
        isCanonical: lead.isCanonical,
        businessStatus: lead.businessStatus,
      },
      user.developerProfile,
      {
        config: matchingConfig,
        rules: matchingRules,
        matchVersion: matchingConfig.currentVersion,
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

    const myClaim = lead.claims[0] || null;
    const myFeedback = lead.feedbacks[0] || null;
    const isUnlocked = Boolean(myClaim) || user.role === 'ADMIN';

    return NextResponse.json({
      lead: {
        id: lead.id,
        businessName: lead.businessName,
        category: lead.category,
        governorate: lead.governorate,
        city: lead.city,
        area: lead.area,
        address: lead.address,
        phone: isUnlocked
          ? lead.phone
          : lead.phone
          ? `${lead.phone.slice(0, 4)}****${lead.phone.slice(-3)}`
          : null,
        hasPhone: lead.hasPhone,
        email: isUnlocked
          ? lead.email
          : lead.email
          ? `${lead.email.slice(0, 2)}***@${lead.email.split('@')[1] || ''}`
          : null,
        hasEmail: lead.hasEmail,
        website: lead.website,
        websiteStatus: lead.websiteStatus,
        facebook: isUnlocked ? lead.facebook : lead.hasFacebook ? 'متاح بعد اقتناص الفرصة' : null,
        hasFacebook: lead.hasFacebook,
        instagram: isUnlocked ? lead.instagram : lead.hasInstagram ? 'متاح بعد اقتناص الفرصة' : null,
        hasInstagram: lead.hasInstagram,
        rating: lead.rating,
        reviewCount: lead.reviewCount,
        branchCount: lead.branchCount,
        estimatedBudget: lead.estimatedBudget,
        minBudget: lead.minBudget,
        maxBudget: lead.maxBudget,
        budgetCurrency: lead.budgetCurrency,
        budgetType: lead.budgetType,
        requiredService: lead.requiredService,
        requiredServices: lead.requiredServices,
        projectLeadType: lead.projectLeadType,
        isVerified: lead.isVerified,
        isRecentlyActive: lead.isRecentlyActive,
        score: lead.score,
        temperature: lead.temperature,
        classification: lead.temperature,
        scoringVersion: lead.scoringVersion,
        scoreExplanation: lead.scoreExplanation,
        qualityScore: lead.qualityScore,
        qualityStatus: lead.qualityStatus,
        freshnessStatus: freshness.freshnessStatus,
        verificationStatus: lead.verificationStatus,
        saleabilityStatus: dynamicSaleabilityStatus,
        completenessScore: lead.completenessScore,
        qualityFlags: lead.qualityFlags,
        businessStatus: lead.businessStatus,
        phoneValidationStatus: lead.phoneValidationStatus,
        emailValidationStatus: lead.emailValidationStatus,
        websiteVerificationState: lead.websiteVerificationState,
        status: lead.status,
        confidence: lead.confidence,
        qualificationReasons: lead.qualificationReasons,
        qualificationRules: lead.qualificationRules,
        websiteAnalysis: lead.websiteAnalysis,
        leadType: lead.leadType,
        exclusive: lead.exclusive,
        maxPurchasers: lead.maxPurchasers,
        currentPurchasers: lead.currentPurchasers,
        source: lead.source,
        sourceList: lead.sourceList,
        lastVerifiedAt: lead.lastVerifiedAt,
        nextVerificationAt: lead.nextVerificationAt,
        lastScoredAt: lead.lastScoredAt,
        createdAt: lead.createdAt,
        freshness,
        matchEvaluation,
        isClaimedByMe: Boolean(myClaim),
        myClaim,
        myFeedback,
        scoreHistory: lead.scores,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/leads/[id] error:', err);
    return NextResponse.json({ error: 'تعذر جلب تفاصيل الفرصة.' }, { status: 500 });
  }
}

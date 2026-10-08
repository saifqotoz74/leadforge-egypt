import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/db';
import {
  evaluateLeadQuality,
  getActiveQualityAndFreshnessConfig,
  getRecentVerificationLogs,
  QualityFlagCode,
} from '@/lib/quality';

export const dynamic = 'force-dynamic';

const ALL_QUALITY_FLAGS: QualityFlagCode[] = [
  'INVALID_PHONE',
  'INVALID_EMAIL',
  'INVALID_WEBSITE',
  'STALE_DATA',
  'CATEGORY_MISMATCH',
  'LOCATION_MISMATCH',
  'POSSIBLE_DUPLICATE',
  'CLOSED_BUSINESS',
  'MISSING_REQUIRED_DATA',
  'CONFLICTING_SOURCE_DATA',
];

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { qualityConfig, freshnessThresholds } =
      await getActiveQualityAndFreshnessConfig();

    const leads = await prisma.lead.findMany({
      include: {
        verifications: {
          orderBy: { checkedAt: 'desc' },
        },
        feedbacks: {
          where: { useful: false },
          select: { reason: true, createdAt: true },
        },
        candidateDuplicates: {
          where: { status: 'PENDING' },
          select: { id: true },
        },
        matchedCandidates: {
          where: { status: 'PENDING' },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const qualityDistribution: Record<string, number> = {
      VERY_LOW: 0,
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      EXCELLENT: 0,
    };

    const freshnessDistribution: Record<string, number> = {
      FRESH: 0,
      RECENT: 0,
      NEEDS_VERIFICATION: 0,
      STALE: 0,
      VERY_STALE: 0,
      UNKNOWN: 0,
    };

    const verificationDistribution: Record<string, number> = {
      VERIFIED: 0,
      PARTIALLY_VERIFIED: 0,
      UNVERIFIED: 0,
      FAILED_VERIFICATION: 0,
    };

    const saleabilityDistribution: Record<string, number> = {
      AVAILABLE: 0,
      REQUIRES_VERIFICATION: 0,
      STALE: 0,
      INVALID: 0,
      CLOSED: 0,
      DUPLICATE: 0,
      NOT_SALEABLE: 0,
      CLAIMED_FULL: 0,
      ARCHIVED: 0,
    };

    const flagCounts: Record<string, number> = {};
    for (const f of ALL_QUALITY_FLAGS) {
      flagCounts[f] = 0;
    }

    const sourceStatsMap = new Map<
      string,
      {
        source: string;
        totalLeads: number;
        totalQualityScore: number;
        totalCompletenessScore: number;
        verifiedCount: number;
        saleableCount: number;
        flaggedCount: number;
      }
    >();

    let totalQualityScore = 0;
    let totalOpportunityScore = 0;
    let totalCompletenessScore = 0;
    let distinctLeadsNeedingVerification = 0;

    for (const lead of leads) {
      const negativeFeedbackEntries = lead.feedbacks
        .filter((f): f is { reason: NonNullable<typeof f.reason>; createdAt: Date } => Boolean(f.reason))
        .map((f) => ({ reason: f.reason as string, createdAt: f.createdAt }));

      const evalResult = evaluateLeadQuality(
        {
          ...lead,
          websiteAnalysis:
            lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
              ? (lead.websiteAnalysis as Record<string, unknown>)
              : null,
          negativeFeedbackReasons: negativeFeedbackEntries.map((e) => e.reason),
          negativeFeedbackEntries,
          hasPendingDuplicateCandidate:
            lead.candidateDuplicates.length > 0 || lead.matchedCandidates.length > 0,
        },
        { qualityConfig, freshnessThresholds }
      );

      qualityDistribution[evalResult.qualityStatus] =
        (qualityDistribution[evalResult.qualityStatus] || 0) + 1;
      freshnessDistribution[evalResult.freshness.freshnessStatus] =
        (freshnessDistribution[evalResult.freshness.freshnessStatus] || 0) + 1;
      verificationDistribution[evalResult.verificationStatus] =
        (verificationDistribution[evalResult.verificationStatus] || 0) + 1;
      saleabilityDistribution[evalResult.saleabilityStatus] =
        (saleabilityDistribution[evalResult.saleabilityStatus] || 0) + 1;

      if (
        evalResult.freshness.requiresVerification ||
        evalResult.saleabilityStatus === 'REQUIRES_VERIFICATION' ||
        evalResult.verificationStatus === 'UNVERIFIED'
      ) {
        distinctLeadsNeedingVerification += 1;
      }

      for (const flag of evalResult.qualityFlags) {
        flagCounts[flag] = (flagCounts[flag] || 0) + 1;
      }

      const sourceKey = (lead.source || 'manual').trim() || 'manual';
      const existingSource = sourceStatsMap.get(sourceKey) || {
        source: sourceKey,
        totalLeads: 0,
        totalQualityScore: 0,
        totalCompletenessScore: 0,
        verifiedCount: 0,
        saleableCount: 0,
        flaggedCount: 0,
      };
      existingSource.totalLeads += 1;
      existingSource.totalQualityScore += evalResult.qualityScore;
      existingSource.totalCompletenessScore += evalResult.completeness.completenessScore;
      if (evalResult.verificationStatus === 'VERIFIED') existingSource.verifiedCount += 1;
      if (evalResult.saleabilityStatus === 'AVAILABLE') existingSource.saleableCount += 1;
      if (evalResult.qualityFlags.length > 0) existingSource.flaggedCount += 1;
      sourceStatsMap.set(sourceKey, existingSource);

      totalQualityScore += evalResult.qualityScore;
      totalOpportunityScore += lead.score;
      totalCompletenessScore += evalResult.completeness.completenessScore;
    }

    const qualityBySource = Array.from(sourceStatsMap.values()).map((s) => ({
      source: s.source,
      totalLeads: s.totalLeads,
      avgQualityScore:
        s.totalLeads > 0 ? Math.round((s.totalQualityScore / s.totalLeads) * 10) / 10 : 0,
      avgCompletenessScore:
        s.totalLeads > 0
          ? Math.round((s.totalCompletenessScore / s.totalLeads) * 10) / 10
          : 0,
      verifiedCount: s.verifiedCount,
      saleableCount: s.saleableCount,
      flaggedCount: s.flaggedCount,
    }));

    const totalLeads = leads.length;
    const averages = {
      avgQualityScore:
        totalLeads > 0 ? Math.round((totalQualityScore / totalLeads) * 10) / 10 : 0,
      avgOpportunityScore:
        totalLeads > 0 ? Math.round((totalOpportunityScore / totalLeads) * 10) / 10 : 0,
      avgCompletenessScore:
        totalLeads > 0 ? Math.round((totalCompletenessScore / totalLeads) * 10) / 10 : 0,
    };

    const recentVerifications = await prisma.leadVerification.findMany({
      orderBy: { checkedAt: 'desc' },
      take: 30,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            city: true,
            category: true,
            qualityScore: true,
            qualityStatus: true,
            saleabilityStatus: true,
          },
        },
      },
    });

    const summary = {
      totalLeads,
      verifiedLeads: verificationDistribution.VERIFIED || 0,
      partiallyVerifiedLeads: verificationDistribution.PARTIALLY_VERIFIED || 0,
      unverifiedLeads: verificationDistribution.UNVERIFIED || 0,
      failedVerificationLeads: verificationDistribution.FAILED_VERIFICATION || 0,
      staleLeads: (freshnessDistribution.STALE || 0) + (freshnessDistribution.VERY_STALE || 0),
      invalidLeads: saleabilityDistribution.INVALID || 0,
      closedBusinesses: saleabilityDistribution.CLOSED || 0,
      duplicateLeads: saleabilityDistribution.DUPLICATE || 0,
      categoryMismatches: flagCounts.CATEGORY_MISMATCH || 0,
      locationMismatches: flagCounts.LOCATION_MISMATCH || 0,
      leadsNeedingVerification: distinctLeadsNeedingVerification,
      saleableLeads: saleabilityDistribution.AVAILABLE || 0,
      averageQualityScore: averages.avgQualityScore,
      averageCompletenessScore: averages.avgCompletenessScore,
    };

    return NextResponse.json({
      totalLeads,
      summary,
      overview: summary,
      qualityDistribution,
      freshnessDistribution,
      verificationDistribution,
      saleabilityDistribution,
      flagCounts,
      flagBreakdown: flagCounts,
      qualityBySource,
      averages,
      recentVerifications,
      recentLogs: getRecentVerificationLogs(20),
      qualityConfig,
      freshnessThresholds,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/quality error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب إحصائيات جودة البيانات.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = await req.json();

    const { qualityConfig: currentQ, freshnessThresholds: currentF } =
      await getActiveQualityAndFreshnessConfig();

    const updatedQuality = await prisma.qualityConfig.upsert({
      where: { id: 'default' },
      update: {
        veryLowMax:
          typeof body.veryLowMax === 'number' ? body.veryLowMax : currentQ.veryLowMax,
        lowMin: typeof body.lowMin === 'number' ? body.lowMin : currentQ.lowMin,
        lowMax: typeof body.lowMax === 'number' ? body.lowMax : currentQ.lowMax,
        mediumMin:
          typeof body.mediumMin === 'number' ? body.mediumMin : currentQ.mediumMin,
        mediumMax:
          typeof body.mediumMax === 'number' ? body.mediumMax : currentQ.mediumMax,
        highMin: typeof body.highMin === 'number' ? body.highMin : currentQ.highMin,
        highMax: typeof body.highMax === 'number' ? body.highMax : currentQ.highMax,
        excellentMin:
          typeof body.excellentMin === 'number'
            ? body.excellentMin
            : currentQ.excellentMin,
        minSaleableQualityScore:
          typeof body.minSaleableQualityScore === 'number'
            ? body.minSaleableQualityScore
            : currentQ.minSaleableQualityScore,
        phoneExpiryDays:
          typeof body.phoneExpiryDays === 'number'
            ? body.phoneExpiryDays
            : currentQ.phoneExpiryDays,
        emailExpiryDays:
          typeof body.emailExpiryDays === 'number'
            ? body.emailExpiryDays
            : currentQ.emailExpiryDays,
        websiteExpiryDays:
          typeof body.websiteExpiryDays === 'number'
            ? body.websiteExpiryDays
            : currentQ.websiteExpiryDays,
        businessStatusExpiryDays:
          typeof body.businessStatusExpiryDays === 'number'
            ? body.businessStatusExpiryDays
            : currentQ.businessStatusExpiryDays,
        addressExpiryDays:
          typeof body.addressExpiryDays === 'number'
            ? body.addressExpiryDays
            : currentQ.addressExpiryDays,
        identityExpiryDays:
          typeof body.identityExpiryDays === 'number'
            ? body.identityExpiryDays
            : currentQ.identityExpiryDays,
      },
      create: {
        id: 'default',
        veryLowMax:
          typeof body.veryLowMax === 'number' ? body.veryLowMax : currentQ.veryLowMax,
        lowMin: typeof body.lowMin === 'number' ? body.lowMin : currentQ.lowMin,
        lowMax: typeof body.lowMax === 'number' ? body.lowMax : currentQ.lowMax,
        mediumMin:
          typeof body.mediumMin === 'number' ? body.mediumMin : currentQ.mediumMin,
        mediumMax:
          typeof body.mediumMax === 'number' ? body.mediumMax : currentQ.mediumMax,
        highMin: typeof body.highMin === 'number' ? body.highMin : currentQ.highMin,
        highMax: typeof body.highMax === 'number' ? body.highMax : currentQ.highMax,
        excellentMin:
          typeof body.excellentMin === 'number'
            ? body.excellentMin
            : currentQ.excellentMin,
        minSaleableQualityScore:
          typeof body.minSaleableQualityScore === 'number'
            ? body.minSaleableQualityScore
            : currentQ.minSaleableQualityScore,
        phoneExpiryDays:
          typeof body.phoneExpiryDays === 'number'
            ? body.phoneExpiryDays
            : currentQ.phoneExpiryDays,
        emailExpiryDays:
          typeof body.emailExpiryDays === 'number'
            ? body.emailExpiryDays
            : currentQ.emailExpiryDays,
        websiteExpiryDays:
          typeof body.websiteExpiryDays === 'number'
            ? body.websiteExpiryDays
            : currentQ.websiteExpiryDays,
        businessStatusExpiryDays:
          typeof body.businessStatusExpiryDays === 'number'
            ? body.businessStatusExpiryDays
            : currentQ.businessStatusExpiryDays,
        addressExpiryDays:
          typeof body.addressExpiryDays === 'number'
            ? body.addressExpiryDays
            : currentQ.addressExpiryDays,
        identityExpiryDays:
          typeof body.identityExpiryDays === 'number'
            ? body.identityExpiryDays
            : currentQ.identityExpiryDays,
      },
    });

    if (
      typeof body.freshMaxDays === 'number' ||
      typeof body.recentMaxDays === 'number' ||
      typeof body.needsVerifyMaxDays === 'number' ||
      typeof body.staleMaxDays === 'number'
    ) {
      await prisma.freshnessConfig.upsert({
        where: { id: 'default' },
        update: {
          freshMaxDays:
            typeof body.freshMaxDays === 'number'
              ? body.freshMaxDays
              : currentF.freshMaxDays,
          recentMaxDays:
            typeof body.recentMaxDays === 'number'
              ? body.recentMaxDays
              : currentF.recentMaxDays,
          needsVerifyMaxDays:
            typeof body.needsVerifyMaxDays === 'number'
              ? body.needsVerifyMaxDays
              : currentF.needsVerifyMaxDays,
          staleMaxDays:
            typeof body.staleMaxDays === 'number'
              ? body.staleMaxDays
              : currentF.staleMaxDays,
        },
        create: {
          id: 'default',
          freshMaxDays:
            typeof body.freshMaxDays === 'number'
              ? body.freshMaxDays
              : currentF.freshMaxDays,
          recentMaxDays:
            typeof body.recentMaxDays === 'number'
              ? body.recentMaxDays
              : currentF.recentMaxDays,
          needsVerifyMaxDays:
            typeof body.needsVerifyMaxDays === 'number'
              ? body.needsVerifyMaxDays
              : currentF.needsVerifyMaxDays,
          staleMaxDays:
            typeof body.staleMaxDays === 'number'
              ? body.staleMaxDays
              : currentF.staleMaxDays,
        },
      });
    }

    await createAuditLog({
      userId: admin.id,
      action: 'ADMIN_QUALITY_CONFIG_UPDATED',
      entityType: 'QualityConfig',
      entityId: 'default',
      details: body,
    });

    return NextResponse.json({
      message: 'تم تحديث إعدادات الجودة والحداثة بنجاح.',
      qualityConfig: updatedQuality,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('PATCH /api/admin/quality error:', err);
    return NextResponse.json(
      { error: 'تعذر تحديث إعدادات الجودة.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  evaluateLeadQuality,
  getActiveQualityAndFreshnessConfig,
  QualityFlagCode,
} from '@/lib/quality';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const flagFilter = searchParams.get('flag')?.trim() || '';

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

    const flaggedLeads = [];
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

      if (evalResult.qualityFlags.length === 0) continue;
      if (
        flagFilter &&
        flagFilter !== 'ALL' &&
        !evalResult.qualityFlags.includes(flagFilter as QualityFlagCode)
      ) {
        continue;
      }

      flaggedLeads.push({
        id: lead.id,
        businessName: lead.businessName,
        category: lead.category,
        governorate: lead.governorate,
        city: lead.city,
        phone: lead.phone,
        email: lead.email,
        website: lead.website,
        score: lead.score,
        temperature: lead.temperature,
        qualityScore: evalResult.qualityScore,
        qualityStatus: evalResult.qualityStatus,
        freshnessStatus: evalResult.freshness.freshnessStatus,
        daysSinceVerified: evalResult.freshness.daysSinceVerified,
        verificationStatus: evalResult.verificationStatus,
        saleabilityStatus: evalResult.saleabilityStatus,
        saleabilityReason: evalResult.saleabilityReason,
        completenessScore: evalResult.completeness.completenessScore,
        businessStatus: evalResult.businessStatus,
        qualityFlags: evalResult.qualityFlags,
        lastVerifiedAt: lead.lastVerifiedAt,
      });
    }

    return NextResponse.json({
      leads: flaggedLeads,
      total: flaggedLeads.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/quality/flags error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب قائمة الفرص التي تحتوي على تحذيرات جودة.' },
      { status: 500 }
    );
  }
}

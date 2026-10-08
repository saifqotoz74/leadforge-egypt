import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  evaluateLeadQuality,
  getActiveQualityAndFreshnessConfig,
} from '@/lib/quality';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const resolvedParams = await Promise.resolve(context.params);
    const leadId = resolvedParams.id;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        verifications: {
          orderBy: { checkedAt: 'desc' },
        },
        feedbacks: {
          where: { useful: false },
          select: { reason: true },
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
    });

    if (!lead) {
      return NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 });
    }

    const { qualityConfig, freshnessThresholds } =
      await getActiveQualityAndFreshnessConfig();

    const negativeFeedbackReasons = lead.feedbacks
      .map((f) => f.reason)
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    const evaluation = evaluateLeadQuality(
      {
        ...lead,
        websiteAnalysis:
          lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
            ? (lead.websiteAnalysis as Record<string, unknown>)
            : null,
        negativeFeedbackReasons,
        hasPendingDuplicateCandidate:
          lead.candidateDuplicates.length > 0 || lead.matchedCandidates.length > 0,
      },
      { qualityConfig, freshnessThresholds }
    );

    const responsePayload: Record<string, unknown> = {
      leadId: lead.id,
      qualityScore: evaluation.qualityScore,
      qualityStatus: evaluation.qualityStatus,
      opportunityScore: lead.score,
      opportunityTemperature: lead.temperature,
      freshnessStatus: evaluation.freshness.freshnessStatus,
      daysSinceVerified: evaluation.freshness.daysSinceVerified,
      freshnessLabelAr: evaluation.freshness.labelAr,
      freshnessLabelEn: evaluation.freshness.labelEn,
      verificationStatus: evaluation.verificationStatus,
      saleabilityStatus: evaluation.saleabilityStatus,
      isSaleable: evaluation.isSaleable,
      saleabilityReason: evaluation.saleabilityReason,
      completenessScore: evaluation.completeness.completenessScore,
      businessStatus: evaluation.businessStatus,
      phoneValidationStatus: evaluation.phoneValidationStatus,
      emailValidationStatus: evaluation.emailValidationStatus,
      websiteVerificationState: evaluation.websiteVerificationState,
      qualityFlags: evaluation.qualityFlags,
      lastVerifiedAt: lead.lastVerifiedAt,
      nextVerificationAt: evaluation.nextVerificationAt,
    };

    if (user.role === 'ADMIN') {
      responsePayload.components = evaluation.summary.components;
      responsePayload.completenessBreakdown = evaluation.completeness;
      responsePayload.dimensionVerifications = evaluation.dimensionVerifications;
    }

    return NextResponse.json({
      leadId: lead.id,
      opportunity: {
        score: lead.score,
        temperature: lead.temperature,
      },
      quality: responsePayload,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/leads/[id]/quality error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب ملخص جودة الفرصة.' },
      { status: 500 }
    );
  }
}

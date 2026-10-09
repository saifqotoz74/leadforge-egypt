import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  evaluateLeadQuality,
  getActiveQualityAndFreshnessConfig,
  recalculateAndPersistLeadQuality,
  VerificationService,
} from '@/lib/quality';

function redactSensitiveSummary(summary: string | null | undefined, isUnlocked: boolean): string | null {
  if (!summary) return null;
  if (isUnlocked) return summary;
  return summary
    .replace(/\+?20\d{9,10}|\b01[0125]\d{8}\b|\b0[2-9]\d{7,8}\b/g, (m) =>
      m.length > 6 ? `${m.slice(0, 4)}****${m.slice(-2)}` : '****'
    )
    .replace(/[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_m, domain) => `***@${domain}`);
}

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
          take: 50,
        },
        feedbacks: {
          where: { useful: false },
          select: { reason: true, createdAt: true },
        },
        claims: {
          where: {
            userId: user.id,
            status: 'ACTIVE',
            accessGranted: true,
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 });
    }

    const { qualityConfig, freshnessThresholds } =
      await getActiveQualityAndFreshnessConfig();

    const negativeFeedbackEntries = lead.feedbacks
      .filter((f): f is { reason: NonNullable<typeof f.reason>; createdAt: Date } => Boolean(f.reason))
      .map((f) => ({ reason: f.reason as string, createdAt: f.createdAt }));

    const evaluation = evaluateLeadQuality(
      {
        ...lead,
        websiteAnalysis:
          lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
            ? (lead.websiteAnalysis as Record<string, unknown>)
            : null,
        negativeFeedbackReasons: negativeFeedbackEntries.map((e) => e.reason),
        negativeFeedbackEntries,
      },
      { qualityConfig, freshnessThresholds }
    );

    const isAdmin = user.role === 'ADMIN';
    const isUnlocked = isAdmin || lead.claims.length > 0;

    const sanitizedDimensions = Object.fromEntries(
      Object.entries(evaluation.dimensionVerifications).map(([dimKey, dimSnap]) => [
        dimKey,
        {
          dimension: dimSnap.verificationType,
          verificationType: dimSnap.verificationType,
          status: dimSnap.status,
          checkedAt: dimSnap.checkedAt,
          expiresAt: dimSnap.expiresAt,
          resultSummary: redactSensitiveSummary(dimSnap.resultSummary, isUnlocked),
          ...(isAdmin
            ? {
                source: dimSnap.source,
                errorType: dimSnap.errorType,
                retryCount: dimSnap.retryCount,
              }
            : {}),
        },
      ])
    );

    const sanitizedHistory = lead.verifications.map((v) => ({
      id: v.id,
      verificationType: v.verificationType,
      status: v.status,
      previousStatus: v.previousStatus,
      checkedAt: v.checkedAt,
      expiresAt: v.expiresAt,
      resultSummary: redactSensitiveSummary(v.resultSummary, isUnlocked),
      ...(isAdmin
        ? {
            source: v.source,
            evidence: v.evidence,
            errorType: v.errorType,
            retryCount: v.retryCount,
            durationMs: v.durationMs,
          }
        : {}),
    }));

    return NextResponse.json({
      leadId: lead.id,
      verificationStatus: evaluation.verificationStatus,
      verifications: sanitizedHistory,
      latestByDimension: sanitizedDimensions,
      verification: {
        leadId: lead.id,
        verificationStatus: evaluation.verificationStatus,
        freshnessStatus: evaluation.freshness.freshnessStatus,
        daysSinceVerified: evaluation.freshness.daysSinceVerified,
        lastVerifiedAt: lead.lastVerifiedAt,
        nextVerificationAt: evaluation.nextVerificationAt,
        businessStatus: evaluation.businessStatus,
        phoneValidationStatus: evaluation.phoneValidationStatus,
        emailValidationStatus: evaluation.emailValidationStatus,
        websiteVerificationState: evaluation.websiteVerificationState,
        dimensions: sanitizedDimensions,
        history: sanitizedHistory,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/leads/[id]/verification error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب سجل التحقق للفرصة.' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }
    await requireAdmin(req);
    const resolvedParams = await Promise.resolve(context.params);
    const leadId = resolvedParams.id;
    const body = await req.json().catch(() => ({}));

    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!existingLead) {
      return NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 });
    }

    const requestedDimension = String(
      body.dimension || body.verificationType || body.type || 'FULL'
    )
      .trim()
      .toUpperCase();

    const options = {
      source: body.source || 'ADMIN_MANUAL_VERIFY',
      recalculateOpportunityScore: body.recalculateOpportunityScore ?? true,
      probeWebsiteLive: Boolean(body.probeWebsiteLive),
      probeTimeoutMs: typeof body.probeTimeoutMs === 'number' ? body.probeTimeoutMs : undefined,
    };

    if (requestedDimension !== 'FULL' && requestedDimension !== 'ALL') {
      let record;
      if (requestedDimension === 'PHONE') {
        record = await VerificationService.verifyPhone(leadId, options);
      } else if (requestedDimension === 'EMAIL') {
        record = await VerificationService.verifyEmail(leadId, options);
      } else if (requestedDimension === 'WEBSITE') {
        record = await VerificationService.verifyWebsite(leadId, options);
      } else if (requestedDimension === 'BUSINESS_STATUS' || requestedDimension === 'BUSINESS') {
        record = await VerificationService.verifyBusiness(leadId, options);
      } else if (requestedDimension === 'ADDRESS') {
        record = await VerificationService.verifyAddress(leadId, options);
      } else if (requestedDimension === 'IDENTITY') {
        record = await VerificationService.verifyIdentity(leadId, options);
      } else {
        return NextResponse.json(
          { error: `نوع التحقق غير صالح: ${requestedDimension}` },
          { status: 400 }
        );
      }

      const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId);

      return NextResponse.json({
        leadId,
        dimension: record.verificationType,
        verificationRecord: record,
        verificationStatus: qualityEvaluation.verificationStatus,
        freshnessStatus: qualityEvaluation.freshness.freshnessStatus,
        qualityScore: qualityEvaluation.qualityScore,
        qualityStatus: qualityEvaluation.qualityStatus,
        saleabilityStatus: qualityEvaluation.saleabilityStatus,
        qualityEvaluation,
      });
    }

    const outcome = await VerificationService.verifyLead(leadId, options);

    return NextResponse.json({
      leadId: outcome.leadId,
      verificationStatus: outcome.newVerificationStatus,
      freshnessStatus: outcome.newFreshnessStatus,
      qualityScore: outcome.qualityEvaluation.qualityScore,
      qualityStatus: outcome.qualityEvaluation.qualityStatus,
      saleabilityStatus: outcome.qualityEvaluation.saleabilityStatus,
      outcome,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/leads/[id]/verification error:', err);
    return NextResponse.json(
      { error: 'تعذر إعادة التحقق من الفرصة.' },
      { status: 500 }
    );
  }
}



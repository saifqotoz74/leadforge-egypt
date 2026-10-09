import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getLeadScoreDetails,
  LeadScoringError,
  recalculateLeadScore,
} from '@/lib/scoring-engine';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const leadId = params.id;

    const details = await getLeadScoreDetails(prisma, leadId, {
      includeEvaluatedRules: user.role === 'ADMIN',
      historyLimit: user.role === 'ADMIN' ? 50 : 10,
    });

    return NextResponse.json(details);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof LeadScoringError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error('GET /api/leads/[id]/score error:', err);
    return NextResponse.json({ error: 'تعذر جلب تفاصيل تقييم الفرصة.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const leadId = params.id;
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const res = await recalculateLeadScore(prisma, leadId, {
      trigger: 'MANUAL_RECALCULATION',
      scoringVersion: typeof body.scoringVersion === 'string' ? body.scoringVersion : undefined,
      forceSnapshot: Boolean(body.forceSnapshot),
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_LEAD_SCORE_RECALCULATED',
        entityType: 'Lead',
        entityId: leadId,
        details: {
          score: res.scoreResult.normalizedScore,
          classification: res.scoreResult.classification,
          scoringVersion: res.scoreResult.scoringVersion,
          snapshotCreated: res.snapshotCreated,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      leadId: res.lead.id,
      score: res.scoreResult.normalizedScore,
      rawScore: res.scoreResult.rawScore,
      normalizedScore: res.scoreResult.normalizedScore,
      classification: res.scoreResult.classification,
      temperature: res.scoreResult.temperature,
      scoringVersion: res.scoreResult.scoringVersion,
      explanation: res.scoreResult.explanation,
      appliedRules: res.scoreResult.appliedRules,
      evaluatedRules: res.scoreResult.evaluatedRules,
      snapshotCreated: res.snapshotCreated,
      lead: res.lead,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof LeadScoringError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/leads/[id]/score error:', err);
    return NextResponse.json({ error: 'تعذر إعادة حساب تقييم الفرصة.' }, { status: 500 });
  }
}

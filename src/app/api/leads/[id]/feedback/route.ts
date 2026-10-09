import { NextRequest, NextResponse } from 'next/server';
import { FeedbackCategory, FeedbackReason } from '@prisma/client';
import { z } from 'zod';
import { AuthError, getClientIp, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { EngagementEngineError, submitLeadFeedback } from '@/lib/feedback';
import { LeadServiceError, submitDeveloperLeadFeedback } from '@/lib/lead-service';

const legacyFeedbackSchema = z.object({
  useful: z.boolean(),
  reason: z
    .enum([
      'WRONG_PHONE',
      'BUSINESS_CLOSED',
      'ALREADY_HAS_WEBSITE',
      'NOT_INTERESTED',
      'DUPLICATE',
      'WRONG_CATEGORY',
      'WRONG_LOCATION',
      'OTHER',
    ])
    .nullable()
    .optional(),
  comment: z.string().nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const leadId = params.id;

    const feedbacks = await prisma.leadFeedback.findMany({
      where: {
        leadId,
        ...(user.role === 'ADMIN' ? {} : { userId: user.id }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return NextResponse.json({
      success: true,
      feedbacks,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to retrieve feedback', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const user = await requireAuth(req);
    const body = await req.json();
    const headerIdempotencyKey =
      req.headers.get('Idempotency-Key') || req.headers.get('x-idempotency-key');
    const idempotencyKey = body.idempotencyKey ?? headerIdempotencyKey ?? undefined;

    const isStructuredPhase6Payload =
      body.category !== undefined ||
      body.reasonCode !== undefined ||
      body.rating !== undefined ||
      body.sourceType !== undefined ||
      Boolean(idempotencyKey);

    if (isStructuredPhase6Payload) {
      const result = await submitLeadFeedback({
        leadId: params.id,
        developerId: user.id,
        category: body.category as FeedbackCategory | undefined,
        reasonCode: body.reasonCode ?? body.reason,
        rating: body.rating,
        comment: body.comment ?? body.note ?? null,
        useful: body.useful,
        sourceType: body.sourceType,
        metadata: body.metadata,
        idempotencyKey,
        ipAddress: getClientIp(req),
      });

      return NextResponse.json(result);
    }

    // Legacy MVP feedback compatibility path
    const parsed = legacyFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || 'بيانات التقييم غير صالحة',
          code: 'INVALID_FEEDBACK',
        },
        { status: 400 }
      );
    }

    const feedback = await submitDeveloperLeadFeedback({
      prisma,
      userId: user.id,
      leadId: params.id,
      useful: parsed.data.useful,
      reason: (parsed.data.reason as FeedbackReason) || null,
      comment: parsed.data.comment || null,
    });

    return NextResponse.json({
      success: true,
      feedback,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: err.statusCode }
      );
    }
    if (err instanceof EngagementEngineError) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.statusCode }
      );
    }
    if (err instanceof LeadServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/leads/[id]/feedback error:', err);
    return NextResponse.json(
      { error: 'تعذر حفظ تقييم الفرصة.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

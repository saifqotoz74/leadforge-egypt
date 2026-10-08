import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LeadServiceError, submitDeveloperLeadFeedback } from '@/lib/lead-service';
import { FeedbackReason } from '@prisma/client';

const feedbackSchema = z.object({
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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const user = await requireAuth(req);
    const body = await req.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات التقييم غير صالحة' },
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
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof LeadServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/leads/[id]/feedback error:', err);
    return NextResponse.json({ error: 'تعذر حفظ تقييم الفرصة.' }, { status: 500 });
  }
}

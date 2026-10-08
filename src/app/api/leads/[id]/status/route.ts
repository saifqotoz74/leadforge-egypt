import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { LeadServiceError, updateDeveloperLeadStatus } from '@/lib/lead-service';
import { PipelineStatus } from '@prisma/client';

const statusUpdateSchema = z.object({
  status: z.enum([
    'NEW',
    'CONTACTED',
    'REPLIED',
    'INTERESTED',
    'MEETING',
    'WON',
    'LOST',
    'NOT_INTERESTED',
    'INVALID',
  ]),
  notes: z.string().nullable().optional(),
  lastContactedAt: z.string().nullable().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const user = await requireAuth(req);
    const body = await req.json();
    const parsed = statusUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات تحديث الحالة غير صالحة' },
        { status: 400 }
      );
    }

    const updatedClaim = await updateDeveloperLeadStatus({
      prisma,
      userId: user.id,
      leadId: params.id,
      status: parsed.data.status as PipelineStatus,
      notes: parsed.data.notes,
      lastContactedAt: parsed.data.lastContactedAt,
      nextFollowUpAt: parsed.data.nextFollowUpAt,
    });

    return NextResponse.json({
      success: true,
      claim: updatedClaim,
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
    console.error('PATCH /api/leads/[id]/status error:', err);
    return NextResponse.json({ error: 'تعذر تحديث حالة المتابعة.' }, { status: 500 });
  }
}

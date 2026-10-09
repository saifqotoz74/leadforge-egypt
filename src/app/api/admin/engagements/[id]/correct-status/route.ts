import { NextRequest, NextResponse } from 'next/server';
import { EngagementStatus } from '@prisma/client';
import { AuthError, getClientIp, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { adminCorrectEngagementStatus, EngagementEngineError } from '@/lib/feedback';

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

    const admin = await requireAdmin(req);
    const body = await req.json();

    const result = await adminCorrectEngagementStatus({
      engagementId: params.id,
      adminId: admin.id,
      previousState: body.previousState as EngagementStatus | undefined,
      previousStatus: body.previousStatus as EngagementStatus | undefined,
      newState: body.newState as EngagementStatus | undefined,
      newStatus: body.newStatus as EngagementStatus | undefined,
      reason: body.reason,
      estimatedProjectValue: body.estimatedProjectValue,
      currency: body.currency,
      reasonCode: body.reasonCode,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: err.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' },
        { status: err.statusCode }
      );
    }
    if (err instanceof EngagementEngineError) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/admin/engagements/[id]/correct-status error:', err);
    return NextResponse.json(
      { error: 'Failed to correct engagement status', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { EngagementStatus } from '@prisma/client';
import { AuthError, getClientIp, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import {
  EngagementEngineError,
  getDeveloperEngagementById,
  updateEngagementStatus,
} from '@/lib/feedback';

export async function GET(
  req: NextRequest,
  { params }: { params: { id?: string; leadId?: string } }
) {
  try {
    const user = await requireAuth(req);
    const leadId = params.id ?? params.leadId ?? '';
    const engagement = await getDeveloperEngagementById(user.id, leadId);
    return NextResponse.json({
      success: true,
      engagement,
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
    return NextResponse.json(
      { error: 'Failed to retrieve engagement status', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

async function handleStatusMutation(
  req: NextRequest,
  params: { id?: string; leadId?: string }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const user = await requireAuth(req);
    const leadId = params.id ?? params.leadId ?? '';
    const body = await req.json();

    const headerIdempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('x-idempotency-key');
    const idempotencyKey = body.idempotencyKey ?? headerIdempotencyKey ?? undefined;

    const result = await updateEngagementStatus({
      leadId,
      developerId: user.id,
      status: body.status as EngagementStatus,
      reasonCode: body.reasonCode ?? null,
      note: body.note ?? body.notes ?? null,
      estimatedProjectValue: body.estimatedProjectValue,
      currency: body.currency ?? null,
      wonReason: body.wonReason ?? null,
      wonAt: body.wonAt ?? null,
      contactedAt: body.contactedAt ?? body.lastContactedAt ?? null,
      repliedAt: body.repliedAt ?? null,
      interestedAt: body.interestedAt ?? null,
      meetingAt: body.meetingAt ?? null,
      proposalSentAt: body.proposalSentAt ?? null,
      negotiationAt: body.negotiationAt ?? null,
      lostAt: body.lostAt ?? null,
      invalidAt: body.invalidAt ?? null,
      notInterestedAt: body.notInterestedAt ?? null,
      nextFollowUpAt: body.nextFollowUpAt ?? undefined,
      idempotencyKey,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(result);
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
    console.error('POST /api/leads/[id]/engagement/status error:', err);
    return NextResponse.json(
      { error: 'Failed to update engagement status', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id?: string; leadId?: string } }
) {
  return handleStatusMutation(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id?: string; leadId?: string } }
) {
  return handleStatusMutation(req, params);
}

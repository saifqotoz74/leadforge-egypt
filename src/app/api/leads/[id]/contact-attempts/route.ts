import { NextRequest, NextResponse } from 'next/server';
import { ContactAttemptResult, ContactChannel } from '@prisma/client';
import { AuthError, getClientIp, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { EngagementEngineError, recordContactAttempt } from '@/lib/feedback';

export async function GET(
  req: NextRequest,
  { params }: { params: { id?: string; leadId?: string } }
) {
  try {
    const user = await requireAuth(req);
    const leadId = params.id ?? params.leadId ?? '';

    const attempts = await prisma.contactAttempt.findMany({
      where: {
        leadId,
        ...(user.role === 'ADMIN' ? {} : { developerId: user.id }),
      },
      orderBy: [{ attemptedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });

    return NextResponse.json({
      success: true,
      contactAttempts: attempts,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to retrieve contact attempts', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id?: string; leadId?: string } }
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

    const headerIdempotencyKey =
      req.headers.get('Idempotency-Key') || req.headers.get('x-idempotency-key');
    const idempotencyKey = body.idempotencyKey ?? headerIdempotencyKey ?? undefined;

    const result = await recordContactAttempt({
      leadId,
      developerId: user.id,
      channel: body.channel as ContactChannel,
      result: body.result as ContactAttemptResult,
      note: body.note ?? body.notes ?? null,
      attemptedAt: body.attemptedAt ?? null,
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
    console.error('POST /api/leads/[id]/contact-attempts error:', err);
    return NextResponse.json(
      { error: 'Failed to record contact attempt', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

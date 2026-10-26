import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { ClaimEngineError, submitClaimRefundReport } from '@/lib/claims';
import { getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const user = await requireAuth(req);
    const ipAddress = getClientIp(req.headers);

    let body: {
      reason?: string;
      comment?: string;
      idempotencyKey?: string;
    } = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const headerIdempotencyKey =
      req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key') || undefined;
    const idempotencyKey = headerIdempotencyKey || body.idempotencyKey;

    if (!body.reason || body.reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'سبب الإبلاغ مطلوب.', code: 'INVALID_REFUND_REQUEST' },
        { status: 422 }
      );
    }

    const result = await submitClaimRefundReport({
      claimId: params.claimId,
      developerId: user.id,
      reason: body.reason.trim(),
      comment: body.comment?.trim() || null,
      idempotencyKey,
      ipAddress,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: err.statusCode === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' },
        { status: err.statusCode }
      );
    }
    if (err instanceof ClaimEngineError) {
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/developer/claims/[claimId]/refund-report error:', err);
    return NextResponse.json(
      { error: 'Failed to submit refund report', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

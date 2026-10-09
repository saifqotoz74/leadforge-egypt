import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ClaimEngineError, refundClaim } from '@/lib/claims';
import { getClientIp } from '@/lib/rate-limit';

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

    const admin = await requireAdmin(req);
    const ipAddress = getClientIp(req.headers);

    let body: {
      reason?: string;
      amount?: number;
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

    const result = await refundClaim({
      claimId: params.claimId,
      reason: body.reason || 'Admin claim refund',
      refundedBy: admin.id,
      amount: body.amount,
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
    console.error('POST /api/admin/claims/[claimId]/refund error:', err);
    return NextResponse.json(
      { error: 'Failed to process claim refund', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

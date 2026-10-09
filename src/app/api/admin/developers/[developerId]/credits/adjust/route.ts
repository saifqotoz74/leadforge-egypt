import { NextRequest, NextResponse } from 'next/server';
import { CreditTransactionType } from '@prisma/client';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { adjustDeveloperCreditsByAdmin, ClaimEngineError } from '@/lib/claims';
import { getClientIp } from '@/lib/rate-limit';

const ALLOWED_ADJUSTMENT_TYPES: Array<
  Extract<
    CreditTransactionType,
    'ADMIN_ADJUSTMENT' | 'BONUS' | 'CORRECTION' | 'PURCHASE' | 'EXPIRATION'
  >
> = ['ADMIN_ADJUSTMENT', 'BONUS', 'CORRECTION', 'PURCHASE', 'EXPIRATION'];

export async function POST(
  req: NextRequest,
  { params }: { params: { developerId: string } }
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
      amount?: number;
      reason?: string;
      type?: string;
      idempotencyKey?: string;
      metadata?: Record<string, unknown>;
    } = {};

    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const headerIdempotencyKey =
      req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key') || undefined;
    const idempotencyKey = headerIdempotencyKey || body.idempotencyKey;

    const txType =
      body.type && ALLOWED_ADJUSTMENT_TYPES.includes(body.type as (typeof ALLOWED_ADJUSTMENT_TYPES)[number])
        ? (body.type as (typeof ALLOWED_ADJUSTMENT_TYPES)[number])
        : 'ADMIN_ADJUSTMENT';

    const result = await adjustDeveloperCreditsByAdmin({
      developerId: params.developerId,
      amount: Number(body.amount),
      reason: body.reason || '',
      performedById: admin.id,
      type: txType,
      idempotencyKey,
      metadata: body.metadata,
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
    console.error('POST /api/admin/developers/[developerId]/credits/adjust error:', err);
    return NextResponse.json(
      { error: 'Failed to adjust developer credits', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

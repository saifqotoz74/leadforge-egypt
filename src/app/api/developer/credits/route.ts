import { NextRequest, NextResponse } from 'next/server';
import { CreditTransactionType } from '@prisma/client';
import { AuthError, requireAuth } from '@/lib/auth';
import { ClaimEngineError, getDeveloperCreditSummary } from '@/lib/claims';

export const dynamic = 'force-dynamic';

const VALID_TX_TYPES: CreditTransactionType[] = [
  'PURCHASE',
  'CLAIM',
  'REFUND',
  'BONUS',
  'ADMIN_ADJUSTMENT',
  'EXPIRATION',
  'CORRECTION',
];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const requestedOwnerId =
      searchParams.get('developerId')?.trim() || searchParams.get('userId')?.trim();
    if (requestedOwnerId && requestedOwnerId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح لك بالوصول إلى رصيد مطور آخر.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const typeParam = searchParams.get('type')?.trim().toUpperCase();
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || searchParams.get('limit') || '25') || 25;

    const type =
      typeParam && VALID_TX_TYPES.includes(typeParam as CreditTransactionType)
        ? (typeParam as CreditTransactionType)
        : undefined;

    const summary = await getDeveloperCreditSummary(user.id, {
      type,
      page,
      pageSize,
    });

    return NextResponse.json(summary);
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
    console.error('GET /api/developer/credits error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch developer credit account and ledger', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { CreditTransactionType } from '@prisma/client';
import { AuthError, requireAdmin } from '@/lib/auth';
import { ClaimEngineError, getAdminCreditsOverview } from '@/lib/claims';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const developerId = searchParams.get('developerId')?.trim() || undefined;
    const typeParam = searchParams.get('type')?.trim().toUpperCase();
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || searchParams.get('limit') || '25') || 25;

    const data = await getAdminCreditsOverview({
      developerId,
      type: typeParam ? (typeParam as CreditTransactionType) : undefined,
      page,
      pageSize,
    });

    return NextResponse.json(data);
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
    console.error('GET /api/admin/credits error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch admin credits overview', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

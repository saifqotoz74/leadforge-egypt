import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { ClaimEngineError, getDeveloperClaimById } from '@/lib/claims';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    const user = await requireAuth(req);
    const claim = await getDeveloperClaimById(user.id, params.claimId);

    return NextResponse.json({
      claim,
    });
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
    console.error('GET /api/developer/claims/[claimId] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch claim details', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

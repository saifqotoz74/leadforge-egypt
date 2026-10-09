import { NextRequest, NextResponse } from 'next/server';
import { ClaimStatus, LeadOwnershipType } from '@prisma/client';
import { AuthError, requireAdmin } from '@/lib/auth';
import { ClaimEngineError, getAdminClaims } from '@/lib/claims';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const statusParam = searchParams.get('status')?.trim().toUpperCase();
    const accessTypeParam = searchParams.get('accessType')?.trim().toUpperCase();
    const developerId = searchParams.get('developerId')?.trim() || undefined;
    const leadId = searchParams.get('leadId')?.trim() || undefined;
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || searchParams.get('limit') || '25') || 25;

    const data = await getAdminClaims({
      status: statusParam ? (statusParam as ClaimStatus) : undefined,
      accessType: accessTypeParam ? (accessTypeParam as LeadOwnershipType) : undefined,
      developerId,
      leadId,
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
    console.error('GET /api/admin/claims error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch admin claims list', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

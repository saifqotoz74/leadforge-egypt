import { NextRequest, NextResponse } from 'next/server';
import { ClaimStatus, LeadOwnershipType } from '@prisma/client';
import { AuthError, requireAuth } from '@/lib/auth';
import { ClaimEngineError, getDeveloperClaims } from '@/lib/claims';

export const dynamic = 'force-dynamic';

const VALID_CLAIM_STATUSES: ClaimStatus[] = [
  'PENDING',
  'ACTIVE',
  'REFUNDED',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
];

const VALID_ACCESS_TYPES: LeadOwnershipType[] = ['SHARED', 'EXCLUSIVE'];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const requestedOwnerId =
      searchParams.get('developerId')?.trim() || searchParams.get('userId')?.trim();
    if (requestedOwnerId && requestedOwnerId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح لك بالوصول إلى مطالبات مطور آخر.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const statusParam = searchParams.get('status')?.trim().toUpperCase();
    const accessTypeParam = searchParams.get('accessType')?.trim().toUpperCase();
    const date = searchParams.get('date')?.trim() || undefined;
    const dateFrom = searchParams.get('dateFrom')?.trim() || undefined;
    const dateTo = searchParams.get('dateTo')?.trim() || undefined;
    const niche =
      searchParams.get('niche')?.trim() || searchParams.get('category')?.trim() || undefined;
    const service =
      searchParams.get('service')?.trim() ||
      searchParams.get('requiredService')?.trim() ||
      undefined;
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || searchParams.get('limit') || '25') || 25;

    const status =
      statusParam && VALID_CLAIM_STATUSES.includes(statusParam as ClaimStatus)
        ? (statusParam as ClaimStatus)
        : undefined;

    const accessType =
      accessTypeParam && VALID_ACCESS_TYPES.includes(accessTypeParam as LeadOwnershipType)
        ? (accessTypeParam as LeadOwnershipType)
        : undefined;

    const data = await getDeveloperClaims(user.id, {
      status,
      accessType,
      date,
      dateFrom,
      dateTo,
      niche,
      service,
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
    console.error('GET /api/developer/claims error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch developer claims', code: 'INTERNAL_CLAIM_ERROR' },
      { status: 500 }
    );
  }
}

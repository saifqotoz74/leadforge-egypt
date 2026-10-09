import { NextRequest, NextResponse } from 'next/server';
import { EngagementStatus } from '@prisma/client';
import { AuthError, requireAuth } from '@/lib/auth';
import { EngagementEngineError, getDeveloperEngagements } from '@/lib/feedback';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const requestedOwnerId =
      searchParams.get('developerId')?.trim() || searchParams.get('userId')?.trim();
    if (requestedOwnerId && requestedOwnerId !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح لك بالوصول إلى سجلات متابعة مطور آخر.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const status = (searchParams.get('status') || undefined) as EngagementStatus | undefined;
    const leadId = searchParams.get('leadId') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;

    const result = await getDeveloperEngagements(user.id, {
      status,
      leadId,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      ...result,
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
      { error: 'Failed to retrieve developer engagements', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

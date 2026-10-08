import { NextRequest, NextResponse } from 'next/server';
import { EngagementStatus } from '@prisma/client';
import { AuthError, requireAdmin } from '@/lib/auth';
import { EngagementEngineError, getAdminEngagementsOverview } from '@/lib/feedback';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || undefined) as EngagementStatus | undefined;
    const developerId = searchParams.get('developerId') || undefined;
    const leadId = searchParams.get('leadId') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;

    const overview = await getAdminEngagementsOverview({
      status,
      developerId,
      leadId,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      ...overview,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: err.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN' },
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
      { error: 'Failed to retrieve admin engagements overview', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

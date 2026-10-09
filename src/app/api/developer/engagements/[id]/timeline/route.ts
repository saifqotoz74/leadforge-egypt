import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { EngagementEngineError, getEngagementTimeline } from '@/lib/feedback';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;

    const result = await getEngagementTimeline(user.id, params.id, {
      isAdmin: user.role === 'ADMIN',
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
      { error: 'Failed to retrieve engagement timeline', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

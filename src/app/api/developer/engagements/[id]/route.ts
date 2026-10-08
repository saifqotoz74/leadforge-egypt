import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { EngagementEngineError, getDeveloperEngagementById } from '@/lib/feedback';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    const engagement = await getDeveloperEngagementById(user.id, params.id);
    return NextResponse.json({
      success: true,
      engagement,
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
      { error: 'Failed to retrieve engagement details', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

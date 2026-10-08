import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { cancelIngestionJob, IngestionError } from '@/lib/collectors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const { jobId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const result = await cancelIngestionJob({
      prisma,
      jobId,
      adminUserId: admin.id,
      reason: body.reason ? String(body.reason) : undefined,
    });

    return NextResponse.json({
      success: true,
      jobId: result.id,
      status: result.status,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof IngestionError) {
      return NextResponse.json(
        { error: err.message, errorCode: err.code },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/admin/ingestion/jobs/[jobId]/cancel error:', err);
    return NextResponse.json(
      { error: 'تعذر إلغاء المهمة.' },
      { status: 500 }
    );
  }
}

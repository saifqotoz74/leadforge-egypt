import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { handleDeadLetterAction, IngestionError } from '@/lib/collectors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const rawAction = String(body.action || 'RETRY');
    if (!['RETRY', 'MARK_INVALID', 'RESOLVE'].includes(rawAction)) {
      return NextResponse.json(
        { error: 'إجراء غير صالح للسجل المعلق.' },
        { status: 400 }
      );
    }

    const mappedAction: 'RETRY' | 'MARK_INVALID' =
      rawAction === 'MARK_INVALID' ? 'MARK_INVALID' : 'RETRY';

    const result = await handleDeadLetterAction({
      prisma,
      deadLetterId: id,
      adminUserId: admin.id,
      action: mappedAction,
      overridePayload: body.overridePayload || null,
      notes: body.notes ? String(body.notes) : undefined,
    });

    return NextResponse.json(result);
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
    console.error('POST /api/admin/ingestion/dead-letter/[id]/retry error:', err);
    return NextResponse.json(
      { error: 'تعذر تنفيذ العملية على السجل المعلق.' },
      { status: 500 }
    );
  }
}

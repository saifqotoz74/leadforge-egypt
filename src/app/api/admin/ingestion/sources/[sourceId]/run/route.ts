import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  IngestionError,
  resumeIngestionJob,
  runBackfillOrReprocess,
  runIngestionPipeline,
} from '@/lib/collectors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const { sourceId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const source = await prisma.leadSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      return NextResponse.json(
        { error: 'مصدر البيانات غير موجود.' },
        { status: 404 }
      );
    }

    if (!source.enabled || !source.isActive) {
      return NextResponse.json(
        {
          error: 'المصدر معطل حالياً. يرجى تفعيله قبل بدء التشغيل.',
          errorCode: 'POLICY_RESTRICTION',
        },
        { status: 400 }
      );
    }

    // 1. Resume interrupted job
    if (body.action === 'RESUME' && body.resumeJobId) {
      const report = await resumeIngestionJob({
        prisma,
        jobId: String(body.resumeJobId),
        userId: admin.id,
        rawRecords: Array.isArray(body.rawRecords) ? body.rawRecords : undefined,
        inputPayload: body.inputPayload,
      });
      return NextResponse.json({ success: true, report });
    }

    // 2. Backfill / Reprocess historical window
    if (body.action === 'BACKFILL' || body.action === 'REPROCESS') {
      const now = new Date();
      const startDate = body.startDate
        ? new Date(body.startDate)
        : new Date(now.getTime() - 30 * 24 * 3600_000);
      const endDate = body.endDate ? new Date(body.endDate) : now;

      const report = await runBackfillOrReprocess({
        prisma,
        adminUserId: admin.id,
        sourceId: source.id,
        sourceName: source.name,
        startDate,
        endDate,
        forceReprocess: body.forceReprocess !== false,
      });

      return NextResponse.json({ success: true, report });
    }

    // 3. Standard manual or custom payload collector execution
    const report = await runIngestionPipeline({
      prisma,
      userId: admin.id,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      fileName: body.fileName || null,
      conflictPolicy: body.conflictPolicy || 'SAFE_PHONE_PRIORITY',
      rawRecords: Array.isArray(body.rawRecords) ? body.rawRecords : undefined,
      inputPayload: body.inputPayload,
      triggerType: body.triggerType || 'MANUAL',
      batchSize: typeof body.batchSize === 'number' ? body.batchSize : source.batchSize,
      maxRecords:
        typeof body.maxRecords === 'number' ? body.maxRecords : source.maxRecordsPerRun,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : source.timeoutMs,
      idempotencyKey: body.idempotencyKey || null,
      forceReprocess: Boolean(body.forceReprocess),
      requireExternalId: Boolean(body.requireExternalId),
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_INGESTION_JOB_TRIGGERED',
        entityType: 'ImportJob',
        entityId: report.importJobId,
        details: {
          sourceId: source.id,
          sourceName: source.name,
          collectorVersion: report.collectorVersion,
          status: report.status,
          discovered: report.discovered,
          fetched: report.fetched,
          valid: report.valid,
          duplicates: report.duplicates,
          invalid: report.invalid,
          failed: report.failed,
          deadLetters: report.deadLetters,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof IngestionError) {
      return NextResponse.json(
        {
          error: err.message,
          errorCode: err.code,
          retryable: err.retryable,
          details: err.details,
        },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/admin/ingestion/sources/[sourceId]/run error:', err);
    return NextResponse.json(
      { error: 'تعذر تشغيل جامع البيانات للمصدر المحدد.' },
      { status: 500 }
    );
  }
}

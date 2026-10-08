import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { CsvCollector, IngestionError, runIngestionPipeline } from '@/lib/collectors';
import { createAuditLog } from '@/lib/audit';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  AppSecurityError,
  recordSecuritySignal,
  validateImportUploadSafety,
} from '@/lib/security';

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const ipAddress = getClientIp(req.headers);

    const rl = checkRateLimit({
      key: `admin-csv-import:${admin.id}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      await recordSecuritySignal({
        signalType: 'EXCESSIVE_INGESTION_TRIGGERS',
        userId: admin.id,
        ipAddress,
        details: { route: '/api/admin/import' },
      });
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح به لعمليات الاستيراد.', code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

    const body = await req.json();

    const csvContent = String(body.csvContent || '');
    const sourceName = String(body.sourceName || 'CSV Import').trim();
    const fileName = String(body.fileName || 'uploaded_leads.csv').trim();
    const mimeType = body.mimeType ? String(body.mimeType).trim() : undefined;

    validateImportUploadSafety({
      fileName,
      mimeType,
      payloadBytes: Buffer.byteLength(csvContent, 'utf-8'),
    });

    if (!csvContent.trim()) {
      return NextResponse.json(
        {
          error: 'محتوى ملف CSV فارغ. يرجى رفع ملف يحتوي على بيانات صالحة.',
          errorCode: 'INVALID_SOURCE_RECORD',
        },
        { status: 400 }
      );
    }

    const collector = new CsvCollector(sourceName);
    const rawRecords = await collector.collect(csvContent);

    validateImportUploadSafety({
      rowCount: rawRecords.length,
    });

    if (rawRecords.length === 0) {
      return NextResponse.json(
        {
          error: 'لم يتم العثور على صفوف بيانات صالحة داخل ملف CSV.',
          errorCode: 'INVALID_SOURCE_RECORD',
        },
        { status: 400 }
      );
    }

    let sourceRecord = await prisma.leadSource.findUnique({
      where: { name: sourceName },
    });

    if (!sourceRecord) {
      sourceRecord = await prisma.leadSource.create({
        data: {
          name: sourceName,
          type: 'CSV_IMPORT',
          description: 'مصدر بيانات مستورد عبر ملفات CSV',
          isActive: true,
          enabled: true,
          collectorKey: collector.collectorKey,
          collectorVersion: collector.version,
          contractVersion: collector.contractVersion,
          configurationStatus: 'CONFIGURED',
          healthStatus: 'HEALTHY',
        },
      });
    }

    const report = await runIngestionPipeline({
      prisma,
      userId: admin.id,
      sourceName,
      sourceId: sourceRecord.id,
      sourceType: 'CSV_IMPORT',
      fileName,
      triggerType: 'CSV_UPLOAD',
      rawRecords,
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_CSV_IMPORT',
        entityType: 'ImportJob',
        entityId: report.importJobId,
        details: {
          fileName,
          collectorVersion: report.collectorVersion,
          imported: report.imported,
          valid: report.valid,
          duplicates: report.duplicates,
          possibleDuplicates: report.possibleDuplicates,
          conflicts: report.conflicts,
          invalid: report.invalid,
          failed: report.failed,
          deadLetters: report.deadLetters,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      report: {
        importJobId: report.importJobId,
        status: report.status,
        collectorVersion: report.collectorVersion,
        discovered: report.discovered,
        fetched: report.fetched,
        normalized: report.normalized,
        imported: report.imported,
        valid: report.valid,
        inserted: report.inserted,
        updated: report.updated,
        duplicates: report.duplicates,
        possibleDuplicates: report.possibleDuplicates,
        conflicts: report.conflicts,
        invalid: report.invalid,
        failed: report.failed,
        skipped: report.skipped,
        saleable: report.saleable,
        deadLetters: report.deadLetters,
        records: report.records,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof AppSecurityError) {
      return NextResponse.json(
        { error: err.message, code: err.code, errorCode: err.code, details: err.details },
        { status: err.statusCode }
      );
    }
    if (err instanceof IngestionError) {
      return NextResponse.json(
        { error: err.message, errorCode: err.code },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/admin/import error:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء معالجة ملف CSV.' }, { status: 500 });
  }
}

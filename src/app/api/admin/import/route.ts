import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CsvCollector, runIngestionPipeline } from '@/lib/collectors';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();

    const csvContent = String(body.csvContent || '');
    const sourceName = String(body.sourceName || 'CSV Import').trim();
    const fileName = String(body.fileName || 'uploaded_leads.csv').trim();

    if (!csvContent.trim()) {
      return NextResponse.json(
        { error: 'محتوى ملف CSV فارغ. يرجى رفع ملف يحتوي على بيانات صالحة.' },
        { status: 400 }
      );
    }

    const collector = new CsvCollector(sourceName);
    const rawRecords = await collector.collect(csvContent);

    if (rawRecords.length === 0) {
      return NextResponse.json(
        { error: 'لم يتم العثور على صفوف بيانات صالحة داخل ملف CSV.' },
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
          imported: report.imported,
          valid: report.valid,
          duplicates: report.duplicates,
          possibleDuplicates: report.possibleDuplicates,
          conflicts: report.conflicts,
          invalid: report.invalid,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      report: {
        importJobId: report.importJobId,
        imported: report.imported,
        valid: report.valid,
        duplicates: report.duplicates,
        possibleDuplicates: report.possibleDuplicates,
        conflicts: report.conflicts,
        invalid: report.invalid,
        records: report.records,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/admin/import error:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء معالجة ملف CSV.' }, { status: 500 });
  }
}

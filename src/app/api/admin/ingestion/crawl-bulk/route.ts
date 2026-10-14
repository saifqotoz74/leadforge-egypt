import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { runIngestionPipeline } from '@/lib/collectors';
import { crawlLiveEgyptianLeads } from '@/lib/collectors/egypt-crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient time for multi-sector crawl

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const targetCount = Math.min(60, Math.max(10, Number(body.targetCount) || 30));

    // 1. Locate or create the Egyptian Business Directory source
    let source = await prisma.leadSource.findFirst({
      where: {
        type: 'DIRECTORY',
        name: { contains: 'Egyptian Business Directory' },
      },
    });

    if (!source) {
      source = await prisma.leadSource.findFirst({
        where: { type: 'DIRECTORY' },
      });
    }

    if (!source) {
      source = await prisma.leadSource.create({
        data: {
          name: 'Egyptian Business Directory',
          type: 'DIRECTORY',
          collectorKey: 'directory-feed',
          collectorVersion: 'directory-v1',
          contractVersion: 'ingestion-contract-v1',
          enabled: true,
          isActive: true,
          configurationStatus: 'CONFIGURED',
          healthStatus: 'HEALTHY',
          circuitState: 'CLOSED',
        },
      });
    }

    // 2. Perform live multi-sector crawl
    const rawLeads = await crawlLiveEgyptianLeads({ targetCount });

    if (rawLeads.length === 0) {
      return NextResponse.json(
        { error: 'تعذر جلب بيانات الأنشطة حالياً من الدليل التجاري. يرجى المحاولة لاحقاً.' },
        { status: 502 }
      );
    }

    // 3. Process through Ingestion Pipeline with duplicate queue routing
    const report = await runIngestionPipeline({
      prisma,
      userId: admin.id,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      rawRecords: rawLeads,
      conflictPolicy: 'SAFE_PHONE_PRIORITY',
      triggerType: 'MANUAL',
      forceReprocess: false,
    });

    // 4. Log admin audit
    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_INGESTION_JOB_TRIGGERED',
        entityType: 'ImportJob',
        entityId: report.importJobId,
        details: {
          sourceId: source.id,
          sourceName: source.name,
          mode: 'BULK_LIVE_EGYPT_CRAWL',
          crawledCount: rawLeads.length,
          insertedCount: report.inserted,
          duplicateCount: report.duplicates,
          deadLetterCount: report.deadLetters,
          status: report.status,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      message: `تم سحب ${rawLeads.length} نشاطاً تجارياً حياً. تم إدراج ${report.inserted} فرصة جديدة بنجاح، وتحويل ${report.duplicates} مشتبهاً بهم إلى قائمة مراجعة التكرار.`,
      report: {
        importJobId: report.importJobId,
        crawledCount: rawLeads.length,
        inserted: report.inserted,
        duplicates: report.duplicates,
        valid: report.valid,
        status: report.status,
        durationMs: report.durationMs,
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[Bulk Crawl API Error]:', err);
    return NextResponse.json(
      { error: err?.message || 'حدث خطأ غير متوقع أثناء معالجة سحب الفرص.' },
      { status: 500 }
    );
  }
}

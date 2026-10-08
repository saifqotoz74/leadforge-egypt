import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import {
  collectorRegistry,
  ensureDefaultLeadSourcesSeeded,
  IngestionError,
  maskSourceConfigSecrets,
  OpenDataCollector,
  runIngestionPipeline,
} from '@/lib/collectors';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady();
    await requireAdmin(req);
    await ensureDefaultLeadSourcesSeeded(prisma);

    const [sourcesRaw, importJobs, deadLetterCount] = await Promise.all([
      prisma.leadSource.findMany({
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.deadLetterRecord.count({
        where: { status: 'DEAD_LETTER' },
      }),
    ]);

    const sources = sourcesRaw.map((s) => {
      const configObj =
        s.config && typeof s.config === 'object' && !Array.isArray(s.config)
          ? s.config
          : {};
      return {
        ...s,
        config: undefined,
        safeConfig: maskSourceConfigSecrets(configObj),
      };
    });

    return NextResponse.json({
      sources,
      importJobs,
      deadLetterCount,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب مصادر البيانات.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const body = await req.json();

    if (body.action === 'SYNC_OPEN_DATA') {
      const collector = new OpenDataCollector();
      const rawRecords = await collector.collect();

      let sourceRecord = await prisma.leadSource.findUnique({
        where: { name: collector.name },
      });

      if (!sourceRecord) {
        sourceRecord = await prisma.leadSource.create({
          data: {
            name: collector.name,
            type: 'OPEN_DATA',
            description: 'قواعد البيانات المفتوحة للأنشطة التجارية المسجلة',
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
        sourceName: collector.name,
        sourceId: sourceRecord.id,
        sourceType: 'OPEN_DATA',
        fileName: 'open_data_sync.json',
        rawRecords,
      });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_SOURCE_SYNCED',
          entityType: 'LeadSource',
          entityId: sourceRecord.id,
          details: { report },
        },
        prisma
      );

      return NextResponse.json({ success: true, report });
    }

    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'اسم المصدر مطلوب.' }, { status: 400 });
    }

    const type = body.type === 'GOOGLE_MAPS' ? 'GOOGLE_BUSINESS' : body.type || 'MANUAL';
    const collector = collectorRegistry.resolveCollector({
      collectorKey: body.collectorKey || null,
      sourceType: type,
      sourceName: name,
    });
    const validation = collector.validateConfiguration();
    const isActive = body.isActive ?? body.enabled ?? true;

    const source = await prisma.leadSource.create({
      data: {
        name,
        type: collector.sourceType,
        description: body.description?.trim() || collector.metadata.description,
        isActive,
        enabled: isActive,
        collectorKey: collector.collectorKey,
        collectorVersion: collector.version,
        contractVersion: collector.contractVersion,
        configurationStatus: validation.status,
        healthStatus: !isActive
          ? 'DISABLED'
          : validation.status === 'NOT_CONFIGURED'
            ? 'NOT_CONFIGURED'
            : 'HEALTHY',
      },
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_SOURCE_CREATED',
        entityType: 'LeadSource',
        entityId: source.id,
      },
      prisma
    );

    return NextResponse.json(
      {
        success: true,
        source: {
          ...source,
          config: undefined,
        },
      },
      { status: 201 }
    );
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
    return NextResponse.json({ error: 'تعذر تنفيذ العملية على المصدر.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const admin = await requireAdmin(req);
    const body = await req.json();
    const sourceId = String(body.sourceId || '');

    if (!sourceId) {
      return NextResponse.json({ error: 'معرف المصدر مطلوب.' }, { status: 400 });
    }

    const isActive =
      body.isActive !== undefined
        ? Boolean(body.isActive)
        : body.enabled !== undefined
          ? Boolean(body.enabled)
          : undefined;

    const updated = await prisma.leadSource.update({
      where: { id: sourceId },
      data: {
        isActive,
        enabled: isActive,
        healthStatus: isActive === false ? 'DISABLED' : isActive === true ? 'HEALTHY' : undefined,
        name: body.name ? String(body.name).trim() : undefined,
        description:
          body.description !== undefined ? String(body.description).trim() : undefined,
      },
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_SOURCE_UPDATED',
        entityType: 'LeadSource',
        entityId: sourceId,
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      source: {
        ...updated,
        config: undefined,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر تحديث المصدر.' }, { status: 500 });
  }
}

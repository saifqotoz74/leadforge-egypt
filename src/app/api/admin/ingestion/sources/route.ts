import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SourceType } from '@prisma/client';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  collectorRegistry,
  computeNextRunAt,
  getIngestionHealthOverview,
  maskSourceConfigSecrets,
  SourceHealthStatus,
} from '@/lib/collectors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady();
    await requireAdmin(req);

    const overview = await getIngestionHealthOverview(prisma);

    return NextResponse.json({
      generatedAt: overview.generatedAt,
      summary: overview.summary,
      sources: overview.sources,
      registeredCollectors: overview.registeredCollectors,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/ingestion/sources error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب مصادر جمع البيانات.' },
      { status: 500 }
    );
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

    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json(
        { error: 'اسم المصدر مطلوب.', errorCode: 'INVALID_SOURCE_CONFIGURATION' },
        { status: 400 }
      );
    }

    const existing = await prisma.leadSource.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: 'يوجد مصدر بنفس الاسم بالفعل.', errorCode: 'DUPLICATE_RECORD' },
        { status: 409 }
      );
    }

    const rawType = body.type === 'GOOGLE_MAPS' ? 'GOOGLE_BUSINESS' : body.type || 'MANUAL';
    const type = rawType as SourceType;
    const configObj =
      body.config && typeof body.config === 'object' && !Array.isArray(body.config)
        ? (body.config as Record<string, unknown>)
        : undefined;

    const collector = collectorRegistry.resolveCollector({
      collectorKey: body.collectorKey || null,
      sourceType: type,
      sourceName: name,
      config: configObj,
    });

    const validation = collector.validateConfiguration(configObj);
    const enabled =
      body.enabled !== undefined ? Boolean(body.enabled) : Boolean(body.isActive ?? true);

    const scheduleIntervalMinutes =
      typeof body.scheduleIntervalMinutes === 'number' && body.scheduleIntervalMinutes > 0
        ? Math.floor(body.scheduleIntervalMinutes)
        : collector.metadata.defaultScheduleIntervalMinutes ?? null;
    const scheduleCron =
      typeof body.scheduleCron === 'string' && body.scheduleCron.trim()
        ? body.scheduleCron.trim()
        : collector.metadata.defaultScheduleCron ?? null;

    const healthStatus: SourceHealthStatus = !enabled
      ? 'DISABLED'
      : validation.status === 'NOT_CONFIGURED' || validation.status === 'INVALID'
        ? 'NOT_CONFIGURED'
        : 'HEALTHY';

    const created = await prisma.leadSource.create({
      data: {
        name,
        type: collector.sourceType,
        description: body.description
          ? String(body.description).trim()
          : collector.metadata.description,
        isActive: enabled,
        enabled,
        collectorKey: collector.collectorKey,
        collectorVersion: collector.version,
        contractVersion: collector.contractVersion,
        configurationStatus: validation.status,
        healthStatus,
        priority:
          typeof body.priority === 'number'
            ? Math.floor(body.priority)
            : collector.metadata.defaultPriority,
        scheduleCron,
        scheduleIntervalMinutes,
        nextRunAt: computeNextRunAt({ scheduleIntervalMinutes, scheduleCron }),
        maxRecordsPerRun:
          typeof body.maxRecordsPerRun === 'number'
            ? Math.max(1, Math.floor(body.maxRecordsPerRun))
            : 500,
        batchSize:
          typeof body.batchSize === 'number' ? Math.max(1, Math.floor(body.batchSize)) : 50,
        requestsPerMinute:
          typeof body.requestsPerMinute === 'number'
            ? Math.max(1, Math.floor(body.requestsPerMinute))
            : 60,
        timeoutMs:
          typeof body.timeoutMs === 'number'
            ? Math.max(1000, Math.floor(body.timeoutMs))
            : 30000,
        maxRetries:
          typeof body.maxRetries === 'number' ? Math.max(0, Math.floor(body.maxRetries)) : 3,
        acquisitionCostPerRunEgp:
          typeof body.acquisitionCostPerRunEgp === 'number'
            ? body.acquisitionCostPerRunEgp
            : null,
        acquisitionCostPerRecordEgp:
          typeof body.acquisitionCostPerRecordEgp === 'number'
            ? body.acquisitionCostPerRecordEgp
            : null,
        config: configObj ? (configObj as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_INGESTION_SOURCE_CREATED',
        entityType: 'LeadSource',
        entityId: created.id,
        details: {
          name: created.name,
          type: created.type,
          collectorKey: created.collectorKey,
          collectorVersion: created.collectorVersion,
          enabled: created.enabled,
          configurationStatus: created.configurationStatus,
          safeConfig: maskSourceConfigSecrets(configObj),
        },
      },
      prisma
    );

    return NextResponse.json(
      {
        success: true,
        source: {
          ...created,
          config: undefined,
          safeConfig: maskSourceConfigSecrets(configObj),
          configurationValidation: validation,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/admin/ingestion/sources error:', err);
    return NextResponse.json(
      { error: 'تعذر إنشاء مصدر البيانات.' },
      { status: 500 }
    );
  }
}

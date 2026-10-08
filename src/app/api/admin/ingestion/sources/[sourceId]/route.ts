import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  collectorRegistry,
  computeNextRunAt,
  determineDeterministicHealthStatus,
  maskSourceConfigSecrets,
} from '@/lib/collectors';

export const dynamic = 'force-dynamic';

function toRecordObject(val: unknown): Record<string, unknown> {
  if (!val) return {};
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sourceId: string }> }
) {
  try {
    await ensureDbReady();
    await requireAdmin(req);
    const { sourceId } = await context.params;

    const source = await prisma.leadSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      return NextResponse.json(
        { error: 'مصدر البيانات غير موجود.' },
        { status: 404 }
      );
    }

    const configObj = toRecordObject(source.config);

    const collector = collectorRegistry.resolveCollector({
      collectorKey: source.collectorKey,
      sourceType: source.type,
      sourceName: source.name,
      config: configObj,
    });

    const [healthCheck, recentJobs, deadLetters] = await Promise.all([
      collector.healthCheck(configObj),
      prisma.importJob.findMany({
        where: {
          OR: [{ sourceId: source.id }, { sourceName: source.name }],
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      prisma.deadLetterRecord.findMany({
        where: {
          OR: [{ sourceId: source.id }, { sourceName: source.name }],
        },
        orderBy: { lastFailedAt: 'desc' },
        take: 25,
      }),
    ]);

    return NextResponse.json({
      source: {
        ...source,
        config: undefined,
        safeConfig: maskSourceConfigSecrets(configObj),
        capabilities: collector.capabilities,
        metadata: collector.metadata,
        healthCheck,
      },
      recentJobs,
      deadLetters: deadLetters.map((dl) => ({
        ...dl,
        rawPayload: maskSourceConfigSecrets(toRecordObject(dl.rawPayload)),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/ingestion/sources/[sourceId] error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب تفاصيل المصدر.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const body = await req.json();

    const existing = await prisma.leadSource.findUnique({
      where: { id: sourceId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'مصدر البيانات غير موجود.' },
        { status: 404 }
      );
    }

    const currentConfig = toRecordObject(existing.config);

    const updatedConfig =
      body.config && typeof body.config === 'object' && !Array.isArray(body.config)
        ? { ...currentConfig, ...(body.config as Record<string, unknown>) }
        : currentConfig;

    const collector = collectorRegistry.resolveCollector({
      collectorKey: body.collectorKey || existing.collectorKey,
      sourceType: existing.type,
      sourceName: body.name || existing.name,
      config: updatedConfig,
    });

    const validation = collector.validateConfiguration(updatedConfig);

    const enabled =
      body.enabled !== undefined
        ? Boolean(body.enabled)
        : body.isActive !== undefined
          ? Boolean(body.isActive)
          : existing.enabled;

    const resetCircuit = Boolean(body.resetCircuit);
    const nextCircuitState = resetCircuit
      ? 'CLOSED'
      : body.circuitState || existing.circuitState;
    const nextConsecutiveFailures = resetCircuit
      ? 0
      : existing.consecutiveFailures;

    const healthStatus = determineDeterministicHealthStatus({
      enabled,
      isActive: enabled,
      configurationStatus: validation.status,
      circuitState: nextCircuitState,
      consecutiveFailures: nextConsecutiveFailures,
      invalidRate: 0,
      duplicateRate: 0,
      totalProcessed: existing.recordsCount,
    });

    const scheduleIntervalMinutes =
      body.scheduleIntervalMinutes !== undefined
        ? body.scheduleIntervalMinutes === null
          ? null
          : Math.max(1, Math.floor(Number(body.scheduleIntervalMinutes)))
        : existing.scheduleIntervalMinutes;

    const scheduleCron =
      body.scheduleCron !== undefined
        ? body.scheduleCron === null
          ? null
          : String(body.scheduleCron).trim() || null
        : existing.scheduleCron;

    const updated = await prisma.leadSource.update({
      where: { id: existing.id },
      data: {
        name: body.name ? String(body.name).trim() : undefined,
        description:
          body.description !== undefined
            ? body.description === null
              ? null
              : String(body.description).trim()
            : undefined,
        enabled,
        isActive: enabled,
        collectorKey: collector.collectorKey,
        collectorVersion: collector.version,
        contractVersion: collector.contractVersion,
        configurationStatus: validation.status,
        healthStatus,
        circuitState: nextCircuitState,
        circuitOpenedAt: resetCircuit ? null : undefined,
        consecutiveFailures: nextConsecutiveFailures,
        priority:
          typeof body.priority === 'number'
            ? Math.floor(body.priority)
            : undefined,
        scheduleIntervalMinutes,
        scheduleCron,
        nextRunAt: computeNextRunAt({
          scheduleIntervalMinutes,
          scheduleCron,
        }),
        maxRecordsPerRun:
          typeof body.maxRecordsPerRun === 'number'
            ? Math.max(1, Math.floor(body.maxRecordsPerRun))
            : undefined,
        batchSize:
          typeof body.batchSize === 'number'
            ? Math.max(1, Math.floor(body.batchSize))
            : undefined,
        requestsPerMinute:
          typeof body.requestsPerMinute === 'number'
            ? Math.max(1, Math.floor(body.requestsPerMinute))
            : undefined,
        timeoutMs:
          typeof body.timeoutMs === 'number'
            ? Math.max(1000, Math.floor(body.timeoutMs))
            : undefined,
        maxRetries:
          typeof body.maxRetries === 'number'
            ? Math.max(0, Math.floor(body.maxRetries))
            : undefined,
        acquisitionCostPerRunEgp:
          body.acquisitionCostPerRunEgp !== undefined
            ? body.acquisitionCostPerRunEgp === null
              ? null
              : Number(body.acquisitionCostPerRunEgp)
            : undefined,
        acquisitionCostPerRecordEgp:
          body.acquisitionCostPerRecordEgp !== undefined
            ? body.acquisitionCostPerRecordEgp === null
              ? null
              : Number(body.acquisitionCostPerRecordEgp)
            : undefined,
        config:
          Object.keys(updatedConfig).length > 0
            ? (updatedConfig as Prisma.InputJsonValue)
            : undefined,
      },
    });

    await createAuditLog(
      {
        userId: admin.id,
        action:
          body.enabled !== undefined || body.isActive !== undefined
            ? 'ADMIN_INGESTION_SOURCE_TOGGLED'
            : 'ADMIN_INGESTION_SOURCE_UPDATED',
        entityType: 'LeadSource',
        entityId: updated.id,
        details: {
          previousEnabled: existing.enabled,
          newEnabled: updated.enabled,
          healthStatus: updated.healthStatus,
          configurationStatus: updated.configurationStatus,
          circuitState: updated.circuitState,
          scheduleCron: updated.scheduleCron,
          scheduleIntervalMinutes: updated.scheduleIntervalMinutes,
          safeConfig: maskSourceConfigSecrets(updatedConfig),
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      source: {
        ...updated,
        config: undefined,
        safeConfig: maskSourceConfigSecrets(updatedConfig),
        configurationValidation: validation,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('PATCH /api/admin/ingestion/sources/[sourceId] error:', err);
    return NextResponse.json(
      { error: 'تعذر تحديث إعدادات المصدر.' },
      { status: 500 }
    );
  }
}

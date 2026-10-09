import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  applyIngestionRetentionPolicy,
  evaluateInventoryReplenishment,
  evaluateScheduledSources,
  getIngestionHealthOverview,
  getLeadDataLineage,
  IngestionError,
  runMultipleSourcesIsolated,
} from '@/lib/collectors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady();
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId')?.trim() || undefined;

    if (leadId) {
      const lineage = await getLeadDataLineage(prisma, leadId);
      return NextResponse.json({ lineage });
    }

    const [healthOverview, replenishment] = await Promise.all([
      getIngestionHealthOverview(prisma),
      evaluateInventoryReplenishment(prisma, { autoTrigger: false }),
    ]);

    return NextResponse.json({
      ...healthOverview,
      replenishment,
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
    console.error('GET /api/admin/ingestion/health error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب حالة صحة منظومة جمع البيانات.' },
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
    const body = await req.json().catch(() => ({}));

    const action = String(body.action || 'EVALUATE_REPLENISHMENT');

    if (action === 'EVALUATE_REPLENISHMENT') {
      const replenishment = await evaluateInventoryReplenishment(prisma, {
        userId: admin.id,
        rules: Array.isArray(body.rules) ? body.rules : undefined,
        autoTrigger: Boolean(body.autoTrigger),
      });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_INGESTION_REPLENISHMENT_EVALUATED',
          entityType: 'IngestionSupply',
          entityId: 'GLOBAL',
          details: {
            autoTrigger: Boolean(body.autoTrigger),
            triggeredJobsCount: replenishment.triggeredJobsCount,
            deficitsCount: replenishment.decisions.filter((d) => d.needsReplenishment)
              .length,
          },
        },
        prisma
      );

      return NextResponse.json({ success: true, replenishment });
    }

    if (action === 'RUN_SCHEDULED_SOURCES') {
      const scheduledResult = await evaluateScheduledSources(prisma, {
        userId: admin.id,
        autoExecute: body.autoExecute !== false,
      });

      return NextResponse.json({ success: true, scheduledResult });
    }

    if (action === 'APPLY_RETENTION_POLICY') {
      const retentionResult = await applyIngestionRetentionPolicy(prisma, {
        policyOverride: body.policy,
        adminUserId: admin.id,
      });

      return NextResponse.json({ success: true, retentionResult });
    }

    if (action === 'RUN_MULTI_SOURCE') {
      const enabledSources = await prisma.leadSource.findMany({
        where: {
          enabled: true,
          isActive: true,
          configurationStatus: 'CONFIGURED',
          type: { in: ['OPEN_DATA', 'DIRECTORY', 'WEBSITE'] },
        },
        orderBy: { priority: 'asc' },
      });

      const multiResult = await runMultipleSourcesIsolated({
        prisma,
        userId: admin.id,
        runs: enabledSources.map((s) => ({
          sourceId: s.id,
          sourceName: s.name,
          sourceType: s.type,
        })),
      });

      return NextResponse.json({ success: true, multiResult });
    }

    if (action === 'LINEAGE' && body.leadId) {
      const lineage = await getLeadDataLineage(prisma, String(body.leadId));
      return NextResponse.json({ success: true, lineage });
    }

    return NextResponse.json(
      { error: 'إجراء غير معروف لمنظومة الصحة والإمداد.' },
      { status: 400 }
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
    console.error('POST /api/admin/ingestion/health error:', err);
    return NextResponse.json(
      { error: 'تعذر تنفيذ عملية المراقبة أو الإمداد المستمر.' },
      { status: 500 }
    );
  }
}

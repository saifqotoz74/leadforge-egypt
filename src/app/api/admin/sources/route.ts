import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { OpenDataCollector, runIngestionPipeline } from '@/lib/collectors';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [sources, importJobs] = await Promise.all([
      prisma.leadSource.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      prisma.importJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      sources,
      importJobs,
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
          },
        });
      }

      const report = await runIngestionPipeline({
        prisma,
        userId: admin.id,
        sourceName: collector.name,
        sourceId: sourceRecord.id,
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

    const source = await prisma.leadSource.create({
      data: {
        name,
        type: body.type || 'MANUAL',
        description: body.description?.trim() || null,
        isActive: body.isActive ?? true,
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

    return NextResponse.json({ success: true, source }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر تنفيذ العملية على المصدر.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();
    const sourceId = String(body.sourceId || '');

    if (!sourceId) {
      return NextResponse.json({ error: 'معرف المصدر مطلوب.' }, { status: 400 });
    }

    const updated = await prisma.leadSource.update({
      where: { id: sourceId },
      data: {
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
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

    return NextResponse.json({ success: true, source: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر تحديث المصدر.' }, { status: 500 });
  }
}

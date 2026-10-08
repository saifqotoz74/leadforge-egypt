import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { maskSourceConfigSecrets } from '@/lib/collectors';

export const dynamic = 'force-dynamic';

function parseJsonValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    await ensureDbReady();
    await requireAdmin(req);
    const { jobId } = await context.params;

    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: {
        source: true,
        records: {
          orderBy: { rowNumber: 'asc' },
          take: 200,
        },
        deadLetterRecords: {
          orderBy: { lastFailedAt: 'desc' },
          take: 100,
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'مهمة الاستيراد غير موجودة.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      job: {
        ...job,
        totalRecords: job.totalRows,
        checkpoint: parseJsonValue(job.checkpoint),
        summary: parseJsonValue(job.summary),
        configurationSnapshot: maskSourceConfigSecrets(
          parseJsonValue(job.configurationSnapshot)
        ),
        source: job.source
          ? {
              ...job.source,
              config: undefined,
            }
          : null,
        records: job.records.map((r) => ({
          ...r,
          rawData: maskSourceConfigSecrets(parseJsonValue(r.rawData)),
          normalizedData: parseJsonValue(r.normalizedData),
        })),
        deadLetterRecords: job.deadLetterRecords.map((dl) => ({
          ...dl,
          rawPayload: maskSourceConfigSecrets(parseJsonValue(dl.rawPayload)),
        })),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/ingestion/jobs/[jobId] error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب تفاصيل المهمة.' },
      { status: 500 }
    );
  }
}

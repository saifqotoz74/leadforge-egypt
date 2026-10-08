import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { AuthError, requireAdmin } from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';

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

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady();
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get('sourceId')?.trim() || undefined;
    const sourceName = searchParams.get('sourceName')?.trim() || undefined;
    const status = searchParams.get('status')?.trim() || undefined;
    const triggerType = searchParams.get('triggerType')?.trim() || undefined;
    const collectorVersion = searchParams.get('collectorVersion')?.trim() || undefined;
    const from = searchParams.get('from')?.trim() || undefined;
    const to = searchParams.get('to')?.trim() || undefined;

    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25)));
    const sortByParam = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const where: Prisma.ImportJobWhereInput = {};
    if (sourceId) where.sourceId = sourceId;
    if (sourceName) where.sourceName = sourceName;
    if (status) where.status = status;
    if (triggerType) where.triggerType = triggerType;
    if (collectorVersion) where.collectorVersion = collectorVersion;

    if (from || to) {
      where.createdAt = {};
      if (from) {
        const dFrom = new Date(from);
        if (!Number.isNaN(dFrom.getTime())) where.createdAt.gte = dFrom;
      }
      if (to) {
        const dTo = new Date(to);
        if (!Number.isNaN(dTo.getTime())) where.createdAt.lte = dTo;
      }
    }

    const allowedSortColumns = new Set([
      'createdAt',
      'durationMs',
      'totalRows',
      'validCount',
      'duplicateCount',
      'invalidCount',
      'failedCount',
      'deadLetterCount',
    ]);
    const sortColumn = allowedSortColumns.has(sortByParam) ? sortByParam : 'createdAt';

    const [totalCount, jobs] = await Promise.all([
      prisma.importJob.count({ where }),
      prisma.importJob.findMany({
        where,
        orderBy: { [sortColumn]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const parsedJobs = jobs.map((j) => ({
      ...j,
      totalRecords: j.totalRows,
      checkpoint: parseJsonValue(j.checkpoint),
      summary: parseJsonValue(j.summary),
      configurationSnapshot: undefined,
    }));

    return NextResponse.json({
      jobs: parsedJobs,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/ingestion/jobs error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب مهام جمع البيانات.' },
      { status: 500 }
    );
  }
}

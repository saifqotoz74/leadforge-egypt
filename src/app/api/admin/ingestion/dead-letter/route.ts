import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady();
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status')?.trim().toUpperCase() || undefined;
    const statusAliasMap: Record<string, string> = {
      RESOLVED: 'RETRIED_RESOLVED',
      RETRIED: 'RETRIED_RESOLVED',
      INVALID: 'PERMANENTLY_INVALID',
    };
    const status = rawStatus ? statusAliasMap[rawStatus] || rawStatus : undefined;
    const sourceId = searchParams.get('sourceId')?.trim() || undefined;
    const sourceName = searchParams.get('sourceName')?.trim() || undefined;
    const errorCode = searchParams.get('errorCode')?.trim() || undefined;
    const importJobId = searchParams.get('importJobId')?.trim() || undefined;

    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25)));

    const where: Prisma.DeadLetterRecordWhereInput = {};
    if (status) where.status = status;
    if (sourceId) where.sourceId = sourceId;
    if (sourceName) where.sourceName = sourceName;
    if (errorCode) where.errorCode = errorCode;
    if (importJobId) where.importJobId = importJobId;

    const [totalCount, items] = await Promise.all([
      prisma.deadLetterRecord.count({ where }),
      prisma.deadLetterRecord.findMany({
        where,
        orderBy: { lastFailedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      items: items.map((dl) => ({
        ...dl,
        failureStage: 'DEAD_LETTER',
        errorMessage: dl.lastError || dl.failureReason,
        rawPayload: maskSourceConfigSecrets(parseJsonValue(dl.rawPayload)),
        normalizedPayload: parseJsonValue(dl.normalizedPayload),
      })),
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
    console.error('GET /api/admin/ingestion/dead-letter error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب سجلات المعالجة المعلقة (Dead-Letter).' },
      { status: 500 }
    );
  }
}

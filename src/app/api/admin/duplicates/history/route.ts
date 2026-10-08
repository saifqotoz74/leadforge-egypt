import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAdminMergeHistory } from '@/lib/deduplication';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const targetLeadId = searchParams.get('targetLeadId') || undefined;
    const includeReverted = searchParams.get('includeReverted') !== 'false';
    const limit = Number(searchParams.get('limit') || 50);

    const history = await getAdminMergeHistory(prisma, {
      targetLeadId,
      includeReverted,
      limit,
    });

    return NextResponse.json({
      history,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: 'تعذر جلب سجل عمليات الدمج.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { getPairMatchExplanationFromDb, persistMatchSnapshot } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { leadId: string; developerId: string } }
) {
  try {
    const user = await requireAuth(req);
    const { leadId } = params;
    const targetDeveloperId =
      params.developerId === 'me' ? user.id : params.developerId;

    if (!leadId || !targetDeveloperId) {
      return NextResponse.json(
        { error: 'معرف العميل (leadId) ومعرف المطور (developerId) مطلوبان.' },
        { status: 400 }
      );
    }

    if (user.role !== 'ADMIN' && targetDeveloperId !== user.id) {
      return NextResponse.json(
        { error: 'غير مصرح لك بعرض تفاصيل مطابقة مطور آخر.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const report = await getPairMatchExplanationFromDb(
      leadId,
      targetDeveloperId
    );

    if (!report) {
      return NextResponse.json(
        { error: 'العميل المحتمل أو المطور غير موجود.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get('persist') === 'true' && user.role === 'ADMIN') {
      await persistMatchSnapshot(report.matchResult);
    }

    return NextResponse.json({
      ...report,
      debugReport: report,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error(
      'GET /api/matching/leads/[leadId]/developers/[developerId] error:',
      err
    );
    return NextResponse.json(
      { error: 'تعذر جلب تقرير المطابقة التفصيلي.' },
      { status: 500 }
    );
  }
}

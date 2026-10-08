import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { getMatchesForLeadFromDb } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const user = await requireAuth(req);
    const { leadId } = params;

    if (!leadId || typeof leadId !== 'string') {
      return NextResponse.json(
        { error: 'معرف العميل المحتمل (leadId) مطلوب.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const includeRejectedParam = searchParams.get('includeRejected');
    const includeRejected =
      user.role === 'ADMIN'
        ? includeRejectedParam !== 'false'
        : includeRejectedParam === 'true';
    const persist = user.role === 'ADMIN' && searchParams.get('persist') === 'true';

    const data = await getMatchesForLeadFromDb(leadId, {
      includeRejected,
      persistSnapshots: persist,
    });

    if (!data) {
      return NextResponse.json(
        { error: 'العميل المحتمل غير موجود.' },
        { status: 404 }
      );
    }

    // If caller is a non-admin developer, scope developer list to their own record unless summary requested
    if (user.role !== 'ADMIN') {
      const ownEligible = data.eligibleDevelopers.filter(
        (m) => m.developerId === user.id
      );
      const ownRejected = (data.rejectedDevelopers || []).filter(
        (m) => m.developerId === user.id
      );
      return NextResponse.json({
        leadId: data.leadId,
        lead: data.lead,
        matchVersion: data.matchVersion,
        eligibleDevelopers: ownEligible,
        rejectedDevelopers: includeRejected ? ownRejected : undefined,
        reason: ownEligible.length === 0 ? 'NO_ELIGIBLE_DEVELOPERS' : null,
        totalEligibleCount: data.eligibleDevelopers.length,
        diagnostics: data.diagnostics,
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('GET /api/matching/leads/[leadId] error:', err);
    return NextResponse.json(
      { error: 'تعذر حساب المطابقات لهذا العميل.' },
      { status: 500 }
    );
  }
}

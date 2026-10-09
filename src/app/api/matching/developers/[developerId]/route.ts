import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { getMatchesForDeveloperFromDb } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { developerId: string } }
) {
  try {
    const user = await requireAuth(req);
    const targetDeveloperId =
      params.developerId === 'me' ? user.id : params.developerId;

    if (!targetDeveloperId || typeof targetDeveloperId !== 'string') {
      return NextResponse.json(
        { error: 'معرف المطور (developerId) مطلوب.' },
        { status: 400 }
      );
    }

    if (user.role !== 'ADMIN' && targetDeveloperId !== user.id) {
      return NextResponse.json(
        { error: 'غير مصرح لك بعرض مطابقات مطور آخر.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit')
      ? Math.max(1, Math.min(200, Number(searchParams.get('limit'))))
      : 50;
    const offset = searchParams.get('offset')
      ? Math.max(0, Number(searchParams.get('offset')))
      : 0;
    const minMatchStrength = searchParams.get('minMatchStrength')
      ? Math.max(0, Math.min(100, Number(searchParams.get('minMatchStrength'))))
      : 0;
    const minQualityRaw =
      searchParams.get('minQuality') || searchParams.get('minQualityScore');
    const minQualityScore = minQualityRaw
      ? Math.max(0, Math.min(100, Number(minQualityRaw)))
      : undefined;

    let minOpportunityScore: number | undefined;
    let maxOpportunityScore: number | undefined;
    const minOppRaw =
      searchParams.get('minOpportunityScore') ||
      searchParams.get('opportunityScore') ||
      searchParams.get('minScore');
    if (minOppRaw && !Number.isNaN(Number(minOppRaw))) {
      minOpportunityScore = Math.max(0, Math.min(100, Number(minOppRaw)));
    }
    const maxOppRaw =
      searchParams.get('maxOpportunityScore') || searchParams.get('maxScore');
    if (maxOppRaw && !Number.isNaN(Number(maxOppRaw))) {
      maxOpportunityScore = Math.max(0, Math.min(100, Number(maxOppRaw)));
    }
    const scoreRange = searchParams.get('scoreRange');
    if (scoreRange && scoreRange !== 'ALL') {
      const [minStr, maxStr] = scoreRange.split('-');
      const minNum = Number(minStr);
      const maxNum = Number(maxStr);
      if (!Number.isNaN(minNum)) minOpportunityScore = minNum;
      if (!Number.isNaN(maxNum)) maxOpportunityScore = maxNum;
    }

    const service =
      searchParams.get('service') ||
      searchParams.get('requiredService') ||
      undefined;
    const niche =
      searchParams.get('niche') || searchParams.get('category') || undefined;
    const city = searchParams.get('city') || undefined;
    const governorate = searchParams.get('governorate') || undefined;
    const location = searchParams.get('location') || undefined;
    const leadType =
      searchParams.get('leadType') ||
      searchParams.get('projectLeadType') ||
      undefined;
    const freshness =
      searchParams.get('freshness') ||
      searchParams.get('freshnessStatus') ||
      undefined;

    const includeRejected = searchParams.get('includeRejected') === 'true';
    const persistSnapshots =
      user.role === 'ADMIN' && searchParams.get('persist') === 'true';

    const data = await getMatchesForDeveloperFromDb(targetDeveloperId, {
      limit,
      offset,
      minMatchStrength,
      minQualityScore,
      minOpportunityScore,
      maxOpportunityScore,
      service,
      niche,
      city,
      governorate,
      location,
      leadType,
      freshness,
      includeRejected,
      persistSnapshots,
    });

    if (!data) {
      return NextResponse.json(
        { error: 'المطور غير موجود.' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('GET /api/matching/developers/[developerId] error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب العملاء المتطابقين لهذا المطور.' },
      { status: 500 }
    );
  }
}

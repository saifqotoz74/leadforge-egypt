import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ManualCollector, runIngestionPipeline } from '@/lib/collectors';
import { evaluateLeadFreshness, DEFAULT_FRESHNESS_THRESHOLDS } from '@/lib/freshness';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const VALID_AVAILABILITY_STATUSES = new Set([
  'AVAILABLE',
  'CLAIMED_SHARED',
  'CLAIMED_EXCLUSIVE',
  'HIDDEN',
  'INVALID',
  'REQUIRES_VERIFICATION',
  'STALE',
  'CLOSED',
  'DUPLICATE',
  'NOT_SALEABLE',
]);

const VALID_QUALITY_STATUSES = new Set([
  'VERY_LOW',
  'LOW',
  'MEDIUM',
  'HIGH',
  'EXCELLENT',
]);

const VALID_FRESHNESS_STATUSES = new Set([
  'FRESH',
  'RECENT',
  'NEEDS_VERIFICATION',
  'STALE',
  'VERY_STALE',
  'UNKNOWN',
]);

const VALID_VERIFICATION_STATUSES = new Set([
  'UNVERIFIED',
  'PARTIALLY_VERIFIED',
  'VERIFIED',
  'FAILED_VERIFICATION',
]);

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const city = searchParams.get('city')?.trim() || '';

    const includeMerged = searchParams.get('includeMerged') === 'true';
    const qualityStatus = searchParams.get('qualityStatus')?.trim() || '';
    const freshnessStatus = searchParams.get('freshnessStatus')?.trim() || '';
    const verificationStatus = searchParams.get('verificationStatus')?.trim() || '';
    const saleabilityStatus = searchParams.get('saleabilityStatus')?.trim() || '';
    const flag = searchParams.get('flag')?.trim() || '';

    const rawLimit = Number(searchParams.get('pageSize') || searchParams.get('limit') || '200');
    const take = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 200;
    const rawPage = Number(searchParams.get('page') || '1');
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};
    if (!includeMerged) {
      where.isCanonical = true;
    }
    if (status && status !== 'ALL') {
      if (!VALID_AVAILABILITY_STATUSES.has(status)) {
        return NextResponse.json(
          { error: 'فلتر الحالة غير صالح.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      where.status = status;
    }
    if (qualityStatus && qualityStatus !== 'ALL') {
      if (!VALID_QUALITY_STATUSES.has(qualityStatus)) {
        return NextResponse.json(
          { error: 'فلتر مستوى الجودة غير صالح.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      where.qualityStatus = qualityStatus;
    }
    if (freshnessStatus && freshnessStatus !== 'ALL') {
      if (!VALID_FRESHNESS_STATUSES.has(freshnessStatus)) {
        return NextResponse.json(
          { error: 'فلتر الحداثة غير صالح.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      where.freshnessStatus = freshnessStatus;
    }
    if (verificationStatus && verificationStatus !== 'ALL') {
      if (!VALID_VERIFICATION_STATUSES.has(verificationStatus)) {
        return NextResponse.json(
          { error: 'فلتر حالة التحقق غير صالح.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      where.verificationStatus = verificationStatus;
    }
    if (saleabilityStatus && saleabilityStatus !== 'ALL') {
      if (!VALID_AVAILABILITY_STATUSES.has(saleabilityStatus)) {
        return NextResponse.json(
          { error: 'فلتر قابلية البيع غير صالح.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      where.saleabilityStatus = saleabilityStatus;
    }
    if (flag && flag !== 'ALL') {
      where.qualityFlags = { has: flag };
    }
    if (category && category !== 'ALL') {
      where.category = category;
    }
    if (city && city !== 'ALL') {
      where.city = city;
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, freshnessRow] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          scores: {
            orderBy: { calculatedAt: 'desc' },
            take: 1,
          },
          verifications: {
            orderBy: { checkedAt: 'desc' },
            take: 6,
          },
          claims: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          feedbacks: true,
        },
      }),
      prisma.freshnessConfig.findUnique({ where: { id: 'default' } }),
    ]);

    const thresholds = freshnessRow || DEFAULT_FRESHNESS_THRESHOLDS;

    return NextResponse.json({
      leads: leads.map((lead) => {
        const freshness = evaluateLeadFreshness(
          lead.lastVerifiedAt,
          thresholds
        );
        return {
          ...lead,
          freshness,
          freshnessStatus: freshness.freshnessStatus,
        };
      }),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب قائمة العملاء.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();

    const collector = new ManualCollector();
    const collected = await collector.collect(body);

    const report = await runIngestionPipeline({
      prisma,
      userId: admin.id,
      sourceName: body.source || collector.name,
      sourceType: 'MANUAL',
      rawRecords: collected,
    });

    if (report.invalid > 0) {
      return NextResponse.json(
        {
          error: report.records[0]?.errors?.join(' | ') || 'بيانات غير صالحة.',
          report,
        },
        { status: 400 }
      );
    }

    const firstRecord = report.records[0];
    const leadId = firstRecord?.leadId;
    const createdOrMergedLead = leadId
      ? await prisma.lead.findUnique({ where: { id: leadId } })
      : null;

    await createAuditLog(
      {
        userId: admin.id,
        action:
          report.duplicates > 0
            ? 'ADMIN_LEAD_MERGED'
            : report.possibleDuplicates > 0 || report.conflicts > 0
              ? 'ADMIN_LEAD_FLAGGED_FOR_REVIEW'
              : 'ADMIN_LEAD_CREATED',
        entityType: 'Lead',
        entityId: leadId || null,
        details: { report },
      },
      prisma
    );

    return NextResponse.json(
      {
        success: true,
        lead: createdOrMergedLead,
        decision: firstRecord?.decision || 'UNIQUE',
        wasDuplicate: report.duplicates > 0,
        possibleDuplicate: report.possibleDuplicates > 0,
        conflict: report.conflicts > 0,
        duplicateCandidateId: firstRecord?.duplicateCandidateId || null,
        signals: firstRecord?.signals || [],
        conflicts: firstRecord?.conflicts || [],
        report,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/admin/leads error:', err);
    return NextResponse.json({ error: 'تعذر إضافة الفرصة.' }, { status: 500 });
  }
}

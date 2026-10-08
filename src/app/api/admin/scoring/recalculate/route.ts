import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  BulkRecalculationFilters,
  recalculateManyLeadScores,
} from '@/lib/scoring-engine';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const rawFilters =
      body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
        ? (body.filters as Record<string, unknown>)
        : body;

    const filters: BulkRecalculationFilters = {};
    if (typeof rawFilters.city === 'string' && rawFilters.city.trim()) {
      filters.city = rawFilters.city.trim();
    }
    if (typeof rawFilters.governorate === 'string' && rawFilters.governorate.trim()) {
      filters.governorate = rawFilters.governorate.trim();
    }
    if (typeof rawFilters.category === 'string' && rawFilters.category.trim()) {
      filters.category = rawFilters.category.trim();
    }
    if (
      typeof rawFilters.status === 'string' &&
      ['AVAILABLE', 'CLAIMED_FULL', 'INVALID', 'ARCHIVED'].includes(rawFilters.status)
    ) {
      filters.status = rawFilters.status as BulkRecalculationFilters['status'];
    }
    if (
      typeof rawFilters.websiteStatus === 'string' &&
      ['NO_WEBSITE', 'HAS_WEBSITE', 'POOR_WEBSITE', 'UNKNOWN'].includes(rawFilters.websiteStatus)
    ) {
      filters.websiteStatus = rawFilters.websiteStatus as BulkRecalculationFilters['websiteStatus'];
    }
    if (Array.isArray(rawFilters.leadIds)) {
      filters.leadIds = rawFilters.leadIds.map((id) => String(id)).filter(Boolean);
    }

    const report = await recalculateManyLeadScores(prisma, filters, {
      batchSize: body.batchSize ? Number(body.batchSize) : 50,
      maxLeads: body.maxLeads ? Number(body.maxLeads) : 5000,
      trigger: 'ADMIN_RECALCULATION',
      scoringVersion: typeof body.scoringVersion === 'string' ? body.scoringVersion : undefined,
      forceSnapshot: Boolean(body.forceSnapshot),
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_BULK_SCORES_RECALCULATED',
        entityType: 'ScoringRule',
        details: {
          filters,
          report,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      updatedCount: report.totalProcessed,
      report,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/admin/scoring/recalculate error:', err);
    return NextResponse.json(
      { error: 'تعذر تنفيذ إعادة الحساب الجماعي للتقييمات.' },
      { status: 500 }
    );
  }
}

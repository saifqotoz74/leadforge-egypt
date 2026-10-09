import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { recalculateMatchesInDb } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).' },
        { status: 403 }
      );
    }

    const admin = await requireAdmin(req);
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const leadId =
      typeof body.leadId === 'string' && body.leadId.trim()
        ? body.leadId.trim()
        : undefined;
    const developerId =
      typeof body.developerId === 'string' && body.developerId.trim()
        ? body.developerId.trim()
        : undefined;
    const batchLimit =
      typeof body.batchLimit === 'number' && Number.isFinite(body.batchLimit)
        ? Math.max(1, Math.min(100, Math.round(body.batchLimit)))
        : 50;

    if (leadId) {
      const exists = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: 'العميل المحتمل غير موجود.' },
          { status: 404 }
        );
      }
    }

    if (developerId) {
      const exists = await prisma.user.findUnique({
        where: { id: developerId },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json(
          { error: 'المطور غير موجود.' },
          { status: 404 }
        );
      }
    }

    const summary = await recalculateMatchesInDb({
      leadId,
      developerId,
      batchLimit,
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_MATCHING_RECALCULATED',
        entityType: 'MatchSnapshot',
        entityId: leadId || developerId || 'batch',
        details: { ...summary },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/admin/matching/recalculate error:', err);
    return NextResponse.json(
      { error: 'تعذر تنفيذ إعادة حساب المطابقات.' },
      { status: 500 }
    );
  }
}

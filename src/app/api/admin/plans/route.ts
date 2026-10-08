import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const plans = await prisma.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    return NextResponse.json({
      plans: plans.map((p) => ({
        ...p,
        subscribersCount: p._count.subscriptions,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب الباقات.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();
    const planId = String(body.planId || '');

    if (!planId) {
      return NextResponse.json({ error: 'معرف الباقة مطلوب.' }, { status: 400 });
    }

    const existing = await prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) {
      return NextResponse.json({ error: 'الباقة غير موجودة.' }, { status: 404 });
    }

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : existing.name,
        nameEn: body.nameEn !== undefined ? String(body.nameEn).trim() : existing.nameEn,
        priceEgp: body.priceEgp !== undefined ? Math.max(0, Number(body.priceEgp)) : existing.priceEgp,
        monthlyCredits:
          body.monthlyCredits !== undefined
            ? Math.max(0, Number(body.monthlyCredits))
            : existing.monthlyCredits,
        allowsExclusive:
          body.allowsExclusive !== undefined ? Boolean(body.allowsExclusive) : existing.allowsExclusive,
        features: Array.isArray(body.features) ? body.features : existing.features,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
      },
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_PLAN_UPDATED',
        entityType: 'Plan',
        entityId: planId,
        details: body,
      },
      prisma
    );

    return NextResponse.json({ success: true, plan: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر تحديث الباقة.' }, { status: 500 });
  }
}

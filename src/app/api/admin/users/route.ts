import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { invalidateAndRecalculateDeveloperMatches } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (role && role !== 'ALL') {
      where.role = role;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, plans] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          developerProfile: true,
          subscription: { include: { plan: true } },
          _count: {
            select: {
              claims: true,
              feedbacks: true,
            },
          },
        },
      }),
      prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
        developerProfile: u.developerProfile,
        subscription: u.subscription,
        claimsCount: u._count.claims,
        feedbacksCount: u._count.feedbacks,
      })),
      plans,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب قائمة المستخدمين.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();
    const userId = String(body.userId || '');

    if (!userId) {
      return NextResponse.json({ error: 'معرف المستخدم مطلوب.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'المستخدم غير موجود.' }, { status: 404 });
    }

    if (body.status && ['ACTIVE', 'SUSPENDED'].includes(body.status)) {
      await prisma.user.update({
        where: { id: userId },
        data: { status: body.status },
      });
    }

    if (body.credits !== undefined && targetUser.subscription) {
      const newCredits = Math.max(0, Number(body.credits));
      await prisma.subscription.update({
        where: { id: targetUser.subscription.id },
        data: { credits: newCredits },
      });
    }

    if (body.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: String(body.planId) } });
      if (plan) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await prisma.subscription.upsert({
          where: { userId },
          update: {
            planId: plan.id,
            status: 'ACTIVE',
            credits: body.credits !== undefined ? Number(body.credits) : plan.monthlyCredits,
            totalCreditsGranted: plan.monthlyCredits,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          create: {
            userId,
            planId: plan.id,
            status: 'ACTIVE',
            credits: plan.monthlyCredits,
            totalCreditsGranted: plan.monthlyCredits,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }
    }

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_USER_UPDATED',
        entityType: 'User',
        entityId: userId,
        details: body,
      },
      prisma
    );

    await invalidateAndRecalculateDeveloperMatches(userId);

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        developerProfile: true,
        subscription: { include: { plan: true } },
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر تحديث بيانات المستخدم.' }, { status: 500 });
  }
}

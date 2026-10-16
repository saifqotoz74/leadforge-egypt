import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, revokeAllSessionsForUser, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { invalidateAndRecalculateDeveloperMatches } from '@/lib/matching/service';
import { syncSubscriptionCreditsToLedgerInTx } from '@/lib/claims/credit-service';
import { redactSensitiveData } from '@/lib/security';

export const dynamic = 'force-dynamic';

const VALID_USER_STATUSES = new Set(['ACTIVE', 'SUSPENDED']);
const VALID_USER_ROLES = new Set(['DEVELOPER', 'ADMIN']);

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status && status !== 'ALL') {
      if (!VALID_USER_STATUSES.has(status)) {
        return NextResponse.json(
          { error: 'حالة المستخدم غير صالحة.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
      where.status = status;
    }
    if (role && role !== 'ALL') {
      if (!VALID_USER_ROLES.has(role)) {
        return NextResponse.json(
          { error: 'صلاحية المستخدم غير صالحة.', code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
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
        take: 500,
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
      const isSuspension = body.status === 'SUSPENDED';
      const now = new Date();
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: body.status,
          ...(isSuspension ? { sessionsRevokedBefore: now } : {}),
        },
      });
      if (isSuspension) {
        await revokeAllSessionsForUser(userId);
      }
    }

    if (body.credits !== undefined && targetUser.subscription && !body.planId) {
      const newCredits = Math.max(0, Number(body.credits));
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: targetUser.subscription!.id },
          data: { credits: newCredits },
        });
        await syncSubscriptionCreditsToLedgerInTx(tx, {
          developerId: userId,
          targetBalance: newCredits,
          type: 'ADMIN_ADJUSTMENT',
          reason: body.reason || 'Admin user credit balance update',
          referenceType: 'ADMIN_USER_UPDATE',
          referenceId: admin.id,
          performedById: admin.id,
        });
      });
    }

    if (body.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: String(body.planId) } });
      if (plan) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const targetCredits =
          body.credits !== undefined ? Math.max(0, Number(body.credits)) : plan.monthlyCredits;
        await prisma.$transaction(async (tx) => {
          await tx.subscription.upsert({
            where: { userId },
            update: {
              planId: plan.id,
              status: 'ACTIVE',
              credits: targetCredits,
              totalCreditsGranted: plan.monthlyCredits,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
            create: {
              userId,
              planId: plan.id,
              status: 'ACTIVE',
              credits: targetCredits,
              totalCreditsGranted: plan.monthlyCredits,
              creditsUsed: 0,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });
          await syncSubscriptionCreditsToLedgerInTx(tx, {
            developerId: userId,
            targetBalance: targetCredits,
            type: 'PURCHASE',
            reason: `Admin plan assignment: ${plan.nameEn}`,
            referenceType: 'ADMIN_PLAN_ASSIGN',
            referenceId: plan.id,
            performedById: admin.id,
          });
        });
      }
    }

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_USER_UPDATED',
        entityType: 'User',
        entityId: userId,
        details: redactSensitiveData({
          userId,
          status: body.status,
          planId: body.planId,
          credits: body.credits,
          reason: body.reason,
        }) as Record<string, unknown>,
      },
      prisma
    );

    await invalidateAndRecalculateDeveloperMatches(userId);

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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

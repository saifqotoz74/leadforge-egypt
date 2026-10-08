import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { subscribeUserToPlan } from '@/lib/payment/provider';
import { invalidateAndRecalculateDeveloperMatches } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  planId: z.string().min(1, 'معرف الباقة مطلوب'),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const [plans, payments] = await Promise.all([
      prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.payment.findMany({
        where: { userId: user.id },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      subscription: user.subscription,
      plans,
      payments,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب بيانات الاشتراك.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const user = await requireAuth(req);
    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات الاشتراك غير صالحة' },
        { status: 400 }
      );
    }

    const result = await subscribeUserToPlan({
      prisma,
      userId: user.id,
      planId: parsed.data.planId,
    });

    await invalidateAndRecalculateDeveloperMatches(user.id);

    return NextResponse.json({
      success: true,
      subscription: result.subscription,
      payment: result.payment,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'تعذر تفعيل الباقة.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

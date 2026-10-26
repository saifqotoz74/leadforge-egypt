import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { subscribeUserToPlan } from '@/lib/payment/provider';
import { invalidateAndRecalculateDeveloperMatches } from '@/lib/matching/service';
import { AppSecurityError, getSafeClientErrorMessage } from '@/lib/security/error-taxonomy';
import { globalAppCache } from '@/lib/observability/cache';

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

    const rl = checkRateLimit({
      key: `subscription:${user.id}`,
      limit: 10,
      windowMs: 5 * 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز حد طلبات الاشتراك المسموح به. يرجى المحاولة لاحقًا.' },
        {
          status: 429,
          headers: getRateLimitHeaders(rl),
        }
      );
    }

    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات الاشتراك غير صالحة' },
        { status: 400 }
      );
    }

    // Phase 1A: Reject sandbox payment attempts for paid plans in production
    const plan = await prisma.plan.findUnique({ where: { id: parsed.data.planId } });
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'الباقة المختارة غير متاحة حاليًا.' }, { status: 404 });
    }

    if (process.env.NODE_ENV === 'production' && plan.priceEgp > 0) {
      return NextResponse.json(
        {
          error: 'لا يمكن تفعيل الباقات المدفوعة عبر بوابة الدفع التجريبية في بيئة الإنتاج.',
          code: 'SANDBOX_PAYMENT_FORBIDDEN',
        },
        { status: 403 }
      );
    }

    const result = await subscribeUserToPlan({
      prisma,
      userId: user.id,
      planId: plan.id,
    });

    globalAppCache.invalidateNamespace('plans');
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
    if (err instanceof AppSecurityError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    const message = getSafeClientErrorMessage(err, 'تعذر تفعيل الباقة.');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

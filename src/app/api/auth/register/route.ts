import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady, prisma } from '@/lib/db';
import { hashPassword, signSessionToken, verifyCsrfOrigin } from '@/lib/auth';
import { checkRateLimit, getClientIp, getRateLimitHeaders } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { createInAppNotification } from '@/lib/notifications';
import { DEFAULT_PLANS } from '@/lib/payment/provider';
import { ensureDeveloperCreditAccount } from '@/lib/claims/credit-service';
import { isFeatureFlagEnabled } from '@/lib/production/feature-flags';
import { sendWelcomeEmailSafe } from '@/lib/email-templates';
import {
  createEmailVerificationToken,
  sendVerificationEmailSafe,
} from '@/lib/email-verification';

const registerSchema = z.object({
  name: z.string().min(2, 'الاسم الكامل مطلوب (حرفين على الأقل)'),
  email: z.string().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تتكون من 6 أحرف على الأقل'),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  services: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  niches: z.array(z.string()).optional(),
  leadPreferences: z.array(z.string()).optional(),
  minBudget: z.number().min(0).optional(),
  leadType: z.enum(['BOTH', 'EXCLUSIVE', 'SHARED']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    if (!isFeatureFlagEnabled('public_registration_enabled')) {
      return NextResponse.json(
        {
          error: 'التسجيل العام متوقف مؤقتًا حاليًا.',
          code: 'PUBLIC_REGISTRATION_DISABLED',
        },
        { status: 503 }
      );
    }

    const ip = getClientIp(req.headers);
    const rl = checkRateLimit({ key: `register:${ip}`, limit: 5, windowMs: 10 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح به لإنشاء الحسابات. يرجى المحاولة لاحقًا.' },
        {
          status: 429,
          headers: getRateLimitHeaders(rl),
        }
      );
    }

    await ensureDbReady();
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات التسجيل غير صالحة' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const normalizedEmail = data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني مسجل بالفعل في المنصة.' },
        { status: 409 }
      );
    }

    // Ensure Free plan exists
    let freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
    if (!freePlan) {
      freePlan = await prisma.plan.create({
        data: DEFAULT_PLANS[0],
      });
    }

    const passwordHash = await hashPassword(data.password);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: null,
        developerProfile: {
          create: {
            companyName: data.companyName?.trim() || null,
            phone: data.phone?.trim() || null,
            services:
              data.services && data.services.length > 0
                ? data.services
                : ['Website Development'],
            locations:
              data.locations && data.locations.length > 0
                ? data.locations
                : ['القاهرة', 'الجيزة'],
            niches:
              data.niches && data.niches.length > 0
                ? data.niches
                : ['Dental', 'Medical', 'Restaurant'],
            leadPreferences:
              data.leadPreferences && data.leadPreferences.length > 0
                ? data.leadPreferences
                : ['NO_WEBSITE', 'POOR_WEBSITE'],
            minBudget: data.minBudget ?? 5000,
            maxBudget: 60000,
            budgetRange: `${data.minBudget ?? 5000}-60000`,
            leadType: data.leadType || 'BOTH',
          },
        },
        subscription: {
          create: {
            planId: freePlan.id,
            status: 'ACTIVE',
            credits: freePlan.monthlyCredits,
            totalCreditsGranted: freePlan.monthlyCredits,
            creditsUsed: 0,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
      include: {
        developerProfile: true,
        subscription: { include: { plan: true } },
      },
    });

    await ensureDeveloperCreditAccount(prisma, user.id);

    await createInAppNotification(
      {
        userId: user.id,
        title: 'مرحبًا بك في LeadForge Egypt',
        message: `تم تفعيل حسابك بالباقة المجانية وإضافة ${freePlan.monthlyCredits} نقاط رصيد لتجربة الفرص المؤهلة.`,
        type: 'SUBSCRIPTION',
        link: '/leads',
      },
      prisma
    );

    await sendWelcomeEmailSafe({
      email: user.email,
      name: user.name,
    }).catch((err) => {
      console.error('[Welcome Email Error]:', err);
    });

    try {
      const { rawToken } = await createEmailVerificationToken(user.id, {
        ipAddress: ip,
        userAgent: req.headers.get('user-agent'),
      });
      await sendVerificationEmailSafe({
        email: user.email,
        name: user.name,
        rawToken,
        origin: req.headers.get('origin') || undefined,
      });
    } catch (vErr) {
      console.error('[Registration Verification Email Error]:', vErr);
    }

    await createAuditLog(
      {
        userId: user.id,
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ip,
      },
      prisma
    );

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
      { status: 201 }
    );

    response.cookies.set('leadforge_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err: any) {
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء الحساب.' }, { status: 500 });
  }
}

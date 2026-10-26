import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady, prisma } from '@/lib/db';
import {
  getClientIp,
  setSessionCookie,
  signSessionToken,
  verifyCsrfOrigin,
  verifyPassword,
} from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit';
import { applySecurityHeaders, recordSecuritySignal } from '@/lib/security';

const loginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' }, { status: 403 })
      );
    }

    const ip = getClientIp(req);
    const rl = checkRateLimit({ key: `login:${ip}`, limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      await recordSecuritySignal({
        signalType: 'REPEATED_AUTH_FAILURES',
        ipAddress: ip,
        details: { reason: 'RATE_LIMITED' },
      });
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'تم تجاوز الحد المسموح به لمحاولات تسجيل الدخول. يرجى المحاولة بعد دقيقة.', code: 'RATE_LIMITED' },
          { status: 429 }
        )
      );
    }

    await ensureDbReady();
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'بيانات الدخول غير صالحة', code: 'VALIDATION_ERROR' },
          { status: 400 }
        )
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await recordSecuritySignal({
        signalType: 'REPEATED_AUTH_FAILURES',
        ipAddress: ip,
        details: { reason: 'UNKNOWN_USER' },
      });
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      );
    }

    if (user.status === 'SUSPENDED') {
      await recordSecuritySignal({
        signalType: 'REPEATED_AUTH_FAILURES',
        userId: user.id,
        ipAddress: ip,
        details: { reason: 'SUSPENDED_ACCOUNT' },
      });
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: 'تم إيقاف هذا الحساب من قِبل إدارة المنصة. يرجى التواصل مع فريق الدعم الفني.',
            code: 'ACCOUNT_SUSPENDED',
            supportEmail: 'support@leadforge.eg',
          },
          { status: 403 }
        )
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: `تم قفل الحساب مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى المحاولة بعد ${remainingMinutes} دقيقة.`,
            code: 'ACCOUNT_LOCKED',
          },
          { status: 423 }
        )
      );
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      const isLockoutExpired = user.lockedUntil && user.lockedUntil <= new Date();
      const currentAttempts = isLockoutExpired ? 0 : (user.failedLoginAttempts || 0);
      const newAttempts = currentAttempts + 1;
      const shouldLock = currentAttempts >= 5;
      const lockedUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          ...(shouldLock ? { lockedUntil } : isLockoutExpired ? { lockedUntil: null } : {}),
        },
      });

      await recordSecuritySignal({
        signalType: 'REPEATED_AUTH_FAILURES',
        userId: user.id,
        ipAddress: ip,
        details: { reason: 'INVALID_PASSWORD', failedAttempts: newAttempts, locked: shouldLock },
      });

      return applySecurityHeaders(
        NextResponse.json(
          {
            error: shouldLock
              ? 'تم قفل الحساب مؤقتاً لمدة 15 دقيقة بسبب تكرار إدخال كلمة المرور بشكل غير صحيح.'
              : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
            code: shouldLock ? 'ACCOUNT_LOCKED' : 'UNAUTHORIZED',
          },
          { status: shouldLock ? 423 : 401 }
        )
      );
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    try {
      setSessionCookie(token);
    } catch {
      // Ignored in direct test handler calls without Next.js request context
    }

    await createAuditLog(
      {
        userId: user.id,
        action: 'USER_LOGIN',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ip,
      },
      prisma
    );

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });

    response.cookies.set('leadforge_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء تسجيل الدخول.' }, { status: 500 });
  }
}

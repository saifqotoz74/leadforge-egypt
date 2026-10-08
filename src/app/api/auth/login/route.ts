import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady, prisma } from '@/lib/db';
import {
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

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
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
          { error: 'تم إيقاف هذا الحساب من قِبل إدارة المنصة.', code: 'FORBIDDEN' },
          { status: 403 }
        )
      );
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      await recordSecuritySignal({
        signalType: 'REPEATED_AUTH_FAILURES',
        userId: user.id,
        ipAddress: ip,
        details: { reason: 'INVALID_PASSWORD' },
      });
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      );
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

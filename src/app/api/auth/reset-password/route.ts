import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady, prisma } from '@/lib/db';
import {
  hashPassword,
  invalidateUserSessionCache,
  verifyCsrfOrigin,
  verifyPasswordResetToken,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

const resetPasswordSchema = z.object({
  token: z.string().min(10, 'رمز الاستعادة غير صالح'),
  password: z
    .string()
    .min(8, 'يجب أن لا تقل كلمة المرور عن 8 أحرف')
    .regex(/[A-Za-z]/, 'يجب أن تحتوي كلمة المرور على حرف واحد على الأقل')
    .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل'),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const body = await req.json().catch(() => ({}));
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات كلمة المرور غير صالحة.' },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Verify token validity and signature
    const verified = await verifyPasswordResetToken(token);
    if (!verified) {
      return NextResponse.json(
        {
          error: 'رابط استعادة كلمة المرور غير صالح أو انتهت صلاحيته (المدة المحددة 30 دقيقة).',
          code: 'TOKEN_EXPIRED_OR_INVALID',
        },
        { status: 400 }
      );
    }

    // Hash new password and update user
    const newPasswordHash = await hashPassword(password);
    await prisma.user.update({
      where: { id: verified.userId },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
        sessionsRevokedBefore: new Date(),
      },
    });

    // Invalidate cached user session
    invalidateUserSessionCache(verified.userId);

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    });
  } catch (err: any) {
    console.error('[Reset Password Error]:', err);
    return NextResponse.json(
      { error: 'تعذر تغيير كلمة المرور حالياً. يرجى المحاولة لاحقاً.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AuthError,
  hashPassword,
  invalidateUserSessionCache,
  requireAuth,
  verifyCsrfOrigin,
  verifyPassword,
} from '@/lib/auth';
import { ensureDbReady, prisma } from '@/lib/db';
import { createInAppNotification } from '@/lib/notifications';
import { sendSecurityPasswordChangedEmailSafe } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'يرجى إدخال كلمة المرور الحالية.'),
    newPassword: z
      .string()
      .min(8, 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.')
      .regex(/[A-Za-z]/, 'يجب أن تحتوي كلمة المرور على حرف واحد على الأقل.')
      .regex(/[0-9]/, 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.'),
    confirmPassword: z.string().min(1, 'يرجى تأكيد كلمة المرور الجديدة.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين.',
    path: ['confirmPassword'],
  });

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const sessionUser = await requireAuth(req);
    await ensureDbReady();

    const body = await req.json().catch(() => ({}));
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات كلمة المرور غير صالحة.' },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    // Fetch user with password hash
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, email: true, name: true, passwordHash: true, status: true },
    });

    if (!user || user.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'الحساب غير متاح أو معلق.', code: 'USER_UNAVAILABLE' },
        { status: 403 }
      );
    }

    // Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: 'كلمة المرور الحالية غير صحيحة.', code: 'INVALID_CURRENT_PASSWORD' },
        { status: 400 }
      );
    }

    // Ensure new password is not identical to old password
    const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.', code: 'SAME_PASSWORD' },
        { status: 400 }
      );
    }

    // Hash new password and save
    const newPasswordHash = await hashPassword(newPassword);
    const now = new Date();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: now,
      },
    });

    // Invalidate cached user session
    invalidateUserSessionCache(user.id);

    // Create In-App Notification
    await createInAppNotification(
      {
        userId: user.id,
        title: 'تنبيه أمان: تم تغيير كلمة المرور',
        message: 'تم تحديث كلمة المرور الخاصة بحسابك بنجاح. إذا لم تكن أنت من قام بهذا الإجراء، يرجى التواصل مع الدعم الفني.',
        type: 'SYSTEM',
        link: '/settings',
      },
      prisma
    );

    // Send Security Alert Email via Resend
    await sendSecurityPasswordChangedEmailSafe({
      email: user.email,
      name: user.name,
      changedAt: now,
    });

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح وتأمين حسابك.',
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[Change Password Error]:', err);
    return NextResponse.json(
      { error: 'تعذر تغيير كلمة المرور حالياً. يرجى المحاولة لاحقاً.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady, prisma } from '@/lib/db';
import { getClientIp, getCurrentUser, verifyCsrfOrigin } from '@/lib/auth';
import {
  createEmailVerificationToken,
  getResendCooldown,
  sendVerificationEmailSafe,
} from '@/lib/email-verification';

export const dynamic = 'force-dynamic';

const resendSchema = z.object({
  email: z.string().email('صيغة البريد الإلكتروني غير صالحة').optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' }, { status: 403 });
    }

    await ensureDbReady();
    const currentUser = await getCurrentUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = resendSchema.safeParse(body);

    let targetUser: { id: string; email: string; name: string; emailVerified: Date | null; status: string } | null = null;

    if (currentUser) {
      targetUser = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { id: true, email: true, name: true, emailVerified: true, status: true },
      });
    } else if (parsed.success && parsed.data.email) {
      targetUser = await prisma.user.findUnique({
        where: { email: parsed.data.email.toLowerCase().trim() },
        select: { id: true, email: true, name: true, emailVerified: true, status: true },
      });
    }

    // Generic response if user does not exist to prevent account enumeration
    if (!targetUser || targetUser.status === 'SUSPENDED') {
      return NextResponse.json({
        success: true,
        message: 'إذا كان البريد مسجلاً لدينا، فقد تم إرسال رابط تأكيد جديد.',
      });
    }

    if (targetUser.emailVerified) {
      return NextResponse.json({
        success: true,
        alreadyVerified: true,
        message: 'بريدك الإلكتروني مؤكد بالفعل.',
      });
    }

    // Check 60-second cooldown
    const cooldown = await getResendCooldown(targetUser.id);
    if (!cooldown.canResend) {
      return NextResponse.json(
        {
          error: `يرجى الانتظار ${cooldown.retryAfterSeconds} ثانية قبل طلب رابط تأكيد جديد.`,
          code: 'RESEND_COOLDOWN_ACTIVE',
          retryAfterSeconds: cooldown.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    // Generate new token & send email
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || null;
    const { rawToken } = await createEmailVerificationToken(targetUser.id, {
      ipAddress: ip,
      userAgent,
    });

    const origin = req.headers.get('origin') || undefined;
    await sendVerificationEmailSafe({
      email: targetUser.email,
      name: targetUser.name,
      rawToken,
      origin,
    });

    return NextResponse.json({
      success: true,
      message: 'تم إرسال رابط تأكيد جديد إلى بريدك الإلكتروني بنجاح.',
    });
  } catch (err: any) {
    console.error('[Verify Email Request Error]:', err);
    return NextResponse.json(
      { error: 'تعذر إرسال رابط التأكيد حالياً. يرجى المحاولة لاحقاً.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

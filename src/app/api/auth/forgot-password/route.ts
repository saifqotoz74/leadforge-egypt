import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady, prisma } from '@/lib/db';
import { generatePasswordResetToken, verifyCsrfOrigin } from '@/lib/auth';
import { sendPasswordResetEmailSafe } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

const forgotPasswordSchema = z.object({
  email: z.string().email('صيغة البريد الإلكتروني غير صحيحة').transform((v) => v.toLowerCase().trim()),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    await ensureDbReady();
    const body = await req.json().catch(() => ({}));
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'البريد الإلكتروني غير صالح.' },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, status: true },
    });

    if (user && user.status !== 'SUSPENDED') {
      const token = await generatePasswordResetToken(user);
      const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.leads4dev.com').replace(/\/$/, '');
      const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

      await sendPasswordResetEmailSafe({
        email: user.email,
        resetUrl,
      });
    }

    // Always return success to prevent email enumeration attacks
    return NextResponse.json({
      success: true,
      message: 'إذا كان البريد الإلكتروني مسجلاً لدينا، فستتلقى رابط استعادة كلمة المرور خلال دقائق.',
    });
  } catch (err: any) {
    console.error('[Forgot Password Error]:', err);
    return NextResponse.json(
      { error: 'تعذر معالجة طلب استعادة كلمة المرور حالياً.' },
      { status: 500 }
    );
  }
}

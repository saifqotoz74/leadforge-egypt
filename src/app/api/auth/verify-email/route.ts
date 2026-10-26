import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDbReady } from '@/lib/db';
import { verifyEmailToken } from '@/lib/email-verification';
import { verifyCsrfOrigin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const verifyEmailSchema = z.object({
  token: z.string().min(16, 'رمز التأكيد غير صالح أو غير مكتمل'),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).', code: 'FORBIDDEN' }, { status: 403 });
    }

    await ensureDbReady();
    const body = await req.json().catch(() => ({}));
    const parsed = verifyEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'رمز التأكيد غير صالح', code: 'INVALID_TOKEN' },
        { status: 400 }
      );
    }

    const result = await verifyEmailToken(parsed.data.token);

    if (!result.success) {
      const statusCode = result.code === 'TOKEN_ALREADY_USED' ? 409 : 400;
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم تأكيد بريدك الإلكتروني بنجاح! يمكنك الآن اقتناص وفحص جميع الفرص.',
      user: result.user,
    });
  } catch (err: any) {
    console.error('[Verify Email API Error]:', err);
    return NextResponse.json(
      { error: 'تعذر تأكيد البريد الإلكتروني حالياً. يرجى المحاولة لاحقاً.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

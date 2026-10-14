import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { submitTransferPayment } from '@/lib/payment/provider';
import { applySecurityHeaders } from '@/lib/security';

export const dynamic = 'force-dynamic';

const transferSchema = z.object({
  planId: z.string().min(1, 'معرف الباقة مطلوب.'),
  receiptImage: z.string().min(10, 'صورة إيصال التحويل مطلوبة.'),
  senderPhone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 })
      );
    }

    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const parsed = transferSchema.safeParse(body);

    if (!parsed.success) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'بيانات التحويل غير مكتملة.' },
          { status: 400 }
        )
      );
    }

    // Limit image payload to roughly 5MB base64
    if (parsed.data.receiptImage.length > 7_000_000) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'حجم صورة الإيصال كبير جداً. الحد الأقصى المسموح به هو 5 ميجابايت.' },
          { status: 400 }
        )
      );
    }

    const payment = await submitTransferPayment({
      prisma,
      userId: user.id,
      planId: parsed.data.planId,
      receiptImageBase64: parsed.data.receiptImage,
      senderPhone: parsed.data.senderPhone,
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        message: 'تم استلام إيصال التحويل بنجاح، جاري المراجعة والتفعيل فوراً.',
        payment: {
          id: payment.id,
          status: payment.status,
          amountEgp: payment.amountEgp,
          creditsGranted: payment.creditsGranted,
          planName: payment.plan.name,
        },
      })
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json({ error: err.message }, { status: err.statusCode })
      );
    }
    console.error('POST /api/subscription/transfer error:', err);
    return applySecurityHeaders(
      NextResponse.json({ error: err?.message || 'تعذر إرسال إيصال التحويل.' }, { status: 500 })
    );
  }
}

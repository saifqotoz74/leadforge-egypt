import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rejectTransferPayment } from '@/lib/payment/provider';
import { applySecurityHeaders } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 })
      );
    }

    const admin = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim()
      : 'إيصال التحويل غير صالح أو لم يتم تأكيده في الحساب البنكي.';

    const payment = await rejectTransferPayment({
      prisma,
      paymentId: params.id,
      adminId: admin.id,
      reason,
    });

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        message: 'تم رفض المعاملة ومسح صورة الإيصال بنجاح.',
        payment: {
          id: payment.id,
          status: payment.status,
        },
      })
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json({ error: err.message }, { status: err.statusCode })
      );
    }
    console.error('POST /api/admin/payments/[id]/reject error:', err);
    return applySecurityHeaders(
      NextResponse.json({ error: err?.message || 'تعذر رفض المعاملة.' }, { status: 500 })
    );
  }
}

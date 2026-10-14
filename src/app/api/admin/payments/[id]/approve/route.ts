import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { approveTransferPayment } from '@/lib/payment/provider';
import { applySecurityHeaders } from '@/lib/security';
import { invalidateAndRecalculateDeveloperMatches } from '@/lib/matching/service';
import { globalAppCache } from '@/lib/observability/cache';

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

    const result = await approveTransferPayment({
      prisma,
      paymentId: params.id,
      adminId: admin.id,
    });

    globalAppCache.invalidateNamespace('plans');
    await invalidateAndRecalculateDeveloperMatches(result.payment.userId).catch(() => {});

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        message: 'تمت الموافقة وتفعيل الباقة وإضافة النقاط بنجاح، وتم مسح صورة الإيصال لحماية الخصوصية.',
        payment: {
          id: result.payment.id,
          status: result.payment.status,
          planName: result.payment.plan.name,
        },
      })
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json({ error: err.message }, { status: err.statusCode })
      );
    }
    console.error('POST /api/admin/payments/[id]/approve error:', err);
    return applySecurityHeaders(
      NextResponse.json({ error: err?.message || 'تعذر تأكيد الدفع.' }, { status: 500 })
    );
  }
}

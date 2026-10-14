import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applySecurityHeaders } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [pendingPayments, recentPayments, totalPendingCount] = await Promise.all([
      prisma.payment.findMany({
        where: { status: 'PENDING' },
        include: {
          plan: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.findMany({
        where: { status: { in: ['COMPLETED', 'REJECTED'] } },
        include: {
          plan: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
    ]);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        totalPendingCount,
        pendingPayments,
        recentPayments,
      })
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json({ error: err.message }, { status: err.statusCode })
      );
    }
    console.error('GET /api/admin/payments error:', err);
    return applySecurityHeaders(
      NextResponse.json({ error: 'تعذر جلب سجلات المدفوعات.' }, { status: 500 })
    );
  }
}

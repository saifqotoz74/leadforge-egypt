import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rejectAdminDuplicateCandidate } from '@/lib/deduplication';
import { createAuditLog } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const candidateId = params.id;
    const body = await req.json().catch(() => ({}));

    const rejectAction =
      String(body.action || '').toUpperCase() === 'MARK_INVALID'
        ? 'MARK_INVALID'
        : 'KEEP_SEPARATE';

    const result = await rejectAdminDuplicateCandidate({
      prisma,
      adminUserId: admin.id,
      candidateId,
      action: rejectAction,
      notes: body.notes,
    });

    await createAuditLog(
      {
        userId: admin.id,
        action:
          rejectAction === 'MARK_INVALID'
            ? 'ADMIN_DUPLICATE_MARKED_INVALID'
            : 'ADMIN_DUPLICATE_KEPT_SEPARATE',
        entityType: 'DuplicateCandidate',
        entityId: candidateId,
        details: {
          createdSeparateLeadId: result.createdSeparateLead?.id || null,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      candidate: result.candidate,
      createdSeparateLead: result.createdSeparateLead,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'تعذر رفض التكرار.' }, { status: 500 });
  }
}

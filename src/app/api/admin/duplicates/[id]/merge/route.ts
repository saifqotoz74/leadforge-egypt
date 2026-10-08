import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { confirmAdminDuplicateMerge } from '@/lib/deduplication';
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

    const result = await confirmAdminDuplicateMerge({
      prisma,
      adminUserId: admin.id,
      candidateId,
      preferredFields: body.preferredFields,
      notes: body.notes,
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_DUPLICATE_MERGE_CONFIRMED',
        entityType: 'DuplicateCandidate',
        entityId: candidateId,
        details: {
          mergeId: result.mergeResult.mergeId,
          targetLeadId: result.mergeResult.lead.id,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      candidate: result.candidate,
      mergeResult: result.mergeResult,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'تعذر تأكيد دمج السجل.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unmergeLead, MergeServiceError } from '@/lib/deduplication';
import { createAuditLog } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();
    const mergeId = String(body.mergeId || '');

    if (!mergeId) {
      return NextResponse.json(
        { error: 'معرف عملية الدمج (mergeId) مطلوب للتراجع.' },
        { status: 400 }
      );
    }

    const result = await unmergeLead({
      prisma,
      mergeId,
      performedBy: admin.id,
      reason: body.reason,
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_LEAD_UNMERGED',
        entityType: 'LeadMergeHistory',
        entityId: mergeId,
        details: {
          targetLeadId: result.targetLead.id,
          restoredLeadId: result.restoredLead?.id || null,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof MergeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'تعذر التراجع عن عملية الدمج.' },
      { status: 500 }
    );
  }
}

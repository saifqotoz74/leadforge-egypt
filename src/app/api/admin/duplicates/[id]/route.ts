import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getDuplicateCandidateEvidence,
  confirmAdminDuplicateMerge,
  rejectAdminDuplicateCandidate,
  MergeServiceError,
} from '@/lib/deduplication';
import { createAuditLog } from '@/lib/audit';
import { getSafeClientErrorMessage } from '@/lib/security/error-taxonomy';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(req);
    const candidateId = params.id;

    const evidence = await getDuplicateCandidateEvidence(prisma, candidateId);
    if (!evidence) {
      return NextResponse.json(
        { error: 'طلب المراجعة غير موجود.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      candidate: evidence,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: 'تعذر جلب تفاصيل المقارنة وأدلة التكرار.' },
      { status: 500 }
    );
  }
}

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
    const body = await req.json();
    const action = String(body.action || 'CONFIRM_MERGE').toUpperCase();

    if (action === 'CONFIRM_MERGE' || action === 'MERGE') {
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
    }

    if (
      action === 'REJECT_DUPLICATE' ||
      action === 'KEEP_SEPARATE' ||
      action === 'MARK_INVALID'
    ) {
      const rejectAction =
        action === 'MARK_INVALID' ? 'MARK_INVALID' : 'KEEP_SEPARATE';
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
    }

    return NextResponse.json(
      { error: 'الإجراء المطلوب غير مدعوم.' },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof MergeServiceError) {
      return NextResponse.json(
        { error: getSafeClientErrorMessage(err, 'تعذر معالجة طلب مراجعة التكرار.'), code: err.code },
        { status: err.statusCode }
      );
    }
    if (err instanceof Error) {
      return NextResponse.json(
        { error: getSafeClientErrorMessage(err, 'تعذر معالجة طلب مراجعة التكرار.') },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'تعذر معالجة طلب مراجعة التكرار.' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  getAdminDuplicateCandidates,
  getAdminMergeHistory,
  confirmAdminDuplicateMerge,
  rejectAdminDuplicateCandidate,
  compareTwoLeadsEvidence,
  unmergeLead,
  MergeServiceError,
  getRecentDeduplicationLogs,
  getRecentMergeLogs,
} from '@/lib/deduplication';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || 'ALL') as
      | 'PENDING'
      | 'CONFIRMED_MERGED'
      | 'KEPT_SEPARATE'
      | 'MARKED_INVALID'
      | 'RESOLVED'
      | 'ALL';
    const decision = (searchParams.get('decision') || 'ALL') as
      | 'POSSIBLE_DUPLICATE'
      | 'CONFLICT'
      | 'DUPLICATE_CONFIRMED'
      | 'ALL';
    const includeHistory = searchParams.get('includeHistory') !== 'false';
    const includeLogs = searchParams.get('includeLogs') === 'true';

    const [reviewData, mergeHistory, pendingCount, conflictCount, totalMerges, totalSourceRecords] =
      await Promise.all([
        getAdminDuplicateCandidates(prisma, { status, decision }),
        includeHistory ? getAdminMergeHistory(prisma, { limit: 50 }) : Promise.resolve([]),
        prisma.duplicateCandidate.count({ where: { status: 'PENDING' } }),
        prisma.duplicateCandidate.count({
          where: { status: 'PENDING', decision: 'CONFLICT' },
        }),
        prisma.leadMergeHistory.count({ where: { isReverted: false } }),
        prisma.sourceRecord.count(),
      ]);

    return NextResponse.json({
      stats: {
        pendingCandidates: pendingCount,
        pendingConflicts: conflictCount,
        totalActiveMerges: totalMerges,
        totalSourceRecords,
      },
      candidates: reviewData.candidates,
      possibleDuplicates: reviewData.possibleDuplicates,
      conflicts: reviewData.conflicts,
      mergeHistory,
      ...(includeLogs
        ? {
            recentDedupLogs: getRecentDeduplicationLogs(50),
            recentMergeLogs: getRecentMergeLogs(50),
          }
        : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/duplicates error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب قائمة التكرارات المحتملة وسجل الدمج.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();
    const action = String(body.action || '').toUpperCase();

    if (action === 'COMPARE_LEADS') {
      const leadAId = String(body.leadAId || '');
      const leadBId = String(body.leadBId || '');
      if (!leadAId || !leadBId) {
        return NextResponse.json(
          { error: 'معرفا السجلين (leadAId, leadBId) مطلوبان للمقارنة.' },
          { status: 400 }
        );
      }
      const comparison = await compareTwoLeadsEvidence(prisma, leadAId, leadBId);
      if (!comparison) {
        return NextResponse.json({ error: 'تعذر العثور على أحد السجلين.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, comparison });
    }

    if (action === 'CONFIRM_MERGE' || action === 'MERGE') {
      const result = await confirmAdminDuplicateMerge({
        prisma,
        adminUserId: admin.id,
        candidateId: body.candidateId,
        targetLeadId: body.targetLeadId,
        sourceLeadId: body.sourceLeadId,
        sourceRecordId: body.sourceRecordId,
        preferredFields: body.preferredFields,
        notes: body.notes,
      });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_DUPLICATE_MERGE_CONFIRMED',
          entityType: 'LeadMergeHistory',
          entityId: result.mergeResult.mergeId,
          details: {
            candidateId: body.candidateId,
            targetLeadId: result.mergeResult.lead.id,
            enrichedFields: result.mergeResult.fieldChanges.enrichedFields,
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
      const candidateId = String(body.candidateId || '');
      if (!candidateId) {
        return NextResponse.json(
          { error: 'معرف طلب المراجعة (candidateId) مطلوب.' },
          { status: 400 }
        );
      }

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

    if (action === 'UNMERGE') {
      const mergeId = String(body.mergeId || '');
      if (!mergeId) {
        return NextResponse.json(
          { error: 'معرف عملية الدمج (mergeId) مطلوب للتراجع.' },
          { status: 400 }
        );
      }

      const unmergeResult = await unmergeLead({
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
            targetLeadId: unmergeResult.targetLead.id,
            restoredLeadId: unmergeResult.restoredLead?.id || null,
          },
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        ...unmergeResult,
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
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'تعذر تنفيذ عملية مراجعة التكرار.' },
      { status: 500 }
    );
  }
}

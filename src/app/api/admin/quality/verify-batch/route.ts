import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { verifyLeadsBatch } from '@/lib/quality';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);

    const rl = checkRateLimit({
      key: `admin-verify-batch:${admin.id}`,
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح به لعمليات التحقق المجمعة. يرجى الانتظار قليلاً.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const batchSize =
      typeof body.batchSize === 'number'
        ? Math.max(1, Math.min(body.batchSize, 50))
        : 20;
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds : undefined;
    const freshnessFilter = Array.isArray(body.freshnessFilter)
      ? body.freshnessFilter
      : undefined;

    const batchResult = await verifyLeadsBatch({
      batchSize,
      leadIds,
      freshnessFilter,
      source: `ADMIN_BATCH:${admin.id}`,
    });

    await createAuditLog({
      userId: admin.id,
      action: 'ADMIN_BATCH_VERIFICATION_EXECUTED',
      entityType: 'LeadVerification',
      details: {
        processedCount: batchResult.processedCount,
        verifiedCount: batchResult.verifiedCount,
        partiallyVerifiedCount: batchResult.partiallyVerifiedCount,
        failedCount: batchResult.failedCount,
        durationMs: batchResult.durationMs,
      },
    });

    return NextResponse.json({
      message: `تم التحقق من ${batchResult.processedCount} فرصة بنجاح.`,
      ...batchResult,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/admin/quality/verify-batch error:', err);
    return NextResponse.json(
      { error: 'تعذر تنفيذ عملية التحقق المجمعة.' },
      { status: 500 }
    );
  }
}

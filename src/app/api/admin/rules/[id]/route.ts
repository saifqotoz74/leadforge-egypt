import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  logScoringOperation,
  recalculateManyLeadScores,
  syncScoringVersion,
  validateScoringRulePayload,
} from '@/lib/scoring-engine';
import { createAuditLog } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const ruleId = params.id;
    const body = await req.json();

    const existing = await prisma.scoringRule.findUnique({ where: { id: ruleId } });
    if (!existing) {
      return NextResponse.json({ error: 'القاعدة غير موجودة.' }, { status: 404 });
    }

    const validation = validateScoringRulePayload(body, {
      id: existing.id,
      code: existing.code,
      key: existing.key || existing.code,
      name: existing.name,
      nameEn: existing.nameEn,
      description: existing.description,
      category: existing.category,
      ruleGroup: existing.ruleGroup,
      weight: existing.weight,
      points: existing.points || existing.weight,
      priority: existing.priority || existing.sortOrder,
      sortOrder: existing.sortOrder,
      enabled: existing.enabled,
      field: existing.field,
      operator: existing.operator,
      targetValue: existing.targetValue,
      conditions: (existing.conditions as Record<string, unknown>) || {},
      version: existing.version || 'v1',
    });

    if (!validation.valid || !validation.normalized) {
      return NextResponse.json(
        {
          error: validation.errors[0] || 'بيانات تحديث القاعدة غير صالحة.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const norm = validation.normalized;

    if (body.version) {
      await syncScoringVersion(prisma, norm.version);
    }

    const updated = await prisma.scoringRule.update({
      where: { id: ruleId },
      data: {
        name: norm.name,
        nameEn: norm.nameEn,
        description: norm.description,
        category: norm.category,
        ruleGroup: norm.ruleGroup,
        weight: norm.weight,
        points: norm.points,
        priority: norm.priority,
        enabled: norm.enabled,
        field: norm.field,
        operator: norm.operator,
        targetValue: norm.targetValue,
        conditions: norm.conditions as unknown as object,
        version: norm.version,
        sortOrder: norm.sortOrder,
      },
    });

    logScoringOperation({
      event: 'SCORING_RULE_MUTATED',
      scoringVersion: updated.version,
      rulesApplied: [updated.key || updated.code],
    });

    await recalculateManyLeadScores(
      prisma,
      {},
      {
        scoringVersion: body.version ? String(body.version).trim() : undefined,
        trigger: 'ADMIN_RECALCULATION',
      }
    );

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_SCORING_RULE_UPDATED',
        entityType: 'ScoringRule',
        entityId: ruleId,
        details: body,
      },
      prisma
    );

    return NextResponse.json({ success: true, rule: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('PATCH /api/admin/rules/[id] error:', err);
    return NextResponse.json({ error: 'تعذر تحديث القاعدة.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const ruleId = params.id;
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode');

    const existing = await prisma.scoringRule.findUnique({ where: { id: ruleId } });
    if (!existing) {
      return NextResponse.json({ error: 'القاعدة غير موجودة.' }, { status: 404 });
    }

    if (mode === 'disable') {
      const disabledRule = await prisma.scoringRule.update({
        where: { id: ruleId },
        data: { enabled: false },
      });
      logScoringOperation({
        event: 'SCORING_RULE_MUTATED',
        scoringVersion: disabledRule.version,
        rulesApplied: [disabledRule.key || disabledRule.code],
      });
      await recalculateManyLeadScores(prisma, {}, { trigger: 'ADMIN_RECALCULATION' });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_SCORING_RULE_DISABLED',
          entityType: 'ScoringRule',
          entityId: ruleId,
        },
        prisma
      );

      return NextResponse.json({ success: true, rule: disabledRule });
    }

    await prisma.scoringRule.delete({ where: { id: ruleId } });
    logScoringOperation({
      event: 'SCORING_RULE_MUTATED',
      scoringVersion: existing.version,
      rulesApplied: [existing.key || existing.code],
    });
    await recalculateManyLeadScores(prisma, {}, { trigger: 'ADMIN_RECALCULATION' });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_SCORING_RULE_DELETED',
        entityType: 'ScoringRule',
        entityId: ruleId,
      },
      prisma
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر حذف القاعدة.' }, { status: 500 });
  }
}

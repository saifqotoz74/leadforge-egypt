import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  bumpScoringVersion,
  CANONICAL_OPERATORS,
  ALLOWED_SCORABLE_FIELDS,
  loadScoringContext,
  logScoringOperation,
  normalizeRuleDefinition,
  recalculateManyLeadScores,
  syncScoringVersion,
  validateScoringRulePayload,
} from '@/lib/scoring-engine';
import { DEFAULT_FRESHNESS_THRESHOLDS } from '@/lib/freshness';
import { createAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [rules, freshness, context, versionStats] = await Promise.all([
      prisma.scoringRule.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.freshnessConfig.findUnique({ where: { id: 'default' } }),
      loadScoringContext(prisma),
      prisma.leadScore.groupBy({
        by: ['scoringVersion'],
        _count: { id: true },
      }),
    ]);

    const normalizedRules = rules.map((r) => ({
      ...r,
      ...normalizeRuleDefinition({
        id: r.id,
        code: r.code,
        key: r.key || r.code,
        name: r.name,
        nameEn: r.nameEn,
        description: r.description,
        category: r.category,
        ruleGroup: r.ruleGroup,
        weight: r.weight,
        points: r.points || r.weight,
        priority: r.priority || r.sortOrder,
        sortOrder: r.sortOrder,
        enabled: r.enabled,
        field: r.field,
        operator: r.operator,
        targetValue: r.targetValue,
        conditions: (r.conditions as Record<string, unknown>) || {},
        version: r.version || context.scoringVersion,
      }),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({
      rules: normalizedRules,
      scoringVersion: context.scoringVersion,
      classificationThresholds: context.thresholds,
      supportedOperators: CANONICAL_OPERATORS,
      supportedFields: Array.from(ALLOWED_SCORABLE_FIELDS),
      versionHistory: versionStats.map((v) => ({
        version: v.scoringVersion,
        snapshotsCount: v._count.id,
      })),
      freshnessConfig: freshness || DEFAULT_FRESHNESS_THRESHOLDS,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب قواعد التقييم.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const body = await req.json();

    if (body.action === 'RECALCULATE_ALL' || body.action === 'BULK_RECALCULATE') {
      const report = await recalculateManyLeadScores(
        prisma,
        body.filters || {},
        {
          batchSize: body.batchSize ? Number(body.batchSize) : 50,
          scoringVersion:
            typeof body.scoringVersion === 'string' && body.scoringVersion.trim()
              ? body.scoringVersion.trim()
              : undefined,
          trigger: 'ADMIN_RECALCULATION',
        }
      );
      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_SCORES_RECALCULATED',
          entityType: 'ScoringRule',
          details: {
            updatedCount: report.totalProcessed,
            changedCount: report.changedCount,
            scoringVersion: report.scoringVersion,
            durationMs: report.durationMs,
          },
        },
        prisma
      );
      return NextResponse.json({
        success: true,
        updatedCount: report.totalProcessed,
        scoringVersion: report.scoringVersion,
        report,
      });
    }

    if (body.action === 'BUMP_VERSION') {
      const bumped = await bumpScoringVersion(prisma, body.version ? String(body.version) : undefined);
      await prisma.scoringRule.updateMany({
        data: { version: bumped.currentVersion },
      });
      const report = await recalculateManyLeadScores(
        prisma,
        {},
        {
          scoringVersion: bumped.currentVersion,
          trigger: 'ADMIN_RECALCULATION',
        }
      );

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_SCORING_VERSION_BUMPED',
          entityType: 'ScoringConfig',
          entityId: 'default',
          details: { newVersion: bumped.currentVersion, report },
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        scoringVersion: bumped.currentVersion,
        report,
      });
    }

    if (body.action === 'UPDATE_CLASSIFICATION') {
      const warmMin = Math.max(1, Math.min(97, Number(body.warmMin) || 50));
      const hotMin = Math.max(warmMin + 1, Math.min(98, Number(body.hotMin) || 70));
      const premiumMin = Math.max(hotMin + 1, Math.min(99, Number(body.premiumMin) || 85));
      const coldMax = warmMin - 1;
      const warmMax = hotMin - 1;
      const hotMax = premiumMin - 1;

      const config = await prisma.scoringConfig.upsert({
        where: { id: 'default' },
        update: { coldMax, warmMin, warmMax, hotMin, hotMax, premiumMin },
        create: {
          id: 'default',
          currentVersion: 'v1',
          versionNumber: 1,
          coldMax,
          warmMin,
          warmMax,
          hotMin,
          hotMax,
          premiumMin,
        },
      });

      const report = await recalculateManyLeadScores(
        prisma,
        {},
        { trigger: 'ADMIN_RECALCULATION' }
      );

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_CLASSIFICATION_THRESHOLDS_UPDATED',
          entityType: 'ScoringConfig',
          entityId: 'default',
          details: { coldMax, warmMin, warmMax, hotMin, hotMax, premiumMin },
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        classificationThresholds: config,
        report,
      });
    }

    if (body.action === 'UPDATE_FRESHNESS') {
      const freshMaxDays = Math.max(1, Number(body.freshMaxDays) || 7);
      const recentMaxDays = Math.max(freshMaxDays + 1, Number(body.recentMaxDays) || 30);
      const needsVerifyMaxDays = Math.max(
        recentMaxDays + 1,
        Number(body.needsVerifyMaxDays) || 90
      );

      const config = await prisma.freshnessConfig.upsert({
        where: { id: 'default' },
        update: { freshMaxDays, recentMaxDays, needsVerifyMaxDays },
        create: { id: 'default', freshMaxDays, recentMaxDays, needsVerifyMaxDays },
      });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_FRESHNESS_CONFIG_UPDATED',
          entityType: 'FreshnessConfig',
          entityId: 'default',
          details: { freshMaxDays, recentMaxDays, needsVerifyMaxDays },
        },
        prisma
      );

      return NextResponse.json({ success: true, freshnessConfig: config });
    }

    const validation = validateScoringRulePayload(body);
    if (!validation.valid || !validation.normalized) {
      return NextResponse.json(
        {
          error: validation.errors[0] || 'بيانات القاعدة غير صالحة.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const data = validation.normalized;
    const duplicate = await prisma.scoringRule.findFirst({
      where: {
        OR: [{ code: data.code }, { key: data.key }],
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `توجد قاعدة بنفس المفتاح (${data.key}) بالفعل.` },
        { status: 409 }
      );
    }

    const context = await loadScoringContext(prisma);
    const targetVersion = body.version
      ? String(body.version).trim()
      : context.scoringVersion;

    if (body.version) {
      await syncScoringVersion(prisma, targetVersion);
    }

    const rule = await prisma.scoringRule.create({
      data: {
        code: data.code,
        key: data.key,
        name: data.name,
        nameEn: data.nameEn,
        description: data.description,
        category: data.category,
        ruleGroup: data.ruleGroup,
        weight: data.weight,
        points: data.points,
        priority: data.priority,
        enabled: data.enabled,
        field: data.field,
        operator: data.operator,
        targetValue: data.targetValue,
        conditions: data.conditions as unknown as object,
        version: targetVersion,
        sortOrder: data.sortOrder,
      },
    });

    logScoringOperation({
      event: 'SCORING_RULE_MUTATED',
      scoringVersion: targetVersion,
      rulesApplied: [rule.key || rule.code],
    });

    await recalculateManyLeadScores(
      prisma,
      {},
      {
        scoringVersion: body.version ? targetVersion : undefined,
        trigger: 'ADMIN_RECALCULATION',
      }
    );

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_SCORING_RULE_CREATED',
        entityType: 'ScoringRule',
        entityId: rule.id,
        details: { key: rule.key || rule.code, points: rule.weight, version: rule.version },
      },
      prisma
    );

    return NextResponse.json({ success: true, rule }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('POST /api/admin/rules error:', err);
    return NextResponse.json({ error: 'تعذر إضافة القاعدة.' }, { status: 500 });
  }
}

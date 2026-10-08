import { NextRequest, NextResponse } from 'next/server';
import {
  MatchingRuleCategory,
  Prisma,
  RequiresVerificationMatchPolicy,
  ServiceMatchMode,
  UnknownDataPolicy,
} from '@prisma/client';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  bumpMatchingVersion,
  getActiveMatchingConfigAndRules,
} from '@/lib/matching/service';
import {
  VALID_MATCHING_CATEGORIES,
  VALID_MATCHING_OPERATORS,
  validateMatchingRulePayload,
} from '@/lib/matching/rules';
import { getRecentMatchingLogs } from '@/lib/matching/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const [{ config, rules }, snapshotStats] = await Promise.all([
      getActiveMatchingConfigAndRules(),
      prisma.matchSnapshot.groupBy({
        by: ['eligible'],
        _count: { id: true },
      }),
    ]);

    const eligibleSnapshots =
      snapshotStats.find((s) => s.eligible)?._count.id ?? 0;
    const rejectedSnapshots =
      snapshotStats.find((s) => !s.eligible)?._count.id ?? 0;

    return NextResponse.json({
      rules,
      config,
      matchVersion: config.currentVersion,
      supportedCategories: VALID_MATCHING_CATEGORIES,
      supportedOperators: VALID_MATCHING_OPERATORS,
      snapshotStats: {
        total: eligibleSnapshots + rejectedSnapshots,
        eligible: eligibleSnapshots,
        rejected: rejectedSnapshots,
      },
      recentLogs: getRecentMatchingLogs(25),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('GET /api/admin/matching/rules error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب قواعد المطابقة.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).' },
        { status: 403 }
      );
    }

    const admin = await requireAdmin(req);
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'صيغة البيانات غير صالحة.' },
        { status: 400 }
      );
    }

    // Support updating MatchingConfig policy settings via action === 'UPDATE_CONFIG'
    if (body.action === 'UPDATE_CONFIG') {
      const updateData: Prisma.MatchingConfigUpdateInput = {};
      if (
        body.serviceMatchMode === 'ALL_REQUIRED' ||
        body.serviceMatchMode === 'ANY_REQUIRED'
      ) {
        updateData.serviceMatchMode = body.serviceMatchMode as ServiceMatchMode;
      }
      if (
        body.unknownLocationPolicy === 'ALLOW_WITH_PENALTY' ||
        body.unknownLocationPolicy === 'REQUIRE_VERIFICATION' ||
        body.unknownLocationPolicy === 'FAIL'
      ) {
        updateData.unknownLocationPolicy =
          body.unknownLocationPolicy as UnknownDataPolicy;
      }
      if (
        body.unknownBudgetPolicy === 'ALLOW_WITH_PENALTY' ||
        body.unknownBudgetPolicy === 'REQUIRE_VERIFICATION' ||
        body.unknownBudgetPolicy === 'FAIL'
      ) {
        updateData.unknownBudgetPolicy =
          body.unknownBudgetPolicy as UnknownDataPolicy;
      }
      if (
        body.requiresVerificationPolicy === 'EXCLUDE' ||
        body.requiresVerificationPolicy === 'VERIFIED_DEVELOPERS_ONLY' ||
        body.requiresVerificationPolicy === 'INCLUDE_WITH_WARNING'
      ) {
        updateData.requiresVerificationPolicy =
          body.requiresVerificationPolicy as RequiresVerificationMatchPolicy;
      }
      if (typeof body.budgetHardRequirement === 'boolean') {
        updateData.budgetHardRequirement = body.budgetHardRequirement;
      }
      if (typeof body.requireActiveSubscription === 'boolean') {
        updateData.requireActiveSubscription = body.requireActiveSubscription;
      }
      if (typeof body.requireDeveloperVerified === 'boolean') {
        updateData.requireDeveloperVerified = body.requireDeveloperVerified;
      }

      const newVersion = await bumpMatchingVersion();
      const updatedConfig = await prisma.matchingConfig.update({
        where: { id: 'default' },
        data: updateData,
      });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_MATCHING_CONFIG_UPDATED',
          entityType: 'MatchingConfig',
          entityId: 'default',
          details: { ...updateData, matchVersion: newVersion },
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        config: updatedConfig,
        matchVersion: newVersion,
      });
    }

    const validation = validateMatchingRulePayload(body, false);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.errors[0] || 'بيانات قاعدة المطابقة غير صالحة.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const key = String(body.key).trim().toUpperCase();
    const existing = await prisma.matchingRule.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { error: `توجد قاعدة مطابقة بنفس المفتاح (${key}) بالفعل.` },
        { status: 409 }
      );
    }

    const newVersion = await bumpMatchingVersion();

    const created = await prisma.matchingRule.create({
      data: {
        key,
        name: String(body.name).trim(),
        nameEn: body.nameEn
          ? String(body.nameEn).trim()
          : String(body.name).trim(),
        description: body.description ? String(body.description).trim() : null,
        category: String(
          body.category
        ).toUpperCase() as MatchingRuleCategory,
        ruleGroup: body.ruleGroup ? String(body.ruleGroup).trim() : null,
        points: Math.round(Number(body.points)),
        priority:
          body.priority !== undefined ? Math.round(Number(body.priority)) : 100,
        enabled: body.enabled !== false,
        version: newVersion,
        condition: body.condition as Prisma.InputJsonValue,
      },
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_MATCHING_RULE_CREATED',
        entityType: 'MatchingRule',
        entityId: created.id,
        details: {
          key: created.key,
          points: created.points,
          category: created.category,
          matchVersion: newVersion,
        },
      },
      prisma
    );

    return NextResponse.json(
      {
        success: true,
        rule: created,
        matchVersion: newVersion,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/admin/matching/rules error:', err);
    return NextResponse.json(
      { error: 'تعذر إنشاء قاعدة المطابقة.' },
      { status: 500 }
    );
  }
}

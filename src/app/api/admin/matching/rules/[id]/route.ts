import { NextRequest, NextResponse } from 'next/server';
import { MatchingRuleCategory, Prisma } from '@prisma/client';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import {
  bumpMatchingVersion,
  ensureMatchingRulesSeeded,
} from '@/lib/matching/service';
import { validateMatchingRulePayload } from '@/lib/matching/rules';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).' },
        { status: 403 }
      );
    }

    const admin = await requireAdmin(req);
    await ensureMatchingRulesSeeded();

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'صيغة البيانات غير صالحة.' },
        { status: 400 }
      );
    }

    const validation = validateMatchingRulePayload(body, true);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.errors[0] || 'بيانات التحديث غير صالحة.',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    const target = await prisma.matchingRule.findFirst({
      where: {
        OR: [{ id: params.id }, { key: params.id }],
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: 'قاعدة المطابقة غير موجودة.' },
        { status: 404 }
      );
    }

    const newVersion = await bumpMatchingVersion();

    const updateData: Prisma.MatchingRuleUpdateInput = {
      version: newVersion,
    };

    if (typeof body.name === 'string' && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (typeof body.nameEn === 'string' && body.nameEn.trim()) {
      updateData.nameEn = body.nameEn.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description
        ? String(body.description).trim()
        : null;
    }
    if (typeof body.category === 'string' && body.category.trim()) {
      updateData.category = body.category
        .trim()
        .toUpperCase() as MatchingRuleCategory;
    }
    if (body.ruleGroup !== undefined) {
      updateData.ruleGroup = body.ruleGroup
        ? String(body.ruleGroup).trim()
        : null;
    }
    if (body.points !== undefined) {
      updateData.points = Math.round(Number(body.points));
    }
    if (body.priority !== undefined) {
      updateData.priority = Math.round(Number(body.priority));
    }
    if (typeof body.enabled === 'boolean') {
      updateData.enabled = body.enabled;
    }
    if (body.condition !== undefined && typeof body.condition === 'object') {
      updateData.condition = body.condition as Prisma.InputJsonValue;
    }

    const updated = await prisma.matchingRule.update({
      where: { id: target.id },
      data: updateData,
    });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_MATCHING_RULE_UPDATED',
        entityType: 'MatchingRule',
        entityId: updated.id,
        details: {
          key: updated.key,
          points: updated.points,
          enabled: updated.enabled,
          matchVersion: newVersion,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      rule: updated,
      matchVersion: newVersion,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('PATCH /api/admin/matching/rules/[id] error:', err);
    return NextResponse.json(
      { error: 'تعذر تحديث قاعدة المطابقة.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).' },
        { status: 403 }
      );
    }

    const admin = await requireAdmin(req);
    await ensureMatchingRulesSeeded();

    const target = await prisma.matchingRule.findFirst({
      where: {
        OR: [{ id: params.id }, { key: params.id }],
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: 'قاعدة المطابقة غير موجودة.' },
        { status: 404 }
      );
    }

    await prisma.matchingRule.delete({
      where: { id: target.id },
    });

    const newVersion = await bumpMatchingVersion();

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_MATCHING_RULE_DELETED',
        entityType: 'MatchingRule',
        entityId: target.id,
        details: {
          key: target.key,
          matchVersion: newVersion,
        },
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      deletedId: target.id,
      deletedKey: target.key,
      matchVersion: newVersion,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('DELETE /api/admin/matching/rules/[id] error:', err);
    return NextResponse.json(
      { error: 'تعذر حذف قاعدة المطابقة.' },
      { status: 500 }
    );
  }
}

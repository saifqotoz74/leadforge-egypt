import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  evaluateMatch,
  generateAdminMatchDebugReport,
  rankDevelopersForLead,
  rankLeadsForDeveloper,
} from '@/lib/matching/engine';
import {
  getActiveMatchingConfigAndRules,
  mapDbDeveloperToContext,
  mapDbLeadToMatchable,
} from '@/lib/matching/service';
import {
  DeveloperMatchingContext,
  MatchableLeadInput,
  MatchingConfigData,
} from '@/lib/matching/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: 'طلب غير مصرح به (CSRF).' },
        { status: 403 }
      );
    }

    const user = await requireAuth(req);
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'صيغة البيانات المرسلة غير صالحة.' },
        { status: 400 }
      );
    }

    const { config: dbConfig, rules: dbRules } =
      await getActiveMatchingConfigAndRules();

    if (body.config && typeof body.config === 'object' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح لغير مدير النظام بتجاوز إعدادات محرك المطابقة (MatchingConfig).' },
        { status: 403 }
      );
    }

    const customConfig: MatchingConfigData =
      user.role === 'ADMIN' && body.config && typeof body.config === 'object'
        ? { ...dbConfig, ...(body.config as Partial<MatchingConfigData>) }
        : dbConfig;

    const nowIso = new Date().toISOString();

    // Case 1: Both lead (or leadId) AND developer (or developerId / profile) provided -> Pair Preview
    const hasLead = Boolean(body.lead || body.leadId);
    const hasDeveloper = Boolean(
      body.developer || body.developerId || body.profile
    );

    if (hasLead && hasDeveloper) {
      let targetLead: MatchableLeadInput | null = null;
      if (body.lead && typeof body.lead === 'object') {
        targetLead = {
          id: 'preview-lead',
          category: 'OTHER',
          governorate: 'القاهرة',
          city: 'القاهرة',
          ...(body.lead as Partial<MatchableLeadInput>),
        };
      } else if (typeof body.leadId === 'string') {
        const dbLead = await prisma.lead.findUnique({
          where: { id: body.leadId },
          include: { claims: { select: { userId: true } } },
        });
        if (!dbLead || (user.role !== 'ADMIN' && !dbLead.isCanonical)) {
          return NextResponse.json(
            { error: 'العميل المحتمل غير موجود.' },
            { status: 404 }
          );
        }
        targetLead = mapDbLeadToMatchable(
          dbLead as unknown as Record<string, unknown>
        );
      }

      let targetDev: DeveloperMatchingContext | null = null;
      if (body.developer && typeof body.developer === 'object') {
        targetDev = body.developer as DeveloperMatchingContext;
      } else if (body.profile && typeof body.profile === 'object') {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            subscription: { include: { plan: true } },
            _count: {
              select: {
                claims: {
                  where: {
                    pipelineStatus: {
                      in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'],
                    },
                  },
                },
              },
            },
          },
        });
        const baseContext = dbUser
          ? mapDbDeveloperToContext(
              dbUser as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
            )
          : { developerId: user.id, name: user.name };
        targetDev = {
          ...baseContext,
          developerId: user.id,
          name: user.name,
          profile: body.profile as DeveloperMatchingContext['profile'],
        };
      } else if (typeof body.developerId === 'string') {
        const targetId =
          body.developerId === 'me' ? user.id : body.developerId;
        if (user.role !== 'ADMIN' && targetId !== user.id) {
          return NextResponse.json(
            { error: 'غير مصرح لك بمعاينة مطور آخر.' },
            { status: 403 }
          );
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: targetId },
          include: {
            developerProfile: true,
            subscription: { include: { plan: true } },
            _count: {
              select: {
                claims: {
                  where: {
                    pipelineStatus: {
                      in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'],
                    },
                  },
                },
              },
            },
          },
        });
        if (!dbUser) {
          return NextResponse.json(
            { error: 'المطور غير موجود.' },
            { status: 404 }
          );
        }
        targetDev = mapDbDeveloperToContext(
          dbUser as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
        );
      }

      if (!targetLead || !targetDev) {
        return NextResponse.json(
          { error: 'بيانات المعاينة غير مكتملة.' },
          { status: 400 }
        );
      }

      const matchResult = evaluateMatch(targetLead, targetDev, {
        config: customConfig,
        rules: dbRules,
        matchVersion: customConfig.currentVersion,
        calculatedAt: nowIso,
      });

      const debugReport = generateAdminMatchDebugReport(targetLead, targetDev, {
        config: customConfig,
        rules: dbRules,
        matchVersion: customConfig.currentVersion,
        calculatedAt: nowIso,
      });

      return NextResponse.json({
        mode: 'PAIR_PREVIEW',
        persisted: false,
        matchResult,
        debugReport,
      });
    }

    // Case 2: Lead payload only -> Rank developers for this preview lead
    if (hasLead && !hasDeveloper) {
      if (user.role !== 'ADMIN' && Array.isArray(body.developers)) {
        return NextResponse.json(
          { error: 'غير مصرح لغير مدير النظام بمعاينة قائمة مطورين مخصصة.' },
          { status: 403 }
        );
      }

      let targetLead: MatchableLeadInput | null = null;
      if (body.lead && typeof body.lead === 'object') {
        targetLead = {
          id: 'preview-lead',
          category: 'OTHER',
          governorate: 'القاهرة',
          city: 'القاهرة',
          ...(body.lead as Partial<MatchableLeadInput>),
        };
      } else if (typeof body.leadId === 'string') {
        const dbLead = await prisma.lead.findUnique({
          where: { id: body.leadId },
          include: { claims: { select: { userId: true } } },
        });
        if (!dbLead || (user.role !== 'ADMIN' && !dbLead.isCanonical)) {
          return NextResponse.json(
            { error: 'العميل المحتمل غير موجود.' },
            { status: 404 }
          );
        }
        targetLead = mapDbLeadToMatchable(
          dbLead as unknown as Record<string, unknown>
        );
      }

      if (!targetLead) {
        return NextResponse.json(
          { error: 'بيانات العميل غير صالحة.' },
          { status: 400 }
        );
      }

      let devContexts: DeveloperMatchingContext[] = [];
      if (Array.isArray(body.developers)) {
        devContexts = body.developers as DeveloperMatchingContext[];
      } else {
        const dbDevs = await prisma.user.findMany({
          where:
            user.role === 'ADMIN'
              ? { role: 'DEVELOPER' }
              : { id: user.id },
          include: {
            developerProfile: true,
            subscription: { include: { plan: true } },
            _count: {
              select: {
                claims: {
                  where: {
                    pipelineStatus: {
                      in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'],
                    },
                  },
                },
              },
            },
          },
        });
        devContexts = dbDevs.map((d) =>
          mapDbDeveloperToContext(
            d as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
          )
        );
      }

      const ranked = rankDevelopersForLead(targetLead, devContexts, {
        config: customConfig,
        rules: dbRules,
        matchVersion: customConfig.currentVersion,
        calculatedAt: nowIso,
      });

      return NextResponse.json({
        mode: 'LEAD_PREVIEW',
        persisted: false,
        ...ranked,
      });
    }

    // Case 3: Developer preferences only -> Preview matching leads for developer profile
    if (hasDeveloper && !hasLead) {
      let targetDev: DeveloperMatchingContext;
      if (typeof body.developerId === 'string') {
        const targetId =
          body.developerId === 'me' ? user.id : body.developerId;
        if (user.role !== 'ADMIN' && targetId !== user.id) {
          return NextResponse.json(
            { error: 'غير مصرح لك بمعاينة مطور آخر.' },
            { status: 403 }
          );
        }
        const dbUser = await prisma.user.findUnique({
          where: { id: targetId },
          include: {
            developerProfile: true,
            subscription: { include: { plan: true } },
            _count: {
              select: {
                claims: {
                  where: {
                    pipelineStatus: {
                      in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'],
                    },
                  },
                },
              },
            },
          },
        });
        if (!dbUser) {
          return NextResponse.json(
            { error: 'المطور غير موجود.' },
            { status: 404 }
          );
        }
        const mapped = mapDbDeveloperToContext(
          dbUser as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
        );
        targetDev =
          body.profile && typeof body.profile === 'object'
            ? {
                ...mapped,
                profile: {
                  ...mapped.profile,
                  ...(body.profile as DeveloperMatchingContext['profile']),
                },
              }
            : mapped;
      } else if (body.developer && typeof body.developer === 'object') {
        targetDev = body.developer as DeveloperMatchingContext;
      } else {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            subscription: { include: { plan: true } },
            _count: {
              select: {
                claims: {
                  where: {
                    pipelineStatus: {
                      in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'],
                    },
                  },
                },
              },
            },
          },
        });
        const baseContext = dbUser
          ? mapDbDeveloperToContext(
              dbUser as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
            )
          : { developerId: user.id, name: user.name };
        targetDev = {
          ...baseContext,
          developerId: user.id,
          name: user.name,
          profile: (body.profile as DeveloperMatchingContext['profile']) || null,
        };
      }

      let matchableLeads: MatchableLeadInput[] = [];
      if (Array.isArray(body.leads)) {
        matchableLeads = body.leads as MatchableLeadInput[];
      } else {
        const dbLeads = await prisma.lead.findMany({
          where:
            user.role === 'ADMIN'
              ? { isCanonical: true }
              : {
                  isCanonical: true,
                  status: 'AVAILABLE',
                  saleabilityStatus: 'AVAILABLE',
                },
          include: { claims: { select: { userId: true } } },
          orderBy: [{ score: 'desc' }, { id: 'asc' }],
          take: 100,
        });
        matchableLeads = dbLeads.map((l) =>
          mapDbLeadToMatchable(l as unknown as Record<string, unknown>)
        );
      }

      const ranked = rankLeadsForDeveloper(targetDev, matchableLeads, {
        config: customConfig,
        rules: dbRules,
        matchVersion: customConfig.currentVersion,
        calculatedAt: nowIso,
      });

      return NextResponse.json({
        mode: 'DEVELOPER_PREVIEW',
        persisted: false,
        developerId: ranked.developerId,
        matchVersion: ranked.matchVersion,
        totalEligible: ranked.eligibleLeads.length,
        eligibleLeads: ranked.eligibleLeads.slice(0, 50),
        diagnostics: ranked.diagnostics,
      });
    }

    return NextResponse.json(
      {
        error:
          'يجب إرسال بيانات العميل (lead) أو بيانات تفضيلات المطور (developer / profile) للمعاينة.',
      },
      { status: 400 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode }
      );
    }
    console.error('POST /api/matching/preview error:', err);
    return NextResponse.json(
      { error: 'تعذر تنفيذ معاينة المطابقة.' },
      { status: 500 }
    );
  }
}

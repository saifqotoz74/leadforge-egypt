import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  evaluateLeadQuality,
  getActiveQualityAndFreshnessConfig,
} from '@/lib/quality';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { qualityConfig, freshnessThresholds } =
      await getActiveQualityAndFreshnessConfig();

    const leads = await prisma.lead.findMany({
      where: { isCanonical: true },
      include: {
        verifications: {
          orderBy: { checkedAt: 'desc' },
        },
        feedbacks: {
          where: { useful: false },
          select: { reason: true, createdAt: true },
        },
      },
      orderBy: { lastVerifiedAt: 'asc' },
    });

    const staleLeads = [];
    for (const lead of leads) {
      const negativeFeedbackEntries = lead.feedbacks
        .filter((f): f is { reason: NonNullable<typeof f.reason>; createdAt: Date } => Boolean(f.reason))
        .map((f) => ({ reason: f.reason as string, createdAt: f.createdAt }));

      const evalResult = evaluateLeadQuality(
        {
          ...lead,
          websiteAnalysis:
            lead.websiteAnalysis && typeof lead.websiteAnalysis === 'object'
              ? (lead.websiteAnalysis as Record<string, unknown>)
              : null,
          negativeFeedbackReasons: negativeFeedbackEntries.map((e) => e.reason),
          negativeFeedbackEntries,
        },
        { qualityConfig, freshnessThresholds }
      );

      if (
        evalResult.freshness.freshnessStatus === 'STALE' ||
        evalResult.freshness.freshnessStatus === 'VERY_STALE'
      ) {
        staleLeads.push({
          id: lead.id,
          businessName: lead.businessName,
          category: lead.category,
          governorate: lead.governorate,
          city: lead.city,
          phone: lead.phone,
          website: lead.website,
          score: lead.score,
          temperature: lead.temperature,
          qualityScore: evalResult.qualityScore,
          qualityStatus: evalResult.qualityStatus,
          freshnessStatus: evalResult.freshness.freshnessStatus,
          daysSinceVerified: evalResult.freshness.daysSinceVerified,
          verificationStatus: evalResult.verificationStatus,
          saleabilityStatus: evalResult.saleabilityStatus,
          qualityFlags: evalResult.qualityFlags,
          lastVerifiedAt: lead.lastVerifiedAt,
        });
      }
    }

    return NextResponse.json({
      leads: staleLeads,
      total: staleLeads.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/quality/stale error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب قائمة الفرص القديمة (Stale).' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/auth';
import {
  evaluateLeadQuality,
  getActiveQualityAndFreshnessConfig,
  getPrioritizedLeadsForVerification,
} from '@/lib/quality';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get('limit') || '50');
    const limit = Number.isNaN(limitParam) ? 50 : Math.max(1, Math.min(limitParam, 100));

    const { qualityConfig, freshnessThresholds } =
      await getActiveQualityAndFreshnessConfig();

    const prioritized = await getPrioritizedLeadsForVerification({
      limit: 200,
      onlyCanonical: true,
    });

    const needsVerification = [];
    for (const item of prioritized) {
      const evalResult = evaluateLeadQuality(
        {
          ...item.lead,
          websiteAnalysis:
            item.lead.websiteAnalysis && typeof item.lead.websiteAnalysis === 'object'
              ? (item.lead.websiteAnalysis as Record<string, unknown>)
              : null,
        },
        { qualityConfig, freshnessThresholds }
      );

      if (
        evalResult.freshness.requiresVerification ||
        evalResult.saleabilityStatus === 'REQUIRES_VERIFICATION' ||
        evalResult.saleabilityStatus === 'STALE' ||
        evalResult.verificationStatus === 'UNVERIFIED'
      ) {
        needsVerification.push({
          id: item.lead.id,
          businessName: item.lead.businessName,
          category: item.lead.category,
          governorate: item.lead.governorate,
          city: item.lead.city,
          phone: item.lead.phone,
          website: item.lead.website,
          score: item.lead.score,
          temperature: item.lead.temperature,
          estimatedBudget: item.lead.estimatedBudget,
          demandScore: item.demandScore,
          priorityRank: item.priorityRank,
          qualityScore: evalResult.qualityScore,
          qualityStatus: evalResult.qualityStatus,
          freshnessStatus: evalResult.freshness.freshnessStatus,
          daysSinceVerified: evalResult.freshness.daysSinceVerified,
          verificationStatus: evalResult.verificationStatus,
          saleabilityStatus: evalResult.saleabilityStatus,
          qualityFlags: evalResult.qualityFlags,
          lastVerifiedAt: item.lead.lastVerifiedAt,
        });
      }
      if (needsVerification.length >= limit) break;
    }

    return NextResponse.json({
      leads: needsVerification,
      total: needsVerification.length,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/admin/quality/needs-verification error:', err);
    return NextResponse.json(
      { error: 'تعذر جلب قائمة الفرص التي تحتاج إعادة تحقق.' },
      { status: 500 }
    );
  }
}

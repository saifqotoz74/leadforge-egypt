import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { evaluateLeadFreshness, DEFAULT_FRESHNESS_THRESHOLDS } from '@/lib/freshness';
import { evaluateDeveloperLeadMatch } from '@/lib/matching-engine';
import { getActiveMatchingConfigAndRules } from '@/lib/matching/service';
import {
  normalizeNicheCode,
  normalizeProjectLeadType,
  normalizeServiceCode,
  resolveLeadProjectType,
  resolveLeadRequiredServices,
  resolveLocationHierarchy,
} from '@/lib/matching/taxonomy';
import {
  calculateLeadCreditCost,
  resolveEffectiveAccessType,
  resolveLeadAccessPolicy,
} from '@/lib/claims/pricing';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 6) return '****';
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '****';
  return `${local.slice(0, 2)}***@${domain}`;
}

let cachedFreshnessConfig: { data: any; expiresAt: number } | null = null;
let cachedPricingConfig: { data: any; expiresAt: number } | null = null;

async function getCachedFreshnessConfig() {
  const now = Date.now();
  if (cachedFreshnessConfig && cachedFreshnessConfig.expiresAt > now) {
    return cachedFreshnessConfig.data;
  }
  const data = await prisma.freshnessConfig.findUnique({ where: { id: 'default' } });
  cachedFreshnessConfig = { data, expiresAt: now + 15 * 60_000 };
  return data;
}

async function getCachedPricingConfig() {
  const now = Date.now();
  if (cachedPricingConfig && cachedPricingConfig.expiresAt > now) {
    return cachedPricingConfig.data;
  }
  const data = await prisma.creditPricingConfig.findUnique({ where: { id: 'default' } });
  cachedPricingConfig = { data, expiresAt: now + 15 * 60_000 };
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const governorate = searchParams.get('governorate')?.trim() || '';
    const city = searchParams.get('city')?.trim() || '';
    const area = searchParams.get('area')?.trim() || '';
    const locationParam = searchParams.get('location')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const nicheParam = searchParams.get('niche')?.trim() || '';
    const serviceParam =
      (searchParams.get('service') || searchParams.get('requiredService'))?.trim() || '';
    const leadTypeParam =
      (searchParams.get('leadType') || searchParams.get('projectLeadType'))?.trim() || '';
    const websiteStatus = searchParams.get('websiteStatus')?.trim() || '';
    const scoreRange = searchParams.get('scoreRange')?.trim() || '';
    const minOpportunityScoreStr =
      (searchParams.get('minOpportunityScore') || searchParams.get('opportunityScore'))?.trim() ||
      '';
    const minMatchStrengthStr = searchParams.get('minMatchStrength')?.trim() || '';
    const hasPhone = searchParams.get('hasPhone') === 'true';
    const fieldVisitOnly = searchParams.get('fieldVisitOnly') === 'true';
    const hasEmail = searchParams.get('hasEmail') === 'true';
    const hasSocial = searchParams.get('hasSocial') === 'true';
    const temperature = searchParams.get('temperature')?.trim() || '';
    const ownershipType = searchParams.get('ownershipType')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';
    const matchedOnly = searchParams.get('matchedOnly') === 'true';
    const claimedOnly = searchParams.get('claimedOnly') === 'true';
    const qualityStatus = searchParams.get('qualityStatus')?.trim() || '';
    const freshnessStatusFilter =
      (searchParams.get('freshnessStatus') || searchParams.get('freshness'))?.trim() || '';
    const verificationStatusFilter = searchParams.get('verificationStatus')?.trim() || '';
    const minQualityScoreStr =
      (searchParams.get('minQualityScore') || searchParams.get('minQuality'))?.trim() || '';
    const sortBy = searchParams.get('sortBy')?.trim() || '';
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const where: Prisma.LeadWhereInput = {
      status: claimedOnly
        ? undefined
        : {
            notIn: [
              'INVALID',
              'ARCHIVED',
              'CLOSED',
              'DUPLICATE',
              'STALE',
              'REQUIRES_VERIFICATION',
              'NOT_SALEABLE',
            ],
          },
      ...(claimedOnly
        ? {}
        : {
            isCanonical: true,
            saleabilityStatus: { in: ['AVAILABLE', 'CLAIMED_FULL'] },
          }),
    };

    if (
      qualityStatus &&
      ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'EXCELLENT'].includes(qualityStatus)
    ) {
      where.qualityStatus = qualityStatus as
        | 'VERY_LOW'
        | 'LOW'
        | 'MEDIUM'
        | 'HIGH'
        | 'EXCELLENT';
    }
    if (
      verificationStatusFilter &&
      ['UNVERIFIED', 'PARTIALLY_VERIFIED', 'VERIFIED', 'FAILED_VERIFICATION'].includes(
        verificationStatusFilter
      )
    ) {
      where.verificationStatus = verificationStatusFilter as
        | 'UNVERIFIED'
        | 'PARTIALLY_VERIFIED'
        | 'VERIFIED'
        | 'FAILED_VERIFICATION';
    }
    if (minQualityScoreStr && !Number.isNaN(Number(minQualityScoreStr))) {
      where.qualityScore = { gte: Number(minQualityScoreStr) };
    }

    if (governorate && governorate !== 'ALL') {
      where.governorate = governorate;
    }
    if (city && city !== 'ALL') {
      where.city = city;
    }
    if (area && area !== 'ALL') {
      where.area = { contains: area, mode: 'insensitive' };
    }
    if (category && category !== 'ALL' && !nicheParam) {
      where.category = category;
    }
    if (
      websiteStatus &&
      ['NO_WEBSITE', 'HAS_WEBSITE', 'POOR_WEBSITE', 'UNKNOWN'].includes(websiteStatus)
    ) {
      where.websiteStatus = websiteStatus as 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
    }

    if (scoreRange && scoreRange !== 'ALL') {
      const [minStr, maxStr] = scoreRange.split('-');
      const minScore = Number(minStr);
      const maxScore = Number(maxStr);
      if (!Number.isNaN(minScore) && !Number.isNaN(maxScore)) {
        where.score = { gte: minScore, lte: maxScore };
      }
    } else if (minOpportunityScoreStr && !Number.isNaN(Number(minOpportunityScoreStr))) {
      where.score = { gte: Number(minOpportunityScoreStr) };
    }

    if (hasPhone) {
      where.hasPhone = true;
    }
    if (fieldVisitOnly) {
      where.hasPhone = false;
    }
    if (hasEmail) {
      where.hasEmail = true;
    }
    if (hasSocial) {
      where.OR = [{ hasFacebook: true }, { hasInstagram: true }];
    }

    if (temperature && temperature !== 'ALL') {
      if (temperature === 'HOT') {
        where.temperature = { in: ['HOT', 'PREMIUM'] };
      } else if (['COLD', 'WARM', 'PREMIUM'].includes(temperature)) {
        where.temperature = temperature as 'COLD' | 'WARM' | 'PREMIUM';
      }
    }

    const effectiveOwnership =
      ownershipType && ['EXCLUSIVE', 'SHARED'].includes(ownershipType)
        ? ownershipType
        : leadTypeParam && ['EXCLUSIVE', 'SHARED'].includes(leadTypeParam.toUpperCase())
          ? leadTypeParam.toUpperCase()
          : '';

    if (effectiveOwnership) {
      where.leadType = effectiveOwnership as 'EXCLUSIVE' | 'SHARED';
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' } },
            { city: { contains: search, mode: 'insensitive' } },
            { area: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (claimedOnly) {
      where.claims = {
        some: { userId: user.id },
      };
    }

    const [freshnessRow, matchingCtx, pricingConfigRow] = await Promise.all([
      getCachedFreshnessConfig(),
      getActiveMatchingConfigAndRules(),
      getCachedPricingConfig(),
    ]);
    const thresholds = freshnessRow || DEFAULT_FRESHNESS_THRESHOLDS;
    const { config: matchingConfig, rules: matchingRules } = matchingCtx;

    const rawLeads = await prisma.lead.findMany({
      where,
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      include: {
        claims: {
          where: { userId: user.id },
          take: 1,
        },
        feedbacks: {
          where: { userId: user.id },
          take: 1,
        },
      },
      take: 250,
    });

    const targetServiceCode =
      serviceParam && serviceParam !== 'ALL' ? normalizeServiceCode(serviceParam) : null;
    const targetNicheCode =
      nicheParam && nicheParam !== 'ALL' ? normalizeNicheCode(nicheParam) : null;
    const targetLoc =
      locationParam && locationParam !== 'ALL' ? resolveLocationHierarchy(locationParam) : null;
    const targetProjectLeadType =
      leadTypeParam &&
      leadTypeParam !== 'ALL' &&
      !['EXCLUSIVE', 'SHARED'].includes(leadTypeParam.toUpperCase())
        ? normalizeProjectLeadType(leadTypeParam)
        : null;
    const minMatchStrength =
      minMatchStrengthStr && !Number.isNaN(Number(minMatchStrengthStr))
        ? Math.max(0, Math.min(100, Number(minMatchStrengthStr)))
        : 0;

    const formatted = rawLeads
      .map((lead) => {
        const myClaim = lead.claims[0] || null;
        const myFeedback = lead.feedbacks[0] || null;
        const hasActiveClaim = Boolean(
          myClaim && myClaim.status === 'ACTIVE' && myClaim.accessGranted !== false
        );
        const isUnlocked = hasActiveClaim || user.role === 'ADMIN';

        const freshness = evaluateLeadFreshness(lead.lastVerifiedAt, thresholds);
        const dynamicSaleabilityStatus =
          lead.saleabilityStatus === 'AVAILABLE' && freshness.isStale
            ? 'STALE'
            : lead.saleabilityStatus === 'AVAILABLE' && freshness.requiresVerification
              ? 'REQUIRES_VERIFICATION'
              : lead.saleabilityStatus;

        const matchableLead = {
          id: lead.id,
          businessName: lead.businessName,
          category: lead.category,
          governorate: lead.governorate,
          city: lead.city,
          area: lead.area,
          websiteStatus: lead.websiteStatus,
          requiredService: lead.requiredService,
          requiredServices: lead.requiredServices,
          projectLeadType: lead.projectLeadType,
          estimatedBudget: lead.estimatedBudget,
          minBudget: lead.minBudget,
          maxBudget: lead.maxBudget,
          budgetCurrency: lead.budgetCurrency,
          budgetType: lead.budgetType,
          leadType: lead.leadType,
          exclusive: lead.exclusive,
          score: lead.score,
          qualityScore: lead.qualityScore,
          qualityStatus: lead.qualityStatus,
          freshnessStatus: freshness.freshnessStatus,
          verificationStatus: lead.verificationStatus,
          temperature: lead.temperature,
          saleabilityStatus: dynamicSaleabilityStatus,
          isCanonical: lead.isCanonical,
          businessStatus: lead.businessStatus,
        };

        const matchEvaluation = evaluateDeveloperLeadMatch(
          matchableLead,
          user.developerProfile,
          {
            config: matchingConfig,
            rules: matchingRules,
            matchVersion: matchingConfig.currentVersion,
            subscription: user.subscription
              ? {
                  id: user.subscription.id,
                  status: user.subscription.status,
                  credits: user.subscription.credits,
                  currentPeriodEnd: user.subscription.currentPeriodEnd,
                  plan: user.subscription.plan
                    ? {
                        id: user.subscription.plan.id,
                        slug: user.subscription.plan.slug,
                        name: user.subscription.plan.name,
                        nameEn: user.subscription.plan.nameEn,
                        allowsExclusive: user.subscription.plan.allowsExclusive,
                        isActive: user.subscription.plan.isActive,
                      }
                    : null,
                }
              : null,
            userStatus: user.status,
          }
        );

        const resolvedServices = resolveLeadRequiredServices(matchableLead);
        const resolvedProjectType = resolveLeadProjectType(matchableLead);
        const effectiveAccessType = resolveEffectiveAccessType(lead);
        const effectivePricingSubject = {
          ...lead,
          creditCost:
            typeof lead.creditCost === 'number' && lead.creditCost > 0
              ? lead.creditCost
              : !lead.phone && !lead.hasPhone
              ? 1
              : lead.exclusive
              ? 25
              : 5,
          creditCostReason:
            lead.creditCostReason?.trim() ||
            (!lead.phone && !lead.hasPhone
              ? 'FIELD_VISIT_DISCOUNT'
              : lead.exclusive
              ? 'EXCLUSIVE_LEAD'
              : 'SHARED_LEAD'),
        };
        const pricing = calculateLeadCreditCost(effectivePricingSubject, pricingConfigRow);
        const accessPolicy = resolveLeadAccessPolicy(
          {
            ...lead,
            saleabilityStatus: dynamicSaleabilityStatus,
          },
          pricingConfigRow
        );

        return {
          id: lead.id,
          businessName: lead.businessName,
          category: lead.category,
          governorate: lead.governorate,
          city: lead.city,
          area: lead.area,
          address: isUnlocked ? lead.address : null,
          phone: isUnlocked ? lead.phone : maskPhone(lead.phone),
          hasPhone: Boolean(lead.hasPhone && lead.phone),
          email: isUnlocked ? lead.email : maskEmail(lead.email),
          hasEmail: lead.hasEmail,
          website: lead.website,
          websiteStatus: lead.websiteStatus,
          facebook: isUnlocked ? lead.facebook : lead.hasFacebook ? 'متاح بعد فتح الفرصة' : null,
          hasFacebook: lead.hasFacebook,
          instagram: isUnlocked ? lead.instagram : lead.hasInstagram ? 'متاح بعد فتح الفرصة' : null,
          hasInstagram: lead.hasInstagram,
          rating: lead.rating,
          reviewCount: lead.reviewCount,
          branchCount: lead.branchCount,
          estimatedBudget: lead.estimatedBudget,
          minBudget: lead.minBudget,
          maxBudget: lead.maxBudget,
          budgetCurrency: lead.budgetCurrency,
          budgetType: lead.budgetType,
          requiredService: lead.requiredService || resolvedServices.primary,
          requiredServices:
            lead.requiredServices && lead.requiredServices.length > 0
              ? lead.requiredServices
              : resolvedServices.allRequired,
          projectLeadType: lead.projectLeadType || resolvedProjectType,
          isVerified: lead.isVerified,
          isRecentlyActive: lead.isRecentlyActive,
          score: lead.score,
          opportunityScore: lead.score,
          temperature: lead.temperature,
          classification: lead.temperature,
          scoringVersion: lead.scoringVersion,
          scoreExplanation: lead.scoreExplanation,
          qualityScore: lead.qualityScore,
          qualityStatus: lead.qualityStatus,
          freshnessStatus: freshness.freshnessStatus,
          verificationStatus: lead.verificationStatus,
          saleabilityStatus: dynamicSaleabilityStatus,
          completenessScore: lead.completenessScore,
          qualityFlags: lead.qualityFlags,
          businessStatus: lead.businessStatus,
          phoneValidationStatus: lead.phoneValidationStatus,
          emailValidationStatus: lead.emailValidationStatus,
          websiteVerificationState: lead.websiteVerificationState,
          status: lead.status,
          confidence: lead.confidence,
          qualificationReasons: lead.qualificationReasons,
          qualificationRules: lead.qualificationRules,
          websiteAnalysis: lead.websiteAnalysis,
          leadType: lead.leadType,
          accessType: effectiveAccessType,
          exclusive: lead.exclusive || effectiveAccessType === 'EXCLUSIVE',
          creditCost: pricing.creditCost,
          creditCostReason: pricing.creditCostReason,
          pricingExplanation: pricing.explanation,
          maxPurchasers: accessPolicy.maxPurchasers,
          currentPurchasers: lead.currentPurchasers,
          availableForClaim: accessPolicy.availableForClaim,
          accessPolicy,
          source: lead.source,
          sourceList: lead.sourceList,
          lastVerifiedAt: lead.lastVerifiedAt,
          nextVerificationAt: lead.nextVerificationAt,
          lastScoredAt: lead.lastScoredAt,
          createdAt: lead.createdAt,
          freshness,
          matchEvaluation,
          isClaimedByMe: hasActiveClaim,
          myClaim,
          myFeedback,
        };
      })
      .filter((item) => {
        if (
          !claimedOnly &&
          (item.freshness.isStale ||
            item.freshness.requiresVerification ||
            item.freshnessStatus === 'UNKNOWN' ||
            item.freshnessStatus === 'NEEDS_VERIFICATION' ||
            item.businessStatus === 'CLOSED' ||
            item.verificationStatus === 'FAILED_VERIFICATION' ||
            item.verificationStatus === 'UNVERIFIED')
        ) {
          return false;
        }
        if (freshnessStatusFilter && freshnessStatusFilter !== 'ALL') {
          const fUpper = freshnessStatusFilter.toUpperCase();
          if (fUpper === 'RECENT' || fUpper === 'AGING' || fUpper === 'RECENTLY_VERIFIED') {
            if (
              item.freshnessStatus !== 'RECENT' &&
              item.freshness.status !== 'RECENTLY_VERIFIED'
            ) {
              return false;
            }
          } else if (item.freshnessStatus !== fUpper && item.freshness.status !== fUpper) {
            return false;
          }
        }
        if (targetServiceCode) {
          if (!item.requiredServices.includes(targetServiceCode)) {
            return false;
          }
        }
        if (targetNicheCode) {
          if (normalizeNicheCode(item.category) !== targetNicheCode) {
            return false;
          }
        }
        if (targetLoc) {
          const itemCityLoc = resolveLocationHierarchy(item.city);
          const itemGovLoc = resolveLocationHierarchy(item.governorate);
          const itemAreaLoc = resolveLocationHierarchy(item.area);
          const itemCanonicalAr = itemCityLoc?.canonicalAr || item.city;
          const itemGovAr =
            itemGovLoc?.governorateAr || itemCityLoc?.governorateAr || item.governorate;
          const itemAreaAr = itemAreaLoc?.canonicalAr || item.area || '';

          if (targetLoc.isDistrictName) {
            if (itemAreaAr !== targetLoc.canonicalAr && itemCanonicalAr !== targetLoc.canonicalAr) {
              return false;
            }
          } else if (targetLoc.isCityName && !targetLoc.isGovernorateName) {
            if (itemCanonicalAr !== targetLoc.canonicalAr) return false;
          } else {
            if (itemGovAr !== targetLoc.governorateAr && itemCanonicalAr !== targetLoc.canonicalAr) {
              return false;
            }
          }
        }
        if (targetProjectLeadType) {
          if (item.projectLeadType !== targetProjectLeadType) {
            return false;
          }
        }
        if (minMatchStrength > 0) {
          if (!item.matchEvaluation.isMatch || item.matchEvaluation.matchStrength < minMatchStrength) {
            return false;
          }
        }
        return matchedOnly ? item.matchEvaluation.isMatch : true;
      });

    if (matchedOnly || sortBy === 'MATCH_STRENGTH' || minMatchStrength > 0) {
      formatted.sort((a, b) => {
        if (b.matchEvaluation.isMatch !== a.matchEvaluation.isMatch) {
          return a.matchEvaluation.isMatch ? -1 : 1;
        }
        if (b.matchEvaluation.matchStrength !== a.matchEvaluation.matchStrength) {
          return b.matchEvaluation.matchStrength - a.matchEvaluation.matchStrength;
        }
        if (b.qualityScore !== a.qualityScore) {
          return b.qualityScore - a.qualityScore;
        }
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.id.localeCompare(b.id);
      });
    } else if (sortBy === 'QUALITY_DESC') {
      formatted.sort((a, b) => b.qualityScore - a.qualityScore || b.score - a.score);
    } else if (sortBy === 'NEWEST') {
      formatted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const total = formatted.length;
    const offset = offsetParam ? Math.max(0, Number(offsetParam)) : 0;
    const limit = limitParam ? Math.max(1, Math.min(250, Number(limitParam))) : total || 250;
    const paginated = limitParam || offsetParam ? formatted.slice(offset, offset + limit) : formatted;

    return NextResponse.json({
      leads: paginated,
      total,
      matchVersion: matchingConfig.currentVersion,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('GET /api/leads error:', err);
    return NextResponse.json({ error: 'تعذر جلب قائمة العملاء المحتملين.' }, { status: 500 });
  }
}

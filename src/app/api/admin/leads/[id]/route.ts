import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAdmin, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { analyzeWebsiteUrl } from '@/lib/website-analyzer';
import {
  calculateLeadScore,
  hasScoreMateriallyChanged,
  loadScoringContext,
  logScoringOperation,
  recalculateLeadScore,
} from '@/lib/scoring-engine';
import { createAuditLog } from '@/lib/audit';
import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeCategory,
  normalizeCityAndGovernorate,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePhones,
  normalizeSocialUrl,
} from '@/lib/normalizer';
import { generateCanonicalIdentityKeys } from '@/lib/deduplication';
import {
  recalculateAndPersistLeadQuality,
  verifyAddress,
  verifyBusiness,
  verifyEmail,
  verifyIdentity,
  verifyLead,
  verifyPhone,
  verifyWebsite,
} from '@/lib/quality';
import { invalidateAndRecalculateLeadMatches } from '@/lib/matching/service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(req);
    const leadId = params.id;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        verifications: {
          orderBy: { checkedAt: 'desc' },
          take: 50,
        },
        scores: {
          orderBy: { calculatedAt: 'desc' },
          take: 20,
        },
        feedbacks: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 });
    }

    const qualityEvaluation = await recalculateAndPersistLeadQuality(leadId);
    const refreshedLead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        verifications: {
          orderBy: { checkedAt: 'desc' },
          take: 50,
        },
        scores: {
          orderBy: { calculatedAt: 'desc' },
          take: 20,
        },
        feedbacks: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return NextResponse.json({
      lead: refreshedLead,
      qualityEvaluation,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب تفاصيل الفرصة.' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const admin = await requireAdmin(req);
    const leadId = params.id;
    const body = await req.json();

    const existing = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        scores: {
          orderBy: [{ calculatedAt: 'desc' }, { evaluatedAt: 'desc' }],
          take: 1,
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 });
    }

    if (body.action === 'RECALCULATE') {
      const recalc = await recalculateLeadScore(prisma, leadId, {
        trigger: 'ADMIN_RECALCULATION',
      });
      return NextResponse.json({
        success: true,
        lead: recalc.lead,
        scoreResult: recalc.scoreResult,
        snapshotCreated: recalc.snapshotCreated,
      });
    }

    const scoringContext = await loadScoringContext(prisma);
    const rulesToUse = scoringContext.rules;
    const latestSnapshot = existing.scores[0] || null;

    // Action 1: VERIFY website & freshness
    if (body.action === 'VERIFY') {
      const startMs = Date.now();
      const analysis = await analyzeWebsiteUrl(existing.website, {
        allowNetwork: Boolean(body.allowNetwork),
      });
      const newWebsiteStatus = !existing.website
        ? 'NO_WEBSITE'
        : analysis.recommendedWebsiteStatus;
      const now = new Date();

      const scoreRes = calculateLeadScore(
        {
          isVerified: true,
          websiteStatus: newWebsiteStatus,
          website: existing.website,
          normalizedDomain: existing.normalizedDomain,
          websiteAnalysis: analysis as unknown as Record<string, unknown>,
          hasFacebook: existing.hasFacebook,
          facebook: existing.facebook,
          hasInstagram: existing.hasInstagram,
          instagram: existing.instagram,
          hasPhone: existing.hasPhone,
          phone: existing.phone,
          normalizedPhone: existing.normalizedPhone,
          hasEmail: existing.hasEmail,
          email: existing.email,
          normalizedEmail: existing.normalizedEmail,
          branchCount: existing.branchCount,
          reviewCount: existing.reviewCount,
          rating: existing.rating,
          isRecentlyActive: existing.isRecentlyActive,
          category: existing.category,
          city: existing.city,
          governorate: existing.governorate,
          area: existing.area,
          estimatedBudget: existing.estimatedBudget,
          source: existing.source,
          sourceList: existing.sourceList,
          lastVerifiedAt: now,
        },
        rulesToUse,
        {
          scoringVersion: scoringContext.scoringVersion,
          thresholds: scoringContext.thresholds,
          calculatedAt: now,
        }
      );

      const shouldCreateSnapshot = hasScoreMateriallyChanged(latestSnapshot, scoreRes);

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.lead.update({
          where: { id: leadId },
          data: {
            isVerified: true,
            websiteStatus: newWebsiteStatus,
            websiteAnalysis: analysis as unknown as object,
            lastVerifiedAt: now,
            lastScoredAt: now,
            score: scoreRes.normalizedScore,
            temperature: scoreRes.temperature,
            scoringVersion: scoreRes.scoringVersion,
            scoreExplanation: scoreRes.explanation as unknown as object,
            confidence: scoreRes.confidence,
            qualificationReasons: scoreRes.qualificationReasons,
            qualificationRules: scoreRes.qualificationRules as unknown as object,
          },
        });

        if (shouldCreateSnapshot) {
          await tx.leadScore.create({
            data: {
              leadId,
              previousScore: latestSnapshot ? latestSnapshot.normalizedScore : existing.score,
              rawScore: scoreRes.rawScore,
              normalizedScore: scoreRes.normalizedScore,
              newScore: scoreRes.normalizedScore,
              previousClassification: latestSnapshot
                ? latestSnapshot.temperature
                : existing.temperature,
              temperature: scoreRes.temperature,
              newClassification: scoreRes.classification,
              scoringVersion: scoreRes.scoringVersion,
              trigger: 'SOURCE_REFRESH',
              appliedRules: scoreRes.appliedRules as unknown as object,
              evaluatedRules: scoreRes.evaluatedRules as unknown as object,
              explanation: scoreRes.explanation as unknown as object,
              qualificationReasons: scoreRes.qualificationReasons,
              calculatedAt: now,
              evaluatedAt: now,
            },
          });
        }

        return u;
      });

      logScoringOperation({
        event: 'LEAD_SCORE_EVALUATED',
        leadId,
        scoringVersion: scoreRes.scoringVersion,
        previousScore: latestSnapshot ? latestSnapshot.normalizedScore : existing.score,
        newScore: scoreRes.normalizedScore,
        previousClassification: latestSnapshot ? latestSnapshot.temperature : existing.temperature,
        classification: scoreRes.classification,
        trigger: 'SOURCE_REFRESH',
        durationMs: Date.now() - startMs,
        rulesApplied: scoreRes.appliedRules.map((r) => r.ruleKey),
      });

      const verificationOutcome = await verifyLead(leadId, {
        source: `ADMIN_VERIFY:${admin.id}`,
        now,
        recalculateOpportunityScore: false,
      });
      await invalidateAndRecalculateLeadMatches(leadId);

      const refreshed = await prisma.lead.findUnique({ where: { id: leadId } });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_LEAD_VERIFIED',
          entityType: 'Lead',
          entityId: leadId,
          details: {
            verificationStatus: verificationOutcome.newVerificationStatus,
            qualityScore: verificationOutcome.qualityEvaluation.qualityScore,
            saleabilityStatus: verificationOutcome.qualityEvaluation.saleabilityStatus,
          },
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        lead: refreshed || updated,
        websiteAnalysis: analysis,
        verification: verificationOutcome,
      });
    }

    if (
      body.action === 'REVERIFY' ||
      body.action === 'VERIFY_FULL' ||
      body.action === 'VERIFY_WEBSITE' ||
      body.action === 'VERIFY_PHONE' ||
      body.action === 'VERIFY_EMAIL' ||
      body.action === 'VERIFY_BUSINESS' ||
      body.action === 'VERIFY_ADDRESS' ||
      body.action === 'VERIFY_IDENTITY'
    ) {
      const source = `ADMIN_ACTION:${admin.id}`;
      let outcome: unknown;
      if (body.action === 'VERIFY_WEBSITE') {
        outcome = await verifyWebsite(leadId, { source });
      } else if (body.action === 'VERIFY_PHONE') {
        outcome = await verifyPhone(leadId, { source });
      } else if (body.action === 'VERIFY_EMAIL') {
        outcome = await verifyEmail(leadId, { source });
      } else if (body.action === 'VERIFY_BUSINESS') {
        outcome = await verifyBusiness(leadId, { source });
      } else if (body.action === 'VERIFY_ADDRESS') {
        outcome = await verifyAddress(leadId, { source });
      } else if (body.action === 'VERIFY_IDENTITY') {
        outcome = await verifyIdentity(leadId, { source });
      } else {
        outcome = await verifyLead(leadId, { source });
      }

      await invalidateAndRecalculateLeadMatches(leadId);
      const refreshed = await prisma.lead.findUnique({ where: { id: leadId } });

      await createAuditLog(
        {
          userId: admin.id,
          action: `ADMIN_${body.action}`,
          entityType: 'Lead',
          entityId: leadId,
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        lead: refreshed,
        verification: outcome,
      });
    }

    if (body.action === 'MARK_CLOSED') {
      const outcome = await verifyBusiness(leadId, {
        source: `ADMIN_MARK_CLOSED:${admin.id}`,
        overrideBusinessStatus: 'CLOSED',
      });
      await invalidateAndRecalculateLeadMatches(leadId);
      const refreshed = await prisma.lead.findUnique({ where: { id: leadId } });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_LEAD_MARKED_CLOSED',
          entityType: 'Lead',
          entityId: leadId,
        },
        prisma
      );

      return NextResponse.json({
        success: true,
        lead: refreshed,
        verification: outcome,
      });
    }

    // Action 2: MARK_INVALID
    if (body.action === 'MARK_INVALID') {
      const updated = await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'INVALID', saleabilityStatus: 'INVALID' },
      });
      await invalidateAndRecalculateLeadMatches(leadId);

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_LEAD_MARKED_INVALID',
          entityType: 'Lead',
          entityId: leadId,
        },
        prisma
      );

      return NextResponse.json({ success: true, lead: updated });
    }

    // Action 3: ASSIGN to Developer
    if (body.action === 'ASSIGN' && body.developerId) {
      const developerId = String(body.developerId);
      const targetDeveloper = await prisma.user.findUnique({ where: { id: developerId } });
      if (!targetDeveloper) {
        return NextResponse.json({ error: 'المطور غير موجود.' }, { status: 404 });
      }

      const existingClaim = await prisma.leadClaim.findUnique({
        where: { leadId_userId: { leadId, userId: developerId } },
      });

      if (existingClaim) {
        return NextResponse.json(
          { error: 'تم تخصيص هذه الفرصة لهذا المطور مسبقًا.' },
          { status: 409 }
        );
      }

      const effectiveMaxPurchasers = existing.exclusive ? 1 : existing.maxPurchasers;
      if (existing.exclusive && existing.currentPurchasers >= 1) {
        return NextResponse.json(
          { error: 'هذه فرصة حصرية (Exclusive) وتم حجزها بالفعل ولا يمكن تخصيصها لمطور آخر.' },
          { status: 409 }
        );
      }

      if (existing.currentPurchasers >= effectiveMaxPurchasers || existing.status !== 'AVAILABLE') {
        return NextResponse.json(
          { error: `وصلت هذه الفرصة للحد الأقصى من المشترين (${effectiveMaxPurchasers}) أو لم تعد متاحة.` },
          { status: 409 }
        );
      }

      const newClaim = await prisma.leadClaim.create({
        data: {
          leadId,
          userId: developerId,
          pipelineStatus: 'NEW',
          creditsSpent: 0,
          exclusiveClaim: existing.exclusive,
          notes: 'تم التخصيص المباشر بواسطة مدير النظام',
        },
      });

      await prisma.leadStatusHistory.create({
        data: {
          claimId: newClaim.id,
          leadId,
          userId: developerId,
          previousStatus: null,
          newStatus: 'NEW',
          notes: 'تم التخصيص المباشر بواسطة مدير النظام',
        },
      });

      const newPurchasers = existing.currentPurchasers + 1;
      const updated = await prisma.lead.update({
        where: { id: leadId },
        data: {
          currentPurchasers: newPurchasers,
          status:
            existing.exclusive || newPurchasers >= effectiveMaxPurchasers
              ? 'CLAIMED_FULL'
              : existing.status,
        },
      });

      await prisma.notification.create({
        data: {
          userId: developerId,
          type: 'LEAD_CLAIMED',
          title: 'تم تخصيص فرصة جديدة لك من إدارة المنصة',
          message: `تم تخصيص بيانات النشاط التجاري "${existing.businessName}" (${existing.city}) لحسابك في CRM.`,
          link: `/leads/${leadId}`,
        },
      });

      await createAuditLog(
        {
          userId: admin.id,
          action: 'ADMIN_LEAD_ASSIGNED',
          entityType: 'Lead',
          entityId: leadId,
          details: { developerId, claimId: newClaim.id },
        },
        prisma
      );
      return NextResponse.json({ success: true, lead: updated, claim: newClaim });
    }

    // Standard Edit + Score Recalculation
    const businessName = body.businessName?.trim() || existing.businessName;
    const normalizedName = normalizeBusinessName(businessName);
    const category = body.category ? normalizeCategory(body.category) : existing.category;
    const { city, governorate } = body.city
      ? normalizeCityAndGovernorate(body.city, body.governorate)
      : { city: existing.city, governorate: existing.governorate };

    const phone = body.phone !== undefined ? body.phone?.trim() || null : existing.phone;
    const normalizedPhone = normalizePhone(phone);
    const hasPhone = Boolean(normalizedPhone);
    const mergedPhones = normalizePhones([phone, ...(existing.phones || [])]);

    const email = body.email !== undefined ? body.email?.trim() || null : existing.email;
    const normalizedEmail = normalizeEmail(email);
    const hasEmail = Boolean(normalizedEmail);

    const website = body.website !== undefined ? body.website?.trim() || null : existing.website;
    const normalizedDomain = normalizeDomain(website);
    const websiteStatus =
      body.websiteStatus || (!normalizedDomain ? 'NO_WEBSITE' : existing.websiteStatus);

    const facebook =
      body.facebook !== undefined ? body.facebook?.trim() || null : existing.facebook;
    const normalizedFacebook = normalizeSocialUrl(facebook, 'FACEBOOK');
    const hasFacebook = Boolean(facebook);

    const instagram =
      body.instagram !== undefined ? body.instagram?.trim() || null : existing.instagram;
    const normalizedInstagram = normalizeSocialUrl(instagram, 'INSTAGRAM');
    const hasInstagram = Boolean(instagram);

    const reviewCount =
      body.reviewCount !== undefined ? Number(body.reviewCount) : existing.reviewCount;
    const branchCount =
      body.branchCount !== undefined ? Number(body.branchCount) : existing.branchCount;
    const rating = body.rating !== undefined ? Number(body.rating) : existing.rating;
    const isVerified =
      body.isVerified !== undefined ? Boolean(body.isVerified) : existing.isVerified;
    const isRecentlyActive =
      body.isRecentlyActive !== undefined
        ? Boolean(body.isRecentlyActive)
        : existing.isRecentlyActive;
    const leadType = body.leadType || existing.leadType;
    const exclusive = leadType === 'EXCLUSIVE';
    const maxPurchasers = exclusive
      ? 1
      : body.maxPurchasers !== undefined
      ? Number(body.maxPurchasers)
      : existing.maxPurchasers;

    const now = new Date();
    const editStartMs = Date.now();
    const area = body.area !== undefined ? body.area : existing.area;
    const address = body.address !== undefined ? body.address : existing.address;
    const normalizedAddress =
      body.address !== undefined ? normalizeAddress(body.address) : existing.normalizedAddress;
    const estimatedBudget =
      body.estimatedBudget !== undefined && body.estimatedBudget !== null
        ? Number(body.estimatedBudget)
        : existing.estimatedBudget;
    const minBudget =
      body.minBudget !== undefined
        ? body.minBudget === null
          ? null
          : Number(body.minBudget)
        : existing.minBudget;
    const maxBudget =
      body.maxBudget !== undefined
        ? body.maxBudget === null
          ? null
          : Number(body.maxBudget)
        : existing.maxBudget;
    const budgetCurrency =
      body.budgetCurrency !== undefined ? String(body.budgetCurrency) : existing.budgetCurrency;
    const budgetType =
      body.budgetType !== undefined ? String(body.budgetType) : existing.budgetType;
    const requiredService =
      body.requiredService !== undefined
        ? body.requiredService
          ? String(body.requiredService)
          : null
        : existing.requiredService;
    const requiredServices = Array.isArray(body.requiredServices)
      ? body.requiredServices.map(String)
      : existing.requiredServices;
    const projectLeadType =
      body.projectLeadType !== undefined
        ? body.projectLeadType
          ? String(body.projectLeadType)
          : null
        : existing.projectLeadType;

    const generatedKeys = generateCanonicalIdentityKeys({
      businessName,
      normalizedName,
      city,
      address,
      normalizedAddress,
      phone,
      normalizedPhone,
      normalizedPhones: mergedPhones,
      email,
      normalizedEmail,
      website,
      normalizedDomain,
      facebook,
      normalizedFacebook,
      instagram,
      normalizedInstagram,
      source: existing.source,
    });
    const combinedIdentityKeys = Array.from(
      new Set([...(existing.canonicalIdentityKeys || []), ...generatedKeys.allKeys])
    );

    const scoreRes = calculateLeadScore(
      {
        isVerified,
        websiteStatus,
        website,
        normalizedDomain,
        websiteAnalysis: existing.websiteAnalysis as Record<string, unknown> | null,
        hasFacebook,
        facebook,
        hasInstagram,
        instagram,
        hasPhone,
        phone,
        normalizedPhone,
        hasEmail,
        email,
        normalizedEmail,
        branchCount,
        reviewCount,
        rating,
        isRecentlyActive,
        category,
        city,
        governorate,
        area,
        estimatedBudget,
        source: existing.source,
        sourceList: existing.sourceList,
        lastVerifiedAt: now,
      },
      rulesToUse,
      {
        scoringVersion: scoringContext.scoringVersion,
        thresholds: scoringContext.thresholds,
        calculatedAt: now,
      }
    );

    const shouldCreateSnapshot = hasScoreMateriallyChanged(latestSnapshot, scoreRes);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.lead.update({
        where: { id: leadId },
        data: {
          businessName,
          normalizedName,
          category,
          governorate,
          city,
          area,
          address,
          normalizedAddress,
          phone,
          normalizedPhone,
          phones: mergedPhones,
          hasPhone,
          email,
          normalizedEmail,
          hasEmail,
          website,
          normalizedDomain,
          websiteStatus,
          facebook,
          normalizedFacebook,
          hasFacebook,
          instagram,
          normalizedInstagram,
          hasInstagram,
          rating,
          reviewCount,
          branchCount,
          estimatedBudget,
          minBudget,
          maxBudget,
          budgetCurrency,
          budgetType,
          requiredService,
          requiredServices,
          projectLeadType,
          isVerified,
          isRecentlyActive,
          leadType,
          exclusive,
          maxPurchasers,
          canonicalIdentityKeys: combinedIdentityKeys,
          status: body.status || existing.status,
          score: scoreRes.normalizedScore,
          temperature: scoreRes.temperature,
          scoringVersion: scoreRes.scoringVersion,
          scoreExplanation: scoreRes.explanation as unknown as object,
          confidence: scoreRes.confidence,
          qualificationReasons: scoreRes.qualificationReasons,
          qualificationRules: scoreRes.qualificationRules as unknown as object,
          lastVerifiedAt: now,
          lastScoredAt: now,
        },
      });

      for (const keyRec of generatedKeys.records) {
        await tx.leadIdentity
          .upsert({
            where: {
              leadId_canonicalKey: {
                leadId,
                canonicalKey: keyRec.canonicalKey,
              },
            },
            update: {
              isPrimary: keyRec.isPrimary,
            },
            create: {
              leadId,
              keyType: keyRec.keyType,
              keyValue: keyRec.keyValue,
              canonicalKey: keyRec.canonicalKey,
              source: existing.source,
              isPrimary: keyRec.isPrimary,
            },
          })
          .catch(() => null);
      }

      if (shouldCreateSnapshot) {
        await tx.leadScore.create({
          data: {
            leadId,
            previousScore: latestSnapshot ? latestSnapshot.normalizedScore : existing.score,
            rawScore: scoreRes.rawScore,
            normalizedScore: scoreRes.normalizedScore,
            newScore: scoreRes.normalizedScore,
            previousClassification: latestSnapshot
              ? latestSnapshot.temperature
              : existing.temperature,
            temperature: scoreRes.temperature,
            newClassification: scoreRes.classification,
            scoringVersion: scoreRes.scoringVersion,
            trigger: 'LEAD_UPDATED',
            appliedRules: scoreRes.appliedRules as unknown as object,
            evaluatedRules: scoreRes.evaluatedRules as unknown as object,
            explanation: scoreRes.explanation as unknown as object,
            qualificationReasons: scoreRes.qualificationReasons,
            calculatedAt: now,
            evaluatedAt: now,
          },
        });
      }

      return u;
    });

    logScoringOperation({
      event: 'LEAD_SCORE_EVALUATED',
      leadId,
      scoringVersion: scoreRes.scoringVersion,
      previousScore: latestSnapshot ? latestSnapshot.normalizedScore : existing.score,
      newScore: scoreRes.normalizedScore,
      previousClassification: latestSnapshot ? latestSnapshot.temperature : existing.temperature,
      classification: scoreRes.classification,
      trigger: 'LEAD_UPDATED',
      durationMs: Date.now() - editStartMs,
      rulesApplied: scoreRes.appliedRules.map((r) => r.ruleKey),
    });

    await recalculateAndPersistLeadQuality(leadId, { now });
    await invalidateAndRecalculateLeadMatches(leadId);
    const finalUpdated = await prisma.lead.findUnique({ where: { id: leadId } });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_LEAD_UPDATED',
        entityType: 'Lead',
        entityId: leadId,
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      lead: finalUpdated || updated,
      scoreResult: scoreRes,
      snapshotCreated: shouldCreateSnapshot,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('PATCH /api/admin/leads/[id] error:', err);
    return NextResponse.json({ error: 'تعذر تحديث بيانات الفرصة.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  return PATCH(req, context);
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
    const leadId = params.id;

    await prisma.lead.delete({ where: { id: leadId } });

    await createAuditLog(
      {
        userId: admin.id,
        action: 'ADMIN_LEAD_DELETED',
        entityType: 'Lead',
        entityId: leadId,
      },
      prisma
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر حذف الفرصة.' }, { status: 500 });
  }
}

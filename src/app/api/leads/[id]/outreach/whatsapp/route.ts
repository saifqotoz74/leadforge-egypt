import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { applySecurityHeaders } from '@/lib/security';
import {
  generateEgyptianPitchTemplates,
  normalizeEgyptianPhone,
  buildWhatsAppDirectUrl,
  OutreachMode,
} from '@/lib/outreach/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);

    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        governorate: true,
        phone: true,
        website: true,
        websiteStatus: true,
        claims: {
          where: { userId: user.id },
          select: { id: true, status: true, pipelineStatus: true, nextFollowUpAt: true },
        },
      },
    });

    if (!lead) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'الفرصة غير موجودة.' }, { status: 404 })
      );
    }

    const isClaimedByMe = lead.claims.length > 0 || user.role === 'ADMIN';
    if (!isClaimedByMe) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'يجب حجز أو اقتناص الفرصة أولاً للوصول لبيانات التواصل ومحادثات واتساب.' },
          { status: 403 }
        )
      );
    }

    const devProfile = await prisma.developerProfile.findUnique({
      where: { userId: user.id },
      select: { companyName: true },
    });

    const mode = (req.nextUrl.searchParams.get('mode') as OutreachMode) || 'PERMISSION_BASED';
    const portfolioUrl = req.nextUrl.searchParams.get('portfolioUrl') || undefined;

    const normPhone = normalizeEgyptianPhone(lead.phone);
    const { recommendedId, templates } = generateEgyptianPitchTemplates({
      businessName: lead.businessName,
      category: lead.category,
      city: lead.city,
      governorate: lead.governorate,
      website: lead.website,
      websiteStatus: lead.websiteStatus,
      developerName: user.name,
      companyName: devProfile?.companyName || undefined,
      portfolioUrl,
      mode,
    });

    const defaultTemplate = templates.find((t) => t.id === recommendedId) || templates[0];
    const defaultWhatsAppUrl = buildWhatsAppDirectUrl(normPhone.waPhone, defaultTemplate.text);

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        lead: {
          id: lead.id,
          businessName: lead.businessName,
          category: lead.category,
          city: lead.city,
          phone: normPhone.displayFormatted,
          rawPhone: lead.phone,
          waPhone: normPhone.waPhone,
          isValidPhone: normPhone.isValidEgyptianMobile,
          nextFollowUpAt: lead.claims[0]?.nextFollowUpAt || null,
        },
        recommendedId,
        templates,
        defaultWhatsAppUrl,
      })
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json({ error: err.message }, { status: err.statusCode })
      );
    }
    console.error('GET /api/leads/[id]/outreach/whatsapp error:', err);
    return applySecurityHeaders(
      NextResponse.json({ error: 'حدث خطأ أثناء إعداد بيانات التواصل.' }, { status: 500 })
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 })
      );
    }

    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : 'CUSTOM';
    const mode: OutreachMode = body.mode === 'DIRECT_LINK' ? 'DIRECT_LINK' : 'PERMISSION_BASED';
    const pitchType = body.pitchType === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'INITIAL';
    const followUpHours = Math.max(12, Math.min(Number(body.followUpHours) || 48, 168)); // 12h to 7 days, default 48h

    const claim = await prisma.leadClaim.findFirst({
      where: {
        leadId: params.id,
        userId: user.id,
      },
      include: {
        lead: true,
      },
    });

    if (!claim && user.role !== 'ADMIN') {
      return applySecurityHeaders(
        NextResponse.json(
          { error: 'يجب اقتناص الفرصة أولاً للبدء في التواصل.' },
          { status: 403 }
        )
      );
    }

    const lead = claim?.lead || (await prisma.lead.findUnique({ where: { id: params.id } }));
    if (!lead || !lead.phone) {
      return applySecurityHeaders(
        NextResponse.json({ error: 'رقم هاتف العميل غير متوفر.' }, { status: 400 })
      );
    }

    const normPhone = normalizeEgyptianPhone(lead.phone);
    const finalUrl = buildWhatsAppDirectUrl(normPhone.waPhone, message);

    // If claim exists, log ContactAttempt, advance pipeline, and schedule 48h follow-up
    if (claim) {
      const now = new Date();
      const nextFollowUpAt = new Date(now.getTime() + followUpHours * 60 * 60 * 1000);

      // Ensure Engagement exists
      let engagement = await prisma.leadEngagement.findUnique({
        where: { claimId: claim.id },
      });

      if (!engagement) {
        engagement = await prisma.leadEngagement.create({
          data: {
            leadId: lead.id,
            developerId: user.id,
            claimId: claim.id,
            currentStatus: 'CLAIMED',
          },
        });
      }

      // Create ContactAttempt record
      await prisma.contactAttempt.create({
        data: {
          engagementId: engagement.id,
          leadId: lead.id,
          developerId: user.id,
          claimId: claim.id,
          channel: 'WHATSAPP',
          result: 'MESSAGE_SENT',
          note:
            pitchType === 'FOLLOW_UP'
              ? `متابعة عبر واتساب (بعد ${followUpHours} ساعة) باستخدام قالب: ${templateId}`
              : `تواصل أولي عبر واتساب (${mode === 'PERMISSION_BASED' ? 'استئذان ذكي بدون روابط' : 'عرض مباشر مع رابط'}) باستخدام قالب: ${templateId}`,
          metadata: {
            templateId,
            mode,
            pitchType,
            followUpHours,
            nextFollowUpAt: nextFollowUpAt.toISOString(),
            messagePreview: message.substring(0, 100),
            phone: normPhone.displayFormatted,
          },
        },
      });

      // Update Claim contact timestamps, next follow-up date, and advance pipeline status
      const newPipelineStatus =
        claim.pipelineStatus === 'NEW' || claim.pipelineStatus === 'CLAIMED'
          ? 'CONTACTED'
          : claim.pipelineStatus;

      await prisma.leadClaim.update({
        where: { id: claim.id },
        data: {
          lastContactedAt: now,
          nextFollowUpAt,
          pipelineStatus: newPipelineStatus,
        },
      });

      if (engagement) {
        await prisma.leadEngagement.update({
          where: { id: engagement.id },
          data: {
            lastContactedAt: now,
            firstContactedAt: engagement.firstContactedAt || now,
            currentStatus:
              engagement.currentStatus === 'CLAIMED' ? 'CONTACTED' : engagement.currentStatus,
          },
        });
      }
    }

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        whatsappUrl: finalUrl,
        phone: normPhone.displayFormatted,
      })
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return applySecurityHeaders(
        NextResponse.json({ error: err.message }, { status: err.statusCode })
      );
    }
    console.error('POST /api/leads/[id]/outreach/whatsapp error:', err);
    return applySecurityHeaders(
      NextResponse.json({ error: 'تعذر تسجيل محاولة التواصل.' }, { status: 500 })
    );
  }
}

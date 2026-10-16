import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildDeterministicTalkTrack, generatePdfBuffer, LeadReportData } from '@/lib/pdf-report';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true, status: true, sessionsRevokedBefore: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.status === 'SUSPENDED') {
      return NextResponse.json(
        { error: 'Forbidden: Account suspended', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (
      user.sessionsRevokedBefore &&
      (session.iatMs ?? 0) <= new Date(user.sessionsRevokedBefore).getTime()
    ) {
      return NextResponse.json({ error: 'Unauthorized: Session revoked' }, { status: 401 });
    }

    const leadId = params.id;
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Verify developer ownership or admin access
    const isOwner = await prisma.leadClaim.findUnique({
      where: {
        leadId_userId: {
          leadId: lead.id,
          userId: session.userId,
        },
      },
    });

    if (!isOwner && session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Lead must be claimed before generating branded PDF report' },
        { status: 403 }
      );
    }

    const devProfile = await prisma.developerProfile.findUnique({
      where: { userId: session.userId },
    });

    const websiteAnalysis = lead.websiteAnalysis as any;
    const derivedRules: Array<{ label: string; points: number }> =
      websiteAnalysis?.opportunityReasons?.map((op: any) => ({
        label: op.reasonAr || op.code,
        points: op.points || 0,
      })) ||
      (lead.qualificationReasons || []).map((r: string) => ({
        label: r,
        points: 10,
      }));

    const talkTrack = buildDeterministicTalkTrack({
      websiteStatus: lead.websiteStatus,
      reviewCount: lead.reviewCount,
      branchCount: lead.branchCount,
      category: lead.category,
      city: lead.city,
      score: lead.score,
    });

    const reportData: LeadReportData = {
      developerName: devProfile?.companyName || user?.name || session.name || 'Web Developer',
      developerCompany: devProfile?.companyName || null,
      developerEmail: user?.email || session.email || null,
      developerPhone: devProfile?.phone || null,
      leadId: lead.id,
      businessName: lead.businessName,
      category: lead.category,
      governorate: lead.governorate,
      city: lead.city,
      address: lead.address,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      websiteStatus: lead.websiteStatus,
      score: lead.score,
      qualityScore: lead.qualityScore,
      temperature: lead.temperature,
      ownershipType: lead.leadType,
      reviewCount: lead.reviewCount,
      branchCount: lead.branchCount,
      estimatedBudget: lead.estimatedBudget,
      rules: derivedRules,
      talkTrack,
      generatedAt: new Date(),
    };

    const isHtmlRequested = req.nextUrl.searchParams.get('format') === 'html';

    if (isHtmlRequested) {
      const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>تقرير فرصة عميل — ${reportData.businessName}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #1B2B2B; line-height: 1.6; margin: 0; padding: 20px; direction: rtl; }
    .header { border-bottom: 2px solid #2B7A78; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 22px; font-weight: bold; color: #1D5857; }
    .meta { font-size: 13px; color: #5E7070; }
    .section { border: 1px solid #E1E9E9; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #FFFFFF; }
    .section-title { font-size: 16px; font-weight: bold; color: #0E2F2E; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid #EEF3F3; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .score-badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; background: #E8F8F7; color: #1D5857; }
    .rule-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #E1E9E9; font-size: 14px; }
    .rule-points { font-weight: bold; color: #2B7A78; direction: ltr; }
    .talk-item { margin-bottom: 8px; font-size: 14px; color: #2F3D3D; }
    .footer { font-size: 11px; color: #8A9B9B; margin-top: 30px; text-align: center; border-top: 1px solid #E1E9E9; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Leads4dev — تقرير الفرصة البيعية</div>
      <div class="meta">إعداد: ${reportData.developerName} | التاريخ: ${reportData.generatedAt.toISOString().slice(0, 10)}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">1. بيانات المنشأة والتواصل</div>
    <div class="grid">
      <div><strong>اسم النشاط:</strong> ${reportData.businessName}</div>
      <div><strong>المجال / القطاع:</strong> ${reportData.category}</div>
      <div><strong>الموقع الجغرافي:</strong> ${reportData.governorate} — ${reportData.city}</div>
      <div><strong>العنوان:</strong> ${reportData.address || 'حسب المحافظة والحي'}</div>
      <div><strong>رقم الهاتف:</strong> <span dir="ltr">${reportData.phone || 'غير متوفر (زيارة ميدانية)'}</span></div>
      <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">${reportData.email || 'غير متوفر'}</span></div>
      <div><strong>الموقع الإلكتروني:</strong> <span dir="ltr">${reportData.website || 'لا يوجد موقع (حاجة مرتفعة)'}</span></div>
      <div><strong>الميزانية التقديرية:</strong> <span dir="ltr">${reportData.estimatedBudget} ج.م</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">2. تقييم الفرصة وجودة البيانات</div>
    <div class="grid">
      <div><strong>درجة فرصة البيع:</strong> <span class="score-badge">${reportData.score} / 100 (${reportData.temperature})</span></div>
      <div><strong>درجة جودة البيانات:</strong> <span class="score-badge">${reportData.qualityScore} / 100</span></div>
      <div><strong>تقييمات العملاء:</strong> ${reportData.reviewCount} تقييم على خرائط جوجل</div>
      <div><strong>عدد الفروع:</strong> ${reportData.branchCount} فروع نشطة</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">3. أسباب ومحددات التقييم الهندسية</div>
    ${reportData.rules.map(r => `<div class="rule-item"><span>${r.label}</span><span class="rule-points">+${r.points}</span></div>`).join('')}
  </div>

  <div class="section">
    <div class="section-title">4. خطة التفاوض ومحاور الحديث المقترحة</div>
    ${reportData.talkTrack.map(t => `<div class="talk-item">• ${t}</div>`).join('')}
  </div>

  <div class="footer">
    تنويه: تم استخراج هذا التقرير بقواعد تقييم قطعية ومحددة هندسياً بدون أي تخمين أو بيانات غير موثقة.
  </div>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    const pdfBuffer = generatePdfBuffer(reportData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="lead-${lead.id}-report.pdf"`,
      },
    });
  } catch (error) {
    console.error('Failed to generate lead PDF report:', error);
    return NextResponse.json(
      { error: 'Internal server error while generating PDF report' },
      { status: 500 }
    );
  }
}

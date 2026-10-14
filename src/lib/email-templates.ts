import { dispatchTransactionalEmailSafe } from './notifications';

interface BaseTemplateParams {
  title: string;
  preheader: string;
  contentHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}

function wrapBrandedEmailLayout(params: BaseTemplateParams): string {
  const currentYear = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #FAFAF9;
      color: #1C1917;
      margin: 0;
      padding: 0;
      direction: rtl;
      text-align: right;
    }
    .wrapper {
      max-width: 580px;
      margin: 30px auto;
      background: #FFFFFF;
      border: 1px solid #E7E5E4;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: #0D9488;
      padding: 24px;
      text-align: center;
      color: #FFFFFF;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 32px 28px;
      line-height: 1.7;
      font-size: 15px;
      color: #292524;
    }
    .cta-container {
      margin: 28px 0;
      text-align: center;
    }
    .cta-button {
      background-color: #0D9488;
      color: #FFFFFF !important;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      display: inline-block;
    }
    .info-card {
      background-color: #F5F5F4;
      border: 1px solid #E7E5E4;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
    }
    .info-row {
      margin: 8px 0;
      font-size: 14px;
    }
    .info-label {
      color: #78716C;
      font-weight: 500;
    }
    .info-value {
      color: #1C1917;
      font-weight: 600;
    }
    .ltr-text {
      direction: ltr;
      display: inline-block;
      font-family: monospace;
    }
    .footer {
      background: #F5F5F4;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #78716C;
      border-top: 1px solid #E7E5E4;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${params.preheader}
  </div>
  <div class="wrapper">
    <div class="header">
      <h1>LeadForge Egypt</h1>
      <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">leads4dev.com</div>
    </div>
    <div class="content">
      ${params.contentHtml}
      ${params.ctaUrl && params.ctaText ? `
      <div class="cta-container">
        <a href="${params.ctaUrl}" class="cta-button" target="_blank">${params.ctaText}</a>
      </div>
      ` : ''}
      ${params.footerNote ? `
      <p style="font-size: 13px; color: #78716C; margin-top: 20px;">
        ${params.footerNote}
      </p>
      ` : ''}
    </div>
    <div class="footer">
      <p style="margin: 0 0 6px 0;">هذه الرسالة تم إرسالها تلقائياً من منصة LeadForge Egypt.</p>
      <p style="margin: 0;">جميع الحقوق محفوظة © ${currentYear} LeadForge</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Password Reset Email
 */
export async function sendPasswordResetEmailSafe(params: {
  email: string;
  resetUrl: string;
}): Promise<void> {
  const html = wrapBrandedEmailLayout({
    title: 'استعادة كلمة المرور',
    preheader: 'رابط استعادة كلمة المرور لحسابك في LeadForge Egypt',
    contentHtml: `
      <h2 style="margin-top:0; color:#1C1917; font-size:18px;">طلب استعادة كلمة المرور</h2>
      <p>مرحباً،</p>
      <p>تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك المسجل بهذا البريد الإلكتروني. يمكنك تعيين كلمة مرور جديدة بالنقر على الزر أدناه:</p>
    `,
    ctaText: 'إعادة تعيين كلمة المرور الآن',
    ctaUrl: params.resetUrl,
    footerNote: 'هذا الرابط صالح لمدة <strong>30 دقيقة فقط</strong> وسينتهي تلقائياً بعد ذلك. إذا لم تطلب استعادة كلمة المرور، يمكنك تجاهل هذا البريد بأمان.',
  });

  const text = `استعادة كلمة المرور لحسابك في LeadForge Egypt:\n\nلإعادة تعيين كلمة المرور، يرجى فتح الرابط التالي (صالح لمدة 30 دقيقة):\n${params.resetUrl}\n\nإذا لم تطلب هذا، يرجى تجاهل هذه الرسالة.`;

  // Asynchronous non-blocking dispatch
  setImmediate(async () => {
    try {
      await dispatchTransactionalEmailSafe({
        message: {
          to: params.email,
          subject: 'استعادة كلمة المرور - LeadForge Egypt',
          bodyText: text,
          bodyHtml: html,
        },
      });
    } catch (err) {
      console.error('[Email Dispatch] Failed to send password reset email:', err);
    }
  });
}

/**
 * 2. Welcome Email on Registration
 */
export async function sendWelcomeEmailSafe(params: {
  email: string;
  name: string;
}): Promise<void> {
  const loginUrl = `${process.env.APP_URL || 'https://www.leads4dev.com'}/login`;
  const leadsUrl = `${process.env.APP_URL || 'https://www.leads4dev.com'}/leads`;

  const html = wrapBrandedEmailLayout({
    title: 'مرحباً بك في LeadForge Egypt',
    preheader: 'تم إنشاء حسابك بنجاح في LeadForge Egypt - منصة فرص المطورين',
    contentHtml: `
      <h2 style="margin-top:0; color:#1C1917; font-size:18px;">أهلاً بك يا ${params.name}! 👋</h2>
      <p>يسعدنا انضمامك إلى <strong>LeadForge Egypt</strong>، المنصة الأولى في مصر المخصصة لمطوري الويب ووكالات البرمجة للحصول على فرص حقيقية ومؤهلة للأنشطة والشركات المصرية.</p>
      <div class="info-card">
        <div class="info-row"><span class="info-label">حسابك: </span><span class="info-value ltr-text">${params.email}</span></div>
        <div class="info-row"><span class="info-label">الرصيد المبدئي: </span><span class="info-value">150 نقطة مجانية لاختيار الفرص</span></div>
        <div class="info-row"><span class="info-label">الفرص المتاحة: </span><span class="info-value">أنشطة موثقة بدون مواقع أو تحتاج تطوير وتطبيقات</span></div>
      </div>
      <p>يمكنك الآن تصفح قائمة الفرص المتاحة، فحص تفاصيل الأنشطة في محافظتك، والبدء في التواصل مع العملاء.</p>
    `,
    ctaText: 'تصفح الفرص المتاحة الآن',
    ctaUrl: leadsUrl,
  });

  const text = `مرحباً بك يا ${params.name} في LeadForge Egypt!\n\nتم إنشاء حسابك بنجاح. يمكنك تسجيل الدخول والبدء في تصفح الفرص عبر الرابط:\n${leadsUrl}`;

  setImmediate(async () => {
    try {
      await dispatchTransactionalEmailSafe({
        message: {
          to: params.email,
          subject: 'مرحباً بك في LeadForge Egypt 🚀',
          bodyText: text,
          bodyHtml: html,
        },
      });
    } catch (err) {
      console.error('[Email Dispatch] Failed to send welcome email:', err);
    }
  });
}

/**
 * 3. Lead Claim Confirmation Email
 */
export async function sendLeadClaimedEmailSafe(params: {
  email: string;
  name: string;
  businessName: string;
  phone: string;
  city: string;
  estimatedBudget?: number | null;
  leadId: string;
}): Promise<void> {
  const leadDetailsUrl = `${process.env.APP_URL || 'https://www.leads4dev.com'}/leads/${params.leadId}`;

  const html = wrapBrandedEmailLayout({
    title: 'تأكيد حجز الفرصة',
    preheader: `تم حجز الفرصة بنجاح: ${params.businessName}`,
    contentHtml: `
      <h2 style="margin-top:0; color:#1C1917; font-size:18px;">تم تأكيد حجز الفرصة بنجاح ✅</h2>
      <p>مرحباً ${params.name}،</p>
      <p>لقد قمت بحجز فرصة <strong>"${params.businessName}"</strong> بنجاح. إليك بيانات التواصل المباشرة لبدء المتابعة:</p>
      <div class="info-card">
        <div class="info-row"><span class="info-label">النشاط: </span><span class="info-value">${params.businessName}</span></div>
        <div class="info-row"><span class="info-label">الهاتف المباشر: </span><span class="info-value ltr-text">${params.phone}</span></div>
        <div class="info-row"><span class="info-label">الموقع: </span><span class="info-value">${params.city}</span></div>
        ${params.estimatedBudget ? `<div class="info-row"><span class="info-label">الميزانية التقديرية: </span><span class="info-value ltr-text">${params.estimatedBudget.toLocaleString()} EGP</span></div>` : ''}
      </div>
      <p>نوصيك بالتواصل مع العميل خلال 24 ساعة لتقديم عرض احترافي ومناسب لاحتياجات مشروعه.</p>
    `,
    ctaText: 'عرض تفاصيل وملاحظات الفرصة',
    ctaUrl: leadDetailsUrl,
  });

  const text = `تم تأكيد حجز الفرصة: ${params.businessName}\nالهاتف: ${params.phone}\nالموقع: ${params.city}\nرابط الفرصة: ${leadDetailsUrl}`;

  setImmediate(async () => {
    try {
      await dispatchTransactionalEmailSafe({
        message: {
          to: params.email,
          subject: `تم حجز الفرصة: ${params.businessName} - LeadForge Egypt`,
          bodyText: text,
          bodyHtml: html,
        },
      });
    } catch (err) {
      console.error('[Email Dispatch] Failed to send lead claimed email:', err);
    }
  });
}

/**
 * 4. New Matching Leads Alert Email
 */
export async function sendMatchingLeadsAlertEmailSafe(params: {
  email: string;
  name: string;
  count: number;
  city?: string;
}): Promise<void> {
  const leadsUrl = `${process.env.APP_URL || 'https://www.leads4dev.com'}/leads`;

  const html = wrapBrandedEmailLayout({
    title: 'تنبيه فرص جديدة',
    preheader: `تم رصد ${params.count} فرص جديدة متوافقة مع تخصصك`,
    contentHtml: `
      <h2 style="margin-top:0; color:#1C1917; font-size:18px;">فرص جديدة متوافقة مع تخصصك 🔔</h2>
      <p>مرحباً ${params.name}،</p>
      <p>تم رصد <strong>${params.count} فرص تجارية جديدة</strong> في نظام LeadForge تتوافق مع معاييرك وتخصصك التقني ${params.city ? `في منطقة ${params.city}` : ''}.</p>
      <p>الفرص متاحة الآن للاستعراض والحجز قبل اكتمال عدد المطورين المسموح به لكل فرصة.</p>
    `,
    ctaText: 'تصفح الفرص الجديدة الآن',
    ctaUrl: leadsUrl,
  });

  const text = `تم رصد ${params.count} فرص جديدة متوافقة مع تخصصك في LeadForge Egypt!\nلتصفح الفرص: ${leadsUrl}`;

  setImmediate(async () => {
    try {
      await dispatchTransactionalEmailSafe({
        message: {
          to: params.email,
          subject: `تم رصد ${params.count} فرص جديدة متوافقة معك - LeadForge Egypt`,
          bodyText: text,
          bodyHtml: html,
        },
      });
    } catch (err) {
      console.error('[Email Dispatch] Failed to send matching leads alert email:', err);
    }
  });
}

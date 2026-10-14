import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dispatchTransactionalEmailSafe } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'غير مصرح لك بتنفيذ هذا الاختبار (يتطلب صلاحيات الأدمن).', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetEmail = typeof body?.email === 'string' && body.email.includes('@')
      ? body.email.trim()
      : user.email;

    const apiKey = process.env.EMAIL_API_KEY?.trim();
    const fromAddress = process.env.EMAIL_FROM?.trim() || 'LeadForge Egypt <notifications@leads4dev.com>';

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'مفتاح EMAIL_API_KEY غير موجود في متغيرات البيئة.',
      }, { status: 400 });
    }

    const result = await dispatchTransactionalEmailSafe({
      message: {
        to: targetEmail,
        subject: 'اختبار تشغيل البريد الإلكتروني - LeadForge Egypt 🚀',
        bodyText: `هذه رسالة اختبارية لتأكيد عمل ربط Resend وتوثيق الدومين بنجاح لمنصة LeadForge Egypt.\nالمستلم: ${targetEmail}`,
        bodyHtml: `
          <div style="font-family: sans-serif; direction: rtl; text-align: right; padding: 20px; background: #fafaf9;">
            <div style="max-width: 500px; margin: auto; background: white; padding: 24px; border-radius: 8px; border: 1px solid #e7e5e4;">
              <h2 style="color: #0D9488; margin-top: 0;">LeadForge Egypt</h2>
              <p>مرحباً،</p>
              <p>هذه رسالة اختبارية لتأكيد أن ربط <strong>Resend</strong> وتوثيق الدومين يعملان بشكل سليم 100%.</p>
              <div style="background: #f5f5f4; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0;">
                <div>From: ${fromAddress}</div>
                <div>To: ${targetEmail}</div>
                <div>Status: Connected</div>
              </div>
              <p style="color: #78716c; font-size: 12px;">تاريخ الإرسال: ${new Date().toLocaleString('ar-EG')}</p>
            </div>
          </div>
        `,
      },
      idempotencyKey: `test-email-${Date.now()}`,
    });

    return NextResponse.json({
      success: result.delivered,
      messageId: result.messageId,
      delivered: result.delivered,
      targetEmail,
      fromAddress,
      errorMessage: result.errorMessage || null,
      instructions: result.delivered
        ? 'تم إرسال الرسالة بنجاح عبر Resend!'
        : 'فشل الإرسال. إذا كان الخطأ متعلقاً بعدم توثيق الدومين، يرجى إضافة سجلات DNS الخاصة بـ Resend في لوحة تحكم الدومين.',
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'حدث خطأ أثناء إرسال البريد الاختباري.',
    }, { status: 500 });
  }
}

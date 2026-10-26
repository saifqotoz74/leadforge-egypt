import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Registration & Email Verification Clarity Suite', () => {
  const arMessages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/messages/ar.json'), 'utf8')
  );
  const enMessages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/messages/en.json'), 'utf8')
  );
  const verifyEmailPageSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/verify-email/page.tsx'),
    'utf8'
  );
  const appShellSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/domain/AppShell.tsx'),
    'utf8'
  );
  const onboardingSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/onboarding/page.tsx'),
    'utf8'
  );

  it('1. verifies AppShell and Onboarding display localized reminder that browsing is permitted while claiming requires verification', () => {
    // Both AppShell and Onboarding should use the localized keys
    expect(enMessages.common.emailBannerUnverified).toContain(
      'You can browse leads freely, but unlocking contact details requires email verification'
    );
    expect(arMessages.common.emailBannerUnverified).toContain(
      'يمكنك تصفح واستكشاف الفرص بحرية، لكن اقتناص الفرص وفحص بيانات التواصل يتطلب تأكيد بريدك'
    );

    expect(enMessages.common.verificationReminderDesc).toContain(
      'You can freely customize your preferences and browse qualified leads, but claiming contact details requires a verified email address'
    );
    expect(arMessages.common.verificationReminderDesc).toContain(
      'يمكنك ضبط تفضيلاتك وتصفح الفرص بحرية، لكن اقتناص الفرص وعرض أرقام الهواتف يتطلب تأكيد بريدك الإلكتروني'
    );

    expect(appShellSrc).toContain("tCommon('emailBannerUnverified')");
    expect(onboardingSrc).toContain("tCommon('verificationReminderTitle')");
    expect(onboardingSrc).toContain("tCommon('verificationReminderDesc'");
  });

  it('2. verifies 60-second cooldown state and action feedback are localized in AR and EN', () => {
    expect(enMessages.common.resendCooldownAction).toBe('Please wait {seconds}s');
    expect(arMessages.common.resendCooldownAction).toBe('يرجى الانتظار {seconds} ثانية');

    expect(enMessages.common.resendSuccessAction).toBe('Verification link sent ✓');
    expect(arMessages.common.resendSuccessAction).toBe('تم إرسال رابط التأكيد بنجاح ✓');

    expect(enMessages.common.resendVerificationAction).toBe('Send verification link');
    expect(arMessages.common.resendVerificationAction).toBe('إرسال رابط التأكيد الآن');
  });

  it('3. verifies verify-email page is fully internationalized across all states', () => {
    // verifyEmail namespace in messages
    expect(enMessages.verifyEmail).toBeDefined();
    expect(arMessages.verifyEmail).toBeDefined();

    expect(enMessages.verifyEmail.successTitle).toBe('Email verified successfully!');
    expect(arMessages.verifyEmail.successTitle).toBe('تم تأكيد البريد الإلكتروني بنجاح!');

    expect(enMessages.verifyEmail.requiredDesc).toContain('You can browse all qualified opportunities freely');
    expect(arMessages.verifyEmail.requiredDesc).toContain('يمكنك تصفح جميع الفرص المؤهلة بحرية');

    // verify-email component uses next-intl useTranslations
    expect(verifyEmailPageSrc).toContain("useTranslations('verifyEmail')");
    expect(verifyEmailPageSrc).toContain("tVerify('verifyingTitle')");
    expect(verifyEmailPageSrc).toContain("tVerify('successTitle')");
    expect(verifyEmailPageSrc).toContain("tVerify('requiredTitle')");
    expect(verifyEmailPageSrc).toContain("tVerify('resendAction')");
  });

  it('4. enforces Zero AI Policy on verify-email page: no Sparkles or magic wands', () => {
    expect(verifyEmailPageSrc).not.toContain('Sparkles');
    expect(verifyEmailPageSrc).not.toContain('Wand');
    expect(verifyEmailPageSrc).not.toContain('ai-');
  });

  it('5. enforces design tokens, Western digits, tabular-nums and logical properties', () => {
    // No hardcoded rose-50 or teal-50
    expect(verifyEmailPageSrc).not.toContain('bg-rose-50');
    expect(verifyEmailPageSrc).not.toContain('bg-teal-50');
    expect(verifyEmailPageSrc).not.toContain('rounded-2xl');

    // Tabular numbers and ltr-iso for cooldown
    expect(verifyEmailPageSrc).toContain('tabular-nums');
    expect(verifyEmailPageSrc).toContain('ltr-iso');

    // Directional mirroring for icons
    expect(verifyEmailPageSrc).toContain('rtl:-scale-x-100');
  });
});

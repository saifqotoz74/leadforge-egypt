import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Subscription & Payment Notice SLA Verification', () => {
  it('does not contain unsupported 24-48 hours turnaround promises in subscription page', () => {
    const subscriptionPagePath = path.resolve(__dirname, '../src/app/subscription/page.tsx');
    const content = fs.readFileSync(subscriptionPagePath, 'utf-8');

    // Assert that unsupported SLA promises (24-48 hours, 24-48 ساعة) have been eliminated
    expect(content).not.toMatch(/24[-–]48\s*(?:hours|ساعة)/i);
    expect(content).not.toMatch(/خلال\s*24[-–]48/i);
    expect(content).not.toMatch(/target\s*24[-–]48/i);

    // Assert that the pending confirmation message is properly preserved
    expect(content).toContain('Bank Transfer Under Review');
    expect(content).toContain('طلب التحويل البنكي قيد المراجعة اليدوية');
    expect(content).toContain('is currently under review. Credits will be added once confirmed.');
    expect(content).toContain('قيد المراجعة حالياً. ستتم إضافة النقاط وتفعيل الباقة فور التأكيد.');
  });

  it('ensures TransferPaymentModal does not promise unconfirmed review SLAs', () => {
    const modalPath = path.resolve(__dirname, '../src/components/domain/TransferPaymentModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');

    expect(content).not.toMatch(/24[-–]48\s*(?:hours|ساعة)/i);
    expect(content).not.toMatch(/خلال\s*24[-–]48/i);
  });
});

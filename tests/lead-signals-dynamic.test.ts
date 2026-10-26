import { describe, expect, it } from 'vitest';
import { getEffectiveLeadSignals } from '../src/lib/lead-signals';

describe('Dynamic Lead Scoring Signal Badges (GAP-03 / Truthfulness)', () => {
  it('localizes raw qualificationReasons when present', () => {
    const lead = {
      qualificationReasons: [
        '+20 لا يوجد موقع إلكتروني (No website found)',
        '+15 هاتف فعال وموثق (Active phone)',
      ],
    };

    const arabicSignals = getEffectiveLeadSignals(lead, 'ar');
    expect(arabicSignals).toEqual([
      '+20 لا يوجد موقع إلكتروني',
      '+15 هاتف فعال وموثق',
    ]);

    const englishSignals = getEffectiveLeadSignals(lead, 'en');
    expect(englishSignals).toEqual([
      '+20 No website found',
      '+15 Active phone',
    ]);
  });

  describe('Truthful Phone Signal Derivation', () => {
    it('outputs "Validated phone" / "هاتف مفحوص" ONLY when genuine validation evidence is present', () => {
      const lead = {
        qualificationReasons: [],
        phone: '+201001234567',
        hasPhone: true,
        phoneValidationStatus: 'VALID',
      };

      const arSignals = getEffectiveLeadSignals(lead, 'ar');
      expect(arSignals).toContain('هاتف مفحوص');
      expect(arSignals).not.toContain('هاتف مؤكد');
      expect(arSignals).not.toContain('هاتف متاح');

      const enSignals = getEffectiveLeadSignals(lead, 'en');
      expect(enSignals).toContain('Validated phone');
      expect(enSignals).not.toContain('Verified phone');
      expect(enSignals).not.toContain('Phone available');
    });

    it('outputs "Phone available" / "هاتف متاح" when phone exists without validation evidence', () => {
      const lead = {
        qualificationReasons: [],
        phone: '+201001234567',
        hasPhone: true,
        phoneValidationStatus: 'UNKNOWN',
      };

      const arSignals = getEffectiveLeadSignals(lead, 'ar');
      expect(arSignals).toContain('هاتف متاح');
      expect(arSignals).not.toContain('هاتف مفحوص');
      expect(arSignals).not.toContain('هاتف مؤكد');

      const enSignals = getEffectiveLeadSignals(lead, 'en');
      expect(enSignals).toContain('Phone available');
      expect(enSignals).not.toContain('Validated phone');
      expect(enSignals).not.toContain('Verified phone');
    });

    it('omits phone signal when phone is missing (hasPhone: false, phone: null)', () => {
      const lead = {
        qualificationReasons: [],
        hasPhone: false,
        phone: null,
        phoneValidationStatus: 'UNKNOWN',
        websiteStatus: 'NO_WEBSITE',
        rating: 4.8,
        hasFacebook: true,
      };

      const arSignals = getEffectiveLeadSignals(lead, 'ar');
      expect(arSignals).not.toContain('هاتف متاح');
      expect(arSignals).not.toContain('هاتف مفحوص');
      expect(arSignals).not.toContain('هاتف مؤكد');
      expect(arSignals).toContain('لا يوجد موقع');
      expect(arSignals).toContain('★ 4.8 تقييم جوجل');
      expect(arSignals).toContain('فيسبوك نشط');
    });

    it('omits phone signal when phone is empty string and hasPhone is false', () => {
      const lead = {
        qualificationReasons: null,
        hasPhone: false,
        phone: '   ',
        phoneValidationStatus: 'INVALID',
        websiteStatus: 'POOR_WEBSITE',
        website: 'http://test.com',
        reviewCount: 30,
      };

      const enSignals = getEffectiveLeadSignals(lead, 'en');
      expect(enSignals).not.toContain('Phone available');
      expect(enSignals).not.toContain('Validated phone');
      expect(enSignals).toContain('Poor website');
      expect(enSignals).toContain('30+ reviews');
    });
  });

  describe('Signal Cap and Priority', () => {
    it('caps generated signals to a maximum of 3', () => {
      const lead = {
        qualificationReasons: [],
        websiteStatus: 'NO_WEBSITE',
        phone: '+201001234567',
        hasPhone: true,
        phoneValidationStatus: 'VALID',
        rating: 4.9,
        reviewCount: 150,
        hasFacebook: true,
      };

      const signals = getEffectiveLeadSignals(lead, 'en');
      expect(signals).toHaveLength(3);
      // Priority 1: website, Priority 2: phone, Priority 3: rating
      expect(signals).toEqual(['No website', 'Validated phone', '★ 4.9 Google']);
    });
  });
});

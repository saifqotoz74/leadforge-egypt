import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('i18n Catalog & Policy Parity Test', () => {
  const arPath = path.resolve(process.cwd(), 'src/messages/ar.json');
  const enPath = path.resolve(process.cwd(), 'src/messages/en.json');

  const ar = JSON.parse(fs.readFileSync(arPath, 'utf8'));
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

  function extractKeys(obj: any, prefix = ''): string[] {
    let keys: string[] = [];
    for (const k in obj) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        keys = keys.concat(extractKeys(obj[k], p));
      } else {
        keys.push(p);
      }
    }
    return keys;
  }

  it('has zero missing keys between ar.json and en.json', () => {
    const arKeys = new Set(extractKeys(ar));
    const enKeys = new Set(extractKeys(en));

    const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
    const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));

    expect(missingInAr).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it('contains no raw unparsed XML tags inside FAQ items that could break plain string rendering', () => {
    const faqKeys = ['landing.faqA8', 'pricing.faqA8', 'landing.faqA4', 'pricing.faqA4'];
    for (const key of faqKeys) {
      const parts = key.split('.');
      const arVal = parts.reduce((o, i) => o?.[i], ar);
      const enVal = parts.reduce((o, i) => o?.[i], en);

      expect(arVal).toBeDefined();
      expect(enVal).toBeDefined();
      expect(arVal).not.toContain('<pct>');
      expect(arVal).not.toContain('<iso>');
      expect(enVal).not.toContain('<pct>');
      expect(enVal).not.toContain('<iso>');
    }
  });

  it('guarantees consistent refund policy wording across FAQ and commitments in both languages', () => {
    expect(ar.landing.faqA8).toContain('100 بالمائة');
    expect(ar.landing.faqA8).toContain('تأكيد عدم صحة البيانات');

    expect(en.landing.faqA8).toContain('100%');
    expect(en.landing.faqA8).toContain('confirmed invalid upon verification');
  });
});

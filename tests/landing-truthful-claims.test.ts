import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Landing Page — Truthful Product Claims Suite', () => {
  const arMessages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/messages/ar.json'), 'utf8')
  );
  const enMessages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/messages/en.json'), 'utf8')
  );
  const landingClientSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/LandingClient.tsx'),
    'utf8'
  );
  const statsSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/stats.ts'),
    'utf8'
  );

  it('1. verifies getCachedPlatformStats strictly queries non-mock, canonical records only', () => {
    // Assert prisma.lead.count enforces isMock: false, isCanonical: true
    expect(statsSrc).toContain('isMock: false');
    expect(statsSrc).toContain('isCanonical: true');
    expect(statsSrc).toContain(
      "status: { notIn: ['INVALID', 'DUPLICATE', 'NOT_SALEABLE', 'ARCHIVED'] }"
    );
  });

  it('2. verifies stats strip displays truthful beta/early-access badge in both AR and EN', () => {
    expect(enMessages.landing.statsLiveBadge).toContain('Beta');
    expect(enMessages.landing.statsLiveBadge).toBe('Beta Early Access — Verified Records');

    expect(arMessages.landing.statsLiveBadge).toContain('إطلاق تجريبي');
    expect(arMessages.landing.statsLiveBadge).toBe('إطلاق تجريبي — سجلات موثقة ومحدثة');
  });

  it('3. verifies hero card is explicitly marked as an illustrative demo', () => {
    expect(landingClientSrc).toContain("aria-label={tLanding('illustrativeExample')}");
    expect(landingClientSrc).toContain("<span>{tLanding('illustrativeExample')}</span>");

    expect(enMessages.landing.illustrativeExample).toBe('Illustrative example');
    expect(arMessages.landing.illustrativeExample).toBe('مثال توضيحي');
  });

  it('4. verifies absence of misleading scale numbers (e.g. 139 vetted businesses) and unbacked claims', () => {
    // Ensure no static "139 vetted businesses" or fabricated traction claims exist in copy
    const rawAr = JSON.stringify(arMessages);
    const rawEn = JSON.stringify(enMessages);

    expect(rawAr).not.toContain('139');
    expect(rawEn).not.toContain('139');

    // Ensure landing page does not render unverified customer testimonials
    expect(landingClientSrc).not.toContain('testimonials');
    expect(landingClientSrc).not.toContain('tLanding(\'testimonialsTitle\')');
  });

  it('5. verifies stats strip gracefully hides when all genuine metrics are zero', () => {
    // LandingClient conditionally renders stats strip only when genuine metrics > 0
    expect(landingClientSrc).toContain(
      '{stats && (stats.businessesCount > 0 || stats.citiesCount > 0 || stats.categoriesCount > 0) && ('
    );
  });
});

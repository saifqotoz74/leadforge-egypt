import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CREDIT_PRICING_CONFIG, calculateLeadCreditCost } from '@/lib/claims/pricing';

describe('Pricing — One Consistent Source of Truth Suite', () => {
  const arMessages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/messages/ar.json'), 'utf8')
  );
  const enMessages = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'src/messages/en.json'), 'utf8')
  );
  const discoveryClientSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/leads/LeadDiscoveryClient.tsx'),
    'utf8'
  );
  const leadDetailSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/leads/[id]/page.tsx'),
    'utf8'
  );

  it('1. verifies backend pricing config defaults: shared=5 credits, exclusive=25 credits, min=1', () => {
    expect(DEFAULT_CREDIT_PRICING_CONFIG.sharedLeadBaseCost).toBe(5);
    expect(DEFAULT_CREDIT_PRICING_CONFIG.exclusiveLeadBaseCost).toBe(25);
    expect(DEFAULT_CREDIT_PRICING_CONFIG.minCreditCost).toBe(1);

    // Test calculateLeadCreditCost for standard shared lead
    const sharedCost = calculateLeadCreditCost({
      id: 'test-shared',
      exclusive: false,
    });
    expect(sharedCost.creditCost).toBe(5);

    // Test calculateLeadCreditCost for exclusive lead
    const exclusiveCost = calculateLeadCreditCost({
      id: 'test-exclusive',
      exclusive: true,
    });
    expect(exclusiveCost.creditCost).toBe(25);

    // Test calculateLeadCreditCost for field visit lead (no phone)
    const fieldVisitCost = calculateLeadCreditCost({
      id: 'test-field-visit',
      creditCostReason: 'FIELD_VISIT_DISCOUNT',
    });
    expect(fieldVisitCost.creditCost).toBe(1);
  });

  it('2. verifies landing page How It Works step 3 displays 5 points (not 1 point)', () => {
    expect(enMessages.landing.howStep3ClaimStatusVal).toBe('Unlocked (5 points)');
    expect(arMessages.landing.howStep3ClaimStatusVal).toBe('تم الشراء بنجاح (5 نقاط)');
    expect(enMessages.landing.howStep3ClaimStatusVal).not.toContain('1 point');
    expect(arMessages.landing.howStep3ClaimStatusVal).not.toContain('1 نقطة');
  });

  it('3. verifies landing page Ownership & Points section displays 5 points for shared, 25 points for exclusive', () => {
    expect(enMessages.landing.ownershipCostShared).toBe('5 points');
    expect(enMessages.landing.ownershipCostExclusive).toBe('25 points');

    expect(arMessages.landing.ownershipCostShared).toBe('5 نقاط');
    expect(arMessages.landing.ownershipCostExclusive).toBe('25 نقطة');
  });

  it('4. verifies pricing page badge states 5 credits per shared lead and 25 for exclusive', () => {
    expect(enMessages.pricing.badge).toBe(
      'Clear and transparent pricing • 5 credits per shared lead, 25 for exclusive'
    );
    expect(arMessages.pricing.badge).toBe(
      'تسعير واضح وشفاف • 5 نقاط للفرصة المشتركة و25 نقطة للحصرية'
    );

    // Ensure inaccurate "1 credit = 1 qualified lead" claim is completely eliminated
    expect(enMessages.pricing.badge).not.toContain('1 credit = 1 qualified lead');
    expect(arMessages.pricing.badge).not.toContain('1 نقطة رصيد = فرصة بيعية مؤهلة واحدة');
  });

  it('5. verifies LeadDiscoveryClient and LeadDetail calculate prices uniformly (5 shared, 25 exclusive, 1 field-visit)', () => {
    // Both surfaces must use the canonical fallback: creditCost ?? (!hasPhone ? 1 : (exclusive ? 25 : 5))
    expect(discoveryClientSrc).toContain(
      'price={lead.creditCost ?? (!lead.hasPhone && !lead.phone ? 1 : (lead.exclusive ? 25 : 5))}'
    );
    expect(leadDetailSrc).toContain(
      'const price = lead.creditCost ?? (isFieldVisit ? 1 : (lead.exclusive ? 25 : 5));'
    );
  });
});

import type { LeadOwnershipType } from '@prisma/client';
import type { CreditPricingExplanation, CreditPricingFactor, LeadAccessPolicy } from './types';

export interface CreditPricingConfigInput {
  sharedLeadBaseCost: number;
  exclusiveLeadBaseCost: number;
  highOpportunityCostBonus: number;
  highOpportunityThreshold: number;
  highQualityCostBonus: number;
  highQualityThreshold: number;
  highBudgetCostBonus: number;
  highBudgetThresholdEgp: number;
  freshLeadBonus: number;
  minCreditCost: number;
  maxCreditCost: number;
  defaultClaimExpirationDays: number;
  autoRefundOnInvalidLead: boolean;
  autoRefundOnDuplicateLead: boolean;
  autoRefundOnClosedWithinHours: number;
}

export const DEFAULT_CREDIT_PRICING_CONFIG: CreditPricingConfigInput = {
  sharedLeadBaseCost: 5,
  exclusiveLeadBaseCost: 25,
  highOpportunityCostBonus: 0,
  highOpportunityThreshold: 80,
  highQualityCostBonus: 0,
  highQualityThreshold: 85,
  highBudgetCostBonus: 0,
  highBudgetThresholdEgp: 500000,
  freshLeadBonus: 0,
  minCreditCost: 1,
  maxCreditCost: 100,
  defaultClaimExpirationDays: 90,
  autoRefundOnInvalidLead: true,
  autoRefundOnDuplicateLead: true,
  autoRefundOnClosedWithinHours: 24,
};

export interface LeadPricingSubject {
  id: string;
  leadType?: LeadOwnershipType | string | null;
  accessType?: LeadOwnershipType | string | null;
  exclusive?: boolean | null;
  creditCost?: number | null;
  creditCostReason?: string | null;
  maxPurchasers?: number | null;
  currentPurchasers?: number | null;
  availableForClaim?: boolean | null;
  status?: string | null;
  saleabilityStatus?: string | null;
  score?: number | null;
  opportunityScore?: number | null;
  qualityScore?: number | null;
  freshnessStatus?: string | null;
  estimatedBudget?: number | null;
  minBudget?: number | null;
  maxBudget?: number | null;
  requiresMatching?: boolean | null;
  minClaimQualityScore?: number | null;
  minClaimOpportunityScore?: number | null;
  claimWindowEndsAt?: Date | string | null;
}

export function resolveEffectiveAccessType(
  lead: Pick<LeadPricingSubject, 'leadType' | 'accessType' | 'exclusive' | 'maxPurchasers'>
): LeadOwnershipType {
  if (lead.exclusive === true || lead.leadType === 'EXCLUSIVE' || lead.accessType === 'EXCLUSIVE') {
    return 'EXCLUSIVE';
  }
  return 'SHARED';
}

export function calculateLeadCreditCost(
  lead: LeadPricingSubject,
  config?: Partial<CreditPricingConfigInput> | null,
  options?: { legacyDefaultCostOneWhenUnset?: boolean }
): {
  creditCost: number;
  creditCostReason: string;
  explanation: CreditPricingExplanation;
} {
  const cfg: CreditPricingConfigInput = {
    ...DEFAULT_CREDIT_PRICING_CONFIG,
    ...(config ?? {}),
  };

  const accessType = resolveEffectiveAccessType(lead);
  const defaultReason = accessType === 'EXCLUSIVE' ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD';

  // 1. Explicit per-lead credit cost override
  if (typeof lead.creditCost === 'number' && Number.isFinite(lead.creditCost) && lead.creditCost > 0) {
    const finalCost = Math.max(cfg.minCreditCost, Math.min(cfg.maxCreditCost, Math.round(lead.creditCost)));
    const reason = lead.creditCostReason?.trim() || defaultReason;
    return {
      creditCost: finalCost,
      creditCostReason: reason,
      explanation: {
        baseCost: finalCost,
        baseReason: 'EXPLICIT_LEAD_COST',
        factors: [
          {
            code: 'EXPLICIT_LEAD_OVERRIDE',
            delta: 0,
            reason: `Explicit credit cost (${finalCost}) configured on lead (${reason})`,
          },
        ],
        rawTotal: finalCost,
        finalCost,
        creditCostReason: reason,
      },
    };
  }

  // 2. Legacy compatibility mode (for existing Phase 0-4 tests where lead.creditCost is unset and no CreditPricingConfig exists)
  if (options?.legacyDefaultCostOneWhenUnset) {
    return {
      creditCost: 1,
      creditCostReason: lead.creditCostReason?.trim() || defaultReason,
      explanation: {
        baseCost: 1,
        baseReason: 'LEGACY_DEFAULT_COST',
        factors: [],
        rawTotal: 1,
        finalCost: 1,
        creditCostReason: lead.creditCostReason?.trim() || defaultReason,
      },
    };
  }

  // 3. Deterministic rule-based pricing
  const baseCost = accessType === 'EXCLUSIVE' ? cfg.exclusiveLeadBaseCost : cfg.sharedLeadBaseCost;
  const baseReason = accessType === 'EXCLUSIVE' ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD';
  const factors: CreditPricingFactor[] = [];

  const oppScore = lead.opportunityScore ?? lead.score ?? 0;
  if (cfg.highOpportunityCostBonus !== 0 && oppScore >= cfg.highOpportunityThreshold) {
    factors.push({
      code: 'HIGH_OPPORTUNITY_TIER',
      delta: cfg.highOpportunityCostBonus,
      reason: `Opportunity score (${oppScore}) >= threshold (${cfg.highOpportunityThreshold})`,
    });
  }

  const qualScore = lead.qualityScore ?? 0;
  if (cfg.highQualityCostBonus !== 0 && qualScore >= cfg.highQualityThreshold) {
    factors.push({
      code: 'HIGH_QUALITY_TIER',
      delta: cfg.highQualityCostBonus,
      reason: `Quality score (${qualScore}) >= threshold (${cfg.highQualityThreshold})`,
    });
  }

  const budgetValue = lead.maxBudget ?? lead.estimatedBudget ?? lead.minBudget ?? 0;
  if (cfg.highBudgetCostBonus !== 0 && budgetValue >= cfg.highBudgetThresholdEgp) {
    factors.push({
      code: 'HIGH_BUDGET_TIER',
      delta: cfg.highBudgetCostBonus,
      reason: `Lead budget (${budgetValue} EGP) >= threshold (${cfg.highBudgetThresholdEgp} EGP)`,
    });
  }

  if (cfg.freshLeadBonus !== 0 && lead.freshnessStatus === 'FRESH') {
    factors.push({
      code: 'FRESH_LEAD_TIER',
      delta: cfg.freshLeadBonus,
      reason: 'Lead freshness status is FRESH',
    });
  }

  const factorSum = factors.reduce((acc, f) => acc + f.delta, 0);
  const rawTotal = baseCost + factorSum;
  const finalCost = Math.max(cfg.minCreditCost, Math.min(cfg.maxCreditCost, rawTotal));
  const reasonParts = [lead.creditCostReason?.trim() || baseReason, ...factors.map((f) => f.code)];
  const creditCostReason = reasonParts.join('+');

  return {
    creditCost: finalCost,
    creditCostReason,
    explanation: {
      baseCost,
      baseReason,
      factors,
      rawTotal,
      finalCost,
      creditCostReason,
    },
  };
}

export function resolveLeadAccessPolicy(
  lead: LeadPricingSubject,
  config?: Partial<CreditPricingConfigInput> | null,
  options?: { legacyDefaultCostOneWhenUnset?: boolean; now?: Date }
): LeadAccessPolicy {
  const now = options?.now ?? new Date();
  const accessType = resolveEffectiveAccessType(lead);
  const maxPurchasers =
    accessType === 'EXCLUSIVE' ? 1 : Math.max(1, lead.maxPurchasers ?? 3);
  const purchaserCount = Math.max(0, lead.currentPurchasers ?? 0);
  const { creditCost, creditCostReason } = calculateLeadCreditCost(lead, config, options);

  const claimWindowEndsAt = lead.claimWindowEndsAt
    ? lead.claimWindowEndsAt instanceof Date
      ? lead.claimWindowEndsAt
      : new Date(lead.claimWindowEndsAt)
    : null;

  const windowOpen = !claimWindowEndsAt || claimWindowEndsAt.getTime() > now.getTime();
  const isAvailableStatus = (lead.status ?? 'AVAILABLE') === 'AVAILABLE';
  const saleability = lead.saleabilityStatus ?? 'AVAILABLE';
  const isSaleable = saleability === 'AVAILABLE' || saleability === 'SALEABLE';
  const hasCapacity = purchaserCount < maxPurchasers;
  const explicitAvailable = lead.availableForClaim ?? true;

  return {
    leadId: lead.id,
    accessType,
    creditCost,
    creditCostReason,
    maxPurchasers,
    purchaserCount,
    availableForClaim: Boolean(explicitAvailable && isAvailableStatus && isSaleable && hasCapacity && windowOpen),
    requiresMatching: lead.requiresMatching ?? true,
    minQualityScore: lead.minClaimQualityScore ?? 45,
    minOpportunityScore: lead.minClaimOpportunityScore ?? 0,
    claimWindowEndsAt,
  };
}

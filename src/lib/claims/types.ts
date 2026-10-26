import type { ClaimStatus, CreditTransactionType, LeadOwnershipType } from '@prisma/client';

export type ClaimErrorCode =
  | 'UNAUTHENTICATED'
  | 'DEVELOPER_SUSPENDED'
  | 'DEVELOPER_INACTIVE'
  | 'PROFILE_NOT_FOUND'
  | 'FORBIDDEN'
  | 'NO_CREDITS_REMAINING'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'SUBSCRIPTION_REQUIRED'
  | 'SUBSCRIPTION_NOT_ELIGIBLE'
  | 'PLAN_LIMIT_REACHED'
  | 'LEAD_NOT_FOUND'
  | 'CLAIM_NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'LEAD_NOT_AVAILABLE'
  | 'LEAD_NOT_SALEABLE'
  | 'LEAD_REQUIRES_VERIFICATION'
  | 'LEAD_QUALITY_REJECTED'
  | 'LEAD_QUALITY_BELOW_THRESHOLD'
  | 'LEAD_OPPORTUNITY_BELOW_THRESHOLD'
  | 'LEAD_INVALID'
  | 'LEAD_EXPIRED'
  | 'LEAD_DUPLICATE'
  | 'LEAD_CLOSED'
  | 'LEAD_INELIGIBLE_MATCH'
  | 'LEAD_ACCESS_DENIED'
  | 'INSUFFICIENT_CREDITS'
  | 'INVALID_REFUND_REQUEST'
  | 'INVALID_CREDIT_ADJUSTMENT'
  | 'LEAD_UNAVAILABLE'
  | 'LEAD_EXCLUSIVE_ALREADY_CLAIMED'
  | 'EXCLUSIVE_LEAD_ALREADY_CLAIMED'
  | 'LEAD_SHARED_MAX_PURCHASERS_REACHED'
  | 'MAX_PURCHASERS_EXCEEDED'
  | 'LEAD_ALREADY_CLAIMED_BY_DEVELOPER'
  | 'ALREADY_CLAIMED_BY_USER'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'CONCURRENCY_CONFLICT'
  | 'CLAIM_ALREADY_REFUNDED'
  | 'EMAIL_NOT_VERIFIED'
  | 'WAIT_PERIOD_REQUIRED'
  | 'TRIAL_REFUND_LIMIT_EXCEEDED'
  | 'REFUND_REPORT_ALREADY_EXISTS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_CLAIM_ERROR';

export class ClaimEngineError extends Error {
  public readonly code: ClaimErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ClaimErrorCode,
    message: string,
    statusCode: number = 422,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClaimEngineError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface LeadAccessPolicy {
  leadId: string;
  accessType: LeadOwnershipType;
  creditCost: number;
  creditCostReason: string;
  maxPurchasers: number;
  purchaserCount: number;
  availableForClaim: boolean;
  requiresMatching: boolean;
  minQualityScore: number;
  minOpportunityScore: number;
  claimWindowEndsAt: Date | null;
}

export interface CreditPricingFactor {
  code: string;
  delta: number;
  reason: string;
}

export interface CreditPricingExplanation {
  baseCost: number;
  baseReason:
    | 'SHARED_LEAD'
    | 'EXCLUSIVE_LEAD'
    | 'EXPLICIT_LEAD_COST'
    | 'LEGACY_DEFAULT_COST'
    | 'FIELD_VISIT_DISCOUNT';
  factors: CreditPricingFactor[];
  rawTotal: number;
  finalCost: number;
  creditCostReason: string;
}

export interface ClaimLeadInput {
  leadId: string;
  developerId: string;
  idempotencyKey?: string | null;
  ipAddress?: string;
  /**
   * Used by legacy `claimLeadForDeveloper` in `src/lib/lead-service.ts` to preserve
   * exact backward compatibility with existing Phase 0-4 tests where `lead.creditCost`
   * was unset and no `CreditPricingConfig` was seeded.
   */
  legacyCompatibilityMode?: boolean;
}

export interface UnlockedLeadDetails {
  id: string;
  businessName: string;
  category: string;
  governorate: string;
  city: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  phones: string[];
  email: string | null;
  website: string | null;
  websiteStatus: string;
  facebook: string | null;
  instagram: string | null;
  estimatedBudget: number;
  minBudget: number | null;
  maxBudget: number | null;
  budgetCurrency: string;
  requiredService: string | null;
  requiredServices: string[];
  leadType: LeadOwnershipType;
  accessType: LeadOwnershipType;
  exclusive: boolean;
  status: string;
  saleabilityStatus: string;
  qualityScore: number;
  score: number;
  opportunityScore: number;
  freshnessStatus: string;
  verificationStatus: string;
  businessStatus: string;
  maxPurchasers: number;
  currentPurchasers: number;
  availableForClaim: boolean;
}

export interface ClaimLeadResult {
  success: true;
  idempotentReplay: boolean;
  claimId: string;
  status: ClaimStatus;
  leadId: string;
  developerId: string;
  accessType: LeadOwnershipType;
  creditsCharged: number;
  creditCostReason: string;
  pricingExplanation: CreditPricingExplanation;
  remainingBalance: number;
  remainingCredits: number;
  transactionId: string;
  matchStrengthAtClaim: number | null;
  accessGranted: boolean;
  accessGrantedAt: Date;
  expiresAt: Date | null;
  claimedAt: Date;
  lead: UnlockedLeadDetails;
}

export interface RefundClaimInput {
  claimId: string;
  reason: string;
  refundedBy: string;
  amount?: number;
  idempotencyKey?: string;
  ipAddress?: string;
}

export interface RefundClaimResult {
  success: true;
  idempotentReplay: boolean;
  claimId: string;
  leadId: string;
  developerId: string;
  status: ClaimStatus;
  creditsRefunded: number;
  totalCreditsRefundedForClaim: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionId: string;
  refundReason: string;
  refundedBy: string;
  refundedAt: Date;
}

export interface AdminAdjustCreditsInput {
  developerId: string;
  amount: number;
  reason: string;
  performedById: string;
  type?: Extract<CreditTransactionType, 'ADMIN_ADJUSTMENT' | 'BONUS' | 'CORRECTION' | 'PURCHASE' | 'EXPIRATION'>;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AdminAdjustCreditsResult {
  success: true;
  idempotentReplay: boolean;
  developerId: string;
  accountId: string;
  transactionId: string;
  type: CreditTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  performedById: string;
  createdAt: Date;
}

export interface CreditLedgerReconciliationResult {
  developerId: string;
  accountId: string;
  currentBalance: number;
  ledgerSum: number;
  transactionCount: number;
  isReconciled: boolean;
  discrepancy: number;
}

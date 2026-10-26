-- Migration: 0004_unique_active_claim_refund_report
-- Option A: Exactly one refund report per claim forever.
-- Prevents duplicate submissions and concurrent race conditions.
-- Any appeals or exceptions are routed to customer support manual review.

CREATE UNIQUE INDEX IF NOT EXISTS "idx_lead_feedback_unique_claim_refund_report"
ON "LeadFeedback" ("claimId")
WHERE "type" = 'REFUND_REPORT' AND "claimId" IS NOT NULL;

-- Rollback SQL:
-- DROP INDEX IF EXISTS "idx_lead_feedback_unique_claim_refund_report";

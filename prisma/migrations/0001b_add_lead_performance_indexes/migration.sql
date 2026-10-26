-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_score_createdAt_idx" ON "Lead"("score" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_status_score_idx" ON "Lead"("status", "score" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_saleabilityStatus_isCanonical_score_idx" ON "Lead"("saleabilityStatus", "isCanonical", "score" DESC);

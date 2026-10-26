-- AlterTable: Add isMock column with DEFAULT true so existing records are fail-closed classified as mock
ALTER TABLE "Lead" ADD COLUMN "isMock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Set default for all future insertions to false (matching Prisma schema default)
ALTER TABLE "Lead" ALTER COLUMN "isMock" SET DEFAULT false;

-- CreateIndex
CREATE INDEX "Lead_isMock_idx" ON "Lead"("isMock");

-- CreateIndex
CREATE INDEX "Lead_isMock_saleabilityStatus_idx" ON "Lead"("isMock", "saleabilityStatus");

import { Prisma, PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import fs from 'fs';
import path from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pglite: PGlite | undefined;
  schemaInitialized: boolean | undefined;
  initPromise: Promise<void> | undefined;
};

function getOrCreateDefaultInstance(): { prisma: PrismaClient; pglite?: PGlite } {
  if (globalForPrisma.prisma) {
    return { prisma: globalForPrisma.prisma, pglite: globalForPrisma.pglite };
  }

  if (process.env.USE_EXTERNAL_PG === 'true') {
    const client = new PrismaClient();
    globalForPrisma.prisma = client;
    return { prisma: client };
  }

  const dataDir = process.env.PGLITE_DATA_DIR || path.resolve(process.cwd(), '.pgdata');
  const pgClient = globalForPrisma.pglite ?? new PGlite(dataDir);
  globalForPrisma.pglite = pgClient;
  const adapter = new PrismaPGlite(pgClient) as unknown as Prisma.PrismaClientOptions['adapter'];
  const prismaClient = new PrismaClient({ adapter });
  globalForPrisma.prisma = prismaClient;

  return { prisma: prismaClient, pglite: pgClient };
}

/**
 * Lazy proxy for PrismaClient so importing `@/lib/db` at Next.js build time does not open `.pgdata`
 * until an actual database operation is executed.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const instance = getOrCreateDefaultInstance().prisma;
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export function getPgliteInstance(): PGlite | undefined {
  return getOrCreateDefaultInstance().pglite;
}

/**
 * Allows test suites to inject an isolated in-memory PGlite PrismaClient instance.
 */
export function setPrismaClientForTesting(testClient: PrismaClient, testPglite?: PGlite) {
  globalForPrisma.prisma = testClient;
  globalForPrisma.pglite = testPglite;
  globalForPrisma.schemaInitialized = true;
}

export const PHASE1_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  CREATE TYPE "ScoringTrigger" AS ENUM (
    'LEAD_CREATED',
    'LEAD_UPDATED',
    'SOURCE_REFRESH',
    'MANUAL_RECALCULATION',
    'ADMIN_RECALCULATION',
    'SCHEDULED_RECALCULATION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "scoringVersion" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "scoreExplanation" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastScoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "Lead_scoringVersion_idx" ON "Lead"("scoringVersion");

ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "previousScore" INTEGER;
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "newScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "previousClassification" TEXT;
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "newClassification" TEXT NOT NULL DEFAULT 'COLD';
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "scoringVersion" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "trigger" "ScoringTrigger" NOT NULL DEFAULT 'MANUAL_RECALCULATION';
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "evaluatedRules" JSONB;
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "explanation" JSONB;
ALTER TABLE "LeadScore" ADD COLUMN IF NOT EXISTS "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "LeadScore_scoringVersion_idx" ON "LeadScore"("scoringVersion");
CREATE INDEX IF NOT EXISTS "LeadScore_evaluatedAt_idx" ON "LeadScore"("evaluatedAt");
CREATE INDEX IF NOT EXISTS "LeadScore_calculatedAt_idx" ON "LeadScore"("calculatedAt");
CREATE INDEX IF NOT EXISTS "LeadScore_leadId_calculatedAt_idx" ON "LeadScore"("leadId", "calculatedAt");

ALTER TABLE "ScoringRule" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "ScoringRule" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "ScoringRule" ADD COLUMN IF NOT EXISTS "ruleGroup" TEXT;
ALTER TABLE "ScoringRule" ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScoringRule" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ScoringRule" ADD COLUMN IF NOT EXISTS "version" TEXT NOT NULL DEFAULT 'v1';
CREATE UNIQUE INDEX IF NOT EXISTS "ScoringRule_key_key" ON "ScoringRule"("key");
CREATE INDEX IF NOT EXISTS "ScoringRule_enabled_idx" ON "ScoringRule"("enabled");
CREATE INDEX IF NOT EXISTS "ScoringRule_category_idx" ON "ScoringRule"("category");
CREATE INDEX IF NOT EXISTS "ScoringRule_ruleGroup_idx" ON "ScoringRule"("ruleGroup");
CREATE INDEX IF NOT EXISTS "ScoringRule_version_idx" ON "ScoringRule"("version");
CREATE INDEX IF NOT EXISTS "ScoringRule_sortOrder_idx" ON "ScoringRule"("sortOrder");
CREATE INDEX IF NOT EXISTS "ScoringRule_createdAt_idx" ON "ScoringRule"("createdAt");

CREATE TABLE IF NOT EXISTS "ScoringConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "currentVersion" TEXT NOT NULL DEFAULT 'v1',
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "coldMax" INTEGER NOT NULL DEFAULT 49,
  "warmMin" INTEGER NOT NULL DEFAULT 50,
  "warmMax" INTEGER NOT NULL DEFAULT 69,
  "hotMin" INTEGER NOT NULL DEFAULT 70,
  "hotMax" INTEGER NOT NULL DEFAULT 84,
  "premiumMin" INTEGER NOT NULL DEFAULT 85,
  "minScore" INTEGER NOT NULL DEFAULT 0,
  "maxScore" INTEGER NOT NULL DEFAULT 100,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScoringConfig_pkey" PRIMARY KEY ("id")
);
`;

export const PHASE2_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'POSSIBLE_DUPLICATE';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'CONFLICT';
EXCEPTION
  WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SourceRecordStatus" AS ENUM (
    'ACTIVE',
    'DUPLICATE',
    'REJECTED',
    'CONFLICT',
    'STALE',
    'MERGED',
    'UNMERGED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeduplicationDecisionType" AS ENUM (
    'UNIQUE',
    'DUPLICATE_CONFIRMED',
    'POSSIBLE_DUPLICATE',
    'CONFLICT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DuplicateCandidateStatus" AS ENUM (
    'PENDING',
    'CONFIRMED_MERGED',
    'KEPT_SEPARATE',
    'MARKED_INVALID',
    'RESOLVED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "phones" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "normalizedFacebook" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "normalizedInstagram" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "canonicalIdentityKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "fieldProvenance" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "fieldConflicts" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "isCanonical" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "mergedIntoLeadId" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_normalizedFacebook_idx" ON "Lead"("normalizedFacebook");
CREATE INDEX IF NOT EXISTS "Lead_normalizedInstagram_idx" ON "Lead"("normalizedInstagram");
CREATE INDEX IF NOT EXISTS "Lead_normalizedName_normalizedAddress_city_idx" ON "Lead"("normalizedName", "normalizedAddress", "city");
CREATE INDEX IF NOT EXISTS "Lead_isCanonical_idx" ON "Lead"("isCanonical");
CREATE INDEX IF NOT EXISTS "Lead_mergedIntoLeadId_idx" ON "Lead"("mergedIntoLeadId");

CREATE TABLE IF NOT EXISTS "SourceRecord" (
  "id" TEXT NOT NULL,
  "leadId" TEXT,
  "sourceId" TEXT,
  "sourceName" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
  "externalId" TEXT,
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB NOT NULL,
  "identityKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "decision" "DeduplicationDecisionType" NOT NULL DEFAULT 'UNIQUE',
  "matchedSignals" JSONB NOT NULL DEFAULT '[]',
  "status" "SourceRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "importJobId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SourceRecord_sourceName_externalId_key" ON "SourceRecord"("sourceName", "externalId");
CREATE INDEX IF NOT EXISTS "SourceRecord_leadId_idx" ON "SourceRecord"("leadId");
CREATE INDEX IF NOT EXISTS "SourceRecord_sourceId_idx" ON "SourceRecord"("sourceId");
CREATE INDEX IF NOT EXISTS "SourceRecord_sourceId_externalId_idx" ON "SourceRecord"("sourceId", "externalId");
CREATE INDEX IF NOT EXISTS "SourceRecord_sourceType_externalId_idx" ON "SourceRecord"("sourceType", "externalId");
CREATE INDEX IF NOT EXISTS "SourceRecord_externalId_idx" ON "SourceRecord"("externalId");
CREATE INDEX IF NOT EXISTS "SourceRecord_status_idx" ON "SourceRecord"("status");
CREATE INDEX IF NOT EXISTS "SourceRecord_decision_idx" ON "SourceRecord"("decision");
CREATE INDEX IF NOT EXISTS "SourceRecord_createdAt_idx" ON "SourceRecord"("createdAt");

CREATE TABLE IF NOT EXISTS "LeadIdentity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "keyType" TEXT NOT NULL,
  "keyValue" TEXT NOT NULL,
  "canonicalKey" TEXT NOT NULL,
  "source" TEXT,
  "sourceRecordId" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadIdentity_leadId_canonicalKey_key" ON "LeadIdentity"("leadId", "canonicalKey");
CREATE INDEX IF NOT EXISTS "LeadIdentity_canonicalKey_idx" ON "LeadIdentity"("canonicalKey");
CREATE INDEX IF NOT EXISTS "LeadIdentity_keyType_keyValue_idx" ON "LeadIdentity"("keyType", "keyValue");
CREATE INDEX IF NOT EXISTS "LeadIdentity_leadId_idx" ON "LeadIdentity"("leadId");
CREATE INDEX IF NOT EXISTS "LeadIdentity_sourceRecordId_idx" ON "LeadIdentity"("sourceRecordId");

CREATE TABLE IF NOT EXISTS "DuplicateCandidate" (
  "id" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "candidateLeadId" TEXT,
  "matchedLeadId" TEXT NOT NULL,
  "decision" "DeduplicationDecisionType" NOT NULL DEFAULT 'POSSIBLE_DUPLICATE',
  "status" "DuplicateCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "signals" JSONB NOT NULL DEFAULT '[]',
  "conflicts" JSONB NOT NULL DEFAULT '[]',
  "confidenceLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DuplicateCandidate_status_idx" ON "DuplicateCandidate"("status");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_decision_idx" ON "DuplicateCandidate"("decision");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_matchedLeadId_idx" ON "DuplicateCandidate"("matchedLeadId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_candidateLeadId_idx" ON "DuplicateCandidate"("candidateLeadId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_sourceRecordId_idx" ON "DuplicateCandidate"("sourceRecordId");
CREATE INDEX IF NOT EXISTS "DuplicateCandidate_createdAt_idx" ON "DuplicateCandidate"("createdAt");

CREATE TABLE IF NOT EXISTS "LeadMergeHistory" (
  "id" TEXT NOT NULL,
  "targetLeadId" TEXT NOT NULL,
  "sourceLeadId" TEXT,
  "sourceRecordId" TEXT,
  "mergeType" TEXT NOT NULL DEFAULT 'AUTOMATIC',
  "reason" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'DUPLICATE_CONFIRMED',
  "matchedSignals" JSONB NOT NULL DEFAULT '[]',
  "fieldChanges" JSONB NOT NULL,
  "sourceLeadSnapshot" JSONB,
  "conflictsRecorded" JSONB,
  "performedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
  "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revertedAt" TIMESTAMP(3),
  "revertedBy" TEXT,
  "revertReason" TEXT,
  "isReverted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadMergeHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadMergeHistory_targetLeadId_idx" ON "LeadMergeHistory"("targetLeadId");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_sourceLeadId_idx" ON "LeadMergeHistory"("sourceLeadId");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_sourceRecordId_idx" ON "LeadMergeHistory"("sourceRecordId");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_performedBy_idx" ON "LeadMergeHistory"("performedBy");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_performedAt_idx" ON "LeadMergeHistory"("performedAt");
CREATE INDEX IF NOT EXISTS "LeadMergeHistory_isReverted_idx" ON "LeadMergeHistory"("isReverted");
`;

export const PHASE3_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  ALTER TYPE "LeadAvailabilityStatus" ADD VALUE IF NOT EXISTS 'REQUIRES_VERIFICATION';
  ALTER TYPE "LeadAvailabilityStatus" ADD VALUE IF NOT EXISTS 'STALE';
  ALTER TYPE "LeadAvailabilityStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
  ALTER TYPE "LeadAvailabilityStatus" ADD VALUE IF NOT EXISTS 'DUPLICATE';
  ALTER TYPE "LeadAvailabilityStatus" ADD VALUE IF NOT EXISTS 'NOT_SALEABLE';
EXCEPTION
  WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "QualityStatus" AS ENUM (
    'VERY_LOW',
    'LOW',
    'MEDIUM',
    'HIGH',
    'EXCELLENT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FreshnessState" AS ENUM (
    'FRESH',
    'RECENT',
    'NEEDS_VERIFICATION',
    'STALE',
    'VERY_STALE',
    'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationStatus" AS ENUM (
    'UNVERIFIED',
    'PARTIALLY_VERIFIED',
    'VERIFIED',
    'FAILED_VERIFICATION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationType" AS ENUM (
    'PHONE',
    'EMAIL',
    'WEBSITE',
    'BUSINESS_STATUS',
    'ADDRESS',
    'IDENTITY',
    'CATEGORY',
    'LOCATION',
    'FEEDBACK',
    'FULL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "VerificationRecordStatus" AS ENUM (
    'VERIFIED',
    'FAILED',
    'UNKNOWN',
    'NEEDS_REVERIFICATION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BusinessOperationalStatus" AS ENUM (
    'OPEN',
    'CLOSED',
    'TEMPORARILY_CLOSED',
    'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "qualityScore" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "qualityStatus" "QualityStatus" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "freshnessStatus" "FreshnessState" NOT NULL DEFAULT 'FRESH';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "saleabilityStatus" "LeadAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "completenessScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "completenessBreakdown" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "qualitySummary" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "businessStatus" "BusinessOperationalStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "phoneValidationStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "emailValidationStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "websiteVerificationState" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Lead" ALTER COLUMN "lastVerifiedAt" DROP NOT NULL;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "nextVerificationAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Lead_qualityScore_idx" ON "Lead"("qualityScore");
CREATE INDEX IF NOT EXISTS "Lead_qualityStatus_idx" ON "Lead"("qualityStatus");
CREATE INDEX IF NOT EXISTS "Lead_freshnessStatus_idx" ON "Lead"("freshnessStatus");
CREATE INDEX IF NOT EXISTS "Lead_verificationStatus_idx" ON "Lead"("verificationStatus");
CREATE INDEX IF NOT EXISTS "Lead_saleabilityStatus_idx" ON "Lead"("saleabilityStatus");
CREATE INDEX IF NOT EXISTS "Lead_businessStatus_idx" ON "Lead"("businessStatus");
CREATE INDEX IF NOT EXISTS "Lead_nextVerificationAt_idx" ON "Lead"("nextVerificationAt");

ALTER TABLE "FreshnessConfig" ADD COLUMN IF NOT EXISTS "staleMaxDays" INTEGER NOT NULL DEFAULT 180;

CREATE TABLE IF NOT EXISTS "QualityConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "veryLowMax" INTEGER NOT NULL DEFAULT 24,
  "lowMin" INTEGER NOT NULL DEFAULT 25,
  "lowMax" INTEGER NOT NULL DEFAULT 49,
  "mediumMin" INTEGER NOT NULL DEFAULT 50,
  "mediumMax" INTEGER NOT NULL DEFAULT 69,
  "highMin" INTEGER NOT NULL DEFAULT 70,
  "highMax" INTEGER NOT NULL DEFAULT 84,
  "excellentMin" INTEGER NOT NULL DEFAULT 85,
  "minSaleableQualityScore" INTEGER NOT NULL DEFAULT 35,
  "phoneExpiryDays" INTEGER NOT NULL DEFAULT 30,
  "emailExpiryDays" INTEGER NOT NULL DEFAULT 30,
  "websiteExpiryDays" INTEGER NOT NULL DEFAULT 14,
  "businessStatusExpiryDays" INTEGER NOT NULL DEFAULT 7,
  "addressExpiryDays" INTEGER NOT NULL DEFAULT 90,
  "identityExpiryDays" INTEGER NOT NULL DEFAULT 90,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeadVerification" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "verificationType" "VerificationType" NOT NULL,
  "status" "VerificationRecordStatus" NOT NULL DEFAULT 'UNKNOWN',
  "previousStatus" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "source" TEXT NOT NULL DEFAULT 'SYSTEM',
  "resultSummary" TEXT NOT NULL,
  "evidence" JSONB,
  "errorType" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadVerification_leadId_idx" ON "LeadVerification"("leadId");
CREATE INDEX IF NOT EXISTS "LeadVerification_verificationType_idx" ON "LeadVerification"("verificationType");
CREATE INDEX IF NOT EXISTS "LeadVerification_status_idx" ON "LeadVerification"("status");
CREATE INDEX IF NOT EXISTS "LeadVerification_checkedAt_idx" ON "LeadVerification"("checkedAt");
CREATE INDEX IF NOT EXISTS "LeadVerification_expiresAt_idx" ON "LeadVerification"("expiresAt");
CREATE INDEX IF NOT EXISTS "LeadVerification_leadId_verificationType_checkedAt_idx" ON "LeadVerification"("leadId", "verificationType", "checkedAt");
`;

export const PHASE4_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  CREATE TYPE "MatchingRuleCategory" AS ENUM (
    'SERVICE',
    'NICHE',
    'LOCATION',
    'BUDGET',
    'LEAD_TYPE',
    'QUALITY',
    'FRESHNESS',
    'PREFERENCE',
    'PERFORMANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ServiceMatchMode" AS ENUM (
    'ALL_REQUIRED',
    'ANY_REQUIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "UnknownDataPolicy" AS ENUM (
    'ALLOW_WITH_PENALTY',
    'REQUIRE_VERIFICATION',
    'FAIL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RequiresVerificationMatchPolicy" AS ENUM (
    'EXCLUDE',
    'VERIFIED_DEVELOPERS_ONLY',
    'INCLUDE_WITH_WARNING'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "preferredServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "excludedServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "supportedGovernorates" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "supportedCities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "supportedDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "preferredCities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "excludedLocations" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "allLocationsMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "preferredNiches" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "excludedNiches" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "allNichesMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "supportedLeadTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "preferredLeadTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "excludedLeadTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "preferredMinBudget" INTEGER;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "preferredMaxBudget" INTEGER;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "budgetCurrency" TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "isAcceptingLeads" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "maxActiveLeads" INTEGER;
ALTER TABLE "DeveloperProfile" ADD COLUMN IF NOT EXISTS "lastMatchedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "DeveloperProfile_isActive_isAcceptingLeads_idx" ON "DeveloperProfile"("isActive", "isAcceptingLeads");
CREATE INDEX IF NOT EXISTS "DeveloperProfile_minBudget_maxBudget_idx" ON "DeveloperProfile"("minBudget", "maxBudget");
CREATE INDEX IF NOT EXISTS "DeveloperProfile_leadType_idx" ON "DeveloperProfile"("leadType");

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "minBudget" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "maxBudget" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "budgetCurrency" TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "budgetType" TEXT NOT NULL DEFAULT 'ESTIMATED';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requiredService" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requiredServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "projectLeadType" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_requiredService_idx" ON "Lead"("requiredService");
CREATE INDEX IF NOT EXISTS "Lead_projectLeadType_idx" ON "Lead"("projectLeadType");
CREATE INDEX IF NOT EXISTS "Lead_estimatedBudget_idx" ON "Lead"("estimatedBudget");
CREATE INDEX IF NOT EXISTS "Lead_saleabilityStatus_isCanonical_status_idx" ON "Lead"("saleabilityStatus", "isCanonical", "status");

CREATE TABLE IF NOT EXISTS "MatchingRule" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "description" TEXT,
  "category" "MatchingRuleCategory" NOT NULL DEFAULT 'SERVICE',
  "ruleGroup" TEXT,
  "points" INTEGER NOT NULL DEFAULT 10,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" TEXT NOT NULL DEFAULT 'v1',
  "condition" JSONB NOT NULL DEFAULT '{}',
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchingRule_key_key" ON "MatchingRule"("key");
CREATE INDEX IF NOT EXISTS "MatchingRule_enabled_idx" ON "MatchingRule"("enabled");
CREATE INDEX IF NOT EXISTS "MatchingRule_category_idx" ON "MatchingRule"("category");
CREATE INDEX IF NOT EXISTS "MatchingRule_ruleGroup_idx" ON "MatchingRule"("ruleGroup");
CREATE INDEX IF NOT EXISTS "MatchingRule_version_idx" ON "MatchingRule"("version");
CREATE INDEX IF NOT EXISTS "MatchingRule_priority_idx" ON "MatchingRule"("priority");

CREATE TABLE IF NOT EXISTS "MatchingConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "currentVersion" TEXT NOT NULL DEFAULT 'v1',
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "serviceMatchMode" "ServiceMatchMode" NOT NULL DEFAULT 'ALL_REQUIRED',
  "unknownLocationPolicy" "UnknownDataPolicy" NOT NULL DEFAULT 'FAIL',
  "unknownBudgetPolicy" "UnknownDataPolicy" NOT NULL DEFAULT 'ALLOW_WITH_PENALTY',
  "requiresVerificationPolicy" "RequiresVerificationMatchPolicy" NOT NULL DEFAULT 'EXCLUDE',
  "budgetHardRequirement" BOOLEAN NOT NULL DEFAULT true,
  "requireActiveSubscription" BOOLEAN NOT NULL DEFAULT true,
  "requireDeveloperVerified" BOOLEAN NOT NULL DEFAULT false,
  "minMatchStrength" INTEGER NOT NULL DEFAULT 0,
  "maxMatchStrength" INTEGER NOT NULL DEFAULT 100,
  "unknownLocationPenalty" INTEGER NOT NULL DEFAULT 10,
  "unknownBudgetPenalty" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchingConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MatchSnapshot" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "developerId" TEXT NOT NULL,
  "profileId" TEXT,
  "matchVersion" TEXT NOT NULL DEFAULT 'v1',
  "eligible" BOOLEAN NOT NULL DEFAULT false,
  "rank" INTEGER,
  "matchStrength" INTEGER NOT NULL DEFAULT 0,
  "rawMatchPoints" INTEGER NOT NULL DEFAULT 0,
  "opportunityScore" INTEGER NOT NULL DEFAULT 0,
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "freshness" TEXT NOT NULL DEFAULT 'FRESH',
  "matchedCriteria" JSONB NOT NULL DEFAULT '[]',
  "failedCriteria" JSONB NOT NULL DEFAULT '[]',
  "hardFailures" JSONB NOT NULL DEFAULT '[]',
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "explanation" JSONB,
  "isStale" BOOLEAN NOT NULL DEFAULT false,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MatchSnapshot_leadId_developerId_matchVersion_key" ON "MatchSnapshot"("leadId", "developerId", "matchVersion");
CREATE INDEX IF NOT EXISTS "MatchSnapshot_leadId_eligible_matchStrength_idx" ON "MatchSnapshot"("leadId", "eligible", "matchStrength");
CREATE INDEX IF NOT EXISTS "MatchSnapshot_developerId_eligible_matchStrength_idx" ON "MatchSnapshot"("developerId", "eligible", "matchStrength");
CREATE INDEX IF NOT EXISTS "MatchSnapshot_matchVersion_idx" ON "MatchSnapshot"("matchVersion");
CREATE INDEX IF NOT EXISTS "MatchSnapshot_calculatedAt_idx" ON "MatchSnapshot"("calculatedAt");
CREATE INDEX IF NOT EXISTS "MatchSnapshot_isStale_idx" ON "MatchSnapshot"("isStale");
`;

/**
 * Ensures the PostgreSQL schema is applied to the active PGlite instance if tables do not exist yet,
 * and applies incremental Phase 1, Phase 2, Phase 3 & Phase 4 schema upgrades if tables already exist.
 */
export async function ensureDbReady(): Promise<void> {
  if (globalForPrisma.schemaInitialized) return;
  if (globalForPrisma.initPromise) {
    await globalForPrisma.initPromise;
    return;
  }

  globalForPrisma.initPromise = (async () => {
    const { prisma: activePrisma, pglite: activePg } = getOrCreateDefaultInstance();
    try {
      await activePrisma.user.count();
      if (activePg) {
        await activePg.exec(PHASE1_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE2_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE3_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE4_SCHEMA_UPGRADE_SQL);
      }
      globalForPrisma.schemaInitialized = true;
    } catch {
      const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/0001_init/migration.sql');
      if (fs.existsSync(migrationPath) && activePg) {
        const sql = fs.readFileSync(migrationPath, 'utf-8');
        await activePg.exec(sql);
        globalForPrisma.schemaInitialized = true;
      }
    } finally {
      globalForPrisma.initPromise = undefined;
    }
  })();

  await globalForPrisma.initPromise;
}

/**
 * Creates a fresh, isolated in-memory PostgreSQL database backed by PGlite with full schema migrated.
 * Ideal for fast, deterministic unit/integration/API tests.
 */
export async function createInMemoryTestDb(): Promise<{
  prisma: PrismaClient;
  pglite: PGlite;
  cleanup: () => Promise<void>;
}> {
  const memPg = new PGlite();
  const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/0001_init/migration.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  await memPg.exec(sql);

  const adapter = new PrismaPGlite(memPg) as unknown as Prisma.PrismaClientOptions['adapter'];
  const testPrisma = new PrismaClient({ adapter });

  return {
    prisma: testPrisma,
    pglite: memPg,
    cleanup: async () => {
      await testPrisma.$disconnect();
      await memPg.close();
    },
  };
}

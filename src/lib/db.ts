import { Prisma, PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import fs from 'fs';
import path from 'path';
import { globalAppCache } from './observability/cache';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pglite: PGlite | undefined;
  schemaInitialized: boolean | undefined;
  initPromise: Promise<void> | undefined;
};

export function sanitizeDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  let clean = rawUrl.trim();
  // Strip outer quotes if pasted with quotes
  clean = clean.replace(/^["']|["']$/g, '');
  // Strip literal brackets around password: :[password]@ or :%5Bpassword%5D@ -> :password@
  clean = clean.replace(/:(\[|%5B)(.*?)(\]|%5D)@/, ':$2@');

  try {
    const parsed = new URL(clean);
    // If user provided direct Supabase host db.<ref>.supabase.co, auto-rewrite to IPv4 pooler
    // because direct db.<ref>.supabase.co has only IPv6 records, which time out on Vercel
    const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (hostMatch) {
      const projectRef = hostMatch[1];
      parsed.hostname = 'aws-0-eu-west-1.pooler.supabase.com';
      parsed.port = '6543';
      if (parsed.username === 'postgres') {
        parsed.username = `postgres.${projectRef}`;
      }
      parsed.searchParams.set('pgbouncer', 'true');
    }
    // Clean any brackets from username if pasted like postgres.[ref]
    parsed.username = parsed.username.replace(/\[|\]/g, '');
    return parsed.toString();
  } catch {
    return clean;
  }
}

function shouldUseExternalPg(): boolean {
  if (process.env.USE_EXTERNAL_PG === 'true') return true;
  if (process.env.NODE_ENV === 'production') return true;
  if (Boolean(process.env.VERCEL)) return true;
  const rawDbUrl = process.env.DATABASE_URL;
  if (rawDbUrl && !rawDbUrl.includes('localhost') && !rawDbUrl.includes('127.0.0.1')) return true;
  return false;
}

function getOrCreateDefaultInstance(): { prisma: PrismaClient; pglite?: PGlite } {
  if (globalForPrisma.prisma) {
    return { prisma: globalForPrisma.prisma, pglite: globalForPrisma.pglite };
  }

  if (shouldUseExternalPg()) {
    const rawUrl = process.env.DATABASE_URL;
    const sanitizedUrl = sanitizeDatabaseUrl(rawUrl);
    if (sanitizedUrl && sanitizedUrl !== rawUrl) {
      process.env.DATABASE_URL = sanitizedUrl;
    }
    const client = new PrismaClient(
      sanitizedUrl ? { datasources: { db: { url: sanitizedUrl } } } : undefined
    );
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
  globalAppCache.clear();
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

export const PHASE5_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  CREATE TYPE "ClaimStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'REFUNDED',
    'EXPIRED',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CreditTransactionType" AS ENUM (
    'PURCHASE',
    'CLAIM',
    'REFUND',
    'BONUS',
    'ADMIN_ADJUSTMENT',
    'EXPIRATION',
    'CORRECTION'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "accessType" "LeadOwnershipType" NOT NULL DEFAULT 'SHARED';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditCost" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "creditCostReason" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "availableForClaim" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "claimWindowEndsAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "exclusiveClaimedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "exclusiveClaimedById" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requiresMatching" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "minClaimQualityScore" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "minClaimOpportunityScore" INTEGER;

CREATE INDEX IF NOT EXISTS "Lead_availableForClaim_status_saleabilityStatus_idx" ON "Lead"("availableForClaim", "status", "saleabilityStatus");
CREATE INDEX IF NOT EXISTS "Lead_accessType_availableForClaim_idx" ON "Lead"("accessType", "availableForClaim");
CREATE INDEX IF NOT EXISTS "Lead_exclusiveClaimedById_idx" ON "Lead"("exclusiveClaimedById");

DO $$ BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_purchasers_check"
    CHECK ("currentPurchasers" >= 0 AND "maxPurchasers" >= 1 AND "currentPurchasers" <= "maxPurchasers");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "developerId" TEXT;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "status" "ClaimStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "accessType" "LeadOwnershipType" NOT NULL DEFAULT 'SHARED';
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "creditsCharged" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "creditsRefunded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "creditCostReason" TEXT NOT NULL DEFAULT 'SHARED_LEAD';
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "pricingExplanation" JSONB;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "matchStrengthAtClaim" INTEGER;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "accessGranted" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "accessGrantedAt" TIMESTAMP(3);
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "refundReason" TEXT;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "refundedBy" TEXT;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "failureCode" TEXT;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "LeadClaim" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "LeadClaim_userId_idempotencyKey_key" ON "LeadClaim"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "LeadClaim_developerId_idx" ON "LeadClaim"("developerId");
CREATE INDEX IF NOT EXISTS "LeadClaim_status_idx" ON "LeadClaim"("status");
CREATE INDEX IF NOT EXISTS "LeadClaim_leadId_status_idx" ON "LeadClaim"("leadId", "status");
CREATE INDEX IF NOT EXISTS "LeadClaim_userId_status_idx" ON "LeadClaim"("userId", "status");
CREATE INDEX IF NOT EXISTS "LeadClaim_claimedAt_idx" ON "LeadClaim"("claimedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadClaim_exclusive_active_leadId_key" ON "LeadClaim"("leadId") WHERE "status" = 'ACTIVE' AND "accessType" = 'EXCLUSIVE';

DO $$ BEGIN
  ALTER TABLE "LeadClaim" ADD CONSTRAINT "LeadClaim_credits_check"
    CHECK ("creditsCharged" >= 0 AND "creditsRefunded" >= 0 AND "creditsRefunded" <= "creditsCharged");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "DeveloperCreditAccount" (
  "id" TEXT NOT NULL,
  "developerId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "reservedBalance" INTEGER NOT NULL DEFAULT 0,
  "lifetimePurchased" INTEGER NOT NULL DEFAULT 0,
  "lifetimeBonus" INTEGER NOT NULL DEFAULT 0,
  "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
  "lifetimeRefunded" INTEGER NOT NULL DEFAULT 0,
  "lifetimeExpired" INTEGER NOT NULL DEFAULT 0,
  "totalGranted" INTEGER NOT NULL DEFAULT 0,
  "totalSpent" INTEGER NOT NULL DEFAULT 0,
  "totalRefunded" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeveloperCreditAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "reservedBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "lifetimePurchased" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "lifetimeBonus" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "lifetimeSpent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "lifetimeRefunded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "lifetimeExpired" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "totalGranted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "totalSpent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeveloperCreditAccount" ADD COLUMN IF NOT EXISTS "totalRefunded" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "DeveloperCreditAccount_developerId_key" ON "DeveloperCreditAccount"("developerId");
CREATE INDEX IF NOT EXISTS "DeveloperCreditAccount_developerId_idx" ON "DeveloperCreditAccount"("developerId");
CREATE INDEX IF NOT EXISTS "DeveloperCreditAccount_balance_idx" ON "DeveloperCreditAccount"("balance");

DO $$ BEGIN
  ALTER TABLE "DeveloperCreditAccount" ADD CONSTRAINT "DeveloperCreditAccount_developerId_fkey"
    FOREIGN KEY ("developerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DeveloperCreditAccount" ADD CONSTRAINT "DeveloperCreditAccount_balance_non_negative"
    CHECK ("balance" >= 0 AND "reservedBalance" >= 0 AND "lifetimePurchased" >= 0 AND "lifetimeBonus" >= 0 AND "lifetimeSpent" >= 0 AND "lifetimeRefunded" >= 0 AND "lifetimeExpired" >= 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CreditTransaction" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "developerId" TEXT NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "claimId" TEXT,
  "leadId" TEXT,
  "reason" TEXT NOT NULL DEFAULT '',
  "actorId" TEXT,
  "metadata" JSONB,
  "idempotencyKey" TEXT,
  "performedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "claimId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "actorId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "performedById" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_developerId_idempotencyKey_key" ON "CreditTransaction"("developerId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "CreditTransaction_accountId_idx" ON "CreditTransaction"("accountId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_developerId_createdAt_idx" ON "CreditTransaction"("developerId", "createdAt");
CREATE INDEX IF NOT EXISTS "CreditTransaction_type_idx" ON "CreditTransaction"("type");
CREATE INDEX IF NOT EXISTS "CreditTransaction_claimId_idx" ON "CreditTransaction"("claimId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_leadId_idx" ON "CreditTransaction"("leadId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_referenceType_referenceId_idx" ON "CreditTransaction"("referenceType", "referenceId");

DO $$ BEGIN
  ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "DeveloperCreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_developerId_fkey"
    FOREIGN KEY ("developerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "LeadClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_ledger_math_check"
    CHECK ("balanceBefore" >= 0 AND "balanceAfter" >= 0 AND ("balanceBefore" + "amount" = "balanceAfter"));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CreditPricingConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "version" TEXT NOT NULL DEFAULT 'v1',
  "sharedLeadBaseCost" INTEGER NOT NULL DEFAULT 5,
  "exclusiveLeadBaseCost" INTEGER NOT NULL DEFAULT 25,
  "sharedBaseCost" INTEGER NOT NULL DEFAULT 5,
  "exclusiveBaseCost" INTEGER NOT NULL DEFAULT 25,
  "highOpportunityCostBonus" INTEGER NOT NULL DEFAULT 0,
  "highOpportunityThreshold" INTEGER NOT NULL DEFAULT 80,
  "highQualityCostBonus" INTEGER NOT NULL DEFAULT 0,
  "highQualityThreshold" INTEGER NOT NULL DEFAULT 85,
  "highBudgetCostBonus" INTEGER NOT NULL DEFAULT 0,
  "highBudgetThresholdEgp" INTEGER NOT NULL DEFAULT 500000,
  "freshLeadBonus" INTEGER NOT NULL DEFAULT 0,
  "minCreditCost" INTEGER NOT NULL DEFAULT 1,
  "maxCreditCost" INTEGER NOT NULL DEFAULT 100,
  "defaultClaimExpirationDays" INTEGER NOT NULL DEFAULT 90,
  "autoRefundOnInvalidLead" BOOLEAN NOT NULL DEFAULT true,
  "autoRefundOnDuplicateLead" BOOLEAN NOT NULL DEFAULT true,
  "autoRefundOnClosedWithinHours" INTEGER NOT NULL DEFAULT 24,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditPricingConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "version" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "sharedLeadBaseCost" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "exclusiveLeadBaseCost" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "sharedBaseCost" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "exclusiveBaseCost" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "highOpportunityCostBonus" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "highOpportunityThreshold" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "highQualityCostBonus" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "highQualityThreshold" INTEGER NOT NULL DEFAULT 85;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "highBudgetCostBonus" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "highBudgetThresholdEgp" INTEGER NOT NULL DEFAULT 500000;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "freshLeadBonus" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "minCreditCost" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "maxCreditCost" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "defaultClaimExpirationDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "autoRefundOnInvalidLead" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "autoRefundOnDuplicateLead" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CreditPricingConfig" ADD COLUMN IF NOT EXISTS "autoRefundOnClosedWithinHours" INTEGER NOT NULL DEFAULT 24;
`;

export const PHASE6_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  ALTER TYPE "PipelineStatus" ADD VALUE IF NOT EXISTS 'CLAIMED';
  ALTER TYPE "PipelineStatus" ADD VALUE IF NOT EXISTS 'PROPOSAL_SENT';
  ALTER TYPE "PipelineStatus" ADD VALUE IF NOT EXISTS 'NEGOTIATION';
EXCEPTION
  WHEN others THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "EngagementStatus" AS ENUM (
    'CLAIMED',
    'CONTACTED',
    'REPLIED',
    'INTERESTED',
    'MEETING',
    'PROPOSAL_SENT',
    'NEGOTIATION',
    'WON',
    'LOST',
    'NOT_INTERESTED',
    'INVALID'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackCategory" AS ENUM (
    'CONTACT',
    'BUSINESS',
    'SALES',
    'LEAD_QUALITY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContactChannel" AS ENUM (
    'PHONE',
    'WHATSAPP',
    'EMAIL',
    'SMS',
    'SOCIAL',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ContactAttemptResult" AS ENUM (
    'NO_ANSWER',
    'ANSWERED',
    'INVALID_NUMBER',
    'MESSAGE_SENT',
    'REPLIED',
    'BOUNCED',
    'BLOCKED',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "LeadEngagement" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "developerId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "currentStatus" "EngagementStatus" NOT NULL DEFAULT 'CLAIMED',
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstContactedAt" TIMESTAMP(3),
  "lastContactedAt" TIMESTAMP(3),
  "firstRepliedAt" TIMESTAMP(3),
  "interestedAt" TIMESTAMP(3),
  "meetingAt" TIMESTAMP(3),
  "proposalSentAt" TIMESTAMP(3),
  "negotiationAt" TIMESTAMP(3),
  "wonAt" TIMESTAMP(3),
  "lostAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "invalidAt" TIMESTAMP(3),
  "notInterestedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "finalOutcome" "EngagementStatus",
  "outcomeReasonCode" TEXT,
  "outcomeReasonNote" TEXT,
  "estimatedProjectValue" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'EGP',
  "wonReason" TEXT,
  "lostReasonCode" TEXT,
  "lostReasonNote" TEXT,
  "invalidReasonCode" TEXT,
  "invalidReasonNote" TEXT,
  "outcomeNote" TEXT,
  "outcomeMetadata" JSONB,
  "isTerminal" BOOLEAN NOT NULL DEFAULT false,
  "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadEngagement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "invalidAt" TIMESTAMP(3);
ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "notInterestedAt" TIMESTAMP(3);
ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "finalOutcome" "EngagementStatus";
ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "outcomeReasonCode" TEXT;
ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "outcomeReasonNote" TEXT;
ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "lostReasonNote" TEXT;
ALTER TABLE "LeadEngagement" ADD COLUMN IF NOT EXISTS "invalidReasonNote" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LeadEngagement_claimId_key" ON "LeadEngagement"("claimId");
CREATE UNIQUE INDEX IF NOT EXISTS "LeadEngagement_leadId_developerId_key" ON "LeadEngagement"("leadId", "developerId");
CREATE INDEX IF NOT EXISTS "LeadEngagement_leadId_idx" ON "LeadEngagement"("leadId");
CREATE INDEX IF NOT EXISTS "LeadEngagement_developerId_idx" ON "LeadEngagement"("developerId");
CREATE INDEX IF NOT EXISTS "LeadEngagement_claimId_idx" ON "LeadEngagement"("claimId");
CREATE INDEX IF NOT EXISTS "LeadEngagement_currentStatus_idx" ON "LeadEngagement"("currentStatus");
CREATE INDEX IF NOT EXISTS "LeadEngagement_createdAt_idx" ON "LeadEngagement"("createdAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_developerId_currentStatus_idx" ON "LeadEngagement"("developerId", "currentStatus");

DO $$ BEGIN
  ALTER TABLE "LeadEngagement" ADD CONSTRAINT "LeadEngagement_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeadEngagement" ADD CONSTRAINT "LeadEngagement_developerId_fkey"
    FOREIGN KEY ("developerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeadEngagement" ADD CONSTRAINT "LeadEngagement_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "LeadClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DROP INDEX IF EXISTS "LeadFeedback_leadId_userId_key";
DROP INDEX IF EXISTS "LeadFeedback_claimId_key";

ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "developerId" TEXT;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "engagementId" TEXT;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'FEEDBACK';
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "category" "FeedbackCategory";
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "confidence" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "flags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "LeadFeedback_userId_idempotencyKey_key" ON "LeadFeedback"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "LeadFeedback_userId_idx" ON "LeadFeedback"("userId");
CREATE INDEX IF NOT EXISTS "LeadFeedback_developerId_idx" ON "LeadFeedback"("developerId");
CREATE INDEX IF NOT EXISTS "LeadFeedback_claimId_idx" ON "LeadFeedback"("claimId");
CREATE INDEX IF NOT EXISTS "LeadFeedback_engagementId_idx" ON "LeadFeedback"("engagementId");
CREATE INDEX IF NOT EXISTS "LeadFeedback_category_idx" ON "LeadFeedback"("category");
CREATE INDEX IF NOT EXISTS "LeadFeedback_reasonCode_idx" ON "LeadFeedback"("reasonCode");
CREATE INDEX IF NOT EXISTS "LeadFeedback_createdAt_idx" ON "LeadFeedback"("createdAt");

DO $$ BEGIN
  ALTER TABLE "LeadFeedback" ADD CONSTRAINT "LeadFeedback_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "LeadEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "engagementId" TEXT;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "developerId" TEXT;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'DEVELOPER';
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "actorId" TEXT;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "isAdminCorrection" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeadStatusHistory" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LeadStatusHistory_userId_idempotencyKey_key" ON "LeadStatusHistory"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "LeadStatusHistory_engagementId_idx" ON "LeadStatusHistory"("engagementId");
CREATE INDEX IF NOT EXISTS "LeadStatusHistory_developerId_idx" ON "LeadStatusHistory"("developerId");
CREATE INDEX IF NOT EXISTS "LeadStatusHistory_createdAt_idx" ON "LeadStatusHistory"("createdAt");
CREATE INDEX IF NOT EXISTS "LeadStatusHistory_engagementId_createdAt_idx" ON "LeadStatusHistory"("engagementId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "LeadEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ContactAttempt" (
  "id" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "developerId" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "channel" "ContactChannel" NOT NULL,
  "result" "ContactAttemptResult" NOT NULL,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "metadata" JSONB,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactAttempt_developerId_idempotencyKey_key" ON "ContactAttempt"("developerId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ContactAttempt_engagementId_idx" ON "ContactAttempt"("engagementId");
CREATE INDEX IF NOT EXISTS "ContactAttempt_leadId_idx" ON "ContactAttempt"("leadId");
CREATE INDEX IF NOT EXISTS "ContactAttempt_developerId_idx" ON "ContactAttempt"("developerId");
CREATE INDEX IF NOT EXISTS "ContactAttempt_claimId_idx" ON "ContactAttempt"("claimId");
CREATE INDEX IF NOT EXISTS "ContactAttempt_channel_idx" ON "ContactAttempt"("channel");
CREATE INDEX IF NOT EXISTS "ContactAttempt_result_idx" ON "ContactAttempt"("result");
CREATE INDEX IF NOT EXISTS "ContactAttempt_attemptedAt_idx" ON "ContactAttempt"("attemptedAt");
CREATE INDEX IF NOT EXISTS "ContactAttempt_engagementId_attemptedAt_idx" ON "ContactAttempt"("engagementId", "attemptedAt");

DO $$ BEGIN
  ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_engagementId_fkey"
    FOREIGN KEY ("engagementId") REFERENCES "LeadEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_developerId_fkey"
    FOREIGN KEY ("developerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "LeadClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`;

export const PHASE7_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  CREATE TYPE "RuleReviewType" AS ENUM (
    'SCORING',
    'MATCHING',
    'QUALITY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "RuleReviewStatus" AS ENUM (
    'OPEN',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'DEFERRED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "LeadEngagement_claimedAt_idx" ON "LeadEngagement"("claimedAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_firstContactedAt_idx" ON "LeadEngagement"("firstContactedAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_meetingAt_idx" ON "LeadEngagement"("meetingAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_wonAt_idx" ON "LeadEngagement"("wonAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_lostAt_idx" ON "LeadEngagement"("lostAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_invalidAt_idx" ON "LeadEngagement"("invalidAt");
CREATE INDEX IF NOT EXISTS "LeadEngagement_finalOutcome_idx" ON "LeadEngagement"("finalOutcome");
CREATE INDEX IF NOT EXISTS "LeadEngagement_lostReasonCode_idx" ON "LeadEngagement"("lostReasonCode");
CREATE INDEX IF NOT EXISTS "LeadEngagement_invalidReasonCode_idx" ON "LeadEngagement"("invalidReasonCode");

CREATE TABLE IF NOT EXISTS "RuleReviewCandidate" (
  "id" TEXT NOT NULL,
  "ruleType" "RuleReviewType" NOT NULL,
  "ruleKey" TEXT NOT NULL,
  "ruleName" TEXT NOT NULL DEFAULT '',
  "ruleVersion" TEXT NOT NULL DEFAULT 'v1',
  "metric" TEXT NOT NULL,
  "metricVersion" TEXT NOT NULL DEFAULT 'WIN_RATE_V1',
  "baselineValue" DOUBLE PRECISION NOT NULL,
  "observedValue" DOUBLE PRECISION NOT NULL,
  "absoluteDifference" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "relativeDifference" DOUBLE PRECISION,
  "sampleSize" INTEGER NOT NULL,
  "minimumSampleSize" INTEGER NOT NULL DEFAULT 50,
  "triggeredNumerator" INTEGER NOT NULL DEFAULT 0,
  "triggeredDenominator" INTEGER NOT NULL DEFAULT 0,
  "baselineNumerator" INTEGER NOT NULL DEFAULT 0,
  "baselineDenominator" INTEGER NOT NULL DEFAULT 0,
  "evidenceWindow" TEXT NOT NULL,
  "evidenceDetails" JSONB,
  "recommendation" TEXT,
  "status" "RuleReviewStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "decision" TEXT,
  "notes" TEXT,
  CONSTRAINT "RuleReviewCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_status_idx" ON "RuleReviewCandidate"("status");
CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_ruleType_idx" ON "RuleReviewCandidate"("ruleType");
CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_ruleKey_idx" ON "RuleReviewCandidate"("ruleKey");
CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_ruleVersion_idx" ON "RuleReviewCandidate"("ruleVersion");
CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_ruleType_ruleKey_ruleVersion_idx" ON "RuleReviewCandidate"("ruleType", "ruleKey", "ruleVersion");
CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_createdAt_idx" ON "RuleReviewCandidate"("createdAt");
CREATE INDEX IF NOT EXISTS "RuleReviewCandidate_reviewedAt_idx" ON "RuleReviewCandidate"("reviewedAt");

DO $$ BEGIN
  ALTER TABLE "RuleReviewCandidate" ADD CONSTRAINT "RuleReviewCandidate_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "DailyMetricSnapshot" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "dateKey" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "dimension" TEXT NOT NULL DEFAULT 'GLOBAL',
  "dimensionValue" TEXT NOT NULL DEFAULT 'ALL',
  "value" DOUBLE PRECISION,
  "numerator" INTEGER NOT NULL DEFAULT 0,
  "denominator" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'VALID',
  "version" TEXT NOT NULL DEFAULT 'V1',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyMetricSnapshot_dateKey_metric_dimension_dimensionValue_version_key"
  ON "DailyMetricSnapshot"("dateKey", "metric", "dimension", "dimensionValue", "version");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_date_idx" ON "DailyMetricSnapshot"("date");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_dateKey_idx" ON "DailyMetricSnapshot"("dateKey");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_metric_idx" ON "DailyMetricSnapshot"("metric");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_dimension_dimensionValue_idx" ON "DailyMetricSnapshot"("dimension", "dimensionValue");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_metric_dimension_date_idx" ON "DailyMetricSnapshot"("metric", "dimension", "date");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_version_idx" ON "DailyMetricSnapshot"("version");
CREATE INDEX IF NOT EXISTS "DailyMetricSnapshot_createdAt_idx" ON "DailyMetricSnapshot"("createdAt");
`;

export const PHASE8_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'DISCOVERED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'FETCHED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'VALIDATED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'NORMALIZED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'PROCESSED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'FAILED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
  ALTER TYPE "ImportRecordStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';
EXCEPTION
  WHEN others THEN null;
END $$;

ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "collectorKey" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "collectorVersion" TEXT NOT NULL DEFAULT 'manual-v1';
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "contractVersion" TEXT NOT NULL DEFAULT 'INGESTION_CONTRACT_V1';
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "configurationStatus" TEXT NOT NULL DEFAULT 'CONFIGURED';
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "healthStatus" TEXT NOT NULL DEFAULT 'HEALTHY';
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "circuitState" TEXT NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "circuitOpenedAt" TIMESTAMP(3);
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "totalSuccessCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "totalFailureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "averageDurationMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "scheduleCron" TEXT;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "scheduleIntervalMinutes" INTEGER;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "nextRunAt" TIMESTAMP(3);
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "lastSuccessAt" TIMESTAMP(3);
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "lastFailureAt" TIMESTAMP(3);
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "acquisitionCostPerRunEgp" DOUBLE PRECISION;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "acquisitionCostPerRecordEgp" DOUBLE PRECISION;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "maxRecordsPerRun" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "batchSize" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "requestsPerMinute" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "maxConcurrentRequests" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "timeoutMs" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "maxRetries" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "baseRetryDelayMs" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "maxRetryDelayMs" INTEGER NOT NULL DEFAULT 16000;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "retentionDaysRaw" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "LeadSource" ADD COLUMN IF NOT EXISTS "activeJobId" TEXT;

CREATE INDEX IF NOT EXISTS "LeadSource_type_idx" ON "LeadSource"("type");
CREATE INDEX IF NOT EXISTS "LeadSource_healthStatus_idx" ON "LeadSource"("healthStatus");
CREATE INDEX IF NOT EXISTS "LeadSource_nextRunAt_idx" ON "LeadSource"("nextRunAt");
CREATE INDEX IF NOT EXISTS "LeadSource_isActive_nextRunAt_idx" ON "LeadSource"("isActive", "nextRunAt");
CREATE INDEX IF NOT EXISTS "LeadSource_priority_idx" ON "LeadSource"("priority");

ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "collectorVersion" TEXT NOT NULL DEFAULT 'manual-v1';
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "contractVersion" TEXT NOT NULL DEFAULT 'INGESTION_CONTRACT_V1';
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "rawPayloadRetained" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "retentionExpiresAt" TIMESTAMP(3);
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SourceRecord_importJobId_idx" ON "SourceRecord"("importJobId");
CREATE INDEX IF NOT EXISTS "SourceRecord_checksum_idx" ON "SourceRecord"("checksum");
CREATE INDEX IF NOT EXISTS "SourceRecord_lastSeenAt_idx" ON "SourceRecord"("lastSeenAt");

ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "collectorVersion" TEXT NOT NULL DEFAULT 'manual-v1';
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "contractVersion" TEXT NOT NULL DEFAULT 'INGESTION_CONTRACT_V1';
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "triggerType" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "discoveredCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "fetchedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "normalizedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "insertedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "updatedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "possibleDuplicateCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "conflictCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "skippedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "saleableCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "deadLetterCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "errorSummary" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "checkpoint" JSONB;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "configurationSnapshot" JSONB;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "backfillStartDate" TIMESTAMP(3);
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "backfillEndDate" TIMESTAMP(3);
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "acquisitionCostEgp" DOUBLE PRECISION;
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ImportJob_sourceId_idx" ON "ImportJob"("sourceId");
CREATE INDEX IF NOT EXISTS "ImportJob_status_idx" ON "ImportJob"("status");
CREATE INDEX IF NOT EXISTS "ImportJob_sourceId_status_idx" ON "ImportJob"("sourceId", "status");
CREATE INDEX IF NOT EXISTS "ImportJob_idempotencyKey_idx" ON "ImportJob"("idempotencyKey");

ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "collectorVersion" TEXT NOT NULL DEFAULT 'manual-v1';
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "normalizedData" JSONB;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "lifecycleStage" TEXT NOT NULL DEFAULT 'PROCESSED';
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "sourceRecordId" TEXT;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "retentionExpiresAt" TIMESTAMP(3);
ALTER TABLE "ImportRecord" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ImportRecord_externalId_idx" ON "ImportRecord"("externalId");
CREATE INDEX IF NOT EXISTS "ImportRecord_sourceType_externalId_idx" ON "ImportRecord"("sourceType", "externalId");
CREATE INDEX IF NOT EXISTS "ImportRecord_checksum_idx" ON "ImportRecord"("checksum");
CREATE INDEX IF NOT EXISTS "ImportRecord_leadId_idx" ON "ImportRecord"("leadId");

CREATE TABLE IF NOT EXISTS "DeadLetterRecord" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceName" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL DEFAULT 'MANUAL',
  "externalId" TEXT,
  "importJobId" TEXT,
  "importRecordId" TEXT,
  "collectorVersion" TEXT NOT NULL DEFAULT 'manual-v1',
  "failureReason" TEXT NOT NULL,
  "errorCode" TEXT NOT NULL DEFAULT 'RETRY_EXHAUSTED',
  "lastError" TEXT NOT NULL,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 3,
  "status" TEXT NOT NULL DEFAULT 'DEAD_LETTER',
  "rawPayload" JSONB,
  "normalizedPayload" JSONB,
  "checksum" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "resolutionNotes" TEXT,
  "resolvedLeadId" TEXT,
  "retentionExpiresAt" TIMESTAMP(3),
  "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeadLetterRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeadLetterRecord_status_idx" ON "DeadLetterRecord"("status");
CREATE INDEX IF NOT EXISTS "DeadLetterRecord_sourceId_idx" ON "DeadLetterRecord"("sourceId");
CREATE INDEX IF NOT EXISTS "DeadLetterRecord_sourceType_externalId_idx" ON "DeadLetterRecord"("sourceType", "externalId");
CREATE INDEX IF NOT EXISTS "DeadLetterRecord_importJobId_idx" ON "DeadLetterRecord"("importJobId");
CREATE INDEX IF NOT EXISTS "DeadLetterRecord_errorCode_idx" ON "DeadLetterRecord"("errorCode");
CREATE INDEX IF NOT EXISTS "DeadLetterRecord_createdAt_idx" ON "DeadLetterRecord"("createdAt");

DO $$ BEGIN
  ALTER TABLE "DeadLetterRecord" ADD CONSTRAINT "DeadLetterRecord_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DeadLetterRecord" ADD CONSTRAINT "DeadLetterRecord_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`;

export const SECURITY_HARDENING_SCHEMA_UPGRADE_SQL = `
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsRevokedBefore" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
`;

export const LEAD_MOCK_SEPARATION_SCHEMA_UPGRADE_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE (table_name = 'Lead' OR table_name = 'lead') AND (column_name = 'isMock' OR column_name = 'ismock')
  ) THEN
    ALTER TABLE "Lead" ADD COLUMN "isMock" BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE "Lead" ALTER COLUMN "isMock" SET DEFAULT false;
  END IF;
EXCEPTION
  WHEN others THEN null;
END $$;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "isMock" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Lead_isMock_idx" ON "Lead"("isMock");
CREATE INDEX IF NOT EXISTS "Lead_isMock_saleabilityStatus_idx" ON "Lead"("isMock", "saleabilityStatus");
`;

export const USER_EMAIL_VERIFIED_SCHEMA_UPGRADE_SQL = `
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "emailVerified" DROP DEFAULT;
`;

export const REFUND_REPORT_UNIQUE_SCHEMA_UPGRADE_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "idx_lead_feedback_unique_claim_refund_report"
ON "LeadFeedback" ("claimId")
WHERE "type" = 'REFUND_REPORT' AND "claimId" IS NOT NULL;
`;

export const EMAIL_VERIFICATION_TOKENS_SCHEMA_UPGRADE_SQL = `
CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_lookup_idx" ON "EmailVerificationToken"("tokenHash", "expiresAt", "consumedAt");
`;

/**
 * Ensures the PostgreSQL schema is applied to the active PGlite instance if tables do not exist yet,
 * and applies incremental Phase 1–8 schema upgrades if tables already exist.
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
      if (shouldUseExternalPg()) {
        globalForPrisma.schemaInitialized = true;
        return;
      }
      await activePrisma.user.count();
      globalForPrisma.schemaInitialized = true;
      if (activePg) {
        await activePg.exec(PHASE1_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE2_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE3_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE4_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE5_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE6_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE7_SCHEMA_UPGRADE_SQL);
        await activePg.exec(PHASE8_SCHEMA_UPGRADE_SQL);
        await activePg.exec(SECURITY_HARDENING_SCHEMA_UPGRADE_SQL);
        await activePg.exec(LEAD_MOCK_SEPARATION_SCHEMA_UPGRADE_SQL);
        await activePg.exec(USER_EMAIL_VERIFIED_SCHEMA_UPGRADE_SQL);
        await activePg.exec(REFUND_REPORT_UNIQUE_SCHEMA_UPGRADE_SQL);
        await activePg.exec(EMAIL_VERIFICATION_TOKENS_SCHEMA_UPGRADE_SQL);
      }
    } catch (err: any) {
      if (activePg) {
        const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/0001_init/migration.sql');
        if (fs.existsSync(migrationPath)) {
          const sql = fs.readFileSync(migrationPath, 'utf-8');
          await activePg.exec(sql);
          await activePg.exec(PHASE5_SCHEMA_UPGRADE_SQL);
          await activePg.exec(PHASE6_SCHEMA_UPGRADE_SQL);
          await activePg.exec(PHASE7_SCHEMA_UPGRADE_SQL);
          await activePg.exec(PHASE8_SCHEMA_UPGRADE_SQL);
          await activePg.exec(SECURITY_HARDENING_SCHEMA_UPGRADE_SQL);
          await activePg.exec(LEAD_MOCK_SEPARATION_SCHEMA_UPGRADE_SQL);
          await activePg.exec(USER_EMAIL_VERIFIED_SCHEMA_UPGRADE_SQL);
          await activePg.exec(REFUND_REPORT_UNIQUE_SCHEMA_UPGRADE_SQL);
          await activePg.exec(EMAIL_VERIFICATION_TOKENS_SCHEMA_UPGRADE_SQL);
        }
      } else {
        console.error('[DB] ensureDbReady connection probe error:', err?.message || err);
      }
      globalForPrisma.schemaInitialized = true;
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
  await memPg.exec(PHASE5_SCHEMA_UPGRADE_SQL);
  await memPg.exec(PHASE6_SCHEMA_UPGRADE_SQL);
  await memPg.exec(PHASE7_SCHEMA_UPGRADE_SQL);
  await memPg.exec(PHASE8_SCHEMA_UPGRADE_SQL);
  await memPg.exec(SECURITY_HARDENING_SCHEMA_UPGRADE_SQL);
  await memPg.exec(LEAD_MOCK_SEPARATION_SCHEMA_UPGRADE_SQL);
  await memPg.exec(USER_EMAIL_VERIFIED_SCHEMA_UPGRADE_SQL);
  await memPg.exec(REFUND_REPORT_UNIQUE_SCHEMA_UPGRADE_SQL);
  await memPg.exec(EMAIL_VERIFICATION_TOKENS_SCHEMA_UPGRADE_SQL);

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



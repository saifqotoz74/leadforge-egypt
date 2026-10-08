-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DEVELOPER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('NO_WEBSITE', 'HAS_WEBSITE', 'POOR_WEBSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('COLD', 'WARM', 'HOT', 'PREMIUM');

-- CreateEnum
CREATE TYPE "LeadAvailabilityStatus" AS ENUM ('AVAILABLE', 'CLAIMED_FULL', 'REQUIRES_VERIFICATION', 'STALE', 'INVALID', 'CLOSED', 'DUPLICATE', 'NOT_SALEABLE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QualityStatus" AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'EXCELLENT');

-- CreateEnum
CREATE TYPE "FreshnessState" AS ENUM ('FRESH', 'RECENT', 'NEEDS_VERIFICATION', 'STALE', 'VERY_STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PARTIALLY_VERIFIED', 'VERIFIED', 'FAILED_VERIFICATION');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('PHONE', 'EMAIL', 'WEBSITE', 'BUSINESS_STATUS', 'ADDRESS', 'IDENTITY', 'CATEGORY', 'LOCATION', 'FEEDBACK', 'FULL');

-- CreateEnum
CREATE TYPE "VerificationRecordStatus" AS ENUM ('VERIFIED', 'FAILED', 'UNKNOWN', 'NEEDS_REVERIFICATION');

-- CreateEnum
CREATE TYPE "BusinessOperationalStatus" AS ENUM ('OPEN', 'CLOSED', 'TEMPORARILY_CLOSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadOwnershipType" AS ENUM ('SHARED', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING', 'WON', 'LOST', 'NOT_INTERESTED', 'INVALID');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('WRONG_PHONE', 'BUSINESS_CLOSED', 'ALREADY_HAS_WEBSITE', 'NOT_INTERESTED', 'DUPLICATE', 'WRONG_CATEGORY', 'WRONG_LOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MANUAL', 'CSV_IMPORT', 'OPEN_DATA', 'DIRECTORY', 'WEBSITE', 'GOOGLE_BUSINESS');

-- CreateEnum
CREATE TYPE "ImportRecordStatus" AS ENUM ('VALID', 'DUPLICATE', 'INVALID', 'POSSIBLE_DUPLICATE', 'CONFLICT');

-- CreateEnum
CREATE TYPE "SourceRecordStatus" AS ENUM ('ACTIVE', 'DUPLICATE', 'REJECTED', 'CONFLICT', 'STALE', 'MERGED', 'UNMERGED');

-- CreateEnum
CREATE TYPE "DeduplicationDecisionType" AS ENUM ('UNIQUE', 'DUPLICATE_CONFIRMED', 'POSSIBLE_DUPLICATE', 'CONFLICT');

-- CreateEnum
CREATE TYPE "DuplicateCandidateStatus" AS ENUM ('PENDING', 'CONFIRMED_MERGED', 'KEPT_SEPARATE', 'MARKED_INVALID', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ScoringTrigger" AS ENUM ('LEAD_CREATED', 'LEAD_UPDATED', 'SOURCE_REFRESH', 'MANUAL_RECALCULATION', 'ADMIN_RECALCULATION', 'SCHEDULED_RECALCULATION');

-- CreateEnum
CREATE TYPE "MatchingRuleCategory" AS ENUM ('SERVICE', 'NICHE', 'LOCATION', 'BUDGET', 'LEAD_TYPE', 'QUALITY', 'FRESHNESS', 'PREFERENCE', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "ServiceMatchMode" AS ENUM ('ALL_REQUIRED', 'ANY_REQUIRED');

-- CreateEnum
CREATE TYPE "UnknownDataPolicy" AS ENUM ('ALLOW_WITH_PENALTY', 'REQUIRE_VERIFICATION', 'FAIL');

-- CreateEnum
CREATE TYPE "RequiresVerificationMatchPolicy" AS ENUM ('EXCLUDE', 'VERIFIED_DEVELOPERS_ONLY', 'INCLUDE_WITH_WARNING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DEVELOPER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT,
    "bio" TEXT,
    "services" TEXT[] DEFAULT ARRAY['Website Development']::TEXT[],
    "preferredServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] DEFAULT ARRAY['القاهرة', 'الجيزة']::TEXT[],
    "supportedGovernorates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportedDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allLocationsMode" BOOLEAN NOT NULL DEFAULT false,
    "niches" TEXT[] DEFAULT ARRAY['Dental', 'Medical', 'Restaurant']::TEXT[],
    "preferredNiches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedNiches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allNichesMode" BOOLEAN NOT NULL DEFAULT false,
    "leadPreferences" TEXT[] DEFAULT ARRAY['NO_WEBSITE', 'POOR_WEBSITE']::TEXT[],
    "supportedLeadTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLeadTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedLeadTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minBudget" INTEGER NOT NULL DEFAULT 5000,
    "maxBudget" INTEGER DEFAULT 50000,
    "preferredMinBudget" INTEGER,
    "preferredMaxBudget" INTEGER,
    "budgetCurrency" TEXT NOT NULL DEFAULT 'EGP',
    "budgetRange" TEXT NOT NULL DEFAULT '5000-50000',
    "leadType" TEXT NOT NULL DEFAULT 'BOTH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAcceptingLeads" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "maxActiveLeads" INTEGER,
    "lastMatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "priceEgp" INTEGER NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "allowsExclusive" BOOLEAN NOT NULL DEFAULT true,
    "maxConcurrentClaims" INTEGER NOT NULL DEFAULT 100,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "credits" INTEGER NOT NULL DEFAULT 3,
    "totalCreditsGranted" INTEGER NOT NULL DEFAULT 3,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "governorate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "normalizedAddress" TEXT,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasPhone" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "hasEmail" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT,
    "normalizedDomain" TEXT,
    "websiteStatus" "WebsiteStatus" NOT NULL DEFAULT 'NO_WEBSITE',
    "facebook" TEXT,
    "normalizedFacebook" TEXT,
    "hasFacebook" BOOLEAN NOT NULL DEFAULT false,
    "instagram" TEXT,
    "normalizedInstagram" TEXT,
    "hasInstagram" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "branchCount" INTEGER NOT NULL DEFAULT 1,
    "estimatedBudget" INTEGER NOT NULL DEFAULT 8000,
    "minBudget" INTEGER,
    "maxBudget" INTEGER,
    "budgetCurrency" TEXT NOT NULL DEFAULT 'EGP',
    "budgetType" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "requiredService" TEXT,
    "requiredServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "projectLeadType" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "isRecentlyActive" BOOLEAN NOT NULL DEFAULT true,
    "score" INTEGER NOT NULL DEFAULT 0,
    "temperature" "LeadTemperature" NOT NULL DEFAULT 'COLD',
    "scoringVersion" TEXT NOT NULL DEFAULT 'v1',
    "scoreExplanation" JSONB,
    "lastScoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LeadAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "qualificationReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualificationRules" JSONB NOT NULL DEFAULT '[]',
    "websiteAnalysis" JSONB,
    "leadType" "LeadOwnershipType" NOT NULL DEFAULT 'SHARED',
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "maxPurchasers" INTEGER NOT NULL DEFAULT 3,
    "currentPurchasers" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "sourceList" TEXT[] DEFAULT ARRAY['Manual']::TEXT[],
    "sourceId" TEXT,
    "canonicalIdentityKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fieldProvenance" JSONB,
    "fieldConflicts" JSONB,
    "isCanonical" BOOLEAN NOT NULL DEFAULT true,
    "mergedIntoLeadId" TEXT,
    "qualityScore" INTEGER NOT NULL DEFAULT 50,
    "qualityStatus" "QualityStatus" NOT NULL DEFAULT 'MEDIUM',
    "freshnessStatus" "FreshnessState" NOT NULL DEFAULT 'FRESH',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "saleabilityStatus" "LeadAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "completenessBreakdown" JSONB,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualitySummary" JSONB,
    "businessStatus" "BusinessOperationalStatus" NOT NULL DEFAULT 'OPEN',
    "phoneValidationStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "emailValidationStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "websiteVerificationState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastVerifiedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "nextVerificationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "recordsCount" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadIdentity" (
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

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMergeHistory" (
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

    CONSTRAINT "LeadMergeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "previousScore" INTEGER,
    "rawScore" INTEGER NOT NULL,
    "normalizedScore" INTEGER NOT NULL,
    "newScore" INTEGER NOT NULL DEFAULT 0,
    "previousClassification" TEXT,
    "temperature" TEXT NOT NULL,
    "newClassification" TEXT NOT NULL DEFAULT 'COLD',
    "scoringVersion" TEXT NOT NULL DEFAULT 'v1',
    "trigger" "ScoringTrigger" NOT NULL DEFAULT 'MANUAL_RECALCULATION',
    "appliedRules" JSONB NOT NULL,
    "evaluatedRules" JSONB,
    "explanation" JSONB,
    "qualificationReasons" TEXT[],
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "ruleGroup" TEXT,
    "weight" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringConfig" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshnessConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "freshMaxDays" INTEGER NOT NULL DEFAULT 7,
    "recentMaxDays" INTEGER NOT NULL DEFAULT 30,
    "needsVerifyMaxDays" INTEGER NOT NULL DEFAULT 90,
    "staleMaxDays" INTEGER NOT NULL DEFAULT 180,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreshnessConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityConfig" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadVerification" (
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

-- CreateTable
CREATE TABLE "LeadClaim" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pipelineStatus" "PipelineStatus" NOT NULL DEFAULT 'NEW',
    "creditsSpent" INTEGER NOT NULL DEFAULT 1,
    "exclusiveClaim" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadFeedback" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimId" TEXT,
    "useful" BOOLEAN NOT NULL,
    "reason" "FeedbackReason",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusHistory" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amountEgp" INTEGER NOT NULL,
    "creditsGranted" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SANDBOX',
    "providerRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT NOT NULL,
    "fileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "status" "ImportRecordStatus" NOT NULL,
    "errorMessage" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingRule" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingConfig" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSnapshot" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperProfile_userId_key" ON "DeveloperProfile"("userId");

-- CreateIndex
CREATE INDEX "DeveloperProfile_isActive_isAcceptingLeads_idx" ON "DeveloperProfile"("isActive", "isAcceptingLeads");

-- CreateIndex
CREATE INDEX "DeveloperProfile_minBudget_maxBudget_idx" ON "DeveloperProfile"("minBudget", "maxBudget");

-- CreateIndex
CREATE INDEX "DeveloperProfile_leadType_idx" ON "DeveloperProfile"("leadType");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_governorate_idx" ON "Lead"("governorate");

-- CreateIndex
CREATE INDEX "Lead_category_idx" ON "Lead"("category");

-- CreateIndex
CREATE INDEX "Lead_score_idx" ON "Lead"("score");

-- CreateIndex
CREATE INDEX "Lead_temperature_idx" ON "Lead"("temperature");

-- CreateIndex
CREATE INDEX "Lead_scoringVersion_idx" ON "Lead"("scoringVersion");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_qualityScore_idx" ON "Lead"("qualityScore");

-- CreateIndex
CREATE INDEX "Lead_qualityStatus_idx" ON "Lead"("qualityStatus");

-- CreateIndex
CREATE INDEX "Lead_freshnessStatus_idx" ON "Lead"("freshnessStatus");

-- CreateIndex
CREATE INDEX "Lead_verificationStatus_idx" ON "Lead"("verificationStatus");

-- CreateIndex
CREATE INDEX "Lead_saleabilityStatus_idx" ON "Lead"("saleabilityStatus");

-- CreateIndex
CREATE INDEX "Lead_businessStatus_idx" ON "Lead"("businessStatus");

-- CreateIndex
CREATE INDEX "Lead_website_idx" ON "Lead"("website");

-- CreateIndex
CREATE INDEX "Lead_websiteStatus_idx" ON "Lead"("websiteStatus");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_normalizedPhone_idx" ON "Lead"("normalizedPhone");

-- CreateIndex
CREATE INDEX "Lead_normalizedDomain_idx" ON "Lead"("normalizedDomain");

-- CreateIndex
CREATE INDEX "Lead_normalizedEmail_idx" ON "Lead"("normalizedEmail");

-- CreateIndex
CREATE INDEX "Lead_normalizedFacebook_idx" ON "Lead"("normalizedFacebook");

-- CreateIndex
CREATE INDEX "Lead_normalizedInstagram_idx" ON "Lead"("normalizedInstagram");

-- CreateIndex
CREATE INDEX "Lead_normalizedName_city_idx" ON "Lead"("normalizedName", "city");

-- CreateIndex
CREATE INDEX "Lead_normalizedName_normalizedAddress_city_idx" ON "Lead"("normalizedName", "normalizedAddress", "city");

-- CreateIndex
CREATE INDEX "Lead_isCanonical_idx" ON "Lead"("isCanonical");

-- CreateIndex
CREATE INDEX "Lead_mergedIntoLeadId_idx" ON "Lead"("mergedIntoLeadId");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_lastVerifiedAt_idx" ON "Lead"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "Lead_nextVerificationAt_idx" ON "Lead"("nextVerificationAt");

-- CreateIndex
CREATE INDEX "Lead_requiredService_idx" ON "Lead"("requiredService");

-- CreateIndex
CREATE INDEX "Lead_projectLeadType_idx" ON "Lead"("projectLeadType");

-- CreateIndex
CREATE INDEX "Lead_estimatedBudget_idx" ON "Lead"("estimatedBudget");

-- CreateIndex
CREATE INDEX "Lead_saleabilityStatus_isCanonical_status_idx" ON "Lead"("saleabilityStatus", "isCanonical", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_name_key" ON "LeadSource"("name");

-- CreateIndex
CREATE INDEX "SourceRecord_leadId_idx" ON "SourceRecord"("leadId");

-- CreateIndex
CREATE INDEX "SourceRecord_sourceId_idx" ON "SourceRecord"("sourceId");

-- CreateIndex
CREATE INDEX "SourceRecord_sourceId_externalId_idx" ON "SourceRecord"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "SourceRecord_sourceType_externalId_idx" ON "SourceRecord"("sourceType", "externalId");

-- CreateIndex
CREATE INDEX "SourceRecord_externalId_idx" ON "SourceRecord"("externalId");

-- CreateIndex
CREATE INDEX "SourceRecord_status_idx" ON "SourceRecord"("status");

-- CreateIndex
CREATE INDEX "SourceRecord_decision_idx" ON "SourceRecord"("decision");

-- CreateIndex
CREATE INDEX "SourceRecord_createdAt_idx" ON "SourceRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_sourceName_externalId_key" ON "SourceRecord"("sourceName", "externalId");

-- CreateIndex
CREATE INDEX "LeadIdentity_canonicalKey_idx" ON "LeadIdentity"("canonicalKey");

-- CreateIndex
CREATE INDEX "LeadIdentity_keyType_keyValue_idx" ON "LeadIdentity"("keyType", "keyValue");

-- CreateIndex
CREATE INDEX "LeadIdentity_leadId_idx" ON "LeadIdentity"("leadId");

-- CreateIndex
CREATE INDEX "LeadIdentity_sourceRecordId_idx" ON "LeadIdentity"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadIdentity_leadId_canonicalKey_key" ON "LeadIdentity"("leadId", "canonicalKey");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_status_idx" ON "DuplicateCandidate"("status");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_decision_idx" ON "DuplicateCandidate"("decision");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_matchedLeadId_idx" ON "DuplicateCandidate"("matchedLeadId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_candidateLeadId_idx" ON "DuplicateCandidate"("candidateLeadId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_sourceRecordId_idx" ON "DuplicateCandidate"("sourceRecordId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_createdAt_idx" ON "DuplicateCandidate"("createdAt");

-- CreateIndex
CREATE INDEX "LeadMergeHistory_targetLeadId_idx" ON "LeadMergeHistory"("targetLeadId");

-- CreateIndex
CREATE INDEX "LeadMergeHistory_sourceLeadId_idx" ON "LeadMergeHistory"("sourceLeadId");

-- CreateIndex
CREATE INDEX "LeadMergeHistory_sourceRecordId_idx" ON "LeadMergeHistory"("sourceRecordId");

-- CreateIndex
CREATE INDEX "LeadMergeHistory_performedBy_idx" ON "LeadMergeHistory"("performedBy");

-- CreateIndex
CREATE INDEX "LeadMergeHistory_performedAt_idx" ON "LeadMergeHistory"("performedAt");

-- CreateIndex
CREATE INDEX "LeadMergeHistory_isReverted_idx" ON "LeadMergeHistory"("isReverted");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_idx" ON "LeadScore"("leadId");

-- CreateIndex
CREATE INDEX "LeadScore_scoringVersion_idx" ON "LeadScore"("scoringVersion");

-- CreateIndex
CREATE INDEX "LeadScore_evaluatedAt_idx" ON "LeadScore"("evaluatedAt");

-- CreateIndex
CREATE INDEX "LeadScore_calculatedAt_idx" ON "LeadScore"("calculatedAt");

-- CreateIndex
CREATE INDEX "LeadScore_leadId_calculatedAt_idx" ON "LeadScore"("leadId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRule_code_key" ON "ScoringRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRule_key_key" ON "ScoringRule"("key");

-- CreateIndex
CREATE INDEX "ScoringRule_enabled_idx" ON "ScoringRule"("enabled");

-- CreateIndex
CREATE INDEX "ScoringRule_category_idx" ON "ScoringRule"("category");

-- CreateIndex
CREATE INDEX "ScoringRule_ruleGroup_idx" ON "ScoringRule"("ruleGroup");

-- CreateIndex
CREATE INDEX "ScoringRule_version_idx" ON "ScoringRule"("version");

-- CreateIndex
CREATE INDEX "ScoringRule_sortOrder_idx" ON "ScoringRule"("sortOrder");

-- CreateIndex
CREATE INDEX "ScoringRule_createdAt_idx" ON "ScoringRule"("createdAt");

-- CreateIndex
CREATE INDEX "LeadVerification_leadId_idx" ON "LeadVerification"("leadId");

-- CreateIndex
CREATE INDEX "LeadVerification_verificationType_idx" ON "LeadVerification"("verificationType");

-- CreateIndex
CREATE INDEX "LeadVerification_status_idx" ON "LeadVerification"("status");

-- CreateIndex
CREATE INDEX "LeadVerification_checkedAt_idx" ON "LeadVerification"("checkedAt");

-- CreateIndex
CREATE INDEX "LeadVerification_expiresAt_idx" ON "LeadVerification"("expiresAt");

-- CreateIndex
CREATE INDEX "LeadVerification_leadId_verificationType_checkedAt_idx" ON "LeadVerification"("leadId", "verificationType", "checkedAt");

-- CreateIndex
CREATE INDEX "LeadClaim_userId_idx" ON "LeadClaim"("userId");

-- CreateIndex
CREATE INDEX "LeadClaim_leadId_idx" ON "LeadClaim"("leadId");

-- CreateIndex
CREATE INDEX "LeadClaim_pipelineStatus_idx" ON "LeadClaim"("pipelineStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LeadClaim_leadId_userId_key" ON "LeadClaim"("leadId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFeedback_claimId_key" ON "LeadFeedback"("claimId");

-- CreateIndex
CREATE INDEX "LeadFeedback_leadId_idx" ON "LeadFeedback"("leadId");

-- CreateIndex
CREATE INDEX "LeadFeedback_useful_idx" ON "LeadFeedback"("useful");

-- CreateIndex
CREATE INDEX "LeadFeedback_reason_idx" ON "LeadFeedback"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "LeadFeedback_leadId_userId_key" ON "LeadFeedback"("leadId", "userId");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_claimId_idx" ON "LeadStatusHistory"("claimId");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_leadId_idx" ON "LeadStatusHistory"("leadId");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_userId_idx" ON "LeadStatusHistory"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "ImportRecord_importJobId_idx" ON "ImportRecord"("importJobId");

-- CreateIndex
CREATE INDEX "ImportRecord_status_idx" ON "ImportRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingRule_key_key" ON "MatchingRule"("key");

-- CreateIndex
CREATE INDEX "MatchingRule_enabled_idx" ON "MatchingRule"("enabled");

-- CreateIndex
CREATE INDEX "MatchingRule_category_idx" ON "MatchingRule"("category");

-- CreateIndex
CREATE INDEX "MatchingRule_ruleGroup_idx" ON "MatchingRule"("ruleGroup");

-- CreateIndex
CREATE INDEX "MatchingRule_version_idx" ON "MatchingRule"("version");

-- CreateIndex
CREATE INDEX "MatchingRule_priority_idx" ON "MatchingRule"("priority");

-- CreateIndex
CREATE INDEX "MatchSnapshot_leadId_eligible_matchStrength_idx" ON "MatchSnapshot"("leadId", "eligible", "matchStrength");

-- CreateIndex
CREATE INDEX "MatchSnapshot_developerId_eligible_matchStrength_idx" ON "MatchSnapshot"("developerId", "eligible", "matchStrength");

-- CreateIndex
CREATE INDEX "MatchSnapshot_matchVersion_idx" ON "MatchSnapshot"("matchVersion");

-- CreateIndex
CREATE INDEX "MatchSnapshot_calculatedAt_idx" ON "MatchSnapshot"("calculatedAt");

-- CreateIndex
CREATE INDEX "MatchSnapshot_isStale_idx" ON "MatchSnapshot"("isStale");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSnapshot_leadId_developerId_matchVersion_key" ON "MatchSnapshot"("leadId", "developerId", "matchVersion");

-- AddForeignKey
ALTER TABLE "DeveloperProfile" ADD CONSTRAINT "DeveloperProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadIdentity" ADD CONSTRAINT "LeadIdentity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_candidateLeadId_fkey" FOREIGN KEY ("candidateLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_matchedLeadId_fkey" FOREIGN KEY ("matchedLeadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMergeHistory" ADD CONSTRAINT "LeadMergeHistory_targetLeadId_fkey" FOREIGN KEY ("targetLeadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMergeHistory" ADD CONSTRAINT "LeadMergeHistory_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMergeHistory" ADD CONSTRAINT "LeadMergeHistory_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVerification" ADD CONSTRAINT "LeadVerification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClaim" ADD CONSTRAINT "LeadClaim_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadClaim" ADD CONSTRAINT "LeadClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeedback" ADD CONSTRAINT "LeadFeedback_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeedback" ADD CONSTRAINT "LeadFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadFeedback" ADD CONSTRAINT "LeadFeedback_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "LeadClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "LeadClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSnapshot" ADD CONSTRAINT "MatchSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSnapshot" ADD CONSTRAINT "MatchSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DeveloperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { evaluateLeadFreshness } from '../freshness';
import {
  generateAdminMatchDebugReport,
  rankDevelopersForLead,
  rankLeadsForDeveloper,
} from './engine';
import { logMatchingEvent } from './logger';
import { DEFAULT_MATCHING_CONFIG, DEFAULT_MATCHING_RULES } from './rules';
import {
  normalizeNicheCode,
  normalizeProjectLeadType,
  normalizeServiceCode,
  resolveLeadProjectType,
  resolveLeadRequiredServices,
  resolveLocationHierarchy,
} from './taxonomy';
import {
  AdminMatchDebugReport,
  DeveloperMatchingContext,
  MatchableLeadInput,
  MatchingConfigData,
  MatchingRuleCategory,
  MatchingRuleDefinition,
  MatchResult,
} from './types';

/**
 * Ensures the singleton MatchingConfig and default MatchingRule rows are seeded in PostgreSQL.
 */
export async function ensureMatchingRulesSeeded(): Promise<void> {
  try {
    const existingConfig = await prisma.matchingConfig.findUnique({
      where: { id: 'default' },
    });

    if (!existingConfig) {
      await prisma.matchingConfig.create({
        data: {
          id: 'default',
          currentVersion: DEFAULT_MATCHING_CONFIG.currentVersion,
          versionNumber: DEFAULT_MATCHING_CONFIG.versionNumber,
          serviceMatchMode: 'ALL_REQUIRED',
          unknownLocationPolicy: 'ALLOW_WITH_PENALTY',
          unknownBudgetPolicy: 'ALLOW_WITH_PENALTY',
          requiresVerificationPolicy: 'EXCLUDE',
          budgetHardRequirement: DEFAULT_MATCHING_CONFIG.budgetHardRequirement,
          requireActiveSubscription: DEFAULT_MATCHING_CONFIG.requireActiveSubscription,
          requireDeveloperVerified: DEFAULT_MATCHING_CONFIG.requireDeveloperVerified,
          minMatchStrength: DEFAULT_MATCHING_CONFIG.minMatchStrength,
          maxMatchStrength: DEFAULT_MATCHING_CONFIG.maxMatchStrength,
          unknownLocationPenalty: DEFAULT_MATCHING_CONFIG.unknownLocationPenalty,
          unknownBudgetPenalty: DEFAULT_MATCHING_CONFIG.unknownBudgetPenalty,
        },
      });
    }

    const ruleCount = await prisma.matchingRule.count();
    if (ruleCount === 0) {
      for (const rule of DEFAULT_MATCHING_RULES) {
        await prisma.matchingRule.upsert({
          where: { key: rule.key },
          update: {},
          create: {
            key: rule.key,
            name: rule.name,
            nameEn: rule.nameEn,
            description: rule.description || null,
            category: rule.category as MatchingRuleCategory,
            ruleGroup: rule.ruleGroup || null,
            points: rule.points,
            priority: rule.priority,
            enabled: rule.enabled,
            version: rule.version,
            condition: rule.condition as Prisma.InputJsonValue,
          },
        });
      }
    }
  } catch {
    // Non-fatal fallback to in-memory defaults if DB is initializing
  }
}

export async function getActiveMatchingConfigAndRules(): Promise<{
  config: MatchingConfigData;
  rules: MatchingRuleDefinition[];
}> {
  await ensureMatchingRulesSeeded();

  const [dbConfig, dbRules] = await Promise.all([
    prisma.matchingConfig.findUnique({ where: { id: 'default' } }),
    prisma.matchingRule.findMany({
      orderBy: [{ priority: 'asc' }, { key: 'asc' }],
    }),
  ]);

  const config: MatchingConfigData = dbConfig
    ? {
        currentVersion: dbConfig.currentVersion,
        versionNumber: dbConfig.versionNumber,
        serviceMatchMode: dbConfig.serviceMatchMode,
        unknownLocationPolicy: dbConfig.unknownLocationPolicy,
        unknownBudgetPolicy: dbConfig.unknownBudgetPolicy,
        requiresVerificationPolicy: dbConfig.requiresVerificationPolicy,
        budgetHardRequirement: dbConfig.budgetHardRequirement,
        requireActiveSubscription: dbConfig.requireActiveSubscription,
        requireDeveloperVerified: dbConfig.requireDeveloperVerified,
        minMatchStrength: dbConfig.minMatchStrength,
        maxMatchStrength: dbConfig.maxMatchStrength,
        unknownLocationPenalty: dbConfig.unknownLocationPenalty,
        unknownBudgetPenalty: dbConfig.unknownBudgetPenalty,
        minSaleableQualityScore: DEFAULT_MATCHING_CONFIG.minSaleableQualityScore,
      }
    : { ...DEFAULT_MATCHING_CONFIG };

  const rules: MatchingRuleDefinition[] =
    dbRules.length > 0
      ? dbRules.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          nameEn: r.nameEn,
          description: r.description,
          category: r.category,
          ruleGroup: r.ruleGroup,
          points: r.points,
          priority: r.priority,
          enabled: r.enabled,
          version: r.version,
          condition: (r.condition as Record<string, unknown>) || {},
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }))
      : DEFAULT_MATCHING_RULES;

  return { config, rules };
}

/**
 * Increments the active matching version (e.g., v1 -> v2) and marks existing snapshots as stale.
 */
export async function bumpMatchingVersion(): Promise<string> {
  await ensureMatchingRulesSeeded();
  const current = await prisma.matchingConfig.findUnique({ where: { id: 'default' } });
  const nextNum = (current?.versionNumber || 1) + 1;
  const nextVersion = `v${nextNum}`;

  await prisma.matchingConfig.update({
    where: { id: 'default' },
    data: {
      versionNumber: nextNum,
      currentVersion: nextVersion,
    },
  });

  await prisma.matchSnapshot.updateMany({
    data: { isStale: true },
  });

  return nextVersion;
}

export function mapDbLeadToMatchable(lead: Record<string, unknown>): MatchableLeadInput {
  const rawFreshness = String(lead.freshnessStatus || lead.freshness || '').toUpperCase();
  let effectiveFreshness = rawFreshness || 'FRESH';
  if ((!rawFreshness || rawFreshness === 'FRESH') && lead.lastVerifiedAt) {
    const dyn = evaluateLeadFreshness(lead.lastVerifiedAt as Date | string);
    if (dyn.freshnessStatus && dyn.freshnessStatus !== 'UNKNOWN') {
      effectiveFreshness = dyn.freshnessStatus;
    }
  }

  let claimedDeveloperIds: string[] = [];
  if (Array.isArray(lead.claimedDeveloperIds)) {
    claimedDeveloperIds = lead.claimedDeveloperIds.map(String);
  } else if (Array.isArray(lead.claims)) {
    claimedDeveloperIds = (
      lead.claims as Array<{ userId?: string; status?: string; accessGranted?: boolean }>
    )
      .filter((c) => (!c?.status || c.status === 'ACTIVE') && c?.accessGranted !== false)
      .map((c) => (c?.userId ? String(c.userId) : ''))
      .filter(Boolean);
  }

  return {
    id: String(lead.id),
    businessName: lead.businessName ? String(lead.businessName) : undefined,
    category: String(lead.category || 'OTHER'),
    governorate: String(lead.governorate || ''),
    city: String(lead.city || ''),
    area: lead.area ? String(lead.area) : null,
    website: lead.website ? String(lead.website) : null,
    websiteStatus: String(lead.websiteStatus || 'NO_WEBSITE'),
    websiteAnalysis: (lead.websiteAnalysis as Record<string, unknown>) || null,
    requiredService: lead.requiredService ? String(lead.requiredService) : null,
    requiredServices: Array.isArray(lead.requiredServices)
      ? (lead.requiredServices as string[])
      : [],
    projectLeadType: lead.projectLeadType ? String(lead.projectLeadType) : null,
    estimatedBudget:
      typeof lead.estimatedBudget === 'number' ? lead.estimatedBudget : null,
    minBudget: typeof lead.minBudget === 'number' ? lead.minBudget : null,
    maxBudget: typeof lead.maxBudget === 'number' ? lead.maxBudget : null,
    budgetCurrency: lead.budgetCurrency ? String(lead.budgetCurrency) : 'EGP',
    budgetType: lead.budgetType ? String(lead.budgetType) : 'ESTIMATED',
    leadType: String(lead.leadType || 'SHARED'),
    exclusive: Boolean(lead.exclusive),
    maxPurchasers: typeof lead.maxPurchasers === 'number' ? lead.maxPurchasers : 3,
    currentPurchasers:
      typeof lead.currentPurchasers === 'number' ? lead.currentPurchasers : 0,
    score: typeof lead.score === 'number' ? lead.score : 50,
    opportunityScore: typeof lead.score === 'number' ? lead.score : 50,
    temperature: String(lead.temperature || 'WARM'),
    qualityScore: typeof lead.qualityScore === 'number' ? lead.qualityScore : 75,
    qualityStatus: String(lead.qualityStatus || 'HIGH_QUALITY'),
    freshnessStatus: effectiveFreshness,
    freshness: effectiveFreshness,
    verificationStatus: String(lead.verificationStatus || 'VERIFIED'),
    saleabilityStatus: String(lead.saleabilityStatus || lead.status || 'AVAILABLE'),
    status: String(lead.status || 'AVAILABLE'),
    businessStatus: String(lead.businessStatus || 'OPEN'),
    isCanonical: lead.isCanonical !== false,
    mergedIntoLeadId: lead.mergedIntoLeadId ? String(lead.mergedIntoLeadId) : null,
    hasPhone: Boolean(lead.hasPhone || lead.phone),
    hasEmail: Boolean(lead.hasEmail || lead.email),
    phoneValidationStatus: String(lead.phoneValidationStatus || 'VALID'),
    emailValidationStatus: String(lead.emailValidationStatus || 'MISSING'),
    websiteVerificationState: String(lead.websiteVerificationState || 'NO_SITE'),
    qualityFlags: Array.isArray(lead.qualityFlags) ? (lead.qualityFlags as string[]) : [],
    lastVerifiedAt: (lead.lastVerifiedAt as Date | string | null) || null,
    createdAt: (lead.createdAt as Date | string) || undefined,
    claimedDeveloperIds,
  };
}

export function mapDbDeveloperToContext(user: {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  status?: string;
  developerProfile?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  subscriptions?: Array<Record<string, unknown>>;
  _count?: { claims?: number; purchases?: number };
}): DeveloperMatchingContext {
  const p = user.developerProfile ?? user.profile ?? null;
  const activeSub =
    user.subscription ??
    (Array.isArray(user.subscriptions) && user.subscriptions.length > 0
      ? user.subscriptions[0]
      : null);
  const planObj = (activeSub?.plan as Record<string, unknown> | undefined) || null;

  return {
    developerId: user.id,
    userId: user.id,
    name: user.name || (p?.companyName ? String(p.companyName) : user.email || user.id),
    email: user.email || undefined,
    role: user.role === 'ADMIN' ? 'ADMIN' : 'DEVELOPER',
    userStatus: String(user.status || 'ACTIVE'),
    status: String(user.status || 'ACTIVE'),
    activeClaimsCount: user._count?.claims ?? user._count?.purchases ?? 0,
    profile: p
      ? {
          id: String(p.id || ''),
          userId: user.id,
          developerId: user.id,
          companyName: p.companyName ? String(p.companyName) : null,
          services: Array.isArray(p.services) ? (p.services as string[]) : [],
          preferredServices: Array.isArray(p.preferredServices)
            ? (p.preferredServices as string[])
            : [],
          excludedServices: Array.isArray(p.excludedServices)
            ? (p.excludedServices as string[])
            : [],
          locations: Array.isArray(p.locations) ? (p.locations as string[]) : [],
          supportedGovernorates: Array.isArray(p.supportedGovernorates)
            ? (p.supportedGovernorates as string[])
            : [],
          supportedCities: Array.isArray(p.supportedCities)
            ? (p.supportedCities as string[])
            : [],
          supportedDistricts: Array.isArray(p.supportedDistricts)
            ? (p.supportedDistricts as string[])
            : [],
          preferredCities: Array.isArray(p.preferredCities)
            ? (p.preferredCities as string[])
            : [],
          excludedLocations: Array.isArray(p.excludedLocations)
            ? (p.excludedLocations as string[])
            : [],
          allLocationsMode: Boolean(p.allLocationsMode),
          niches: Array.isArray(p.niches) ? (p.niches as string[]) : [],
          preferredNiches: Array.isArray(p.preferredNiches)
            ? (p.preferredNiches as string[])
            : [],
          excludedNiches: Array.isArray(p.excludedNiches)
            ? (p.excludedNiches as string[])
            : [],
          allNichesMode: Boolean(p.allNichesMode),
          leadPreferences: Array.isArray(p.leadPreferences)
            ? (p.leadPreferences as string[])
            : [],
          supportedLeadTypes: Array.isArray(p.supportedLeadTypes)
            ? (p.supportedLeadTypes as string[])
            : [],
          preferredLeadTypes: Array.isArray(p.preferredLeadTypes)
            ? (p.preferredLeadTypes as string[])
            : [],
          excludedLeadTypes: Array.isArray(p.excludedLeadTypes)
            ? (p.excludedLeadTypes as string[])
            : [],
          minBudget: typeof p.minBudget === 'number' ? p.minBudget : 5000,
          maxBudget: typeof p.maxBudget === 'number' ? p.maxBudget : null,
          preferredMinBudget:
            typeof p.preferredMinBudget === 'number' ? p.preferredMinBudget : null,
          preferredMaxBudget:
            typeof p.preferredMaxBudget === 'number' ? p.preferredMaxBudget : null,
          budgetCurrency: p.budgetCurrency ? String(p.budgetCurrency) : 'EGP',
          budgetRange: p.budgetRange ? String(p.budgetRange) : undefined,
          leadType: p.leadType ? String(p.leadType) : 'BOTH',
          isActive: p.isActive !== false,
          isAcceptingLeads: p.isAcceptingLeads !== false,
          isVerified: p.isVerified !== false,
          isComplete: p.isComplete !== false,
          maxActiveLeads: typeof p.maxActiveLeads === 'number' ? p.maxActiveLeads : null,
        }
      : null,
    subscription: activeSub
      ? {
          id: String(activeSub.id || ''),
          status: String(activeSub.status || 'ACTIVE'),
          credits: typeof activeSub.credits === 'number' ? activeSub.credits : undefined,
          currentPeriodEnd: (activeSub.currentPeriodEnd as Date | string | null) || null,
          plan: planObj
            ? {
                id: String(planObj.id || ''),
                slug: String(planObj.slug || ''),
                name: String(planObj.name || ''),
                nameEn: String(planObj.nameEn || ''),
                allowsExclusive: planObj.allowsExclusive !== false,
                maxConcurrentClaims:
                  typeof planObj.maxConcurrentClaims === 'number'
                    ? planObj.maxConcurrentClaims
                    : undefined,
                isActive: planObj.isActive !== false,
              }
            : null,
        }
      : null,
  };
}

export async function persistMatchSnapshot(result: MatchResult): Promise<void> {
  try {
    await prisma.matchSnapshot.upsert({
      where: {
        leadId_developerId_matchVersion: {
          leadId: result.leadId,
          developerId: result.developerId,
          matchVersion: result.matchVersion,
        },
      },
      update: {
        eligible: result.eligible,
        rank: result.rank,
        matchStrength: result.matchStrength,
        rawMatchPoints: result.rawMatchPoints,
        matchedCriteria: result.matchedCriteria as unknown as Prisma.InputJsonValue,
        failedCriteria: result.failedCriteria as unknown as Prisma.InputJsonValue,
        hardFailures: result.hardFailures as unknown as Prisma.InputJsonValue,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        explanation: result.explanation as unknown as Prisma.InputJsonValue,
        opportunityScore: result.opportunityScore,
        qualityScore: result.qualityScore,
        freshness: result.freshness,
        isStale: false,
        calculatedAt: new Date(result.calculatedAt),
      },
      create: {
        leadId: result.leadId,
        developerId: result.developerId,
        eligible: result.eligible,
        rank: result.rank,
        matchStrength: result.matchStrength,
        rawMatchPoints: result.rawMatchPoints,
        matchVersion: result.matchVersion,
        matchedCriteria: result.matchedCriteria as unknown as Prisma.InputJsonValue,
        failedCriteria: result.failedCriteria as unknown as Prisma.InputJsonValue,
        hardFailures: result.hardFailures as unknown as Prisma.InputJsonValue,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        explanation: result.explanation as unknown as Prisma.InputJsonValue,
        opportunityScore: result.opportunityScore,
        qualityScore: result.qualityScore,
        freshness: result.freshness,
        isStale: false,
        calculatedAt: new Date(result.calculatedAt),
      },
    });
  } catch {
    // Non-fatal if leadId or developerId is a mock/preview ID not in DB
  }
}

export async function getMatchesForLeadFromDb(
  leadId: string,
  options?: { includeRejected?: boolean; persistSnapshots?: boolean }
) {
  const leadRecord = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      claims: {
        where: { status: 'ACTIVE', accessGranted: true },
        select: { userId: true, status: true, accessGranted: true },
      },
    },
  });
  if (!leadRecord) {
    return null;
  }

  const developers = await prisma.user.findMany({
    where: { role: 'DEVELOPER' },
    include: {
      developerProfile: true,
      subscription: {
        include: { plan: true },
      },
      _count: {
        select: {
          claims: {
            where: {
              status: 'ACTIVE',
              pipelineStatus: { in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'] },
            },
          },
        },
      },
    },
  });

  const { config, rules } = await getActiveMatchingConfigAndRules();
  const matchableLead = mapDbLeadToMatchable(leadRecord as unknown as Record<string, unknown>);
  const devContexts = developers.map((d) =>
    mapDbDeveloperToContext(d as unknown as Parameters<typeof mapDbDeveloperToContext>[0])
  );

  const nowIso = new Date().toISOString();
  const ranked = rankDevelopersForLead(matchableLead, devContexts, {
    config,
    rules,
    matchVersion: config.currentVersion,
    calculatedAt: nowIso,
  });

  if (options?.persistSnapshots) {
    for (const res of ranked.allResults) {
      await persistMatchSnapshot(res);
    }
  }

  return {
    leadId: leadRecord.id,
    lead: {
      id: leadRecord.id,
      businessName: leadRecord.businessName,
      category: leadRecord.category,
      city: leadRecord.city,
      governorate: leadRecord.governorate,
      score: leadRecord.score,
      qualityScore: leadRecord.qualityScore,
      freshnessStatus: matchableLead.freshnessStatus,
      verificationStatus: leadRecord.verificationStatus,
      saleabilityStatus: leadRecord.saleabilityStatus,
    },
    matchVersion: ranked.matchVersion,
    eligibleDevelopers: ranked.eligibleDevelopers,
    rejectedDevelopers: options?.includeRejected ? ranked.rejectedDevelopers : undefined,
    reason: ranked.reason,
    diagnostics: ranked.diagnostics,
  };
}

export interface DeveloperMatchesQueryOptions {
  includeRejected?: boolean;
  limit?: number;
  offset?: number;
  minMatchStrength?: number;
  minQualityScore?: number;
  minOpportunityScore?: number;
  maxOpportunityScore?: number;
  service?: string;
  niche?: string;
  city?: string;
  governorate?: string;
  location?: string;
  leadType?: string;
  freshness?: string;
  persistSnapshots?: boolean;
}

export async function getMatchesForDeveloperFromDb(
  developerId: string,
  options?: DeveloperMatchesQueryOptions
) {
  const devUser = await prisma.user.findUnique({
    where: { id: developerId },
    include: {
      developerProfile: true,
      subscription: {
        include: { plan: true },
      },
      _count: {
        select: {
          claims: {
            where: {
              status: 'ACTIVE',
              pipelineStatus: { in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'] },
            },
          },
        },
      },
    },
  });

  if (!devUser) {
    return null;
  }

  const dbWhere: Prisma.LeadWhereInput = options?.includeRejected
    ? {}
    : {
        isCanonical: true,
      };

  if (typeof options?.minQualityScore === 'number' && options.minQualityScore > 0) {
    dbWhere.qualityScore = { gte: options.minQualityScore };
  }
  if (typeof options?.minOpportunityScore === 'number' && options.minOpportunityScore > 0) {
    dbWhere.score = {
      ...(typeof dbWhere.score === 'object' ? dbWhere.score : {}),
      gte: options.minOpportunityScore,
    };
  }
  if (typeof options?.maxOpportunityScore === 'number' && options.maxOpportunityScore < 100) {
    dbWhere.score = {
      ...(typeof dbWhere.score === 'object' ? dbWhere.score : {}),
      lte: options.maxOpportunityScore,
    };
  }

  const leads = await prisma.lead.findMany({
    where: dbWhere,
    include: {
      claims: {
        where: { status: 'ACTIVE', accessGranted: true },
        select: { userId: true, status: true, accessGranted: true },
      },
    },
    orderBy: [{ score: 'desc' }, { id: 'asc' }],
    take: 250,
  });

  const { config, rules } = await getActiveMatchingConfigAndRules();
  const devContext = mapDbDeveloperToContext(
    devUser as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
  );
  const matchableLeads = leads.map((l) =>
    mapDbLeadToMatchable(l as unknown as Record<string, unknown>)
  );

  const nowIso = new Date().toISOString();
  const ranked = rankLeadsForDeveloper(devContext, matchableLeads, {
    config,
    rules,
    matchVersion: config.currentVersion,
    calculatedAt: nowIso,
  });

  const minStrength = options?.minMatchStrength ?? 0;
  const targetService = options?.service ? normalizeServiceCode(options.service) : null;
  const targetNiche = options?.niche ? normalizeNicheCode(options.niche) : null;
  const targetLocStr = options?.location || options?.city || options?.governorate || null;
  const targetLoc = targetLocStr ? resolveLocationHierarchy(targetLocStr) : null;
  const targetLeadTypeRaw = options?.leadType ? options.leadType.trim().toUpperCase() : null;
  const targetProjectLeadType = options?.leadType
    ? normalizeProjectLeadType(options.leadType)
    : null;
  const targetFreshness = options?.freshness ? options.freshness.trim().toUpperCase() : null;

  const filteredEligible = ranked.eligibleLeads.filter((item) => {
    if (item.match.matchStrength < minStrength) return false;

    if (
      typeof options?.minQualityScore === 'number' &&
      item.match.qualityScore < options.minQualityScore
    ) {
      return false;
    }

    if (
      typeof options?.minOpportunityScore === 'number' &&
      item.match.opportunityScore < options.minOpportunityScore
    ) {
      return false;
    }

    if (
      typeof options?.maxOpportunityScore === 'number' &&
      item.match.opportunityScore > options.maxOpportunityScore
    ) {
      return false;
    }

    if (targetService) {
      const resolvedServices = resolveLeadRequiredServices(item.lead);
      if (!resolvedServices.allRequired.includes(targetService)) {
        return false;
      }
    }

    if (targetNiche) {
      const leadNiche = normalizeNicheCode(item.lead.category);
      if (leadNiche !== targetNiche) {
        return false;
      }
    }

    if (targetLoc) {
      const leadCityLoc = resolveLocationHierarchy(item.lead.city);
      const leadGovLoc = resolveLocationHierarchy(item.lead.governorate);
      const leadAreaLoc = resolveLocationHierarchy(item.lead.area || item.lead.district);
      const leadCanonicalAr = leadCityLoc?.canonicalAr || item.lead.city;
      const leadGovAr =
        leadGovLoc?.governorateAr || leadCityLoc?.governorateAr || item.lead.governorate;
      const leadAreaAr = leadAreaLoc?.canonicalAr || item.lead.area || item.lead.district || '';

      if (targetLoc.isDistrictName) {
        if (leadAreaAr !== targetLoc.canonicalAr && leadCanonicalAr !== targetLoc.canonicalAr) {
          return false;
        }
      } else if (targetLoc.isCityName && !targetLoc.isGovernorateName) {
        if (leadCanonicalAr !== targetLoc.canonicalAr) return false;
      } else {
        if (leadGovAr !== targetLoc.governorateAr && leadCanonicalAr !== targetLoc.canonicalAr) {
          return false;
        }
      }
    }

    if (targetLeadTypeRaw) {
      if (targetLeadTypeRaw === 'EXCLUSIVE' || targetLeadTypeRaw === 'SHARED') {
        const ownership =
          item.lead.exclusive || String(item.lead.leadType || '').toUpperCase() === 'EXCLUSIVE'
            ? 'EXCLUSIVE'
            : 'SHARED';
        if (ownership !== targetLeadTypeRaw) return false;
      } else if (targetProjectLeadType) {
        const projType = resolveLeadProjectType(item.lead);
        if (projType !== targetProjectLeadType) return false;
      }
    }

    if (targetFreshness) {
      const itemFresh = String(item.match.freshness || '').toUpperCase();
      if (targetFreshness === 'RECENT' || targetFreshness === 'AGING' || targetFreshness === 'RECENTLY_VERIFIED') {
        if (itemFresh !== 'RECENT' && itemFresh !== 'AGING' && itemFresh !== 'RECENTLY_VERIFIED') {
          return false;
        }
      } else if (itemFresh !== targetFreshness) {
        return false;
      }
    }

    return true;
  });

  filteredEligible.forEach((item, idx) => {
    item.match.rank = idx + 1;
  });

  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, Math.min(200, options?.limit ?? 50));
  const paginatedEligible = filteredEligible.slice(offset, offset + limit);

  if (options?.persistSnapshots) {
    for (const item of paginatedEligible) {
      await persistMatchSnapshot(item.match);
    }
  }

  return {
    developer: {
      id: devUser.id,
      name: devUser.name,
      email: devUser.email,
      status: devUser.status,
      hasProfile: Boolean(devUser.developerProfile),
    },
    matchVersion: ranked.matchVersion,
    totalEligible: filteredEligible.length,
    matches: paginatedEligible.map((item) => {
      const { claimedDeveloperIds: _omit, ...publicLead } = item.lead;
      return {
        lead: publicLead,
        match: item.match,
      };
    }),
    rejectedMatches: options?.includeRejected
      ? ranked.rejectedLeads.map((item) => {
          const { claimedDeveloperIds: _omit, ...publicLead } = item.lead;
          return {
            lead: publicLead,
            match: item.match,
          };
        })
      : undefined,
    diagnostics: ranked.diagnostics,
  };
}

export async function getPairMatchExplanationFromDb(
  leadId: string,
  developerId: string
): Promise<AdminMatchDebugReport | null> {
  const [leadRecord, devUser] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        claims: {
          where: { status: 'ACTIVE', accessGranted: true },
          select: { userId: true, status: true, accessGranted: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: developerId },
      include: {
        developerProfile: true,
        subscription: {
          include: { plan: true },
        },
        _count: {
          select: {
            claims: {
              where: {
                status: 'ACTIVE',
                pipelineStatus: { in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'] },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!leadRecord || !devUser) {
    return null;
  }

  const { config, rules } = await getActiveMatchingConfigAndRules();
  const matchableLead = mapDbLeadToMatchable(leadRecord as unknown as Record<string, unknown>);
  const devContext = mapDbDeveloperToContext(
    devUser as unknown as Parameters<typeof mapDbDeveloperToContext>[0]
  );

  return generateAdminMatchDebugReport(matchableLead, devContext, {
    config,
    rules,
    matchVersion: config.currentVersion,
    calculatedAt: new Date().toISOString(),
  });
}

export interface RecalculateMatchesInput {
  leadId?: string;
  developerId?: string;
  batchLimit?: number;
}

export interface RecalculateMatchesSummary {
  recalculatedPairs: number;
  eligiblePairs: number;
  rejectedPairs: number;
  leadsProcessed: number;
  developersProcessed: number;
  matchVersion: string;
  durationMs: number;
}

/**
 * Safe bounded recalculation of MatchSnapshots for a single lead, a single developer, or a bounded batch.
 */
export async function recalculateMatchesInDb(
  input: RecalculateMatchesInput
): Promise<RecalculateMatchesSummary> {
  const startMs = Date.now();
  const { config, rules } = await getActiveMatchingConfigAndRules();
  const batchLimit = Math.max(1, Math.min(100, input.batchLimit ?? 50));

  const leadsWhere: Prisma.LeadWhereInput = input.leadId
    ? { id: input.leadId }
    : { isCanonical: true };
  const devsWhere: Prisma.UserWhereInput = input.developerId
    ? { id: input.developerId }
    : { role: 'DEVELOPER' };

  const [leads, developers] = await Promise.all([
    prisma.lead.findMany({
      where: leadsWhere,
      include: {
        claims: {
          where: { status: 'ACTIVE', accessGranted: true },
          select: { userId: true, status: true, accessGranted: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: input.leadId ? 1 : batchLimit,
    }),
    prisma.user.findMany({
      where: devsWhere,
      include: {
        developerProfile: true,
        subscription: {
          include: { plan: true },
        },
        _count: {
          select: {
            claims: {
              where: {
                status: 'ACTIVE',
                pipelineStatus: { in: ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'MEETING'] },
              },
            },
          },
        },
      },
      take: input.developerId ? 1 : batchLimit,
    }),
  ]);

  const matchableLeads = leads.map((l) =>
    mapDbLeadToMatchable(l as unknown as Record<string, unknown>)
  );
  const devContexts = developers.map((d) =>
    mapDbDeveloperToContext(d as unknown as Parameters<typeof mapDbDeveloperToContext>[0])
  );

  let recalculatedPairs = 0;
  let eligiblePairs = 0;
  let rejectedPairs = 0;
  const nowIso = new Date().toISOString();

  for (const lead of matchableLeads) {
    const ranked = rankDevelopersForLead(lead, devContexts, {
      config,
      rules,
      matchVersion: config.currentVersion,
      calculatedAt: nowIso,
    });

    for (const res of ranked.allResults) {
      recalculatedPairs++;
      if (res.eligible) eligiblePairs++;
      else rejectedPairs++;
      await persistMatchSnapshot(res);
    }
  }

  const durationMs = Date.now() - startMs;

  logMatchingEvent({
    eventType: 'MATCH_RECALCULATED',
    leadId: input.leadId || 'batch',
    developerId: input.developerId || null,
    eligible: eligiblePairs > 0,
    matchStrength: 0,
    hardFailureCount: rejectedPairs,
    matchVersion: config.currentVersion,
    durationMs,
    details: {
      recalculatedPairs,
      eligiblePairs,
      rejectedPairs,
      leadsProcessed: matchableLeads.length,
      developersProcessed: devContexts.length,
    },
  });

  return {
    recalculatedPairs,
    eligiblePairs,
    rejectedPairs,
    leadsProcessed: matchableLeads.length,
    developersProcessed: devContexts.length,
    matchVersion: config.currentVersion,
    durationMs,
  };
}

/**
 * Invalidates and recalculates snapshots when a lead's attributes or verification/quality change.
 */
export async function invalidateAndRecalculateLeadMatches(leadId: string): Promise<void> {
  try {
    await prisma.matchSnapshot.updateMany({
      where: { leadId },
      data: { isStale: true },
    });
    await recalculateMatchesInDb({ leadId, batchLimit: 50 });
  } catch {
    // Non-blocking
  }
}

/**
 * Invalidates and recalculates snapshots when a developer's profile or preferences change.
 */
export async function invalidateAndRecalculateDeveloperMatches(
  developerId: string
): Promise<void> {
  try {
    await prisma.matchSnapshot.updateMany({
      where: { developerId },
      data: { isStale: true },
    });
    await recalculateMatchesInDb({ developerId, batchLimit: 50 });
  } catch {
    // Non-blocking
  }
}

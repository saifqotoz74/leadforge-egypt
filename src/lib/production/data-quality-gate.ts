/**
 * PHASE 10 — PRODUCTION DATA QUALITY GATE (SECTION 41)
 *
 * Non-destructive, read-only audit of all 14 data quality dimensions required
 * before production launch. Never silently modifies or deletes questionable data.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { runDataIntegrityChecks } from '../observability/integrity';

export interface DataQualityCheckFinding {
  checkKey:
    | 'DUPLICATE_BUSINESSES'
    | 'INVALID_PHONES'
    | 'INVALID_EMAILS'
    | 'MALFORMED_WEBSITES'
    | 'MISSING_CITIES'
    | 'MISSING_SOURCE_PROVENANCE'
    | 'STALE_LEADS_MARKED_SALEABLE'
    | 'INVALID_STATUSES'
    | 'ORPHANED_RECORDS'
    | 'IMPOSSIBLE_SCORES'
    | 'IMPOSSIBLE_QUALITY_STATES'
    | 'BROKEN_RELATIONSHIPS'
    | 'INCONSISTENT_CLAIMS'
    | 'CREDIT_LEDGER_INCONSISTENCIES';
  passed: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  issueCount: number;
  sampleLeadOrEntityIds: string[];
  details: string;
}

export interface ProductionDataQualityGateReport {
  gatePassed: boolean;
  auditedAt: string;
  totalLeadsAudited: number;
  criticalViolations: number;
  warningCount: number;
  checks: DataQualityCheckFinding[];
}

const VALID_EGYPT_PHONE_REGEX = /^(\+20|0)(1[0125]\d{8}|[2-9]\d{7,8})$/;
const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function runProductionDataQualityGate(
  db: PrismaClient = defaultPrisma
): Promise<ProductionDataQualityGateReport> {
  const leads = await db.lead.findMany({
    include: {
      claims: { select: { id: true, status: true, accessType: true, userId: true } },
      sourceRecords: { select: { id: true } },
    },
  });

  const checks: DataQualityCheckFinding[] = [];

  // 1. Duplicate canonical businesses (same normalizedPhone or normalizedDomain among canonical leads)
  const phoneMap = new Map<string, string[]>();
  const domainMap = new Map<string, string[]>();
  for (const lead of leads) {
    if (!lead.isCanonical || lead.status === 'DUPLICATE') continue;
    if (lead.normalizedPhone) {
      const list = phoneMap.get(lead.normalizedPhone) || [];
      list.push(lead.id);
      phoneMap.set(lead.normalizedPhone, list);
    }
    if (lead.normalizedDomain) {
      const list = domainMap.get(lead.normalizedDomain) || [];
      list.push(lead.id);
      domainMap.set(lead.normalizedDomain, list);
    }
  }
  const duplicateCanonicalIds = new Set<string>();
  for (const ids of phoneMap.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicateCanonicalIds.add(id));
  }
  for (const ids of domainMap.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicateCanonicalIds.add(id));
  }
  checks.push({
    checkKey: 'DUPLICATE_BUSINESSES',
    passed: duplicateCanonicalIds.size === 0,
    severity: 'WARNING',
    issueCount: duplicateCanonicalIds.size,
    sampleLeadOrEntityIds: Array.from(duplicateCanonicalIds).slice(0, 10),
    details:
      duplicateCanonicalIds.size === 0
        ? 'No unresolved duplicate canonical businesses sharing normalized phone or domain.'
        : `Found ${duplicateCanonicalIds.size} canonical lead(s) sharing a normalized phone or domain.`,
  });

  // 2. Invalid phones on saleable/available leads
  const invalidPhoneIds: string[] = [];
  for (const lead of leads) {
    if (lead.status === 'AVAILABLE' && lead.phone) {
      const compact = lead.phone.replace(/[\s\-()]/g, '');
      if (!VALID_EGYPT_PHONE_REGEX.test(compact)) {
        invalidPhoneIds.push(lead.id);
      }
    }
  }
  checks.push({
    checkKey: 'INVALID_PHONES',
    passed: invalidPhoneIds.length === 0,
    severity: 'WARNING',
    issueCount: invalidPhoneIds.length,
    sampleLeadOrEntityIds: invalidPhoneIds.slice(0, 10),
    details:
      invalidPhoneIds.length === 0
        ? 'All available leads with phones match valid Egyptian phone formatting.'
        : `Found ${invalidPhoneIds.length} available lead(s) with malformed phone numbers.`,
  });

  // 3. Invalid emails
  const invalidEmailIds: string[] = [];
  for (const lead of leads) {
    if (lead.email && !VALID_EMAIL_REGEX.test(lead.email.trim())) {
      invalidEmailIds.push(lead.id);
    }
  }
  checks.push({
    checkKey: 'INVALID_EMAILS',
    passed: invalidEmailIds.length === 0,
    severity: 'WARNING',
    issueCount: invalidEmailIds.length,
    sampleLeadOrEntityIds: invalidEmailIds.slice(0, 10),
    details:
      invalidEmailIds.length === 0
        ? 'All populated lead email addresses are syntactically valid.'
        : `Found ${invalidEmailIds.length} lead(s) with invalid email syntax.`,
  });

  // 4. Malformed websites
  const malformedWebsiteIds: string[] = [];
  for (const lead of leads) {
    if (lead.website && lead.website.trim() !== '') {
      const raw = lead.website.trim();
      const candidate = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      try {
        const parsed = new URL(candidate);
        if (!parsed.hostname.includes('.')) {
          malformedWebsiteIds.push(lead.id);
        }
      } catch {
        malformedWebsiteIds.push(lead.id);
      }
    }
  }
  checks.push({
    checkKey: 'MALFORMED_WEBSITES',
    passed: malformedWebsiteIds.length === 0,
    severity: 'WARNING',
    issueCount: malformedWebsiteIds.length,
    sampleLeadOrEntityIds: malformedWebsiteIds.slice(0, 10),
    details:
      malformedWebsiteIds.length === 0
        ? 'All populated lead website URLs are valid.'
        : `Found ${malformedWebsiteIds.length} lead(s) with malformed website URLs.`,
  });

  // 5. Missing cities
  const missingCityIds = leads
    .filter((l) => !l.city || l.city.trim() === '' || l.city.trim().toLowerCase() === 'unknown')
    .map((l) => l.id);
  checks.push({
    checkKey: 'MISSING_CITIES',
    passed: missingCityIds.length === 0,
    severity: 'WARNING',
    issueCount: missingCityIds.length,
    sampleLeadOrEntityIds: missingCityIds.slice(0, 10),
    details:
      missingCityIds.length === 0
        ? 'All leads have populated city values.'
        : `Found ${missingCityIds.length} lead(s) missing a valid city.`,
  });

  // 6. Missing source provenance
  const missingProvenanceIds = leads
    .filter((l) => (!l.source || l.source.trim() === '') && (!l.sourceList || l.sourceList.length === 0))
    .map((l) => l.id);
  checks.push({
    checkKey: 'MISSING_SOURCE_PROVENANCE',
    passed: missingProvenanceIds.length === 0,
    severity: 'CRITICAL',
    issueCount: missingProvenanceIds.length,
    sampleLeadOrEntityIds: missingProvenanceIds.slice(0, 10),
    details:
      missingProvenanceIds.length === 0
        ? 'Every lead has recorded source provenance.'
        : `Found ${missingProvenanceIds.length} lead(s) with missing source provenance.`,
  });

  // 7. Stale leads marked AVAILABLE/saleable
  const staleButAvailableIds = leads
    .filter(
      (l) =>
        (l.freshnessStatus === 'STALE' || l.freshnessStatus === 'VERY_STALE') &&
        l.status === 'AVAILABLE' &&
        l.availableForClaim
    )
    .map((l) => l.id);
  checks.push({
    checkKey: 'STALE_LEADS_MARKED_SALEABLE',
    passed: staleButAvailableIds.length === 0,
    severity: 'CRITICAL',
    issueCount: staleButAvailableIds.length,
    sampleLeadOrEntityIds: staleButAvailableIds.slice(0, 10),
    details:
      staleButAvailableIds.length === 0
        ? 'No stale or very-stale leads are marked available for claim.'
        : `Found ${staleButAvailableIds.length} stale lead(s) improperly marked available for claim.`,
  });

  // 8. Invalid statuses (closed business or failed verification still marked AVAILABLE)
  const invalidStatusIds = leads
    .filter(
      (l) =>
        l.status === 'AVAILABLE' &&
        l.availableForClaim &&
        (l.businessStatus === 'CLOSED' || l.verificationStatus === 'FAILED_VERIFICATION' || !l.isCanonical)
    )
    .map((l) => l.id);
  checks.push({
    checkKey: 'INVALID_STATUSES',
    passed: invalidStatusIds.length === 0,
    severity: 'CRITICAL',
    issueCount: invalidStatusIds.length,
    sampleLeadOrEntityIds: invalidStatusIds.slice(0, 10),
    details:
      invalidStatusIds.length === 0
        ? 'No closed, non-canonical, or failed-verification leads are marked AVAILABLE.'
        : `Found ${invalidStatusIds.length} lead(s) with conflicting availability and operational/verification statuses.`,
  });

  // 9. Impossible scores (< 0 or > 100)
  const impossibleScoreIds = leads
    .filter((l) => l.score < 0 || l.score > 100 || l.qualityScore < 0 || l.qualityScore > 100)
    .map((l) => l.id);
  checks.push({
    checkKey: 'IMPOSSIBLE_SCORES',
    passed: impossibleScoreIds.length === 0,
    severity: 'CRITICAL',
    issueCount: impossibleScoreIds.length,
    sampleLeadOrEntityIds: impossibleScoreIds.slice(0, 10),
    details:
      impossibleScoreIds.length === 0
        ? 'All lead opportunity and quality scores are within [0, 100].'
        : `Found ${impossibleScoreIds.length} lead(s) with out-of-range scores.`,
  });

  // 10. Impossible quality states (e.g. EXCELLENT qualityStatus with qualityScore < 50)
  const impossibleQualityIds = leads
    .filter(
      (l) =>
        (l.qualityStatus === 'EXCELLENT' && l.qualityScore < 70) ||
        (l.qualityStatus === 'VERY_LOW' && l.qualityScore > 50)
    )
    .map((l) => l.id);
  checks.push({
    checkKey: 'IMPOSSIBLE_QUALITY_STATES',
    passed: impossibleQualityIds.length === 0,
    severity: 'CRITICAL',
    issueCount: impossibleQualityIds.length,
    sampleLeadOrEntityIds: impossibleQualityIds.slice(0, 10),
    details:
      impossibleQualityIds.length === 0
        ? 'All lead quality status classifications align with numeric quality scores.'
        : `Found ${impossibleQualityIds.length} lead(s) with contradictory qualityStatus and qualityScore.`,
  });

  // 11. Broken relationships (merged lead pointing to non-existent target lead)
  const leadIdSet = new Set(leads.map((l) => l.id));
  const brokenMergeIds = leads
    .filter((l) => l.mergedIntoLeadId && !leadIdSet.has(l.mergedIntoLeadId))
    .map((l) => l.id);
  checks.push({
    checkKey: 'BROKEN_RELATIONSHIPS',
    passed: brokenMergeIds.length === 0,
    severity: 'CRITICAL',
    issueCount: brokenMergeIds.length,
    sampleLeadOrEntityIds: brokenMergeIds.slice(0, 10),
    details:
      brokenMergeIds.length === 0
        ? 'All canonical merge pointers reference valid canonical leads.'
        : `Found ${brokenMergeIds.length} lead(s) referencing non-existent mergedIntoLeadId targets.`,
  });

  // 12, 13, 14: Run core financial & claim integrity checks
  const integrity = await runDataIntegrityChecks(db);
  const claimCheckCategories = [
    integrity.checks.orphanedClaims,
    integrity.checks.exclusiveLeadMultipleOwners,
    integrity.checks.crossTenantEngagements,
    integrity.checks.impossibleLifecycleStates,
  ];
  const inconsistentClaimViolations = claimCheckCategories.reduce(
    (acc, c) => acc + c.violationCount,
    0
  );
  const claimSampleIds = claimCheckCategories
    .flatMap((c) => c.violations.map((v) => v.entityId))
    .slice(0, 10);

  checks.push({
    checkKey: 'INCONSISTENT_CLAIMS',
    passed: inconsistentClaimViolations === 0,
    severity: 'CRITICAL',
    issueCount: inconsistentClaimViolations,
    sampleLeadOrEntityIds: claimSampleIds,
    details:
      inconsistentClaimViolations === 0
        ? 'All shared and exclusive lead claims respect capacity and lifecycle invariants.'
        : `Found ${inconsistentClaimViolations} claim/engagement invariant violation(s).`,
  });

  const ledgerViolations = integrity.checks.creditLedgerInvariants.violationCount;
  const ledgerSampleIds = integrity.checks.creditLedgerInvariants.violations
    .map((v) => v.entityId)
    .slice(0, 10);

  checks.push({
    checkKey: 'CREDIT_LEDGER_INCONSISTENCIES',
    passed: ledgerViolations === 0,
    severity: 'CRITICAL',
    issueCount: ledgerViolations,
    sampleLeadOrEntityIds: ledgerSampleIds,
    details:
      ledgerViolations === 0
        ? 'All developer credit accounts reconcile with immutable CreditTransaction ledger entries and have non-negative balances.'
        : `Found ${ledgerViolations} credit ledger or refund invariant violation(s).`,
  });

  // Orphaned records check
  const orphanedSourceRecords = await db.sourceRecord.count({
    where: {
      status: 'ACTIVE',
      leadId: null,
    },
  });
  checks.push({
    checkKey: 'ORPHANED_RECORDS',
    passed: orphanedSourceRecords === 0,
    severity: 'WARNING',
    issueCount: orphanedSourceRecords,
    sampleLeadOrEntityIds: [],
    details:
      orphanedSourceRecords === 0
        ? 'No active source records are orphaned without a canonical lead.'
        : `Found ${orphanedSourceRecords} active source record(s) without a linked leadId.`,
  });

  const criticalViolations = checks
    .filter((c) => !c.passed && c.severity === 'CRITICAL')
    .reduce((acc, c) => acc + c.issueCount, 0);
  const warningCount = checks
    .filter((c) => !c.passed && c.severity === 'WARNING')
    .reduce((acc, c) => acc + c.issueCount, 0);

  return {
    gatePassed: criticalViolations === 0,
    auditedAt: new Date().toISOString(),
    totalLeadsAudited: leads.length,
    criticalViolations,
    warningCount,
    checks,
  };
}

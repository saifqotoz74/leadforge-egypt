import { PrismaClient } from '@prisma/client';
import { ensureDbReady, prisma as defaultPrisma } from '@/lib/db';

export interface IntegrityCheckViolation {
  entityType: string;
  entityId: string;
  reason: string;
  details?: Record<string, unknown>;
}

export interface IntegrityCheckCategoryResult {
  passed: boolean;
  violationCount: number;
  violations: IntegrityCheckViolation[];
}

export interface DataIntegrityReport {
  healthy: boolean;
  checkedAt: string;
  durationMs: number;
  totalViolations: number;
  checks: {
    orphanedSourceRecords: IntegrityCheckCategoryResult;
    orphanedClaims: IntegrityCheckCategoryResult;
    exclusiveLeadMultipleOwners: IntegrityCheckCategoryResult;
    creditLedgerInvariants: IntegrityCheckCategoryResult;
    crossTenantEngagements: IntegrityCheckCategoryResult;
    impossibleLifecycleStates: IntegrityCheckCategoryResult;
    orphanedCriticalRecords: IntegrityCheckCategoryResult;
  };
}

/**
 * Runs deterministic Data Integrity Checks across all critical LeadForge domain tables (Section 38):
 * 1. No SourceRecord references a missing Lead or missing LeadSource
 * 2. No LeadClaim references a missing Lead or missing User
 * 3. No active Exclusive Lead has multiple active owners or mismatched exclusiveClaimedById
 * 4. No DeveloperCreditAccount balance violates ledger invariants (balance >= 0, balance == sum(transactions))
 * 5. No LeadEngagement or ContactAttempt belongs to another developer's claim
 * 6. No impossible lifecycle state transitions exist
 * 7. No orphaned critical records (LeadScore, LeadVerification, MatchSnapshot) exist
 */
export async function runDataIntegrityChecks(
  customPrisma?: PrismaClient
): Promise<DataIntegrityReport> {
  const startMs = Date.now();
  const db = customPrisma || defaultPrisma;
  if (!customPrisma) {
    await ensureDbReady();
  }

  const [
    users,
    leads,
    sources,
    sourceRecords,
    claims,
    creditAccounts,
    creditTransactions,
    engagements,
    contactAttempts,
    leadScores,
    leadVerifications,
    matchSnapshots,
  ] = await Promise.all([
    db.user.findMany({ select: { id: true, role: true } }),
    db.lead.findMany({
      select: {
        id: true,
        leadType: true,
        accessType: true,
        status: true,
        saleabilityStatus: true,
        availableForClaim: true,
        currentPurchasers: true,
        maxPurchasers: true,
        exclusiveClaimedById: true,
        isCanonical: true,
      },
    }),
    db.leadSource.findMany({ select: { id: true, name: true } }),
    db.sourceRecord.findMany({
      select: { id: true, leadId: true, sourceId: true, sourceName: true },
    }),
    db.leadClaim.findMany({
      select: {
        id: true,
        leadId: true,
        userId: true,
        developerId: true,
        status: true,
        accessType: true,
        creditsCharged: true,
        creditsRefunded: true,
      },
    }),
    db.developerCreditAccount.findMany({
      select: {
        id: true,
        developerId: true,
        balance: true,
        reservedBalance: true,
        lifetimePurchased: true,
        lifetimeBonus: true,
        lifetimeSpent: true,
        lifetimeRefunded: true,
      },
    }),
    db.creditTransaction.findMany({
      select: {
        id: true,
        accountId: true,
        developerId: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        type: true,
      },
    }),
    db.leadEngagement.findMany({
      select: {
        id: true,
        leadId: true,
        developerId: true,
        claimId: true,
        currentStatus: true,
        isTerminal: true,
        finalOutcome: true,
      },
    }),
    db.contactAttempt.findMany({
      select: {
        id: true,
        engagementId: true,
        leadId: true,
        developerId: true,
        claimId: true,
      },
    }),
    db.leadScore.findMany({ select: { id: true, leadId: true } }),
    db.leadVerification.findMany({ select: { id: true, leadId: true } }),
    db.matchSnapshot.findMany({
      select: { id: true, leadId: true, developerId: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const engagementById = new Map(engagements.map((e) => [e.id, e]));

  // 1. Orphaned Source Records
  const orphanedSourceViolations: IntegrityCheckViolation[] = [];
  for (const sr of sourceRecords) {
    if (sr.leadId && !leadById.has(sr.leadId)) {
      orphanedSourceViolations.push({
        entityType: 'SourceRecord',
        entityId: sr.id,
        reason: `SourceRecord references non-existent Lead "${sr.leadId}"`,
        details: { leadId: sr.leadId, sourceName: sr.sourceName },
      });
    }
    if (sr.sourceId && !sourceById.has(sr.sourceId)) {
      orphanedSourceViolations.push({
        entityType: 'SourceRecord',
        entityId: sr.id,
        reason: `SourceRecord references non-existent LeadSource "${sr.sourceId}"`,
        details: { sourceId: sr.sourceId, sourceName: sr.sourceName },
      });
    }
  }

  // 2. Orphaned Claims
  const orphanedClaimViolations: IntegrityCheckViolation[] = [];
  for (const c of claims) {
    if (!leadById.has(c.leadId)) {
      orphanedClaimViolations.push({
        entityType: 'LeadClaim',
        entityId: c.id,
        reason: `LeadClaim references non-existent Lead "${c.leadId}"`,
        details: { leadId: c.leadId, userId: c.userId },
      });
    }
    const ownerId = c.developerId || c.userId;
    if (!userById.has(ownerId)) {
      orphanedClaimViolations.push({
        entityType: 'LeadClaim',
        entityId: c.id,
        reason: `LeadClaim references non-existent User "${ownerId}"`,
        details: { leadId: c.leadId, userId: ownerId },
      });
    }
  }

  // 3. Exclusive Lead Multiple Active Owners
  const exclusiveViolations: IntegrityCheckViolation[] = [];
  const activeClaimsByLead = new Map<string, typeof claims>();
  for (const c of claims) {
    if (c.status === 'ACTIVE') {
      const list = activeClaimsByLead.get(c.leadId) || [];
      list.push(c);
      activeClaimsByLead.set(c.leadId, list);
    }
  }

  for (const lead of leads) {
    const activeForLead = activeClaimsByLead.get(lead.id) || [];
    const hasExclusiveActiveClaim = activeForLead.some((c) => c.accessType === 'EXCLUSIVE');
    const isExclusiveLead =
      lead.accessType === 'EXCLUSIVE' ||
      lead.leadType === 'EXCLUSIVE' ||
      hasExclusiveActiveClaim;

    if (isExclusiveLead && activeForLead.length > 1) {
      exclusiveViolations.push({
        entityType: 'Lead',
        entityId: lead.id,
        reason: `Exclusive lead has ${activeForLead.length} simultaneous ACTIVE claims`,
        details: {
          activeClaimIds: activeForLead.map((c) => c.id),
          developerIds: activeForLead.map((c) => c.developerId || c.userId),
        },
      });
    }

    if (
      hasExclusiveActiveClaim &&
      lead.exclusiveClaimedById &&
      activeForLead[0] &&
      lead.exclusiveClaimedById !== (activeForLead[0].developerId || activeForLead[0].userId)
    ) {
      exclusiveViolations.push({
        entityType: 'Lead',
        entityId: lead.id,
        reason: `Lead.exclusiveClaimedById (${lead.exclusiveClaimedById}) does not match active exclusive claim owner`,
        details: {
          exclusiveClaimedById: lead.exclusiveClaimedById,
          claimOwnerId: activeForLead[0].developerId || activeForLead[0].userId,
        },
      });
    }
  }

  // 4. Credit Ledger Invariants
  const creditViolations: IntegrityCheckViolation[] = [];
  const txSumByAccount = new Map<string, number>();
  for (const tx of creditTransactions) {
    txSumByAccount.set(tx.accountId, (txSumByAccount.get(tx.accountId) || 0) + tx.amount);
    if (tx.balanceBefore < 0 || tx.balanceAfter < 0) {
      creditViolations.push({
        entityType: 'CreditTransaction',
        entityId: tx.id,
        reason: `CreditTransaction has negative balanceBefore (${tx.balanceBefore}) or balanceAfter (${tx.balanceAfter})`,
      });
    }
    if (tx.balanceBefore + tx.amount !== tx.balanceAfter) {
      creditViolations.push({
        entityType: 'CreditTransaction',
        entityId: tx.id,
        reason: `CreditTransaction math mismatch: ${tx.balanceBefore} + (${tx.amount}) !== ${tx.balanceAfter}`,
      });
    }
  }

  for (const acc of creditAccounts) {
    if (acc.balance < 0 || acc.reservedBalance < 0) {
      creditViolations.push({
        entityType: 'DeveloperCreditAccount',
        entityId: acc.id,
        reason: `DeveloperCreditAccount has negative balance (${acc.balance}) or reservedBalance (${acc.reservedBalance})`,
        details: { developerId: acc.developerId, balance: acc.balance },
      });
    }
    const ledgerSum = txSumByAccount.get(acc.id) ?? 0;
    if (txSumByAccount.has(acc.id) && acc.balance !== ledgerSum) {
      creditViolations.push({
        entityType: 'DeveloperCreditAccount',
        entityId: acc.id,
        reason: `DeveloperCreditAccount balance (${acc.balance}) diverges from ledger sum (${ledgerSum})`,
        details: {
          developerId: acc.developerId,
          accountBalance: acc.balance,
          ledgerSum,
          discrepancy: acc.balance - ledgerSum,
        },
      });
    }
  }

  // 5. Cross-Tenant Engagement / ContactAttempt Ownership
  const crossTenantViolations: IntegrityCheckViolation[] = [];
  for (const eng of engagements) {
    const claim = claimById.get(eng.claimId);
    if (!claim) {
      crossTenantViolations.push({
        entityType: 'LeadEngagement',
        entityId: eng.id,
        reason: `LeadEngagement references missing LeadClaim "${eng.claimId}"`,
      });
      continue;
    }
    const claimOwner = claim.developerId || claim.userId;
    if (eng.developerId !== claimOwner) {
      crossTenantViolations.push({
        entityType: 'LeadEngagement',
        entityId: eng.id,
        reason: `LeadEngagement developerId (${eng.developerId}) does not match LeadClaim owner (${claimOwner})`,
        details: {
          engagementDeveloperId: eng.developerId,
          claimOwnerId: claimOwner,
          claimId: claim.id,
        },
      });
    }
    if (eng.leadId !== claim.leadId) {
      crossTenantViolations.push({
        entityType: 'LeadEngagement',
        entityId: eng.id,
        reason: `LeadEngagement leadId (${eng.leadId}) does not match LeadClaim leadId (${claim.leadId})`,
      });
    }
  }

  for (const ca of contactAttempts) {
    const eng = engagementById.get(ca.engagementId);
    if (!eng) {
      crossTenantViolations.push({
        entityType: 'ContactAttempt',
        entityId: ca.id,
        reason: `ContactAttempt references missing LeadEngagement "${ca.engagementId}"`,
      });
      continue;
    }
    if (ca.developerId !== eng.developerId || ca.claimId !== eng.claimId) {
      crossTenantViolations.push({
        entityType: 'ContactAttempt',
        entityId: ca.id,
        reason: `ContactAttempt tenant ownership mismatch with parent LeadEngagement`,
        details: {
          attemptDeveloperId: ca.developerId,
          engagementDeveloperId: eng.developerId,
        },
      });
    }
  }

  // 6. Impossible Lifecycle States
  const lifecycleViolations: IntegrityCheckViolation[] = [];
  const TERMINAL_STATUSES = new Set(['WON', 'LOST', 'NOT_INTERESTED', 'INVALID']);
  for (const lead of leads) {
    if (
      lead.currentPurchasers < 0 ||
      lead.maxPurchasers < 1 ||
      lead.currentPurchasers > lead.maxPurchasers
    ) {
      lifecycleViolations.push({
        entityType: 'Lead',
        entityId: lead.id,
        reason: `Lead has invalid purchaser count (${lead.currentPurchasers}/${lead.maxPurchasers})`,
      });
    }
  }

  for (const c of claims) {
    if (c.creditsCharged < 0 || c.creditsRefunded < 0 || c.creditsRefunded > c.creditsCharged) {
      lifecycleViolations.push({
        entityType: 'LeadClaim',
        entityId: c.id,
        reason: `LeadClaim has invalid credit amounts (charged=${c.creditsCharged}, refunded=${c.creditsRefunded})`,
      });
    }
  }

  for (const eng of engagements) {
    const isStatusTerminal = TERMINAL_STATUSES.has(eng.currentStatus);
    if (eng.isTerminal && !isStatusTerminal) {
      lifecycleViolations.push({
        entityType: 'LeadEngagement',
        entityId: eng.id,
        reason: `LeadEngagement marked isTerminal=true while in non-terminal status "${eng.currentStatus}"`,
      });
    }
  }

  // 7. Orphaned Critical Records (LeadScore, LeadVerification, MatchSnapshot)
  const orphanedCriticalViolations: IntegrityCheckViolation[] = [];
  for (const ls of leadScores) {
    if (!leadById.has(ls.leadId)) {
      orphanedCriticalViolations.push({
        entityType: 'LeadScore',
        entityId: ls.id,
        reason: `LeadScore references missing Lead "${ls.leadId}"`,
      });
    }
  }
  for (const lv of leadVerifications) {
    if (!leadById.has(lv.leadId)) {
      orphanedCriticalViolations.push({
        entityType: 'LeadVerification',
        entityId: lv.id,
        reason: `LeadVerification references missing Lead "${lv.leadId}"`,
      });
    }
  }
  for (const ms of matchSnapshots) {
    if (!leadById.has(ms.leadId)) {
      orphanedCriticalViolations.push({
        entityType: 'MatchSnapshot',
        entityId: ms.id,
        reason: `MatchSnapshot references missing Lead "${ms.leadId}"`,
      });
    }
  }

  const buildCat = (list: IntegrityCheckViolation[]): IntegrityCheckCategoryResult => ({
    passed: list.length === 0,
    violationCount: list.length,
    violations: list,
  });

  const checks = {
    orphanedSourceRecords: buildCat(orphanedSourceViolations),
    orphanedClaims: buildCat(orphanedClaimViolations),
    exclusiveLeadMultipleOwners: buildCat(exclusiveViolations),
    creditLedgerInvariants: buildCat(creditViolations),
    crossTenantEngagements: buildCat(crossTenantViolations),
    impossibleLifecycleStates: buildCat(lifecycleViolations),
    orphanedCriticalRecords: buildCat(orphanedCriticalViolations),
  };

  const totalViolations = Object.values(checks).reduce(
    (sum, cat) => sum + cat.violationCount,
    0
  );

  return {
    healthy: totalViolations === 0,
    checkedAt: new Date().toISOString(),
    durationMs: Math.max(1, Date.now() - startMs),
    totalViolations,
    checks,
  };
}

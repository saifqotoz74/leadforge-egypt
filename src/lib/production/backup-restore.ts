/**
 * PHASE 10 — BACKUP STRATEGY, STAGING RESTORE VERIFICATION & DISASTER RECOVERY
 *
 * Implements:
 * - Deterministic logical backup snapshot generator with SHA-256 integrity checksum
 * - Staging restore verification into an isolated target database instance
 * - Post-restore row count and invariant verification
 * - Disaster Recovery (RPO / RTO) specification
 */

import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { runDataIntegrityChecks, type DataIntegrityReport } from '../observability/integrity';

export interface LogicalBackupPayload {
  version: 'BACKUP_SCHEMA_V1';
  createdAt: string;
  environment: string;
  tables: {
    plans: unknown[];
    users: unknown[];
    developerProfiles: unknown[];
    subscriptions: unknown[];
    developerCreditAccounts: unknown[];
    creditTransactions: unknown[];
    leadSources: unknown[];
    leads: unknown[];
    sourceRecords: unknown[];
    leadIdentities: unknown[];
    leadClaims: unknown[];
    leadEngagements: unknown[];
    leadFeedbacks: unknown[];
    leadStatusHistories: unknown[];
    contactAttempts: unknown[];
    payments: unknown[];
    auditLogs: unknown[];
    dailyMetricSnapshots: unknown[];
  };
}

export interface LogicalBackupArtifact {
  backupId: string;
  createdAt: string;
  checksumSha256: string;
  rowCounts: Record<keyof LogicalBackupPayload['tables'], number>;
  totalRows: number;
  payload: LogicalBackupPayload;
}

export interface RestoreVerificationReport {
  backupId: string;
  checksumVerified: boolean;
  restoreStart: string;
  restoreCompletion: string;
  durationMs: number;
  result: 'SUCCESS' | 'FAILED';
  productionLiveRestoreStatus: 'NOT_EXECUTED';
  stagingRestoreStatus: 'VERIFIED' | 'FAILED';
  restoredRowCounts: Record<keyof LogicalBackupPayload['tables'], number>;
  rowCountMatch: boolean;
  invariantVerification: DataIntegrityReport;
  errors: string[];
}

export const DISASTER_RECOVERY_TARGETS = {
  rpoMinutes: 15,
  rpoDescription: 'Point-in-time recovery (PITR) WAL archiving up to 15 minutes; daily full logical + physical snapshots retained 30 days.',
  rtoMinutes: 30,
  rtoDescription: 'Target recovery time <= 30 minutes for database promotion/restore and stateless Next.js container redeployment.',
  backupSchedule: {
    dailyLogicalSnapshotCron: '0 2 * * *',
    dailyRetentionDays: 30,
    weeklyRetentionWeeks: 12,
    preMigrationBackupRequired: true,
    encryption: 'AES-256 at rest + TLS 1.3 in transit',
  },
} as const;

export function computeBackupChecksum(payload: LogicalBackupPayload): string {
  const serialized = JSON.stringify(payload.tables);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Generates a complete logical backup snapshot of all critical operational,
 * financial, lead, provenance, feedback, analytics, and audit tables.
 */
export async function createLogicalBackupSnapshot(
  sourceDb: PrismaClient = defaultPrisma,
  environment: string = process.env.NODE_ENV || 'development'
): Promise<LogicalBackupArtifact> {
  const [
    plans,
    users,
    developerProfiles,
    subscriptions,
    developerCreditAccounts,
    creditTransactions,
    leadSources,
    leads,
    sourceRecords,
    leadIdentities,
    leadClaims,
    leadEngagements,
    leadFeedbacks,
    leadStatusHistories,
    contactAttempts,
    payments,
    auditLogs,
    dailyMetricSnapshots,
  ] = await Promise.all([
    sourceDb.plan.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.user.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.developerProfile.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.subscription.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.developerCreditAccount.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.creditTransaction.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    sourceDb.leadSource.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.lead.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.sourceRecord.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.leadIdentity.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.leadClaim.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.leadEngagement.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.leadFeedback.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.leadStatusHistory.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.contactAttempt.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.payment.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
    sourceDb.dailyMetricSnapshot.findMany({ orderBy: { id: 'asc' } }),
  ]);

  const createdAt = new Date().toISOString();
  const payload: LogicalBackupPayload = {
    version: 'BACKUP_SCHEMA_V1',
    createdAt,
    environment,
    tables: {
      plans,
      users,
      developerProfiles,
      subscriptions,
      developerCreditAccounts,
      creditTransactions,
      leadSources,
      leads,
      sourceRecords,
      leadIdentities,
      leadClaims,
      leadEngagements,
      leadFeedbacks,
      leadStatusHistories,
      contactAttempts,
      payments,
      auditLogs,
      dailyMetricSnapshots,
    },
  };

  const checksumSha256 = computeBackupChecksum(payload);
  const rowCounts: Record<keyof LogicalBackupPayload['tables'], number> = {
    plans: plans.length,
    users: users.length,
    developerProfiles: developerProfiles.length,
    subscriptions: subscriptions.length,
    developerCreditAccounts: developerCreditAccounts.length,
    creditTransactions: creditTransactions.length,
    leadSources: leadSources.length,
    leads: leads.length,
    sourceRecords: sourceRecords.length,
    leadIdentities: leadIdentities.length,
    leadClaims: leadClaims.length,
    leadEngagements: leadEngagements.length,
    leadFeedbacks: leadFeedbacks.length,
    leadStatusHistories: leadStatusHistories.length,
    contactAttempts: contactAttempts.length,
    payments: payments.length,
    auditLogs: auditLogs.length,
    dailyMetricSnapshots: dailyMetricSnapshots.length,
  };

  const totalRows = Object.values(rowCounts).reduce((acc, c) => acc + c, 0);

  return {
    backupId: `bkp_${Date.now()}_${checksumSha256.slice(0, 8)}`,
    createdAt,
    checksumSha256,
    rowCounts,
    totalRows,
    payload,
  };
}

/**
 * Restores a logical backup artifact into an isolated target database (e.g., a clean
 * staging/verification database) and verifies both exact row counts and all critical
 * financial/lead/claim invariants.
 *
 * Per Section 8: Marks `productionLiveRestoreStatus: 'NOT_EXECUTED'` so live production
 * restore is never falsely claimed when verifying against a staging/isolated target.
 */
export async function executeStagingRestoreVerification(
  artifact: LogicalBackupArtifact,
  targetDb: PrismaClient
): Promise<RestoreVerificationReport> {
  const startMs = Date.now();
  const restoreStart = new Date(startMs).toISOString();
  const errors: string[] = [];

  const computedChecksum = computeBackupChecksum(artifact.payload);
  const checksumVerified = computedChecksum === artifact.checksumSha256;
  if (!checksumVerified) {
    errors.push(`Backup checksum mismatch: expected ${artifact.checksumSha256}, got ${computedChecksum}`);
  }

  const t = artifact.payload.tables;

  if (checksumVerified) {
    try {
      await targetDb.$transaction(async (tx) => {
        // Clear target DB in reverse dependency order
        await tx.dailyMetricSnapshot.deleteMany();
        await tx.auditLog.deleteMany();
        await tx.payment.deleteMany();
        await tx.contactAttempt.deleteMany();
        await tx.leadStatusHistory.deleteMany();
        await tx.leadFeedback.deleteMany();
        await tx.leadEngagement.deleteMany();
        await tx.creditTransaction.deleteMany();
        await tx.leadClaim.deleteMany();
        await tx.leadIdentity.deleteMany();
        await tx.sourceRecord.deleteMany();
        await tx.lead.deleteMany();
        await tx.leadSource.deleteMany();
        await tx.developerCreditAccount.deleteMany();
        await tx.subscription.deleteMany();
        await tx.developerProfile.deleteMany();
        await tx.user.deleteMany();
        await tx.plan.deleteMany();

        // Restore in foreign-key dependency order
        for (const row of t.plans as any[]) {
          await tx.plan.create({ data: row });
        }
        for (const row of t.users as any[]) {
          await tx.user.create({ data: row });
        }
        for (const row of t.developerProfiles as any[]) {
          await tx.developerProfile.create({ data: row });
        }
        for (const row of t.subscriptions as any[]) {
          await tx.subscription.create({ data: row });
        }
        for (const row of t.developerCreditAccounts as any[]) {
          await tx.developerCreditAccount.create({ data: row });
        }
        for (const row of t.leadSources as any[]) {
          await tx.leadSource.create({ data: row });
        }
        for (const row of t.leads as any[]) {
          await tx.lead.create({ data: row });
        }
        for (const row of t.sourceRecords as any[]) {
          await tx.sourceRecord.create({ data: row });
        }
        for (const row of t.leadIdentities as any[]) {
          await tx.leadIdentity.create({ data: row });
        }
        for (const row of t.leadClaims as any[]) {
          await tx.leadClaim.create({ data: row });
        }
        for (const row of t.creditTransactions as any[]) {
          await tx.creditTransaction.create({ data: row });
        }
        for (const row of t.leadEngagements as any[]) {
          await tx.leadEngagement.create({ data: row });
        }
        for (const row of t.leadFeedbacks as any[]) {
          await tx.leadFeedback.create({ data: row });
        }
        for (const row of t.leadStatusHistories as any[]) {
          await tx.leadStatusHistory.create({ data: row });
        }
        for (const row of t.contactAttempts as any[]) {
          await tx.contactAttempt.create({ data: row });
        }
        for (const row of t.payments as any[]) {
          await tx.payment.create({ data: row });
        }
        for (const row of t.auditLogs as any[]) {
          await tx.auditLog.create({ data: row });
        }
        for (const row of t.dailyMetricSnapshots as any[]) {
          await tx.dailyMetricSnapshot.create({ data: row });
        }
      });
    } catch (err: any) {
      errors.push(`Restore execution error: ${err?.message || String(err)}`);
    }
  }

  const restoredRowCounts: Record<keyof LogicalBackupPayload['tables'], number> = {
    plans: await targetDb.plan.count(),
    users: await targetDb.user.count(),
    developerProfiles: await targetDb.developerProfile.count(),
    subscriptions: await targetDb.subscription.count(),
    developerCreditAccounts: await targetDb.developerCreditAccount.count(),
    creditTransactions: await targetDb.creditTransaction.count(),
    leadSources: await targetDb.leadSource.count(),
    leads: await targetDb.lead.count(),
    sourceRecords: await targetDb.sourceRecord.count(),
    leadIdentities: await targetDb.leadIdentity.count(),
    leadClaims: await targetDb.leadClaim.count(),
    leadEngagements: await targetDb.leadEngagement.count(),
    leadFeedbacks: await targetDb.leadFeedback.count(),
    leadStatusHistories: await targetDb.leadStatusHistory.count(),
    contactAttempts: await targetDb.contactAttempt.count(),
    payments: await targetDb.payment.count(),
    auditLogs: await targetDb.auditLog.count(),
    dailyMetricSnapshots: await targetDb.dailyMetricSnapshot.count(),
  };

  let rowCountMatch = true;
  for (const key of Object.keys(artifact.rowCounts) as Array<keyof LogicalBackupPayload['tables']>) {
    if (artifact.rowCounts[key] !== restoredRowCounts[key]) {
      rowCountMatch = false;
      errors.push(
        `Row count mismatch on table ${key}: expected ${artifact.rowCounts[key]}, restored ${restoredRowCounts[key]}`
      );
    }
  }

  const invariantVerification = await runDataIntegrityChecks(targetDb);
  if (!invariantVerification.healthy) {
    errors.push(`Post-restore invariant violations detected: ${invariantVerification.totalViolations}`);
  }

  const endMs = Date.now();
  const restoreCompletion = new Date(endMs).toISOString();
  const success = checksumVerified && rowCountMatch && invariantVerification.healthy && errors.length === 0;

  return {
    backupId: artifact.backupId,
    checksumVerified,
    restoreStart,
    restoreCompletion,
    durationMs: Math.max(1, endMs - startMs),
    result: success ? 'SUCCESS' : 'FAILED',
    productionLiveRestoreStatus: 'NOT_EXECUTED',
    stagingRestoreStatus: success ? 'VERIFIED' : 'FAILED',
    restoredRowCounts,
    rowCountMatch,
    invariantVerification,
    errors,
  };
}

/**
 * PHASE 10 — DATABASE PRODUCTION READINESS, SAFE MIGRATIONS, SEED SAFETY & RETENTION
 *
 * Implements:
 * - SQL migration safety classifier (Safe vs Dangerous DDL detection)
 * - Production database invariant verification (9 critical invariants)
 * - Seed/Demo data contamination detector & production seed blocker
 * - Explicit data retention policies protecting immutable financial & audit records
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { runDataIntegrityChecks } from '../observability/integrity';

export type MigrationSafetyClass = 'SAFE' | 'DANGEROUS';

export interface MigrationHazard {
  pattern: string;
  statementExcerpt: string;
  severity: 'HIGH' | 'CRITICAL';
  reason: string;
  remediation: string;
}

export interface MigrationSafetyAssessment {
  classification: MigrationSafetyClass;
  safeToAutoExecute: boolean;
  statementCount: number;
  hazards: MigrationHazard[];
  checkedAt: string;
}

const DANGEROUS_DDL_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  severity: 'HIGH' | 'CRITICAL';
  reason: string;
  remediation: string;
}> = [
  {
    name: 'DROP_TABLE',
    regex: /\bDROP\s+TABLE\b/i,
    severity: 'CRITICAL',
    reason: 'Dropping a table permanently destroys all stored records.',
    remediation: 'Deprecate the table in application code first, take a pre-migration backup, and execute in a maintenance window.',
  },
  {
    name: 'DROP_COLUMN',
    regex: /\bALTER\s+TABLE\s+[^\s;]+\s+DROP\s+COLUMN\b/i,
    severity: 'CRITICAL',
    reason: 'Dropping a column breaks running application instances during rolling deployments and causes irreversible data loss.',
    remediation: 'Use expand-and-contract: stop reading/writing the column in release N, then drop the column in release N+1 after backup.',
  },
  {
    name: 'TRUNCATE_TABLE',
    regex: /\bTRUNCATE\s+(?:TABLE\s+)?[^\s;]+/i,
    severity: 'CRITICAL',
    reason: 'TRUNCATE wipes table contents immediately.',
    remediation: 'Never run TRUNCATE in production migrations.',
  },
  {
    name: 'ALTER_COLUMN_TYPE',
    regex: /\bALTER\s+COLUMN\s+[^\s;]+\s+(?:SET\s+DATA\s+)?TYPE\b/i,
    severity: 'HIGH',
    reason: 'Changing column types can trigger full table rewrites and exclusive table locks or data truncation.',
    remediation: 'Add a new nullable column, backfill in batches, dual-write, switch reads, then retire the old column.',
  },
  {
    name: 'RENAME_COLUMN',
    regex: /\bRENAME\s+COLUMN\b/i,
    severity: 'HIGH',
    reason: 'Renaming a column in-place breaks active application pods running the previous release.',
    remediation: 'Use expand-and-contract (add new column, backfill, switch code, remove old column later).',
  },
  {
    name: 'RENAME_TABLE',
    regex: /\bALTER\s+TABLE\s+[^\s;]+\s+RENAME\s+TO\b/i,
    severity: 'HIGH',
    reason: 'Renaming a table in-place breaks active application queries.',
    remediation: 'Create new table or view, migrate reads/writes in stages.',
  },
  {
    name: 'DELETE_WITHOUT_WHERE',
    regex: /\bDELETE\s+FROM\s+[a-zA-Z0-9_."]+\s*;/i,
    severity: 'CRITICAL',
    reason: 'Unbounded DELETE statement destroys all rows in the target table.',
    remediation: 'Scope data migrations with explicit WHERE clauses and batch limits.',
  },
];

/**
 * Classifies SQL migration content into SAFE vs DANGEROUS before production execution.
 */
export function classifySqlMigrationSafety(sql: string): MigrationSafetyAssessment {
  const cleaned = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const statements = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const hazards: MigrationHazard[] = [];

  for (const stmt of statements) {
    for (const rule of DANGEROUS_DDL_PATTERNS) {
      if (rule.regex.test(`${stmt};`)) {
        hazards.push({
          pattern: rule.name,
          statementExcerpt: stmt.slice(0, 140),
          severity: rule.severity,
          reason: rule.reason,
          remediation: rule.remediation,
        });
      }
    }
  }

  const classification: MigrationSafetyClass = hazards.length === 0 ? 'SAFE' : 'DANGEROUS';
  return {
    classification,
    safeToAutoExecute: hazards.length === 0,
    statementCount: statements.length,
    hazards,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Production Seed Guard: Blocks demo/sample seeding in production.
 */
export function assertSeedAllowedInEnvironment(
  env: Record<string, string | undefined> = process.env
): void {
  const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
  const appEnv = (env.APP_ENV || '').trim().toLowerCase();
  const isProd = nodeEnv === 'production' || appEnv === 'production';

  if (isProd) {
    const err = new Error(
      'SEED_BLOCKED_IN_PRODUCTION: Destructive or demo seed data execution is strictly prohibited in production.'
    );
    (err as Error & { code?: string }).code = 'SEED_BLOCKED_IN_PRODUCTION';
    throw err;
  }
}

export interface SeedContaminationReport {
  clean: boolean;
  checkedAt: string;
  demoUsersFound: number;
  demoLeadsFound: number;
  demoSourcesFound: number;
  details: string[];
}

const KNOWN_DEMO_EMAILS = [
  'admin@leadforge.eg',
  'ahmed@cairocode.eg',
  'sara@alexdigital.eg',
  'omar@niletech.eg',
  'nour@growthhub.eg',
  'karim@deltacommerce.eg',
];

/**
 * Checks whether known development/demo seed accounts or sample leads exist in the database.
 */
export async function checkProductionSeedContamination(
  db: PrismaClient = defaultPrisma
): Promise<SeedContaminationReport> {
  const details: string[] = [];

  const demoUsers = await db.user.findMany({
    where: {
      email: { in: KNOWN_DEMO_EMAILS },
    },
    select: { id: true, email: true },
  });

  if (demoUsers.length > 0) {
    details.push(`Found ${demoUsers.length} demo user account(s): ${demoUsers.map((u) => u.email).join(', ')}`);
  }

  const demoSources = await db.leadSource.findMany({
    where: {
      OR: [
        { collectorKey: { contains: 'demo' } },
        { collectorKey: { contains: 'seed' } },
        { name: { contains: 'Seed' } },
      ],
    },
    select: { id: true, name: true, collectorKey: true },
  });

  if (demoSources.length > 0) {
    details.push(`Found ${demoSources.length} demo/seed ingestion source(s): ${demoSources.map((s) => s.name).join(', ')}`);
  }

  const demoLeadsCount = await db.lead.count({
    where: {
      OR: [
        { source: 'SEED_DATA' },
        { email: { endsWith: '@example.com' } },
      ],
    },
  });

  if (demoLeadsCount > 0) {
    details.push(`Found ${demoLeadsCount} demo/seed lead record(s).`);
  }

  return {
    clean: demoUsers.length === 0 && demoSources.length === 0 && demoLeadsCount === 0,
    checkedAt: new Date().toISOString(),
    demoUsersFound: demoUsers.length,
    demoLeadsFound: demoLeadsCount,
    demoSourcesFound: demoSources.length,
    details,
  };
}

export interface DataRetentionPolicyItem {
  category: string;
  tableOrResource: string;
  retentionPeriodDays: number | 'IMMUTABLE_PERMANENT';
  disposalMethod: 'ARCHIVE_OR_PURGE' | 'ANONYMIZE_PII' | 'NEVER_DELETE';
  rationale: string;
}

export const PRODUCTION_DATA_RETENTION_POLICIES: readonly DataRetentionPolicyItem[] = [
  {
    category: 'Financial Credit Ledger',
    tableOrResource: 'CreditTransaction, DeveloperCreditAccount',
    retentionPeriodDays: 'IMMUTABLE_PERMANENT',
    disposalMethod: 'NEVER_DELETE',
    rationale: 'Financial accounting and credit balance audit trail must remain immutable.',
  },
  {
    category: 'Payments & Subscriptions',
    tableOrResource: 'Payment, Subscription, Plan',
    retentionPeriodDays: 'IMMUTABLE_PERMANENT',
    disposalMethod: 'NEVER_DELETE',
    rationale: 'Tax, billing reconciliation, and chargeback dispute resolution require permanent retention.',
  },
  {
    category: 'Lead Claims & Outcomes',
    tableOrResource: 'LeadClaim, LeadEngagement, LeadFeedback, LeadStatusHistory, ContactAttempt',
    retentionPeriodDays: 'IMMUTABLE_PERMANENT',
    disposalMethod: 'NEVER_DELETE',
    rationale: 'Protects shared/exclusive claim history, credit spend provenance, and flywheel accuracy.',
  },
  {
    category: 'Security & Administrative Audit Logs',
    tableOrResource: 'AuditLog, LeadMergeHistory',
    retentionPeriodDays: 'IMMUTABLE_PERMANENT',
    disposalMethod: 'NEVER_DELETE',
    rationale: 'Required for forensic investigation, compliance, and administrative accountability.',
  },
  {
    category: 'Raw Ingestion Payloads',
    tableOrResource: 'ImportRecord (PROCESSED / VALID)',
    retentionPeriodDays: 90,
    disposalMethod: 'ARCHIVE_OR_PURGE',
    rationale: 'Raw payloads are normalized into SourceRecord; processed raw blobs older than 90 days can be archived.',
  },
  {
    category: 'Failed Ingestion & Dead-Letter Records',
    tableOrResource: 'DeadLetterRecord, ImportRecord (FAILED / DEAD_LETTER)',
    retentionPeriodDays: 180,
    disposalMethod: 'ARCHIVE_OR_PURGE',
    rationale: 'Retained 180 days for parser debugging and replay before purging resolved/expired items.',
  },
  {
    category: 'Source Provenance Records',
    tableOrResource: 'SourceRecord, LeadIdentity',
    retentionPeriodDays: 'IMMUTABLE_PERMANENT',
    disposalMethod: 'NEVER_DELETE',
    rationale: 'Preserves legal and technical lineage for every canonical business and lead.',
  },
  {
    category: 'User & Developer Account Data (Deleted/Closed Accounts)',
    tableOrResource: 'User, DeveloperProfile',
    retentionPeriodDays: 30,
    disposalMethod: 'ANONYMIZE_PII',
    rationale: 'Upon account deletion request, personal identifiers are anonymized while preserving foreign-key integrity for financial and claim records.',
  },
  {
    category: 'Lead Inventory (Archived/Invalid)',
    tableOrResource: 'Lead (ARCHIVED / INVALID)',
    retentionPeriodDays: 365,
    disposalMethod: 'ARCHIVE_OR_PURGE',
    rationale: 'Unclaimed invalid/archived leads are retained 365 days for deduplication suppression before cold archival.',
  },
  {
    category: 'Analytics Snapshots & Temporary Exports',
    tableOrResource: 'DailyMetricSnapshot / Ephemeral CSV streams',
    retentionPeriodDays: 30,
    disposalMethod: 'ARCHIVE_OR_PURGE',
    rationale: 'CSV exports are streamed in-memory; ephemeral export artifacts are purged within 30 days.',
  },
] as const;

/**
 * Runs a comprehensive Database Production Readiness Audit (Section 5 & Section 46).
 */
export async function runDatabaseProductionReadinessAudit(db: PrismaClient = defaultPrisma) {
  const integrity = await runDataIntegrityChecks(db);

  const totalClaims = await db.leadClaim.count();
  const totalCreditTxs = await db.creditTransaction.count();
  const claimedFullLeadsWithoutActiveClaims = await db.lead.count({
    where: {
      status: 'CLAIMED_FULL',
      claims: { none: { status: 'ACTIVE' } },
    },
  });

  const canonicalLeadsCount = await db.lead.count({ where: { isCanonical: true } });
  const sourceRecordCount = await db.sourceRecord.count();
  const identityCount = await db.leadIdentity.count();

  return {
    healthy: integrity.healthy && claimedFullLeadsWithoutActiveClaims === 0,
    checkedAt: new Date().toISOString(),
    integrityReport: integrity,
    additionalInvariants: {
      claimedFullLeadsWithoutActiveClaims,
      totalClaims,
      totalCreditTxs,
      canonicalLeadsCount,
      sourceRecordCount,
      identityCount,
    },
    retentionPolicies: PRODUCTION_DATA_RETENTION_POLICIES,
  };
}

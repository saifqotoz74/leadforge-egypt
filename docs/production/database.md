# Database Production Readiness & Safe Migrations — LeadForge Egypt

## 1. Schema & Critical Invariants
The Prisma schema (`prisma/schema.prisma`) defines 29 tables across identity, subscriptions, credit ledger, canonical lead deduplication, scoring, quality/verification, matching, claims, feedback/engagements, ingestion/dead-letter, analytics snapshots, and audit logs.

Nine critical invariants are continuously enforced and audited via `runDataIntegrityChecks()` (`src/lib/observability/integrity.ts`) and `runDatabaseProductionReadinessAudit()` (`src/lib/production/database-ops.ts`):
1. **No negative credit balances** (`DeveloperCreditAccount.balance >= 0`).
2. **Credit ledger reconciliation** (`DeveloperCreditAccount.balance === SUM(CreditTransaction.amount)`).
3. **Single active exclusive claim** (`Lead.accessType === 'EXCLUSIVE'` has at most 1 `ACTIVE` `LeadClaim`).
4. **Shared lead capacity bounds** (`Lead.currentPurchasers <= Lead.maxPurchasers`).
5. **No duplicate developer/lead claims** (`@@unique([leadId, userId])` on `LeadClaim`).
6. **Refund ceiling invariant** (`LeadClaim.creditsRefunded <= LeadClaim.creditsCharged`).
7. **Claim–Engagement 1:1 linkage** (every `ACTIVE` `LeadClaim` has a corresponding `LeadEngagement`).
8. **Unique source provenance** (`@@unique([sourceName, externalId])` on `SourceRecord`).
9. **Consistent availability status** (no `CLAIMED_FULL` lead with zero active claims).

## 2. Safe vs. Dangerous Migrations (`classifySqlMigrationSafety`)
Before any migration is applied (`prisma/migrate.ts`), `classifySqlMigrationSafety()` inspects the SQL DDL:
- **SAFE Migrations** (auto-executable):
  - `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD COLUMN` (nullable or with safe default).
- **DANGEROUS Migrations** (blocked unless `ALLOW_DANGEROUS_MIGRATION="true"` after pre-migration backup):
  - `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER COLUMN ... TYPE`, `RENAME COLUMN`, `RENAME TABLE`, unbounded `DELETE FROM`.
- **Expand-and-Contract Protocol for Dangerous Changes**:
  1. **Release N (Expand)**: Add new nullable column/table; dual-write in application code.
  2. **Backfill**: Run bounded batch backfill job.
  3. **Release N+1 (Switch)**: Switch reads to the new column/table; stop writing to old column.
  4. **Release N+2 (Contract)**: After taking a verified backup, drop the unused legacy column.

## 3. Production Seed Protection
- `seedDatabase()` (`src/lib/seed-data.ts`) invokes `assertSeedAllowedInEnvironment()` and throws `SEED_BLOCKED_IN_PRODUCTION` whenever `NODE_ENV="production"` or `APP_ENV="production"`.
- `checkProductionSeedContamination()` audits the database to ensure zero `@leadforge.eg` demo accounts or `SEED_DATA` leads exist in production.

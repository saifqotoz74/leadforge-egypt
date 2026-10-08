# Database Backup Strategy — LeadForge Egypt

## 1. Backup Schedule & Retention (`DISASTER_RECOVERY_TARGETS`)
- **Point-in-Time Recovery (PITR)**: Continuous WAL archiving on managed PostgreSQL with **RPO <= 15 minutes**.
- **Daily Full Snapshots**: Executed daily at `02:00 UTC` (`0 2 * * *`), retained for **30 days**.
- **Weekly Snapshots**: Retained for **12 weeks**.
- **Pre-Migration Snapshot**: Mandatory logical + physical backup prior to any schema migration.

## 2. Logical Backup Artifact (`createLogicalBackupSnapshot`)
Implemented in `src/lib/production/backup-restore.ts`:
- Captures all 18 core operational, financial, lead, provenance, claim, engagement, feedback, analytics, and audit tables in deterministic primary-key order:
  `plans`, `users`, `developerProfiles`, `subscriptions`, `developerCreditAccounts`, `creditTransactions`, `leadSources`, `leads`, `sourceRecords`, `leadIdentities`, `leadClaims`, `leadEngagements`, `leadFeedbacks`, `leadStatusHistories`, `contactAttempts`, `payments`, `auditLogs`, `dailyMetricSnapshots`.
- Computes a deterministic **SHA-256 checksum** (`checksumSha256`) over the serialized table payload.
- Records per-table `rowCounts` and `totalRows`.

## 3. Encryption & Access Control
- Backups are encrypted at rest using AES-256 and transmitted exclusively over TLS 1.3.
- Access to backup buckets is restricted to the Database Administrator and Automated Recovery roles with immutable object lock enabled for financial/audit compliance.

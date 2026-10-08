# Database Restore & Disaster Recovery Verification — LeadForge Egypt

## 1. Recovery Objectives
- **RPO (Recovery Point Objective)**: **15 minutes** via PostgreSQL WAL PITR; 24 hours via daily logical snapshots.
- **RTO (Recovery Time Objective)**: **30 minutes** to provision/promote target PostgreSQL instance, verify invariants, and switch `DATABASE_URL`.

## 2. Staging Restore Verification Procedure (`executeStagingRestoreVerification`)
Implemented in `src/lib/production/backup-restore.ts`:
1. **Verify Checksum**: Recomputes `computeBackupChecksum(artifact.payload)` and compares against `artifact.checksumSha256`. Aborts immediately if tampered or corrupted.
2. **Isolated Target Restore**: Clears the isolated staging/verification database in reverse foreign-key order, then restores all 18 tables in strict parent-to-child dependency order (`Plan -> User -> DeveloperProfile -> Subscription -> DeveloperCreditAccount -> LeadSource -> Lead -> SourceRecord -> LeadIdentity -> LeadClaim -> CreditTransaction -> LeadEngagement -> LeadFeedback -> LeadStatusHistory -> ContactAttempt -> Payment -> AuditLog -> DailyMetricSnapshot`).
3. **Row Count Verification**: Asserts exact 1:1 row count parity across all 18 tables (`rowCountMatch === true`).
4. **Post-Restore Invariant Audit**: Runs `runDataIntegrityChecks(targetDb)` to verify zero negative credit balances, exact credit ledger sums, exclusive claim uniqueness, and shared capacity bounds (`invariantVerification.healthy === true`).

## 3. Honest Status Classification
- **Staging / Isolated Restore Verification**: `VERIFIED` (automated and executed in test suite).
- **Live Production Cluster Restore**: Marked `NOT_EXECUTED` in `RestoreVerificationReport.productionLiveRestoreStatus` until an operator executes a live drill against external production infrastructure.

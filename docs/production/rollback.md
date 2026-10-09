# Production Rollback Strategy — LeadForge Egypt

## 1. Rollback Principles
- Never assume an arbitrary destructive database rollback is safe.
- All production schema changes follow the expand-and-contract pattern so release `N-1` remains compatible with the database schema of release `N`.
- Risky runtime features can be disabled in seconds without redeployment using server-side feature flags (`src/lib/production/feature-flags.ts` or `POST /api/admin/observability` with `action: "UPDATE_FEATURE_FLAG"`).

## 2. Immediate Feature Flag Kill-Switch (< 30 Seconds)
If an incident is isolated to a specific subsystem, disable its feature flag immediately:
- **Scheduled Collectors**: Set `collector_scheduled_runs = false`
- **Payment Webhooks**: Set `payment_webhooks_enabled = false`
- **Live Checkout**: Set `live_payment_processing = false`
- **Public Registration**: Set `public_registration_enabled = false`

## 3. Application & Worker Rollback (< 5 Minutes)
1. Identify the previous known-good release commit SHA / container digest (`N-1`).
2. Pause scheduled background workers (`collector_scheduled_runs = false`) and request cancellation of any active job via `requestWorkerJobCancellation()`.
3. Redeploy or switch load balancer target group to release `N-1`.
4. Drain release `N` pods using `initiateGracefulShutdown()`.
5. Verify `GET /api/health` and `GET /api/health/ready` return `200 OK`.
6. Execute `runProductionSmokeTests()` to confirm full restoration.

## 4. Database Migration & Data Recovery Rollback
- **Case A — Additive Migration (`SAFE`)**: Leave additive nullable columns/tables in place while running application version `N-1`.
- **Case B — Corrupted Data / Failed Staged Migration**:
  1. Put application in maintenance/read-only state.
  2. Restore from the pre-migration snapshot into a clean PostgreSQL target using `executeStagingRestoreVerification` / PITR restore.
  3. Verify `runDataIntegrityChecks()` reports `healthy: true` and `totalViolations === 0`.
  4. Point `DATABASE_URL` to the verified restored instance and resume traffic on release `N-1`.

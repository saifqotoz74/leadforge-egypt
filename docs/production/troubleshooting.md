# Production Troubleshooting Runbook — LeadForge Egypt

## 1. Startup Fails with `ENVIRONMENT_VALIDATION_FAILED`
- **Symptom**: Application refuses to start or `/api/admin/observability` reports `ENVIRONMENT_VALIDATION_FAILED`.
- **Diagnosis**: Inspect `issues` array in `validateEnvironmentConfiguration()`. Each entry specifies `category`, `variable`, and `code` (e.g., `AUTH_SECRET:WEAK_SECRET`, `USE_EXTERNAL_PG:DEV_DATABASE_FORBIDDEN_IN_PRODUCTION`, `APP_URL:INSECURE_URL`).
- **Resolution**: Supply valid production environment variables matching `docs/production/environment.md`. Never set `ALLOW_PRODUCTION_SEED="true"` or `DEBUG="true"` in production.

## 2. Readiness Probe `/api/health/ready` Returns `503 NOT_READY`
- **Symptom**: Load balancer marks instance unhealthy.
- **Diagnosis**: Check `checks` object in `/api/health/ready` response (`database`, `configuration`, `processLifecycle`, `jobQueue`).
- **Resolution**:
  - If `processLifecycle === "error"`: Instance is draining for graceful shutdown; wait for replacement pod.
  - If `database === "error"`: Check PostgreSQL connectivity, connection pool exhaustion (`DB_POOL_MAX`), and VPC security groups.
  - If `configuration === "error"`: Verify `AUTH_SECRET` is >= 32 characters and non-default.

## 3. Credit Ledger Invariant Alert (`CREDIT_INVARIANT_VIOLATION`)
- **Symptom**: `runDataIntegrityChecks()` reports `credit_ledger_reconciliation` or `no_negative_credit_balances` violation.
- **Diagnosis**: Query `DeveloperCreditAccount` and `CreditTransaction` for the `sampleIds` listed in the integrity report.
- **Resolution**: Reconcile via `POST /api/admin/credits/adjust` with an explicit audit reason and verify `runDataIntegrityChecks()` returns `healthy: true`.

## 4. Collector Circuit Breaker Opened (`circuitState === "OPEN"`)
- **Symptom**: Scheduled ingestion source stops running after consecutive failures.
- **Diagnosis**: Inspect `DeadLetterRecord` and `ImportJob` error codes (`SOURCE_TIMEOUT`, `RATE_LIMITED`, `INVALID_SOURCE_RECORD`).
- **Resolution**: Fix upstream credentials or rate limits, then reset the source via `POST /api/admin/sources` (`RESET_CIRCUIT_BREAKER`).

## 5. Worker Job Returns `LOCK_CONFLICT`
- **Symptom**: `executeScheduledWorkerJob` returns `status: "LOCK_CONFLICT"`.
- **Diagnosis**: A previous invocation of the same `jobKey` is still active within its `timeoutMs` window.
- **Resolution**: Wait for the active run to finish or call `requestWorkerJobCancellation(jobKey)` if the job is cancellable.

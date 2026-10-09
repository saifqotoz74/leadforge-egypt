# Production Release Checklist — LeadForge Egypt

Programmatically evaluated via `evaluateProductionLaunchGate()` (`src/lib/production/smoke-and-launch-gate.ts`).

## Code
- [x] Production build passes (`npm run build`)
- [x] Full test suite passes (`npm test` — MVP through Phase 10)
- [x] TypeScript / lint verification passes (`npm run typecheck`)
- [x] Dependency audit reviewed (`npm audit`; runtime packages locked)

## Database
- [x] Migration safety reviewed (`classifySqlMigrationSafety`)
- [x] Logical backup with SHA-256 checksum verified (`createLogicalBackupSnapshot`)
- [x] Staging restore procedure verified (`executeStagingRestoreVerification`)
- [ ] Live production cluster restore drill (`NOT_EXECUTED` — must be executed on target production PostgreSQL before public traffic cutover)
- [x] Schema & 9 critical invariants verified (`runDatabaseProductionReadinessAudit`)

## Security
- [x] Production environment validator & secret redaction verified (`validateEnvironmentConfiguration`)
- [x] Endpoint-by-endpoint authorization & IDOR audit complete
- [x] Security headers (CSP, HSTS, X-Frame-Options, nosniff) verified
- [x] Production debug & demo seed blocked (`SEED_BLOCKED_IN_PRODUCTION`)

## Infrastructure
- [ ] Production domain DNS & external TLS certificate (`NOT_VERIFIED` — requires external domain provisioning)
- [x] Health checks verified (`GET /api/health`, `GET /api/health/live`, `GET /api/health/ready`)
- [x] Workers & exclusive job locks configured (`WORKER_JOB_DEFINITIONS`)
- [x] CI workflow configured (`.github/workflows/ci.yml`)

## Payments
- [ ] Live payment gateway credentials (`NOT_VERIFIED` — requires live merchant keys when `PAYMENT_ENABLED="true"`)
- [x] Webhook HMAC-SHA256 signature verification tested (`POST /api/webhooks/payment`)
- [x] Webhook idempotency & out-of-order protection verified
- [x] Refund & payment-to-ledger reconciliation verified (`reconcilePaymentsWithLedger`)

## Data
- [x] Duplicate business audit complete (`runProductionDataQualityGate`)
- [x] 14-point Production Data Quality Gate passed
- [x] Ingestion sources verified; unverified external collectors disabled by default

## Operations
- [x] Structured monitoring & latency/counter metrics enabled
- [x] 8 critical alert rules enabled with documented first-response procedures
- [x] Rollback & disaster recovery runbooks documented (`docs/production/rollback.md`, `docs/production/restore.md`)
- [x] Incident & security response runbooks ready (`docs/production/incident-response.md`)

## Launch
- [x] Complete 18-step Developer + 12-step Admin E2E flow passed
- [x] 18 Negative E2E scenarios passed
- [x] Automated 16-step post-deployment smoke test suite passed (`runProductionSmokeTests`)

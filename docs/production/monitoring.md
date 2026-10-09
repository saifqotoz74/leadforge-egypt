# Production Monitoring & Observability — LeadForge Egypt

## 1. Health & Readiness Endpoints (Section 16)
- `GET /api/health` (`src/app/api/health/route.ts`): Returns machine-readable availability status, environment, version, and dependency check summary (`200 OK` or `503 Service Unavailable`). Never exposes secrets or connection strings.
- `GET /api/health/live` (`src/app/api/health/live/route.ts`): Process liveness probe (`ALIVE` vs `SHUTTING_DOWN`), uptime, active in-flight operations, and memory usage.
- `GET /api/health/ready` (`src/app/api/health/ready/route.ts`): Full readiness probe verifying process lifecycle, production secret configuration, database connectivity latency, and job queue health.

## 2. Observability Signals (Section 33)
Implemented across `src/lib/observability/metrics.ts`, `src/lib/observability/logger.ts`, and `src/app/api/admin/observability/route.ts`:
- **Application**: Per-route request count, HTTP status distribution (`2xx`, `4xx`, `5xx`), latency percentiles (`p50`, `p95`, `p99`), and error rates.
- **Database**: Readiness ping latency, slow query tracking (`> 250ms`), and transaction conflict counters.
- **Claims & Credits**: Claim attempts, successful claims, conflicts (`ALREADY_CLAIMED`, `EXCLUSIVE_UNAVAILABLE`), deductions, refunds, admin adjustments, and real-time invariant violation counts.
- **Ingestion & Collectors**: Records discovered, processed, duplicate, invalid, failed, dead-letter count, and per-source circuit breaker state.
- **Workers**: Scheduled job executions, duration, retry count, and lock conflicts (`getWorkerSchedulerSnapshot()`).
- **Payments & Webhooks**: `payment_webhook_success_total`, `payment_webhook_failures_total`, and payment-to-ledger reconciliation (`reconcilePaymentsWithLedger()`).

## 3. First 24 Hours Post-Launch Monitoring Procedure (Section 52)
- **Every 15 Minutes (Hours 0–4)**: Check `GET /api/admin/observability` for `5xx` error rates, p95 claim latency, webhook failures, and credit ledger reconciliation.
- **Every Hour (Hours 4–24)**: Run `POST /api/admin/observability` with `action: "RUN_INTEGRITY_CHECKS"` and `action: "RUN_DATA_QUALITY_GATE"`.
- **No Automatic Punitive Actions**: Anomaly detection flags accounts for human admin review (`getAbuseEvents()`) without automatically banning or confiscating developer credits.

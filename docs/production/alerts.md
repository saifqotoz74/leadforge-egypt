# Production Alerting Rules & Runbook — LeadForge Egypt

## 1. Configured Alert Rules (`src/lib/observability/alerts.ts`)
| Alert Code | Severity | Trigger Condition | First-Response Action |
|---|---|---|---|
| `CREDIT_INVARIANT_VIOLATION` | `CRITICAL` (P0) | Any negative credit balance or ledger mismatch (`totalViolations > 0`) | Immediately run `runDataIntegrityChecks()`, inspect `CreditTransaction` audit trail for the affected `developerId`, and freeze manual credit adjustments until reconciled. |
| `REPEATED_CLAIM_TRANSACTION_CONFLICTS` | `HIGH` (P1) | Claim transaction conflicts exceed threshold (`>= 5`) | Inspect concurrent claim contention on hot leads and verify database lock latency. |
| `API_5XX_SPIKE` | `CRITICAL` (P0) | HTTP 5xx responses exceed threshold (`>= 5` in window) | Inspect structured error logs by `requestId`; if caused by recent release, execute `docs/production/rollback.md`. |
| `HIGH_P95_LATENCY` | `WARNING` (P2) | Route p95 latency exceeds `1200ms` | Inspect slow query logs and verify `globalAppCache` hit rate. |
| `INGESTION_CONSECUTIVE_FAILURES` | `HIGH` (P1) | Source consecutive failures `>= 3` | Verify source circuit breaker opened (`circuitState === "OPEN"`) and disable unverified source via Admin Sources control. |
| `DEAD_LETTER_SPIKE` | `WARNING` (P2) | Unresolved `DeadLetterRecord` count `>= 25` | Inspect `DeadLetterRecord` error codes (`INVALID_SOURCE_RECORD` vs `SOURCE_TIMEOUT`) before replaying. |
| `AUTH_BRUTE_FORCE_SPIKE` | `HIGH` (P1) | Repeated failed logins / rate-limit blocks `>= 10` | Review `getAbuseEvents()` by IP hash; verify rate limiter is blocking offending IPs with `429`. |
| `IDOR_OR_ADMIN_PROBING` | `CRITICAL` (P0) | Unauthorized admin/cross-tenant access attempts `>= 3` | Inspect `AuditLog` and `AbuseEvent` records for the actor's `userId` and IP; revoke compromised sessions if necessary. |

## 2. Alert Noise Prevention
- Alerts are evaluated deterministically against configurable thresholds (`updateAlertThresholds()`).
- Every alert includes structured `evidence` and `remediation` fields.

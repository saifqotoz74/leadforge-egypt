# LeadForge Egypt — Reliability, Concurrency & Fault Tolerance (`docs/reliability.md`)

## 1. Reliability Architecture Overview
LeadForge Egypt is designed to maintain strict data and financial consistency under high concurrency, network instability, partial batch failures, and process restarts. All reliability mechanisms are 100% deterministic.

---

## 2. Concurrency Control & Transaction Isolation

### 1. Lead Claiming & Credit Ledger Atomicity (`src/lib/claims/`)
- **Deterministic Lock Ordering (`src/lib/claims/locks.ts`)**:
  - In-process mutexes (`withResourceLocks`) sort lock keys lexicographically (`account:<developerId>`, `lead:<leadId>`) before acquisition, making lock-order deadlocks impossible.
  - Inside the PostgreSQL transaction, `acquireLeadAndAccountRowLocks` acquires `SELECT id FROM "Lead" WHERE id = $1 FOR UPDATE` followed by `SELECT id FROM "DeveloperCreditAccount" WHERE "developerId" = $1 FOR UPDATE`.
- **Single-Transaction Execution**:
  - Eligibility verification, duplicate-claim prevention, credit balance deduction, `CreditTransaction` insertion, `LeadClaim` creation, `Lead` availability/purchaser counter update, and `AuditLog` creation all execute inside a single atomic `prisma.$transaction`.
  - If any step fails, the entire transaction rolls back cleanly with zero partial state or orphaned credit deductions.
- **Database-Level Invariants (`src/lib/db.ts`)**:
  - `DeveloperCreditAccount_balance_non_negative`: `CHECK ("balance" >= 0 AND "reservedBalance" >= 0 ...)`
  - `CreditTransaction_ledger_math_check`: `CHECK ("balanceBefore" >= 0 AND "balanceAfter" >= 0 AND ("balanceBefore" + "amount" = "balanceAfter"))`
  - `Lead_purchasers_check`: `CHECK ("currentPurchasers" >= 0 AND "maxPurchasers" >= 1 AND "currentPurchasers" <= "maxPurchasers")`
  - `LeadClaim_credits_check`: `CHECK ("creditsCharged" >= 0 AND "creditsRefunded" >= 0 AND "creditsRefunded" <= "creditsCharged")`
  - `LeadClaim_exclusive_active_leadId_key`: Partial unique index guaranteeing at most one `ACTIVE` `EXCLUSIVE` claim per `leadId`.

### 2. Idempotency Guarantees
- Supported across:
  - Lead Claiming (`POST /api/leads/[id]/claim` via `Idempotency-Key` header or `idempotencyKey` body field; backed by unique index `LeadClaim(userId, idempotencyKey)`).
  - Claim Refunds (`POST /api/admin/claims/[claimId]/refund`; backed by deterministic idempotency keys on `CreditTransaction(developerId, idempotencyKey)`).
  - Admin Credit Adjustments (`POST /api/admin/developers/[developerId]/credits/adjust`).
  - Feedback, Engagement Status Transitions, and Contact Attempts (`LeadFeedback`, `LeadStatusHistory`, `ContactAttempt` unique `(userId/developerId, idempotencyKey)` indexes).
  - Ingestion Jobs (`ImportJob.idempotencyKey`).
- Reusing the same `idempotencyKey` with different parameters throws `409 IDEMPOTENCY_CONFLICT` (`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PARAMETERS`).

### 3. Deduplication Concurrency Safety (`src/lib/deduplication.ts`)
- `withIdentityConcurrencyLock` serializes concurrent ingestion of records sharing identical canonical identity keys (normalized phone, domain, email, or name+city), preventing duplicate canonical `Lead` creation under parallel ingestion workers.

---

## 3. External Collector Resilience (`src/lib/collectors/resilience.ts`)
1. **Bounded Timeouts**: Every outbound HTTP request and ingestion job enforces strict `AbortController` and runtime timeouts (`timeoutMs`).
2. **Exponential Backoff Retries (`executeWithRetry`)**:
   - Retries only transient errors (`SOURCE_TIMEOUT`, `SOURCE_UNAVAILABLE`, `SOURCE_RATE_LIMITED` / HTTP 429 & 5xx).
   - Permanent errors (`SSRF_BLOCKED`, `INVALID_SOURCE_CONFIGURATION`, `SCHEMA_VALIDATION_FAILED`, HTTP 400/401/403/404) fail fast without retry.
3. **Deterministic Circuit Breaker (`evaluateCircuitBreakerBeforeRun`, `recordCircuitBreakerOutcome`)**:
   - States: `CLOSED` -> `OPEN` (after `failureThreshold` consecutive failures, default 3) -> `HALF_OPEN` (after `cooldownMs`, default 60s) -> `CLOSED` on success or `OPEN` on failure.
   - Prevents cascading failures and upstream hammering when an external source is down.
4. **Source Job Locking & Checkpointed Resume**:
   - `acquireSourceJobLock` prevents concurrent overlapping runs for the same `LeadSource`.
   - `runIngestionPipeline` saves a batch `IngestionCheckpoint` (`offset`, `lastProcessedExternalId`, `batchIndex`, `processedCount`) after every batch so interrupted jobs can be resumed from the exact offset via `resumeIngestionJob` without duplicating already-processed records.
5. **Dead-Letter Queue (`DeadLetterRecord`)**:
   - Records that exhaust retries or fail processing are isolated into `DeadLetterRecord` with sanitized payloads, error codes, and retry counters so a single poisoned record never aborts a 1,000-record batch.

---

## 4. Health Checks, Graceful Shutdown & Data Integrity Verification
- **Liveness Check (`GET /api/health/live`)**: Reports process status (`ALIVE` vs. `SHUTTING_DOWN`), uptime, active in-flight operations, and memory usage (`rss`, `heapTotal`, `heapUsed`).
- **Readiness Check (`GET /api/health/ready`)**: Verifies process lifecycle state, required configuration secrets, live database query latency, and job queue state. Returns `200 READY` or `503 NOT_READY`.
- **Graceful Shutdown (`initiateGracefulShutdown`, `trackActiveOperation` in `src/lib/observability/shutdown.ts`)**:
  - Immediately transitions readiness to `NOT_READY` (`503`), blocks new background jobs, waits up to `drainTimeoutMs` for in-flight operations to complete, executes registered cleanup callbacks, and logs completion.
- **Automated Data Integrity Verification (`runDataIntegrityChecks` in `src/lib/observability/integrity.ts`)**:
  - Verifies 7 critical invariants across `Lead`, `SourceRecord`, `LeadClaim`, `DeveloperCreditAccount`, `CreditTransaction`, `LeadEngagement`, `ContactAttempt`, `LeadScore`, `LeadVerification`, and `MatchSnapshot`.

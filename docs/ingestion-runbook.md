# Phase 8 — Ingestion Operational Runbook

## 1. Admin API Endpoints

All endpoints require an authenticated `ADMIN` session (`requireAdmin`) and enforce CSRF origin verification (`verifyCsrfOrigin`) on state-changing requests (`POST`, `PATCH`). Secrets in source configurations or raw payloads are always redacted (`[REDACTED]`).

| Endpoint | Methods | Purpose |
| :--- | :---: | :--- |
| `/api/admin/ingestion/sources` | `GET`, `POST` | List all sources with health/funnel/economics, or create a new source |
| `/api/admin/ingestion/sources/[sourceId]` | `GET`, `PATCH` | Inspect single source + live healthCheck, or update config/quotas/schedule/circuit |
| `/api/admin/ingestion/sources/[sourceId]/run` | `POST` | Trigger manual run, resume checkpoint (`action: 'RESUME'`), or backfill (`action: 'BACKFILL'`) |
| `/api/admin/ingestion/jobs` | `GET` | List ingestion jobs with filtering (`status`, `sourceName`, `triggerType`), sorting, and pagination |
| `/api/admin/ingestion/jobs/[jobId]` | `GET` | Inspect full job metrics, checkpoint state, records, and dead-letters |
| `/api/admin/ingestion/jobs/[jobId]/cancel` | `POST` | Cooperatively cancel a running or pending ingestion job |
| `/api/admin/ingestion/dead-letter` | `GET` | List dead-letter queue records filtered by `status`, `sourceName`, `errorCode` |
| `/api/admin/ingestion/dead-letter/[id]/retry` | `POST` | Retry a dead-letter record (`action: 'RETRY'`) or mark permanently invalid (`action: 'MARK_INVALID'`) |
| `/api/admin/ingestion/health` | `GET`, `POST` | Get health overview, operational alerts, replenishment status, or trigger replenishment/retention/lineage |

---

## 2. Handling Common Operational Scenarios

### Scenario A: Source Circuit Breaker is `OPEN` (`SOURCE_UNAVAILABLE` Alert)
1. Inspect the latest failed job in `/admin/sources` → **سجل مهام التشغيل** to view `errorCode` and `errorSummary`.
2. Verify upstream connectivity or credentials via `GET /api/admin/ingestion/sources/[sourceId]`.
3. Once resolved, click **إعادة ضبط القاطع (Reset Circuit)** in the Admin UI or send `PATCH /api/admin/ingestion/sources/[sourceId]` with `{ "resetCircuit": true }`.

### Scenario B: Interrupted / Crashed Job Recovery
1. Every batch boundary persists `ImportJob.checkpoint` (`offset`, `cursor`, `lastProcessedExternalId`).
2. Trigger `POST /api/admin/ingestion/sources/[sourceId]/run` with `{ "action": "RESUME", "resumeJobId": "<jobId>" }`.
3. The orchestrator skips already-processed records up to `checkpoint.offset` and completes the remaining batches without creating duplicate leads.

### Scenario C: Dead-Letter Queue Spike (`DEAD_LETTER_SPIKE` Alert)
1. Open `/admin/sources` → **طابور المعالجة المعلقة (Dead-Letter Queue)**.
2. Inspect `errorCode` and `errorMessage`:
   - If caused by a transient error (`SOURCE_TIMEOUT`, `DATABASE_ERROR`), click **إعادة المحاولة (Retry)** (`POST /api/admin/ingestion/dead-letter/[id]/retry` with `{ "action": "RETRY" }`).
   - If the record is permanently malformed (`INVALID_SOURCE_RECORD`), click **غير صالح (Mark Invalid)** (`{ "action": "MARK_INVALID" }`) so it cannot be retried again.

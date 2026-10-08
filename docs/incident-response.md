# LeadForge Egypt — Incident Response & Operational Runbook (`docs/incident-response.md`)

## 1. Purpose & Scope
This runbook defines deterministic, step-by-step incident response procedures for engineering and operations administrators managing LeadForge Egypt in production. All actions are auditable via `AuditLog` and observable via `/api/admin/observability`.

---

## 2. Severity Classification

| Severity | Definition | Examples | Target Response |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core financial, data integrity, or tenant isolation invariant violated, or service unavailable. | Credit ledger discrepancy (`balance != sum(tx)`), exclusive lead double-claim, database readiness failure, active credential compromise. | Immediate (< 15 min) |
| **SEV-2 (High)** | Degraded core workflow or active external attack blocked by controls. | Elevated 5xx error rate (`HIGH_ERROR_RATE`), repeated SSRF/IDOR probes, primary ingestion source circuit breaker stuck `OPEN`. | < 1 hour |
| **SEV-3 (Medium)** | Operational backlog or localized performance degradation. | Dead-letter queue backlog (`DEAD_LETTER_BACKLOG_GROWTH`), slow query spike (`SLOW_QUERY_SPIKE`), elevated claim refund rate (`HIGH_REFUND_RATE`). | < 4 hours |

---

## 3. Triage & Detection Workflow
1. **Check Liveness & Readiness**:
   - `GET /api/health/live` — Verify process uptime, memory footprint (`rss`, `heapUsed`), and shutdown state.
   - `GET /api/health/ready` — Verify database connectivity, configuration health, and active job queue status.
2. **Inspect Operational Observability Dashboard**:
   - `GET /api/admin/observability` (requires Admin session):
     - Review `alerts.activeAlerts` for deterministic threshold breaches.
     - Review `dataIntegrity` report (`healthy`, `totalViolations`, per-category violation details).
     - Review `securityAndAbuse.flaggedAbuseSignals` and `recentAuditEvents`.
     - Review `performanceAndQueries.slowQueries` and `httpRequests.latencyMs` (`p50`, `p95`, `p99`).

---

## 4. Playbooks by Incident Type

### Playbook A: Compromised User or Admin Account / Credential Stuffing
1. **Identify Actor**: Check `GET /api/admin/observability` -> `securityAndAbuse.flaggedAbuseSignals` for `REPEATED_AUTH_FAILURES` or `IDOR_PROBE_DETECTED`.
2. **Suspend Compromised Account Immediately**:
   - Call `PATCH /api/admin/users` with `{ "userId": "<targetUserId>", "status": "SUSPENDED" }`.
   - Because `getCurrentUser` checks `user.status !== 'SUSPENDED'` on every request, all active JWT sessions for that user are immediately invalidated across all endpoints.
3. **Rotate Global JWT Secret (if Admin/Signing Key Compromised)**:
   - Update `JWT_SECRET` in environment configuration and redeploy/restart workers. All existing JWT tokens will immediately fail signature verification (`401 UNAUTHORIZED`).
4. **Audit Impact**:
   - Query `AuditLog` for `userId = <targetUserId>` to review all claims, exports, or config changes performed during the window.

### Playbook B: Credit Ledger or Claim Integrity Alert (`DATA_INTEGRITY_VIOLATION`)
1. **Execute On-Demand Integrity Verification**:
   - `POST /api/admin/observability` with `{ "action": "RUN_INTEGRITY_CHECKS" }`.
   - Inspect `report.checks.creditLedgerInvariants`, `exclusiveLeadMultipleOwners`, and `orphanedClaims`.
2. **Reconcile Affected Developer Credit Account**:
   - Inspect `GET /api/admin/credits?developerId=<developerId>` to view full `CreditTransaction` history and `reconciliation` discrepancy.
   - Issue an auditable corrective transaction via `POST /api/admin/developers/<developerId>/credits/adjust` with `type: "CORRECTION"`, explicit `reason`, and an `Idempotency-Key`.
3. **Refund Invalid or Conflicting Claim**:
   - Issue an idempotent refund via `POST /api/admin/claims/<claimId>/refund` with `{ "reason": "Incident remediation", "idempotencyKey": "inc-refund-<claimId>" }`.

### Playbook C: Failing Ingestion Source / Circuit Breaker Open (`INGESTION_SOURCE_CIRCUIT_OPEN`)
1. **Inspect Source Health & Dead-Letter Queue**:
   - `GET /api/admin/ingestion/health` and `GET /api/admin/ingestion/dead-letter`.
2. **Isolate Faulty Source**:
   - If an external provider is returning malformed data or rate-limiting (`429`/`503`), disable the source via `PATCH /api/admin/ingestion/sources/<sourceId>` with `{ "enabled": false }`.
   - If a job is hung, cancel it cooperatively via `POST /api/admin/ingestion/jobs/<jobId>/cancel`.
3. **Recover & Replay Dead-Letter Records**:
   - Once the source configuration or upstream issue is resolved, re-enable/reset the circuit breaker via `POST /api/admin/ingestion/health` (`{ "action": "RESET_CIRCUIT", "sourceId": "<id>" }`).
   - Retry dead-letter records via `POST /api/admin/ingestion/dead-letter/<id>/retry` or resume the checkpointed job via `POST /api/admin/ingestion/sources/<sourceId>/run` (`{ "action": "RESUME", "resumeJobId": "<jobId>" }`).

### Playbook D: Developer Feedback / Claim Abuse (`REPEATED_FAILED_CLAIMS` / `UNAVAILABLE_LEAD_CLAIM_SPAM`)
1. **Review Flagged Signals**:
   - Check `GET /api/admin/observability` -> `securityAndAbuse.flaggedAbuseSignals` and `GET /api/admin/analytics/data-quality` for developer feedback anomaly flags.
2. **Human Admin Review**:
   - Note that LeadForge Egypt **never** automatically bans accounts or alters scoring weights from abuse signals.
   - Verify whether the developer is running an automated claiming script or submitting fraudulent invalid-lead reports.
   - If confirmed malicious, suspend the account via `PATCH /api/admin/users` (`status: "SUSPENDED"`).

---

## 5. Post-Incident Review Checklist
1. Preserve `AuditLog` and structured log entries (`requestId` correlation trail) for the incident window.
2. Verify `runDataIntegrityChecks()` returns `healthy: true` and `totalViolations: 0`.
3. Add a deterministic regression test to `tests/phase9-security-performance-reliability.test.ts` reproducing the failure mode.

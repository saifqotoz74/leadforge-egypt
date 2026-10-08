# Incident Response & Security Incident Procedure — LeadForge Egypt

## 1. Severity Levels (Section 35)
- **P0 (Critical Outage / Security-Critical)**: Complete application/database outage, credit ledger corruption, leaked production secret, or unauthorized admin access. Response time: Immediate (< 15 min).
- **P1 (Major Business Functionality Unavailable)**: Claiming leads, authentication, or payment webhook processing failing. Response time: < 30 min.
- **P2 (Significant Degradation)**: Elevated p95 latency, single ingestion collector circuit-broken, or delayed notifications. Response time: < 2 hours.
- **P3 (Minor Issue)**: Non-blocking UI or analytics export issue. Response time: Next business day.

## 2. 9-Step Incident Response Lifecycle
1. **Detect**: Alert triggered in `/api/admin/observability` or health probe failure on `/api/health/ready`.
2. **Assess**: Determine severity (`P0`–`P3`), blast radius, and affected subsystem.
3. **Contain**: Toggle relevant server-side feature flag (`UPDATE_FEATURE_FLAG`) or isolate failing collector/endpoint.
4. **Investigate**: Correlate structured logs using `requestId` and inspect `AuditLog` entries.
5. **Recover**: Roll back release (`docs/production/rollback.md`), restore database (`docs/production/restore.md`), or rotate credentials.
6. **Verify**: Run `runProductionSmokeTests()` and `runDataIntegrityChecks()`.
7. **Communicate**: Notify affected developers via `createInAppNotification` / status update.
8. **Document**: Record timeline, root cause, and impact in post-incident report.
9. **Prevent Recurrence**: Add regression test to `tests/` before closing incident.

## 3. Security Incident Procedures (Section 36)
- **Leaked Secret (`AUTH_SECRET`, `DATABASE_URL`, `PAYMENT_WEBHOOK_SECRET`)**:
  1. Generate new cryptographic secret (>= 32 bytes).
  2. Deploy updated secret to production environment variables.
  3. Call `revokeAllSessions()` to invalidate all existing session tokens.
  4. Audit `AuditLog` for any unauthorized actions during exposure window.
- **Compromised Account / Unauthorized Admin Access**:
  1. Suspend account (`status = 'SUSPENDED'`) and call `revokeAllSessionsForUser(userId)`.
  2. Audit all `AuditLog` and `CreditTransaction` records where `userId` or `actorId` matches.
- **Payment Fraud / Webhook Abuse**:
  1. Disable webhook processing (`payment_webhooks_enabled = false`) if signing secret is compromised.
  2. Rotate `PAYMENT_WEBHOOK_SECRET` and run `reconcilePaymentsWithLedger()`.
- **Malicious Ingestion / SSRF Attempt**:
  1. Disable source (`enabled = false`), quarantine batch in `DeadLetterRecord`, and verify `validateExternalCollectorUrl()` blocked private/loopback IP ranges.

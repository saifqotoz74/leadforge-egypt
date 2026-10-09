# Phase 8 — Data Lineage, Provenance & Retention Policy

## 1. End-to-End Data Lineage (`getLeadDataLineage`)
Every canonical `Lead` in LeadForge Egypt maintains complete, auditable lineage from its initial observation through all subsequent multi-source enrichments:

```
Canonical Lead
  ├── Origin LeadSource (sourceId, source, sourceList)
  ├── Field-Level Provenance (fieldProvenance JSON per attribute)
  ├── Canonical Identity Keys (LeadIdentity rows linked to sourceRecordId)
  ├── SourceRecord Observations (1..N observations across sources)
  │     ├── collectorVersion & contractVersion (INGESTION_CONTRACT_V1)
  │     ├── externalId & SHA-256 content checksum
  │     ├── firstSeenAt, lastSeenAt, fetchedAt
  │     ├── rawData (sanitized & subject to retention policy)
  │     └── normalizedData
  ├── ImportRecord & ImportJob execution trace
  └── LeadMergeHistory (exact fieldChanges & matchedSignals for every merge)
```

Administrators can query the full lineage tree for any lead via:
- `GET /api/admin/ingestion/health?leadId=<leadId>`
- Programmatically via `getLeadDataLineage(prisma, leadId)`

---

## 2. Privacy & Secret Sanitization (`src/lib/collectors/security.ts`)
Before any raw payload or configuration snapshot is written to the database or logs:
1. **Secret Redaction (`redactSensitiveObject`)**: Any key matching `password`, `secret`, `token`, `api_key`, `authorization`, `credential`, `private_key`, `client_secret`, `oauth`, `cookie`, or `session` is replaced with `"[REDACTED]"`.
2. **Personal Data Minimization (`sanitizeRawPayloadForStorage`)**: Unnecessary sensitive personal fields (`national_id`, `passport`, `ssn`, `credit_card`, `bank_account`, `iban`, `home_address`, `birth_date`, `religion`, `political`) are stripped prior to storage. Only business-relevant contact and commercial attributes are retained.

---

## 3. Configurable Data Retention Policy (`applyIngestionRetentionPolicy`)

Default retention windows (`DEFAULT_RETENTION_POLICY`):
- `RAW_SOURCE_PAYLOAD`: **30 days**
- `DEAD_LETTER_RECORD`: **90 days** (for resolved/invalid dead-letters)
- `NORMALIZED_SOURCE_RECORD`: **180 days**
- `INGESTION_METADATA`: **365 days**
- `AUDIT_LOG`: **730 days**

When `applyIngestionRetentionPolicy` runs:
- Expired `SourceRecord.rawData` and `ImportRecord.rawData` payloads are replaced with `{ "redactedByRetentionPolicy": true, "redactedAt": "<ISO>" }` and `rawPayloadRetained` is set to `false`.
- Expired `DeadLetterRecord` rows in terminal states (`RETRIED_RESOLVED`, `PERMANENTLY_INVALID`) are purged.
- **Canonical `Lead` records, `SourceRecord.normalizedData`, `LeadIdentity` keys, `LeadClaim` records, and commercial outcomes are NEVER deleted by raw retention cleanup.**

# Phase 8 — Production-Grade Ingestion Pipeline & Orchestration Architecture

## 1. Overview
LeadForge Egypt's **Phase 8 Ingestion Pipeline** (`src/lib/collectors/orchestrator.ts`) is a 100% deterministic, idempotent, fault-isolated data ingestion engine that transforms raw Egyptian business observations from legal sources into canonical, scored, verified, and match-ready `Lead` entities.

Zero AI, LLM, embeddings, or probabilistic classifiers are used. Every stage is governed by explicit contracts, SHA-256 content checksums, canonical identity locks, and auditable state transitions.

---

## 2. End-to-End Ingestion Lifecycle

Every ingestion job (`ImportJob`) and record (`ImportRecord`) progresses through a strict lifecycle:

1. **Job Initialization & Lock Acquisition (`JOB_INIT`)**
   - Checks `idempotencyKey` on `ImportJob` to prevent duplicate job execution.
   - Evaluates the source's **Circuit Breaker** (`CLOSED`, `OPEN`, `HALF_OPEN`).
   - Acquires a per-source job lock (`acquireSourceJobLock`) to prevent overlapping runs for the same source (`JOB_LOCKED` 409 if already active).
   - Snapshots masked source configuration (`configurationSnapshot`).

2. **Discovery (`DISCOVERED`)**
   - Calls `collector.discover(context)` within source quota limits (`maxRecordsPerRun`, `batchSize`).

3. **Fetch (`FETCHED`)**
   - Calls `collector.fetch(context, discoveredItems)` with per-source rate limiting (`SourceRateLimiter`) and SSRF/timeout enforcement.

4. **Contract Schema Validation (`VALIDATED`)**
   - Calls `collector.normalize(rawItem)` to produce an `IngestionContractRecordV1`.
   - Validates against `IngestionContractRecordSchema` (`src/lib/collectors/contract.ts`).
   - Enforces `requireExternalId` if configured on the source or collector.

5. **Egyptian Field Normalization (`NORMALIZED`)**
   - Normalizes business names, Egyptian phone numbers (`+20...` / `01...`), domains, emails, social URLs, governorates, cities, and business categories via `validateAndNormalizeLead`.
   - Computes a deterministic SHA-256 content checksum (`calculateIngestionChecksum`) excluding volatile timestamps (`fetchedAt`, `updatedAt`).

6. **Canonical Identity & Phase 2 Deduplication (`PROCESSED` / `DUPLICATE`)**
   - Acquires an in-process concurrency lock (`withIdentityConcurrencyLock`) across all canonical identity keys (`PHONE`, `DOMAIN`, `EMAIL`, `FACEBOOK`, `INSTAGRAM`, `NAME_CITY`, `NAME_ADDRESS_CITY`).
   - Checks `(sourceName, externalId)` and `checksum` for fast-path idempotency: if the exact same checksum was already ingested for that canonical lead, the record is marked `DUPLICATE` / `SKIPPED` without mutating lead scores or creating duplicate history.
   - Otherwise, runs Phase 2 deterministic deduplication (`evaluateLeadDeduplication`):
     - `UNIQUE`: Creates a new canonical `Lead`, `LeadIdentity` rows, `SourceRecord`, `LeadVerification` records (Phase 3), and `LeadScore` (Phase 1).
     - `DUPLICATE_CONFIRMED`: Enriches the existing canonical `Lead` safely (`mergeSourceIntoCanonicalLead`), preserves field-level provenance (`fieldProvenance`), and invalidates stale Phase 4 `MatchSnapshot` rows (`isStale: true`).
     - `POSSIBLE_DUPLICATE` / `CONFLICT`: Creates a `DuplicateCandidate` for Admin review without auto-merging conflicting fields.

7. **Retries, Checkpointing & Dead-Letter Queue (`DEAD_LETTER`)**
   - Transient record failures (`SOURCE_TIMEOUT`, `SOURCE_RATE_LIMITED`, `SOURCE_UNAVAILABLE`, `DATABASE_ERROR`) are retried with bounded exponential backoff and deterministic jitter (`executeWithRetry`).
   - At the end of every batch, `ImportJob.checkpoint` is persisted (`cursor`, `offset`, `lastProcessedExternalId`, `batchIndex`, `processedCount`) so interrupted jobs can resume without reprocessing completed batches (`resumeIngestionJob`).
   - Records that exhaust retries are persisted in `DeadLetterRecord` (`status: 'DEAD_LETTER'`) with full failure context (`errorCode`, `failureReason`, `lastError`, `retryCount`, sanitized `rawPayload`).

---

## 3. Stable Error Codes (`IngestionErrorCode`)

| Error Code | Default HTTP Status | Retryable | Description |
| :--- | :---: | :---: | :--- |
| `SOURCE_TIMEOUT` | 504 | Yes | Upstream source or website request timed out |
| `SOURCE_RATE_LIMITED` | 429 | Yes | Upstream returned HTTP 429 or local rate limit hit |
| `SOURCE_UNAVAILABLE` | 503 | Yes | Upstream HTTP 5xx or network connection error |
| `DATABASE_ERROR` | 500 | Yes | Transient database transaction contention |
| `INVALID_SOURCE_CONFIGURATION` | 400 | No | Missing required config or credentials |
| `INVALID_SOURCE_RECORD` | 400 | No | Missing business name or invalid Egyptian contact/location |
| `SCHEMA_VALIDATION_FAILED` | 400 | No | Collector output violated `INGESTION_CONTRACT_V1` |
| `NORMALIZATION_FAILED` | 400 | No | Record failed deterministic normalization |
| `IDENTITY_CONFLICT` | 409 | No | Conflicting identity signals flagged for admin review |
| `DUPLICATE_RECORD` | 409 | No | Confirmed duplicate record |
| `RETRY_EXHAUSTED` | 500 | No | All retry attempts exhausted |
| `POLICY_RESTRICTION` | 403 | No | Disabled source, robot policy, or permanent invalidation |
| `CIRCUIT_OPEN` | 503 | No | Source circuit breaker is `OPEN` during cooldown |
| `JOB_LOCKED` | 409 | No | Another ingestion job is already active for this source |
| `JOB_CANCELLED` | 409 | No | Job was cooperatively cancelled by an Administrator |
| `QUOTA_EXCEEDED` | 429 | No | CSV/payload size or per-run record quota exceeded |
| `SSRF_BLOCKED` | 403 | No | Blocked private IP, localhost, metadata host, or scheme |

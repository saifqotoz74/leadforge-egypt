# LeadForge Egypt — Performance Architecture & Optimization Guide (`docs/performance.md`)

## 1. Performance Design Goals
LeadForge Egypt is engineered for predictable, low-latency response times and bounded memory usage under concurrent marketplace and ingestion workloads:
- **Zero Unbounded Queries**: Every list and admin endpoint enforces pagination limits (`take` / `pageSize` capped at 100–500 rows).
- **Zero N+1 Query Loops on Hot Paths**: Batch aggregations (`groupBy`), preloaded lookup maps, and single-pass evaluations replace per-row database queries.
- **Comprehensive Composite Indexing**: All high-frequency filter, sort, deduplication, claim, and analytics columns are backed by PostgreSQL B-Tree and partial indexes.
- **Tenant-Isolated Short-TTL Caching**: Frequently read configurations and scoped summaries use `TenantAwareCache` (`src/lib/observability/cache.ts`) with strict tenant key isolation and deterministic invalidation.

---

## 2. Database Indexing Architecture (`prisma/schema.prisma` & `src/lib/db.ts`)

### Lead Discovery, Deduplication & Marketplace Indexes
- `Lead_saleabilityStatus_isCanonical_status_idx` (`saleabilityStatus`, `isCanonical`, `status`) — Accelerates marketplace browsing and matching candidate selection.
- `Lead_availableForClaim_status_saleabilityStatus_idx` (`availableForClaim`, `status`, `saleabilityStatus`) — Accelerates claimable lead queries.
- `Lead_accessType_availableForClaim_idx` (`accessType`, `availableForClaim`) — Filters Shared vs. Exclusive available inventory.
- `Lead_normalizedPhone_idx`, `Lead_normalizedSecondaryPhone_idx`, `Lead_normalizedDomain_idx`, `Lead_normalizedEmail_idx`, `Lead_normalizedName_city_idx` — Accelerates Phase 2 deterministic deduplication lookups without full-table scans.
- `Lead_score_idx`, `Lead_qualityScore_idx`, `Lead_qualityStatus_idx`, `Lead_freshnessStatus_idx`, `Lead_verificationStatus_idx`, `Lead_createdAt_idx` — Accelerates sorting and band filtering.

### Claims, Credits & Financial Ledger Indexes
- `LeadClaim_exclusive_active_leadId_key` — Partial unique index (`ON "LeadClaim"("leadId") WHERE "status" = 'ACTIVE' AND "accessType" = 'EXCLUSIVE'`) enforcing exclusive ownership at the database engine level in $O(\log N)$ time.
- `LeadClaim_userId_idempotencyKey_key` & `CreditTransaction_developerId_idempotencyKey_key` — Enforces $O(\log N)$ idempotency key lookups.
- `LeadClaim_leadId_status_idx` & `LeadClaim_userId_status_idx` — Accelerates active claim checks and developer pipeline views.
- `CreditTransaction_developerId_createdAt_idx` & `CreditTransaction_accountId_idx` — Accelerates credit history pagination and ledger reconciliation.

### Matching, Engagement & Analytics Indexes
- `MatchSnapshot_leadId_developerId_matchVersion_key` (Unique)
- `MatchSnapshot_developerId_eligible_matchStrength_idx` & `MatchSnapshot_leadId_eligible_matchStrength_idx` — Accelerates developer feed ranking and lead-to-developer ranking.
- `LeadEngagement_developerId_currentStatus_idx`, `LeadEngagement_claimedAt_idx`, `LeadEngagement_wonAt_idx`, `LeadEngagement_finalOutcome_idx` — Accelerates sales funnel and cohort analytics.
- `DailyMetricSnapshot_dateKey_metric_dimension_dimensionValue_version_key` — Supports fast materialized daily metric queries.

### Ingestion & Source Provenance Indexes
- `SourceRecord_sourceName_externalId_idx`, `SourceRecord_checksum_idx`, `SourceRecord_importJobId_idx` — Accelerates incremental collector deduplication (`SKIP_UNCHANGED` via SHA-256 checksum).
- `ImportJob_sourceId_status_idx`, `ImportJob_idempotencyKey_idx`, `DeadLetterRecord_status_idx`.

---

## 3. N+1 Query Prevention & Query Projection
1. **Batch Credit Ledger Reconciliation (`getAdminCreditsOverview` in `src/lib/claims/service.ts`)**:
   - Instead of executing `reconcileCreditAccount` in a loop ($2N$ queries for $N$ developer accounts), executes a single `prisma.creditTransaction.groupBy({ by: ['accountId'], where: { accountId: { in: accountIds } }, _sum: { amount: true }, _count: { id: true } })` query ($O(1)$ queries).
2. **Scoring & Matching Context Preloading**:
   - `loadScoringContext` and `getActiveMatchingConfigAndRules` load active rules and configurations in a single parallel batch before evaluating lead batches.
3. **Select Projection**:
   - Endpoints project only required scalar and relation columns (e.g., `select: { id: true, name: true, email: true, role: true, status: true }` on `User` queries, never loading `passwordHash` or large raw payloads into list responses).
4. **Pagination & Sorting Safeguards**:
   - All list endpoints (`GET /api/leads`, `GET /api/admin/leads`, `GET /api/admin/users`, `GET /api/admin/claims`, `GET /api/admin/credits`, `GET /api/admin/analytics/**`) enforce bounded `pageSize` / `take` caps and validate sort fields against explicit allowlists.

---

## 4. Tenant-Isolated Caching Strategy (`src/lib/observability/cache.ts`)
- **`TenantAwareCache`** partitions cached entries into three strict scopes:
  - `GLOBAL:<namespace>:<subKey>` — For non-tenant system configurations (plans, scoring/matching/quality configs).
  - `ADMIN:<namespace>:<subKey>` — For admin-only aggregate views; inaccessible to `DEVELOPER` role callers.
  - `TENANT:<developerId>:<namespace>:<subKey>` — For developer-specific data; embeds `tenantDeveloperId` inside the cache entry and verifies `entry.tenantDeveloperId === caller.developerId` on every read.
- **Deterministic Invalidation**:
  - Cache entries expire automatically via short TTLs (15–30s) and can be explicitly invalidated by namespace (`invalidateByNamespace`), tenant (`invalidateTenant`), or globally (`clearAll` via `POST /api/admin/observability`).

---

## 5. Slow Query Detection & Memory Safety
- **Slow Query Detector (`recordQueryExecution`, `withSlowQueryTracking` in `src/lib/observability/metrics.ts`)**:
  - Tracks query execution durations against `slowQueryDurationThresholdMs` (default `250ms`, configurable via Admin Observability API).
  - Emits a redacted `WARN` structured log (`SLOW_QUERY_DETECTED`) and records the event in a bounded ring buffer (`MAX_SLOW_QUERIES = 200`) for admin inspection and alerting (`SLOW_QUERY_SPIKE`).
- **Bounded Ring Buffers & Batch Ingestion**:
  - In-memory log, metric, slow-query, and abuse-signal buffers use strict FIFO caps (`200`–`1,000` entries) to prevent memory leaks.
  - `runIngestionPipeline` processes records in bounded batches (`batchSize` capped at `500`, `maxRecordsPerRun` quota enforced) with per-batch checkpoint persistence.

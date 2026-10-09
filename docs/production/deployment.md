# Production Deployment Guide — LeadForge Egypt

## 1. Architecture & Hosting Model
- **Application Runtime**: Next.js 14.2.35 App Router (Node.js 20 LTS).
- **Database**: Managed PostgreSQL 15+ (`USE_EXTERNAL_PG="true"` in staging/production). Embedded PGlite (`USE_EXTERNAL_PG="false"`) is strictly restricted to local development and automated test suites.
- **Session & Auth**: Stateless HMAC-SHA256 signed `HttpOnly` cookies (`leadforge_session`) with server-side revocation support (`src/lib/auth.ts`).

## 2. Pre-Deployment Verification Steps
1. **Validate Environment Configuration**:
   Execute `validateEnvironmentConfiguration(process.env, { enforceProductionRules: true })` from `src/lib/production/env-validator.ts`. Verify `status === "VALID"` and `summary.criticalErrors === 0`.
2. **Pre-Migration Logical & Physical Backup**:
   Trigger a managed PostgreSQL snapshot and run `createLogicalBackupSnapshot()` (`src/lib/production/backup-restore.ts`), recording the `backupId` and `checksumSha256`.
3. **Classify Pending Database Migrations**:
   Run `classifySqlMigrationSafety(sql)` (`src/lib/production/database-ops.ts`). If `classification === "DANGEROUS"`, block automated deployment and follow the expand-and-contract staged migration protocol in `docs/production/database.md`.
4. **Verify Clean Build & Test Suite**:
   ```bash
   npm ci
   npm run db:generate
   npm run typecheck
   npm test
   NODE_ENV=production npm run build
   ```

## 3. Zero/Minimal-Downtime Deployment Sequence
1. Build immutable release artifact (`npm run build`).
2. Verify all migrations are backwards-compatible (`SAFE` classification: additive nullable columns, new tables, or non-blocking indexes).
3. Apply database migrations (`npx prisma migrate deploy` via `npm run db:migrate`).
4. Deploy new application instances alongside existing instances.
5. Poll `GET /api/health/ready` (`src/app/api/health/ready/route.ts`) until `status === "READY"` (`HTTP 200`).
6. Execute automated non-destructive post-deployment smoke tests (`runProductionSmokeTests()` or `POST /api/admin/observability` with `action: "RUN_SMOKE_TESTS"`).
7. Shift load balancer traffic to the new instances and drain old instances via `initiateGracefulShutdown()` (`src/lib/observability/shutdown.ts`).
8. Monitor error rates, latency p95, and alert state for the first 30 minutes.

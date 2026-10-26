# LeadForge Egypt — Production Release Checklist

This runbook specifies the step-by-step pre-flight and release verification protocol required before promoting any build to staging or production environments.

---

## Pre-Flight Automation Gates (Must Pass 100%)

Every release candidate build must pass all automated conformance and test checks locally and in CI before any deployment action is initiated:

- [ ] **Design Conformance:** `npm run check:design`
  - Exit code: `0`
  - Total violations: `0` in `0` files.
  - Zero arbitrary brackets, zero raw palette utilities, zero physical direction classes.
- [ ] **Internationalization Parity:** `npm run check:i18n`
  - Exit code: `0`
  - Exact 100% key parity between `src/messages/ar.json` and `src/messages/en.json` (1,802 keys).
  - Valid ICU syntax, zero Latin leaks in Arabic catalog.
- [ ] **Static Type Checking:** `npm run typecheck`
  - Exit code: `0`
  - `tsc --noEmit` with zero errors.
- [ ] **Automated Test Suite:** `npm test`
  - Exit code: `0`
  - All 36 test files passing (436+ tests).
  - Concurrency, race-condition, ledger balance, deduplication, and rate-limiting tests passing.
- [ ] **Production Next.js Build:** `npm run build`
  - Exit code: `0`
  - Prisma Client generation successful.
  - 52/52 application and API routes successfully compiled.

---

## 1. Database & Schema Safety Protocol

- [ ] **Schema-First Audit:** Compare `prisma/schema.prisma` against target environment schema.
  - Do not apply unreviewed DDL directly to production.
  - Run `npx prisma migrate diff` to inspect proposed migration SQL.
- [ ] **Destructive DDL Classification:** Execute `classifySqlMigrationSafety` check:
  - Verify that no `DROP TABLE`, `DROP COLUMN`, or unsafe type alterations occur on active tables.
  - If hazardous statements exist, require explicit approval (`ALLOW_DANGEROUS_MIGRATION=true`).
- [ ] **Email Verification Column Safety:**
  - Verify migration does not automatically grant `emailVerified` to legacy or unverified accounts.
  - Lead claiming requires actual verified email status.
- [ ] **Pre-Migration Backup:**
  - Take a logical snapshot/dump of the production PostgreSQL database.
  - Verify backup checksum (`SHA-256`) and ensure recovery procedures are tested.
- [ ] **Database Connection Settings:**
  - In staging/production, ensure `USE_EXTERNAL_PG="true"`.
  - Connect via IPv4 transaction pooler (e.g. Supabase port 6543 with `?pgbouncer=true`).
  - Set `DB_POOL_MAX` (typically 10–20 depending on tier) and `DB_CONNECT_TIMEOUT_MS=10000`.

---

## 2. Environment Configuration & Secret Audits

Ensure all environment variables in production are populated and adhere to security constraints:

| Variable | Requirement | Verified |
| :--- | :--- | :---: |
| `NODE_ENV` | Must be `production` | [ ] |
| `APP_URL` | Canonical production domain (e.g. `https://leads4dev.com`) | [ ] |
| `NEXT_PUBLIC_APP_URL` | Matches canonical production domain | [ ] |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed web origins | [ ] |
| `AUTH_SECRET` | Cryptographically random string >= 32 characters | [ ] |
| `SESSION_TTL_SECONDS` | Session duration in seconds (e.g. `604800` = 7 days) | [ ] |
| `CRON_SECRET` | Secret token guarding internal cron and scraper endpoints | [ ] |
| `USE_EXTERNAL_PG` | Must be `true` | [ ] |
| `DATABASE_URL` | Sanitized pooling connection string with SSL enabled | [ ] |
| `EMAIL_PROVIDER` | `resend` or `smtp` | [ ] |
| `EMAIL_API_KEY` | Production API key for transactional email provider | [ ] |
| `EMAIL_FROM` | Verified sender (e.g. `Leads4dev <notifications@leads4dev.com>`) | [ ] |
| `PAYMENT_MODE` | `transfer` (or live provider once keys are provisioned) | [ ] |
| `PAYMENT_WEBHOOK_SECRET`| Secret used to verify incoming payment webhook signatures | [ ] |

---

## 3. Post-Deployment Smoke Verification

Immediately following deployment to staging/production, execute the following manual and API verifications:

### 3.1 Health & Connectivity
- [ ] Query `GET /api/health` -> returns HTTP 200 with database status `healthy`.
- [ ] Query `GET /api/health/live` -> returns HTTP 200 `OK`.
- [ ] Query `GET /api/health/ready` -> returns HTTP 200 with cache and DB readiness.

### 3.2 UI, Layout & RTL Conformance
- [ ] Load landing page `/` in Arabic (`ar`) -> layout renders RTL, typography uses IBM Plex Sans Arabic.
- [ ] Toggle to English (`/en` or locale switch) -> layout transitions cleanly to LTR.
- [ ] Verify phone numbers, prices, and stats are formatted with Western digits (`tabular-nums`) and isolated in `.ltr-iso`.
- [ ] Verify no AI sparkles, magic wands, or unexplainable scores appear on any screen.

### 3.3 Critical Business Flow Smoke Test
- [ ] **Registration & Verification:**
  - Register a new developer account.
  - Verify receipt of verification email with trusted URL origin.
  - Click token link and verify account transitions to verified status.
- [ ] **Lead Claiming:**
  - Sign in as verified developer with available credits.
  - Claim an available lead.
  - Verify atomic deduction on credit ledger and immediate unlock of contact phone/email.
- [ ] **Feedback & State Machine:**
  - Update lead engagement status to `CONTACTED` -> verify activity timeline records entry.
- [ ] **Admin Console:**
  - Sign in as admin.
  - Review `/admin/payments` and verify receipt preview modal works without layout overflow.

---

## 4. Rollback & Emergency Protocol

If any critical invariant fails during or immediately after release:

1. **Traffic Reversion:**
   - Instantly switch routing at edge / reverse proxy (Vercel / Cloudflare) to the previously verified release hash.
2. **Database Rollback:**
   - If a non-breaking additive migration was run, leave schema in place (backward compatible).
   - If destructive schema changes occurred, restore from pre-migration logical snapshot.
3. **Session & Security Revocation:**
   - If credential leakage is suspected, increment `sessionsRevokedBefore` timestamp for affected users or rotate `AUTH_SECRET`.
4. **Post-Mortem:**
   - Record all timestamps, error logs, and metrics in `docs/incident-response.md`.

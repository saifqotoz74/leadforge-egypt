# Production Environment Separation & Configuration — LeadForge Egypt

## 1. Environment Tiers
LeadForge Egypt enforces strict separation across four tiers via `resolveEnvironmentTier()` (`src/lib/production/env-validator.ts`):
- `development`: Local developer workspace (`USE_EXTERNAL_PG="false"` permitted, `EMAIL_PROVIDER="CONSOLE"` permitted).
- `test`: Automated Vitest execution with isolated in-memory PGlite instances (`createInMemoryTestDb()`).
- `staging`: Pre-production verification environment (`USE_EXTERNAL_PG="true"`, `https://` URLs, test payment credentials).
- `production`: Live customer-facing environment (`USE_EXTERNAL_PG="true"`, `https://` non-localhost URLs, strong `AUTH_SECRET`, `ALLOW_PRODUCTION_SEED="false"`, `DEBUG="false"`).

## 2. Classified Environment Variables (`ENVIRONMENT_VARIABLE_CATALOG`)
| Category | Variable | Required in Prod | Secret | Validation Rule |
|---|---|---|---|---|
| Application | `NODE_ENV` | Yes | No | Must be `production` |
| Application | `APP_ENV` | No | No | `production` / `staging` / `development` / `test` |
| Application | `APP_URL` | Yes | No | Must use `https://` and non-localhost domain |
| Application | `API_URL` | No | No | If set, must use `https://` and non-localhost domain |
| Application | `ALLOWED_ORIGINS` | No | No | Comma-separated explicit `https://` origins (no `*` or `localhost`) |
| Application | `DEBUG` | No | No | Must be `false` or unset in production |
| Application | `ALLOW_PRODUCTION_SEED` | No | No | Must be `false` or unset in production |
| Database | `DATABASE_URL` | Yes | Yes | `postgresql://` non-localhost URL; no dev/test DB names |
| Database | `USE_EXTERNAL_PG` | Yes | No | Must be `"true"` in staging/production |
| Authentication | `AUTH_SECRET` | Yes | Yes | >= 32 characters, high entropy, non-default |
| Payment | `PAYMENT_ENABLED` | No | No | `true` or `false` |
| Payment | `PAYMENT_MODE` | Conditional | No | Must be `LIVE` when `PAYMENT_ENABLED="true"` in production |
| Payment | `PAYMENT_PUBLIC_KEY` | Conditional | No | Required when `PAYMENT_ENABLED="true"`; no `pk_test_` |
| Payment | `PAYMENT_SECRET_KEY` | Conditional | Yes | Required when `PAYMENT_ENABLED="true"`; no `sk_test_` |
| Payment | `PAYMENT_WEBHOOK_SECRET` | Conditional | Yes | >= 24 chars when `PAYMENT_ENABLED="true"` |
| Email | `EMAIL_PROVIDER` | Yes | No | `SMTP`, `API`, or `DISABLED` (`CONSOLE`/`FAKE` forbidden in prod) |
| Email | `EMAIL_FROM` | Yes | No | Valid email address; no `@localhost` or `@example.com` |
| Collectors | `COLLECTORS_ENABLED` | No | No | `false` by default until `COLLECTOR_ALLOWED_SOURCES` is set |
| Observability | `LOG_LEVEL` | No | No | `info` or `warn` recommended in production |

## 3. Fail-Fast Validation & Secret Redaction
- `assertProductionEnvironmentValid()` throws `ENVIRONMENT_VALIDATION_FAILED` listing only variable names and error codes—never printing secret values.
- `buildRedactedEnvSnapshot()` replaces all secret values with `<REDACTED>`.

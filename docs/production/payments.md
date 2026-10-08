# Payments & Webhook Production Readiness — LeadForge Egypt

## 1. Payment Provider Abstraction (`src/lib/payment/provider.ts`)
- `PaymentProvider` interface decouples subscription billing from any single gateway.
- `SandboxPaymentProvider` is used in `development`/`test` environments.
- In `production`, when `PAYMENT_ENABLED="true"`, `validateEnvironmentConfiguration()` enforces `PAYMENT_MODE="LIVE"` and rejects test/sandbox keys (`sk_test_`, `pk_test_`) and weak or missing `PAYMENT_WEBHOOK_SECRET`.

## 2. Webhook Endpoint & HMAC Verification (`POST /api/webhooks/payment`)
Implemented in `src/app/api/webhooks/payment/route.ts` and `src/lib/payment/provider.ts`:
- **Signature Verification (`verifyPaymentWebhookSignature`)**:
  - Computes HMAC-SHA256 over `${timestampSeconds}.${rawBody}` using `PAYMENT_WEBHOOK_SECRET`.
  - Compares digests using `crypto.timingSafeEqual` to prevent timing side-channel attacks.
  - Enforces a replay tolerance window (`maxSkewSeconds = 300`).
- **Supported Events (`SupportedWebhookEventType`)**:
  - `payment.ping`: Connectivity/signature verification probe (no database mutation).
  - `payment.succeeded`: Creates/updates `Payment` (`COMPLETED`), activates `Subscription`, and grants credits in `DeveloperCreditAccount` + `CreditTransaction` inside a single atomic transaction.
  - `payment.failed` / `payment.cancelled`: Records terminal `FAILED` / `CANCELLED` payment state without granting credits.
  - `payment.refunded`: Marks payment `REFUNDED`, cancels subscription, and reverses remaining unspent credits up to `account.balance` (never violating the non-negative balance invariant).
  - `subscription.renewed` / `subscription.expired`: Updates subscription lifecycle state.

## 3. Idempotency & Out-of-Order Guarantees (Section 22)
- Duplicate webhook deliveries (matching `eventId` or `providerRef`) return `200 OK` with `code: "IDEMPOTENT_DUPLICATE"`, `idempotentReplay: true`, and `creditsGranted: 0`. Credits are **never** granted twice.
- Out-of-order webhooks (e.g., delayed `payment.succeeded` arriving after `payment.refunded` or `payment.cancelled`, or `payment.failed` arriving after `payment.succeeded`) return `200 OK` with `code: "OUT_OF_ORDER_IGNORED"` without corrupting terminal states.

## 4. Payment-to-Ledger Reconciliation (`reconcilePaymentsWithLedger`)
Verifies that every `COMPLETED` payment has a corresponding `PURCHASE` `CreditTransaction` and that zero `FAILED` or `CANCELLED` payments granted credits.

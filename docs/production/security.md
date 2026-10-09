# Production Security, Authorization & Privacy Controls — LeadForge Egypt

## 1. Authentication Hardening (Section 19)
- Passwords hashed with `bcryptjs` (cost factor 10).
- Sessions signed with HMAC-SHA256 (`jose` `HS256`) using `AUTH_SECRET` (>= 32 chars required in production).
- Cookies set with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production (`NODE_ENV === "production"`).
- Server-side session revocation (`revokeSessionToken`, `revokeAllSessionsForUser`, `revokeAllSessions`) immediately invalidates compromised or logged-out tokens.
- Account enumeration protection returns uniform generic error messages on login failures.

## 2. Endpoint-by-Endpoint Authorization & IDOR Prevention (Section 20)
- Every `/api/admin/**` route enforces `requireAdmin(req)` (`role === "ADMIN"` and `status === "ACTIVE"`).
- Every `/api/developer/**` route enforces `requireAuth(req)` and rejects cross-tenant `developerId` or `userId` query/body parameters with `403 FORBIDDEN`.
- Unclaimed leads on `/api/leads` and `/api/leads/[id]` redact private business contact fields (`phone`, `email`, `address`, social links) via `redactLeadForDeveloper()` until the developer holds an active `LeadClaim`.
- State-changing endpoints (`POST`, `PATCH`, `PUT`, `DELETE`) enforce CSRF origin verification (`verifyCsrfOrigin()`).

## 3. Input Validation, SSRF & CSV Formula Injection Protection
- Zod schema validation on all API inputs.
- CSV uploads sanitize spreadsheet formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) via `sanitizeCsvFormulaCell()`.
- External collector URLs are validated against SSRF private/loopback IP ranges (`validateExternalCollectorUrl()`).
- Public error handler (`formatPublicErrorResponse()`) strips stack traces, SQL errors, file paths, and connection strings from client responses.

## 4. User Data Controls & Privacy (Sections 30 & 31)
- **Personal Data Export**: `GET /api/developer/profile?export=true` exports all account, profile, subscription, credit ledger, claim, engagement, feedback, and notification records owned by the authenticated developer.
- **Controlled Account Deletion**: `DELETE /api/developer/profile` anonymizes PII (`email`, `name`, `phone`, `companyName`, `bio`), suspends the account, cancels active subscriptions, and revokes all sessions while preserving immutable financial (`CreditTransaction`, `Payment`), `LeadClaim`, and `AuditLog` records.

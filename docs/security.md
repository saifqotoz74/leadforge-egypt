# LeadForge Egypt — Security Architecture & Controls (`docs/security.md`)

## 1. Overview & Security Principles
LeadForge Egypt enforces a **deterministic, defense-in-depth security model** across all API routes, background pipelines, database transactions, and multi-tenant data boundaries. No AI, ML, LLM, or probabilistic security mechanisms are used; all security controls are rule-based, auditable, and verified by automated security tests.

Core principles:
1. **Least Privilege & Zero Trust**: Every request is authenticated and authorized on the server; client-supplied role, ownership, credit balance, and pricing parameters are untrusted.
2. **Strict Tenant Isolation**: Developer A can never view, claim, modify, or read cached data belonging to Developer B.
3. **Privacy-by-Default Lead Redaction**: Unclaimed lead contact bundles (`phone`, `secondaryPhone`, `phones`, `email`, `fullAddress`, `facebook`, `instagram`, `googleMapsUrl`) are masked at the server boundary (`formatLeadForResponse`) until an active `LeadClaim` exists for the requesting developer.
4. **Atomic Financial Integrity**: All lead claims, credit deductions, refunds, and admin adjustments execute inside database transactions with deterministic lock ordering and database `CHECK` + `UNIQUE` constraints.
5. **Defense Against SSRF, Injection, XSS, CSRF, and Mass Assignment**: Enforced at schema, network, and application layers.

---

## 2. Authentication & Session Security
- **Password Hashing**: Passwords are hashed using `bcryptjs` with a minimum cost factor of `10` (`hashPassword`, `verifyPassword` in `src/lib/auth.ts`). Raw passwords are never stored or logged.
- **Session Tokens**: Signed HS256 JWTs (`jose`) with strict expiration (`7d`) and audience/claim validation (`verifySessionToken`).
- **Cookie Hardening**:
  - `HttpOnly: true` (prevents JavaScript/XSS access to session cookies)
  - `SameSite: 'lax'` (mitigates cross-site request forgery)
  - `Secure: true` in production (`NODE_ENV === 'production'`)
  - `Path: '/'`
- **Account Status Enforcement**: `getCurrentUser` verifies the user exists in PostgreSQL and `status !== 'SUSPENDED'` on every authenticated request. Suspended accounts are immediately denied (`401`/`403`) even if their JWT has not yet expired.
- **Logout Invalidation**: `POST /api/auth/logout` verifies CSRF origin and clears the `leadforge_session` cookie.

---

## 3. Role-Based Access Control (RBAC) & Tenant Isolation (IDOR Prevention)
- **Roles**:
  - `DEVELOPER`: Can browse marketplace leads (with masked contact data), preview/claim eligible leads, view own claimed leads, manage own profile, submit feedback/outcomes on own claims, and view own analytics/credits.
  - `ADMIN`: Full access to `/api/admin/**` routes, rule management, ingestion orchestration, duplicate resolution, credit adjustments, refunds, and operational observability.
- **Server-Side Ownership Checks**:
  - `LeadClaim`, `LeadEngagement`, `ContactAttempt`, `LeadFeedback`: Verified against `claim.userId === user.id || claim.developerId === user.id`.
  - `DeveloperCreditAccount` & `CreditTransaction`: Scoped strictly by `developerId: user.id` for non-admin callers.
  - `MatchSnapshot` & `/api/matching/**`: Non-admin developers can only query `developerId === user.id` (or `'me'`), and cannot pass `?persist=true` on GET endpoints.
  - `DeveloperAnalytics`: `GET /api/developer/analytics` derives `developerId` exclusively from `requireAuth(req).id`, ignoring any query parameter `developerId` override.

---

## 4. Input Validation & Mass Assignment Prevention
- **Schema Validation**: All inputs are validated via `zod` schemas or explicit type/enum allowlists (`VALID_USER_STATUSES`, `VALID_AVAILABILITY_STATUSES`, `VALID_QUALITY_STATUSES`, etc.).
- **Mass Assignment Protection**:
  - `PATCH /api/developer/profile` uses a strict field allowlist (`companyName`, `bio`, `services`, `preferredServices`, `excludedServices`, `niches`, `preferredNiches`, `excludedNiches`, `locations`, `supportedGovernorates`, `supportedCities`, `supportedDistricts`, `preferredCities`, `excludedLocations`, `minBudget`, `maxBudget`, `preferredMinBudget`, `preferredMaxBudget`, `leadType`, `supportedLeadTypes`, `preferredLeadTypes`, `excludedLeadTypes`, `isAcceptingLeads`, `maxActiveLeads`, `portfolioUrl`, `whatsappPhone`).
  - Privileged fields (`id`, `role`, `passwordHash`, `balance`, `reservedBalance`, `creditsCharged`, `creditsRefunded`, `exclusiveClaimedById`, `isCanonical`) are stripped/rejected (`detectForbiddenFieldsInPayload` in `src/lib/security/headers.ts`).

---

## 5. CSRF, CORS, and HTTP Security Headers
- **CSRF Protection (`verifyCsrfOrigin` in `src/lib/auth.ts`)**:
  - Enforced on all state-changing routes (`POST`, `PATCH`, `PUT`, `DELETE`).
  - Validates the `Origin` header against the expected `Host` / `X-Forwarded-Host`.
  - Rejects `Origin: null` (sandboxed iframe / data URI attacks).
  - Falls back to validating `Referer` host when `Origin` is absent.
- **Security Headers (`next.config.mjs` & `src/lib/security/headers.ts`)**:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
  - `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options`: `nosniff`
  - `X-Frame-Options`: `DENY`
  - `Referrer-Policy`: `strict-origin-when-cross-origin`
  - `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- **CORS (`validateCorsOrigin`, `buildCorsHeaders`)**:
  - Only explicitly approved origins are permitted; wildcard `*` is never combined with `Access-Control-Allow-Credentials: true`.

---

## 6. SSRF Protection (`src/lib/collectors/security.ts`, `src/lib/website-analyzer.ts`)
All outbound HTTP requests (website collector, directory collector, live website verification probe, and website analyzer) enforce multi-layer SSRF protection:
1. **Protocol Allowlist**: Only `http:` and `https:` are permitted (`file:`, `ftp:`, `gopher:`, `data:`, `javascript:`, `dict:`, `ws:` are blocked).
2. **Hostname & IP Range Blocking (`isPrivateOrReservedIp`, `validateSafeExternalUrl`)**:
   - Blocks `localhost`, `.local`, `.internal`, `.lan`, `.corp`, `.svc.cluster.local`, single-label hosts (`http://redis/`), and embedded credentials (`http://user:pass@host`).
   - Blocks IPv4 loopback (`127.0.0.0/8`), current network (`0.0.0.0/8`), RFC1918 private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), CGNAT/Alibaba metadata (`100.64.0.0/10`, `100.100.100.200`), link-local & cloud metadata (`169.254.0.0/16`, `169.254.169.254`), multicast/reserved (`224.0.0.0/4`, `240.0.0.0/4`), and integer/hex IP encodings.
   - Blocks IPv6 loopback (`::1`), unspecified (`::`), unique local (`fc00::/7`), link-local (`fe80::/10`), multicast (`ff00::/8`), and IPv4-mapped IPv6 (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`, `::ffff:7f00:1`).
3. **Post-DNS Resolution Validation (`assertSafeExternalUrlWithDns`)**:
   - Resolves the hostname via DNS and verifies every returned A/AAAA record against `isPrivateOrReservedIp` before connecting, preventing DNS rebinding attacks.
4. **Hop-by-Hop Redirect Revalidation (`safeExternalFetch`)**:
   - Follows redirects manually (`redirect: 'manual'`, max 3 hops) and re-runs `assertSafeExternalUrlWithDns` on every `Location` target.
5. **Bounded Timeouts & Response Sizes**:
   - Enforces `AbortController` timeouts (default 4–5s) and response size caps (`512 KB`).

---

## 7. File Upload & CSV Formula Injection Security
- **Upload Safety (`validateImportUploadSafety` in `src/lib/security/headers.ts`)**:
  - Blocks executable and active script extensions (`.exe`, `.dll`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.js`, `.php`, `.py`, `.html`, `.svg`, `.xml`, etc.) and path traversal (`..`, `/`, `\`, `\0`).
  - Enforces maximum file size (`5 MB`), row limit (`5,000`–`10,000` rows), column limit (`50`), and cell length limit (`2,000` chars).
- **CSV Formula Injection Neutralization**:
  - On **Import**: `sanitizeSpreadsheetFormula` strips leading `=`, `+`, `-`, `@`, `\t`, `\r` formula triggers from untrusted cells while preserving valid `+20...` phone numbers.
  - On **Export**: `escapeCsvCell` / `sanitizeCsvExportCell` prefixes any cell starting with `=`, `+`, `-`, `@`, `\t`, `\r` (including leading whitespace before formula characters) with a single quote `'` and properly escapes quotes/commas.

---

## 8. Layered Rate Limiting & Deterministic Abuse Protection
- **Rate Limiting (`src/lib/rate-limit.ts`)**:
  - Applied per IP and per authenticated user across login, registration, lead claiming, feedback submission, engagement updates, contact attempts, matching previews, batch verification, CSV import, and analytics CSV export.
- **Deterministic Abuse Signals (`src/lib/security/abuse-detection.ts`)**:
  - Tracks `REPEATED_AUTH_FAILURES`, `REPEATED_FAILED_CLAIMS`, `UNAVAILABLE_LEAD_CLAIM_SPAM`, `EXCESSIVE_PREVIEW_REQUESTS`, `EXCESSIVE_EXPORT_REQUESTS`, `EXCESSIVE_INGESTION_TRIGGERS`, `IDOR_PROBE_DETECTED`, `SSRF_ATTEMPT_BLOCKED`, and `MASS_ASSIGNMENT_ATTEMPT`.
  - When a threshold is crossed, emits a structured `SECURITY` log, writes an `AuditLog` record (`SECURITY_ABUSE_SIGNAL_FLAGGED`), and surfaces an alert on the Admin Operational Observability Dashboard. Users are **never** permanently auto-banned without human admin review.

---

## 9. Error Taxonomy, Secret Management, & Log Redaction
- **Standardized Error Taxonomy (`src/lib/security/error-taxonomy.ts`)**:
  - `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INSUFFICIENT_CREDITS`, `LEAD_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`.
- **Redaction (`redactSensitiveData`)**:
  - Automatically scrubs `password`, `passwordHash`, `secret`, `token`, `apiKey`, `authorization`, `cookie`, `jwt`, stack traces, raw SQL fragments, connection strings, and internal filesystem paths from both API error responses and structured logs.

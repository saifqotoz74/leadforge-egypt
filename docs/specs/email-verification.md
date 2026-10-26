# Specification: Email Verification Subsystem (SEC-03)

> **Document Status:** PROPOSAL / SPECIFICATION ONLY  
> **Mode:** STRICTLY READ-ONLY (Zero code, database, or schema modifications applied)  
> **Target Release:** Phase 4A Implementation  
> **Author:** Antigravity / Engineering Team  
> **Awaiting:** Product Owner Written Approval  

---

## 1. Context & Problem Statement

In Phase 3, lead unlocking was gated behind user email verification:
- [`src/app/api/auth/register/route.ts`](file:///E:/Antigravity%20Projects/Leads/src/app/api/auth/register/route.ts#L98) explicitly persists `emailVerified: null`.
- [`src/app/api/leads/[id]/claim/route.ts`](file:///E:/Antigravity%20Projects/Leads/src/app/api/leads/%5Bid%5D/claim/route.ts#L31) and [`src/lib/claims/service.ts`](file:///E:/Antigravity%20Projects/Leads/src/lib/claims/service.ts#L213) check `!user.emailVerified` and reject requests with HTTP 403 `EMAIL_NOT_VERIFIED`.

However, the application currently lacks:
1. Any verification token generation or storage model.
2. A verification dispatch or resend endpoint.
3. A verification confirmation endpoint (e.g. `/api/auth/verify-email`).
4. Email delivery templates with an actionable activation link.
5. User interface banners, resend cooldown timers, or verify landing pages.

As a result, newly registered users are permanently locked out of unlocking leads.

Furthermore, [`prisma/migrations/0003_add_user_email_verified/migration.sql`](file:///E:/Antigravity%20Projects/Leads/prisma/migrations/0003_add_user_email_verified/migration.sql#L2) introduced `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`. In PostgreSQL, adding a column with `DEFAULT CURRENT_TIMESTAMP` backfills all pre-existing rows in `"User"`, silently marking all legacy accounts as verified, while the Prisma schema default `@default(now())` causes any future code path creating a user without explicitly supplying `emailVerified` to fail open.

This specification defines the complete, secure, fail-closed email verification subsystem.

---

## 2. Schema Architecture & Migration Strategy

### 2.1 Prisma Schema Changes (Target: [`prisma/schema.prisma`](file:///E:/Antigravity%20Projects/Leads/prisma/schema.prisma))

#### 1. Harden `User.emailVerified` (Fail-Closed)
In `model User`:
```prisma
model User {
  id                    String             @id @default(cuid())
  email                 String             @unique
  passwordHash          String
  name                  String
  role                  UserRole           @default(DEVELOPER)
  status                UserStatus         @default(ACTIVE)
  // Remove @default(now()) so unverified state is strictly fail-closed (NULL)
  emailVerified         DateTime?
  sessionsRevokedBefore DateTime?
  failedLoginAttempts   Int                @default(0)
  lockedUntil           DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  emailVerificationTokens EmailVerificationToken[]
  // ... other relations remain intact
}
```

#### 2. Introduce `EmailVerificationToken` Model
Store only a cryptographic hash of the token, preventing token theft via database dumps or read replicas:

```prisma
model EmailVerificationToken {
  id           String    @id @default(cuid())
  userId       String
  tokenHash    String    @unique
  expiresAt    DateTime
  consumedAt   DateTime?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime  @default(now())

  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@index([tokenHash, expiresAt, consumedAt])
}
```

### 2.2 Migration 0003 vs. 0005 Determination

**Determination:**
- The repository has no configured remote Git tracking branch and has never deployed migrations to an external shared or staging database (verified via Phase 0 inspection).
- However, local environments, automated CI test harnesses, and PGlite in-memory test databases rely on migration stability.
- Migration `0004` is allocated to the D2 refund report unique constraint (`0004_unique_active_claim_refund_report`).
- Authoring a clean, forward-only migration [`prisma/migrations/0005_email_verification_tokens/migration.sql`](file:///E:/Antigravity%20Projects/Leads/prisma/migrations) is the robust, auditable standard.

### 2.3 Proposed Migration SQL (`0005_email_verification_tokens/migration.sql`)
```sql
-- Step 1: Remove default CURRENT_TIMESTAMP on User.emailVerified so future inserts fail closed to NULL
ALTER TABLE "User" ALTER COLUMN "emailVerified" DROP DEFAULT;

-- Step 2: Create EmailVerificationToken table
CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 3: Create Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_lookup_idx" ON "EmailVerificationToken"("tokenHash", "expiresAt", "consumedAt");
```

### 2.4 Proposed Rollback SQL (For Emergency Recovery)
```sql
-- Rollback Step 1: Drop Table and Indexes
DROP TABLE IF EXISTS "EmailVerificationToken" CASCADE;

-- Rollback Step 2: Restore previous default on User if required
ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT CURRENT_TIMESTAMP;
```

---

## 3. Legacy Accounts: Backfill Decision Options

The Product Owner must select one of the following three options regarding existing accounts currently in the database:

### Option A: Strict Verification (Zero Backfill — Recommended for Maximum Quality)
No legacy user is marked verified. All existing developers must verify their email address before claiming their next lead.
```sql
-- Exact SQL for Option A:
UPDATE "User"
SET "emailVerified" = NULL
WHERE "role" = 'DEVELOPER';
```

### Option B: Grandfather All Existing Accounts
Marks 100% of currently registered accounts as verified up to the migration timestamp. Only accounts registered after migration execution require verification.
```sql
-- Exact SQL for Option B:
UPDATE "User"
SET "emailVerified" = CURRENT_TIMESTAMP
WHERE "emailVerified" IS NULL;
```

### Option C: Explicit Whitelist (Internal & Admin Accounts Only)
Grandfathers pre-approved operational accounts (e.g. platform administrators and verified team testers), leaving all other users unverified.
```sql
-- Exact SQL for Option C:
UPDATE "User"
SET "emailVerified" = CURRENT_TIMESTAMP
WHERE "email" IN (
    'admin@leads4dev.com',
    'sallam@leads4dev.com',
    'support@leads4dev.com'
);

UPDATE "User"
SET "emailVerified" = NULL
WHERE "email" NOT IN (
    'admin@leads4dev.com',
    'sallam@leads4dev.com',
    'support@leads4dev.com'
) AND "role" = 'DEVELOPER';
```

---

## 4. Endpoints & API Contract

### 4.1 Dispatch / Resend Endpoint: `POST /api/auth/verify-email/request`

- **Purpose:** Dispatches an email containing a secure verification link to the authenticated user (or upon request with email).
- **Security & Rate Limits:**
  - **Per-IP Rate Limit:** 5 requests per 15-minute rolling window.
  - **Per-User/Email Rate Limit:** 1 request per 2 minutes (cooldown enforced).
  - **Daily Cap:** Max 5 verification emails per account per 24 hours.
  - **Anti-Enumeration:** If called unauthenticated with an email payload, always return HTTP 200 `{ "success": true, "message": "إذا كان البريد مسجلاً، فقد تم إرسال رابط التأكيد." }` regardless of whether the email exists.
- **Payload:**
  ```json
  // Authenticated user (session cookie present):
  {}
  
  // Unauthenticated user resend:
  {
    "email": "developer@example.com"
  }
  ```
- **Responses:**
  - `200 OK`: Verification link queued/dispatched.
  - `429 Too Many Requests`: Returns `Retry-After` header and localized cooldown notice.
  - `400 Bad Request`: Malformed email string.

### 4.2 Verification Execution Endpoint: `POST /api/auth/verify-email`

- **Purpose:** Validates the token submitted from the landing page and atomically marks the user as verified.
- **Payload:**
  ```json
  {
    "token": "raw-hex-or-base64url-token-string"
  }
  ```
- **Execution Lifecycle & Error Cases:**
  1. **Invalid Format:** Token length or character set invalid $\rightarrow$ HTTP 400 `{ "code": "INVALID_TOKEN" }`.
  2. **Hash & Lookup:** Compute `sha256(token)` $\rightarrow$ search `EmailVerificationToken`.
  3. **Not Found:** Hash does not exist $\rightarrow$ HTTP 400 `{ "code": "TOKEN_NOT_FOUND" }`.
  4. **Expired:** `expiresAt <= now()` $\rightarrow$ HTTP 410 `{ "code": "TOKEN_EXPIRED", "canResend": true }`.
  5. **Already Consumed (Replay):** `consumedAt != null` $\rightarrow$ HTTP 409 `{ "code": "TOKEN_ALREADY_USED" }`.
  6. **Already Verified User:** User is already verified $\rightarrow$ HTTP 200 `{ "code": "ALREADY_VERIFIED", "message": "تم تأكيد هذا الحساب مسبقاً." }`.
  7. **Atomic Consumption (Transaction):**
     - Mark token `consumedAt = now()`.
     - Update user `emailVerified = now()`.
     - Invalidate active cached user session in `userSessionCache`.
     - Append Audit Log `USER_EMAIL_VERIFIED`.
     - Track analytics event `verification_completed`.
     - Return HTTP 200 `{ "success": true, "emailVerified": now() }`.

---

## 5. Email Integration & Delivery Infrastructure

### 5.1 Architecture & Reused Modules
- Reuses the existing email delivery interface in [`src/lib/notifications.ts`](file:///E:/Antigravity%20Projects/Leads/src/lib/notifications.ts):
  - `ApiEmailNotificationProvider` (Resend via HTTP POST `https://api.resend.com/emails`).
  - `ConsoleEmailNotificationProvider` (Local development and test mode).
- Formatted via [`src/lib/email-templates.ts`](file:///E:/Antigravity%20Projects/Leads/src/lib/email-templates.ts) utilizing `wrapBrandedEmailLayout` with strict RTL/LTR styling.

### 5.2 Proposed Email Content (For Product Owner Approval — Do Not Ship Directly)

#### Arabic Template (Default / Primary)
- **Subject:** `تأكيد بريدك الإلكتروني لتفعيل حسابك على LeadForge Egypt`
- **Preheader:** `يرجى تأكيد بريدك لتتمكن من فتح بيانات التواصل والفرص التجارية المؤهلة.`
- **Body HTML:**
  ```html
  <h2 style="margin-top:0; color:#1C1917; font-size:18px;">مرحبًا بك في LeadForge Egypt</h2>
  <p>شكرًا لتسجيلك. خطوة واحدة أخيرة تفصلك عن فتح بيانات التواصل مع أصحاب المشاريع والشركات في مصر.</p>
  <p>اضغط على الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل صلاحية اقتناص الفرص:</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="{{verificationUrl}}" style="background-color: #0D9488; color: #FFFFFF; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
      تأكيد البريد الإلكتروني
    </a>
  </div>
  <p style="font-size: 13px; color: #78716C;">
    هذا الرابط صالح لمدة 24 ساعة فقط. إذا لم تكن قد أنشأت هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.
  </p>
  ```

#### English Template (Fallback / Locale en)
- **Subject:** `Verify your email to activate your LeadForge Egypt account`
- **Preheader:** `Verify your email to unlock verified business opportunities and contact details.`
- **Body HTML:**
  ```html
  <h2 style="margin-top:0; color:#1C1917; font-size:18px;">Welcome to LeadForge Egypt</h2>
  <p>Thank you for joining. Please verify your email address to enable lead unlocking and access customer contact information.</p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="{{verificationUrl}}" style="background-color: #0D9488; color: #FFFFFF; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
      Verify Email Address
    </a>
  </div>
  <p style="font-size: 13px; color: #78716C;">
    This link is valid for 24 hours. If you did not create this account, you can safely ignore this message.
  </p>
  ```

### 5.3 Local Development Behavior
- When `process.env.NODE_ENV !== 'production'` or `EMAIL_PROVIDER === 'CONSOLE'`:
  - `ConsoleEmailNotificationProvider` captures the dispatch.
  - The verification URL (`http://localhost:3000/verify-email?token=...`) is logged clearly to the developer console terminal with zero network roundtrips.

### 5.4 Production Infrastructure Requirements (External Setup)
The Product Owner / DevOps must configure the following outside the codebase:
1. **Resend Account & API Key:** Stored securely as `EMAIL_API_KEY`.
2. **Sender Domain DNS Verification:**
   - Sending domain (e.g. `mail.leads4dev.com` or `leads4dev.com`).
   - `DKIM` (TXT records configured in Cloudflare / DNS registrar).
   - `SPF` (v=spf1 include:resend.com ~all).
   - `DMARC` (TXT record at `_dmarc.leads4dev.com`).
3. **Environment Variables:**
   - `EMAIL_PROVIDER=API`
   - `EMAIL_FROM=LeadForge Egypt <no-reply@leads4dev.com>`
   - `APP_URL=https://www.leads4dev.com` (Never rely on dynamic `req.headers.get('host')` for verification link generation).

---

## 6. User Experience & UI States

### 6.1 Unverified Developer State & Placement Options

The Product Owner must choose the preferred banner placement:

- **Placement Option 1 (Top AppShell Banner - Recommended):**  
  A non-intrusive warm warning banner anchored to the top of [`AppShell`](file:///E:/Antigravity%20Projects/Leads/src/components/layout/AppShell.tsx) on all authenticated pages (`/leads`, `/my-leads`, `/subscription`), displaying:
  *"بريدك الإلكتروني غير مؤكد بعد. يرجى تأكيد بريدك لتتمكن من فتح بيانات التواصل. [إعادة إرسال الرابط]"*.
- **Placement Option 2 (Lead Action Modal / In-Place Gate):**  
  Banner omitted from top navigation; instead, when clicking "اقتناص الفرصة" (Claim), a dedicated modal appears:
  *"يجب تأكيد بريدك الإلكتروني أولاً لتفعيل نقاط رصيدك واقتناص هذه الفرصة."* with an instant "إرسال رابط التأكيد" button.
- **Placement Option 3 (Hybrid):**  
  Top banner visible + disabled button tooltip with actionable modal trigger on claim.

### 6.2 Resend Cooldown Component
- Resend button contains a 60-second in-memory countdown upon click (`تم إرسال الرابط. أعد المحاولة بعد 59 ثانية`).
- Prevents spamming and double-clicks.

### 6.3 Dedicated Verification Landing Page: `/verify-email`
Located at `src/app/verify-email/page.tsx` (or `[locale]/verify-email`):
1. **Verifying State:** Shows neutral loading spinner with caption *"جاري التحقق من صحة الرابط..."*.
2. **Success State:** Displays checkmark icon, caption *"تم تأكيد بريدك الإلكتروني بنجاح! تم تفعيل رصيدك ويمكنك الآن اقتناص الفرص."*, and a primary CTA button navigating to `/leads`.
3. **Expired State:** Warning icon with *"انتهت صلاحية رابط التأكيد (الروابط صالحة لمدة 24 ساعة). [إرسال رابط جديد]"*.
4. **Invalid State:** Danger icon with *"رابط التأكيد غير صالح أو تم استخدامه مسبقًا."*.

### 6.4 Proposed i18n Keys (`src/messages/ar.json` & `en.json`)

```json
{
  "auth": {
    "unverifiedBannerText": "بريدك الإلكتروني غير مؤكد بعد. يجب تأكيد البريد لتتمكن من فتح بيانات العملاء.",
    "resendVerificationBtn": "إعادة إرسال رابط التأكيد",
    "verificationSentToast": "تم إرسال رابط التأكيد إلى بريدك الإلكتروني بنجاح.",
    "resendCooldown": "يمكنك إعادة الإرسال بعد {seconds} ثانية",
    "verifySuccessTitle": "تم تأكيد بريدك الإلكتروني بنجاح ✅",
    "verifySuccessDesc": "حسابك مفعّل الآن بالكامل، ويمكنك البدء في فتح بيانات التواصل مع العملاء المؤهلين.",
    "browseLeadsBtn": "تصفح الفرص المتاحة",
    "verifyExpiredTitle": "انتهت صلاحية الرابط",
    "verifyExpiredDesc": "انتهت صلاحية رابط التأكيد (صلاحية الرابط 24 ساعة). يمكنك طلب رابط جديد في أي وقت.",
    "requestNewLinkBtn": "طلب رابط جديد",
    "verifyInvalidTitle": "رابط غير صالح",
    "verifyInvalidDesc": "رابط التأكيد غير صحيح أو تم استخدامه بالفعل مسبقًا."
  }
}
```

---

## 7. Analytics & Telemetry

To measure onboarding funnel health and drop-offs:
1. `verification_sent`:
   - Triggered when a verification email is dispatched.
   - Properties: `{ userId, resendCount, triggerSource: 'REGISTRATION' | 'MANUAL_RESEND' | 'CLAIM_GATE' }`.
2. `verification_completed`:
   - Triggered upon successful token redemption.
   - Properties: `{ userId, durationSecondsFromRegistration, verificationMethod: 'EMAIL_LINK' }`.

---

## 8. Security Specifications

1. **Token Entropy & Length:**
   - Generated using `crypto.randomBytes(32).toString('hex')` (256 bits of cryptographic entropy, 64-character hex string).
2. **Hashed Storage:**
   - Raw tokens are **never** stored in the database.
   - Database stores `tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')`.
3. **Timing-Safe Comparison:**
   - Database lookup matches on `tokenHash`. If memory comparisons occur, `crypto.timingSafeEqual` is strictly enforced.
4. **Base URL Origin Integrity:**
   - Verification links strictly use `process.env.APP_URL` (configured as `https://www.leads4dev.com`).
   - **Never** extract hostnames from user-supplied request headers (`Host`, `X-Forwarded-Host`) to prevent password-reset/verification cache poisoning or phishing link injection.
5. **Referrer & Access Log Protection:**
   - The verify landing page executes `POST /api/auth/verify-email` via client fetch, then strips the token from the browser address bar via `window.history.replaceState({}, '', '/verify-email/success')`.
   - The page includes `<meta name="referrer" content="no-referrer">` to prevent verification tokens from leaking in `Referer` headers to external resources.

---

## 9. Tests to Write First (TDD Plan)

Before implementing the feature, the following test cases will be authored:
1. `it('generates high-entropy token and stores only its sha256 hash in DB')`
2. `it('successfully verifies user and updates User.emailVerified timestamp')`
3. `it('rejects expired verification tokens with HTTP 410 TOKEN_EXPIRED')`
4. `it('rejects reused tokens on second attempt with HTTP 409 TOKEN_ALREADY_USED')`
5. `it('rejects malformed or tampered tokens with HTTP 400')`
6. `it('handles already verified user idempotently with friendly notice')`
7. `it('enforces resend rate limit and cooldown per user')`
8. `it('enforces IP rate limiting on unauthenticated resend requests')`
9. `it('does not enumerate users when requesting resend for non-existent email')`
10. `it('confirms lead unlocking gate succeeds immediately after verification')`

---

## 10. Risks, Rollout Order & Open Questions

### 10.1 Identified Risks
- **Email Deliverability (Spam folder):** Without verified custom domain SPF/DKIM DNS records on Resend, activation emails will land in spam or be dropped by Gmail/Hotmail.
- **User Frustration if Email Provider Down:** If Resend is unreachable, user cannot claim leads. A fallback manual verification procedure for support admins must exist.
- **Session Cache Staleness:** In-memory user session cache (`userSessionCache`) must be invalidated on verification to avoid stale `emailVerified: null` checks in middleware.

### 10.2 Recommended Rollout Order
1. Apply Schema & Migration `0005` (after written PO approval).
2. Implement backend cryptographic service (`src/lib/auth/email-verification.ts`).
3. Wire API routes (`/api/auth/verify-email/request` and `/api/auth/verify-email`).
4. Wire welcome registration dispatch.
5. Author TDD test suite and verify 100% pass rate.
6. Build landing page and dashboard banners.

### 10.3 Open Questions for Product Owner (Do Not Resolve Without Approval)
1. **OQ-EV-01 (Legacy Backfill):** Which option do you select for existing database users? (Option A: None, Option B: All, or Option C: Whitelist)?
2. **OQ-EV-02 (Token Expiry):** Is a 24-hour token expiration acceptable, or do you prefer 48 hours / 72 hours?
3. **OQ-EV-03 (UI Banner Placement):** Which placement option do you select (Option 1: Top AppShell banner, Option 2: Lead Claim modal only, or Option 3: Hybrid)?
4. **OQ-EV-04 (Copy Approval):** Do you approve the proposed Arabic and English wording for the verification email and UI toasts?

---
*End of Specification. Waiting for Product Owner written approval before any code or schema modifications.*

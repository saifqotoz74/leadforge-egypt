# LeadForge Egypt — Developer Handoff Document

> **Status:** Production-Ready & Fully Verified  
> **Conformance:** 0 Violations across 137 Source Files (`npm run check:design` Exit Code 0)  
> **Test Suite:** 36 Test Files, 436 Passing Tests (`npm test` Exit Code 0)  
> **Type Safety:** 0 TypeScript Errors (`npm run typecheck` Exit Code 0)  
> **i18n Parity:** 100% Bilingual Parity across 1,802 Keys in 36 Namespaces (`npm run check:i18n` Exit Code 0)  
> **Production Build:** 52/52 Routes Compiled and Optimized (`npm run build` Exit Code 0)

---

## 1. Executive Summary & Architecture Overview

LeadForge Egypt is an enterprise-grade, rule-based B2B qualified web development leads SaaS platform engineered specifically for the Egyptian software agency and freelance developer ecosystem. The platform continuously monitors Egyptian commercial registries, public registries, and business directories, deterministic deduplicates records, validates digital readiness, computes explainable Opportunity Scores, and provisions exclusive or shared lead claims through an immutable double-entry credit ledger.

### Architectural Pillars
- **Framework:** Next.js 14 App Router (React 18, TypeScript strict mode).
- **Database & ORM:** PostgreSQL schema driven by Prisma ORM 6.19 (`prisma/schema.prisma`), supporting embedded PGlite for rapid zero-dependency local dev/testing and managed external PostgreSQL for staging/production via pooler.
- **Styling & Design System:** Tailwind CSS with strict token-only palette, logical properties (RTL-first), IBM Plex Sans Arabic + IBM Plex Mono typography, and Zero AI iconography.
- **Localization:** `next-intl` bilingual setup (Arabic `ar` default, English `en`), ICU syntax compliance, Western digit enforcement (`ar-EG-u-nu-latn`, `tabular-nums`, `.ltr-iso`).
- **Security & Integrity:** Cryptographic sessions via `jose` (JWT in HTTP-only cookies), password hashing via `bcryptjs`, multi-tier sliding rate limiting, URL trust boundaries, and complete audit logging (`AuditLog`).

---

## 2. Design System Architecture & Conformance

The user interface conforms strictly to `docs/design/LEADFORGE_DESIGN_SYSTEM.md` and passes automated AST/regex verification through `scripts/check-conformance.mjs` with **zero violations**.

### Conformance Invariants
1. **Palette Discipline (Rule 1):** Raw Tailwind color utilities (`bg-teal-500`, `text-emerald-800`, `bg-rose-50`, `text-amber-600`, etc.) are prohibited in application source. All styling uses semantic design tokens:
   - Primary: `brand`, `brand-hover`, `brand-pressed`, `brand-soft`, `brand-soft-strong`
   - Foreground: `fg-primary`, `fg-secondary`, `fg-muted`, `fg-brand`, `fg-on-brand`, `fg-inverse`
   - Surfaces: `page`, `surface`, `subtle`, `inverse`, `overlay`
   - Borders: `line` (default), `line-strong`, `line-brand`
   - Status: `warning-bg`, `warning-border`, `warning-text`, `warning-icon`, `danger-bg`, `danger-border`, `danger-text`, `danger-icon`, `info-*`
2. **Logical Properties Only (Rule 4):** Physical spacing and direction classes (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `border-l`, `border-r`) are prohibited. All layouts utilize RTL-first logical properties:
   - `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`, `border-s`, `border-e`, `text-start`, `text-end`
   - Directional icons mirror using `rtl:-scale-x-100`.
3. **Typography & Monospace Discipline (Rule 13):** `font-mono` is strictly restricted to `CodeChip.tsx`, `IdChip.tsx`, and the root layout. Number formatting uses Western digits with tabular alignment (`tabular-nums`) and `.ltr-iso` isolation.
4. **Zero AI Policy (Rule 10):** No sparkles, magic wands, "AI", "smart", or mystical iconography/labels (`Sparkles`, `Wand`, `Wand2`, `Bot`, `BrainCircuit`). All calculations, scores, and match explanations are deterministic and explainable.
5. **Dead Class Detector (Rule 18):** Every class in JSX is verified against the compiled Tailwind CSS index (e.g., deprecated classes like `text-title`, `text-caption-xs`, `bg-brand/10` have been replaced with live tokens).
6. **Truncation & Accessibility (Rule 17):** Every `truncate` usage is paired with a same-line directive `/* design-allow: truncate */` and accessible `title` or `aria-label`.

---

## 3. Core Engine Specifications

### 3.1 Scoring & Opportunity Engine (`src/lib/scoring/`)
- Deterministic 0–100 score evaluating digital readiness:
  - Missing website (+25) or poor mobile/SEO experience (+15)
  - Social presence on Facebook / Instagram (+10 each)
  - Commercial viability: phone available (+10), verified business status (+15), multiple branches (+10), high review volume (+10)
- Explanations broken down into transparent business factors. Zero black-box ML.

### 3.2 Deduplication & Entity Resolution Engine (`src/lib/deduplication/`)
- Multi-tier matching hierarchy:
  - Level 1: External Source ID
  - Level 2: Commercial Registry Number (CRN)
  - Level 3: Normalized Phone Number (`+20...`)
  - Level 4: Normalized Email
  - Level 5: Normalized Business Name + City / Address similarity
- Supports chained merges and safe non-destructive unmerging, preserving full audit history in `LeadMergeHistory`.

### 3.3 Claims, Credits & Ledger Engine (`src/lib/claims.ts`)
- **Ledger Model:** Immutable double-entry `CreditTransaction` records with atomic balance updates (`balanceBefore`, `balanceAfter`, `idempotencyKey`).
- **Authoritative Credit Cost & Pricing Rules:**
  - `SHARED` (with phone): **5 credits / points**. Standard multi-seat lead (default `maxPurchasers = 3`).
  - `EXCLUSIVE` (with phone): **25 credits / points**. Single-owner lead (`maxPurchasers = 1`).
  - `FIELD_VISIT_DISCOUNT` (no phone number): **1 credit / point total**. Sold at an 80% discount (1 point total cost, not a 1-point discount from 5) for physical/in-person sales pitches.
  - Configurable dynamic pricing modifiers (Opportunity score bonus, Quality bonus, High-budget bonus) apply on top of base cost when enabled in `CreditPricingConfig`.
- **Claim Access Types:**
  - `EXCLUSIVE`: Claimable by exactly 1 developer. Once claimed, immediately transitions to `CLAIMED_EXCLUSIVE` and is hidden from public browse feeds.
  - `SHARED`: Multi-seat model (configurable `maxPurchasers`, typically 3). Capacity tracked atomically. Once seats are filled, transitions to `CLAIMED_FULL`. Free-tier exploratory claims do not consume paid shared seats.
- **Race Condition Immunity:** Enforces row-level locks / atomic transaction guards preventing double-claims, over-claiming, or negative credit balances under 20 concurrent requests.
- **Refund Guardrails:** Automatic refunds on lead status invalidation (e.g., business closed). Trial users capped at 2 refund requests per rolling 30 days; paid subscribers have unconstrained review rights.

### 3.4 Engagement & Feedback State Machine (`src/lib/feedback.ts`)
- Lifecycle: `CLAIMED` → `CONTACTED` → `REPLIED` → `INTERESTED` → `MEETING` → `PROPOSAL_SENT` → `NEGOTIATION` → `WON` / `LOST`.
- Terminal states protected; invalid state jumps rejected deterministically.
- Supports transition to `INVALID` from any sales stage with structured feedback reasons (`WRONG_PHONE`, `BUSINESS_CLOSED`, `NOT_INTERESTED_IN_WEBSITE`, etc.).

---

## 4. Security, Email & Trust Boundaries

### 4.1 URL Trust Boundary (`getApplicationBaseUrl`)
- Destination URLs for transactional emails (email verification, password reset) do not trust unverified incoming request `Origin` headers.
- Evaluates:
  1. Configured canonical `APP_URL` / `NEXT_PUBLIC_APP_URL`.
  2. If `Origin` is passed, it is strictly validated against `ALLOWED_ORIGINS` (or localhost in non-production).
  3. Untrusted/spoofed origins are safely ignored, defaulting to the canonical URL.

### 4.2 Canonical Transactional Email Configuration
- In accordance with production standards, transactional email uses:
  - `EMAIL_PROVIDER`: e.g. `resend` or `smtp`
  - `EMAIL_API_KEY`: API authentication token
  - `EMAIL_FROM`: Canonical sender address (e.g. `Leads4dev <notifications@leads4dev.com>`)
- Verification tokens are single-use, cryptographically generated SHA-256 hashes with 24-hour expiration.
- Password reset revokes prior active sessions via `sessionsRevokedBefore` timestamp.

---

## 5. Verification Matrix & Health Check Commands

| Check | Command | Target Exit Code | Status | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Design Conformance** | `npm run check:design` | `0` | **Passed** | 0 violations across 137 source files |
| **i18n Parity** | `npm run check:i18n` | `0` | **Passed** | 1,802 keys, 100% parity across ar/en |
| **TypeScript Typecheck** | `npm run typecheck` | `0` | **Passed** | Zero type errors (`tsc --noEmit`) |
| **Unit & Integration Tests** | `npm test` | `0` | **Passed** | 36 test files, 436 tests passing |
| **Production Build** | `npm run build` | `0` | **Passed** | 52/52 routes static/dynamic generated |

### Key Developer Commands
```bash
# Start local development server (PGlite embedded database)
npm run dev

# Run all quality checks sequentially
npm run check:all

# Run Vitest test suite
npm test

# Run database migrations & seed
npm run db:migrate
npm run db:seed
```

---

## 6. UX Findings & GAP Remediation Summary

- **GAP-02 (Live E-Payment Review):** Pending manual-transfer review notice accurately reflects manual transfer review workflow without making unsupported 24–48h SLA claims.
- **GAP-04 (Match Alignment):** Profile match explanations on `/leads/[id]` conform to tokenized brand badges and deterministic criteria chips.
- **GAP-15 (Account Recovery):** Brand cleanup separate from suspended-account recovery flow; clear error handling for suspended users.
- **UX-003 (Score Lab Accessibility):** All sliders and toggle switches on Score Lab include accessible `aria-label` / `aria-labelledby` attributes.
- **Truthful Landing Claims:** Removed inflated or unverified marketing numbers; landing page truthfully represents early-access / beta metrics.
- **Dynamic Lead Signals:** "Verified phone" signal verified against actual provider verification records; fallback to truthful "Phone available" label.
- **Admin Cache Anti-Flash:** SWR cache keys isolated by account ID; cache cleared on logout or account switch to prevent data leakage.

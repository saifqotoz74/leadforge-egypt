# Leads4dev — UX Audit & Gap Remediation Plan

> **Document Status:** VERIFIED IMPLEMENTATION & REMEDIATION PLAN  
> **Date:** October 25, 2026  
> **Target Release:** Local Release Readiness (Pre-Production Deployment)  
> **Author:** Antigravity Engineering Team  

---

## 1. Executive Summary & Verification Methodology

Every finding from the NotebookLM UX Context (`GAP-01` through `GAP-15`) and the Pre-Launch UX Audit (`UX-001` through `UX-018`) was empirically evaluated against the current post-Phase-4E codebase (`E:\Antigravity Projects\Leads`).

Each finding was categorized into one of four verified classifications:
1. **CONFIRMED:** An active functional defect, missing user flow, or usability friction requiring remediation.
2. **PARTIALLY CONFIRMED:** A valid observation that operates safely in code but contains architectural redundancy or usability limitations.
3. **NOT CONFIRMED / INTENDED POLICY / ALREADY REMEDIATED:** An item that was already resolved in prior sprint commits or represents an intentional, approved product invariant (e.g. SEC-04 free-seat protection, FIN-04 manual-review refunds).
4. **REQUIRES PRODUCT OWNER DECISION:** A commercial, legal, or live third-party dependency outside the scope of local frontend/backend engineering.

---

## 2. Comprehensive Classification Matrix: GAP-01 through GAP-15

| Gap ID | Title | Priority | Status | Root Cause & Implementation Reality | Action in Remediation |
|---|---|---|---|---|---|
| **GAP-01** | Incomplete Email Verification Subsystem | **P0 (Blocker)** | **CONFIRMED** | `register/route.ts` sets `emailVerified: null`. Lead claiming strictly throws HTTP 403 `EMAIL_NOT_VERIFIED`. No verification tokens, dispatch handlers, or confirmation UI exist. New users are permanently locked out. | Implement full email verification flow: token generation, expiry (24h), one-time use, `/api/auth/verify-email`, `/verify-email` UI, and unverified warning banner. |
| **GAP-02** | Live E-Payment Gateway Not Configured | **P1 (Critical)** | **REQUIRES PO DECISION** | In production, automated checkout throws 403 `SANDBOX_PAYMENT_FORBIDDEN`. All users must use manual transfer receipt flow. Connecting live Paymob/Fawry requires merchant API keys and verified webhook URLs. | Preserve manual transfer flow; document exact merchant credentials and webhook setup checklist for deployment teammate. |
| **GAP-03** | Feed Cards Lack Granular Scoring Signal Badges | **P2 (High)** | **CONFIRMED** | `LeadCard.tsx` has UI chip slots for `signals`, but `lead.qualificationReasons` is frequently empty in raw data, leaving cards without visual explanation chips. | Implement client/server fallback to generate up to 3 high-impact signal chips (e.g. "No website", "Active phone", "50+ reviews") dynamically from scorable lead fields. |
| **GAP-04** | Match Explanation Dimensions Omitted from Feed and Detail | **P2 (High)** | **CONFIRMED** | `evaluateDeveloperLeadMatch` calculates dimension weights (`matchedDimensions`), but `LeadCard` and lead detail components omit rendering match badges or explanation pills to developers. | Add match badge (e.g. "90% Match") and top match criteria pills on lead cards and lead detail headers. |
| **GAP-05** | Lead Detail Activity Rail Lacks Unified Chronological Event Stream | **P2 (High)** | **CONFIRMED** | `src/app/leads/[id]/page.tsx` renders `DealTimeline` using only initial claim note and last contact timestamp. Logged phone calls (`contactAttempts`) and status transitions (`statusHistories`) are ignored. | Unify all claim notes, phone call logs, and stage transitions into a single chronological timeline. |
| **GAP-06** | Lifetime Credit Consumption Not Pre-Computed | **P3 (Medium)** | **PARTIALLY CONFIRMED** | Analytics calculates totals dynamically by querying `CreditTransaction`. Calculations are accurate, but pre-aggregation could optimize query performance at high scale. | Not a broken user journey; preserve transactional calculation and add query caching where appropriate. |
| **GAP-07** | User Preferred Locale Not Persisted in Database Schema | **P3 (Medium)** | **REQUIRES PO DECISION** | Locale choice is stored in browser cookie `lf_locale`. Switching devices resets locale to Arabic default until toggled. | Cookie-based locale is standard for `next-intl`. Adding a database column requires schema migration; documented as open PO decision. |
| **GAP-08** | Potential Drift Between `LeadClaim.pipelineStatus` and `LeadEngagement.currentStatus` | **P2 (High)** | **PARTIALLY CONFIRMED** | Both `updateDeveloperLeadStatus` and `updateEngagementStatus` update both tables inside transactions. However, dual-column representation is an architectural duplication risk. | Ensure all status mutation entry points validate bidirectional parity and write unified status histories. |
| **GAP-09** | Hardcoded Arabic Strings in Matching Engine Reason Output | **P2 (High)** | **CONFIRMED** | `src/lib/matching-engine.ts` lines 130 and 171 return hardcoded Arabic strings (`غير مطابق لتفضيلات المدن المستهدفة`), causing Arabic leaks in English locale. | Extract matching reason codes into bilingual translation maps in `src/messages/ar.json` and `src/messages/en.json`. |
| **GAP-10** | Bilingual Strings Mixed in Seed Catalog | **P3 (Medium)** | **CONFIRMED** | Synthetic fixtures in `src/lib/seed-data.ts` contain mixed English/Arabic strings (e.g. `+20 No website (لا يوجد موقع)`). | Clean up seed labels and ensure `src/lib/taxonomy.ts` normalizes display for both Arabic and English. |
| **GAP-11** | Free/Trial Claims Deduct Credits but Do Not Increment `currentPurchasers` | **P2 (High)** | **NOT CONFIRMED (INTENDED POLICY)** | SEC-04 explicitly dictates: "Free/trial unlocks must not consume paid shared-lead seats." This is an approved security & revenue protection invariant. | **PRESERVE UNCHANGED.** Free claims must never block paying developers from purchasing shared seats. |
| **GAP-12** | Auto-Refund Configuration Disconnected from Dispute Execution | **P2 (High)** | **NOT CONFIRMED (INTENDED POLICY)** | FIN-04 explicitly dictates that all refund reports remain subject to human administrator review (target 24-48h). Auto-refund flags in legacy config are disabled. | **PRESERVE MANUAL REVIEW.** Maintain 30-min cooling period, 2-report monthly cap, and clear admin review copy. |
| **GAP-13** | Rapid Claim Attempts Trigger Security Violation Signals | **P2 (High)** | **CONFIRMED** | Rapid double-clicking on "Claim" can fire duplicate requests, triggering HTTP 429 and `REPEATED_FAILED_CLAIMS` security alarms. | Add client-side button debouncing, pass `Idempotency-Key` on claim requests, and provide informative guidance on 403/429/402 responses. |
| **GAP-14** | Lack of WebSockets/SSE for In-App Alerts | **P3 (Medium)** | **PARTIALLY CONFIRMED** | Notifications poll on navigation or manual dropdown click. Full WebSockets adds server state complexity in serverless environments. | Add 60-second background polling interval to `TopBar` notification dropdown for fresh alert delivery. |
| **GAP-15** | Suspended User State Lacks In-App Recovery Flow | **P3 (Medium)** | **CONFIRMED** | Login endpoint returns generic 403 `FORBIDDEN` when account is suspended. Users receive no explanation or direct support link. | Update login handler to return `ACCOUNT_SUSPENDED` with support contact guidance; render dedicated suspension assistance card. |

---

## 3. Comprehensive Classification Matrix: UX-001 through UX-018

| UX ID | Title | Priority | Status | Current Codebase State | Action in Remediation |
|---|---|---|---|---|---|
| **UX-001** | CSP Blocks Google Fonts Stylesheet Globally | P1 | **ALREADY REMEDIATED** | Fixed in commit `b9b6bca`. `src/app/layout.tsx` uses `next/font/google` for IBM Plex Sans Arabic and IBM Plex Mono without external HTTP font calls. | Verify zero CSP warnings in browser console. |
| **UX-002** | Unauthenticated Pricing Page Renders Skeletons and Emits 401 | P1 | **ALREADY REMEDIATED** | Fixed in commit `35a7644`. `PricingClient.tsx` checks `initialIsLoggedIn` and skips `/api/subscription` fetch for guests, rendering static cards immediately. | Verify zero 401 console errors on guest visit to `/pricing`. |
| **UX-003** | Score Lab Switches Missing Accessible Names | P2 | **ALREADY REMEDIATED** | Fixed in commit `d7e1cb3`. `ScoreLab.tsx` includes accessible labels on toggle switches. | Re-verify in axe-core automated audit. |
| **UX-004** | Developer Analytics Range Select Missing Accessible Label | P2 | **ALREADY REMEDIATED** | Fixed in commit `d7e1cb3`. Select element has `aria-label`. | Re-verify in axe-core automated audit. |
| **UX-005** | Admin Quality Batch Quantity Missing Accessible Label | P2 | **ALREADY REMEDIATED** | Fixed in commit `d7e1cb3`. Number input has `aria-label`. | Re-verify in axe-core automated audit. |
| **UX-006** | Mobile Horizontal Overflow on Design System Page | P3 | **ALREADY REMEDIATED** | Fixed in commit `e5a6067`. Preview tables wrapped in `overflow-x-auto`. | Verify 390px mobile viewport rendering. |
| **UX-007** | Admin Matching Backend 404 & Empty Constraints Tab | P1 | **ALREADY REMEDIATED** | Fixed in commit `9fc20a3`. `/api/admin/matching/config` and `/debug` endpoints restored. | Verify admin matching suite passes. |
| **UX-008** | Missing Standard Autocomplete Attributes on Auth Inputs | P2 | **ALREADY REMEDIATED** | Fixed in commit `87945ec`. Login and registration inputs include standard `autocomplete` attributes. | Verify browser autofill behavior. |
| **UX-009** | Missing Password Visibility Toggle on Sensitive Inputs | P3 | **ALREADY REMEDIATED** | Fixed in commit `87945ec`. Eye toggle icons added to password inputs. | Verify toggle interaction. |
| **UX-010** | Missing Self-Service Password Recovery Link | P1 | **CONFIRMED & HARDENED** | Commits `405d087` & `0ac77a2` added `/forgot-password` and `/reset-password`. Single-use cryptographic tokens are implemented. | Harden token invalidation with `sessionsRevokedBefore: now()` and verify full bilingual coverage. |
| **UX-011** | Reset Filters Action Label Unclear on Empty Search | P3 | **ALREADY REMEDIATED** | Fixed in commit `50cb7d0`. Reset button uses localized clear action label. | Verify filter reset in lead discovery. |
| **UX-012** | Lead Detail Activity Rail Lacks Chronological Event Stream | P2 | **CONFIRMED** | Identical to GAP-05. Activity rail only shows notes, omitting phone calls and stage changes. | Implement unified timeline combining notes, calls, and status histories. |
| **UX-013** | Lead Invalidation Lacks Warning Dialog | P2 | **ALREADY REMEDIATED** | Fixed in commit `1f6b4f4`. `ConfirmInvalidDialog` intercepts transitions to `INVALID` to explain dispute terms. | Verify dialog displays dispute policy. |
| **UX-014** | Cramped Tablet Header Layout at 768px | P3 | **ALREADY REMEDIATED** | Fixed in commit `e5a6067`. Responsive classes hide secondary breadcrumbs on tablet widths. | Verify 768px viewport layout. |
| **UX-015** | Redundant "0 EGP per point" Caption on Free Plan | P3 | **ALREADY REMEDIATED** | Fixed in commit `5a8cea5`. `PackageCard` conditionally renders "مجاناً / Free" instead of per-point calculation. | Verify free package card rendering. |
| **UX-016** | Keyboard Navigation Does Not Highlight Hero Rule Fields | P3 | **ALREADY REMEDIATED** | Fixed in commit `1e10652`. `onFocus` and `onBlur` mirror hover highlighting on landing hero. | Verify keyboard tab navigation. |
| **UX-017** | Locale Stored in Cookie Only | P3 | **REQUIRES PO DECISION** | Identical to GAP-07. Browser cookie stores `lf_locale`. | Documented for PO decision. |
| **UX-018** | Skeleton Flash on Internal Admin Navigation | P3 | **PARTIALLY CONFIRMED** | Uncached SWR fetches cause skeleton renders during tab switching. | Implement lightweight memory caching for admin data tables. |

---

## 4. Phased Implementation Roadmap

### Phase 2: Forward Migration for Lead Performance Indexes
- Restore historical [`prisma/migrations/0001_init/migration.sql`](file:///E:/Antigravity%20Projects/Leads/prisma/migrations/0001_init/migration.sql) to exact baseline (removing the 3 inline index declarations).
- Create forward migration [`prisma/migrations/0001b_add_lead_performance_indexes/migration.sql`](file:///E:/Antigravity%20Projects/Leads/prisma/migrations/0001b_add_lead_performance_indexes/migration.sql) declaring `Lead_score_createdAt_idx`, `Lead_status_score_idx`, and `Lead_saleabilityStatus_isCanonical_score_idx`.

### Phase 3: Priority 1 — Email Verification Subsystem (GAP-01)
- Create forward migration [`prisma/migrations/0005_email_verification_tokens/migration.sql`](file:///E:/Antigravity%20Projects/Leads/prisma/migrations/0005_email_verification_tokens/migration.sql) adding `EmailVerificationToken` table.
- Implement token generator and validator in `src/lib/email-verification.ts` (SHA-256 token hashing, 24-hour expiration, single-use invalidation).
- Create API endpoints:
  - `POST /api/auth/verify-email`: confirms token and marks `User.emailVerified = now()`.
  - `POST /api/auth/verify-email/request`: dispatches verification email with 60-second cooldown rate limiting.
- Create verification landing page `src/app/verify-email/page.tsx` with auto-verification query support and friendly states.
- Add `VerificationBanner.tsx` in `AppShell.tsx` for unverified developers.
- Send verification email upon registration in `src/app/api/auth/register/route.ts`.

### Phase 4: Priority 2 — Self-Service Password Recovery Hardening (UX-010)
- Harden `src/app/api/auth/reset-password/route.ts`: set `sessionsRevokedBefore: new Date()` upon password reset to revoke all prior session cookies across devices.
- Verify full Arabic & English translation coverage for all recovery states.

### Phase 5: Priority 3 & 4 — Lead Discovery Cards, Scoring Signals & Claim Hardening (GAP-03, GAP-04, GAP-13)
- In `LeadCard.tsx`: provide dynamic score explanation signals (e.g. "No website", "Active phone", "50+ reviews") when raw reasons array is empty.
- Add match badge and match criteria pills to `LeadCard` and lead detail page.
- In `src/app/leads/[id]/page.tsx`: generate client-side `Idempotency-Key` header on claim, disable button immediately on click, and handle `EMAIL_NOT_VERIFIED`, `INSUFFICIENT_CREDITS`, and `429` with contextual error cards and direct CTAs.

### Phase 6: Priority 5 & 6 — Lead Detail Activity Rail & CRM Unified Timelines (GAP-05 / UX-012)
- In `src/app/leads/[id]/page.tsx`: merge claim notes, phone contact attempts, and stage transitions into a unified, chronological `DealTimeline` event stream.
- In manual payment review (`TransferPaymentModal.tsx` & `/subscription`): display explicit review status ("طلب التحويل قيد المراجعة اليدوية - خلال 24 ساعة") and allow receipt re-upload if rejected.
- In refund reporting: ensure 30-min wait and manual review expectations are clearly communicated.

### Phase 7: Priority 7 & 8 — Localization & Suspended User Recovery (GAP-09, GAP-15)
- In `src/lib/matching-engine.ts`: replace hardcoded Arabic reason strings with localized translation keys.
- In `src/app/api/auth/login/route.ts`: return `ACCOUNT_SUSPENDED` with support contact guidance; render dedicated suspension assistance card on `/login`.
- Verify full test suite, typecheck, i18n parity, and production build.

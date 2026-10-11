# LeadForge Egypt — Backend Gaps & Data Contract Audit

> **Spec Reference:** `docs/design/LEADFORGE_DESIGN_SYSTEM.md` (Sections 7.8, 7.9, 7.10, 7.12, 7.13, 12, 14)  
> **Status:** Audited during Phase 5 (Batch 1 Migration)  
> **Date:** October 9, 2026

This document records visual and interactive features required by the LeadForge Design System specification that require backend data exposures, joined queries, or schema expansions.

---

## 1. Top Scoring Signals on Feed Cards (`LeadCard` Chips)
- **Spec Citation:** Section 7.8:
  > *"Signals: up to 3 neutral outline chips (height 24, radius-full, caption, border --border-default) listing the top scoring reasons by weight... Derived from the rules that fired; if the backend does not expose them, omit this row (log in BACKEND_GAPS)."*
- **Backend Current State:**
  In `/api/leads` browse queries, `LeadScore` returns the numeric `score` (0–100) and `classification` (`LeadTemperature`). The individual rule firing breakdown (`LeadScoreBreakdown`) is computed during scoring and stored in audit tables, but is not joined in standard lightweight feed queries to preserve low latency.
- **Frontend Fallback Implemented:**
  `LeadCard` accepts optional `signals?: string[]`. When passed (e.g. from cached highlights or detail views), the chips render cleanly. When omitted, the row is safely omitted without visual collapse or broken layout.
- **Recommended Backend Action:**
  Add a lightweight string array column or cached JSON property `topSignalLabels: string[]` to the `LeadScore` or `Lead` model containing up to 3 high-weight rule labels.

---

## 2. Match Explanation in Browse View (`ScoreBreakdown`)
- **Spec Citation:** Section 7.9:
  > *"Same pattern is reused for match explanation (why this lead matches the developer's profile)."*
- **Backend Current State:**
  Phase 4 Matching Engine calculates rule weights against `DeveloperProfile` (`servicesOffered`, `targetGovernorates`, `minimumBudget`). In feed mode, `LeadMatch` records are queried by score, but individual matched dimensions are not joined into the browse payload.
- **Frontend Fallback Implemented:**
  `ScoreBreakdown` accepts both scoring rules and matching dimensions. In detail views, match highlights are displayed; in the main feed, only overall match score and temperature are shown.
- **Recommended Backend Action:**
  Add `matchedDimensions` summary object to `/api/leads/[id]` response when requested by an authenticated developer.

---

## 3. Deal Activity History Stream (`DealTimeline` Events)
- **Spec Citation:** Section 7.13:
  > *"Lead detail activity rail shows chronological notes, status changes, and 'Report wrong number' button."*
- **Backend Current State:**
  `DealNote` records and `ClaimAuditLog` entries exist in Prisma models, but `/api/leads/[id]` historically returned only the core `Lead` object and `isClaimedByMe` flag without joining notes or chronological events into a unified timeline event stream.
- **Frontend Fallback Implemented:**
  `DealTimeline` renders existing notes, provides an active note composer that posts to `/api/developer/notes`, and provides an "الإبلاغ عن رقم خاطئ" button triggering the refund request handler.
- **Recommended Backend Action:**
  Expand `/api/leads/[id]` to include `events: Array<{ id, type, author, content, createdAt }>` combining `DealNote` entries and `EngagementStatus` transitions.

---

## 4. Aggregated Credit Lifetime Statistics (`StatTile`s on Credits & Dashboard)
- **Spec Citation:** Section 7.11, 7.14, & Template T6:
  > *"Dashboard & Credits views display current balance, total points consumed, and total claims made."*
- **Backend Current State:**
  `/api/developer/credits` returns `balance: number`. Historical transactions are fetched via `/api/developer/ledger` and aggregated on the client to calculate total points spent and total claims made.
- **Frontend Fallback Implemented:**
  Client-side aggregation computes lifetime consumption and active claims from the loaded ledger.
- **Recommended Backend Action:**
  Expose a pre-aggregated summary in `/api/developer/credits`:
  `{ balance: number, totalConsumed: number, totalPurchased: number, activeClaimsCount: number }`.

---

## 5. Live E-Payment Gateway Integration for Credit Packages (`PackageCard`)
- **Spec Citation:** Section 7.10, 7.12:
  > *"Package selection redirects to checkout; points added immediately upon confirmation."*
- **Backend Current State:**
  `PackageCard` CTA triggers package selection. In local dev mode, transactions are simulated or routed to developer top-up mock routes because real Fawry/Paymob API keys require external merchant account configuration.
- **Frontend Fallback Implemented:**
  Checkout flow displays package pricing in EGP with per-point cost calculation, confirms selection via toast notifications, and triggers the credit addition API.
- **Recommended Backend Action:**
  Configure production webhook listener at `/api/webhooks/payment` when payment gateway credentials are deployed.

---

## 6. User Account Locale Persistence (`preferredLocale`)
- **Spec Citation:** LEADFORGE_SPEC_ADDENDUM_01.md Section 3.8:
  > *"LanguageSwitcher: a two-option segmented control whose options are labeled in their own language (العربية, English)... It sets lf_locale (1 year, SameSite=Lax) and refreshes. Persisting the choice per account needs a backend field: record it in BACKEND_GAPS, do not add it."*
- **Backend Current State:**
  The `User` model in `prisma/schema.prisma` does not currently include a `locale` or `preferredLocale` field. The locale is managed via the HTTP client cookie `lf_locale`.
- **Frontend Fallback Implemented:**
  Client reads and writes `lf_locale` cookie with 1-year expiration and `SameSite=Lax`.
- **Recommended Backend Action:**
  Add `preferredLocale String @default("ar")` to the `User` model in Prisma, and update user authentication/profile endpoints to synchronize with the cookie preference.

---

## 7. Pipeline Status Source of Truth (`LeadClaim.pipelineStatus` vs `LeadEngagement.currentStatus`)
- **Spec Citation:** LEADFORGE_SPEC_ADDENDUM_01.md Section 3.7, Item 5:
  > *"Pipeline source of truth: the board and stage badges use LeadClaim.pipelineStatus; the engagement timeline uses LeadEngagement.currentStatus. If the two can disagree, show pipeline status and report the case in BACKEND_GAPS."*
- **Backend Current State:**
  Lead claiming tracks `LeadClaim.pipelineStatus` (for board columns and high-level claim progression) while contact engagement tracking uses `LeadEngagement.currentStatus` (for activity timeline transitions). Under asynchronous updates, a developer may advance engagement without synchronizing claim pipeline status immediately.
- **Frontend Fallback Implemented:**
  The board columns and stage badges display `LeadClaim.pipelineStatus` as the primary source of truth.
- **Recommended Backend Action:**
  Synchronize `LeadClaim.pipelineStatus` and `LeadEngagement.currentStatus` automatically in a single atomic database transaction on every pipeline progression API call.

---

## 8. Structured Scoring & Matching Signal Codes per Lead
- **Spec Citation:** LEADFORGE_SPEC_ADDENDUM_01.md Section 3.4, Item 14 & Dashboard Review Round 3 (Item 4):
  > *"MatchRow: remove the 'Sector match' and 'Location match' chips (true for every matched lead, no information). Chips show only discriminating facts: website status, and any scoring signals already available in frontend data. Do not invent. Log in BACKEND_GAPS.md: we need structured scoring and matching signal codes per lead."*
- **Backend Current State:**
  In `/api/developer/dashboard`, `lead.matchEvaluation.explanation.reasons` returns hardcoded Arabic sentences (e.g. `reasonAr: "تطابق في قطاع الأعمال: عيادات الأسنان"`, `reasonAr: "العميل في نفس نطاقك الجغرافي: القاهرة"`). Additionally, rule scoring breakdown signals (e.g. `HIGH_DEMAND`, `MULTIPLE_BRANCHES`, `HIGH_RATING`, `FACEBOOK_ACTIVE`) computed during lead ingestion are omitted from `/api/developer/dashboard` lead payloads.
  Consequently, generic chips like "Sector match" and "Location match" are tautological—they are true for literally every matched lead in the feed and provide zero discriminating value to the developer.
- **Frontend Fallback Implemented:**
  In `MatchRow.tsx`, generic "Sector match" and "Location match" chips are completely removed. The reason chips row displays strictly discriminating facts: the localized website opportunity status (e.g. "No website", "Needs redesign") and any explicit scoring signals already attached to frontend lead objects.
- **Recommended Backend Action:**
  Update scoring and matching engines to emit machine-readable reason and signal codes per lead:
  ```json
  "scoringSignals": [
    { "code": "HIGH_DEMAND", "weight": 25 },
    { "code": "NO_WEBSITE", "weight": 30 },
    { "code": "MULTIPLE_BRANCHES", "weight": 15 }
  ]
  ```
  This will allow the frontend to render localized, high-signal discriminating chips for each lead from catalog messages.

---

## 9. Bilingual Database Strings in `SubscriptionPlan` and `Lead.qualificationReasons`
- **Spec Citation:** Launch Fix Sprint Block 0.2 & Block 0.4:
  > *"The pricing page currently displays mixed-language names such as `(Free)`, `(Shared Leads)`, and `(HOT & PREMIUM)` alongside Arabic text. The issue must be fixed at the presentation and catalog layer without modifying the backend."*
- **Backend Current State:**
  `SubscriptionPlan.name` and `SubscriptionPlan.features` in the seeded database store mixed Arabic/English strings (e.g. `الباقة المجانية (Free)`, `الوصول إلى فرص العملاء المشتركة (Shared Leads)`), and `Lead.qualificationReasons` stores combined strings formatted as `+{weight} {nameAr} ({nameEn})` (e.g. `+20 النشاط التجاري موثق وموجود فعليًا (Business verified)`).
- **Frontend Fallback Implemented:**
  - `resolvePlanCode()`, `localizePlanCatalog()`, and `localizePlanName()` in `src/lib/taxonomy.ts` map every plan (`free`, `starter`, `pro`, `business`, `enterprise`, plus a neutral localized `fallback` with a development console warning) to pure locale-specific strings in `src/messages/ar.json` and `src/messages/en.json` (`plans.*`), while preserving actual database price (`priceEgp`) and points (`monthlyCredits`).
  - `localizeQualificationReason()` in `src/lib/taxonomy.ts` extracts the locale-appropriate portion (`+{weight} {nameAr}` for `ar`, `+{weight} {nameEn}` for `en`) so neither locale displays mixed-script strings.
- **Recommended Backend Action:**
  Store structured `code` keys or separate `nameAr`/`nameEn` and `featuresAr`/`featuresEn` columns in `SubscriptionPlan` and structured rule codes in `Lead.qualificationReasons`.

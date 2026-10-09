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

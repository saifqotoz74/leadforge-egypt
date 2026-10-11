# LeadForge Egypt — Phase 0 Design System Audit

> **Spec Reference:** `docs/design/LEADFORGE_DESIGN_SYSTEM.md` (Section 2 — Phase 0 Discovery)  
> **Date:** October 9, 2026  
> **Auditor:** LeadForge Engineering Agent (in strict compliance with Phase 0 rules: no code modified, no packages installed)

---

## 1. Framework, Versions & Tooling

| Technology / Library | Installed Version | Notes & Compliance Assessment |
| :--- | :--- | :--- |
| **Next.js** | `14.2.35` | App Router architecture. Supports `next/font/google`. |
| **React / React DOM** | `18.3.1` | Concurrent features and Server/Client Component model. |
| **Tailwind CSS** | `3.4.17` (**v3**) | **Tailwind v3** is installed. Configuration is in `tailwind.config.ts` (Appendix A mapping applies; v4 `@theme` is NOT used). |
| **TypeScript** | `5.7.2` | Strict mode enabled in `tsconfig.json`. |
| **UI Utility Libraries** | `clsx` (`2.1.1`), `tailwind-merge` (`2.6.0`) | Present. Headless accessible primitives (e.g., Radix UI) are **not installed yet**. |
| **Icon Library** | `lucide-react` (`0.469.0`) | Present. Stroke 1.75 and 20px default per spec. |
| **Chart Library** | **None** | No chart library is in `package.json`. Analytics pages currently render custom Tailwind grid/bars. |
| **Font Setup** | **Legacy Google Fonts `<link>` (Cairo)** | Currently loaded via `<link>` in `src/app/layout.tsx` (`Cairo:wght@400..800`). `next/font/google` is **not configured**, and `IBM Plex Sans Arabic` / `IBM Plex Mono` are **not loaded yet**. |

---

## 2. Directory & Architecture Map

```text
src/
├── app/                      # Next.js App Router (Pages, Layouts & Route Handlers)
│   ├── layout.tsx            # Global Root Layout (<html lang="ar" dir="rtl">)
│   ├── globals.css           # Global Tailwind base styles (legacy Cairo + custom scrollbars)
│   ├── page.tsx              # Public Landing Page
│   ├── login/page.tsx        # Guest Auth: Login
│   ├── register/page.tsx     # Guest Auth: Register
│   ├── pricing/page.tsx      # Commercial Plans & Pricing
│   ├── dashboard/            # Developer Dashboard
│   │   ├── page.tsx          # Developer Dashboard Overview
│   │   └── analytics/page.tsx# Developer Analytics
│   ├── leads/                # Developer Opportunity Discovery
│   │   ├── page.tsx          # Leads Feed (Filters + LeadCards)
│   │   └── [id]/page.tsx     # Lead Detail & Claim View
│   ├── my-leads/page.tsx     # Developer Claimed Deals (Pipeline)
│   ├── settings/page.tsx     # Developer Matching Preferences
│   ├── subscription/page.tsx # Credit Account, Balance & Plans
│   ├── admin/                # System Administrator Control Center
│   │   ├── page.tsx          # Admin Executive Overview
│   │   ├── leads/page.tsx    # Lead Inventory & CSV Upload
│   │   ├── duplicates/page.tsx# Duplicate Review & Merging
│   │   ├── quality/page.tsx  # Data Quality, Verification & Dead-Letter
│   │   ├── matching/page.tsx # Matching Rules & Diagnostic Debugger
│   │   ├── rules/page.tsx    # Scoring Rules & Weight Editor
│   │   ├── sources/page.tsx  # Collector & Ingestion Governance
│   │   ├── users/page.tsx    # User Accounts & RBAC
│   │   ├── plans/page.tsx    # Subscription Plan Settings
│   │   ├── reports/page.tsx  # Audit Logs & Activity
│   │   └── analytics/page.tsx# 6-Layer Analytics & Flywheel
│   └── api/                  # 40+ Backend API Route Handlers (FROZEN per Spec 1.1)
├── components/               # UI & Layout Components
│   ├── AppShell.tsx          # Shared application frame (Sidebar, TopBar, Mobile Drawer)
│   ├── LeadCard.tsx          # Lead feed card component
│   ├── PublicNavbar.tsx      # Public landing/auth navigation bar
│   ├── ui/                   # [MISSING] Primitives to be built in Phase 2
│   └── domain/               # [MISSING] Domain components to be built in Phase 3
├── lib/                      # Domain logic, engines & database access (FROZEN per Spec 1.1)
│   ├── constants.ts          # Egyptian governorates, categories & legacy badge classes
│   ├── db.ts                 # Prisma Client + PGlite adapter
│   ├── scoring/              # Phase 1 Scoring Engine
│   ├── deduplication/        # Phase 2 Deduplication & Normalization
│   ├── quality/              # Phase 3 Quality & Freshness Engine
│   ├── matching/             # Phase 4 Matching Engine
│   ├── claims/               # Phase 5 Claims & Credit Ledger
│   ├── feedback/             # Phase 6 Engagement & Feedback Machine
│   ├── analytics/            # Phase 7 Metrics & Human Review Flywheel
│   └── collectors/           # Phase 8 Ingestion & Pipeline Orchestrator
└── styles/                   # [MISSING] To be created in Phase 1 (tokens.css, etc.)
```

---

## 3. Page & Route Role Inventory

| Route | File Path | Audience / Role | Current Shell / Layout | Target Spec Template (Sec. 8) |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | Public / Guest | `PublicNavbar` + Custom Hero/Sections | Public Marketing |
| `/login` | `src/app/login/page.tsx` | Public / Guest | `PublicNavbar` + Centered Card | **T1 Auth** |
| `/register` | `src/app/register/page.tsx` | Public / Guest | `PublicNavbar` + Centered Card | **T1 Auth** |
| `/pricing` | `src/app/pricing/page.tsx` | Public / Developer | `PublicNavbar` + Pricing Cards | Public / **T6 Top-up** |
| `/dashboard` | `src/app/dashboard/page.tsx` | `DEVELOPER` | `AppShell` (standard) | **T11 Overview** |
| `/dashboard/analytics` | `src/app/dashboard/analytics/page.tsx` | `DEVELOPER` | `AppShell` (standard) | Developer Analytics |
| `/leads` | `src/app/leads/page.tsx` | `DEVELOPER` | `AppShell` (standard) + `LeadCard` | **T3 Feed** |
| `/leads/[id]` | `src/app/leads/[id]/page.tsx` | `DEVELOPER` | `AppShell` (standard) + Inline layout | **T4 Lead Detail** |
| `/my-leads` | `src/app/my-leads/page.tsx` | `DEVELOPER` | `AppShell` (standard) + Kanban/List | **T5 Pipeline** |
| `/settings` | `src/app/settings/page.tsx` | `DEVELOPER` | `AppShell` (standard) + Form Cards | **T2 Onboarding** / Settings |
| `/subscription` | `src/app/subscription/page.tsx` | `DEVELOPER` | `AppShell` (standard) + Ledger Table | **T6 Top-up** & **T7 Ledger** |
| `/admin` | `src/app/admin/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) | **T11 Overview** |
| `/admin/leads` | `src/app/admin/leads/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Table | **T8 Admin Table** |
| `/admin/duplicates` | `src/app/admin/duplicates/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Comparison | **T9 Admin Compare** |
| `/admin/quality` | `src/app/admin/quality/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Queues | **T8 Admin Table** |
| `/admin/matching` | `src/app/admin/matching/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Matcher | **T10 Admin Editor** |
| `/admin/rules` | `src/app/admin/rules/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Table | **T10 Admin Editor** |
| `/admin/sources` | `src/app/admin/sources/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Grid/Table | **T8 Admin Table** |
| `/admin/users` | `src/app/admin/users/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Table | **T8 Admin Table** |
| `/admin/plans` | `src/app/admin/plans/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Cards | Admin Plans Config |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Table | **T8 Admin Table** |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | `ADMIN` | `AppShell` (`isAdminView`) + Analytics | Admin Executive Analytics |

---

## 4. Shared Components Analysis

Only **3 shared components** exist today:

1. **`AppShell.tsx`** (416 LOC):
   - **Reuse:** Used in **16 different pages** (every authenticated page in developer and admin portals).
   - **Characteristics:** Contains sidebar navigation, top bar, credit counter, user dropdown, notification popover, mobile drawer, and role-based links.
   - **Gaps against Spec:**
     - Uses physical classes (`border-r`, `space-x-reverse`, `mr-3`, etc.).
     - Uses green brand palette (`bg-emerald-600`, `text-emerald-700`).
     - Contains an inline style (`style={{ width: ... }}` on line 210 for credit bar).
     - Missing density mode support (`data-density="comfortable|compact"`).
2. **`PublicNavbar.tsx`** (95 LOC):
   - **Reuse:** Used in **4 pages** (`/`, `/login`, `/register`, `/pricing`).
   - **Gaps against Spec:** Uses emerald green branding (`bg-emerald-600`) and legacy logo icon.
3. **`LeadCard.tsx`** (495 LOC):
   - **Reuse:** Used in `src/app/leads/page.tsx`.
   - **Gaps against Spec:**
     - Contains forbidden iconography: **`Sparkles`** (Spec 1.4 forbids sparkle/"AI" icons).
     - Uses purple/rose/sky badges (`bg-purple-100`, `bg-rose-100`) violating Spec 1.4 and Spec 6.1.
     - Lacks the 4-dot heat meter required by Spec 6.1.
     - Renders complex inline sub-modals rather than headless Dialog primitives.

---

## 5. Codebase Discipline Metrics (Static Analysis)

| Metric | Measured Count | Details & Locations |
| :--- | :--- | :--- |
| **Hard-coded Hex Values** | **4** | • `src/app/globals.css`: lines 23, 27, 32 (`#f1f5f9`, `#cbd5e1`, `#94a3b8` in scrollbar)<br>• `src/lib/deduplication/normalizer.ts`: line 47 (code comment referring to extension `#105`)<br>*(Note: `tailwind.config.ts` also contains 11 legacy hex values for `brand-50..950` and `slate-850/950`)* |
| **Inline Styles (`style=`)** | **1** | `src/components/AppShell.tsx` line 210 (`style={{ width: ... }}` for credit percentage progress bar). |
| **Physical Padding/Margin (`ml/mr/pl/pr-N`)** | **3** | • `src/app/leads/page.tsx`: line 183 (`pr-9 pl-3`)<br>• `src/app/admin/users/page.tsx`: line 123 (`pr-9 pl-4`)<br>• `src/app/pricing/page.tsx`: line 108 (`ml-1`) |
| **Physical Directional Classes (`left-*`, `right-*`, `text-left`, `text-right`)** | **30** | Widely scattered in search inputs (`right-3` for search icon), tables (`text-right`), and absolute positioning elements. Must migrate to `start-*`, `end-*`, `text-start`, `text-end`. |
| **Arbitrary Pixel Spacing/Sizes (`[...px]`)** | **12** | e.g., `h-[400px]`, `w-[320px]`, `min-h-[600px]`. |
| **Gradients (`bg-gradient-*`)** | **6** | Found on landing page hero and promotional cards. Must be eliminated per Spec 1.4 ("Gradients of any kind are forbidden"). |

---

## 6. RTL & Arabic Inspection

- **HTML Configuration:** `src/app/layout.tsx` specifies `<html lang="ar" dir="rtl">`.
- **CSS Direction:** `src/app/globals.css` repeats `direction: rtl` on `html`.
- **Icon Mirroring:** **0 occurrences** of `rtl:-scale-x-100` or icon mirroring in the entire repository. Directional icons (`ArrowRight`, `ChevronRight`, `ChevronLeft`, `LogOut`, `ExternalLink`) point in static LTR directions without adapting to RTL layout.
- **Bi-directional Isolation (`.ltr-iso`):** Currently **not implemented**. Phone numbers, emails, and prices are rendered as plain text strings, causing punctuation and signed numbers (e.g., `+30`, `010...`) to reverse or jump positions in RTL contexts.
- **Number Formatting:** Raw JavaScript interpolation (`{lead.estimatedBudget} جنيه` or `{lead.score}`) is used instead of unified `Intl.NumberFormat('ar-EG-u-nu-latn')`.

---

## 7. Real Prisma Enum Mapping to Design System Concepts

Section 6 of `LEADFORGE_DESIGN_SYSTEM.md` defines the domain visual concepts. Below is the authoritative mapping to the actual Prisma enums in [`prisma/schema.prisma`](../../prisma/schema.prisma) and [`src/lib/constants.ts`](../../src/lib/constants.ts):

### A. Opportunity Tier (Spec 6.1)
- **Concept:** `COLD`, `WARM`, `HOT`, `PREMIUM`
- **Prisma Enum:** `LeadTemperature`
  ```prisma
  enum LeadTemperature {
    COLD
    WARM
    HOT
    PREMIUM
  }
  ```
- **DB Fields:** `Lead.temperature`, `LeadScore.classification`
- **Visual Mapping:**
  - `COLD`: `--bg-subtle` / `--text-secondary` / 1 of 4 dots filled / Label: `بارد`
  - `WARM`: `--sand-100` / `--sand-700` / 2 of 4 dots filled / Label: `دافئ`
  - `HOT`: `--clay-50` / `--clay-700` / 3 of 4 dots filled / Label: `ساخن`
  - `PREMIUM`: `--bg-inverse` / `--text-inverse` / 4 of 4 dots filled / Label: `مميز`

### B. Quality & Freshness State (Spec 6.2)
- **Concept:** `FRESH`, `AGING`, `STALE`, `UNVERIFIED`, `VERIFIED`, `REVERIFYING`
- **Prisma Enums:**
  ```prisma
  enum FreshnessState {
    FRESH
    RECENT
    NEEDS_VERIFICATION
    STALE
    VERY_STALE
    UNKNOWN
  }

  enum VerificationStatus {
    UNVERIFIED
    PARTIALLY_VERIFIED
    VERIFIED
    FAILED_VERIFICATION
  }

  enum VerificationRecordStatus {
    VERIFIED
    FAILED
    UNKNOWN
    NEEDS_REVERIFICATION
  }

  enum QualityStatus {
    VERY_LOW
    LOW
    MEDIUM
    HIGH
    EXCELLENT
  }

  enum LeadAvailabilityStatus {
    AVAILABLE
    CLAIMED_FULL
    REQUIRES_VERIFICATION
    STALE
    INVALID
    CLOSED
    DUPLICATE
    NOT_SALEABLE
    ARCHIVED
  }
  ```
- **Mapping Rule:**
  - `FRESH` ➔ `Lead.freshnessStatus === 'FRESH'` (Label: `حديث`, dot, `--brand-accent`)
  - `AGING` ➔ `Lead.freshnessStatus === 'RECENT'` or `'NEEDS_VERIFICATION'` (Label: `قديم نسبياً`, dot, `--n-400`)
  - `STALE` ➔ `Lead.freshnessStatus === 'STALE'` or `'VERY_STALE'` (Label: `قديم`, `AlertCircle`, `--warning-icon`)
  - `UNVERIFIED` ➔ `Lead.verificationStatus === 'UNVERIFIED'` (Label: `غير موثّق`, `HelpCircle`, `--warning-icon`)
  - `VERIFIED` ➔ `Lead.verificationStatus === 'VERIFIED'` (Label: `موثّق`, `Check`, `--text-brand`)
  - `REVERIFYING` ➔ `Lead.verificationStatus === 'PARTIALLY_VERIFIED'` or verification records with `'NEEDS_REVERIFICATION'` (Label: `قيد إعادة التحقق`, `RefreshCw`, `--n-400`)

### C. Ownership Type (Spec 6.3)
- **Concept:** `EXCLUSIVE`, `SHARED`
- **Prisma Enum:** `LeadOwnershipType`
  ```prisma
  enum LeadOwnershipType {
    SHARED
    EXCLUSIVE
  }
  ```
- **DB Fields:** `Lead.ownershipType`, `LeadClaim.ownershipType`
- **Visual Mapping:**
  - `EXCLUSIVE`: Outlined pill, `--text-brand` border/text, `Lock` icon, Label: `حصري`
  - `SHARED`: Outlined pill, `--border-strong` border, `--text-secondary` text, `Users` icon, Label: `مشترك (متبقي {n} من {max})`

### D. Engagement Stages & Pipeline (Spec 6.4)
- **Concept:** `CLAIMED` (new), In Progress, `WON`, `LOST`
- **Prisma Enums:**
  ```prisma
  enum EngagementStatus {
    CLAIMED
    CONTACTED
    REPLIED
    INTERESTED
    MEETING
    PROPOSAL_SENT
    NEGOTIATION
    WON
    LOST
    NOT_INTERESTED
    INVALID
  }

  enum PipelineStatus {
    NEW
    CLAIMED
    CONTACTED
    REPLIED
    INTERESTED
    MEETING
    PROPOSAL_SENT
    NEGOTIATION
    WON
    LOST
    NOT_INTERESTED
    INVALID
  }
  ```
- **DB Fields:** `LeadEngagement.currentStatus`, `LeadClaim.pipelineStatus`
- **Visual Mapping:**
  - `NEW` / `CLAIMED`: Outline pill, neutral
  - `CONTACTED`, `REPLIED`, `INTERESTED`, `MEETING`, `PROPOSAL_SENT`, `NEGOTIATION`: `--bg-brand-soft` fill, `--text-brand` text
  - `WON`: `--bg-brand-soft-strong` fill, `--text-brand` text, `Check` icon
  - `LOST` / `NOT_INTERESTED` / `INVALID`: `--bg-subtle` fill, `--text-secondary` text, `X` icon

### E. Claim Status
- **Prisma Enum:** `ClaimStatus`
  ```prisma
  enum ClaimStatus {
    PENDING
    ACTIVE
    REFUNDED
    EXPIRED
    CANCELLED
    FAILED
  }
  ```
- **DB Field:** `LeadClaim.status`

### F. Credit Transaction Type (Spec 6.5 / 7.11)
- **Prisma Enum:** `CreditTransactionType`
  ```prisma
  enum CreditTransactionType {
    PURCHASE
    CLAIM
    REFUND
    BONUS
    ADMIN_ADJUSTMENT
    EXPIRATION
    CORRECTION
  }
  ```
- **DB Field:** `CreditTransaction.type`
- **Visual Mapping:** Positive deltas (`PURCHASE`, `REFUND`, `BONUS`) rendered in `--text-brand` with `.ltr-iso`; negative deltas (`CLAIM`) in `--text-primary`.

### G. Additional Key Domain Enums in Database

#### 1. Website Status
- **Prisma Enum:** `WebsiteStatus`
  ```prisma
  enum WebsiteStatus {
    NO_WEBSITE
    HAS_WEBSITE
    POOR_WEBSITE
    UNKNOWN
  }
  ```
- **DB Field:** `Lead.websiteStatus`
- **Visual Role:** Used in lead card signals and website analysis breakdowns.

#### 2. Business Operational Status
- **Prisma Enum:** `BusinessOperationalStatus`
  ```prisma
  enum BusinessOperationalStatus {
    OPEN
    CLOSED
    TEMPORARILY_CLOSED
    UNKNOWN
  }
  ```
- **DB Field:** `Lead.businessStatus`
- **Visual Role:** Closed businesses trigger warning banners (`CLOSED_BUSINESS` flag).

#### 3. Lead Availability & Saleability Status
- **Prisma Enum:** `LeadAvailabilityStatus`
  ```prisma
  enum LeadAvailabilityStatus {
    AVAILABLE
    CLAIMED_FULL
    REQUIRES_VERIFICATION
    STALE
    INVALID
    CLOSED
    DUPLICATE
    NOT_SALEABLE
    ARCHIVED
  }
  ```
- **DB Fields:** `Lead.saleabilityStatus`, `Lead.status`
- **Visual Role:** Gate for purchase eligibility (`AVAILABLE` enables claim button; all others disable or show warning).

#### 4. Feedback & Invalid Reason Codes
- **Prisma Enum:** `FeedbackReason`
  ```prisma
  enum FeedbackReason {
    WRONG_PHONE
    BUSINESS_CLOSED
    ALREADY_HAS_WEBSITE
    NOT_INTERESTED
    DUPLICATE
    WRONG_CATEGORY
    WRONG_LOCATION
    FAKE_BUSINESS
    ALREADY_CLIENT
    OTHER
  }
  ```
- **DB Field:** `LeadFeedback.reasonCode`, `LeadEngagement.invalidReasonCode`, `LeadEngagement.outcomeReasonCode`
- **Visual Role:** Radio/select options when reporting a wrong number or closing a deal as LOST/INVALID.


---

## 8. Summary of Gaps & Critical Actions for Phase 1+

1. **Brand Palette Shift:** Entire color scheme must transition from legacy Emerald Green (`#16a34a`) and Tailwind Purples/Roses to the authoritative **Teal family** (`--teal-50` to `--teal-900`) and Warm Neutrals (`--sand-*`, `--clay-*`, `--amber-*`).
2. **Typography Migration:** Replace Google Fonts link in layout with Next.js font loader (`next/font/google`) targeting `IBM Plex Sans Arabic` and `IBM Plex Mono`.
3. **Creation of Tokens:** Create `src/styles/tokens.css` with semantic variables and map them cleanly in `tailwind.config.ts`.
4. **Logical Properties Migration:** Eliminate remaining physical properties (`pr-9 pl-3`, `left-3`, `right-3`, `text-left`, `text-right`) and mirror directional icons (`rtl:-scale-x-100`).
5. **Component Primitives Creation:** Build the missing headless primitives under `src/components/ui/` and domain badges/cards under `src/components/domain/`.
6. **Forbidden Elements Removal:** Purge all gradients, sparkles icons (`Sparkles`), and violet/purple colors.

---
*End of Phase 0 Audit Document.*

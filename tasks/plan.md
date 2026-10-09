# Implementation Plan: LeadForge Egypt Spec Addendum 01
Conformance Enforcement, Language Architecture, and Landing Page

## Executive Summary
This plan operationalizes `LEADFORGE_SPEC_ADDENDUM_01.md` to resolve uneven design system coverage across admin and developer routes, eliminate mixed Arabic/English UI chrome, establish automated conformance and i18n checking, and deliver a high-converting, explainable landing page with the interactive Score Lab.

---

## Technical Stack & Invariants
- **Next.js**: 14.2.35 App Router (no route-prefix rewriting; locale driven by `lf_locale` cookie)
- **i18n Library**: `next-intl` (v3.x compatible with Next 14.2)
- **Design Tokens**: `tokens.css` (Teal family, sand neutrals, clay/amber warnings). Zero raw hex outside tokens.
- **Layout & Typography**: Logical properties only (`ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`). Mirrored icons (`rtl:-scale-x-100`). IBM Plex Sans Arabic + Western Arabic numerals (`ar-EG-u-nu-latn`) with `.ltr-iso` and `.ltr-field`.
- **Backend Frozen**: No modification to `prisma/`, API routes, auth, or engine logic. All backend errors and codes mapped via client-side adapters.

---

## Phase Breakdown & Gated Milestones

### Phase 1: Tooling & Conformance Matrix (Part A Step 1)
- **Objective**: Build deterministic checkers before modifying any pages.
- **Artifacts**:
  - `scripts/check-conformance.mjs` (checking 10 hard rules + 1 warning rule across `src/**/*.{ts,tsx,css}`)
  - `npm run check:design` script in `package.json`
  - `docs/design/CONFORMANCE.md` matrix for all 25 application routes
- **Gate 1**: Present violation baseline and matrix to user before proceeding.

### Phase 2: Language Infrastructure & Shared Component Translation (Part B Step 2)
- **Objective**: Establish `next-intl` architecture, message catalogs, formatting, and shared primitives.
- **Key Tasks**:
  - Install approved dependency `next-intl` (v3.x).
  - Configure `src/i18n/request.ts` (reading `lf_locale`, default `'ar'`) and `next.config.mjs`.
  - Wrap Root Layout with `NextIntlClientProvider` and dynamic `lang`/`dir`.
  - Create `src/messages/ar.json` and `src/messages/en.json` starter catalogs.
  - Implement `LanguageSwitcher` (segmented control `العربية` / `English`).
  - Upgrade `src/lib/format.ts` for dual-locale awareness (`ar-EG-u-nu-latn` vs `en-GB-u-nu-latn` / `en-US`).
  - Build `src/lib/i18n-enums.ts` (`useEnumLabel` hook & server twin) covering all 33 Prisma enums.
  - Build `mapApiError()` central mapper.
  - Update `globals.css` (.ltr-iso without text-align, .ltr-field, English line heights).
  - Convert shared components: `AppShell`, `PublicNavbar`, `PublicFooter`, and domain/ui primitives.
  - Build `scripts/check-i18n.mjs` and npm script `check:i18n`.
  - Create `docs/i18n/GLOSSARY.md`, `docs/i18n/ALLOWLIST.md`, `docs/i18n/MISSING_KEYS.md`.
- **Gate 2**: Present glossary, i18n checks, and converted sample page for approval.

### Phase 3: Route Group Conversions (Conformance + String Extraction)
- Each route group converted in a single pass (design tokens + `t('...')` extraction):
  - **Batch 3a: Developer App**:
    - `/leads`, `/leads/[id]`, `/dashboard`, `/dashboard/analytics`, `/credits`, `/pipeline`, `/subscription`, `/my-leads`
  - **Batch 3b: Admin Portal Batch A**:
    - `/admin` (Needs attention StatTiles -> summary -> recent activity)
    - `/admin/leads` (FilterBar, DataTable with Drawer detail, bulk action sticky bar, Dropzone CSV upload)
    - `/admin/duplicates` (MergeCompare integration)
    - `/admin/quality` (FilterBar, DataTable with Drawer detail, QualityIndicator precedence)
  - **Batch 3c: Admin Portal Batch B**:
    - `/admin/matching` (Diagnostic Debugger: inputs form + vertical result trace step list + mono chips)
    - `/admin/rules` (RuleWeightEditor integration)
    - `/admin/sources` (Source cards with switch + history Drawer + Dead-letter table)
  - **Batch 3d: Admin Portal Batch C**:
    - `/admin/users` (Table + Drawer edit + danger dialog)
    - `/admin/plans` (Table + edit dialog + live `PackageCard` preview)
    - `/admin/reports` (Table + Drawer payload view in mono LTR scrollable container)
    - `/admin/analytics` (StatTiles + `BarList` 6px tracks + DataTable, zero chart libraries)
  - **Batch 3e: Auth, Onboarding & Pricing**:
    - `/login`, `/register`, `/onboarding`, `/pricing`, `/settings`
- **Gate 3**: Multi-viewport screenshots (390px, 1440px) and updated CONFORMANCE matrix per batch.

### Phase 4: High-Converting Landing Page (`/`) (Part C Step 4)
- **Objective**: Guided product tour showcasing explainable leads and the Score Lab.
- **Sections**:
  1. Sticky Navbar (64px) with LanguageSwitcher
  2. Hero with illustrative `LeadCard` and 3 verified facts
  3. Problem Strip (duplicates, wrong phone, existing modern site)
  4. How It Works (sticky storytelling crossfading real components)
  5. **Score Lab** (dark section `--bg-inverse`, controls + live `ScorePair` / `ScoreBreakdown` via `demoRules.ts`)
  6. Matching (profile card + 3 lead cards with gate pass/fail)
  7. Ownership & Points (exclusive vs shared comparison with `PurchaseConfirm` layout)
  8. Pricing (`PackageCard` with real plan data)
  9. Commitments ("ما نفعله" vs "ما لا نفعله")
  10. FAQ (Radix Accordion items)
  11. Final CTA band (`--bg-brand-soft`)
  12. Footer
- **Gate 4**: Live browser review, Lighthouse verification (Perf >= 90, A11y >= 95), `LANDING_NOTES.md`.

### Phase 5: Tailwind Lockdown & Final Verification (Step 6)
- **Objective**: Hard lockdown of Tailwind to token-backed classes only.
- In `tailwind.config.ts`, replace `colors`, `borderRadius`, `boxShadow` (removing Tailwind defaults).
- Re-run all 32+ viewport screenshots to verify 0 regressions.
- Verify `npm run check:design`, `npm run check:i18n`, `npm run typecheck`, and all 240 tests pass.
- Write final `docs/design/PROGRESS.md`.

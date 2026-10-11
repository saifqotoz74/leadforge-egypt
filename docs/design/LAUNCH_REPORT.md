# LeadForge Egypt — Design System & Launch Fix Sprint Report

> **Date:** October 11, 2026  
> **Status:** RELEASE READY — All Verification Gates Passing  
> **Backend Freeze:** Verified (`0` modifications in `prisma/`, `src/app/api/**`, auth/session backend services, or backend engines)

---

## 1. Executive Summary

This corrective implementation sprint resolved all release blockers, localization leaks, pricing catalog defects, dark-surface contrast issues, landing-page section defects, and admin/developer UI conformance issues in place while strictly preserving both Arabic (`lang="ar" dir="rtl"`) and English (`lang="en" dir="ltr"`) and keeping the backend 100% frozen.

---

## 2. Summary of Fixes by Block

### Block 0 — Release Blockers (Auth, Localization, Western Digits, Pricing)

1. **0.1 Restore & Verify Working Logout (`AppShell`, `TopBar`, `Sidebar`)**
   - Implemented a unified user account menu across the desktop `TopBar` dropdown, bottom of the desktop `Sidebar`, and mobile navigation drawer.
   - Displays the authenticated user's name (`<bdi dir="auto">`) and email (`.ltr-iso`), localized Settings link (`الإعدادات` / `Settings` -> `/settings`), and localized Logout button (`تسجيل الخروج` / `Log out`).
   - Calls existing `POST /api/auth/logout`, clears client session state, and redirects cleanly to `/login`.

2. **0.2 Full Bilingual Localization & Multi-Route Scanner**
   - Expanded `src/messages/ar.json` and `src/messages/en.json` to **1,581 keys each** with **100% key parity** across 32 namespaces.
   - Localized all 10 admin routes (`src/app/admin/**`), developer routes (`/dashboard`, `/leads`, `/leads/[id]`, `/my-leads`, `/subscription`, `/settings`, `/onboarding`, `/dashboard/analytics`), public routes (`/`, `/pricing`, `/login`, `/register`), and document metadata (`src/app/layout.tsx`).
   - Added `localizeQualificationReason()` and expanded Egyptian neighborhood area mappings in `src/lib/taxonomy.ts`.
   - Upgraded `scripts/check-i18n.mjs` (ICU syntax validation, static `useTranslations`/`getTranslations` key verification across 286 files, 33 Prisma enum mappings, BiDi checks).
   - Upgraded `scripts/scan-latin-leaks.mjs` to scan all 11 shipped public and authenticated routes in both `ar` (`lang="ar" dir="rtl"`) and `en` (`lang="en" dir="ltr"`), achieving **0 leaks**.

3. **0.3 Central Western-Digit (`0–9`) Formatting**
   - Updated `src/lib/format.ts` and `src/i18n/request.ts` to enforce `numberingSystem: 'latn'` (`ar-EG-u-nu-latn` and `en-US-u-nu-latn`) across all numbers, currencies, percentages, dates, and relative timestamps.
   - Added unit tests in `src/lib/__tests__/format.test.ts` verifying Western digits `0–9` and absence of Eastern Arabic numerals `٠–٩` in both locales.

4. **0.4 & 0.5 Pricing Catalog Localization & 6-Part Card Alignment**
   - Implemented `resolvePlanCode()`, `localizePlanCatalog()`, and `localizePlanName()` in `src/lib/taxonomy.ts` backed by `plans.*` in `ar.json` and `en.json` (`free`, `starter`, `pro`, `business`, `enterprise`, plus a neutral localized `fallback` with a dev warning).
   - Eliminated mixed-language database plan strings such as `(Free)`, `(Shared Leads)`, and `(HOT & PREMIUM)` from customer-facing UI while preserving actual database prices and point limits.
   - Standardized natural per-point captions (`حوالي {price} ج.م للنقطة` in Arabic, `Approx. {price} EGP per point` in English).
   - Refactored `PackageCard` into a 6-part flex-column grid (`h-full`) with aligned plan name, tagline, included points, price (`tabular-nums`, no `font-mono`), feature list (`flex-1`), and primary CTA.

---

### Block 1 — Shared Design System & Visual Defects

- **Dark Surface Semantic Scope (`src/styles/tokens.css`)**: Added `[data-surface="inverse"]` token scope providing high-contrast foregrounds, borders, and interactive states on dark surfaces (`--teal-900` / `--neutral-900`) without violating the single-palette invariant.
- **Logical Properties & BiDi Isolation**: Enforced RTL-first logical properties (`ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`), directional icon mirroring (`rtl:-scale-x-100`), `.ltr-iso` for phones/emails/URLs/codes, and `<bdi dir="auto">` for user/business names.

---

### Block 2 & Block 3 — Landing Page, Developer Routes & Admin Routes

- **Landing Page (`/`)**: Preserved and repaired `#score-lab` (interactive rule toggles, live score calculation, localized rule reasons) and Result Ownership / credit-model section (`[data-surface="inverse"]`), localized FAQ accordion, and responsive header/footer with `LanguageSwitcher`.
- **Developer & Admin Surfaces**: Full bilingual localization and token conformance across `/dashboard`, `/leads`, `/leads/[id]`, `/my-leads`, `/subscription`, `/settings`, `/onboarding`, `/dashboard/analytics`, and all `/admin/**` modules.

---

### Block 4 — Landing Hero First-Fold Refinement (1440x800 & 390x844)

- **First-Fold Viewport Fit**: Clean layout guaranteed at both 1440x800 (desktop) and 390x844 (mobile). Navbar, headline, subtitle, primary CTA, and lead card fit on the first screen without scrolling.
- **Typography**: Display clamp typography (`clamp(2.125rem, 4.6vw, 4.5rem)` delivering 66px at 1440px viewport), `font-weight: 700`, `line-height: 1.15`, max 3 lines. Stripped all badges, pills, and icons above headline.
- **Hero Lead Card**: Single un-nested card container (`max-w-lg`, `p-6`, `bg-surface border border-line shadow-sm`) with company name (*"Al Nour Dental Clinics"* / *"عيادات النور للأسنان"*), tier ("Hot" / "ساخنة"), score (85), field rows (Website, Google reviews, Branches, locked phone), Why 85? section with reasons (+45, +21, +14, +5 adding up to 85), price (5 points), and CTA ("View lead" / "عرض الفرصة").
- **Interactive Highlighting**: Hovering/focusing reasons highlights matching fields with `--bg-brand-soft` and `--brand-accent` ring (150ms). Semantic `aria-describedby` links triggers to fields.
- **Quiet Dot Grid**: SVG dot-grid pattern using `--n-100` on `--bg-page` behind hero only. Zero CSS gradients.
- **Strict Western Digits**: Enforced Western numerals (`0-9`) across all locales via `src/lib/format.ts`.

---

## 3. Verification Gate Results

| Verification Check | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **i18n Catalog & AST Audit** | `npm run check:i18n` | **PASS** | 1,612 keys in `ar.json` & `en.json` (100% parity), 3,224 ICU strings validated, 32 namespaces verified across 288 files, 33 Prisma enums mapped |
| **Design Conformance** | `npm run check:design` | **PASS** | 0 violations across 95 scanned UI/feature files; 669 compiled Tailwind classes indexed |
| **Multi-Route Bilingual Leak Scan** | `node scripts/scan-latin-leaks.mjs` | **PASS** | **0 leaks** across all routes in both `ar` (`lang="ar" dir="rtl"`) and `en` (`lang="en" dir="ltr"`) |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | `tsc --noEmit` exited with 0 errors |
| **Unit & Integration Tests** | `npm test` | **PASS** | 12 test suites passed (**240 tests passed, 100%**) |
| **Production Build** | `npx next build` | **PASS** | Production bundle compiled cleanly |

---

## 4. Captured Verification Screenshots

### Landing Hero Refinement Screenshots (`screenshots/`)
- `screenshots/landing_hero_ar_1440x800.png` (Arabic 1440x800 first-fold viewport)
- `screenshots/landing_full_ar_1440.png` (Arabic 1440 full page)
- `screenshots/landing_hero_ar_390.png` (Arabic 390x844 mobile first-fold viewport)
- `screenshots/landing_hero_en_1440x800.png` (English 1440x800 first-fold viewport)
- `screenshots/landing_full_en_1440.png` (English 1440 full page)
- `screenshots/landing_hero_en_390.png` (English 390x844 mobile first-fold viewport)

### Sprint Route Screenshots (`screenshots/sprint/`)
- `screenshots/sprint/landing-ar-1440x900.png`
- `screenshots/sprint/landing-en-1440x900.png`
- `screenshots/sprint/pricing-ar-1440x900.png`
- `screenshots/sprint/pricing-en-1440x900.png`
- `screenshots/sprint/pricing-en-390x844.png`
- `screenshots/sprint/dashboard-ar-1440x900.png`
- `screenshots/sprint/dashboard-en-1440x900.png`
- `screenshots/sprint/leads-ar-1440x900.png`
- `screenshots/sprint/lead-detail-ar-1440x900.png`
- `screenshots/sprint/my-leads-en-1440x900.png`
- `screenshots/sprint/subscription-en-1440x900.png`
- `screenshots/sprint/subscription-en-390x844.png`
- `screenshots/sprint/admin-rules-ar-1440x900.png`

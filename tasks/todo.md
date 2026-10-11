# Tasks: LeadForge Egypt Spec Addendum 01

## Phase 1: Tooling & Conformance Matrix (Part A Step 1)
- [x] Task 1.1: Create `scripts/check-conformance.mjs` scanning `src/**/*.{ts,tsx,css}` against the 10 hard rules + 1 warning rule.
- [x] Task 1.2: Add `"check:design": "node scripts/check-conformance.mjs"` to `package.json`.
- [x] Task 1.3: Generate baseline `docs/design/CONFORMANCE.md` matrix covering all 25 application routes.
- [x] **Checkpoint 1**: Review initial violation count and matrix before modifying any page.

## Phase 2: Language Infrastructure & Shared Component Translation (Part B Step 2)
- [x] Task 2.1: Install `next-intl` (compatible with Next 14.2 App Router) and configure `next.config.mjs`.
- [x] Task 2.2: Implement `src/i18n/request.ts` (cookie `lf_locale`, default `ar`) and Root Layout integration (`lang`, `dir`, `NextIntlClientProvider`).
- [x] Task 2.3: Implement `src/components/ui/LanguageSwitcher.tsx` (segmented control `العربية` / `English`).
- [x] Task 2.4: Update `src/app/globals.css` with corrected `.ltr-iso` (no text-align), `.ltr-field`, and English line-height overrides.
- [x] Task 2.5: Upgrade `src/lib/format.ts` to be locale-aware (`ar-EG-u-nu-latn` vs `en-GB-u-nu-latn` / `en-US`).
- [x] Task 2.6: Create `src/lib/i18n-enums.ts` providing `useEnumLabel` and server `getEnumLabel` mapping all 33 Prisma enums.
- [x] Task 2.7: Create `src/lib/api-errors.ts` providing `mapApiError()`.
- [x] Task 2.8: Create `src/messages/ar.json` and matching `src/messages/en.json` starter catalogs.
- [x] Task 2.9: Create `docs/i18n/GLOSSARY.md`, `docs/i18n/ALLOWLIST.md`, and `docs/i18n/MISSING_KEYS.md`.
- [x] Task 2.10: Build `scripts/check-i18n.mjs` and add `"check:i18n"` script to `package.json`.
- [x] Task 2.11: Convert shared components (`AppShell`, `PublicNavbar`, `PublicFooter`, `Sidebar`, `TopBar`, primitives) to use message catalog and mirror directional icons (`rtl:-scale-x-100`).
- [x] **Checkpoint 2**: Verify `check:i18n`, `check:design`, tests, and review converted sample page with user.

## Phase 3: Route Group Conversions (Conformance + String Extraction)
- [x] Task 3.1: Convert Developer App routes (`/leads`, `/leads/[id]`, `/dashboard`, `/dashboard/analytics`, `/credits`, `/pipeline`, `/subscription`, `/my-leads`).
- [x] Task 3.2: Capture 390px/1440px screenshots for Developer App and update CONFORMANCE matrix.
- [x] Task 3.3: Convert Admin Batch A (`/admin` overview, `/admin/leads` with Dropzone CSV upload & Drawer, `/admin/duplicates` with MergeCompare, `/admin/quality` with QualityIndicator & Drawer).
- [x] Task 3.4: Capture 390px/1440px screenshots for Admin Batch A and update CONFORMANCE matrix.
- [x] Task 3.5: Convert Admin Batch B (`/admin/matching` diagnostic debugger & step trace, `/admin/rules` with RuleWeightEditor, `/admin/sources` with health cards & dead-letter table).
- [x] Task 3.6: Capture 390px/1440px screenshots for Admin Batch B and update CONFORMANCE matrix.
- [x] Task 3.7: Convert Admin Batch C (`/admin/users` with Drawer & danger dialog, `/admin/plans` with live PackageCard preview, `/admin/reports` with mono LTR payload Drawer, `/admin/analytics` with BarList & StatTiles).
- [x] Task 3.8: Capture 390px/1440px screenshots for Admin Batch C and update CONFORMANCE matrix.
- [x] Task 3.9: Convert Public & Auth routes (`/login`, `/register`, `/onboarding`, `/pricing`, `/settings`).
- [x] Task 3.10: Capture 390px/1440px screenshots for Auth/Pricing and update CONFORMANCE matrix.
- [x] **Checkpoint 3**: Verify all 25 routes have zero violations in `check:design` and all strings extracted.

## Phase 4: High-Converting Landing Page (`/`) (Part C Step 4)
- [x] Task 4.1: Create `src/features/landing/demoRules.ts` pure function for deterministic Score Lab simulation.
- [x] Task 4.2: Build interactive `ScoreLab` component (controls, preset buttons, live `ScorePair` and `ScoreBreakdown` 200ms transitions, accessibility announcements).
- [x] Task 4.3: Build Sticky Storytelling `HowItWorks` component (step scroll + component crossfade).
- [x] Task 4.4: Build Hero, Problem Strip, Matching Showcase, Ownership/Points comparison, Pricing, Commitments, FAQ accordion, CTA band, and Footer.
- [x] Task 4.5: Assemble full `src/app/page.tsx` with SEO metadata landmarks and hero refinement.
- [x] Task 4.6: Capture screenshots at 390px, 768px, 1440px and generate `docs/design/LANDING_NOTES.md`.
- [x] **Checkpoint 4**: Verify hero first-fold at 1440x800 and 390x844 across both locales.

## Phase 5: Tailwind Lockdown & Final Verification (Step 6)
- [x] Task 5.1: Switch `tailwind.config.ts` from `extend` to replace root for `colors`, `borderRadius`, and `boxShadow`.
- [x] Task 5.2: Re-run full test suite (240 tests), typecheck, `check:design`, and `check:i18n`.
- [x] Task 5.3: Re-capture and compare all 32+ viewport screenshots to ensure 0 visual regressions.
- [x] Task 5.4: Finalize `docs/design/CONFORMANCE.md` and `docs/design/PROGRESS.md`.
- [x] **Final Sign-off**: Deliver complete report to user.

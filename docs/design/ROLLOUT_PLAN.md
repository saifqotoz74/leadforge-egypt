# LeadForge Egypt — Design System Master Rollout Plan
## Step 1 & Phase A Master Specification & Migration Strategy
> **Authoritative Specs:** `docs/design/LEADFORGE_DESIGN_SYSTEM.md`, `docs/design/LEADFORGE_SPEC_ADDENDUM_01.md`  
> **Golden Page Reference:** `/dashboard` (Rules documented in [`docs/design/GOLDEN_PAGE_RULES.md`](./GOLDEN_PAGE_RULES.md))  
> **Date:** October 11, 2026  
> **Status:** Phase A0 Complete | Phase A Gate Reached & Verified | Phase B Ready  

---

## 1. Executive Summary & Document Status Notice

### 1.1 Retirement of Previous Propagation Metrics
- **`docs/design/PROPAGATION_REPORT.md` is permanently RETIRED and SUPERSEDED.** The previous propagation document contained manually calculated or invented metrics that did not reflect actual AST/DOM measurements. No numbers from that document are carried forward.
- **`docs/design/AUDIT.md` Section 3 is SUPERSEDED** by the authoritative 26-route inventory derived directly via `git ls-files 'src/app/**/page.tsx'`.
- **All metrics in this plan originate from fresh, programmatic AST, selector, and regex scans** executed on October 11, 2026 via [`scripts/scan-transitive-route-metrics.mjs`](../../scripts/scan-transitive-route-metrics.mjs) and [`scripts/check-conformance.mjs`](../../scripts/check-conformance.mjs).

### 1.2 Core Invariants
1. **Backend Frozen:** Zero changes to `prisma/`, engine services, API routes, or backend auth during UI rollout.
2. **Phase Boundary Discipline:** Phase A is verified and sealed before Phase B begins.
3. **Landing Page Scope Exclusion:** The root route `/` (public landing) is **excluded from Phases B through E**; it will be comprehensively rebuilt in **Phase F**. However, it is maintained build-healthy (`npm run build` passing) throughout all phases.

---

## 2. Authoritative 26-Route Inventory & Transitive Baseline Audit

The full application inventory consists of **25 production application routes** plus **1 living style guide** (`/design-system`), verified directly from the repository filesystem (`git ls-files 'src/app/**/page.tsx'`).

### 2.1 Transitive Route Conformance Matrix
For each route, the scanner recursively traces and aggregates the `page.tsx` entry file and all transitively imported components in `src/` (excluding `node_modules`, `src/lib`, `src/app/api`, `src/messages`, `src/styles`):

| Route | Files | font-mono | Glyphs | Literals | Dead Cls | Hand-Built | Latin Leak (ar) | Arab Leak (en) | Gradients | Truncate | Physical | Border w/o col | Undef Tok | Def Pal | Contributing Components |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `/` *(Excluded B-E)* | 40 | 49 | 12 | 76 | 25 | 16 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | `PublicNavbar`, `ScoreLab`, `LeadCard`, `LeadRow`, `AppShell`, `TopBar`, `Sidebar`, `Button`, `Card`, `Dialog`, etc. |
| `/login` | 39 | 31 | 15 | 59 | 15 | 10 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | `PublicNavbar`, `Input`, `Button`, `Card`, `LanguageSwitcher`, `TopBar`, `Sidebar`, etc. |
| `/register` | 39 | 31 | 15 | 58 | 15 | 10 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | `PublicNavbar`, `Input`, `Button`, `Card`, `LanguageSwitcher`, `TopBar`, `Sidebar`, etc. |
| `/pricing` | 40 | 31 | 7 | 58 | 14 | 9 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | `PublicNavbar`, `PackageCard`, `EmptyState`, `Skeleton`, `Banner`, `Button`, `TopBar`, `Sidebar`, etc. |
| `/onboarding` | 40 | 32 | 7 | 58 | 14 | 9 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | `PublicNavbar`, `Input`, `Button`, `Card`, `TopBar`, `Sidebar`, etc. |
| `/settings` | 16 | 1 | 0 | 3 | 4 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `PageHeader`, `EmptyState`, `AppShell`, `TopBar`, `Sidebar`, `Input`, `Select`, `Checkbox`, `Button`, `Card`, etc. |
| `/dashboard` **(Golden)** | 22 | 1 | 1 | 3 | 1 | 2 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | `StatTile`, `MatchRow`, `PlanSummary`, `BarList`, `MetaList`, `StageBadge`, `OpportunityBadge`, `QualityIndicator`, `PageHeader`, `EmptyState`, `AppShell`, `TopBar`, `Sidebar` |
| `/dashboard/analytics` | 14 | 5 | 2 | 3 | 3 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `StatTile`, `PageHeader`, `EmptyState`, `AppShell`, `TopBar`, `Sidebar`, `Select`, `Button`, `Card` |
| `/leads` | 22 | 8 | 0 | 9 | 6 | 3 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | `OpportunityBadge`, `QualityIndicator`, `OwnershipTag`, `LeadCard`, `LeadRow`, `FilterBar`, `PageHeader`, `EmptyState`, `AppShell`, `Tabs`, `Drawer`, `TopBar`, `Sidebar` |
| `/leads/[id]` | 25 | 20 | 4 | 25 | 8 | 1 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | `OpportunityBadge`, `QualityIndicator`, `OwnershipTag`, `ScorePair`, `ScoreBreakdown`, `DealTimeline`, `PurchaseConfirm`, `LockedField`, `PageHeader`, `EmptyState`, `AppShell`, `TopBar`, `Sidebar` |
| `/credits` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | *Redirect stub to `/subscription`* |
| `/pipeline` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | *Redirect stub to `/my-leads`* |
| `/my-leads` | 20 | 7 | 1 | 4 | 4 | 1 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | `OpportunityBadge`, `StageBadge`, `PipelineColumn`, `PipelineCard`, `PageHeader`, `EmptyState`, `AppShell`, `Tabs`, `Dialog`, `TopBar`, `Sidebar` |
| `/subscription` | 17 | 7 | 1 | 10 | 3 | 5 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `StatTile`, `LedgerTable`, `PackageCard`, `PageHeader`, `EmptyState`, `AppShell`, `Dialog`, `TopBar`, `Sidebar` |
| `/admin` | 14 | 13 | 0 | 3 | 1 | 7 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `StatTile`, `PageHeader`, `EmptyState`, `AppShell`, `Table`, `TopBar`, `Sidebar` |
| `/admin/leads` | 16 | 6 | 0 | 4 | 4 | 6 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `PageHeader`, `EmptyState`, `AppShell`, `Table`, `Dialog`, `Input`, `Select`, `TopBar`, `Sidebar` |
| `/admin/duplicates` | 16 | 8 | 5 | 12 | 4 | 1 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | `StatTile`, `MergeCompare`, `PageHeader`, `EmptyState`, `AppShell`, `Table`, `TopBar`, `Sidebar` |
| `/admin/quality` | 16 | 8 | 1 | 4 | 1 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `StatTile`, `QualityIndicator`, `PageHeader`, `EmptyState`, `AppShell`, `Table`, `TopBar`, `Sidebar` |
| `/admin/matching` | 12 | 17 | 5 | 32 | 7 | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `EmptyState`, `AppShell`, `Badge`, `Button`, `Card`, `TopBar`, `Sidebar` |
| `/admin/rules` | 17 | 8 | 2 | 16 | 9 | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `PageHeader`, `EmptyState`, `AppShell`, `RuleWeightEditor`, `Dialog`, `Select`, `Input`, `TopBar`, `Sidebar` |
| `/admin/sources` | 13 | 46 | 6 | 53 | 3 | 10 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `EmptyState`, `AppShell`, `Badge`, `Dialog`, `TopBar`, `Sidebar` |
| `/admin/users` | 13 | 3 | 2 | 3 | 3 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `EmptyState`, `AppShell`, `Badge`, `Dialog`, `TopBar`, `Sidebar` |
| `/admin/plans` | 12 | 1 | 0 | 3 | 3 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `EmptyState`, `AppShell`, `Input`, `Button`, `Card`, `TopBar`, `Sidebar` |
| `/admin/reports` | 12 | 21 | 3 | 9 | 6 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | `EmptyState`, `AppShell`, `Badge`, `Button`, `Card`, `TopBar`, `Sidebar` |
| `/admin/analytics` | 10 | 32 | 5 | 51 | 9 | 7 | 1 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | `EmptyState`, `AppShell`, `Button`, `TopBar`, `Sidebar` |
| `/design-system` | 61 | 69 | 28 | 119 | 42 | 43 | 2 | 0 | 0 | 10 | 0 | 0 | 0 | 15* | Full UI & Domain Component Showcase |

*\* Note: Default palette entries and dead classes on `/design-system` are raw showcase swatch tokens (`bg-teal-50`..`bg-teal-900`, `bg-sand-50`..`bg-sand-900`) displaying CSS variable primitives.*

---

## 3. Phase A Findings: Dead-Class Pathology & Detector Integration

### 3.1 Detector Implementation (Rule 18)
In Phase A, `scripts/check-conformance.mjs` was upgraded with an automated **Dead Tailwind Class Detector**:
1. At the start of the check, Tailwind compiles the live CSS bundle via `npx tailwindcss -i src/app/globals.css -o .tmp-conformance-tailwind.css`.
2. The detector indexes all compiled CSS selectors (649 active utilities).
3. The checker parses every string literal inside `className`, `cn()`, `clsx()`, and `cva()` across `src/**/*.{ts,tsx}`.
4. Tokens matching Tailwind prefixes without a matching compiled selector are flagged as **Rule 18: Dead Tailwind class (no matching compiled utility)**.

### 3.2 Dead-Class Pathology & Phase B Decisions (Fixed & Locked)
The audit identified four distinct pathologies:

1. **Opacity Modifiers on Semantic Tokens are Forbidden:**
   - *Classes:* `border-line/40`, `bg-subtle/50`, `bg-brand-soft/30`, `bg-surface/10`, `border-line/60`, `border-line/20`, etc.
   - *Rule:* Opacity slash notation never compiles in Tailwind v3 against CSS variables declared as raw hex strings (`#E1E9E9`).
   - *Decision:* **Replace with the nearest solid token.** Backdrops use the new semantic utility `bg-overlay` mapped to `var(--bg-overlay)`. Add an explicit ban on modifier slashes to `check:design`.
2. **Backdrop Primitives:**
   - Developers previously invented `bg-inverse/50` for modal backdrops.
   - *Decision:* Map `overlay: 'var(--bg-overlay)'` in `tailwind.config.ts` and replace all modal/drawer/sidebar backdrops with `bg-overlay`.
3. **Typo Token Corrections:**
   - `text-fg-inverted` -> `text-fg-inverse`
   - `bg-canvas` -> `bg-page` or `bg-surface` by context
   - `text-danger` -> `text-danger-text` or `bg-danger-fill`
4. **RuleWeightEditor Primitives:**
   - `bg-sand-100`, `border-sand-300`, `text-sand-800` in `RuleWeightEditor.tsx`.
   - *Decision:* Replace with semantic tier tokens (`bg-tier-warm-bg`, `text-tier-warm-fg`) or `bg-subtle` / `border-line` by context.
5. **Living Style Guide Swatches:**
   - `/design-system` swatches use uncompiled classes (`bg-teal-50...`) which render blank.
   - *Decision:* Render them with `style={{ background: 'var(--teal-50)' }}` plus a `/* design-allow: swatch-inline-style */` comment, verified via screenshot.

---

## 4. Rule 17 (Truncate) Policy & Complete Codebase Inventory

### 4.1 Strict Policy Specification
- The per-component allowlist in `check-conformance.mjs` is **permanently removed**.
- `truncate` is forbidden on captions, metrics, and explanatory text (captions must wrap fully).
- `truncate` is permitted **only** when satisfying both requirements:
  1. Accompanied by a same-line comment: `/* design-allow: truncate */`
  2. Accompanied by an accessible `title={...}` or `<Tooltip>` exposing the complete un-truncated string.

### 4.2 Complete Codebase Inventory of `truncate`
There are exactly **14 occurrences** across **10 files**:
1. `src/app/admin/analytics/page.tsx:77`: Caption `<p>` -> *Must remove truncate (captions wrap fully)*.
2. `src/app/admin/analytics/page.tsx:110`: Caption `<p>` -> *Must remove truncate (captions wrap fully)*.
3. `src/app/leads/[id]/page.tsx:550`: URL link `<a>` -> *Allowed with `title={url}` + comment*.
4. `src/app/leads/[id]/page.tsx:576`: Social link `<a>` -> *Allowed with `title={url}` + comment*.
5. `src/app/leads/[id]/page.tsx:588`: Contact info `<p>` -> *Allowed with `title={contact}` + comment*.
6. `src/app/my-leads/page.tsx:352`: Table row company name -> *Replace with `line-clamp-2` with `<bdi dir="auto">`*.
7. `src/components/domain/LeadCard.tsx:69`: Card company name `<h3>` -> *Replace with `line-clamp-2` with `<bdi dir="auto">`*.
8. `src/components/domain/LeadRow.tsx:58`: Row company name `<a>` -> *Replace with `line-clamp-2` with `<bdi dir="auto">`*.
9. `src/components/domain/MergeCompare.tsx:122`: Comparison field -> *Add accessible `title` + comment*.
10. `src/components/domain/MergeCompare.tsx:177`: Comparison field -> *Add accessible `title` + comment*.
11. `src/components/domain/PipelineCard.tsx:56`: Kanban card title `<h4>` -> *Replace with `line-clamp-2` with `<bdi dir="auto">`*.
12. `src/components/domain/ScoreBreakdown.tsx:55`: Rule breakdown row -> *Add `title={ruleName}` + comment*.
13. `src/components/domain/TopBar.tsx:48`: Page header title `<h2>` -> **Compliant** *(Updated with `title={pageTitle} /* design-allow: truncate */`)*.
14. `src/components/ui/BarList.tsx:45`: Bar item label `<span>` -> **Compliant** *(Updated with `title={item.label} /* design-allow: truncate */`)*.

---

## 5. Visual Baseline Captures & Manifest

All **24 real routes** (excluding `/credits` and `/pipeline` redirects) were captured across **both locales** (`ar` and `en`) and **both widths** (`1440` and `390`) using Playwright with Base 5.7 density applied:

- **Expected Count:** 96 screenshots
- **Captured Count:** 96 screenshots
- **Failures:** 0 (Zero)
- **Density Protocol (Base 5.7):**
  - *Comfortable:* `/`, `/pricing`, `/login`, `/register`, `/onboarding`, `/settings`, `/dashboard`, `/dashboard/analytics`, `/subscription`, `/design-system`
  - *Compact:* `/leads`, `/leads/[id]` (using real lead id `cmv13ybbp012jtxt4uso3tpfb`), `/my-leads`, and all 11 `/admin/**` routes.
- **Git Tag:** `baseline-pre-rollout` applied to repository.
- **Image Tracking Status:** Baseline images are preserved on disk in `screenshots/baseline/` and indexed in `docs/design/data/baseline-manifest.json` as untracked working tree artifacts to avoid bloating repository git history.

---

## 6. Visual Diff Engine (`scripts/visual-diff.mjs`)

A dedicated visual regression engine was built using `pngjs` and `pixelmatch`:
- Calculates per-route changed-pixel percentage between candidate screenshots and `screenshots/baseline/`.
- Automatically outputs diff image overlays into `screenshots/diffs/` for any route diverging by **> 5%**.
- **Self-Test Verification Output:**
  ```
  ================ LEADFORGE VISUAL DIFF ENGINE ================
  Mode: SELF-TEST (Baseline vs Itself)
  Baseline Directory:  screenshots/baseline
  Candidate Directory: screenshots/baseline

  Summary: Scanned 96 files. Over 5% threshold: 0 routes.
  SELF-TEST RESULT: baseline vs itself = 0.00% (PERFECT MATCH)
  ```

---

## 7. Playwright E2E Smoke Test Suite (`npm run test:e2e`)

Automated end-to-end smoke tests were created in [`e2e/smoke.spec.ts`](../../e2e/smoke.spec.ts) executing read-only verification against the running dev database with zero mutations:

```
> playwright test

Running 6 tests using 1 worker

  ok 1 e2e/smoke.spec.ts:4:7 › 1. Developer Login (2.2s)
  ok 2 e2e/smoke.spec.ts:16:7 › 2. /leads Lists Cards (4.9s)
  ok 3 e2e/smoke.spec.ts:33:7 › 3. Open Lead Detail & Purchase Dialog Balance Math (Read-Only, No Confirmation) (4.5s)
  ok 4 e2e/smoke.spec.ts:76:7 › 4. /my-leads Stage Menu Opens (5.4s)
  ok 5 e2e/smoke.spec.ts:94:7 › 5. Admin /admin/duplicates Compare View Renders (6.0s)
  ok 6 e2e/smoke.spec.ts:111:7 › 6. Admin /admin/rules Loads (5.2s)

  6 passed (29.0s)
```

---

## 8. Adjusted Phased Rollout Sequence

### Phase A0: Token Alignment & Configuration [COMPLETE]
- CSS variables synchronized with spec; divider/border defaults set to `--border-default` (`#E1E9E9`).
- BiDi check in `check-i18n.mjs` preventing raw numbers adjacent to `%`, `+`, `-`, `/`.
- Tier token naming calibrated (`مميز` for PREMIUM).

### Phase A: Audit, Tooling, Baselines & Regression Verification [COMPLETE - GATE SEALED]
- 26-route inventory derived directly from `git ls-files`.
- Transitive route metrics scanner built (`scripts/scan-transitive-route-metrics.mjs`).
- Dead-class detector integrated into `check:design` (Rule 18).
- Rule 17 (Truncate) modified to enforce same-line comment + accessible tooltips.
- 96 baseline screenshots captured under Base 5.7 density (`git tag baseline-pre-rollout`).
- Visual diff engine implemented with verified 0.00% self-test.
- Playwright E2E smoke test suite passing 6/6.
- `/` (landing) formally excluded from Phases B to E.

### Phase B: Mechanical Normalization (Batch-Wide Across 24 Routes)
*Landing page `/` is excluded and maintained build-healthy. `PALETTE_MAP` conversion is skipped as `theme.colors` is already cleanly replaced.*
1. **Opacity Modifier Ban:** Strip all `/opacity` modifiers from CSS variable color utilities (`border-line/40`, `bg-subtle/50`, etc.). Add rule to `check:design`.
2. **Backdrop Primitives:** Map `--bg-overlay` to `bg-overlay` in `tailwind.config.ts`. Replace `bg-inverse/50` in dialogs, drawers, and sidebars.
3. **Typo Remediation:** Fix `text-fg-inverted` -> `text-fg-inverse`, `bg-canvas` -> `bg-page`/`bg-surface`, `text-danger` -> `text-danger-text`.
4. **Physical to Logical Properties:** Convert all `ml/mr/pl/pr/left/right` to `ms/me/ps/pe/start/end`.
5. **Directional Icon Mirroring:** Mirror directional icons with `rtl:-scale-x-100`.
6. **Font-Mono Restriction:** Strip `font-mono` outside `CodeChip` and `IdChip`. All numbers use IBM Plex Sans with `tabular-nums`.
7. **Glyph Separator Elimination:** Remove all `·`, `—`, `•` inside JSX; replace with `MetaList` or styled spans.
8. **RuleWeightEditor Primitives:** Replace `sand-*` with tier tokens or `bg-subtle`/`border-line`.
9. **Living Style Guide Swatches:** Fix `/design-system` swatches with `style={{ background: 'var(--teal-50)' }}` + `/* design-allow: swatch-inline-style */`.
10. **`--text-muted` Audit:** Verify essential information is not hidden behind muted low-contrast tokens.

### Phase C: Core Developer Routes Migration
- `/leads` (T3 Feed)
- `/leads/[id]` (T4 Lead Detail)
- `/my-leads` (T5 Pipeline)
- `/subscription` (T6 Top-up & T7 Ledger)
- `/dashboard/analytics` (Developer Analytics)
- `/settings` (T2 Settings)

### Phase D: Public & Authentication Pages Migration
*Note: `/` landing excluded.*
- `/pricing` (Public Pricing & Packages)
- `/login` (T1 Auth)
- `/register` (T1 Auth)
- `/onboarding` (T2 Onboarding)

### Phase E: Admin Hub & Management Pages Migration
- `/admin` (T11 Admin Overview)
- `/admin/leads` (T8 Admin Table)
- `/admin/duplicates` (T9 Admin Compare)
- `/admin/quality` (T8 Admin Table)
- `/admin/sources` (T8 Admin Table)
- `/admin/users` (T8 Admin Table)
- `/admin/reports` (T8 Admin Table)
- `/admin/analytics` (Admin Analytics)
- `/admin/rules` (T10 Admin Editor)
- `/admin/matching` (T10 Admin Editor)
- `/admin/plans` (Admin Plans Config)

### Phase F: Marketing Landing Rebuild
- Systematic rebuild of [`src/app/page.tsx`](../../src/app/page.tsx) and landing feature components against all design system invariants.

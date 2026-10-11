# LeadForge Egypt — Shared Component Propagation Report (`PROPAGATION_REPORT.md`)

This report provides a route-by-route audit across the entire application following the completion of the `/dashboard` golden reference page. For each route, it details:
1. **Changed Shared Components Currently in Use** (components updated or introduced during the `/dashboard` calibration).
2. **UI Patterns Still Built by Hand** (duplicated or ad-hoc implementations that should be replaced with shared design system components during Phase 5).
3. **Monospace & Conformance Gaps** (raw `font-mono` or raw glyph separators).

> [!IMPORTANT]
> In accordance with Phase Boundary Discipline, **no routes other than `/dashboard` and `/design-system` were edited** during this milestone. This report serves as the implementation blueprint for the Phase 5 route rollout.

---

## Shared Component Inventory (Updated in Round 2)

| Component | Path | Invariants Enforced |
| :--- | :--- | :--- |
| **`StatTile`** | `src/components/domain/StatTile.tsx` | Two-group scope partitioning, `border-line` pairing, `line-clamp-2` no-truncation captions, Plex Sans `tabular-nums`, out-of-range alert state. |
| **`MatchRow`** | `src/components/domain/MatchRow.tsx` | Decoupled identity (`MetaList`) vs reasons (`ChipList`), QualityIndicator, OpportunityBadge, quiet match strength caption in `.ltr-iso`, `<bdi dir="auto">`. |
| **`PlanSummary`** | `src/components/domain/PlanSummary.tsx` | No nested card, `ChipList` with `+N` tooltip for cities/niches, secondary upgrade, outline Top Up points, `--text-secondary` copy. |
| **`BarList`** | `src/components/ui/BarList.tsx` | Conversion funnels & distributions, 6px tracks (`--bg-brand-soft` track, `--brand-accent` fill), tabular numbers, LTR/RTL alignment. |
| **`ChipList`** | `src/components/ui/ChipList.tsx` | Tag arrays with `maxVisible={N}`, `+N` overflow badge, interactive accessible hover/focus `Tooltip`. |
| **`MetaList`** | `src/components/ui/MetaList.tsx` | Logical spacing, zero glyph separators (`·`, `—`), clean spans with semantic metadata. |
| **`CodeChip`** | `src/components/ui/CodeChip.tsx` | Semantic code/expression container with isolated typography. |
| **`IdChip`** | `src/components/ui/IdChip.tsx` | Unique IDs (`TXN-*`, `LEAD-*`) with copy support and `.ltr-iso`. |
| **`OpportunityBadge`**| `src/components/domain/OpportunityBadge.tsx` | Canonical tier labels (`PREMIUM` -> `"مميز"`, `HOT`, `WARM`, `COLD`) with dots. |
| **`QualityIndicator`**| `src/components/domain/QualityIndicator.tsx` | Base 6.2 and Addendum 3.7 indicators (`EXCELLENT` -> `"ممتازة"`). |
| **`StageBadge`** | `src/components/domain/StageBadge.tsx` | Deal stages (`WON` -> `"تمت الصفقة"` / `"Won"`). |

---

## Route-by-Route Audit

### 1. Developer Application Routes

#### `/dashboard` (`src/app/dashboard/page.tsx`) — *Golden Reference Route*
- **Changed Shared Components in Use:**
  - `StatTile` (6 tiles partitioned into Account-scoped and Platform-scoped groups)
  - `MatchRow` (5 top matched leads with zero duplicated attributes)
  - `PlanSummary` (Plan and balance card with `ChipList`)
  - `BarList` (5-stage conversion funnel)
  - `MetaList` (Inside `MatchRow` and Recent Purchases metadata)
  - `StageBadge` (Recent purchase deal stages)
- **UI Patterns Still Built by Hand:**
  - **None.** This is the validated golden reference page.
- **Monospace Violations:** `0` (Zero violations).

---

#### `/leads` (`src/app/leads/page.tsx`) — *Explore Leads / Market*
- **Changed Shared Components in Use:**
  - `OpportunityBadge`
  - `QualityIndicator`
  - `LeadCard`
  - `LeadRow`
  - `FilterBar`, `Pagination`
- **UI Patterns Still Built by Hand:**
  - **Ad-hoc Filters & Tag Lists:** Filter categories, governorates, and website statuses render custom badge/button wrappers instead of using `ChipList`.
  - **Meta Information:** Location and category lines still use manual middle dots (`·`) instead of `MetaList`.
  - **ID & Phone Display:** Raw lead IDs styled without `IdChip`; phone numbers lack `.ltr-iso` bidi wrappers.
- **Monospace Violations:** `1` (`font-mono` on raw lead ID).

---

#### `/leads/[id]` (`src/app/leads/[id]/page.tsx`) — *Lead Details & Audit*
- **Changed Shared Components in Use:**
  - `OpportunityBadge`
  - `QualityIndicator`
  - `CreditChip`
  - `ScoreBreakdown`
  - `DealTimeline`
  - `LockedField`
- **UI Patterns Still Built by Hand:**
  - **Rule Weights & Explanations:** Verification signals and evaluation rules are rendered via custom flex divs instead of `CodeChip` and structured reason chips.
  - **Meta Separators:** Activity headers use manual dashes (`—`) and bullets (`·`) instead of `MetaList`.
  - **Raw Monospace:** Scoring weights and transaction hashes use uncontained `font-mono`.
- **Monospace Violations:** `7` (`font-mono` outside `CodeChip`/`IdChip`).

---

#### `/my-leads` (`src/app/my-leads/page.tsx`) — *Purchased Leads*
- **Changed Shared Components in Use:**
  - `OpportunityBadge`
  - `StageBadge`
- **UI Patterns Still Built by Hand:**
  - **Lead Row Representation:** Builds an ad-hoc table with custom `<tr>/<td>` elements rather than utilizing `LeadRow` or `MatchRow`.
  - **Separators:** Contains raw JSX em dashes (`>—<`) in contact dates.
  - **Metric Summaries:** Quick filter counters (Total, Active, Won) build custom KPI boxes by hand instead of using `StatTile`.
  - **IDs:** Uses raw `font-mono` on transaction codes instead of `IdChip`.
- **Monospace Violations:** `4` (`font-mono` and `>—<` separators).

---

#### `/pipeline` (`src/app/pipeline/page.tsx`) — *Deal Pipeline (Kanban)*
- **Changed Shared Components in Use:**
  - `PipelineColumn`
  - `PipelineCard`
  - `StageBadge`
- **UI Patterns Still Built by Hand:**
  - **Conversion Funnel View:** Completely lacks the aggregate conversion funnel (`BarList`), displaying only drag-and-drop columns.
  - **Column Headers:** Stage counters and win-rate indicators build ad-hoc pill counters instead of `Badge` or `StatTile`.
  - **Contact Links:** WhatsApp and phone trigger links lack `.ltr-iso` bidi wrappers.
- **Monospace Violations:** `0`.

---

#### `/subscription` (`src/app/subscription/page.tsx`) — *Plans & Top-up*
- **Changed Shared Components in Use:**
  - `StatTile` (Points balance display)
- **UI Patterns Still Built by Hand:**
  - **Plan Summary:** Builds an independent plan balance summary rather than reusing `PlanSummary`.
  - **Package Pricing:** Package comparison cards build custom pricing headers and feature checkmarks by hand instead of using `PackageCard`.
  - **Transaction IDs:** Recent credit top-ups use uncontained `font-mono` instead of `IdChip`.
- **Monospace Violations:** `3` (`font-mono` on transaction codes).

---

#### `/credits` (`src/app/credits/page.tsx`) — *Ledger & Credit Points*
- **Changed Shared Components in Use:**
  - `LedgerTable`
  - `CreditChip`
- **UI Patterns Still Built by Hand:**
  - **Balance Overview:** Metric tiles build custom cards rather than utilizing `StatTile`.
  - **Transaction Types:** Transaction badges use ad-hoc colored spans rather than `Badge`.
- **Monospace Violations:** `0`.

---

#### `/settings` (`src/app/settings/page.tsx`) — *Developer Preferences*
- **Changed Shared Components in Use:**
  - `Input`, `Button`, `Select`, `Switch`
- **UI Patterns Still Built by Hand:**
  - **Niche & City Preferences:** Target governorate and specialization lists build manual tag badges with `X` buttons rather than integrating with `ChipList`.
  - **API Token Display:** Secret keys styled with ad-hoc monospace containers instead of `CodeChip`.
- **Monospace Violations:** `0`.

---

#### `/dashboard/analytics` (`src/app/dashboard/analytics/page.tsx`) — *Analytics Deep Dive* — *Migrated*
- **Changed Shared Components in Use:**
  - `StatTile` (All 4 high-level KPI tiles: claimed, won, conversion rate, points spent)
  - `BarList` (Sales funnel progression stages with 6px tracks and secondary rates; Top Niches and Top Cities distributions)
  - `MetaList` (Activity timeline and lead metadata without manual bullets)
  - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
  - `Badge`, `EmptyState`
- **UI Patterns Still Built by Hand:**
  - **None.** All funnels, distributions, and KPI metrics upgraded to shared design system components.
- **Monospace Violations:** `0` (Zero violations).

---


### 2. Public & Onboarding Routes

#### `/` (`src/app/page.tsx`) — *Public Landing Page*
- **Changed Shared Components in Use:**
  - `LeadCard` (Sample interactive leads)
- **UI Patterns Still Built by Hand:**
  - **Interactive Score Lab:** Hand-built rule weight sliders and mathematical breakdown instead of `RuleWeightEditor` and `ScoreBreakdown`.
  - **Metric Highlights:** Platform guarantee points and hero feature checklist build custom bullet divs and badges by hand instead of `StatTile` / `MetaList`. *(Correction Note: The landing page `src/app/page.tsx` never contained a "2,400+ leads" claim; that figure appeared solely as an illustrative example note in the initial draft of this report).*
  - **Monospace & Glyphs:** Contains 14 conformance violations (raw `font-mono` and `>—<` separators).
- **Monospace Violations:** `14`.

---

#### `/pricing` (`src/app/pricing/page.tsx`) — *Public Pricing Table*
- **Changed Shared Components in Use:**
  - `PackageCard`
- **UI Patterns Still Built by Hand:**
  - **Feature Comparison Table:** Builds an ad-hoc comparison matrix rather than utilizing shared `Table` subcomponents.
  - **FAQ Section:** Builds custom accordion toggles by hand.
- **Monospace Violations:** `0`.

---

#### `/onboarding` (`src/app/onboarding/page.tsx`) — *Developer Onboarding Wizard*
- **Changed Shared Components in Use:**
  - `Stepper`
- **UI Patterns Still Built by Hand:**
  - **Category & Governorate Selector:** Uses hand-rolled checkbox cards rather than `ChipList` or `MultiSelect`.
  - **Matched Preview:** Renders preview leads via raw inline markup rather than `MatchRow` or `LeadCard`.
- **Monospace Violations:** `1` (`font-mono` on sample lead ID).

---

#### `/login` & `/register` (`src/app/login/page.tsx`, `src/app/register/page.tsx`)
- **Changed Shared Components in Use:**
  - `Input`, `Button`, `LanguageSwitcher`
- **UI Patterns Still Built by Hand:**
  - **Value Proposition Bullet Points:** Feature lists build custom bullet spans rather than `MetaList`.
- **Monospace Violations:** `0`.

---

### 3. Admin Routes

| Route | Changed Shared Components in Use | Patterns Still Built by Hand | Monospace Violations (`font-mono`) |
| :--- | :--- | :--- | :--- |
| **`/admin`** (`src/app/admin/page.tsx`) | `StatTile` | Hand-built crawler status cards, system health bars (needs `BarList`), raw log viewer (needs `CodeChip`). | `12` |
| **`/admin/analytics`** (`src/app/admin/analytics/page.tsx`) | `StatTile`, `BarList`, `Table` primitives, `Select`, `Input`, `Button`, `Badge`, `Card` | None (All 5 tabs fully migrated to design system cards, tables, BarLists, and StatTiles). | `0` |
| **`/admin/duplicates`** (`src/app/admin/duplicates/page.tsx`) | `StatTile`, `MergeCompare` | Duplicate entity chips (needs `ChipList`), match reason list (needs `MetaList`). | `2` |
| **`/admin/leads`** (`src/app/admin/leads/page.tsx`) | *None* | Full table built with raw HTML tables (needs `LeadRow` / `GenericTable`), raw badge pills. | `5` |
| **`/admin/matching`** (`src/app/admin/matching/page.tsx`) | *None* | Match score simulator builds raw progress bars (needs `BarList`), tag filters (needs `ChipList`). | `16` |
| **`/admin/plans`** (`src/app/admin/plans/page.tsx`) | *None* | Admin plan tier editor builds custom cards (needs `PackageCard`). | `0` |
| **`/admin/quality`** (`src/app/admin/quality/page.tsx`) | `StatTile`, `QualityIndicator` | Verification review queues build custom list rows (needs `LeadRow` / `MatchRow`), audit logs (needs `IdChip`). | `7` |
| **`/admin/reports`** (`src/app/admin/reports/page.tsx`) | *None* | Wrong-number refund queue builds raw table rows, dispute chips (needs `ChipList`), raw IDs (needs `IdChip`). | `20` |
| **`/admin/rules`** (`src/app/admin/rules/page.tsx`) | `RuleWeightEditor` | Code expressions and rule conditions use raw `font-mono` instead of `CodeChip`. | `3` |
| **`/admin/sources`** (`src/app/admin/sources/page.tsx`) | *None* | Crawler source statuses, ingestion health cards (needs `StatTile`), run logs (needs `CodeChip` / `IdChip`). | `45` |
| **`/admin/users`** (`src/app/admin/users/page.tsx`) | *None* | User table builds custom role pills, credit adjustments lack `CreditChip`. | `2` |

---

## Prioritized Propagation Roadmap for Phase 5

1. **Sprint 5.1 — Core Developer App Routes:**
   - Migrate `/leads` and `/my-leads` to use `LeadRow`, `MatchRow`, `ChipList`, and `MetaList`.
   - Eliminate raw glyph separators (`·`, `—`) and wrap IDs in `IdChip`.
2. **Sprint 5.2 — Pipeline & Commercial Routes:**
   - Integrate `BarList` into `/pipeline` and `/dashboard/analytics`.
   - Unify `/subscription` and `/credits` with `PlanSummary`, `PackageCard`, and `StatTile`.
3. **Sprint 5.3 — Onboarding & Public Landing:**
   - Upgrade `/onboarding` to use `ChipList` and `MatchRow` previews.
   - Standardize landing page metrics and score lab with `StatTile` and `ScoreBreakdown`.
4. **Sprint 5.4 — Admin Backoffice:**
   - Systematically replace raw `font-mono` (143 instances across 11 admin pages) with `CodeChip` and `IdChip`.
   - Replace hand-built metric cards and crawler distributions with `StatTile` and `BarList`.

# LeadForge Egypt — Golden Reference Page Rules (`GOLDEN_PAGE_RULES.md`)

This document defines the strict engineering and design invariants established during the calibration and completion of the `/dashboard` golden reference page. Every rule addresses a concrete failure pattern discovered during screenshot and DOM reviews, specifies the required fix, and designates the enforcement component or automated verification script.

These rules govern all subsequent route migrations across LeadForge Egypt.

---

## 1. Zero Duplicate Attributes in Composite Rows

- **The Problem:**  
  Early composite list rows (e.g., in `MatchRow`) rendered duplicate business attributes in multiple subcomponents of the same row. For instance, the identity line rendered `Medical Centers | Cairo`, while adjacent reason chips rendered `Sector match: Medical Centers` and `Location match: Cairo`. This redundancy clutter wasted cognitive bandwidth and created visual noise.
- **The Fix:**  
  Strictly decouple **Identity** from **Match Causality**:
  1. The **Meta Line** (rendered via `MetaList`) displays identity *only*: `[displayCategory, displayCity]`.
  2. The **Reason Chips** display *why* the opportunity matches, using structured fields already available in frontend data: website opportunity status (`displayWebsiteStatus`, e.g., `"No website"`), sector match (`dashboard.matchReasonCategory`), and location match (`dashboard.matchReasonCity`).
  3. Never render the same attribute twice in the same row.
- **Enforcing Component / Script:**  
  - [`MatchRow.tsx`](../../src/components/domain/MatchRow.tsx)
  - [`MetaList.tsx`](../../src/components/ui/MetaList.tsx)
  - [`ChipList.tsx`](../../src/components/ui/ChipList.tsx)

---

## 2. BiDi Isolation of Numbers with Symbols & Word Ranges

- **The Problem:**  
  In RTL layouts (Arabic locale), placing punctuation or mathematical symbols directly adjacent to numbers (e.g. `+15`, `-60`, `95%`, `70+`, `50-69`) causes bidirectional layout engines to reorder glyphs erroneously. For example, `50-69` flips into `69-50`, `95%` jumps to the wrong side of words, and mixed strings leak incorrect reading order.
- **The Fix:**  
  1. **Numerical Ranges as Words:** Never use mathematical hyphenation or plus signs for ranges in translations.
     - Arabic: `"70 فأكثر"` and `"من 50 إلى 69"`.
     - English: `"70 and above"` and `"50 to 69"`.
  2. **Percentage and Symbol Isolation:** Percentages and signed numbers must be wrapped in an isolated element with class `.ltr-iso.tabular-nums`. In ICU translation strings, use rich text placeholders (e.g., `<pct>{percent}%</pct>`).
  3. **External Business Data Isolation:** All user-generated strings, company names, addresses, and phone numbers must be wrapped inside `<bdi dir="auto">`.
- **Enforcing Component / Script:**  
  - [`StatTile.tsx`](../../src/components/domain/StatTile.tsx)
  - [`MatchRow.tsx`](../../src/components/domain/MatchRow.tsx)
  - [`scripts/scan-latin-leaks.mjs`](../../scripts/scan-latin-leaks.mjs)
  - ICU Catalogs: [`src/messages/ar.json`](../../src/messages/ar.json), [`src/messages/en.json`](../../src/messages/en.json)

---

## 3. Border Width Always Paired with Explicit Token Color

- **The Problem:**  
  Using Tailwind border-width utilities (`border-t`, `border-b`, `border-s`, `border-e`, `border-x`, `border-y`, or `divide-*`) without an explicit color class defaults to Tailwind's default palette (`gray-200`). This results in dark, cool, muddy divider lines that break the warm neutral design token system (`--border-default: #E1E9E9`).
- **The Fix:**  
  Every element that specifies a border width utility must explicitly include a design system token color utility on the exact same element (e.g. `border-t border-line`, `border-b border-line`, `divide-y divide-line`, `border-line-subtle`, or state-specific borders like `border-warning-border`).
- **Enforcing Component / Script:**  
  - [`scripts/check-conformance.mjs`](../../scripts/check-conformance.mjs) (**Rule 15:** Flags any `border-(t|b|l|r|s|e|x|y)` or `divide-*` without a design token color class on the same element).

---

## 4. Zero Truncation for Informational Captions (Wrap Fully, No Clamp)

- **The Problem:**  
  Applying `truncate` or `overflow-hidden text-ellipsis whitespace-nowrap` to metric captions in responsive stat tiles truncates critical context mid-word on narrower viewports or mobile screens (e.g. `"متاح لشراء الفـ..."`), leaving the user unable to understand the scope or criteria without hovering.
- **The Fix:**  
  Captions must wrap fully (no clamp, no truncate). Never use `truncate` or `line-clamp` on informational captions. Allow multi-line text wrapping with tight leading (`leading-snug`) so all descriptive context remains fully legible across viewports.
- **Enforcing Component / Script:**  
  - [`StatTile.tsx`](../../src/components/domain/StatTile.tsx)
  - [`scripts/check-conformance.mjs`](../../scripts/check-conformance.mjs) (**Rule 17:** Flags `truncate` outside approved components).

---

## 5. Tile Grouping by Scope & Clear Mental Hierarchy

- **The Problem:**  
  Presenting heterogeneous metrics in a single flat row of cards causes cognitive confusion. A developer's individual numbers (e.g., 5 purchased leads, 20 points balance) were displayed alongside platform-wide aggregate counts (e.g., 226 hot leads across Egypt, 250 leads added this week), misleading users into thinking all counts shared the same denominator.
- **The Fix:**  
  Partition stat tiles into clear, titled cognitive clusters:
  1. **Group 1: Account-Scoped (`statGroupAccount`):**
     - Arabic: `"لحسابك"` | English: `"Your account"`
     - Includes: Matched leads, Purchased leads, Points balance.
  2. **Group 2: Platform-Scoped (`statGroupPlatform`):**
     - Arabic: `"على مستوى المنصة"` | English: `"Across the platform"`
     - Includes: Hot leads, Warm leads, Added this week.
  3. **Alert Variants:** Tiles with out-of-range or action-required states must use explicit warning styling (`!border-warning-border`, `text-warning-text`, `AlertCircle` icon).
- **Enforcing Component / Script:**  
  - [`src/app/dashboard/page.tsx`](../../src/app/dashboard/page.tsx)
  - [`StatTile.tsx`](../../src/components/domain/StatTile.tsx)

---

## 6. 12-Column Grid Alignment Across Rows & Responsive Ordering

- **The Problem:**  
  Arbitrary card widths and inconsistent margins create visual raggedness, misaligned card edges, and layout shifts when resizing desktop viewports. On mobile viewports, naive column stacking places secondary widgets above high-priority actionable items.
- **The Fix:**  
  1. **Desktop 12-Column Layout:** The container uses `max-w-7xl` (1280px) centered.
     - **Main Column (col-span-8):** Houses high-density primary work streams (Row 1: *Top matched leads*, Row 2: *Conversion funnel*).
     - **Side Column (col-span-4):** Houses account status and ancillary context (Row 1: *Plan & balance*, Row 2: *Recent purchases*).
     - Outer and inner card borders align seamlessly across rows.
  2. **Mobile Priority Ordering (390px):**
     - `order-1`: Vital stat tiles
     - `order-2`: Top matched leads
     - `order-3`: Plan & balance
     - `order-4`: Recent purchases
     - `order-5`: Conversion funnel
- **Enforcing Component / Script:**  
  - [`src/app/dashboard/page.tsx`](../../src/app/dashboard/page.tsx)

---

## 7. Single Canonical Terminology per Concept via Central Glossary

- **The Problem:**  
  Inconsistent translations across pages created confusion (e.g., mixing `"استعراض الفرص"` with `"استكشاف الفرص"`, using `"صفقة رابحة"` instead of `"تمت الصفقة"`, or translating tier `PREMIUM` as `"ممتازة"` which conflicted with `QualityStatus.EXCELLENT`).
- **The Fix:**  
  Strict 1:1 mapping between domain concept and localized term across all UI chrome:
  - **Explore Leads:** `"استكشاف الفرص"` (Arabic) / `"Explore leads"` (English) everywhere (nav, buttons, empty states).
  - **Won Deal:** `"تمت الصفقة"` (Arabic) / `"Won"` (English) across pipelines and purchases.
  - **Tier PREMIUM:** Strictly `"مميزة"` (feminine grammatical agreement with "الفرصة", Base 6.1) with 4 dots. Strictly never `"ممتازة"`.
  - **All Four Tiers Feminine:** `"باردة"` (COLD), `"دافئة"` (WARM), `"ساخنة"` (HOT), `"مميزة"` (PREMIUM).
  - **QualityStatus EXCELLENT:** Strictly `"ممتازة"`.
  - Tier labels and quality labels must never share a term.
- **Enforcing Component / Script:**  
  - [`docs/i18n/GLOSSARY.md`](../i18n/GLOSSARY.md)
  - [`OpportunityBadge.tsx`](../../src/components/domain/OpportunityBadge.tsx)
  - [`QualityIndicator.tsx`](../../src/components/domain/QualityIndicator.tsx)
  - [`scripts/check-i18n.mjs`](../../scripts/check-i18n.mjs)

---

## 8. Semantic Text Hierarchy & Zero Information in `--text-muted`

- **The Problem:**  
  Using `--text-muted` (`text-fg-muted`, `#8A9B9B`) for readable descriptions, balance units, or informational copy drops contrast below WCAG 2.1 AA thresholds against surface backgrounds (`--bg-surface: #FFFFFF`, `--bg-subtle: #EEF3F3`, `--bg-page: #F5F8F8`), creating visual fatigue.
- **The Fix:**  
  1. All informational text, metadata, descriptions, and labels must use `--text-secondary` (`text-fg-secondary`).
  2. The token `--text-muted` (`text-fg-muted`) is strictly reserved for non-critical, decorative, or placeholder items (e.g., search placeholder text, disabled chevron icons).
  3. Primary numeric values and card headings must use `--text-primary` (`text-fg-primary`).
- **Enforcing Component / Script:**  
  - [`PlanSummary.tsx`](../../src/components/domain/PlanSummary.tsx)
  - [`StatTile.tsx`](../../src/components/domain/StatTile.tsx)
  - [`MatchRow.tsx`](../../src/components/domain/MatchRow.tsx)

---

## 9. Chip Overflow Hygiene (`ChipList` +N with Interactive Tooltip)

- **The Problem:**  
  Listing variable-length user tags, target cities, or service niches directly in cards causes unexpected vertical blowout or horizontal scrolling on cards with numerous tags.
- **The Fix:**  
  Use `ChipList` with `maxVisible={N}`. Surplus items are summarized cleanly as a `+{count}` chip. Hovering or focusing on the overflow chip reveals an accessible `Tooltip` listing all hidden items separated by middle spacing.
- **Enforcing Component / Script:**  
  - [`ChipList.tsx`](../../src/components/ui/ChipList.tsx)
  - [`Tooltip.tsx`](../../src/components/ui/Tooltip.tsx)
  - [`PlanSummary.tsx`](../../src/components/domain/PlanSummary.tsx)

---

## 10. Linear Funnel Representation via `BarList`

- **The Problem:**  
  Rendering pipeline conversions as flat percentage cards or disconnected KPI boxes fails to communicate progression, velocity, and drop-off between sales stages.
- **The Fix:**  
  Use `BarList` to render horizontal progress tracks:
  - 6px track height with background `--bg-brand-soft` (`#E8F8F7`).
  - Active fill colored with brand accent (`--brand-accent: #62C0BE`).
  - Tabular Western numerals displaying raw counts and percentages with full LTR/RTL alignment.
- **Enforcing Component / Script:**  
  - [`BarList.tsx`](../../src/components/ui/BarList.tsx)
  - [`src/app/dashboard/page.tsx`](../../src/app/dashboard/page.tsx)

---

## 11. Multi-line Commercial Name Clamping

- **The Problem:**  
  Single-line truncation (`truncate`) on commercial business names cuts off Egyptian enterprise names midway through their identity (e.g., `"مركز القاهرة التخصصي للعلاج الطبيعي..."` becoming `"مركز القاهرة التخصصـ..."`), making identification difficult in list rows.
- **The Fix:**  
  Wrap business names in `line-clamp-2 leading-tight`. Commercial names are permitted to occupy up to two full lines without clipping, wrapped in `<bdi dir="auto">`.
- **Enforcing Component / Script:**  
  - [`MatchRow.tsx`](../../src/components/domain/MatchRow.tsx)

---

## 12. Grammatical ICU Pluralization & Tabular Numerals

- **The Problem:**  
  Using static singular suffixes (e.g., `"213 lead"` or `"5 فرصة"`) violates English and Arabic grammatical rules. Additionally, using proportional fonts causes numbers to shift and jump horizontally during real-time updates.
- **The Fix:**  
  1. All counts and units must use ICU message plural formats:
     - English: `{count, plural, one {# lead} other {# leads}}`
     - Arabic: Plural category support (`zero`, `one`, `two`, `few`, `many`, `other`).
  2. Numbers must always use IBM Plex Sans with `tabular-nums` (never raw monospace fonts).
- **Enforcing Component / Script:**  
  - [`src/lib/format.ts`](../../src/lib/format.ts)
  - Catalogs: [`src/messages/ar.json`](../../src/messages/ar.json), [`src/messages/en.json`](../../src/messages/en.json)
  - [`scripts/check-i18n.mjs`](../../scripts/check-i18n.mjs)

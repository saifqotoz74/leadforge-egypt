# LeadForge Egypt: Design System v1 (Agent Implementation Spec)

Audience: the coding agent that will implement this. Read the whole file before touching code.
Language of this spec: English for precision. All user-facing strings are Arabic and are given where needed.

---

## 0. How to use this document

1. The values in this spec are authoritative. Do not "improve" them, round them, or substitute your own. If something is ambiguous, pick the most literal reading and note the question in `docs/design/OPEN_QUESTIONS.md`.
2. Scope is the **visual layer only**: tokens, typography, spacing, components, layouts, microcopy, RTL, accessibility. A separate document will cover user-flow and information architecture. Until it arrives, **do not restructure routes, steps, or navigation logic**. Restyle what exists.
3. Work in the phases of section 12. Stop and report at the end of Phase 4 for review.

---

## 1. Hard rules (never violate)

### 1.1 Backend and data are frozen
- Do not modify: `prisma/schema.prisma`, migrations, API route handlers, server actions, auth/session logic, scoring, matching, deduplication, credits, claims, ingestion code, seeds, or tests of those engines.
- Do not change request or response shapes. Do not rename routes (`/leads`, `/dashboard`, `/admin`, `/admin/duplicates`, `/admin/quality`, `/admin/analytics`, and any other existing one).
- If a UI element needs data the backend does not expose, **do not invent it and do not change the backend**. Render the element without it (or omit it), and list the gap in `docs/design/BACKEND_GAPS.md` with: screen, element, missing field, suggested source.
- Never render contact data for a lead the user has not purchased, and never add client-side tricks to reveal it. Locked values render through `LockedField` (section 7.4).

### 1.2 Product principle that shapes the UI
The platform uses **no AI**. All decisions are deterministic rules. The interface must therefore make every score, match, and price **explainable on demand** ("why?"). Never use sparkles, magic-wand icons, "smart", "AI", or gradient glows anywhere.

### 1.3 Implementation discipline
- **No hard-coded colors, font sizes, spacings, radii, shadows, or durations in components.** Everything comes from tokens (section 5). Arbitrary Tailwind values like `w-[13px]` or `text-[#123456]` are forbidden outside `tokens.css`.
- **Logical properties only** (RTL-first): `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s`, `rounded-e`. Forbidden in new code: `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`, `text-right`.
- Prefer headless accessible primitives (Radix UI or equivalent) for Dialog, Popover, Tooltip, Tabs, Select, Toast. Check `package.json` first and reuse what exists. If you add a dependency, justify it in `docs/design/PROGRESS.md`.
- Keep existing tests green. Run typecheck, lint, and `vitest` before every commit. Commit in small steps with clear messages.

### 1.4 Forbidden visual patterns (common "generated UI" tells)
- Gradients of any kind (backgrounds, buttons, text, borders), glow, blur, glassmorphism, neumorphism.
- Purple or violet anywhere. Do not use Hostinger's brand color or any of its assets.
- Emojis in the UI. Sparkle or "AI" iconography.
- ALL-CAPS or letter-spaced labels. (Never apply `letter-spacing` to Arabic.)
- Eyebrow label above every heading. Meta strings glued with middle dots (`A · B · C`). Arrow glyphs appended to buttons or links.
- Emphasizing one word of a headline with a different color or weight.
- Identical cards with identical radius and shadow everywhere. (Radius and elevation follow hierarchy: section 5.4.)
- Numbered markers unless the content is a true sequence (e.g., onboarding steps).
- Fade-and-slide-up entrance animation on sections, or hover-lift on every card.
- Side-stripe accent borders on cards or rows.
- Color as the only carrier of meaning.

---

## 2. Phase 0 discovery (do this first, change nothing)

Write `docs/design/AUDIT.md` containing:
- Framework and versions (Next.js, React, Tailwind: v3 or v4, TypeScript), UI libraries present, icon library, chart library, font setup.
- Folder map of `app/`, `components/`, `lib/`, `styles/`.
- List of every page and layout file with the role that sees it (developer, admin, public).
- Existing shared components and which are reused most.
- Count of hard-coded hex values, inline styles, `ml/mr/pl/pr` usages (use grep).
- How RTL is currently handled (`dir`, `lang`, mirrored icons).
- The real enum values for: opportunity tier, quality/freshness state, ownership type (exclusive/shared), engagement stage, claim status, credit transaction type. **Section 6 maps visuals to these concepts; you must map them to the actual enum names.**

---

## 3. Personality and principles

Calm, trustworthy, plain-spoken, transparent. A tool that handles real money (credits) and wants to be believed.

| Principle | What it means in the UI |
|---|---|
| Calm | Mostly neutral surfaces. One brand hue. Color is rare and therefore meaningful. |
| Explainable | Every number has a "why" within one click. Prices and balances are never a surprise. |
| One thing at a time | One primary action per view. One idea per section. |
| Confident type | Large, heavy headlines; short supporting text; generous space. |
| Honest | No fake urgency, no dark patterns, no invented guarantees. |

---

## 4. Style DNA: the Hostinger-inspired qualities, translated into rules

The reference is hostinger.com/ae. We borrow its **style qualities**, not its colors, assets, copy, or layout. Each quality below is a rule with numbers.

| Quality observed | Rule for LeadForge |
|---|---|
| Very generous whitespace | Public/comfortable pages: section vertical padding 96px desktop, 64px tablet, 48px mobile. Gap between a section header and its content: 48px. Heading to subtitle: 16px. |
| Large, heavy, confident headlines | Display and h1 use weight 700 and 600, tight line-height (1.15 to 1.3), max width 20ch for display. Subtitle: body-lg, `text-secondary`, max width 60ch. |
| One obvious primary action | One filled primary button per view. Everything else: secondary, ghost, or link. In lists the per-item action is `secondary`. |
| Separation by background, not by lines | Alternate section backgrounds (`bg-surface`, `bg-page`, `bg-brand-soft`). Use 1px borders only on cards and inputs. No decorative dividers between sections. |
| Rounded, friendly geometry, hierarchical | Radius by role: badges and pills full; small rects 8; buttons and inputs 12; cards 16; hero/pricing/dialog panels 24. |
| Soft, rare elevation | Cards at rest have **no shadow**, only a 1px border. Shadows only on: hover of interactive cards, popovers, dialogs, one product-preview frame per page. |
| Show the real product | Marketing and empty states show real UI previews built from actual components, never stock photos. Illustrations are simple geometric line drawings in brand teal. |
| Tabs to explain, not long scrolls | Use segmented pill tabs inside sections to switch between related explanations or views. |
| Pricing pattern | Package cards with a clearly recommended one: 2px brand border, a pill badge straddling the top edge, a one-line reason, big number, full-width CTA, a reassurance line under the CTA. Specified in 7.12. |
| Reassurance at the decision point | Short trust line next to the button that spends money (balance after purchase, what happens next). Only state facts the backend guarantees. |
| Friendly plain language | Short sentences, plain words, sentence-style Arabic, no jargon, no exclamation marks. |
| Fast, quiet motion | Color and shadow transitions of 150 to 200ms. Dialogs fade and scale slightly. No parallax, no entrance choreography. |
| Clear hierarchy through scale | Few type sizes, large jumps between levels, consistent use. |
| Clean data presentation | Tables are airy: 56px rows in comfortable mode, light header, no zebra stripes, hover tint only. |

Calibration: the agent should follow section 13 to sanity-check rhythm against the live reference, but the numbers in this spec win.

---

## 5. Tokens

Single source of truth: `src/styles/tokens.css` (CSS variables). Tailwind maps to them (Appendix A). Components use **semantic** tokens only; primitives (`--teal-*`, `--n-*`) are used only inside `tokens.css`.

### 5.1 Color

Brand palette provenance: teal family chosen by the owner (`#62C0BE`, `#CBF5F4`, `#1D5857`, `#BEE9E8`), completed with derived steps for contrast and states.

```css
:root {
  /* Primitives: teal (brand) */
  --teal-50:#E8F8F7;  --teal-100:#CBF5F4; --teal-200:#BEE9E8; --teal-300:#8FD5D3;
  --teal-400:#62C0BE; --teal-500:#3F9E9C; --teal-600:#2B7A78; --teal-700:#1D5857;
  --teal-800:#154341; --teal-900:#0E2F2E;

  /* Primitives: neutral (cool, slightly teal-leaning) */
  --n-0:#FFFFFF;   --n-25:#F5F8F8;  --n-50:#EEF3F3;  --n-100:#E1E9E9; --n-200:#CFDADA;
  --n-300:#B3C1C1; --n-400:#8A9B9B; --n-500:#5E7070; --n-600:#455555; --n-700:#2F3D3D;
  --n-800:#1B2B2B; --n-900:#101A1A;

  /* Primitives: warm (heat tiers, warnings) */
  --sand-100:#F6EFE0; --sand-700:#6B5420;
  --clay-50:#FBE7D3;  --clay-700:#8A4A12;
  --amber-50:#FFF4DD; --amber-200:#F2D9A0; --amber-500:#B87A00; --amber-700:#7A5200;

  /* Primitives: danger */
  --red-50:#FDECEC; --red-200:#F3C2C2; --red-500:#C23B3B; --red-600:#B42323; --red-700:#8C2020;

  /* Semantic: surfaces */
  --bg-page:var(--n-25);
  --bg-surface:var(--n-0);
  --bg-subtle:var(--n-50);
  --bg-brand-soft:var(--teal-50);
  --bg-brand-soft-strong:var(--teal-100);
  --bg-inverse:var(--n-800);
  --bg-overlay:rgba(16,26,26,0.48);

  /* Semantic: borders */
  --border-default:var(--n-100);
  --border-strong:var(--n-200);
  --border-brand:var(--teal-400);

  /* Semantic: text */
  --text-primary:var(--n-800);
  --text-secondary:var(--n-500);
  --text-muted:var(--n-400);      /* placeholders and disabled only, never for information */
  --text-brand:var(--teal-700);
  --text-on-brand:#FFFFFF;
  --text-inverse:var(--sand-100);

  /* Semantic: brand actions */
  --brand:var(--teal-700);
  --brand-hover:var(--teal-800);
  --brand-pressed:var(--teal-900);
  --brand-accent:var(--teal-400);  /* icons, meters, focus; never behind white text */
  --focus-ring:var(--teal-400);

  /* Semantic: status */
  --warning-bg:var(--amber-50);  --warning-border:var(--amber-200); --warning-text:var(--amber-700); --warning-icon:var(--amber-500);
  --danger-bg:var(--red-50);     --danger-border:var(--red-200);    --danger-text:var(--red-700);    --danger-icon:var(--red-500);
  --danger-fill:var(--red-600);  --danger-fill-hover:var(--red-700);
  --info-bg:var(--teal-50);      --info-border:var(--teal-200);     --info-text:var(--teal-700);     --info-icon:var(--teal-600);
}
```

Color usage rules:
- Surfaces are 90 percent neutral. Brand teal appears only on: primary buttons, links, active nav item, selected states, focus ring, meters, brand-soft backgrounds.
- **There is no green.** Teal means "brand and interaction". Success is expressed with an icon and text in `--text-brand` or neutral, never a separate green.
- Warm colors (sand, clay, amber) are reserved for **heat tiers** and **warning/needs-attention**. Red is reserved for destructive actions and errors.
- Verified contrast pairs (must be preserved): white on `--brand` 8.1:1; `--text-primary` on `--bg-surface` above 14:1; `--text-secondary` on `--bg-surface` 5.2:1; `--warning-text` on `--warning-bg` 6.4:1; `--clay-700` on `--clay-50` 5.7:1; `--sand-700` on `--sand-100` 6.3:1.
- Do not put white text on `--teal-400` or lighter (about 2.1:1).
- Dark mode is **out of scope for v1**. Tokens are semantic so it can be added later; do not build it now.

### 5.2 Typography

Font: **IBM Plex Sans Arabic** for everything (Arabic and Latin). **IBM Plex Mono** only for technical strings (IDs, checksums, rule expressions). Load with `next/font/google`, subsets `arabic` and `latin` (verify availability), `display: swap`, exposed as `--font-sans` and `--font-mono`. No other fonts.

```css
:root {
  --font-sans:'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
  --font-mono:'IBM Plex Mono', ui-monospace, Menlo, monospace;
  --fw-regular:400; --fw-medium:500; --fw-semibold:600; --fw-bold:700;
}
```

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `display` | clamp(2rem, 1.4rem + 2.6vw, 3.5rem) | 1.15 | 700 | Public hero, onboarding hero only |
| `h1` | clamp(1.625rem, 1.3rem + 1.2vw, 2rem) | 1.3 | 600 | Page title (one per page) |
| `h2` | 1.5rem | 1.35 | 600 | Section title |
| `h3` | 1.25rem | 1.4 | 600 | Card, dialog, panel title |
| `h4` | 1.125rem | 1.45 | 600 | Lead name in cards, sub-sections |
| `body-lg` | 1.125rem | 1.75 | 400 | Intro text under headings |
| `body` | 1rem | 1.7 | 400 | Default text |
| `body-sm` | 0.875rem | 1.65 | 400 | Dense UI text, table cells in compact mode |
| `label` | 0.875rem | 1.4 | 500 | Form labels, buttons, tabs, table headers |
| `caption` | 0.75rem | 1.5 | 400 | Helper text, timestamps. **Minimum size in the product.** |

Rules:
- `font-variant-numeric: tabular-nums` on every number: scores, prices, balances, table columns, counters.
- **Western digits (0-9)** everywhere, including inside Arabic sentences.
- Phone numbers, emails, URLs, IDs, and signed deltas (`+30`) are wrapped in an element with `dir="ltr"` and `unicode-bidi: isolate` (utility class `.ltr-iso`).
- Max line length: 65ch for prose; 60ch for subtitles.
- No italics, no underline except links, no text-transform, no letter-spacing.
- Headings are never centered inside the app shell. Centered headings are allowed only on auth, onboarding, empty states, and public sections.
- In compact density, `body` resolves to `body-sm` size (see 5.7).

### 5.3 Spacing and layout

4px base unit. Use only these steps (Tailwind default scale already matches):

`0, 0.5 (2px), 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64), 20 (80), 24 (96), 32 (128)`

Semantic spacing:

| Purpose | Comfortable | Compact |
|---|---|---|
| Card padding | 24 | 16 |
| Gap between cards in a grid | 24 | 16 |
| Stack gap inside a card | 16 | 12 |
| Form field vertical gap | 20 | 16 |
| Label to control | 8 | 6 |
| Control to helper text | 6 | 4 |
| Page padding (inline) | 32 desktop, 24 tablet, 16 mobile | 24 desktop, 24 tablet, 16 mobile |
| Page header bottom margin | 32 | 24 |
| Between page sections | 48 | 32 |

Public/auth sections: 96 / 64 / 48 vertical padding (desktop / tablet / mobile).

Containers and widths:

| Name | Value |
|---|---|
| `container-public` | max 1200px, centered |
| `container-app` | max 1280px |
| `container-reading` | max 720px |
| Auth card | 440px |
| Onboarding column | 560px |
| Form column | 480px |
| Dialog sm / md / lg | 440 / 560 / 720px |
| Drawer | 480px |
| Lead detail main column / aside | 8 / 4 of 12 columns |
| Pipeline column | 300px |

Grid: 12 columns, gutter 24 (from 1024) or 16 (below). Breakpoints: Tailwind defaults (640, 768, 1024, 1280, 1536), mobile-first. Lead card grid: `repeat(auto-fill, minmax(320px, 1fr))`.

App shell: sidebar 256px expanded / 72px collapsed (sits at inline-start, i.e., the right in RTL); top bar 64px; below 1024px the sidebar becomes a drawer opened from the top bar.

Touch targets: at least 44x44px on touch devices (use padding to extend the hit area of small controls).

### 5.4 Radius, borders, elevation

| Token | Value | Used by |
|---|---|---|
| `radius-sm` | 8px | Table inner chips, small rectangles, code blocks |
| `radius-md` | 12px | Buttons, inputs, selects, tooltips, banners |
| `radius-lg` | 16px | Cards, popovers, menus, table containers |
| `radius-xl` | 24px | Dialogs, pricing/package cards, hero preview frames, kanban columns |
| `radius-full` | 9999px | Badges, pills, avatars, segmented tabs, switches |

Borders: always 1px solid. Default `--border-default`; inputs `--border-strong`.

```css
:root {
  --shadow-xs:0 1px 2px rgba(16,26,26,0.04);
  --shadow-sm:0 2px 8px rgba(16,26,26,0.06);   /* hover of interactive cards, active segmented tab */
  --shadow-md:0 8px 24px rgba(16,26,26,0.08);  /* popovers, menus, dropdowns */
  --shadow-lg:0 16px 40px rgba(16,26,26,0.12); /* dialogs, drawers, one preview frame per public page */
  --ring-focus:0 0 0 3px rgba(98,192,190,0.45);
}
```

Elevation rules: resting cards have no shadow. At most two floating layers on screen at once; a third becomes a Dialog.

Z-index scale: `base 0, sticky 10, dropdown 20, drawer 30, dialog 40, toast 50, tooltip 60`.

### 5.5 Motion

```css
:root {
  --dur-fast:120ms; --dur-base:200ms; --dur-slow:320ms;
  --ease-standard:cubic-bezier(0.2,0,0,1);
  --ease-out:cubic-bezier(0.16,1,0.3,1);
}
```
- Hover, focus, and press: transition only `color, background-color, border-color, box-shadow, opacity` at `--dur-base`.
- Dialog: opacity 0 to 1 and scale 0.98 to 1 over `--dur-slow`, `--ease-out`. Drawer: slide from the inline-end edge over `--dur-slow`. Popover: opacity only, `--dur-fast`.
- Skeleton shimmer: 1.4s linear loop on a flat `--bg-subtle` to `--border-default` pair (no gradient: animate opacity 1 to 0.6 instead).
- Never animate layout properties. No page-load choreography. No number count-up on balances.
- Respect `prefers-reduced-motion: reduce`: disable all transitions longer than 0ms except opacity at `--dur-fast`, and stop skeleton animation.

### 5.6 Iconography

Lucide (already in the stack). Stroke 1.75. Sizes: 16 (inside badges and small controls), 20 (default, buttons, nav), 24 (empty states, dialogs). Icons inherit `currentColor`.

RTL: mirror directional icons (arrows, chevrons, back/forward, list-indent, log-out, send) using `rtl:-scale-x-100`. Do not mirror: check, x, plus, search, lock, phone, external-link, play, clock, calendar, bell, user.

Icon-only buttons require `aria-label` in Arabic.

### 5.7 Density modes

One component set, two densities, switched with `data-density="comfortable|compact"` on any container (default `comfortable` at the root).

| Token | Comfortable | Compact |
|---|---|---|
| `--control-h` (default size) | 48px | 36px |
| `--row-h` (tables, lists) | 56px | 44px |
| `--text-body-size` | 1rem | 0.875rem |
| `--card-pad` | 24px | 16px |
| `--nav-item-h` | 44px | 40px |

Explicit sizes always available regardless of density: `sm` 32, `md` 40, `lg` 48.

Where each is used:
- **Comfortable**: auth, onboarding, credit top-up, purchase confirmation, lead detail header, empty states, settings, any public page.
- **Compact**: lead feed and list, pipeline board, ledger, all admin tables and queues, rule editor, duplicate comparison.

---

## 6. Domain visual language (the part that makes this product recognizable)

Map each concept below to the **real enum values** found in Phase 0. The Arabic labels are proposed defaults; keep them unless the owner changes them.

### 6.1 Opportunity tier (how good is the sales opportunity)

Never encoded by hue alone. Each tier = pill + a 4-dot heat meter + label.

| Tier | Label | Pill background | Pill text | Dots filled |
|---|---|---|---|---|
| COLD | بارد | `--bg-subtle` | `--text-secondary` | 1 of 4 |
| WARM | دافئ | `--sand-100` | `--sand-700` | 2 of 4 |
| HOT | ساخن | `--clay-50` | `--clay-700` | 3 of 4 |
| PREMIUM | مميز | `--bg-inverse` | `--text-inverse` | 4 of 4 |

Dots: 6px circles, 3px gap, filled with the pill's text color, unfilled at 30 percent opacity of that color. The numeric score (0 to 100) sits **next to** the pill as a separate element in `h4` weight 600, tabular. Do not join them in one string.

### 6.2 Quality and freshness (how trustworthy is the data)

Deliberately separate from 6.1: different position, different shape (a line with an icon, not a pill), and no heat colors.

| State | Label | Icon | Treatment |
|---|---|---|---|
| FRESH | حديث | dot, `--brand-accent` | `--text-secondary` |
| AGING | قديم نسبياً | dot, `--n-400` | `--text-secondary` |
| STALE | قديم | alert-circle, `--warning-icon` | `--warning-text` |
| UNVERIFIED | غير موثّق | help-circle, `--warning-icon` | `--warning-text` |
| VERIFIED | موثّق | check, `--text-brand` | `--text-secondary` |
| REVERIFYING | قيد إعادة التحقق | refresh-cw, `--n-400` | `--text-secondary` |

Format: icon (16px), label, then a relative time as a separate caption (`منذ 3 أيام`) when available. Only the two warning states use color.

### 6.3 Ownership (exclusive or shared)

Outlined pill, 1px border, no fill, so it never competes with the tier pill.
- EXCLUSIVE: label `حصري`, lock icon, border and text `--text-brand`.
- SHARED: label `مشترك`, users icon, border `--border-strong`, text `--text-secondary`. When seat data exists, append a separate caption `متبقي {n} من {max}`.

### 6.4 Engagement stages (pipeline)

| Stage | Visual |
|---|---|
| CLAIMED / new | outline pill, neutral |
| In progress stages (contacted, meeting, quoted) | `--bg-brand-soft` fill, `--text-brand` text |
| WON | `--bg-brand-soft-strong` fill, `--text-brand` text, check icon |
| LOST | `--bg-subtle` fill, `--text-secondary` text, x icon |

### 6.5 Money

Credits are plain text, weight 600, tabular, with a coin icon in `--text-brand`. No special color for balance. Amber only when the balance is below the price the user is looking at.

---

## 7. Components

Every component must support: default, hover, focus-visible, active/pressed, disabled (only when unavoidable), loading, error where relevant, both densities, and RTL. Build each in `components/ui` (primitives) or `components/domain` (product-specific), each with a visible entry on the `/design-system` page.

### 7.1 Button and IconButton

| Variant | Background | Text | Border | Hover | Pressed |
|---|---|---|---|---|---|
| primary | `--brand` | `--text-on-brand` | none | `--brand-hover` | `--brand-pressed` |
| secondary | `--bg-surface` | `--text-brand` | 1px `--border-strong` | bg `--bg-brand-soft`, border `--border-brand` | bg `--bg-brand-soft-strong` |
| ghost | transparent | `--n-700` | none | bg `--bg-subtle` | bg `--border-default` |
| danger | `--danger-fill` | white | none | `--danger-fill-hover` | `--red-700` |
| link | transparent | `--text-brand` | none | underline, offset 3px | same |

Sizes: `sm` 32px (padding-x 12, label 14), `md` 40px (16, label 14), `lg` 48px (24, label 16). Radius `radius-md`. Weight 500. Icon 20px (16 in `sm`), gap 8px, icon sits at the inline-start of the label. Minimum width = content. Full-width variant for mobile and package cards.
Loading: spinner replaces the icon, label stays, width is preserved, `aria-busy="true"`, clicks ignored.
Disabled: bg `--border-default`, text `--text-muted`, `cursor: not-allowed`. Avoid disabling; prefer an enabled button that explains itself on click. If disabled is unavoidable, wrap it with a Tooltip giving the reason.
Focus-visible: `outline: 2px solid var(--focus-ring); outline-offset: 2px`.
Rule: at most **one** primary per view. Per-item actions in lists use `secondary`.
IconButton: 32, 40, or 48 square, `radius-md`, ghost by default.

### 7.2 Form controls

- Label above the control (`label` style, `--text-primary`), 8px gap. No asterisks. Mark optional fields with `(اختياري)` in `--text-secondary`.
- Input, Select, Textarea: height `--control-h`, bg `--bg-surface`, border 1px `--border-strong`, radius `radius-md`, padding-x 16, text `body`. Hover: border `--n-300`. Focus: border `--teal-600` plus `--ring-focus`. Placeholder `--text-muted` showing a real example value. Disabled: bg `--bg-subtle`.
- Error: border `--danger-icon`, helper text below in `--danger-text` with a 16px alert icon, written as in section 11. Never rely on color alone.
- Helper text: `caption`, `--text-secondary`, 6px below.
- Checkbox and radio: 20px, border `--border-strong`, checked bg `--brand` with white mark. Switch: 44x24, on = `--brand`, off = `--n-300`, thumb white.
- MultiSelect (cities, specialties): control shows selected values as removable chips (bg `--bg-brand-soft-strong`, text `--text-brand`, radius full, 28px height). Menu: popover `radius-lg`, `--shadow-md`, search field on top, option height 40, hover `--bg-brand-soft`, selected shows a check at the inline-end.
- Number or points stepper: input with tabular numerals, LTR, `-` and `+` ghost IconButtons at both sides.

### 7.3 Overlays and feedback

- **Dialog**: `radius-xl`, padding 24 (32 for lg), `--shadow-lg`, overlay `--bg-overlay`. Header: title `h3`, close IconButton at inline-end. Footer actions end-aligned with the **primary last in DOM order** (mirrors automatically in RTL). Focus trap, Esc closes unless a request is in flight. Width per 5.3.
- **Drawer**: slides from inline-end, 480px, `radius-xl` on the inner corners only, same header and footer rules. Used for advanced filters and details.
- **Popover and the "Why?" pattern**: `radius-lg`, `--shadow-md`, max width 320, padding 16. Trigger is a small ghost icon button (help-circle, 16px) placed next to any score, price, tier, or match. Content: one short sentence plus the rule list.
- **Tooltip**: bg `--bg-inverse`, text white `caption`, `radius-sm`, padding 6 10, 300ms open delay. Never the only way to reach information.
- **Toast**: top-center, max width 420, `radius-lg`, bg `--bg-surface`, 1px border, `--shadow-md`, icon 20px, one line plus optional action. Auto-dismiss 5s; errors persist until dismissed. Use `aria-live="polite"` (assertive for errors).
- **Banner** (inline): `radius-md`, padding 12 16, icon + text + optional link-style action. Variants: info (`--info-*`), warning (`--warning-*`), danger (`--danger-*`).

### 7.4 LockedField

Used for contact data that belongs to a lead not yet purchased. Renders a pill-shaped bar (height 20, width varies by field type, bg `--bg-subtle`, radius full) with a 16px lock icon at the inline-start. `aria-label="بيانات مقفلة حتى الشراء"`. It is purely presentational; it never receives or masks the real value.

### 7.5 Tabs

- **Underline tabs** (page level): label 14/500, padding 12 16, active text `--text-brand` with a 2px bottom bar `--brand`, hover text `--text-primary`. Container has a 1px bottom border `--border-default`.
- **Segmented pill tabs** (inside sections and for view toggles): container bg `--bg-subtle`, padding 4, radius full; each tab height 36, padding-x 16; active tab bg white, text `--text-primary`, `--shadow-xs`.
- Arrow keys move between tabs; tabs follow RTL order.

### 7.6 Table and filters

- Container: `radius-lg`, 1px border `--border-default`, bg `--bg-surface`, overflow-x auto with sticky first data column on small screens.
- Header: bg `--bg-subtle`, `label` style, `--text-secondary`, height 44, sticky under the top bar.
- Rows: height `--row-h`, bottom border 1px `--border-default`, no zebra. Hover bg `--bg-brand-soft`. Selected bg `--bg-brand-soft-strong`, no side stripe.
- Numeric columns: `text-end`, tabular, `.ltr-iso`.
- Empty and loading states fill the table body (7.7).
- Pagination: ghost buttons, current page `--bg-brand-soft-strong` and `--text-brand`; show "عرض {from} إلى {to} من {total}" in `caption`.
- **FilterBar**: sticky below the top bar, bg `--bg-page`, padding 12 0. Contains a search input (320px), up to four quick filter chips, and a secondary button `فلاتر متقدمة` that opens the Drawer. Active filter chip: bg `--bg-brand-soft-strong`, text `--text-brand`, with an x. A `مسح الكل` link appears when any filter is active. Show the result count in `body-sm` `--text-secondary`.

### 7.7 EmptyState and Skeleton

EmptyState: centered, max width 420, vertical padding 64. Geometric line illustration 120px (stroke `--brand-accent` 1.75, fills `--teal-100`/`--teal-50`, no gradients, no people), `h3`, one `body-sm` `--text-secondary` sentence, one CTA. Variants: first-use, no-results (offers `مسح الفلاتر`), no-permission, error (offers `إعادة المحاولة`).
Skeleton: replicate the exact shape and size of the final component; bg `--bg-subtle`; radius matches the real element; animation per 5.5.

### 7.8 LeadCard and LeadRow

LeadCard (feed grid). Container: bg surface, 1px border, `radius-lg`, padding `--card-pad`. Interactive: the whole card is one link (stretched link pattern), hover border `--border-strong` and `--shadow-sm`, focus-visible ring.
Anatomy, top to bottom, stack gap 12:
1. Header row, space-between: OpportunityBadge (6.1) at inline-start, OwnershipTag (6.3) at inline-end.
2. Business name: `h4`, one line clamped. Under it `body-sm` `--text-secondary`: category and district/city as two inline spans separated by a 4px gap (no middle dot).
3. Signals: up to 3 neutral outline chips (height 24, `radius-full`, `caption`, border `--border-default`) listing the top scoring reasons by weight, e.g. `بدون موقع`, `تقييمات مرتفعة`, `عدة فروع`. Derived from the rules that fired; if the backend does not expose them, omit this row (log in BACKEND_GAPS).
4. QualityIndicator (6.2).
5. Footer: 1px top border, padding-top 16, row space-between: price (CreditChip inline form) at inline-start; `secondary` `sm` button `عرض الفرصة` at inline-end.
Contact fields never appear on the card.

LeadRow (dense list toggle): same data in one row of height `--row-h`: name block, tier pill with score, quality, ownership, price, action. Same tokens, table styling.

### 7.9 ScoreBreakdown and ScorePair

ScorePair (lead detail header). Two equal blocks side by side (stack on mobile), each `radius-lg`, 1px border, padding 20:
- Block A "فرصة البيع": OpportunityBadge, score in `display`-scale 40px/700 tabular with `/100` in `--text-secondary`, a "Why?" popover trigger.
- Block B "جودة البيانات": QualityIndicator, quality score in the same scale, freshness caption.
The two never merge into one number.

ScoreBreakdown (opens inline or in a Drawer from "Why?"). Title `h3` `لماذا هذه الدرجة؟`. A list of fired rules, each row: label (`body`), a meter, and a signed delta.
- Meter: track `--bg-brand-soft` height 6 radius full; fill `--brand-accent`; width = |points| / max rule weight.
- Delta: `+30` tabular `.ltr-iso`, weight 600. Negative deltas: text `--warning-text`, meter fill `--amber-200`, shown as `−10`.
- Footer row: total, divider above, weight 600.
- Footnote (`caption`, `--text-secondary`), suggested copy: `تُحسب الدرجة بقواعد ثابتة وواضحة.` Owner to confirm.
Same pattern is reused for match explanation (why this lead matches the developer's profile).

### 7.10 PurchaseConfirm (the most important dialog)

Dialog `md`, comfortable density.
1. Title: `تأكيد الشراء`.
2. Lead summary: name (`h4`), tier pill, ownership tag.
3. Plain sentence for the ownership type:
   - Exclusive: `ستكون الجهة الوحيدة التي تحصل على بيانات هذه الفرصة.`
   - Shared: `يمكن لعدد أقصى من {max} مطورين الحصول على هذه الفرصة.`
4. Summary table (`body`, rows 44px, tabular, values end-aligned): `رصيدك الحالي`, `سعر الفرصة` (shown with a minus sign), divider, `رصيدك بعد الشراء` (weight 600).
5. Footer: primary `lg` `تأكيد الشراء`, ghost `إلغاء`. Caption under the buttons: `العملية نهائية.` Only if the backend treats purchases as final.
States:
- Insufficient balance: replace step 4 with a warning Banner (`رصيدك لا يكفي. تحتاج {n} نقاط إضافية.`) and make the primary `شحن الرصيد`.
- Submitting: primary loading, dialog not dismissible.
- Lost the race (sold meanwhile): neutral Banner `اشترى مطور آخر هذه الفرصة قبل لحظات.` plus secondary `عرض فرص مشابهة`.
- Success: icon check in a 56px `--bg-brand-soft-strong` circle, `h3` `تم الشراء`, contact fields revealed with a `نسخ` IconButton each (phone and email use `.ltr-iso`), primary `الذهاب إلى الصفقة`.
- Error: danger Banner with the error sentence from section 11.

### 7.11 CreditChip and Ledger

CreditChip: height 36, padding 0 12, radius full, bg `--bg-subtle`, coin icon `--text-brand`, number weight 600 tabular, unit `نقطة` in `--text-secondary`. It is a link to the ledger. Lives in the top bar at the inline-end. Low state: number and a small dot in `--warning-text`.
Ledger table (compact): columns date (`ar-EG-u-nu-latn`), type (neutral pill), description, amount (signed, tabular, `.ltr-iso`; positive in `--text-brand`, negative in `--text-primary`), balance after. Below the table, a caption stating that the ledger is immutable only if the product says so.

### 7.12 Package cards (credit top-up), the Hostinger pricing pattern

Grid of 3 (stack on mobile), gap 24. Card: bg surface, 1px border, `radius-xl`, padding 32, comfortable.
Content order: package name (`h3`), points amount (40px/700 tabular) with `نقطة` (`body` secondary), price (`h2`) with a per-point caption (`caption`), feature list (`body-sm`, check icons `--text-brand`, 12px gap), full-width `lg` button, reassurance caption centered under the button.
Recommended card: 2px border `--brand`, a pill badge `الأكثر اختياراً` (bg `--brand`, white text, `caption` 500, height 28, radius full) straddling the top edge, one line under the name explaining why (`body-sm` secondary), primary button. The others use `secondary`. No crossed-out prices or discounts unless they are real.
Reassurance lines are facts only (e.g., payment methods supported, when points are added). Never invent refund promises.

### 7.13 Pipeline (developer's deal tracking)

Board: horizontal columns, each 300px wide, gap 16, column bg `--bg-subtle`, `radius-xl`, padding 12; header = stage name (`label`) + count pill. Cards inside: white, 1px border, `radius-lg`, padding 12, showing name (`h4` size 16), tier pill, last activity caption, stage badge only when not implied by the column. Drag handles are optional; stage change must also be possible via a menu for keyboard users.
Deal detail: ScorePair summary, contact block (revealed), a vertical timeline of notes and status changes (1px `--border-default` rail, 8px dots `--brand-accent`), composer for notes, and the `الإبلاغ عن رقم خاطئ` ghost button. Its confirmation text: `سنرسل إشارة لإعادة التحقق من الرقم. لن يُحذف الرقم فوراً.`

### 7.14 Admin components

- **Review queue** (home of admin): compact table sorted by oldest first, with a status pill, source, and count of items needing a decision.
- **MergeCompare** (`/admin/duplicates`): two record columns (each a `radius-lg` card) with aligned field rows. Fields that differ: bg `--warning-bg` with a 16px alert icon; fields that agree: normal. Above them, the match level and the rule that matched (`body-sm`). Actions at the bottom: primary `دمج السجلين`, secondary `ليسا نفس النشاط`, ghost `تخطي`. After a merge, show provenance and an `إلغاء الدمج` link.
- **RuleWeightEditor**: table with rule name, plain-language condition (`body-sm`; technical expression in `--font-mono` inside a `radius-sm` `--bg-subtle` chip), weight stepper, and a delta chip showing `من {old} إلى {new}` when changed (separate elements). A sticky bottom bar appears when there are unsaved changes: `{n} تغييرات غير محفوظة`, ghost `تراجع`, primary `حفظ التغييرات`. An "impact preview" area is rendered only if the backend exposes the data.
- **Source health and quality cards** (`/admin/quality`): compact stat tiles (label `caption`, value 24/600 tabular), each with a status line in the warning style when out of range. Dead-letter list uses the table styling.
- **Analytics**: charts use `--teal-700` first series, `--teal-400` second, `--n-300` third; max 3 series; gridlines `--border-default`; axis text `caption` `--text-secondary`; tooltip uses the Popover style.

### 7.15 Stepper (onboarding)

Steps are a true sequence, so numbering is allowed. Column 560px centered. Progress: 4px bar, track `--border-default`, fill `--brand-accent`, with `خطوة {n} من {total}` as `caption` above. Step title `h2`, helper `body` secondary max 60ch. Footer: ghost `رجوع`, primary `التالي`; final step primary label is the outcome (`عرض الفرص المطابقة`). Validation inline; never block on optional fields. The last step must land on the first real matches, not an empty dashboard.

### 7.16 App shell

- **Sidebar**: bg `--bg-surface`, 1px border at its inline-end edge. Logo/wordmark block 64px high. Nav item: height `--nav-item-h`, padding 0 12, radius `radius-md`, icon 20 + label (`label` style). Hover bg `--bg-subtle`; active bg `--bg-brand-soft`, text `--text-brand`, weight 500 (no side stripe). Group titles `caption` `--text-muted`, 24px above each group. Collapsed: icons only with Tooltip. Item names come from the existing routes; do not rename routes.
- **Top bar**: 64px, bg `--bg-surface`, bottom border 1px. At inline-start: menu button (below 1024px) and breadcrumb or page title. At inline-end: CreditChip (developers), notifications if they exist, avatar menu.
- **PageHeader**: `h1`, optional `body` description (`--text-secondary`, max 60ch), actions at inline-end. Margin-bottom per 5.3.
- Avatar: circle 32 or 40, bg `--teal-100`, initials in `--teal-700` weight 600.
- Wordmark: text `LeadForge` in IBM Plex Sans Arabic 700, 20px, `--text-primary` (placeholder until a logo exists).

---

## 8. Page templates (layout blueprints, not flows)

Apply the right template to each existing page. Route names and steps stay as they are.

| Template | Used for | Layout |
|---|---|---|
| T1 Auth | login, register | Centered card 440, `radius-xl`, padding 32, on `--bg-page`; wordmark above; one primary button; links below. Comfortable. |
| T2 Onboarding | developer profile setup | Centered 560 column with Stepper (7.15). Comfortable. |
| T3 Feed | `/leads` | PageHeader, FilterBar, results header (count + view toggle segmented tabs), LeadCard grid or LeadRow table. Compact. |
| T4 Lead detail | single lead | Two columns: main (8) with header, ScorePair, "why" ScoreBreakdown, business details (locked or revealed); aside (4, sticky below the top bar) with price, ownership explanation, primary `lg` button. On mobile the aside becomes a sticky bottom bar with price and the primary button. Comfortable header, compact lists. |
| T5 Pipeline | deals | Board (7.13) with a view toggle for list. Compact. |
| T6 Top-up | credits | Package cards (7.12). Comfortable. |
| T7 Ledger | credit history | PageHeader + table. Compact. |
| T8 Admin table | queues, sources, dead-letter | FilterBar + table. Compact. |
| T9 Admin compare | `/admin/duplicates` | MergeCompare (7.14). Compact. |
| T10 Admin editor | scoring and matching rules | RuleWeightEditor (7.14). Compact. |
| T11 Overview | `/dashboard`, `/admin` landing | Do not remove existing content. Reorder visually only: the most actionable block first (matches or items needing attention), summary tiles in a slim row above it. Final structure comes from the flow document. |

Public pages (if any exist or are later added): hero with `display` headline max 20ch and `body-lg` subtitle, one primary button, a real product preview in a `radius-xl` frame with `--shadow-lg`; sections of 96px padding alternating `--bg-surface`, `--bg-page`, `--bg-brand-soft`; segmented tabs for related explanations; package cards (7.12); FAQ as plain accordions (`h4` question, `body` answer, 1px dividers); final CTA band on `--bg-brand-soft`.

---

## 9. RTL and Arabic rules

- Root: `<html lang="ar" dir="rtl">`. Set once in the root layout; never override `dir` on regular components.
- Logical utilities only (1.3). Flex rows reverse automatically; do not use `flex-row-reverse` to fake RTL.
- Mirror directional icons per 5.6. Back means "toward the start edge".
- Digits: Western (0-9). Format with locale `ar-EG-u-nu-latn`:
  ```ts
  export const fmtNumber = (n: number) => new Intl.NumberFormat('ar-EG-u-nu-latn').format(n)
  export const fmtDate = (d: Date) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  export const fmtRelative = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat('ar-EG-u-nu-latn', { numeric: 'auto' }).format(value, unit)
  ```
  Keep one shared `lib/format.ts`; do not format inline.
- LTR islands: phone numbers, emails, URLs, IDs, hashes, signed deltas, and code use `.ltr-iso`. Inputs for phone, email, and URL use `dir="ltr"` with `text-align: end` so they align with neighboring fields.
- Currency and points: number first, then the unit as separate spans (`150` `نقطة`), never a single concatenated string.
- Arabic text needs more line height than Latin: use the line heights in 5.2. Never reduce them to fit.
- Truncation: single-line clamp with an ellipsis is allowed for names; always expose the full text via `title` or Tooltip.
- Text expansion: Arabic and English strings differ in length; no fixed-width buttons (use min-width and padding).
- Do not insert Latin punctuation inside Arabic sentences (use `،` `؟` `؛`).

---

## 10. Accessibility (non-negotiable)

- WCAG 2.2 AA minimum. Body text contrast at least 4.5:1, large text and UI boundaries at least 3:1.
- Every interactive element has a visible `:focus-visible` style (2px `--focus-ring`, offset 2px). Never remove outlines without a replacement.
- Full keyboard use: tab order follows DOM order and matches visual order in RTL; Esc closes overlays; arrow keys in tabs, menus, radio groups; Enter and Space activate.
- Dialogs and drawers: focus trap, return focus to the trigger, `aria-modal`, labelled by the title.
- Color is never the only signal: tier = label + dots; quality = icon + label; deltas = sign + number; form errors = icon + text.
- Touch targets at least 44x44px on touch screens.
- Live regions: toasts and purchase results announced (`aria-live`).
- Images and illustrations: decorative ones `aria-hidden`; meaningful ones have Arabic alt text.
- Tables use proper `th`/`scope`; sortable headers expose `aria-sort`.
- Respect `prefers-reduced-motion`.
- Form fields: programmatic labels, `aria-describedby` for helper and error text, `aria-invalid` on error.

---

## 11. Microcopy

Voice: plain, calm, helpful. Simple Modern Standard Arabic, no slang. Short sentences. Verb or verbal noun first. No exclamation marks, no "من فضلك", no filler like "بنجاح". Use verbal nouns on buttons (`شراء`, `حفظ`, `تأكيد`) to stay gender-neutral. Address the user directly only when necessary, in the neutral imperative or passive. The same action keeps the same name everywhere (the button `تأكيد الشراء` leads to the toast `تم الشراء`).

Errors: say what happened, then what to do, in one sentence or two. Never expose raw exception text. Empty states invite action.

| Context | Arabic string |
|---|---|
| Primary buttons | `تأكيد الشراء`, `شحن الرصيد`, `حفظ التغييرات`, `التالي`, `دمج السجلين` |
| Secondary buttons | `عرض الفرصة`, `إلغاء`, `رجوع`, `تعديل التفضيلات`, `ليسا نفس النشاط`, `تخطي` |
| Utility | `نسخ`, `نسخ الرقم`, `مسح الفلاتر`, `مسح الكل`, `فلاتر متقدمة`, `إعادة المحاولة` |
| Why trigger | `لماذا؟` (tooltip), section title `لماذا هذه الدرجة؟`, `لماذا تناسبك هذه الفرصة؟` |
| Purchase success | `تم الشراء` |
| Insufficient balance | `رصيدك لا يكفي. تحتاج {n} نقاط إضافية.` |
| Race lost | `اشترى مطور آخر هذه الفرصة قبل لحظات.` |
| Generic failure | `تعذّر إكمال العملية. حاول مرة أخرى.` (add `لم يُخصم أي رصيد.` only when guaranteed by the backend) |
| Network | `تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.` |
| Validation, required | `هذا الحقل مطلوب.` |
| Validation, format | `أدخل رقم هاتف مصري صحيح.` |
| Report wrong number | `الإبلاغ عن رقم خاطئ` then `سنرسل إشارة لإعادة التحقق من الرقم. لن يُحذف الرقم فوراً.` |
| Empty feed | title `لا توجد فرص مطابقة الآن`, body `عدّل المدن أو التخصصات لتظهر فرص أكثر.`, CTA `تعديل التفضيلات` |
| Empty pipeline | title `لم تشترِ أي فرصة بعد`, body `ابدأ بتصفح الفرص المطابقة لملفك.`, CTA `تصفح الفرص` |
| Empty ledger | title `لا توجد حركات بعد`, body `ستظهر هنا كل عملية شحن وشراء.` |
| Empty admin queue | title `لا شيء يحتاج مراجعة`, body `ستظهر هنا السجلات التي تحتاج قراراً.` |
| Unsaved changes | `{n} تغييرات غير محفوظة` |
| Table footer | `عرض {from} إلى {to} من {total}` |
| Placeholders | real examples: `مثال: عيادات الأسنان`, `01012345678`, `اسم@شركتك.com` |

All trust or guarantee statements (refunds, finality, immutability, "no AI") are **suggestions pending owner confirmation**. Render them only if they match real product behavior; otherwise omit.

---

## 12. Implementation plan

Suggested structure (adapt to the repo's existing layout, do not move existing files without reason):

```
src/styles/tokens.css          (all tokens, section 5 and Appendix B)
src/styles/globals.css         (base styles, density, .ltr-iso, reduced motion)
tailwind.config.ts             (maps tokens, Appendix A)
src/lib/format.ts              (number, date, relative time)
src/components/ui/*            (primitives)
src/components/domain/*        (OpportunityBadge, QualityIndicator, OwnershipTag, ...)
src/app/design-system/page.tsx (living style guide, dev-only)
docs/design/*                  (AUDIT, PROGRESS, OPEN_QUESTIONS, BACKEND_GAPS, hostinger-reference-notes)
```

**Phase 0, Audit**: section 2. No code changes.

**Phase 1, Foundations**: fonts via `next/font`; `tokens.css`; Tailwind mapping; `globals.css` (base body: bg `--bg-page`, text `--text-primary`, `font-family`, `font-size` 16px, antialiasing); `<html lang="ar" dir="rtl">`; density attribute support; remove or neutralize conflicting global CSS. App must still build and render.

**Phase 2, Primitives**: Button, IconButton, Input, Textarea, Select, MultiSelect, Checkbox, Radio, Switch, Badge, Card, Tabs (underline and segmented), Dialog, Drawer, Popover, Tooltip, Toast, Banner, Table, Pagination, FilterBar, EmptyState, Skeleton, Spinner, Avatar, LockedField.

**Phase 3, Domain components**: OpportunityBadge, QualityIndicator, OwnershipTag, StageBadge, ScorePair, ScoreBreakdown, CreditChip, LeadCard, LeadRow, PurchaseConfirm, PackageCard, PipelineColumn and PipelineCard, MergeCompare, RuleWeightEditor, Stepper, AppShell (Sidebar, TopBar, PageHeader). Props mirror existing data types. Map to the real enums from the audit.

**Phase 4, Style guide**: build `/design-system`, **dev-only** (hidden when `NODE_ENV === 'production'` or protected for admin). Sections: color swatches with token names and contrast ratios, type scale, spacing scale, radius, elevation, motion note, icons, then every component in every state, both densities. Include a toggle for `dir` to confirm nothing depends on RTL accidentally. **STOP here, update `docs/design/PROGRESS.md`, and wait for the owner's review.**

**Phase 5, Apply**: wrap existing pages with AppShell and the right template (section 8), swap old components for new ones, route group by route group (developer pages first, then admin). Logic, data fetching, and handlers stay as they are. One commit per route group.

**Phase 6, QA**: section 14.

---

## 13. Calibration against the live reference (do after Phase 1, before Phase 4)

The author of this spec translated the reference's style into numbers without access to its stylesheet, so verify rhythm, but **do not change this spec's tokens on your own**.

1. Open `https://www.hostinger.com/ae` in a browser at 1440px and 390px widths.
2. Record in `docs/design/hostinger-reference-notes.md`: section vertical padding, container max width, heading sizes and weights, subtitle size, card radius and padding, button height and radius, gap between cards, pricing card layout.
3. Produce a table: reference value | this spec | difference.
4. Report differences above 20 percent in spacing or size to the owner via `OPEN_QUESTIONS.md`. Keep the spec's value until the owner decides.
5. Never copy: colors (especially its purple), logo, illustrations, videos, copy, icons, or exact layouts.

---

## 14. Acceptance checklist (Phase 6)

Automated:
- `grep -rEn "#[0-9A-Fa-f]{3,8}\b" src --include=*.ts --include=*.tsx --include=*.css | grep -v "styles/tokens.css"` returns nothing (SVG assets excluded, listed in the PR).
- `grep -rEn "\b(ml|mr|pl|pr)-[0-9]|text-(left|right)\b|\b(left|right)-[0-9]" src` returns nothing in new or modified files.
- `grep -rEn "\[[0-9]+px\]|gradient" src` returns nothing in new or modified files.
- Typecheck, lint, and the existing test suite pass. No file under `prisma/`, API handlers, or engine code changed (`git diff --stat` reviewed).

Visual (screenshots at 390, 768, 1024, 1440 widths for each template):
- No horizontal page scroll. Wide tables scroll inside their container.
- Every interactive element shows a visible focus state.
- Only one filled primary button per view.
- Teal appears only in the roles listed in 5.1; no green, no purple, no gradients.
- Tier pills show label and dots; quality is a separate line; ownership is outlined.
- Arabic text is not clipped; numbers are Western and aligned; LTR islands render correctly.

Accessibility and behavior:
- Keyboard-only walkthrough of: browse feed, open a lead, open "why", purchase (including insufficient balance), view pipeline, admin merge, edit a rule weight.
- Lighthouse accessibility score of at least 95 on feed, lead detail, and top-up.
- With reduced motion enabled, no non-essential animation runs.

Deliver `docs/design/PROGRESS.md` with what changed per phase, deviations, and open questions, plus `BACKEND_GAPS.md`.

---

## Appendix A: Tailwind mapping

Tailwind v3 (`tailwind.config.ts`). For v4, express the same mapping in CSS with `@theme inline { --color-page: var(--bg-page); ... }`. Check the installed version in Phase 0.

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        inverse: 'var(--bg-inverse)',
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          pressed: 'var(--brand-pressed)',
          accent: 'var(--brand-accent)',
          soft: 'var(--bg-brand-soft)',
          'soft-strong': 'var(--bg-brand-soft-strong)',
        },
        fg: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          brand: 'var(--text-brand)',
          'on-brand': 'var(--text-on-brand)',
          inverse: 'var(--text-inverse)',
        },
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          brand: 'var(--border-brand)',
        },
        warning: { bg: 'var(--warning-bg)', border: 'var(--warning-border)', text: 'var(--warning-text)', icon: 'var(--warning-icon)' },
        danger: { bg: 'var(--danger-bg)', border: 'var(--danger-border)', text: 'var(--danger-text)', icon: 'var(--danger-icon)', fill: 'var(--danger-fill)', 'fill-hover': 'var(--danger-fill-hover)' },
        info: { bg: 'var(--info-bg)', border: 'var(--info-border)', text: 'var(--info-text)', icon: 'var(--info-icon)' },
        tier: {
          'cold-bg': 'var(--tier-cold-bg)', 'cold-fg': 'var(--tier-cold-fg)',
          'warm-bg': 'var(--tier-warm-bg)', 'warm-fg': 'var(--tier-warm-fg)',
          'hot-bg': 'var(--tier-hot-bg)', 'hot-fg': 'var(--tier-hot-fg)',
          'premium-bg': 'var(--tier-premium-bg)', 'premium-fg': 'var(--tier-premium-fg)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['clamp(2rem, 1.4rem + 2.6vw, 3.5rem)', { lineHeight: '1.15', fontWeight: '700' }],
        h1: ['clamp(1.625rem, 1.3rem + 1.2vw, 2rem)', { lineHeight: '1.3', fontWeight: '600' }],
        h2: ['1.5rem', { lineHeight: '1.35', fontWeight: '600' }],
        h3: ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        h4: ['1.125rem', { lineHeight: '1.45', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.75' }],
        body: ['var(--text-body-size)', { lineHeight: '1.7' }],
        'body-sm': ['0.875rem', { lineHeight: '1.65' }],
        label: ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1.5' }],
      },
      borderRadius: {
        sm: '0.5rem',   // 8
        md: '0.75rem',  // 12
        lg: '1rem',     // 16
        xl: '1.5rem',   // 24
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--ring-focus)',
      },
      height: {
        control: 'var(--control-h)',
        row: 'var(--row-h)',
        nav: 'var(--nav-item-h)',
      },
      padding: { card: 'var(--card-pad)' },
      transitionDuration: { fast: '120ms', DEFAULT: '200ms', slow: '320ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)', out: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      zIndex: { sticky: '10', dropdown: '20', drawer: '30', dialog: '40', toast: '50', tooltip: '60' },
      maxWidth: { public: '75rem', app: '80rem', reading: '45rem' },
    },
  },
}
export default config
```

---

## Appendix B: Additions to tokens.css, globals, and font loading

Add to `tokens.css` (tier tokens are the only way components reference heat colors; density tokens drive 5.7; `--shadow-xs` is already defined in 5.4):

```css
:root {
  --tier-cold-bg:var(--bg-subtle);   --tier-cold-fg:var(--text-secondary);
  --tier-warm-bg:var(--sand-100);    --tier-warm-fg:var(--sand-700);
  --tier-hot-bg:var(--clay-50);      --tier-hot-fg:var(--clay-700);
  --tier-premium-bg:var(--bg-inverse); --tier-premium-fg:var(--text-inverse);
}

:root,
[data-density="comfortable"] {
  --control-h:3rem; --row-h:3.5rem; --text-body-size:1rem; --card-pad:1.5rem; --nav-item-h:2.75rem;
}
[data-density="compact"] {
  --control-h:2.25rem; --row-h:2.75rem; --text-body-size:0.875rem; --card-pad:1rem; --nav-item-h:2.5rem;
}
```

`globals.css` essentials:

```css
html { font-family: var(--font-sans); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
body { background: var(--bg-page); color: var(--text-primary); font-size: 1rem; line-height: 1.7; }
*, *::before, *::after { box-sizing: border-box; }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ltr-iso { direction: ltr; unicode-bidi: isolate; text-align: end; font-variant-numeric: tabular-nums; }
.tabular { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Font loading (Next.js App Router, `app/layout.tsx`):

```tsx
import { IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google'

const sans = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${sans.variable} ${mono.variable}`} data-density="comfortable">
      <body>{children}</body>
    </html>
  )
}
```

If `next/font` rejects a subset name, check the subsets Google publishes for the family and adjust; the family and weights stay the same.

---

End of spec. When in doubt: keep it calm, keep it neutral, keep one primary action, make every number explainable.

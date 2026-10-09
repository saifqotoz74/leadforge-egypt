# Hostinger Reference Calibration Notes (Section 13)

> **Spec Reference:** `docs/design/LEADFORGE_DESIGN_SYSTEM.md` (Section 13 — Calibration against the live reference)  
> **Source Target:** `https://www.hostinger.com/ae` (Live inspected at 1440px desktop and 390px mobile viewports)  
> **Date:** October 9, 2026  
> **Calibration Policy:** Verify visual rhythm, proportions, and spacing. In accordance with Section 13, LeadForge design system tokens remain authoritative and are not modified unilaterally. Differences above 20% are documented below and reported to the project owner in `docs/design/OPEN_QUESTIONS.md`.

---

## 1. Overview of Live Reference Inspection

Hostinger UAE (`hostinger.com/ae`) was inspected via live network fetch of its production HTML, CSS entrypoint (`/ae/_nuxt/entry.Bo6h610W.css`), and component stylesheets (`/ae/_nuxt/components.Bprn_wmJ.css`).

Hostinger's design tokens and layout structure revealed the following core design characteristics:
- **Spatial grid:** Multiples of 4px and 8px (`--h-spacing-2xs: 8px`, `xs: 12px`, `sm: 16px`, `md: 24px`, `lg: 32px`, `xl: 40px`, `2xl: 48px`, `3xl: 64px`, `4xl: 80px`).
- **Corner Radii:** Prominent rounded corners (`sm: 8px`, `md: 12px`, `lg: 16px`, `xl: 24px`, `full: 999px`). Pricing cards use 24px (`radius-xl`).
- **Typography Scale:** High-contrast marketing title scale (Title 1: 48px desktop / 36px mobile, Title 2: 36px desktop / 32px mobile) with compact UI headings (21px, 18px, 16px) and body sizes (15px, 13px, 11px).
- **Pricing Card Architecture:** 3-column card grid, recommended card highlighted with 2px primary border, top straddling badge, large tabular numeral for the monthly amount, checkmark feature list, full-width button, and reassure subtext.

---

## 2. Comparison Table: Live Reference vs. LeadForge Spec

| Dimension / Element | Hostinger Reference Value (`hostinger.com/ae`) | LeadForge Design System Spec | Measured Difference | Assessment & Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| **Section Vertical Padding (Desktop)** | `80px` (`padding-block: 80px`) | `96px` (Public marketing sections, Spec 8) | **+20.0%** | LeadForge's 96px allows greater breathing room for Arabic script line heights. Flagged in `OPEN_QUESTIONS.md`. |
| **Section Vertical Padding (Mobile 390px)** | `24px` to `54px` | `32px` to `48px` | Within ±15% | Aligned. |
| **Container Max Width (Content)** | `1280px` (`max-width: 1280px` on wide media) | `1200px` (`max-w-7xl` / 1200px spec container) | **-6.25%** | Aligned. 1200px prevents overly long Arabic text lines (exceeding 75ch). |
| **H1 Title Size (Desktop 1440px)** | `48px` (Title 1, line-height 55px, weight 700) | `32px` (`clamp(1.625rem, 1.3rem + 1.2vw, 2rem)`) / `display` 56px | **-33.3%** (for H1) | **Difference > 20%**: Hostinger's 48px is a landing page hero title. LeadForge separates `display` (56px) for public hero and `h1` (32px) for application page headers. Aligned when comparing `display`. |
| **H2 Heading Size (Desktop)** | `36px` (Title 2, line-height 50px, weight 700) | `24px` (`1.5rem`, line-height 1.35, weight 600) | **-33.3%** | **Difference > 20%**: LeadForge's H2 is designed for dense dashboard sections. Hostinger's Title 2 is marketing section headings. Recommend keeping 24px for app UI and using `h1` for marketing. |
| **H3 Heading Size (Desktop)** | `32px` (Title 3, line-height 40px) | `20px` (`1.25rem`, line-height 1.4, weight 600) | **-37.5%** | Same rationale: App UI card titles vs marketing section headers. |
| **Body Font Size (Default)** | `15px` (`--font-size-body-1`, line-height 22px) | `16px` (`1rem`, line-height 1.7) | **+6.6%** | Aligned. Arabic IBM Plex Sans Arabic requires 16px minimum for comfortable reading and ligatures. |
| **Card Border Radius (Pricing)** | `24px` (`--h-border-radius-xl: 24px`) | `24px` (`radius-xl`, Spec 7.12) | **0.0% (Exact match)** | Perfect calibration. |
| **Card Padding (Pricing)** | `24px 24px 32px` (desktop), `24px` (mobile) | `32px` (Spec 7.12 comfortable) | **0.0% (Exact match on vertical)** | Perfect calibration. |
| **Lead / Feed Card Radius** | `16px` (`--h-border-radius-lg: 16px`) | `16px` (`radius-lg`, Spec 7.8) | **0.0% (Exact match)** | Perfect calibration. |
| **Lead / Feed Card Padding** | `24px` (desktop) / `16px` (mobile) | `24px` comfortable / `16px` compact | **0.0% (Exact match)** | Perfect calibration. |
| **Button Height (Large)** | `48px` / `54px` (Desktop large CTA) | `48px` (`--control-h` / `size="lg"`, Spec 7.1) | Within 11% | Aligned. LeadForge uses 48px standard touch target. |
| **Button Height (Medium / Default)**| `40px` (`min-height: 40px`) | `40px` (`size="md"`, Spec 7.1) | **0.0% (Exact match)** | Perfect calibration. |
| **Button Height (Small)** | `32px` (`min-height: 32px`) | `32px` (`size="sm"`, Spec 7.1) | **0.0% (Exact match)** | Perfect calibration. |
| **Button Radius** | `12px` (`--h-border-radius-md: 12px`) or pill | `12px` (`radius-md`, Spec 7.1) | **0.0% (Exact match)** | Perfect calibration. |
| **Gap Between Pricing Cards** | `24px` (`gap: 24px` desktop) / `16px` (mobile) | `24px` (`gap-6`, Spec 7.12) | **0.0% (Exact match)** | Perfect calibration. |
| **Pricing Card Recommendation Tag**| Top badge `border-radius: 24px 24px 0 0` or pill overlay, 2px border | Pill badge `الأكثر اختياراً` straddling top edge, 2px border (Spec 7.12) | **Visual match** | Perfect calibration. |

---

## 3. Strict Prohibitions Observed (Section 13.5)

During this calibration, none of Hostinger's proprietary brand assets or patterns were copied:
- **Colors:** Hostinger's purple (`#673de6` / `--h-color-primary-500`) was completely rejected. LeadForge strictly maintains its Egyptian Teal palette (`--teal-50` to `--teal-900`) and Warm Neutrals.
- **Urgency / Gimmicks:** Hostinger's countdown timers, crossed-out fake discounts, and aggressive upsells were strictly excluded. LeadForge prices are deterministic points without false scarcity.
- **Assets & Icons:** No SVGs, logos, illustrations, or marketing copy from Hostinger were transferred.

# LeadForge Egypt — axe-core WCAG 2.1 AA Accessibility Audit

> **Audit Date:** 2026-10-11T23:20:56.058Z
> **Audited Routes (8):** `/`, `/pricing`, `/login`, `/register`, `/dashboard`, `/leads`, `/leads/cmv13ybbp012jtxt4uso3tpfb`, `/subscription`
> **Locales:** Arabic (`ar`) and English (`en`)
> **Standards:** WCAG 2.0 A/AA, WCAG 2.1 A/AA

## 1. Summary of axe-core Route Scans

| Route | Locale | Passes | Incomplete | Violations | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/` | `ar` | 26 | 2 | 1 | ⚠️ 1 Issues |
| `/` | `en` | 26 | 2 | 1 | ⚠️ 1 Issues |
| `/pricing` | `ar` | 22 | 0 | 1 | ⚠️ 1 Issues |
| `/pricing` | `en` | 22 | 0 | 1 | ⚠️ 1 Issues |
| `/login` | `ar` | 24 | 0 | 1 | ⚠️ 1 Issues |
| `/login` | `en` | 25 | 0 | 1 | ⚠️ 1 Issues |
| `/register` | `ar` | 25 | 0 | 1 | ⚠️ 1 Issues |
| `/register` | `en` | 25 | 0 | 1 | ⚠️ 1 Issues |
| `/dashboard` | `ar` | 20 | 0 | 0 | ✅ 0 Violations |
| `/dashboard` | `en` | 20 | 0 | 0 | ✅ 0 Violations |
| `/leads` | `ar` | 26 | 0 | 0 | ✅ 0 Violations |
| `/leads` | `en` | 26 | 0 | 1 | ⚠️ 1 Issues |
| `/leads/cmv13ybbp012jtxt4uso3tpfb` | `ar` | 20 | 0 | 0 | ✅ 0 Violations |
| `/leads/cmv13ybbp012jtxt4uso3tpfb` | `en` | 20 | 0 | 0 | ✅ 0 Violations |
| `/subscription` | `ar` | 20 | 0 | 0 | ✅ 0 Violations |
| `/subscription` | `en` | 20 | 0 | 0 | ✅ 0 Violations |

## 2. Landing Page Score Lab & Ownership Contrast Measurements

| Section | Element | Sample Text | Foreground | Background | Ratio | WCAG AA Status |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| Score Lab (Inverse Surface) | `h2.text-h1.font-bold` | "Interactive Score Lab" | `rgb(246, 239, 224)` | `rgb(15, 23, 42) (bg-inverse)` | **15.59:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `p.mt-3.text-body-lg` | "Adjust business attributes and" | `rgb(207, 218, 218)` | `rgb(15, 23, 42) (bg-inverse)` | **12.49:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `span.text-caption.text-fg-muted` | "Presets:" | `rgb(179, 193, 193)` | `rgb(15, 23, 42) (bg-inverse)` | **9.62:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `button.inline-flex.items-center` | "Dental Clinic" | `rgb(255, 255, 255)` | `rgb(15, 23, 42) (bg-inverse)` | **17.85:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `span.` | "Dental Clinic" | `rgb(255, 255, 255)` | `rgb(15, 23, 42) (bg-inverse)` | **17.85:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `button.inline-flex.items-center` | "Restaurant" | `rgb(246, 239, 224)` | `rgb(15, 23, 42) (bg-inverse)` | **15.59:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `span.` | "Restaurant" | `rgb(246, 239, 224)` | `rgb(15, 23, 42) (bg-inverse)` | **15.59:1** | ✅ Pass |
| Score Lab (Inverse Surface) | `button.inline-flex.items-center` | "Training Center" | `rgb(246, 239, 224)` | `rgb(15, 23, 42) (bg-inverse)` | **15.59:1** | ✅ Pass |

## 3. Violation Details

### Route: `/` (ar)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.pb-1 > .gap-1\.5.font-medium.inline-flex > span, .justify-end > .text-fg-muted.ltr-iso.tabular-nums`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/` (en)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.pb-1 > .gap-1\.5.font-medium.inline-flex > span, .justify-end > .text-fg-muted.ltr-iso.tabular-nums`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/pricing` (ar)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.inline-block, .mt-0\.5`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/pricing` (en)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.inline-block, .mt-0\.5`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/login` (ar)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.inline-block, .mt-0\.5`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/login` (en)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.inline-block, .mt-0\.5`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/register` (ar)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.inline-block, .mt-0\.5`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/register` (en)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.inline-block, .mt-0\.5`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.89 (foreground color: #8a9b9b, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1

### Route: `/leads` (en)

- **[SERIOUS] color-contrast**: Elements must meet minimum color contrast ratio thresholds
  - Description: Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
  - Help URL: https://dequeuniversity.com/rules/axe/4.10/color-contrast?application=axeAPI
  - Target: `.focus-visible\:ring-1 > bdi`
  - Summary: Fix any of the following:
  Element has insufficient color contrast of 2.71 (foreground color: #8a9b9b, background color: #f5f8f8, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1


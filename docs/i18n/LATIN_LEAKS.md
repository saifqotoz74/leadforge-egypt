# LeadForge Egypt — Multi-Route Bilingual Script & Locale Audit

> **Audit Date:** 2026-10-11T23:15:47.674Z
> **Target Routes (12):** `/`, `/pricing`, `/login`, `/register`, `/dashboard`, `/leads`, `/leads/cmv13ybbp012jtxt4uso3tpfb`, `/my-leads`, `/subscription`, `/settings`, `/onboarding`, `/dashboard/analytics`
> **Locales Verified:** Arabic (`lang="ar" dir="rtl"`) & English (`lang="en" dir="ltr"`)
> **Total Leaks Found:** 0

## Status: PASSED (Zero Leaks Across All Shipped Routes)

- **HTML Attributes:** Verified `lang="ar" dir="rtl"` in Arabic and `lang="en" dir="ltr"` in English across all routes.
- **Arabic UI Chrome:** 0 unauthorized Latin words outside `<bdi>`, `.ltr-iso`, `code`, or allowlist.
- **English UI Chrome:** 0 Arabic character runs outside `<bdi>` / `[dir="auto"]` user data wrappers.

# LeadForge Egypt — Design System Conformance Matrix
## Spec Reference: LEADFORGE_SPEC_ADDENDUM_01.md (Section 2.2)

Matrix across all 25 application routes (AUDIT.md Section 3).
Status is marked **Done** only when every column passes: 0 checker violations, new AppShell, only ui/domain components, hardcoded strings extracted, RTL icons mirrored, empty/loading/error states handled, and both 390px / 1440px screenshots verified.

| Route | Template | New AppShell | Only ui/domain comps | Violations | Hard-coded strings | RTL icons mirrored | States (Empty/Load/Err) | Shot 390 | Shot 1440 | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `/` | Public Marketing | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/login` | T1 Auth | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/register` | T1 Auth | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/pricing` | Public / T6 Top-up | Fail | Pass | 0 | Clean | Pass | Partial | Yes | Yes | **In Progress** |
| `/onboarding` | T2 Onboarding | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/settings` | T2 Settings | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/dashboard` | T11 Overview | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/dashboard/analytics` | Developer Analytics | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/leads` | T3 Feed | Fail | Pass | 0 | Clean | Pass | Partial | Yes | Yes | **In Progress** |
| `/leads/[id]` | T4 Lead Detail | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/credits` | T6 Top-up & T7 Ledger | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/pipeline` | T5 Pipeline | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/my-leads` | T5 Pipeline | Pass | Pass | 4 | Clean | Pass | Pass | Yes | Yes | **In Progress** |
| `/subscription` | T6 Top-up & T7 Ledger | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin` | T11 Overview | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/leads` | T8 Admin Table | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/duplicates` | T9 Admin Compare | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/quality` | T8 Admin Table | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/matching` | T10 Admin Editor | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/rules` | T10 Admin Editor | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/sources` | T8 Admin Table | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/users` | T8 Admin Table | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/plans` | Admin Plans Config | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/reports` | T8 Admin Table | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/admin/analytics` | Admin Analytics | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |
| `/design-system` | Living Style Guide | Pass | Pass | 0 | Clean | Pass | Pass | Yes | Yes | **Done** |

---

## Dead Tailwind Utility Classes Audit (Rule 18)

Total files containing dead/uncompiled utility classes: **8**

| File Path | Dead Classes Detected | Count |
| :--- | :--- | :---: |
| `src/app/admin/payments/page.tsx` | `bg-emerald-50`, `border-emerald-200`, `text-emerald-800`, `bg-rose-50`, `border-rose-200`, `text-rose-800`, `text-emerald-600`, `text-rose-600`, `text-amber-600`, `text-teal-700`, `text-teal-600`, `text-amber-500`, `text-caption-xs`, `hover:bg-rose-50`, `bg-emerald-100`, `bg-rose-100`, `text-teal-800`, `bg-teal-50`, `border-teal-200`, `bg-stone-900` | 20 |
| `src/app/forgot-password/page.tsx` | `bg-brand-soft/40`, `text-body-md`, `border-danger-line` | 3 |
| `src/app/my-leads/page.tsx` | `text-amber-700`, `dark:text-amber-400` | 2 |
| `src/app/reset-password/page.tsx` | `border-danger-line`, `text-body-md`, `bg-brand-soft/40` | 3 |
| `src/components/domain/LeadCard.tsx` | `bg-amber-500/10`, `text-amber-700`, `dark:text-amber-400`, `border-amber-500/20` | 4 |
| `src/components/domain/LeadRow.tsx` | `py-0.2`, `bg-amber-500/10`, `text-amber-700`, `dark:text-amber-400`, `border-amber-500/20` | 5 |
| `src/components/domain/TransferPaymentModal.tsx` | `bg-teal-500/10`, `text-teal-600`, `text-title`, `bg-surface-subtle`, `border-teal-200`, `bg-teal-50/50`, `text-teal-900`, `text-teal-800`, `bg-teal-100`, `text-caption-xs`, `bg-emerald-50`, `text-emerald-800`, `border-emerald-200`, `text-emerald-600`, `bg-rose-50`, `text-rose-800`, `border-rose-200`, `text-rose-600`, `hover:bg-surface-subtle`, `text-teal-700`, `hover:bg-rose-50` | 21 |
| `src/components/domain/WhatsAppOutreachModal.tsx` | `bg-brand/10`, `text-title`, `bg-surface-subtle`, `bg-danger/10`, `border-danger/20`, `bg-brand/5`, `hover:bg-surface-subtle` | 7 |

*Generated by `scripts/check-conformance.mjs` on 2026-10-15T15:19:28.703Z*

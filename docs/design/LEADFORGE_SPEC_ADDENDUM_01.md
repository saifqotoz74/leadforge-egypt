# LeadForge Egypt: Spec Addendum 01
## Conformance enforcement, language architecture, landing page

Audience: the implementing agent. This addendum **extends and, where they conflict, overrides** `LEADFORGE_DESIGN_SYSTEM.md` ("Base"). References like "Base 7.8" point to sections of that file. The Base rules still apply everywhere: backend frozen, tokens only, logical properties, no gradients, one primary action per view.

Reason for this addendum: the first implementation pass left pages unevenly converted (most admin pages incomplete), mixed Arabic and English inside the UI, and produced a weak landing page. This document fixes the process, not just the pages.

---

## 1. Corrections to the Base spec

1. `.ltr-iso` must not set `text-align`. Final definition:
   ```css
   .ltr-iso { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; }
   html[dir="rtl"] .ltr-field { text-align: right; }
   html[dir="ltr"] .ltr-field { text-align: left; }
   ```
   Use `.ltr-field` only on phone, email, and URL inputs. Numeric table cells use `text-end` plus `.ltr-iso`.
2. English line heights (applied when `lang="en"`): `body` 1.6, `body-lg` 1.65, `body-sm` 1.55, headings 1.25, `label` 1.35. Arabic values stay as in Base 5.2. Implement with `html[lang="en"]` overrides in `globals.css`.
3. `space-x-reverse`, `space-y-reverse`, and `flex-row-reverse` used to fake RTL are forbidden. Use `gap-*` and logical utilities.
4. Directional icons must be mirrored with `rtl:-scale-x-100` in every place they appear (audit found zero).

---

## 2. Part A: Conformance enforcement (fixes uneven coverage)

### 2.1 Why coverage was uneven
Tailwind is configured with `extend`, so the default palette (`slate`, `emerald`, `purple`, `rose`, and so on) and default radii and shadows are still available. Nothing stops a page from using them, and nothing reports it. We fix this with a checker now and a hard lockdown at the end.

### 2.2 The checker (build first, before editing any page)

Create `scripts/check-conformance.mjs` and an npm script `check:design`. It scans `src/**/*.{ts,tsx,css}` and **excludes**: `src/styles/tokens.css`, `src/lib/**`, `src/app/api/**`, `src/messages/**`, test files. It prints violations per file and exits non-zero if any exist.

| # | Rule | Pattern (examples) |
|---|---|---|
| 1 | Default palette utilities | `(bg\|text\|border\|ring\|fill\|stroke\|divide\|outline\|decoration\|placeholder\|accent\|caret\|shadow)-(slate\|gray\|zinc\|neutral\|stone\|red\|orange\|amber\|yellow\|lime\|green\|emerald\|teal\|cyan\|sky\|blue\|indigo\|violet\|purple\|fuchsia\|pink\|rose)-\d{2,3}` |
| 2 | Raw white/black | `\b(bg\|text\|border)-(white\|black)\b` (use `bg-surface`, `text-fg-on-brand`, `bg-inverse`) |
| 3 | Raw color values | `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `rgba(`, `hsl(` outside `tokens.css` |
| 4 | Gradients | `bg-gradient`, `linear-gradient`, `radial-gradient`, `conic-gradient`, color stops `from-`, `via-`, `to-` |
| 5 | Physical direction | `\b(ml\|mr\|pl\|pr)-`, `\b(left\|right)-\d`, `text-(left\|right)`, `border-(l\|r)\b`, `rounded-(l\|r\|tl\|tr\|bl\|br)\b`, `space-[xy]-reverse`, `flex-row-reverse` |
| 6 | Arbitrary values | `\[\d+(\.\d+)?(px\|rem\|em\|vh\|vw)\]`, `\[#`, `\[rgb` |
| 7 | Off-scale radius and shadow | `rounded-(2xl\|3xl)`, `shadow-(xl\|2xl\|inner)`, `blur`, `backdrop-blur`, `drop-shadow` |
| 8 | Forbidden motion | `animate-(bounce\|ping\|pulse)` (pulse only inside `Skeleton`), parallax libraries |
| 9 | Inline styles | `style={{` unless the line carries `/* design-allow: <reason> */` (dynamic widths only) |
| 10 | Forbidden icons | imports of `Sparkles`, `Sparkle`, `Wand`, `Wand2`, `Stars`, `Bot`, `BrainCircuit`, `Brain` from `lucide-react` |
| 11 | Missing density or states | Warn (not fail) for page files without an `EmptyState` or `Skeleton` import where the page fetches data |

The checker must also write `docs/design/CONFORMANCE.md`: a matrix with one row per route (all 25 routes in AUDIT.md section 3) and columns: Route | Template | New AppShell | Only `ui/` and `domain/` components | Checker violations | Hard-coded strings | RTL icons mirrored | Empty/loading/error states | Screenshot 390 | Screenshot 1440 | Status (Done only when every column passes). Fill it honestly. A route is "Done" only with zero violations **and** reviewed screenshots.

### 2.3 Admin and remaining pages: compositions the Base did not define

Use these instead of improvising. All use compact density unless stated.

- **Admin overview** (`/admin`): first block "needs attention" (review queue count tiles that link to their pages, each tile a `StatTile` with a status line), then summary tiles, then recent activity table.
- **Data table pages** (`/admin/leads`, `/admin/users`, `/admin/reports`, `/admin/sources`, `/admin/quality`): FilterBar, table (Base 7.6), row actions in a `...` menu, **details open in a Drawer** (never inline expansion), bulk selection bar sticky at the bottom with `{n} محدد` and actions.
- **CSV upload** (`/admin/leads`): `Dropzone` component: 1px dashed `--border-strong`, `radius-xl`, padding 48, upload icon 24, instruction text, secondary button `اختيار ملف`. States: idle, drag-over (bg `--bg-brand-soft`, border `--border-brand`), uploading (progress bar 4px `--brand-accent`), done (summary: accepted, skipped, failed counts as `StatTile` row), error (list of row errors in a table with row number, field, reason).
- **Diagnostic debugger** (`/admin/matching`): two columns. Start: inputs form (developer and lead pickers). End: **result trace** as a vertical step list: each gate is a row with check or x icon, the plain-language rule, and the values compared; below, the weighted table with signed contributions and a total. Technical codes appear in `--font-mono` chips (secondary).
- **Rules** (`/admin/rules`, matching rules): RuleWeightEditor (Base 7.14).
- **Duplicates**: MergeCompare (Base 7.14).
- **Sources and ingestion**: one `Card` per source with name, type pill, health line (neutral or warning style), last run caption, a switch for enabled/disabled, and a Drawer for run history. Dead-letter list as a table.
- **Users and roles**: table, role as neutral outline pill, edit in Drawer, destructive actions behind a danger Dialog that names the user.
- **Plans** (`/admin/plans`): list of plan rows plus an edit Dialog; a live `PackageCard` preview sits beside the form.
- **Reports and audit logs**: table with filters and a Drawer showing the payload in a `radius-sm` `--bg-subtle` block using `--font-mono`, `dir="ltr"`, horizontally scrollable.
- **Analytics** (admin and developer): no chart library is installed and none should be added now. Build `StatTile`, `BarList` (rows of label, value, and a 6px bar: track `--bg-brand-soft`, fill `--brand-accent`), and `DataTable`. Max 3 emphasis levels per view.
- Every list and detail view implements the three states with `Skeleton`, `EmptyState` (Base 7.7) and an error `Banner` with `إعادة المحاولة`.

### 2.4 Lockdown (final step, after every route is Done)
Change `tailwind.config.ts` from `extend` to **replace** for `colors`, `borderRadius`, and `boxShadow` so only token-backed utilities exist. Then re-run screenshots of all routes; anything that silently lost styling is a missed conversion. Add `check:design` and `check:i18n` to the pre-commit hook and CI.

---

## 3. Part B: Language architecture (Arabic and English, separated properly)

### 3.1 Principles
1. **One language per screen.** No UI sentence mixes Arabic and English. Arabic is the default locale; English is a complete second locale (the owner confirms when it is delivered, but the architecture supports both from day one).
2. **Every user-facing string lives in a message catalog.** No literal text in JSX, no enum value shown raw, no raw API error message shown.
3. **Terminology is controlled** by a glossary the owner approves.
4. **Regressions are blocked by tooling,** not by memory.

### 3.2 Library and wiring (approved dependency: `next-intl`)
- Use `next-intl` (v3.x, compatible with Next 14.2 App Router) **without URL prefixes**, so existing routes stay unchanged. Locale comes from the cookie `lf_locale` (`ar` or `en`), default `ar`.
- Files: `src/i18n/request.ts` (reads the cookie, loads messages), `src/messages/ar.json`, `src/messages/en.json`, plugin in `next.config`, `NextIntlClientProvider` in the root layout.
- Root layout sets `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>`.
- Server components use `getTranslations`; client components use `useTranslations`. Do not pass translated strings through API calls.
- Formatting helpers in `src/lib/format.ts` become locale-aware: Arabic uses `ar-EG-u-nu-latn` (Western digits); English uses `en-GB-u-nu-latn` for dates and `en-US` for numbers.

### 3.3 Catalog conventions
- Namespaces by area: `common`, `nav`, `auth`, `landing`, `leads`, `lead`, `credits`, `pipeline`, `settings`, `admin.overview`, `admin.duplicates`, and so on, plus `enums` and `errors`.
- Keys describe meaning, not wording: `leads.card.action.view`, never `leads.card.viewOpportunity`.
- Use **ICU messages** for interpolation and plurals. Arabic needs all plural categories (zero, one, two, few, many, other). Example:
  ```json
  "leads.results.count": "{count, plural, =0 {لا توجد فرص} one {فرصة واحدة} two {فرصتان} few {# فرص} many {# فرصة} other {# فرصة}}"
  ```
- Never build sentences by concatenating translated fragments. Use one message with placeholders; if markup is needed, use rich-text placeholders.
- Gender-neutral Arabic (Base section 11): verbal nouns on buttons, neutral phrasing in messages.

### 3.4 Enums, codes, and server-provided text
- **Enum labels**: a catalog section `enums.<EnumName>.<VALUE>` for every Prisma enum that can reach the UI (at minimum: `LeadTemperature`, `FreshnessState`, `VerificationStatus`, `VerificationRecordStatus`, `QualityStatus`, `LeadAvailabilityStatus`, `LeadOwnershipType`, `EngagementStatus`, `PipelineStatus`, `ClaimStatus`, `CreditTransactionType`, user roles, plan types, source types, and any others found in the schema). Provide `useEnumLabel` and a server twin. A missing key throws in development and logs plus humanizes in production. **Raw enum values are never rendered.**
- **Reuse existing Arabic labels** already in `src/lib/constants.ts` when they are good; move them into the catalog. Where an English label exists, replace it using the glossary.
- **Backend is frozen**, so for text that originates in the backend:
  - Errors: a central `mapApiError()` maps HTTP status and known error codes to `errors.*` messages. Unknown errors show `errors.generic`. Raw `error.message` is never shown.
  - Rule names and reasons (scoring and matching): map by rule code to `rules.<CODE>.label` and `.reason`. If a code has no entry, show the code in a mono chip (admin only) and log it to `docs/i18n/MISSING_KEYS.md`.
  - Free text written by users or ingested (business names, notes, addresses): render as data inside an element with `dir="auto"`; never as part of UI chrome.
  - Anything the frontend cannot translate without a backend change goes to `docs/design/BACKEND_GAPS.md`.

### 3.5 Latin-script policy (what may appear in Latin inside the Arabic UI)
Allowed:
- Brand and proper nouns: LeadForge, Google, Google Maps, Facebook, Instagram, WhatsApp.
- Technical identifiers: rule codes, IDs, hashes, URLs, emails, phone numbers, file names, CSV column names. Always in `.ltr-iso`; codes in `--font-mono`. A code is **secondary**: it follows a human Arabic label and appears only in admin screens.
- A short acronym allowlist, kept in `docs/i18n/ALLOWLIST.md`: `CSV`, `SSL`, `URL`, `API`, `ID`, `SaaS`. Adding to it needs owner approval.

Not allowed in Arabic UI chrome: words like Dashboard, Lead, Claim, Score, Pipeline, Admin, Settings, Subscription, Credits, Filter, and so on. Use glossary terms.
In the English locale the inverse holds: Arabic appears only inside user or ingested data.

### 3.6 Starter glossary (owner reviews; agent writes the final to `docs/i18n/GLOSSARY.md`)

| English | Arabic | Notes |
|---|---|---|
| Lead | فرصة | UI term; "عميل محتمل" only in explanatory text |
| Opportunity score | درجة الفرصة | |
| Quality score | درجة الجودة | |
| Freshness | الحداثة | |
| Verification / Re-verification | التحقق / إعادة التحقق | |
| Claim (purchase a lead) | شراء | the action is a purchase |
| Credits / Points | نقاط | balance = الرصيد |
| Ledger | كشف الحساب | |
| Top up | شحن الرصيد | |
| Exclusive / Shared | حصري / مشترك | |
| Matching | المطابقة | |
| Eligibility gates | شروط الأهلية | |
| Scoring rules | قواعد التقييم | |
| Weight | الوزن | |
| Deduplication / Duplicate | منع التكرار / مكرر | |
| Merge / Unmerge | دمج / إلغاء الدمج | |
| Provenance | مصدر البيانات | |
| Ingestion | استيراد البيانات | |
| Source / Collector | المصدر / المُجمِّع | |
| Dead-letter queue | السجلات المتعثرة | |
| Circuit breaker | الإيقاف التلقائي للمصدر | owner to confirm wording |
| Pipeline | مسار الصفقات | |
| Engagement | المتابعة | |
| Feedback | الملاحظات | |
| Analytics | التحليلات | |
| Audit log | سجل المراجعة | |
| Role / Admin / Developer | الدور / مدير النظام / مطور | |
| Subscription / Plan | الاشتراك / الباقة | |
| Report wrong number | الإبلاغ عن رقم خاطئ | |

Engagement and pipeline status labels (proposed; reuse existing ones if better): NEW `جديدة`, CLAIMED `تم الشراء`, CONTACTED `تم التواصل`, REPLIED `تم الرد`, INTERESTED `مهتم`, MEETING `اجتماع`, PROPOSAL_SENT `تم إرسال العرض`, NEGOTIATION `تفاوض`, WON `تمت الصفقة`, LOST `لم تتم`, NOT_INTERESTED `غير مهتم`, INVALID `بيانات غير صالحة`.

### 3.7 Decisions on points the audit left open

1. **QualityIndicator precedence** (one line only; first match wins):
   1. availability blocks the sale (`CLAIMED_FULL`, `NOT_SALEABLE`, `STALE`, `INVALID`, `CLOSED`, `DUPLICATE`, `ARCHIVED`): shown through the purchase area states in item 3, not the quality line;
   2. `FAILED_VERIFICATION`: warning, `غير موثّق`;
   3. `STALE` or `VERY_STALE`: warning, `قديم`;
   4. `UNVERIFIED`: warning, `غير موثّق`;
   5. `PARTIALLY_VERIFIED` or any record `NEEDS_REVERIFICATION`: neutral, `قيد إعادة التحقق`;
   6. `VERIFIED`: check icon, `موثّق`;
   7. `FRESH`: dot `--brand-accent`, `حديث`;
   8. `RECENT` or `NEEDS_VERIFICATION`: dot `--n-400`, `قديم نسبياً`;
   9. `UNKNOWN`: neutral dash, `غير معروف`.
   The relative time caption is shown whenever a verification or collection date exists.
2. **Quality score label** (`QualityStatus`): shown in the ScorePair quality block as a small neutral caption: VERY_LOW `منخفضة جداً`, LOW `منخفضة`, MEDIUM `متوسطة`, HIGH `عالية`, EXCELLENT `ممتازة`. No heat colors.
3. **Availability states in the purchase area** (`LeadAvailabilityStatus`): `AVAILABLE` normal; `CLAIMED_FULL` neutral Banner `اكتمل عدد المشترين لهذه الفرصة` and no buy button; `REQUIRES_VERIFICATION` and `STALE` warning Banner `هذه الفرصة قيد إعادة التحقق` and no buy button; `INVALID`, `CLOSED`, `DUPLICATE`, `NOT_SALEABLE`, `ARCHIVED`: report in `CONFORMANCE.md` whether the developer UI can ever reach them; if reachable, neutral Banner `هذه الفرصة غير متاحة` and no buy button.
4. **Seats label**: follow Base 6.3: label `مشترك` plus a separate caption `متبقي {n} من {max}`. No parentheses.
5. **Pipeline source of truth**: the board and stage badges use `LeadClaim.pipelineStatus`; the engagement timeline uses `LeadEngagement.currentStatus`. If the two can disagree, show pipeline status and report the case in BACKEND_GAPS.
6. **Developer tooling**: Radix primitives are approved (Dialog, Popover, Tooltip, Tabs, Select, Toast, DropdownMenu). `class-variance-authority` is approved. Nothing else without justification.

### 3.8 Language switcher
`LanguageSwitcher`: a two-option segmented control whose options are labeled in their own language (`العربية`, `English`). Placed in the public navbar, the footer, and the app top bar user menu. It sets `lf_locale` (1 year, `SameSite=Lax`) and refreshes. Persisting the choice per account needs a backend field: record it in BACKEND_GAPS, do not add it.

### 3.9 Enforcement
- ESLint rule `i18next/no-literal-string` (markup only mode) over `src/app/**` and `src/components/**`, with an allowlist for brand names and non-text props. Violations fail lint.
- `scripts/check-i18n.mjs` (`check:i18n`): (1) `ar.json` and `en.json` have identical key sets; (2) no unused keys; (3) all ICU messages parse; (4) Arabic values contain no Latin words of 3 or more letters outside placeholders, ICU keywords, and the allowlist; (5) English values contain no Arabic characters; (6) every Prisma enum used in UI has all values in `enums.*`.
- If Playwright is available: `scripts/scan-latin-leaks.mjs` visits every route in Arabic and writes `docs/i18n/LATIN_LEAKS.md` listing text nodes with Latin runs of 3+ letters outside the allowlist. The final count must be zero.

### 3.10 Delivery stages
- **i18n-1** (required now): infrastructure, switcher, extraction of every string, glossary, clean Arabic everywhere, `ar.json` complete. `en.json` exists with the same keys and English values for shared components and the landing page first.
- **i18n-2** (when the owner confirms): complete English catalog, RTL/LTR QA of every route, English line heights, and visual review in both locales.

---

## 4. Part C: Landing page (`/`)

### 4.1 Goal and audience
Audience: freelance web developers and small agencies in Egypt who buy leads and need to trust the data. Primary conversion: create an account. Secondary: view pricing. The page must feel precise and trustworthy, and it must demonstrate the product's real differentiator: **leads you can inspect, scored by fixed rules, no guesswork and no AI**.

### 4.2 Concept: "Explainable leads"
The page is a guided product tour built from the real components (`LeadCard`, `ScorePair`, `ScoreBreakdown`, `PurchaseConfirm`, `PackageCard`). The "wow" is the **Score Lab**: an interactive panel where the visitor changes facts about a business and watches the score recompute rule by rule, deterministically. Impressive through craft, clarity, and a signature interaction, not through effects.

### 4.3 What the landing page may do beyond the Base
Allowed here only:
- `display` size up to 4.5rem from 1280px.
- **One** dark section (`--bg-inverse` with `--teal-400` accents and `--sand-100` text) for the Score Lab.
- **One** scroll-linked sticky storytelling block (section 5 below), using CSS `position: sticky` and `IntersectionObserver`.
- Large product frames (`radius-xl`, `--shadow-lg`), one visible per viewport.
- A quiet SVG dot-grid pattern behind the hero (no CSS gradient functions, no masks).

Still forbidden: gradients, glow, blur, glassmorphism, emojis, sparkles, stock photos, 3D, parallax, entrance choreography, fake statistics, fake testimonials, fake client logos, countdown timers, urgency badges. Every number and claim on the page is either real (read from existing public data) or clearly labeled as an illustrative example.

### 4.4 Structure (all text from the `landing.*` catalog)

1. **Navbar** (sticky, 64px): wordmark; links `كيف يعمل`, `الدرجات`, `الباقات`, `الأسئلة`; LanguageSwitcher; secondary `تسجيل الدخول`; primary `إنشاء حساب`. A 1px bottom border appears after scroll.
2. **Hero** (comfortable, section padding 96): `display` headline up to two lines, subtitle in `body-lg`, primary `إنشاء حساب`, secondary `شاهد كيف تُحسب الدرجة` (scrolls to Score Lab). Beside or below the text: one live `LeadCard` (illustrative data, labeled `مثال توضيحي`). Under the buttons, three plain facts, each only if the owner confirms it is true: fixed rules instead of AI, duplicates removed before listing, a transparent points ledger.
   - Headline options (owner picks one; default A):
     - A: `اعرف أي نشاط تجاري يحتاج موقعاً، ولماذا.`
     - B: `فرص عملاء حقيقية. درجات واضحة. بلا تخمين.`
     - C: `من بيانات مبعثرة إلى عميل جاهز للتفاوض.`
   - Subtitle (A): `تجمع LeadForge بيانات الأنشطة التجارية في مصر، تنقّيها وتقيّمها بقواعد ثابتة، ثم تطابقها مع تخصصك ومدينتك.`
3. **Problem strip**: three columns titled `لماذا تفشل قوائم العملاء المعتادة`: duplicates, wrong phone numbers, businesses that already have a modern site. Each column: a small geometric UI fragment (built with components, not images), one sentence of the problem, one sentence of how LeadForge handles it.
4. **How it works** (sticky storytelling, desktop; stacked on mobile). Steps are a true sequence, numbering allowed: `1 جمع وتنقية`, `2 تقييم بدرجتين`, `3 مطابقة بشروط ثم أوزان`, `4 شراء ومتابعة`. Left column: step texts scrolling. Right column: a sticky frame that crossfades (200ms) between real component views: a merged duplicate pair, a ScorePair with its breakdown, a gates list with check marks, a PurchaseConfirm next to a pipeline card.
5. **Score Lab** (dark section, id `score-lab`). Controls on one side: switch `للنشاط موقع إلكتروني`, stepper `عدد التقييمات`, stepper `عدد الفروع`, slider `آخر تحقق منذ (أيام)`, and three preset businesses (`عيادة أسنان`, `مطعم`, `مركز تدريب`). Result on the other side: `ScorePair` (the tier pill and dots change among the four tiers, the quality line changes among freshness states) and a `ScoreBreakdown` whose bars animate over 200ms. A one-line note under it: `نفس المدخلات تعطي نفس النتيجة دائماً.` and a visible label `مثال توضيحي: الأوزان هنا للشرح فقط.`
   - Computation lives in `src/features/landing/demoRules.ts` as a pure function with illustrative weights. It does not call the backend and does not claim to be the real weights.
   - Accessibility: all controls keyboard operable, results announced via `aria-live="polite"`, reduced motion removes bar animation.
6. **Matching**: a developer profile card (city, specialties, budget) and three lead cards; each lead shows pass or fail on the gates with a plain reason, then the weighted ranking among those that pass. Illustrative data, labeled.
7. **Ownership and points**: segmented control `حصري` and `مشترك`; the panel shows how price, seats, and the balance-after math change (reuse `PurchaseConfirm` summary layout). Illustrative numbers, labeled.
8. **Pricing**: render the real plans using the same data source and function that `/pricing` already uses, with `PackageCard`. Do not invent plans, prices, or discounts.
9. **Commitments**: two columns, `ما نفعله` and `ما لا نفعله`. Examples (owner confirms each): decisions follow fixed, inspectable rules; wrong-number reports trigger re-verification and do not delete the record immediately; no sale of leads that are stale or unverified. Facts only.
10. **FAQ**: 6 to 8 questions as plain accordions (Radix `Accordion`): what is a lead, exclusive vs shared, how points work, what happens if a number is wrong, how leads are verified, who can use the platform, how to start.
11. **Final CTA band** (`--bg-brand-soft`): one `h2`, one primary button, one secondary link.
12. **Footer**: wordmark, link groups, LanguageSwitcher, copyright, contact email if one exists.

### 4.5 Motion, responsiveness, performance
- Motion only in: Score Lab transitions (200ms), sticky step crossfade (200ms), navbar border on scroll. Nothing else animates. Everything is disabled or static under `prefers-reduced-motion`.
- Mobile first. Below 1024px: sticky storytelling becomes stacked steps (each with its own frame), Score Lab controls sit above the result, hero text above the card.
- Server Components by default; client components only for Score Lab, the sticky block, accordion, and switcher. No images; use SVG and components. No new animation or chart libraries.
- Targets on mobile (Lighthouse): performance 90 or higher, accessibility 95 or higher, no layout shift, LCP under 2.0s on a fast 4G profile.

### 4.6 SEO and metadata
Per-locale `metadata`: title up to 60 characters, description up to 155. One `h1`. Landmarks (`header`, `main`, `footer`). `<link rel="alternate" hreflang>` is not added while locales share URLs. Open Graph tags with title and description; the OG image is generated with `next/og` only if it can use the same font; otherwise omit.

### 4.7 Copy rules
Arabic first, then English. Short, concrete, no hype words (`ثوري`, `الأفضل`, `خارق`), no AI claims, no exclamation marks, benefits in the visitor's terms. Every claim must be verifiable by the product or marked pending in `docs/design/OPEN_QUESTIONS.md`.

### 4.8 Acceptance
- Checker, i18n checks, and tests pass; Lighthouse targets met; no console errors.
- Keyboard-only walkthrough of nav, Score Lab, tabs, accordion, and CTAs.
- Screenshots at 390, 768, 1440, in Arabic (and English once i18n-2 is done).
- A short `docs/design/LANDING_NOTES.md` listing every illustrative element and every claim awaiting owner confirmation.

---

## 5. Order of work and gates

| Step | Work | Gate (owner reviews) |
|---|---|---|
| 1 | Part A tooling: `check:design`, generated `CONFORMANCE.md`. No page edits. | Matrix and violation counts |
| 2 | Part B infrastructure: next-intl, switcher, `format.ts`, enums catalog, error mapping, lint and `check:i18n`, glossary draft. Convert shared components (AppShell, PublicNavbar, domain components, dialogs). | Glossary approval, a converted sample page in Arabic |
| 3 | Route-group passes, **conformance and string extraction in the same pass per page**: (a) developer app, (b) admin A: overview, leads, duplicates, quality, (c) admin B: matching, rules, sources, (d) admin C: users, plans, reports, analytics, (e) auth and pricing. | Screenshots plus updated matrix after each group |
| 4 | Landing page (Part C). | Live review in the browser |
| 5 | English catalog and QA (i18n-2), when confirmed. | Both locales reviewed |
| 6 | Lockdown (2.4), final audit, `PROGRESS.md`. | Final sign-off |

Never combine more than one route group in a single report. Never mark a route Done without screenshots.

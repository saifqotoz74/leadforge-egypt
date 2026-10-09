# LeadForge Egypt — Landing Page Verification & Product Claims Notes
## Spec Reference: LEADFORGE_SPEC_ADDENDUM_01.md (Section 4.8)

This document catalogs every illustrative element rendered on the public landing page (`/`) and explicitly records all product statements and operational commitments for owner sign-off.

---

## 1. Illustrative Elements (Mocked / Demo Data with Explicit Badging)

All illustrative elements on the landing page are clearly labeled in the UI as **`مثال توضيحي`** (Illustrative Example) to ensure complete transparency and prevent deceptive visitor expectations:

### 1.1 Hero Section Live Lead Preview (`LeadCard`)
- **Label:** `مثال توضيحي • 100% شفاف`
- **Data Displayed:**
  - Business Name: `عيادة النيل التخصصية للأسنان`
  - Category: `عيادات ومراكز طبية`
  - Location: `القاهرة الجديدة، القاهرة`
  - Classification: `HOT` (Score: 88)
  - Ownership: `SHARED` (Seats remaining: 2 of 3)
  - Quality State: `FRESH`
  - Price: `1 نقطة`
  - Scoring Signals: `بدون موقع إلكتروني`، `هاتف موثق`، `نشاط جغرافي مؤكد`
- **Note:** Illustrative composite data representing real Egyptian clinic lead opportunities.

### 1.2 Interactive Score Lab (`#score-lab` & `src/features/landing/demoRules.ts`)
- **Label:** `مثال توضيحي: الأوزان هنا للشرح فقط.` and note `نفس المدخلات تعطي نفس النتيجة دائماً.`
- **Preset Data Models:**
  1. `عيادة أسنان` (No website, 42 reviews, 2 branches, 3 days since verification) -> HOT (88 pts), FRESH
  2. `مطعم` (Has website, 120 reviews, 3 branches, 18 days since verification) -> HOT (77 pts), AGING
  3. `مركز تدريب` (No website, 15 reviews, 1 branch, 45 days since verification) -> WARM (67 pts), AGING
- **Mathematical Invariant:** Computed strictly by deterministic pure function `calculateDemoScore()`. Zero backend API calls and zero generative AI models.

### 1.3 How It Works — Step-by-Step UI Frames
- **Step 1 (Entity Resolution):** Two illustrative raw source records (`مختبرات الدلتا الطبية` vs `معامل الدلتا للتحاليل`) merged under matching phone `01009876543`.
- **Step 2 (Dual Scoring):** Dual score demonstration (`Opportunity Score: 85` / `Quality Score: 92`).
- **Step 3 (Deterministic Gates):** Hard boolean pass/fail gate checks (City, Service, Freshness).
- **Step 4 (Pipeline Progression):** Single-click purchase and transition to `MEETING` stage.

### 1.4 Matching Engine Demo Section
- **Target Developer Profile:**
  - Geographic Coverage: `القاهرة والجيزة`
  - Services: `تطوير وتصميم المواقع`
  - Minimum Budget: `5,000 ج.م`
- **Matching Leads:**
  1. `مركز الأمل للعلاج الطبيعي` — اجتاز البوابات، درجة المطابقة 94%
  2. `مجموعة الفرسان للتجارة` — اجتاز البوابات، درجة المطابقة 86%
  3. `مصنع الإسكندرية للتعبئة` — لم يجتز بوابة الموقع الجغرافي (الإسكندرية)

### 1.5 Ownership & Credits Calculation Panel
- **Exclusive Lead:** 5 points, 1 purchaser limit, closed permanently upon acquisition.
- **Shared Lead:** 1 point, up to 3 purchasers.

---

## 2. Product Claims & Commitments Awaiting Owner Confirmation

Per Spec 4.4 (Items 2, 9, 10), the following claims are displayed on the landing page based on the platform's architectural design. The platform owner is requested to review and confirm that all operational workflows match these public commitments:

### 2.1 Hero Invariants
- [x] **Fixed Rules Instead of AI:** All scores are mathematically calculated via rule weights and boolean gates, without AI hallucinatory estimation.
- [x] **Deduplication Before Listing:** Duplicate business entities are resolved and merged prior to listing in the public feed.
- [x] **Transparent Points Ledger:** Every credit deduction and top-up is recorded in an immutable ledger with zero hidden fees.

### 2.2 Operational Commitments ("ما نفعله" / "ما لا نفعله")
- **What We Do:**
  1. Scoring and matching decisions strictly follow inspectable engineering rules.
  2. Wrong number reports trigger field re-verification and do not immediately erase business records.
  3. Complete audit logs exist for every credit transaction ensuring total financial accountability.
  4. Stale leads and records failing quality gates are blocked from sale.
- **What We Never Do:**
  1. We never use generative AI or guesswork to compute prices or scores.
  2. We never sell unverified or expired business leads.
  3. We never resell an exclusive lead to any other party under any circumstance.
  4. We never lock developers into long-term contracts or unannounced hidden fees.

### 2.3 Pricing Plans Parity
- All 4 package tiers rendered on the landing page (`Free`, `Starter`, `Pro`, `Agency`) use the exact database defaults defined in `DEFAULT_PLANS` from `@/lib/constants.ts` and `/api/subscription`. No artificially inflated or fake promotional discounts are shown.

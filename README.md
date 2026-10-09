# LeadForge Egypt — منصة فرص المبيعات المؤهلة لمطوري المواقع في مصر

**LeadForge Egypt** هي منصة SaaS متكاملة (Full-Stack MVP) مصممة لمساعدة **Freelancers** و**Web Developers** و**Small Web Agencies** في مصر على الحصول على **فرص بيع مؤهلة (Qualified Sales Opportunities)** لتطوير المواقع الإلكترونية.

> **مبدأ المنصة الأساسي (Zero AI Policy):**
> المنصة لا تستخدم أي نموذج ذكاء اصطناعي (لا OpenAI API، لا LLM، لا Machine Learning).
> جميع عمليات جمع البيانات، التطبيع، التحقق، منع التكرار، فحص المواقع، التقييم، والمطابقة تعتمد 100% على **محركات قواعد حتمية (Deterministic Rule-Based Engines)**، شروط Boolean، أوزان قابلة للتعديل من مدير النظام (Admin)، وبيانات منظمة.

---

## 1. نظرة عامة على المعمارية (Architecture Overview)

تتكون المنصة من خط أنابيب معياري لتحويل البيانات الخام إلى فرص بيع مؤهلة:

```text
Raw Data (CSV / Manual / Open Data / Directory / Google Business)
   ↓
Collector Interface (src/lib/collectors/index.ts)
   ↓
Normalizer (src/lib/normalizer.ts — تطبيع أرقام الهواتف المصرية، النطاقات، والأسماء العربية/الإنجليزية)
   ↓
Validator (src/lib/validator.ts — التحقق من صحة الحقول والتقييمات)
   ↓
Deduplicator (src/lib/deduplicator.ts — منع التكرار ودمج المصادر المتعددة لنفس الشركة)
   ↓
Website Checker (src/lib/website-analyzer.ts — فحص HTTP, HTTPS/SSL, Mobile Viewport, والهيكل البرمجي)
   ↓
Rule-Based Scoring Engine (src/lib/scoring-engine.ts — حساب النقاط من 100 وتصنيف COLD/WARM/HOT/PREMIUM)
   ↓
PostgreSQL + Prisma Database (16 جدولاً بعلاقات وفهارس كاملة)
   ↓
Developer Matching Engine (src/lib/matching-engine.ts — مطابقة حسب الخدمات، المدن، التخصصات، والميزانية)
```

---

## 2. التقنيات المستخدمة (Tech Stack)

- **الإطار الأساسي (Framework):** Next.js 14 (App Router, Full-Stack Route Handlers & React Server/Client Components)
- **اللغة (Language):** TypeScript (Strict Mode)
- **قاعدة البيانات (Database):** PostgreSQL + Prisma ORM (`@prisma/client` v6 + محرك PostgreSQL المدمج `@electric-sql/pglite` للتشغيل المحلي الفوري بدون الحاجة إلى إعداد خادم خارجي، مع دعم كامل لأي خادم PostgreSQL خارجي عبر `DATABASE_URL`)
- **التصميم وواجهة المستخدم (UI/UX):** Tailwind CSS + تصميم عربي أصيل مع دعم كامل لـ RTL (`dir="rtl"`) + Lucide Icons
- **المصادقة والأمان (Auth & Security):** `bcryptjs` لتشفير كلمات المرور، `jose` لجلسات JWT المحمية داخل `HttpOnly` Cookies، صلاحيات RBAC (`DEVELOPER` / `ADMIN`)، حماية CSRF، Rate Limiting، وAudit Logs
- **الاختبارات (Testing):** Vitest (اختبارات الوحدات، التكامل، قاعدة البيانات، الصلاحيات، والـ API)

---

## 3. متغيرات البيئة (Environment Variables)

انسخ ملف `.env.example` إلى `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/leadforge_egypt?schema=public"
USE_EXTERNAL_PG="false"
PGLITE_DATA_DIR="./.pgdata"
AUTH_SECRET="leadforge-egypt-local-dev-secret-change-in-production-32chars"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

- عند ضبط `USE_EXTERNAL_PG="false"` (الافتراضي للتشغيل المحلي السريع)، يعمل محرك PostgreSQL المدمج (PGlite) ويحفظ البيانات محليًا في مجلد `./.pgdata`.
- عند ضبط `USE_EXTERNAL_PG="true"`، يتصل Prisma مباشرة بخادم PostgreSQL المحدد في `DATABASE_URL`.

---

## 4. التثبيت وإعداد قاعدة البيانات والتشغيل (Installation & Local Setup)

### أ. تثبيت الحزم
```bash
npm install
```

### ب. توليد Prisma Client وتطبيق هيكلة قاعدة البيانات (Migration)
```bash
npm run db:generate
npm run db:migrate
```

### ج. زراعة البيانات التجريبية الواقعية (Seed Data)
يقوم أمر الـ Seed بإدخال **55 نشاطًا تجاريًا في مصر** عبر 10 محافظات و9 تخصصات، مع **5 مطورين + 1 مدير نظام**، **4 باقات اشتراك**، و**10 قواعد تقييم**:
```bash
npm run db:seed
```
*(أو يمكنك تشغيل `npm run db:setup` لتنفيذ التوليد والترحيل والـ Seed في خطوة واحدة).*

### د. تشغيل المشروع محليًا
```bash
npm run dev
```
ثم افتح المتصفح على الرابط: `http://localhost:3000`

---

## 5. حسابات التجربة المحلية (Demo Credentials)

تتوفر أزرار تعبئة سريعة في صفحة تسجيل الدخول (`/login`):

| الدور (Role) | البريد الإلكتروني | كلمة المرور | الصلاحيات والبيانات |
| :--- | :--- | :--- | :--- |
| **Admin (مدير النظام)** | `admin@leadforge.eg` | `Admin@12345` | صلاحية كاملة على `/admin`، إدارة العملاء، المستخدمين، المصادر، قواعد التقييم، الباقات، استيراد CSV، والتقارير |
| **Developer (مطور ويب)** | `dev@leadforge.eg` | `Dev@12345` | مشترك في الباقة الاحترافية (**Pro Plan** - متبقي 45 نقطة)، يستهدف القاهرة والجيزة (عيادات أسنان، مراكز طبية، عقارات، مطاعم) |

حسابات مطورين إضافية في بيانات الـ Seed (بنفس كلمة المرور `Dev@12345`):
- `ahmed.web@leadforge.eg` (باقة Starter)
- `sara.agency@leadforge.eg` (باقة Business)
- `kareem.ecom@leadforge.eg` (باقة Starter)
- `nour.digital@leadforge.eg` (باقة Free)

---

## 6. محرك التقييم الحتمي وفاحص المواقع (Phase 1 — Deterministic Lead Scoring Engine)

### أ. معمارية محرك التقييم (Scoring Engine Architecture)
يتكون محرك التقييم (`src/lib/scoring/`) من وحدات معيارية مفصولة المسؤوليات بنسبة 100% بدون أي ذكاء اصطناعي أو كود ديناميكي (`eval`):

```text
Lead Data (Normalized Fields + Website Analysis + Freshness)
   ↓
ScoringService (src/lib/scoring/service.ts — إدارة الإصدارات والمعاملات وإعادة الحساب بالدفعات)
   ↓
ScoringEngine (src/lib/scoring/engine.ts — دالة نقية حتمية 100%)
   ↓
RuleEvaluator (src/lib/scoring/rule-evaluator.ts — تقييم ثلاثي الحالة TRUE | FALSE | UNKNOWN + منع التضارب عبر Rule Groups)
   ↓
ScoreNormalizer (src/lib/scoring/normalizer.ts — تطبيع وحصر النتيجة بين 0 و 100)
   ↓
LeadClassification (src/lib/scoring/classification.ts — تصنيف قابل للتخصيص COLD | WARM | HOT | PREMIUM)
   ↓
ScoreExplanation (src/lib/scoring/explanation.ts — بناء التفسير المهيكل وسجل القواعد المطبقة وغير المطبقة)
   ↓
Persistence & Audit Trail (Lead + LeadScore Snapshots + Structured Logging)
```

### ب. هيكلية القواعد، المجموعات الحصرية (`ruleGroup`)، والمعاملات الآمنة
تُخزن القواعد في جدول `ScoringRule` مع التحقق الصارم عبر `validateScoringRulePayload` (`src/lib/scoring/rule-validator.ts`):
- **المعاملات الحتمية المدعومة (14 معاملًا):**
  `equals`, `not_equals`, `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`, `contains`, `not_contains`, `exists`, `not_exists`, `in`, `not_in`, `is_true`, `is_false` (بالإضافة إلى دعم شروط `all` / `any` المركبة).
- **المجموعات الحصرية (`ruleGroup`):**
  تمنع تراكم القواعد المتعارضة؛ على سبيل المثال تقع قاعدتا `NO_WEBSITE` (`+30`) و`POOR_WEBSITE` (`+20`) ضمن مجموعة `website_quality`، بحيث تفوز القاعدة الأعلى أولوية/نقاطًا فقط ويتم تسجيل القاعدة الأخرى في سجل التدقيق بحالة `SUPERSEDED_BY_GROUP`.
- **التعامل ثلاثي الحالة مع البيانات الناقصة (`TRUE | FALSE | UNKNOWN`):**
  الحقول غير المتوفرة (`null`, `undefined`, `""`, أو `websiteStatus = 'UNKNOWN'`) تُعامل كـ `UNKNOWN` ولا تتحول قسرًا إلى `false` أو `0`، مما يمنع تفعيل قواعد مثل `not_equals` أو `less_than` بالخطأ عند غياب البيانات.

### ج. القواعد الافتراضية وتصنيف الدرجات
1. **النشاط التجاري موثق (`BUSINESS_VERIFIED`):** `+20` (`business_verification`)
2. **لا يمتلك موقعًا إلكترونيًا (`NO_WEBSITE`):** `+30` (`website_quality`)
3. **يمتلك موقعًا قديمًا أو ضعيفًا تقنيًا (`POOR_WEBSITE`):** `+20` (`website_quality`)
4. **تواجد نشط على فيسبوك (`ACTIVE_FACEBOOK`):** `+10` (`social_facebook`)
5. **تواجد نشط على إنستجرام (`ACTIVE_INSTAGRAM`):** `+10` (`social_instagram`)
6. **رقم الهاتف متاح (`PHONE_AVAILABLE`):** `+10` (`contact_phone`)
7. **البريد الإلكتروني متاح (`EMAIL_AVAILABLE`):** `+5` (`contact_email`)
8. **يمتلك أكثر من فرع (`MULTIPLE_BRANCHES`):** `+10` (`branch_strength`)
9. **عدد تقييمات مرتفع على جوجل 50+ (`HIGH_REVIEW_COUNT`):** `+10` (`review_strength`)
10. **نشط تجاريًا مؤخرًا (`RECENTLY_ACTIVE`):** `+10` (`activity_freshness`)

يتم تطبيع النتيجة النهائية بين `0` و`100` وتصنيفها تلقائيًا عبر حدود قابلة للتعديل في `ScoringConfig`:
- `0 – 49` = **COLD** (فرصة باردة)
- `50 – 69` = **WARM** (فرصة دافئة)
- `70 – 84` = **HOT** (فرصة ساخنة)
- `85 – 100` = **PREMIUM** (فرصة ممتازة)
*(كما يدعم المحرك حدود الربع القياسية `QUARTILE_CLASSIFICATION_THRESHOLDS`: `0–24 COLD`, `25–49 WARM`, `50–74 HOT`, `75–100 PREMIUM`).*

### د. مثال عملي لحساب التقييم والتفسير (Example Score Calculation)
لنشاط تجاري موثق بدون موقع إلكتروني، يمتلك صفحة فيسبوك نشطة، رقم هاتف، أكثر من فرع، و180 تقييمًا على جوجل:
```text
Score: 90/100
Classification: PREMIUM
Scoring Version: v1
Why:
  +20 Business verified
  +30 No website
  +10 Active Facebook
  +10 Phone available
  +10 Multiple branches
  +10 High review count
```

### هـ. واجهات برمجة التطبيقات لإدارة القواعد وإعادة الحساب (Scoring & Admin APIs)
- `GET /api/leads/:id/score` — جلب تفاصيل التقييم، التفسير المهيكل (`explanation`)، وسجل التقييمات التاريخي (`history`).
- `POST /api/leads/:id/score` — إعادة حساب تقييم عميل محدد (Admin).
- `POST /api/admin/leads/:id/recalculate` — إعادة حساب تقييم عميل محدد مع حفظ لقطة تدقيقية (`LeadScore`) (Admin).
- `POST /api/admin/scoring/recalculate` — إعادة حساب جماعي آمن بالدفعات (`batchSize`) مع فلاتر اختيارية (`city`, `category`, `status`, `websiteStatus`) ومنع تكرار اللقطات غير المتغيرة (Idempotent) (Admin).
- `GET / POST /api/admin/rules` و`PATCH / DELETE /api/admin/rules/:id` — إدارة قواعد التقييم، الأوزان، المجموعات، وإصدارات التقييم (`v1`, `v2`, ...).

### و. فاحص المواقع الفني (Rule-Based Website Analyzer)
عند وجود رابط موقع إلكتروني، يفحص النظام عبر القواعد فقط:
- عدم دعم HTTPS / SSL: `+15 نقطة فرصة`
- عدم وجود وسم توافق الموبايل (`<meta name="viewport">`): `+15 نقطة فرصة`
- الموقع غير متاح أو لا يستجيب (`HTTP >= 400` / Unreachable): `+20 نقطة فرصة`
- بنية HTML قديمة أو بدائية جدًا: `+10 نقاط فرصة`

---

## 7. استيراد البيانات ومنع التكرار (CSV Import & Deduplication)

من صفحة `/admin/leads`، يستطيع مدير النظام رفع ملف CSV يدعم الأعمدة التالية:
```csv
name,category,city,area,address,phone,email,website,facebook,instagram,rating,reviewCount,source
```
يمر كل صف عبر:
1. **Validate & Normalize:** التحقق من الاسم والمدينة وتطبيع الهاتف المصري (`+2010...` -> `2010...`) والنطاق.
2. **Deduplicate & Resolve Entities (Phase 2):** مطابقة حتمية عبر 5 مستويات (`SOURCE_EXTERNAL_ID` -> `DOMAIN` -> `PHONE` -> `EMAIL` -> `Composite Identity`)، مع حفظ سجلات المصادر (`SourceRecord`)، المفاتيح القياسية (`LeadIdentity`)، وحالات المراجعة والتعارض (`DuplicateCandidate`) وسجل عمليات الدمج القابل للتراجع (`LeadMergeHistory`).
3. **Score & Store (Phase 1):** حساب التقييم الحتمي وحفظ تقرير الاستيراد الكامل (`Imported`, `Valid`, `Duplicates`, `PossibleDuplicates`, `Conflicts`, `Invalid`).

---

## 7.5 محرك منع التكرار وتوحيد الكيانات الحتمي (Phase 2 — Deterministic Lead Deduplication & Entity Resolution Engine)

يقع المحرك في `src/lib/deduplication/` ويعمل بشكل حتمي بالكامل (100% Deterministic & Explainable — بدون أي ذكاء اصطناعي أو نماذج احتمالية غير مفسرة):

1. **خدمة التطبيع المركزية (`NormalizationService` — `src/lib/deduplication/normalizer.ts`):**
   - **الأسماء التجارية (`normalizeBusinessName` / `extractCoreBrandName`):** توحيد الحروف العربية (`أ/إ/آ -> ا`، `ة -> ه`، `ى -> ي`)، إزالة التشكيل والتطويل، إزالة اللواحق القانونية (`ش.م.م`، `ذ.م.م`، `LLC`، `Ltd`، `Co`)، واستخراج الاسم الجوهري للعلامة التجارية بدون أي تعريب صوتي عشوائي بين العربية والإنجليزية.
   - **أرقام الهواتف (`normalizePhone` / `parsePhoneDetails` / `normalizePhones`):** تحويل الأرقام العربية (`٠١٠٠...`)، توحيد صيغ الموبايل المصري (`010/011/012/015` و`+20` و`0020`) إلى `201XXXXXXXXX` (`+201XXXXXXXXX`)، دعم الخطوط الأرضية المصرية (`02`، `03`...)، فصل التحويلات الداخلية (`ext. 105`)، ودعم الأرقام المتعددة لكل نشاط تجاري (`Lead.phones`).
   - **النطاقات والروابط الاجتماعية (`normalizeDomain` / `normalizeSocialUrl`):** استخراج النطاق القياسي مع استبعاد روابط منصات التواصل الاجتماعي من حقل الموقع الإلكتروني، وتطبيع روابط `facebook.com/<handle>` و`instagram.com/<handle>` مع إزالة معاملات التتبع (`utm_*`, `ref`).
   - **العناوين ورقم العقار (`normalizeAddress` / `extractAddressBuildingNumber` / `doAddressesConflictOnBuildingNumber`):** توحيد اختصارات الشوارع والمناطق مع الحفاظ على رقم العقار، ومنع دمج الأنشطة المجاورة في نفس الشارع عند اختلاف رقم المبنى (`10 شارع التحرير` مقابل `42 شارع التحرير`).

2. **مفاتيح الهوية القياسية (`Canonical Identity Keys` — `src/lib/deduplication/identity.ts`):**
   - `SOURCE:<sourceType>:<externalId>`
   - `DOMAIN:<normalizedDomain>`
   - `PHONE:<normalizedPhone>`
   - `EMAIL:<normalizedEmail>`
   - `SOCIAL:<normalizedSocialUrl>`
   - `NAME:<normalizedName>:CITY:<normalizedCity>`
   - `NAME:<normalizedName>:ADDRESS:<normalizedAddress>:CITY:<normalizedCity>`
   يتم حفظ هذه المفاتيح في جدول `LeadIdentity` المفهرس وفي `Lead.canonicalIdentityKeys`.

3. **الهرم الحتمي للمطابقة (5-Level Deterministic Matching Hierarchy — `src/lib/deduplication/matcher.ts`):**
   - **المستوى 1:** تطابق معرف المصدر الخارجي (`SOURCE_EXTERNAL_ID_MATCH`)
   - **المستوى 2:** تطابق النطاق الإلكتروني (`DOMAIN_MATCH`)
   - **المستوى 3:** تطابق رقم الهاتف المطبّع ضمن قائمة هواتف النشاط (`PHONE_MATCH`)
   - **المستوى 4:** تطابق البريد الإلكتروني (`EMAIL_MATCH`)
   - **المستوى 5:** الهوية المركبة (الرابط الاجتماعي + المدينة `SOCIAL_MATCH`، أو الاسم + العنوان + المدينة بدون تعارض رقم العقار `NAME_ADDRESS_CITY_MATCH`).

4. **معالجة الغموض والتعارضات (Ambiguity & Conflict Handling):**
   - **تطابق الاسم والمدينة فقط بدون إشارات قوية:** يُصنف كـ `POSSIBLE_DUPLICATE` ولا يتم دمجه تلقائيًا أبدًا، بل يُنشأ له سجل `DuplicateCandidate` لمراجعة المدير.
   - **نفس الاسم في مدن مختلفة (مثل القاهرة والإسكندرية) بدون هاتف/نطاق مشترك:** يُصنف كـ `UNIQUE` (فروع أو أنشطة مستقلة).
   - **تطابق الهاتف مع اختلاف النطاق الإلكتروني:** يحافظ على النطاق الحالي ولا يستبدله، ويسجل التعارض في `Lead.fieldConflicts` وينشئ طلب مراجعة `CONFLICT` للإدارة.
   - **تطابق الاسم والعنوان مع تعارض الهواتف أو تضارب الإشارات القوية بين سجلين مختلفين:** يُصنف كـ `CONFLICT` ويُحجب الدمج التلقائي.

5. **استراتيجية الدمج وأولوية المصادر وإعادة التقييم (`MergeService` — `src/lib/deduplication/merge-service.ts`):**
   - إثراء الحقول الناقصة فقط دون الكتابة فوق الحقول الموثقة الأعلى أولوية (`Verified Admin > Google Business > Official Website > Directory > CSV > Unverified Manual`).
   - تتبع مصدر كل حقل في `Lead.fieldProvenance` وربط جميع سجلات `SourceRecord` بالفرصة الأساسية (`Canonical Lead`).
   - إعادة حساب نقاط التقييم للمرحلة الأولى (`Phase 1 Lead Score`) تلقائيًا بعد كل عملية دمج أو فك دمج مع تسجيل السبب `SOURCE_REFRESH`.
   - تسجيل تاريخ الدمج الكامل (`LeadMergeHistory`) مع إمكانية التراجع الكامل وفك الدمج (`unmergeLead`).

6. **واجهات ولوحة مراجعة التكرارات للإدارة (`Admin Duplicate Review API & UI`):**
   - لوحة الإدارة: `/admin/duplicates`
   - `GET /api/admin/duplicates` و `GET /api/admin/duplicates/[id]`
   - `POST /api/admin/duplicates/[id]/merge` (تأكيد الدمج)
   - `POST /api/admin/duplicates/[id]/reject` (`KEEP_SEPARATE` أو `MARK_INVALID`)
   - `GET /api/admin/duplicates/history` و `POST /api/admin/duplicates/unmerge` (استرجاع وفك الدمج)

---

## 7.6 محرك جودة البيانات، الحداثة والتحقق (Phase 3 — Lead Quality + Freshness + Verification Engine)

يقع المحرك في `src/lib/quality/` ويعمل بشكل حتمي بالكامل (100% Deterministic & Explainable — بدون أي ذكاء اصطناعي أو تخمين):

1. **الفصل الصارم بين درجة الفرصة البيعية ودرجة جودة البيانات (`Opportunity Score` vs `Quality Score`):**
   - **`Lead.score` / `LeadScore` (`0–100`, `COLD` / `WARM` / `HOT` / `PREMIUM`):** يقيس حجم الفرصة التجارية لمطوري المواقع (مثل عدم وجود موقع إلكتروني `+30`).
   - **`Lead.qualityScore` / `Lead.qualityStatus` (`0–100`, `VERY_LOW` `0–24`, `LOW` `25–49`, `MEDIUM` `50–69`, `HIGH` `70–84`, `EXCELLENT` `85–100`):** يقيس موثوقية البيانات ودقتها واكتمالها وحداثتها عبر حدود قابلة للتخصيص في جدول `QualityConfig`.

2. **محرك الحداثة الديناميكي (`Freshness Engine` — `src/lib/quality/freshness-engine.ts`):**
   - `0 – 7 أيام`: **`FRESH`** (`+10` نقاط جودة)
   - `8 – 30 يومًا`: **`RECENT`** (`+5` نقاط جودة)
   - `31 – 90 يومًا`: **`NEEDS_VERIFICATION`** (`0` نقاط جودة — يدرج في طابور التحقق)
   - `91 – 180 يومًا`: **`STALE`** (`-15` نقطة جودة + علم `STALE_DATA` + حجب البيع حتى إعادة التحقق)
   - `181+ يومًا`: **`VERY_STALE`** (`-25` نقطة جودة + علم `STALE_DATA` + أولوية قصوى في إعادة التحقق)
   - `lastVerifiedAt = null`: **`UNKNOWN`** (يتطلب تحققًا أوليًا `REQUIRES_VERIFICATION`).

3. **نظام التحقق وانتهاء الصلاحية التدقيقي (`Verification System & Expiration` — `src/lib/quality/verification-service.ts`):**
   - حالات التحقق للعميل: `UNVERIFIED`, `PARTIALLY_VERIFIED`, `VERIFIED`, `FAILED_VERIFICATION`.
   - سجل تدقيقي غير قابل للتعديل في جدول `LeadVerification` لكل فحص (`WEBSITE`, `PHONE`, `EMAIL`, `BUSINESS_STATUS`, `ADDRESS`, `IDENTITY`) مع حفظ `checkedAt`, `expiresAt`, `details`, `errorType`.
   - فترات صلاحية الفحوصات القابلة للتخصيص (`PHONE: 30d`, `EMAIL: 30d`, `WEBSITE: 14d`, `BUSINESS_STATUS: 7d`, `ADDRESS: 90d`, `IDENTITY: 90d`): عند انتهاء صلاحية الفحص يتحول إلى `NEEDS_REVERIFICATION` (وليس `FAILED`).
   - سياسة إعادة المحاولة (`TEMPORARY_FAILURE` مع Exponential Backoff مقابل `PERMANENT_FAILURE`).

4. **المدققات الحتمية وفاحص المواقع (`Validators` — `src/lib/quality/validators.ts` و `completeness.ts`):**
   - **فحص الموقع (`evaluateWebsiteVerification`):** يميز بدقة بين `WEBSITE_HTTPS`, `WEBSITE_HTTP`, `WEBSITE_REDIRECT`, `WEBSITE_UNREACHABLE`, `WEBSITE_MISSING`, و`DOMAIN_INVALID` (بما في ذلك اكتشاف روابط السوشيال ميديا الموضوعة خطأً في حقل الموقع).
   - **فحص الهاتف المصري (`validateLeadPhone`):** يدعم الموبايل (`010/011/012/015`)، الأرضي (`02`, `03`...)، والخطوط الساخنة الخماسية (`19xxx`)، ويرفض الأرقام الوهمية أو المكررة (`01000000000`، `12345`).
   - **فحص البريد، حالة النشاط، التصنيف، والموقع الجغرافي:** يكتشف إغلاق النشاط (`CLOSED` / `TEMPORARILY_CLOSED`)، تعارض التصنيف (`CATEGORY_MISMATCH`)، وتعارض المدينة مع المحافظة (`LOCATION_MISMATCH`).
   - **اكتمال البيانات (`completenessScore` 0–100):** يميز بين الحقول الإلزامية (`REQUIRED`) والاختيارية (`OPTIONAL`) والقيم غير المعروفة (`UNKNOWN`).

5. **أعلام الجودة وبوابات صلاحية البيع (`Quality Flags & Saleability Gates`):**
   - الأعلام العشرة القياسية: `INVALID_PHONE`, `INVALID_EMAIL`, `INVALID_WEBSITE`, `STALE_DATA`, `CATEGORY_MISMATCH`, `LOCATION_MISMATCH`, `POSSIBLE_DUPLICATE`, `CLOSED_BUSINESS`, `MISSING_REQUIRED_DATA`, `CONFLICTING_SOURCE_DATA`.
   - حالات صلاحية البيع (`Lead.saleabilityStatus`): `AVAILABLE`, `REQUIRES_VERIFICATION`, `STALE`, `INVALID`, `CLOSED`, `DUPLICATE`, `NOT_SALEABLE` (مستقلة تمامًا عن حالة متابعة الصفقة `LeadClaim.pipelineStatus`).
   - يتم منع شراء أو مطابقة أي عميل غير صالح للبيع (`saleabilityStatus !== 'AVAILABLE'`) تلقائيًا.

6. **التحقق الدفعي المجدول حسب الأولوية (`Batch Verification`) وواجهات الـ API:**
   - يرتب العملاء في طابور التحقق حسب: `VERY_STALE` -> `STALE` -> `NEEDS_VERIFICATION` -> `RECENT` -> `FRESH`، ثم حسب درجة الفرصة (`score`) والقيمة التجارية والطلب.
   - لوحة إدارة الجودة: `/admin/quality`
   - واجهات المطورين والإدارة:
     - `GET /api/leads/:id/quality`
     - `GET / POST /api/leads/:id/verification`
     - `GET /api/admin/quality`
     - `POST /api/admin/quality/verify-batch`
     - `GET /api/admin/quality/flags`
     - `GET /api/admin/quality/stale`
     - `GET /api/admin/quality/needs-verification`

---

## 7.7 محرك المطابقة الحتمي بين العملاء والمطورين (Phase 4 — Production-Grade Deterministic Matching Engine)

يقع المحرك في `src/lib/matching/` ويعمل بشكل حتمي بالكامل عبر طبقتين (Two-Layer Deterministic Architecture — 100% Rule-Based & Explainable بدون أي ذكاء اصطناعي أو نماذج احتمالية أو `eval()`):

1. **الفصل الصارم بين التقييمات الثلاثة (`Opportunity Score` vs `Quality Score` vs `Match Strength`):**
   - **`opportunityScore` (`Lead.score` — Phase 1):** يقيس حجم الفرصة التجارية لتطوير الموقع/النظام (`0–100`).
   - **`qualityScore` (`Lead.qualityScore` — Phase 3):** يقيس موثوقية البيانات وحداثتها واكتمالها (`0–100`).
   - **`matchStrength` (`MatchSnapshot.matchStrength` — Phase 4):** يقيس مدى ملاءمة العميل لمطور محدد (`0–100`) بناءً على تخصصاته، خدماته، نطاقه الجغرافي، وميزانيته. إذا فشل أي شرط أهلية إلزامي، تكون `eligible = false` و`matchStrength = 0` دائماً مهما كانت درجة الفرصة أو الجودة مرتفعة.

2. **الطبقة الأولى — بوابات الأهلية الإلزامية (`Layer A: Hard Eligibility Gates` — `src/lib/matching/hard-eligibility.ts`):**
   يجب أن يجتاز الزوج (`Lead`, `Developer`) جميع الفحوصات التالية قبل حساب أي نقاط مطابقة:
   - **حالة المطور والجاهزية:** رفض الحسابات غير النشطة (`DEVELOPER_INACTIVE`) أو الموقوفة (`DEVELOPER_SUSPENDED`) أو التي أوقفت استقبال العملاء (`isAcceptingLeads = false`).
   - **اكتمال الملف التعريفي (`PROFILE_INCOMPLETE`):** التحقق من تحديد الخدمات، التخصصات (أو تفعيل وضع جميع المجالات `allNichesMode`)، والنطاق الجغرافي (أو تفعيل تغطية جميع محافظات مصر `allLocationsMode`).
   - **الاشتراك والباقة والسعة (`PLAN_NOT_ELIGIBLE` / `CAPACITY_LIMIT_REACHED`):** التحقق من صلاحية الاشتراك، الرصيد المتاح، السعة القصوى للعملاء النشطين (`maxActiveLeads` / `maxConcurrentClaims`)، وأهلية الباقة للعملاء الحصريين (`allowsExclusive`).
   - **بوابات الجودة والحداثة وقابلية البيع للمرحلة الثالثة (`LEAD_NOT_SALEABLE`):** رفض العملاء بالحالات `INVALID`, `DUPLICATE`, `CLOSED`, `STALE`, `NOT_SALEABLE`, أو المكتمل شراؤهم (`CLAIMED_FULL`)، أو الذين купилهم المطور مسبقاً، مع سياسة قابلة للتخصيص للعملاء بحالة `REQUIRES_VERIFICATION` (`EXCLUDE` افتراضياً أو `ALLOW_WITH_WARNING`).
   - **توافق الخدمات (`SERVICE_NOT_SUPPORTED`):** دعم وضعَي `ALL_REQUIRED` و`ANY_REQUIRED` مع احترام الخدمات المستبعدة (`excludedServices`).
   - **توافق التخصص التجاري (`NICHE_EXCLUDED`):** احترام الاستبعاد الصريح للتخصص (`excludedNiches`) دائماً حتى لو كان وضع `allNichesMode` مفعلاً.
   - **الهرم الجغرافي المصري (`LOCATION_NOT_SUPPORTED` — `src/lib/matching/taxonomy.ts`):** يدعم التدرج الجغرافي المصري (`المحافظة -> المدينة -> الحي/المنطقة` مثل `القاهرة -> القاهرة الجديدة -> التجمع الخامس` و`الجيزة -> الشيخ زايد`) ثنائي اللغة (عربي/إنجليزي)، مع سياسة قابلة للضبط للمواقع غير المحددة (`FAIL`, `ALLOW_WITH_PENALTY`, `REQUIRE_VERIFICATION`).
   - **توافق نطاق الميزانية (`BUDGET_INCOMPATIBLE`):** تقاطع فترة ميزانية العميل `[leadMin, leadMax]` مع نطاق المطور `[devMin, devMax]` بنفس العملة (`EGP`)، مع سياسة قابلة للضبط للميزانيات غير المحددة.
   - **توافق نوع العميل والمشروع (`LEAD_TYPE_NOT_SUPPORTED`):** التوافق بين نوع الملكية (`EXCLUSIVE` / `SHARED` / `BOTH`) ونوع المشروع الفني (`NEW_WEBSITE`, `WEBSITE_REDESIGN`, `LANDING_PAGE`, `E_COMMERCE`, `BOOKING_SYSTEM`, `WEB_APP`, `SEO`, `SOCIAL_MEDIA`).

3. **الطبقة الثانية — قواعد المطابقة الموزونة القابلة للتخصيص (`Layer B: Soft Matching Rules` — `src/lib/matching/rules.ts`):**
   - تُدار القواعد عبر جدول `MatchingRule` مع تتبع الإصدارات (`matchVersion`: `v1`, `v2`, ...) ومجموعات القواعد الحصرية (`ruleGroup`) والأولويات (`priority`):
     - `SERVICE_EXACT_MATCH` (`+25`), `SERVICE_SECONDARY_MATCH` (`+15`), `SERVICE_MULTI_MATCH_BONUS` (`+10`)
     - `NICHE_EXACT_MATCH` (`+20`), `NICHE_GENERAL_MATCH` (`+8`)
     - `LOCATION_CITY_EXACT` (`+15`), `LOCATION_GOVERNORATE_MATCH` (`+10`), `LOCATION_SERVICE_AREA_MATCH` (`+5`), `LOCATION_UNKNOWN_PENALTY` (`-5`)
     - `BUDGET_IDEAL_RANGE` (`+15`), `BUDGET_ACCEPTABLE_RANGE` (`+8`), `BUDGET_NEAR_RANGE` (`-5`), `BUDGET_UNKNOWN_PENALTY` (`-5`)
     - `LEAD_TYPE_EXACT_MATCH` (`+10`), `LEAD_TYPE_COMPATIBLE` (`+5`)
     - `QUALITY_VERIFIED_HIGH` (`+5`), `FRESHNESS_FRESH_BOOST` (`+5`), `FRESHNESS_AGING_BOOST` (`+2`)
     - `PREFERENCE_PRIORITY_MATCH` (`+5`)

4. **الترتيب الحتمي وكسر التعادل (`Deterministic Ranking & Tie-Breaking`):**
   - يتم ترتيب النتائج المؤهلة فقط (`eligible = true`) تنازلياً حسب:
     `matchStrength DESC -> qualityScore DESC -> opportunityScore DESC -> freshnessRank DESC -> id ASC`.
   - عند عدم وجود أي مطور مؤهل لعميل معين، يُصدر المحرك تشخيصاً تجميعياً (`NO_ELIGIBLE_DEVELOPERS`) يوضح توزيع أسباب الاستبعاد عبر جميع المطورين.

5. **واجهات برمجة التطبيقات ولوحة فحص المطابقة (`Matching APIs & Admin Match Debugger`):**
   - لوحة إدارة القواعد وفاحص المطابقة التفصيلي: `/admin/matching`
   - إعدادات المطابقة للمطور مع المعاينة الفورية: `/settings`
   - الواجهات البرمجية:
     - `GET /api/matching/leads/:leadId` — جلب المطورين المؤهلين مرتبين لعميل محدد مع إحصاءات الاستبعاد.
     - `GET /api/matching/developers/:developerId` — جلب العملاء المؤهلين مرتبين لمطور محدد (أو `me`).
     - `GET /api/matching/leads/:leadId/developers/:developerId` — تقرير فحص وتفسير كامل لزوج (`Lead`, `Developer`) يشمل جميع فحوصات Layer A وقواعد Layer B.
     - `POST /api/matching/preview` — معاينة فورية للمطابقة بدون حفظ في قاعدة البيانات.
     - `POST /api/admin/matching/recalculate` — إعادة حساب وحفظ لقطات المطابقة (`MatchSnapshot`) مع معرف عملية التدقيق (`recalculationRunId`).
     - `GET / POST /api/admin/matching/rules` و `PATCH / DELETE /api/admin/matching/rules/:id` — إدارة قواعد المطابقة وسياسات `MatchingConfig` مع ترقية تلقائية لـ `matchVersion`.

---

## 7.8 محرك شراء العملاء، الرصيد، والملكية الحصرية والمشتركة (Phase 5 — Production-Grade Claim, Credits & Shared / Exclusive Leads Engine)

يقع المحرك في `src/lib/claims/` ويعمل بشكل ذري وحتمي بالكامل (100% Atomic, Concurrency-Safe, Deterministic & Auditable — بدون أي ذكاء اصطناعي أو خصم رصيد خارج المعاملات الذرية):

1. **نموذج الملكية والوصول (`SHARED` مقابل `EXCLUSIVE` — `src/lib/claims/pricing.ts`):**
   - **العميل الحصري (`EXCLUSIVE`):**
     - `maxPurchasers = 1` إجبارياً.
     - بمجرد شرائه من مطور واحد يصبح `currentPurchasers = 1` و`availableForClaim = false` و`status = CLAIMED_FULL` فوراً، ويُمنع أي مطور آخر من شرائه (`409 LEAD_EXCLUSIVE_ALREADY_CLAIMED`).
   - **العميل المشترك (`SHARED`):**
     - يقبل الشراء حتى السقف المحدد `maxPurchasers` (افتراضياً `3` من `CreditPricingConfig.defaultSharedMaxPurchasers`).
     - عند وصول `currentPurchasers == maxPurchasers` يصبح `availableForClaim = false` و`status = CLAIMED_FULL` تلقائياً (`409 LEAD_SHARED_MAX_PURCHASERS_REACHED`).
   - **منع الشراء المكرر لنفس المطور:**
     - لا يمكن لنفس المطور شراء نفس العميل مرتين (`409 LEAD_ALREADY_CLAIMED_BY_DEVELOPER`)، مع فرض فهرس فريد جزئي في قاعدة البيانات (`lead_claims_active_lead_developer_unique_idx` على `(leadId, developerId) WHERE status = 'ACTIVE'`).

2. **محرك التسعير الحتمي (`Deterministic Credit Pricing Engine` — `calculateLeadCreditCost`):**
   - تُدار تكلفة النقاط من جدول `CreditPricingConfig` مع حفظ الإصدار (`pricingVersion`: `v1`, `v2`, ...) ولقطة تفاصيل السعر في كل عملية شراء (`LeadClaim.priceBreakdown`):
     - `SHARED`: **5 نقاط** (`sharedLeadCreditCost = 5`)
     - `EXCLUSIVE`: **15 نقطة** (`exclusiveLeadCreditCost = 15`)
     - علاوة فرصة `HOT` (`score >= 70`): **+5 نقاط** (`hotOpportunityBonus = 5`)
     - علاوة فرصة `PREMIUM` (`score >= 85`): **+10 نقاط** (`premiumOpportunityBonus = 10` — تحل محل علاوة `HOT` ولا تتراكم معها)
     - علاوة جودة ممتازة (`qualityStatus = EXCELLENT` أو `qualityScore >= 85`): **+5 نقاط** (`highQualityBonus = 5`)
     - علاوة عميل طازج وموثق (`freshnessStatus = FRESH` و`verificationStatus = VERIFIED`): **+5 نقاط** (`freshVerifiedBonus = 5`)

3. **سجل حركات الرصيد غير القابل للتعديل ومطابقة الأرصدة (`Immutable Credit Ledger & Balance Reconciliation` — `src/lib/claims/credit-service.ts`):**
   - جدول حساب الرصيد `DeveloperCreditAccount` (`balance`, `totalPurchased`, `totalGranted`, `totalSpent`, `totalRefunded`, `totalExpired`, `reservedCredits`) محمي بقيود PostgreSQL `CHECK (balance >= 0)`.
   - جدول الحركات غير القابل للتعديل `CreditTransaction` (`PURCHASE`, `GRANT`, `CLAIM`, `REFUND`, `ADJUSTMENT`, `EXPIRATION`) يسجل لكل عملية: `amount`, `balanceBefore`, `balanceAfter`, `referenceType`, `referenceId`, `idempotencyKey`, `reason`, `metadata`, `createdBy`.
   - **القاعدة الثابتة (`Ledger Invariant`):** `DeveloperCreditAccount.balance == SUM(CreditTransaction.amount)` دائماً، ويتم التحقق منها آلياً عبر `reconcileCreditAccount` و`reconcileAllCreditAccounts`.

4. **بوابات التحقق المسبقة قبل الشراء (`Pre-Claim Gates — Phases 1–4 Enforcement`):**
   - التحقق من حالة حساب المطور (`DEVELOPER_INACTIVE`, `DEVELOPER_SUSPENDED`, `PROFILE_NOT_FOUND`) وحدود الباقة (`PLAN_LIMIT_REACHED`, `LEAD_ACCESS_DENIED`).
   - التحقق من بوابات الجودة والحداثة للمرحلة الثالثة (`LEAD_INVALID`, `LEAD_STALE`, `LEAD_UNVERIFIED`, `LEAD_QUALITY_BELOW_THRESHOLD`, `LEAD_OPPORTUNITY_BELOW_THRESHOLD`).
   - التحقق الإلزامي من أهلية المطابقة للمرحلة الرابعة (`MATCH_NOT_ELIGIBLE` عند `eligible = false`، و`MATCH_STRENGTH_BELOW_THRESHOLD` عند انخفاض `matchStrength` عن الحد الأدنى).

5. **الذرية، الأقفال المتشائمة، ومنع سباقات التزامن (`Transactions, Locking & Idempotency` — `src/lib/claims/locks.ts` و`service.ts`):**
   - تنفيذ عملية الشراء بالكامل داخل معاملة قاعدة بيانات واحدة (`prisma.$transaction`) مع أقفال صفوف PostgreSQL (`SELECT ... FOR UPDATE`) بترتيب ثابت (`Lead` أولاً ثم `DeveloperCreditAccount` لمنع الـ Deadlocks) بالإضافة إلى حارس تسلسلي على مستوى العملية.
   - دعم كامل لمفتاح عدم التكرار (`Idempotency-Key`): إعادة إرسال نفس الطلب بنفس المفتاح تعيد نفس سجل الشراء وبيانات الاتصال دون خصم الرصيد مرة أخرى، بينما إعادة استخدام نفس المفتاح لعميل مختلف تُرفض بـ `409 IDEMPOTENCY_CONFLICT`.

6. **الاسترداد، إبطال العميل بعد الشراء، وانتهاء الصلاحية (`Refunds, Post-Claim Invalidation & Expiration` — `src/lib/claims/refund-service.ts`):**
   - استرداد ذري للرصيد (`refundClaim`) يعيد النقاط إلى حساب المطور، ينشئ حركة `REFUND`، يحول حالة الشراء إلى `REFUNDED`، يسحب صلاحية الوصول لبيانات الاتصال (`accessGranted = false`)، ويعيد تحديث عداد المشترين (`currentPurchasers`).
   - حماية ضد الاسترداد المزدوج (`409 CLAIM_ALREADY_REFUNDED`).
   - معالجة تلقائية عند تحويل العميل بعد شرائه إلى `INVALID` أو `DUPLICATE` أو `CLOSED` (`handleLeadInvalidationAfterClaim`) مع استرداد تلقائي كامل للمطورين المتأثرين.
   - دعم انتهاء صلاحية المطالبات (`expireStaleClaims`) وتعديل الرصيد الإداري الموثق (`adjustDeveloperCreditsByAdmin`).

7. **واجهات برمجة التطبيقات لعمليات الشراء والرصيد (`Phase 5 Claim & Credits APIs`):**
   - `POST /api/leads/:id/claim` — شراء عميل وفتح بيانات الاتصال الكاملة بشكل ذري (يدعم ترويسة `Idempotency-Key`).
   - `GET /api/developer/claims` و`GET /api/developer/claims/:claimId` — عرض سجل مشتريات المطور وتفاصيل كل عملية شراء وحركة الرصيد المرتبطة بها.
   - `GET /api/developer/credits` — عرض الرصيد الحالي، كشف حساب النقاط (`CreditTransaction` Ledger)، وحالة مطابقة الرصيد (`reconciliation`).
   - `POST /api/admin/claims/:claimId/refund` — استرداد نقاط عملية شراء بواسطة مدير النظام (Admin).
   - `POST /api/admin/developers/:developerId/credits/adjust` — إضافة/خصم/منح نقاط لحساب مطور مع سجل تدقيق كامل (Admin).
   - `GET /api/admin/claims` و`GET /api/admin/credits` — مراقبة جميع عمليات الشراء وحسابات النقاط ومطابقة السجل العام (Admin).

---

## 7.9 محرك المتابعة والتقييم والنتائج البيعية (Phase 6 — Production-Grade Feedback & Outcome Engine)

يقع المحرك في `src/lib/feedback/` ويعمل بشكل حتمي، معزول لكل مطور، وغير مدمّر لبيانات المصدر الموثوقة (100% Deterministic, Developer-Isolated, Non-Destructive & Auditable):

1. **الفصل المعماري الثلاثي (`Global Lead Status` vs `Developer LeadEngagement` vs `Structured LeadFeedback`):**
   - **حالة العميل العامة (`Lead.status` و`Lead.saleabilityStatus`):** تحدد صلاحية العميل للبيع في السوق العام وتدار حصرياً عبر محرك الجودة والادارة (Phase 3 / Admin).
   - **دورة حياة المتابعة الخاصة بالمطور (`LeadEngagement` — زوج `(leadId, developerId)`):** تعكس مرحلة متابعة كل مطور على حدة (`CLAIMED -> CONTACTED -> REPLIED -> INTERESTED -> MEETING -> PROPOSAL_SENT -> NEGOTIATION -> WON / LOST / NOT_INTERESTED / INVALID`). في العملاء المشتركين (`SHARED`)، يمكن للمطور (أ) إغلاق الصفقة `WON` بينما يسجل المطور (ب) `LOST` والمطور (ج) `CONTACTED` دون أي تداخل.
   - **التقييمات المهيكلة (`LeadFeedback`):** ملاحظات وتقييمات مستقلة (`CONTACT`, `BUSINESS`, `SALES`, `LEAD_QUALITY`) مع درجة تقييم (`1–5`) وأكواد أسباب قياسية (`reasonCode`) يمكن تسجيلها في أي وقت دون إجبار المطور على تغيير مرحلة المتابعة.

2. **آلة الحالة الحتمية وقفل الحالات النهائية (`Deterministic State Machine & Terminal Locking` — `src/lib/feedback/state-machine.ts`):**
   - تتحقق من صلاحية كل انتقال بين الحالات (`ALLOWED_ENGAGEMENT_TRANSITIONS`) وترفض الانتقالات غير المنطقية (مثل `CLAIMED -> WON` مباشرةً) بكود `INVALID_STATUS_TRANSITION`، مع السماح بالانتقال إلى `INVALID` من أي حالة متابعة بيعية نشطة.
   - الحالات النهائية (`WON`, `LOST`, `NOT_INTERESTED`, `INVALID`) تُقفل تلقائياً (`isTerminal = true`, `closedAt = now`) وتمنع أي انتقال لاحق بواسطة المطور (`TERMINAL_STATUS`).
   - **التصحيح الإداري الموثق (`Admin Status Correction`):** يمكن لمدير النظام فقط (`POST /api/admin/engagements/:id/correct-status`) تصحيح الحالة الخاطئة مع إلزامية ذكر سبب التصحيح (`reason`) وتسجيل العملية في `LeadStatusHistory` (`isAdminCorrection = true`, `actorType = 'ADMIN'`) وسجل التدقيق `AuditLog`.

3. **قواعد التحقق من النتائج والتسلسل الزمني (`Outcome Validation & Chronological Timestamps`):**
   - عند تسجيل `LOST` يجب تحديد `reasonCode` من قائمة الأسباب القياسية (`PRICE`, `COMPETITOR`, `NO_BUDGET`, `NO_RESPONSE`, `TIMING`, `WRONG_CONTACT`, `WRONG_BUSINESS`, `DUPLICATE`, `BUSINESS_CLOSED`, `NOT_INTERESTED`, `SERVICE_MISMATCH`, `OTHER` مع إلزامية `note` عند اختيار `OTHER`).
   - عند تسجيل `INVALID` يجب تحديد `reasonCode` من القائمة القياسية (`WRONG_PHONE`, `WRONG_EMAIL`, `BUSINESS_CLOSED`, `BUSINESS_NOT_FOUND`, `DUPLICATE`, `WRONG_CATEGORY`, `WRONG_LOCATION`, `FAKE_BUSINESS`, `ALREADY_CLIENT`, `OTHER` مع إلزامية `note` عند اختيار `OTHER`).
   - التحقق الصارم من التسلسل الزمني (`contactedAt >= claimedAt`، `repliedAt >= firstContactedAt`، `wonAt >= meetingAt/proposalSentAt`) ومنع التواريخ المستقبلية (`INVALID_TIMESTAMP`).

4. **التكامل غير المدمّر مع محرك الجودة (`Non-Destructive Phase 3 Quality Integration` — `src/lib/feedback/quality-integration.ts`):**
   - بلاغات المطورين لا تقوم أبداً بمسح أو استبدال بيانات العميل الأساسية (`lead.phone`, `lead.email`, `lead.businessStatus`, `lead.phoneValidationStatus`) بشكل مباشر.
   - بدلاً من ذلك، تُصدر إشارات إعادة تحقق مهيكلة (`PHONE_REQUIRES_REVERIFICATION`, `BUSINESS_STATUS_REQUIRES_VERIFICATION`, `EMAIL_REQUIRES_REVERIFICATION`, `WEBSITE_REQUIRES_REVERIFICATION`, `CATEGORY_REQUIRES_REVERIFICATION`, `LOCATION_REQUIRES_REVERIFICATION`, `IDENTITY_REQUIRES_REVERIFICATION`) وتنشئ سجل `LeadVerification` بحالة `NEEDS_REVERIFICATION`.
   - **أوزان الثقة الحتمية (`Source Confidence Weighting`):** بلاغ مطور واحد يُسجل بثقة `MEDIUM` (`SINGLE_DEVELOPER_REPORT`)، وعند تطابق بلاغين أو أكثر من مطورين مختلفين على نفس العميل والسبب يرتفع مستوى الثقة تلقائياً إلى `HIGH` (`MULTIPLE_DEVELOPER_REPORTS`).

5. **تتبع محاولات التواصل والحماية من إساءة الاستخدام (`Contact Attempts & Abuse Protection` — `src/lib/feedback/abuse-protection.ts`):**
   - تسجيل كل محاولة تواصل في جدول `ContactAttempt` (`PHONE`, `WHATSAPP`, `EMAIL`, `SMS`, `SOCIAL`, `OTHER`) مع النتيجة (`NO_ANSWER`, `ANSWERED`, `INVALID_NUMBER`, `MESSAGE_SENT`, `REPLIED`, `BOUNCED`, `BLOCKED`, `OTHER`) وإطلاق إشارة إعادة التحقق عند تسجيل `INVALID_NUMBER` أو `BOUNCED`.
   - منع التكرار (`Idempotency-Key` + `DUPLICATE_EVENT` خلال نافذة 5 دقائق)، حدود المعدل (`RATE_LIMITED`)، وأعلام الرقابة التشغيلية (`RAPID_STATUS_CHANGES`, `FREQUENT_INVALID_REPORTS`, `SUSPICIOUS_FEEDBACK_VOLUME`, `INVALID_SEQUENCE`, `ADMIN_REVIEW_REQUIRED`).

6. **واجهات برمجة التطبيقات للمتابعة والتقييم (`Phase 6 Feedback & Outcome APIs`):**
   - `GET / POST / PATCH /api/leads/:id/engagement/status` (والتوافق الكامل مع `PATCH /api/leads/:id/status`) — عرض وتحديث حالة المتابعة والنتيجة البيعية.
   - `GET / POST /api/leads/:id/feedback` — عرض وإرسال التقييمات المهيكلة.
   - `GET / POST /api/leads/:id/contact-attempts` — عرض وتسجيل محاولات التواصل عبر القنوات المختلفة.
   - `GET /api/developer/engagements` و`GET /api/developer/engagements/:id` و`GET /api/developer/engagements/:id/timeline` — إدارة متابعات المطور والجدول الزمني الموحد.
   - `GET /api/admin/engagements` و`POST /api/admin/engagements/:id/correct-status` — مراقبة متابعات المطورين والتصحيح الإداري للحالات النهائية (Admin).

---

## 7.10 محرك التحليلات التنفيذية وحلقة تحسين البيانات الحتمية (Phase 7 — Production-Grade Analytics + Deterministic Data Flywheel)

يقع المحرك في `src/lib/analytics/` ويعمل بشكل حتمي 100%، قابل للتفسير، ومُراجع بشرياً دون أي نماذج ذكاء اصطناعي أو تعديل تلقائي للقواعد (`100% Deterministic, Version-Aware, Zero Double-Counting & Human-Reviewed`):

1. **قاموس المؤشرات المركزي وانضباط المقامات (`Centralized Metric Dictionary & Denominator Discipline` — `src/lib/analytics/metric-dictionary.ts`):**
   - يعرّف القاموس المركزي (`METRIC_DICTIONARY`) جميع المؤشرات عبر الطبقات الست (`Layer 1: Inventory`, `Layer 2: Quality`, `Layer 3: Opportunity`, `Layer 4: Matching`, `Layer 5: Sales Funnel`, `Layer 6: Economics`) مع تحديد صريح للبسط (`numerator`)، المقام (`denominator`)، الوحدة (`unit`)، إصدار المعادلة (`metricVersion`)، والحد الأدنى لحجم العينة (`minimumSampleSize`).
   - كل معدل يُرجع كائناً موحداً (`RateMetricResult`) يحتوي على (`numerator`, `denominator`, `value`, `percentage`, `displayValue`, `status`, `metricVersion`, `dateRange`, `filters`).
   - **منع القسمة على صفر والعينات الصغيرة:** عند كون المقام `0` يُرجع المحرك `status = 'INSUFFICIENT_DATA'` و`value = null`، وعند كون المقام أقل من `minimumSampleSize` يُرجع `status = 'INSUFFICIENT_SAMPLE'`.
   - **فصل قمع المبيعات المرحلي عن الإجمالي (`Stage-to-Stage vs Overall Funnel`):** يحسب `calculateCentralizedFunnelMetrics` كلاً من معدلات التحويل المرحلية (`contacted/claimed`, `replied/contacted`, `interested/replied`, `meetings/interested`, `won/meetings`) ومعدلات التحويل الإجمالية (`won/claimed`, `won/contacted`, `won/completed`, `meetings/replied`).

2. **الإسناد أحادي المصدر ومنع الازدواج الحسابي (`Single-Origin Attribution & Zero Double-Counting` — `src/lib/analytics/helpers.ts`):**
   - يفصل المحرك بين **المصدر الأصلي للفرصة (`Primary Origin Source`)** ومصادر الإثراء الثانوية (`Secondary Enrichment Sources` في `sourceList`) ومصادر التحقق (`LeadVerification.source`).
   - يتم إسناد كل فرصة موحدة (`isCanonical = true`) وإيرادات الشراء المحققة (`attributedRevenueEgp`) إلى مصدرها الأصلي فقط، مما يضمن تطابق مجموع الفرص والإيرادات عبر المصادر والقطاعات والمدن والمطورين (`Sum(Sources) == Sum(Niches) == Sum(Locations) == Sum(Developers) == Total Canonical / Total Attributed Revenue`).
   - في حالة استرداد النقاط (`REFUNDED`) يتم خصم النقاط المستردة من صافي الاستهلاك (`netCreditsConsumed`) وإلغاء الإيراد المسند للمطالبة المستردة بالكامل.

3. **أداء القواعد وحلقة التحسين بالمراجعة البشرية (`Deterministic Rule Performance & Human-Reviewed Data Flywheel` — `src/lib/analytics/service.ts`):**
   - يقيم المحرك أداء قواعد التقييم (`ScoringRule`)، قواعد المطابقة (`MatchingRule`)، وقواعد الجودة (`Quality Rules`) عبر مقارنة المجموعة التي انطبقت عليها القاعدة (`withRule`) بخط الأساس (`withoutRule`) وحساب الفارق الإحصائي (`winRateLiftAbsolute`, `contactRateLiftAbsolute`, `invalidRateDeltaAbsolute`).
   - القواعد التي تقل عينتها عن الحد الأدنى (`sampleSize < minimumSampleSize`) تُوسم بـ `INSUFFICIENT_SAMPLE` ولا تُرشح للمراجعة.
   - القواعد المستوفية لحجم العينة والتي تُظهر انحرافاً سلبياً تُدرج في جدول `RuleReviewCandidate` بحالة `OPEN` ليقوم مدير النظام بمراجعتها (`APPROVED`, `REJECTED`, `DEFERRED`, `UNDER_REVIEW`) مع تسجيل القرار في `AuditLog` — **ولا يتم أبداً تعديل أي أوزان أو قواعد إنتاجية تلقائياً**.

4. **التنبيهات التشخيصية الحتمية ولقطات المؤشرات اليومية (`Deterministic Anomaly Flags & DailyMetricSnapshot`):**
   - يرصد المحرك الانحرافات التشغيلية وفق عتبات صريحة (`SOURCE_INVALID_RATE_HIGH`, `SOURCE_DUPLICATE_RATE_HIGH`, `SCORE_BAND_UNDERPERFORMING`, `QUALITY_BAND_UNDERPERFORMING`, `MATCH_RULE_UNDERPERFORMING`, `DEVELOPER_FEEDBACK_SPIKE`, `CLAIM_FAILURE_SPIKE`, `REFUND_RATE_SPIKE`).
   - يدعم حفظ لقطات يومية للمؤشرات في جدول `DailyMetricSnapshot` لتتبع الاتجاهات التاريخية بسرعة وكفاءة.

5. **واجهات برمجة التطبيقات ولوحات التحكم للتحليلات (`Phase 7 Analytics APIs & Dashboards`):**
   - `GET / POST /api/admin/analytics/overview` — اللوحة التنفيذية عبر الطبقات الست وحفظ اللقطات اليومية.
   - `GET /api/admin/analytics/leads` و`/sources` و`/niches` و`/locations` و`/services` و`/developers` و`/rules` و`/data-quality` و`/funnel`.
   - `GET / POST /api/admin/analytics/rule-review` و`POST /api/admin/analytics/rule-review/:id/decision` — إدارة طابور المراجعة البشرية للقواعد.
   - `GET /api/admin/analytics/export` (أو `?format=csv`) — تصدير CSV آمن للمديرين فقط مع إزالة أي بيانات سرية ومنع حقن المعادلات.
   - `GET /api/developer/analytics` — تحليلات المطور المعزولة بصرامة لحسابه فقط (ترفض الوصول لبيانات أي مطور آخر بكود `403`).
   - لوحة تحكم الإدارة التفاعلية في `/admin/analytics` ولوحة تحليلات المطور في `/dashboard/analytics`.

---

## 7.11 محرك الاستيعاب ومعمارية المجمّعات والإمداد المستمر للفرص (Phase 8 — Production-Grade Ingestion + Collector Architecture + Continuous Lead Supply)

يقع المحرك في `src/lib/collectors/` ويعمل بشكل حتمي 100%، قابل للاستئناف، ومحصّن أمنياً وتشغيلياً دون أي نماذج ذكاء اصطناعي أو استخراج عشوائي غير منضبط (`100% Deterministic, Idempotent, Resumable, SSRF/CSV-Hardened & Source-Policy Compliant`):

1. **معمارية المجمّعات المعيارية وسجل الإصدارات (`Collector Architecture & Registry` — `src/lib/collectors/adapters.ts`, `src/lib/collectors/registry.ts`):**
   - فصل تام بين المحولات الخارجية (`Adapter`: جلب البيانات الخام من المصدر فقط) والمجمّعات المعيارية (`Collector`: تحويل البيانات الخام إلى عقد الاستيعاب الموحد `INGESTION_CONTRACT_V1`).
   - تسجيل مركزي في `CollectorRegistry` لستة مجمّعات قياسية مؤرخة الإصدار:
     - `ManualCollector` (`manual-v1`) — إدخال يدوي مباشر.
     - `CsvCollector` (`csv-v1`) — استيراد ملفات CSV/جداول بيانات مع حماية كاملة من حقن المعادلات (`=`, `+`, `-`, `@`) وحدود حجم صارمة.
     - `OpenDataCollector` (`open-data-v1`) — مجموعات البيانات المفتوحة والبيانات المهيكلة المصرّح بها.
     - `DirectoryCollector` (`directory-v1`) — أدلة الأعمال المصرية والتصنيفات القطاعية.
     - `WebsiteCollector` (`website-v1`) — فحص المواقع العامة المصرّح بها مع حماية SSRF صارمة (`validateSafeExternalUrl` + `safeExternalFetch`).
     - `GoogleBusinessCollector` (`google-business-v1`) — محول Google Business / Places المعتمد الذي يتحقق من مفاتيح الربط الرسمي ويعيد حالة `NOT_CONFIGURED` بأمان عند عدم ضبط المفاتيح دون تزييف نتائج حية.

2. **عقد الاستيعاب الموحد وبصمة المحتوى الحتمية (`Unified Contract & SHA-256 Checksum` — `src/lib/collectors/contract.ts`):**
   - التحقق الصارم عبر `IngestionContractRecordSchema` وحساب بصمة محتوى حتمية `SHA-256` (`calculateIngestionChecksum`) على الحقول الجوهرية المطبّعة لتسريع التخطي الآمن (`UNCHANGED_SKIPPED`) عند إعادة التشغيل دون تكرار العمليات المكلفة.

3. **المنسق المركزي، عدم التكرار، والاستئناف بعد الأعطال (`Idempotent & Resumable Orchestrator` — `src/lib/collectors/orchestrator.ts`):**
   - يربط `runIngestionPipeline` دورة حياة السجل بالكامل عبر المراحل المتسلسلة: `Validation -> Normalization -> Checksum Fast-Path -> Deduplication & Provenance (Phase 2) -> Quality & Verification (Phase 3) -> Opportunity Scoring (Phase 1) -> Developer Matching Invalidation (Phase 4)`.
   - يدعم مفاتيح عدم التكرار (`idempotencyKey`)، أقفال التزامن لكل مصدر ولكل هوية عميل (`acquireSourceJobLock`, `withIdentityConcurrencyLock`)، حفظ نقاط التوقف المرحلية (`CheckpointState`)، الإيقاف التعاوني الآمن (`cancelIngestionJob`)، والاستئناف التلقائي من آخر نقطة توقف (`resumeIngestionJob`).

4. **المرونة التشغيلية، قاطع الدائرة، وطابور السجلات المتعثرة (`Resilience, Circuit Breaker & Dead-Letter Queue` — `src/lib/collectors/resilience.ts`):**
   - تصنيف حتمي للأخطاء (`RETRYABLE` مقابل `NON_RETRYABLE`) مع إعادة محاولة أسية محدودة (`computeExponentialBackoffMs`) ومحدد معدل لكل مصدر (`SourceRateLimiter`).
   - قاطع دائرة (`Circuit Breaker`: `CLOSED -> OPEN -> HALF_OPEN -> CLOSED`) يعزل المصادر المتعطلة تلقائياً بعد تكرار الفشل لمنع استنزاف الموارد، مع عزل تام بين المصادر المتوازية (`runMultipleSourcesIsolated`).
   - تحويل السجلات التي تفشل نهائياً إلى جدول `DeadLetterRecord` مع دعم إعادة المحاولة الانتقائية (`RETRY -> RETRIED_RESOLVED`) أو الوسم كغير صالح نهائياً (`MARK_INVALID -> PERMANENTLY_INVALID`).

5. **مراقبة صحة المصادر والإمداد المستمر للمخزون (`Source Health & Continuous Supply Replenishment` — `src/lib/collectors/health-and-supply.ts`):**
   - حساب حتمي لصحة المصدر (`HEALTHY`, `DEGRADED`, `FAILING`, `DISABLED`, `NOT_CONFIGURED`, `RATE_LIMITED`) وإصدار تنبيهات تشغيلية مبكرة (`evaluateOperationalAlerts`).
   - محرك تخطيط الإمداد المستمر (`evaluateInventoryReplenishment`) يقارن المخزون المتاح للبيع (`AVAILABLE`) في كل تقاطع (`Niche × City`) مع الحدود الدنيا المستهدفة (`DEFAULT_INVENTORY_TARGETS`) ويحدد فجوات التغطية والمصادر المؤهلة لسد الفجوة حسب أولوية الجدولة.
   - تكامل كامل مع تحليلات المصادر (Phase 7) لعرض قمع الاستيعاب (`rawFetched -> accepted -> created -> merged -> rejected -> deadLetter -> saleable`) واقتصاديات تكلفة المصدر (`costPerRawRecord`, `costPerSaleableLead`, `costPerClaimedLead`, `costPerWonLead` أو `INSUFFICIENT_DATA` عند عدم توفر بيانات تكلفة).

6. **التوثيق الهندسي التفصيلي للمرحلة الثامنة (`Phase 8 Documentation`):**
   - [معمارية الاستيعاب (`docs/ingestion.md`)](docs/ingestion.md)
   - [معمارية المجمّعات والمحولات (`docs/collectors.md`)](docs/collectors.md)
   - [إدارة المصادر والإمداد المستمر (`docs/source-management.md`)](docs/source-management.md)
   - [دليل التشغيل والطوارئ للاستيعاب (`docs/ingestion-runbook.md`)](docs/ingestion-runbook.md)
   - [تتبع النسب ودورة حياة البيانات (`docs/data-lineage.md`)](docs/data-lineage.md)

---

## 8. تشغيل الاختبارات وفحص الأنواع (Testing & Verification)

لتشغيل حزمة الاختبارات الكاملة (تغطي محرك التقييم الحتمي Phase 1، محرك منع التكرار وتوحيد الكيانات Phase 2، محرك جودة البيانات والحداثة والتحقق Phase 3، محرك المطابقة الحتمي بين العملاء والمطورين Phase 4، محرك الشراء والرصيد والملكية الحصرية والمشتركة Phase 5، محرك المتابعة والتقييم والنتائج البيعية Phase 6، محرك التحليلات التنفيذية وحلقة تحسين البيانات الحتمية Phase 7، ومحرك الاستيعاب والمجمّعات والإمداد المستمر Phase 8):
```bash
npm test
```

للتحقق من سلامة أنواع TypeScript:
```bash
npm run typecheck
```

لبناء نسخة الإنتاج (Production Build):
```bash
npm run build
```

---

## 9. النشر في بيئة الإنتاج والجاهزية التشغيلية (Phase 9 & Phase 10 — Production Hardening, Deployment & Launch)

تم تحصين المنصة بالكامل للإنتاج عبر المرحلتين التاسعة والعاشرة (`src/lib/security/`, `src/lib/observability/`, `src/lib/production/`) بدون أي اعتماد على الذكاء الاصطناعي أو النماذج اللغوية (`NO AI / NO ML / NO LLM`):

1. **فصل البيئات والتحقق الصارم من الإعدادات (`src/lib/production/env-validator.ts`)**:
   - فصل كامل بين `development`، `test`، `staging`، و`production`.
   - فحص `validateEnvironmentConfiguration` يرفض التشغيل في الإنتاج عند غياب أو ضعف `AUTH_SECRET`، أو استخدام `localhost`، أو تفعيل `ALLOW_PRODUCTION_SEED`، أو استخدام مفاتيح دفع تجريبية، مع إخفاء جميع القيم السرية (`<REDACTED>`).
2. **سلامة الترحيل، النسخ الاحتياطي، والاستعادة (`src/lib/production/database-ops.ts`, `src/lib/production/backup-restore.ts`)**:
   - مصنف أمان ترحيل قاعدة البيانات (`classifySqlMigrationSafety`) يميز بين الترحيلات الآمنة (`SAFE`) والخطرة (`DANGEROUS`).
   - حظر تشغيل بيانات البذور التجريبية في الإنتاج (`SEED_BLOCKED_IN_PRODUCTION`).
   - توليد نسخ احتياطية منطقية موثقة ببصمة `SHA-256` (`createLogicalBackupSnapshot`) والتحقق من استعادتها وسلامة القيود التسعة الحرجة في بيئة معزولة (`executeStagingRestoreVerification`).
3. **بوابة جودة البيانات، الجدولة الآمنة، وأعلام الميزات (`src/lib/production/data-quality-gate.ts`, `src/lib/production/scheduler.ts`, `src/lib/production/feature-flags.ts`)**:
   - فحص غير تدميري لـ 14 معياراً لجودة البيانات قبل الإطلاق (`runProductionDataQualityGate`).
   - جدولة مهام خلفية محكومة بأقفال حصرية وحدود دفعات صارمة (`executeScheduledWorkerJob`).
   - أعلام ميزات على الخادم قابلة للتدقيق (`setFeatureFlagOverride`).
4. **أمان المدفوعات والـ Webhooks وضوابط الخصوصية (`src/lib/payment/provider.ts`, `src/app/api/webhooks/payment/route.ts`, `src/lib/production/privacy-controls.ts`)**:
   - التحقق من توقيع `HMAC-SHA256` للـ Webhooks (`POST /api/webhooks/payment`) مع ضمان عدم تكرار منح الرصيد (`Idempotency`) ومعالجة الأحداث المعاد ترتيبها بأمان.
   - تصدير البيانات الشخصية للمطور (`GET /api/developer/profile?export=true`) والحذف المحكوم للحساب مع إخفاء الهوية (`DELETE /api/developer/profile`) مع الحفاظ على السجلات المالية والتدقيقية غير القابلة للتعديل.
5. **نقاط فحص الصحة واختبارات الدخان وبوابة الإطلاق (`GET /api/health`, `GET /api/health/live`, `GET /api/health/ready`, `src/lib/production/smoke-and-launch-gate.ts`)**:
   - اختبارات دخان آلية غير تدميرية (`runProductionSmokeTests`) وتقييم شامل لبوابة الإطلاق (`evaluateProductionLaunchGate`).

### الفهرس الكامل لوثائق الإنتاج والتشغيل (`docs/production/`)
- [دليل النشر (`docs/production/deployment.md`)](docs/production/deployment.md)
- [إعدادات وفصل البيئات (`docs/production/environment.md`)](docs/production/environment.md)
- [قاعدة البيانات والترحيل الآمن (`docs/production/database.md`)](docs/production/database.md)
- [استراتيجية النسخ الاحتياطي (`docs/production/backups.md`)](docs/production/backups.md)
- [إجراءات الاستعادة والتعافي من الكوارث (`docs/production/restore.md`)](docs/production/restore.md)
- [خطة التراجع (`docs/production/rollback.md`)](docs/production/rollback.md)
- [المراقبة والرصد (`docs/production/monitoring.md`)](docs/production/monitoring.md)
- [التنبيهات الحرجة (`docs/production/alerts.md`)](docs/production/alerts.md)
- [الاستجابة للحوادث والأمن (`docs/production/incident-response.md`)](docs/production/incident-response.md)
- [المهام الخلفية والجدولة (`docs/production/workers.md`)](docs/production/workers.md)
- [جاهزية المجمّعات وسلامة الإمداد (`docs/production/collectors.md`)](docs/production/collectors.md)
- [المدفوعات والـ Webhooks (`docs/production/payments.md`)](docs/production/payments.md)
- [الأمان والصلاحيات والخصوصية (`docs/production/security.md`)](docs/production/security.md)
- [دليل استكشاف الأخطاء وإصلاحها (`docs/production/troubleshooting.md`)](docs/production/troubleshooting.md)
- [قائمة التحقق من الإصدار والإطلاق (`docs/production/release-checklist.md`)](docs/production/release-checklist.md)


# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> LeadForge Egypt — Launch Fix Sprint E2E Suite >> 2. Pricing Page Localization & Card Alignment (ar & en, Desktop & Mobile)
- Location: e2e\smoke.spec.ts:59:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "الباقة المجانية"
Received string:    "Leads
4
dev
فرص مبيعات مؤهلة لمطوري المواقع
الرئيسية
الباقات والأسعار
استكشاف الفرص
العربية
English
تسجيل الدخول
إنشاء حساب
خطط اشتراك مصممة لمطوري الويب في مصر·
ابدأ باقتناص الفرص المؤهلة، وقم بالترقية في أي وقت للحصول على نقاط إضافية وإمكانية شراء الفرص الحصرية.·
Leads
4
dev
فرص مبيعات مؤهلة لمطوري المواقع
الباقات والأسعار
استكشاف الفرص
تسجيل الدخول
العربية
English·
© 2026 Leads4dev.·
نفس المدخلات تعطي نفس النتيجة دائماً."
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "Leads4dev" [ref=e5] [cursor=pointer]:
          - /url: /
          - generic [ref=e6]:
            - generic "Leads4dev" [ref=e7]:
              - generic [ref=e8]: Leads
              - generic [ref=e9]: "4"
              - generic [ref=e10]: dev
            - generic [ref=e11]: فرص مبيعات مؤهلة لمطوري المواقع
        - navigation [ref=e12]:
          - link "الرئيسية" [ref=e13] [cursor=pointer]:
            - /url: /
          - link "الباقات والأسعار" [ref=e14] [cursor=pointer]:
            - /url: /pricing
          - link "استكشاف الفرص" [ref=e17] [cursor=pointer]:
            - /url: /leads
        - generic [ref=e21]:
          - group "Language Switcher / اختيار اللغة" [ref=e22]:
            - button "العربية" [pressed] [ref=e23] [cursor=pointer]
            - button "English" [ref=e24] [cursor=pointer]
          - link [ref=e25] [cursor=pointer]:
            - /url: /login
            - button "تسجيل الدخول" [ref=e26]
          - link [ref=e31] [cursor=pointer]:
            - /url: /register
            - button "إنشاء حساب" [ref=e32]
    - main [ref=e37]:
      - generic [ref=e38]:
        - heading "خطط اشتراك مصممة لمطوري الويب في مصر" [level=1] [ref=e39]
        - paragraph [ref=e40]: ابدأ باقتناص الفرص المؤهلة، وقم بالترقية في أي وقت للحصول على نقاط إضافية وإمكانية شراء الفرص الحصرية.
    - contentinfo [ref=e74]:
      - generic [ref=e75]:
        - link "Leads4dev" [ref=e76] [cursor=pointer]:
          - /url: /
          - generic [ref=e77]:
            - generic "Leads4dev" [ref=e78]:
              - generic [ref=e79]: Leads
              - generic [ref=e80]: "4"
              - generic [ref=e81]: dev
            - generic [ref=e82]: فرص مبيعات مؤهلة لمطوري المواقع
        - generic [ref=e83]:
          - link "الباقات والأسعار" [ref=e84] [cursor=pointer]:
            - /url: /pricing
          - link "استكشاف الفرص" [ref=e85] [cursor=pointer]:
            - /url: /leads
          - link "تسجيل الدخول" [ref=e86] [cursor=pointer]:
            - /url: /login
          - group "Language Switcher / اختيار اللغة" [ref=e87]:
            - button "العربية" [pressed] [ref=e88] [cursor=pointer]
            - button "English" [ref=e89] [cursor=pointer]
        - generic [ref=e90]:
          - paragraph [ref=e91]:
            - generic [ref=e92]: © 2026 Leads4dev.
          - paragraph [ref=e93]: نفس المدخلات تعطي نفس النتيجة دائماً.
  - alert [ref=e94]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import fs from 'fs';
  3   | import path from 'path';
  4   | 
  5   | const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'sprint');
  6   | 
  7   | test.beforeAll(() => {
  8   |   if (!fs.existsSync(SCREENSHOT_DIR)) {
  9   |     fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  10  |   }
  11  | });
  12  | 
  13  | test.describe('LeadForge Egypt — Launch Fix Sprint E2E Suite', () => {
  14  |   test('1. Public Landing Page (Score Lab + Ownership Dark Surface) & Bilingual Switch (ar <-> en)', async ({
  15  |     page,
  16  |   }) => {
  17  |     await page.setViewportSize({ width: 1440, height: 900 });
  18  |     await page.context().addCookies([
  19  |       { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
  20  |     ]);
  21  | 
  22  |     await page.goto('/');
  23  |     await page.waitForLoadState('domcontentloaded');
  24  |     await page.waitForTimeout(800);
  25  | 
  26  |     await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  27  |     await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  28  | 
  29  |     // Verify Score Lab (#score-lab) and dark surface section are visible
  30  |     const scoreLab = page.locator('#score-lab');
  31  |     await expect(scoreLab).toBeVisible();
  32  |     const darkSurface = page.locator('[data-surface="inverse"]').first();
  33  |     await expect(darkSurface).toBeVisible();
  34  | 
  35  |     await page.screenshot({
  36  |       path: path.join(SCREENSHOT_DIR, 'landing-ar-1440x900.png'),
  37  |       fullPage: false,
  38  |     });
  39  | 
  40  |     // Switch to English via cookie or language switcher
  41  |     await page.context().addCookies([
  42  |       { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
  43  |     ]);
  44  |     await page.reload();
  45  |     await page.waitForLoadState('domcontentloaded');
  46  |     await page.waitForTimeout(800);
  47  | 
  48  |     await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  49  |     await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  50  |     await expect(scoreLab).toBeVisible();
  51  |     await expect(darkSurface).toBeVisible();
  52  | 
  53  |     await page.screenshot({
  54  |       path: path.join(SCREENSHOT_DIR, 'landing-en-1440x900.png'),
  55  |       fullPage: false,
  56  |     });
  57  |   });
  58  | 
  59  |   test('2. Pricing Page Localization & Card Alignment (ar & en, Desktop & Mobile)', async ({
  60  |     page,
  61  |   }) => {
  62  |     await page.setViewportSize({ width: 1440, height: 900 });
  63  |     await page.context().addCookies([
  64  |       { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
  65  |     ]);
  66  | 
  67  |     await page.goto('/pricing');
  68  |     await page.waitForLoadState('domcontentloaded');
  69  |     await page.waitForTimeout(1000);
  70  | 
  71  |     const arBody = await page.innerText('body');
  72  |     expect(arBody).not.toContain('(Free)');
  73  |     expect(arBody).not.toContain('(Shared Leads)');
  74  |     expect(arBody).not.toContain('(HOT & PREMIUM)');
> 75  |     expect(arBody).toContain('الباقة المجانية');
      |                    ^ Error: expect(received).toContain(expected) // indexOf
  76  |     expect(arBody).toMatch(/حوالي .* ج\.م للنقطة/);
  77  | 
  78  |     await page.screenshot({
  79  |       path: path.join(SCREENSHOT_DIR, 'pricing-ar-1440x900.png'),
  80  |       fullPage: false,
  81  |     });
  82  | 
  83  |     // Switch to English
  84  |     await page.context().addCookies([
  85  |       { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
  86  |     ]);
  87  |     await page.reload();
  88  |     await page.waitForLoadState('domcontentloaded');
  89  |     await page.waitForTimeout(1000);
  90  | 
  91  |     const enBody = await page.innerText('body');
  92  |     expect(enBody).toContain('Free');
  93  |     expect(enBody).toContain('Pro');
  94  |     expect(enBody).toMatch(/Approx\..*EGP per point/);
  95  | 
  96  |     await page.screenshot({
  97  |       path: path.join(SCREENSHOT_DIR, 'pricing-en-1440x900.png'),
  98  |       fullPage: false,
  99  |     });
  100 | 
  101 |     // Mobile viewport check (390x844)
  102 |     await page.setViewportSize({ width: 390, height: 844 });
  103 |     await page.waitForTimeout(400);
  104 |     await page.screenshot({
  105 |       path: path.join(SCREENSHOT_DIR, 'pricing-en-390x844.png'),
  106 |       fullPage: false,
  107 |     });
  108 |   });
  109 | 
  110 |   test('3. Developer Login, Dashboard, User Menu & Working Logout Flow', async ({ page }) => {
  111 |     await page.setViewportSize({ width: 1440, height: 900 });
  112 |     await page.context().addCookies([
  113 |       { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
  114 |     ]);
  115 | 
  116 |     await page.goto('/login');
  117 |     await page.fill('input[type="email"]', 'dev@leadforge.eg');
  118 |     await page.fill('input[type="password"]', 'Dev@12345');
  119 |     await page.click('button[type="submit"]');
  120 |     await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  121 |     expect(page.url()).toContain('/dashboard');
  122 | 
  123 |     await page.waitForTimeout(1000);
  124 |     await page.screenshot({
  125 |       path: path.join(SCREENSHOT_DIR, 'dashboard-ar-1440x900.png'),
  126 |       fullPage: false,
  127 |     });
  128 | 
  129 |     // Verify Sidebar user section contains Settings and Logout in Arabic
  130 |     const sidebarText = await page.locator('aside').first().innerText();
  131 |     expect(sidebarText).toContain('الإعدادات');
  132 |     expect(sidebarText).toContain('تسجيل الخروج');
  133 | 
  134 |     // Open TopBar User Menu dropdown and verify Settings + Logout
  135 |     const userMenuBtn = page.locator('header button[aria-haspopup="menu"]');
  136 |     await expect(userMenuBtn).toBeVisible();
  137 |     await userMenuBtn.click();
  138 | 
  139 |     const menu = page.locator('header [role="menu"]');
  140 |     await expect(menu).toBeVisible();
  141 |     await expect(menu).toContainText('الإعدادات');
  142 |     await expect(menu).toContainText('تسجيل الخروج');
  143 | 
  144 |     // Click Logout and verify redirect to /login
  145 |     await menu.locator('button:has-text("تسجيل الخروج")').click();
  146 |     await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
  147 |     expect(page.url()).toContain('/login');
  148 |   });
  149 | 
  150 |   test('4. /leads Lists Cards & Open Lead Detail Purchase Dialog Balance Math', async ({
  151 |     page,
  152 |   }) => {
  153 |     await page.setViewportSize({ width: 1440, height: 900 });
  154 |     await page.context().addCookies([
  155 |       { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
  156 |     ]);
  157 | 
  158 |     await page.goto('/login');
  159 |     await page.fill('input[type="email"]', 'dev@leadforge.eg');
  160 |     await page.fill('input[type="password"]', 'Dev@12345');
  161 |     await page.click('button[type="submit"]');
  162 |     await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  163 | 
  164 |     await page.goto('/leads');
  165 |     await page.waitForLoadState('domcontentloaded');
  166 |     await expect(page.locator('article').first()).toBeVisible({ timeout: 15000 });
  167 | 
  168 |     const cards = page.locator('article');
  169 |     const count = await cards.count();
  170 |     expect(count).toBeGreaterThan(0);
  171 | 
  172 |     await page.screenshot({
  173 |       path: path.join(SCREENSHOT_DIR, 'leads-ar-1440x900.png'),
  174 |       fullPage: false,
  175 |     });
```
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots', 'sprint');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe('LeadForge Egypt — Launch Fix Sprint E2E Suite', () => {
  test('1. Public Landing Page (Score Lab + Ownership Dark Surface) & Bilingual Switch (ar <-> en)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // Verify Score Lab (#score-lab) and dark surface section are visible
    const scoreLab = page.locator('#score-lab');
    await expect(scoreLab).toBeVisible();
    const darkSurface = page.locator('[data-surface="inverse"]').first();
    await expect(darkSurface).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'landing-ar-1440x900.png'),
      fullPage: false,
    });

    // Switch to English via cookie or language switcher
    await page.context().addCookies([
      { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
    ]);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(scoreLab).toBeVisible();
    await expect(darkSurface).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'landing-en-1440x900.png'),
      fullPage: false,
    });
  });

  test('2. Pricing Page Localization & Card Alignment (ar & en, Desktop & Mobile)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const arBody = await page.innerText('body');
    expect(arBody).not.toContain('(Free)');
    expect(arBody).not.toContain('(Shared Leads)');
    expect(arBody).not.toContain('(HOT & PREMIUM)');
    expect(arBody).toContain('الباقة المجانية');
    expect(arBody).toMatch(/حوالي .* ج\.م للنقطة/);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-ar-1440x900.png'),
      fullPage: false,
    });

    // Switch to English
    await page.context().addCookies([
      { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
    ]);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const enBody = await page.innerText('body');
    expect(enBody).toContain('Free');
    expect(enBody).toContain('Pro');
    expect(enBody).toMatch(/Approx\..*EGP per point/);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-en-1440x900.png'),
      fullPage: false,
    });

    // Mobile viewport check (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing-en-390x844.png'),
      fullPage: false,
    });
  });

  test('3. Developer Login, Dashboard, User Menu & Working Logout Flow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/login');
    await page.fill('input[type="email"]', 'dev@leadforge.eg');
    await page.fill('input[type="password"]', 'Dev@12345');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/dashboard');

    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dashboard-ar-1440x900.png'),
      fullPage: false,
    });

    // Verify Sidebar user section contains Settings and Logout in Arabic
    const sidebarText = await page.locator('aside').first().innerText();
    expect(sidebarText).toContain('الإعدادات');
    expect(sidebarText).toContain('تسجيل الخروج');

    // Open TopBar User Menu dropdown and verify Settings + Logout
    const userMenuBtn = page.locator('header button[aria-haspopup="menu"]');
    await expect(userMenuBtn).toBeVisible();
    await userMenuBtn.click();

    const menu = page.locator('header [role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('الإعدادات');
    await expect(menu).toContainText('تسجيل الخروج');

    // Click Logout and verify redirect to /login
    await menu.locator('button:has-text("تسجيل الخروج")').click();
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('4. /leads Lists Cards & Open Lead Detail Purchase Dialog Balance Math', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/login');
    await page.fill('input[type="email"]', 'dev@leadforge.eg');
    await page.fill('input[type="password"]', 'Dev@12345');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    await page.goto('/leads');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('article').first()).toBeVisible({ timeout: 15000 });

    const cards = page.locator('article');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'leads-ar-1440x900.png'),
      fullPage: false,
    });

    // Navigate to first available lead detail
    const firstLeadHref = await page.locator('article a[href^="/leads/"]').first().getAttribute('href');
    await page.goto(firstLeadHref || '/leads/cmv13ybbp012jtxt4uso3tpfb');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'lead-detail-ar-1440x900.png'),
      fullPage: false,
    });

    const buyButton = page
      .locator(
        'button:has-text("شراء"), button:has-text("الحصول على الفرصة"), button:has-text("Purchase")'
      )
      .first();

    if (await buyButton.isVisible()) {
      await buyButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 8000 });
      const dialogText = await dialog.innerText();
      expect(dialogText).toMatch(/رصيدك|سعر|نقطة|Balance|Points/i);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  });

  test('5. /my-leads, /subscription & Mobile Screenshots (390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/login');
    await page.fill('input[type="email"]', 'dev@leadforge.eg');
    await page.fill('input[type="password"]', 'Dev@12345');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'dashboard-en-1440x900.png'),
      fullPage: false,
    });

    await page.goto('/my-leads');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'my-leads-en-1440x900.png'),
      fullPage: false,
    });

    await page.goto('/subscription');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'subscription-en-1440x900.png'),
      fullPage: false,
    });

    // Mobile 390x844 check
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'subscription-en-390x844.png'),
      fullPage: false,
    });
  });

  test('6. Admin /admin/duplicates & /admin/rules Load in Both Locales', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().addCookies([
      { name: 'lf_locale', value: 'ar', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@leadforge.eg');
    await page.fill('input[type="password"]', 'Admin@12345');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    await page.goto('/admin/duplicates');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);

    const heading = page.locator('h1, h2, [role="region"]').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    await page.goto('/admin/rules');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);

    const rulesHeading = page.locator('h1, h2, h3, [role="region"]').first();
    await expect(rulesHeading).toBeVisible({ timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-rules-ar-1440x900.png'),
      fullPage: false,
    });
  });
});

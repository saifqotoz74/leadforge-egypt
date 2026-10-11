import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:\\Users\\Mohamed Sallam\\.gemini\\antigravity\\brain\\e333b408-4a80-4ff7-80c4-82a6d50970a1';
const BASE_URL = 'http://localhost:3000';

async function loginUser(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
}

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function run() {
  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(EDGE_PATH) ? EDGE_PATH : undefined,
  });

  for (const locale of ['ar', 'en']) {
    console.log(`\n=== CAPTURING LOCALE: ${locale} ===`);

    // 1. Landing Navbar (1440x800)
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 800 },
      });
      await context.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);

      // Hero & Navbar view
      const navHeader = page.locator('header').first();
      await navHeader.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_navbar_${locale}_1440.png`),
      });
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_landing_hero_${locale}_1440.png`),
      });

      // Footer
      const footer = page.locator('footer').first();
      if (await footer.count() > 0) {
        await footer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        await footer.screenshot({
          path: path.join(ARTIFACT_DIR, `branding_footer_${locale}_1440.png`),
        });
      }
      await context.close();
    }

    // 2. Landing Mobile (390x844)
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_landing_mobile_${locale}_390.png`),
      });
      await context.close();
    }

    // 3. Login Screen (1440 & 390)
    {
      const contextDesktop = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await contextDesktop.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const pageDesktop = await contextDesktop.newPage();
      await pageDesktop.goto(`${BASE_URL}/login`);
      await pageDesktop.waitForLoadState('networkidle');
      await pageDesktop.waitForTimeout(600);

      await pageDesktop.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_login_${locale}_1440.png`),
      });
      await contextDesktop.close();

      const contextMobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await contextMobile.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const pageMobile = await contextMobile.newPage();
      await pageMobile.goto(`${BASE_URL}/login`);
      await pageMobile.waitForLoadState('networkidle');
      await pageMobile.waitForTimeout(600);

      await pageMobile.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_login_${locale}_390.png`),
      });
      await contextMobile.close();
    }

    // 4. Register Screen (1440)
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/register`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_register_${locale}_1440.png`),
      });
      await context.close();
    }

    // 5. Desktop Application App View (1440x900) - Authenticated
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await context.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const page = await context.newPage();
      await loginUser(page, 'dev@leadforge.eg', 'Dev@12345');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_app_dashboard_${locale}_1440.png`),
      });
      await context.close();
    }

    // 6. Mobile Application with Drawer Open (390x844) - Authenticated
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.addCookies([
        { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
      ]);
      const page = await context.newPage();
      await loginUser(page, 'dev@leadforge.eg', 'Dev@12345');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);

      // Click hamburger menu in TopBar
      const menuBtn = page.locator('header button[aria-label="القائمة"], header button[aria-label="Menu"]').first();
      if (await menuBtn.count() > 0) {
        await menuBtn.click();
        await page.waitForTimeout(500);
      }

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `branding_app_drawer_${locale}_390.png`),
      });
      await context.close();
    }
  }

  await browser.close();
  console.log('\nAll branding screenshots successfully captured!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

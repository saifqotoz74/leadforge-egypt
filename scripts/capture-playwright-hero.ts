import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function capture() {
  const outputDir = path.join(process.cwd(), 'screenshots');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const locales = ['ar', 'en'] as const;

  for (const locale of locales) {
    const context = await browser.newContext({
      locale: locale === 'ar' ? 'ar-EG' : 'en-US',
    });

    await context.addCookies([
      {
        name: 'lf_locale',
        value: locale,
        domain: 'localhost',
        path: '/',
      },
    ]);

    // 1. Desktop above-the-fold at 1440x800
    const page1440 = await context.newPage();
    await page1440.setViewportSize({ width: 1440, height: 800 });
    await page1440.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page1440.evaluate(() => window.scrollTo(0, 0));
    await page1440.waitForTimeout(500);

    await page1440.screenshot({
      path: path.join(outputDir, `landing_hero_${locale}_1440x800.png`),
      fullPage: false,
    });
    console.log(`Saved landing_hero_${locale}_1440x800.png`);

    // 2. Desktop 1440 full page
    await page1440.screenshot({
      path: path.join(outputDir, `landing_full_${locale}_1440.png`),
      fullPage: true,
    });
    console.log(`Saved landing_full_${locale}_1440.png`);

    if (locale === 'ar') {
      fs.copyFileSync(
        path.join(outputDir, `landing_full_${locale}_1440.png`),
        path.join(outputDir, 'landing_page_full.png')
      );
    } else {
      fs.copyFileSync(
        path.join(outputDir, `landing_full_${locale}_1440.png`),
        path.join(outputDir, 'landing_page_full_en.png')
      );
    }
    await page1440.close();

    // 3. Mobile above-the-fold at 390x844
    const page390 = await context.newPage();
    await page390.setViewportSize({ width: 390, height: 844 });
    await page390.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page390.evaluate(() => window.scrollTo(0, 0));
    await page390.waitForTimeout(500);

    await page390.screenshot({
      path: path.join(outputDir, `landing_hero_${locale}_390.png`),
      fullPage: false,
    });
    console.log(`Saved landing_hero_${locale}_390.png`);
    await page390.close();

    await context.close();
  }

  await browser.close();
  console.log('All screenshots captured successfully with Playwright!');
}

capture().catch((e) => {
  console.error(e);
  process.exit(1);
});

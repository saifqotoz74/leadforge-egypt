import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:\\Users\\Mohamed Sallam\\.gemini\\antigravity\\brain\\e333b408-4a80-4ff7-80c4-82a6d50970a1';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

async function main() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  // 1. Authenticate to get session token
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@leadforge.eg', password: 'Dev@12345' }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed with status: ${loginRes.status}`);
  }

  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const sessionMatch = cookieHeader.match(/leadforge_session=([^;]+)/);
  if (!sessionMatch) {
    throw new Error('Could not extract leadforge_session cookie');
  }
  const sessionToken = sessionMatch[1];

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '390', width: 390, height: 844 },
  ];

  const views = [
    { id: 'landing', route: '/', auth: false },
    { id: 'pricing', route: '/pricing', auth: false },
    { id: 'login', route: '/login', auth: false },
    { id: 'dashboard', route: '/dashboard', auth: true },
    { id: 'leads', route: '/leads', auth: true },
    { id: 'lead_detail', route: '/leads/cmv13ybbp012jtxt4uso3tpfb', auth: true },
    { id: 'subscription', route: '/subscription', auth: true },
  ];

  const capturedFiles: string[] = [];
  const overflowIssues: string[] = [];

  for (const vp of viewports) {
    console.log(`\n=== Capturing LTR QA Screenshots for viewport ${vp.name} (${vp.width}x${vp.height}) ===`);

    // Context for unauthenticated views
    const publicContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-US',
    });
    await publicContext.addCookies([
      { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
    ]);

    // Context for authenticated views
    const authContext = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'en-US',
    });
    await authContext.addCookies([
      { name: 'lf_locale', value: 'en', domain: 'localhost', path: '/' },
      { name: 'leadforge_session', value: sessionToken, domain: 'localhost', path: '/' },
    ]);

    for (const view of views) {
      const ctx = view.auth ? authContext : publicContext;
      const page = await ctx.newPage();
      await page.goto(`http://localhost:3000${view.route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      // Check for horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      if (hasHorizontalScroll) {
        overflowIssues.push(`${view.id} at ${vp.name}px has horizontal scroll!`);
        console.warn(`WARNING: Horizontal scroll detected on ${view.id} at ${vp.name}px`);
      }

      const filename = `ltr_qa_${view.id}_${vp.name}.png`;
      const localPath = path.join(SCREENSHOTS_DIR, filename);
      await page.screenshot({ path: localPath, fullPage: false });

      // Copy to artifact directory
      if (fs.existsSync(ARTIFACT_DIR)) {
        fs.copyFileSync(localPath, path.join(ARTIFACT_DIR, filename));
      }

      capturedFiles.push(filename);
      console.log(`Captured ${filename}`);
      await page.close();
    }

    // Capture Purchase Dialog on /leads/cmv13ybbp012jtxt4uso3tpfb
    console.log(`Capturing Purchase Dialog at ${vp.name}...`);
    const dialogPage = await authContext.newPage();
    await dialogPage.goto('http://localhost:3000/leads/cmv13ybbp012jtxt4uso3tpfb', { waitUntil: 'networkidle' });
    await dialogPage.waitForTimeout(600);

    // Click the purchase button to open dialog
    const purchaseBtn = dialogPage.locator('button:has-text("Claim Lead Data")').first();
    if (await purchaseBtn.isVisible()) {
      await purchaseBtn.click();
      await dialogPage.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await dialogPage.waitForTimeout(400);

      const dialogFilename = `ltr_qa_purchase_dialog_${vp.name}.png`;
      const dialogPath = path.join(SCREENSHOTS_DIR, dialogFilename);
      await dialogPage.screenshot({ path: dialogPath, fullPage: false });

      if (fs.existsSync(ARTIFACT_DIR)) {
        fs.copyFileSync(dialogPath, path.join(ARTIFACT_DIR, dialogFilename));
      }
      capturedFiles.push(dialogFilename);
      console.log(`Captured ${dialogFilename}`);
    } else {
      console.error(`Could not find purchase button on lead detail page at ${vp.name}`);
    }
    await dialogPage.close();

    await publicContext.close();
    await authContext.close();
  }

  await browser.close();

  console.log('\n=== LTR QA SCREENSHOT CAPTURE COMPLETE ===');
  console.log(`Total captured: ${capturedFiles.length} files`);
  console.log(`Horizontal scroll issues: ${overflowIssues.length}`);
  if (overflowIssues.length > 0) {
    overflowIssues.forEach((iss) => console.log(' - ' + iss));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

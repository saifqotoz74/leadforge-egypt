import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { signSessionToken } from '../src/lib/auth';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASELINE_DIR = path.join(process.cwd(), 'screenshots', 'baseline');
const DATA_DIR = path.join(process.cwd(), 'docs', 'design', 'data');
const REAL_LEAD_ID = 'cmv13ybbp012jtxt4uso3tpfb';

interface PageConfig {
  key: string;
  path: string;
  role: 'PUBLIC' | 'DEVELOPER' | 'ADMIN';
  density: 'comfortable' | 'compact';
}

const REAL_PAGES: PageConfig[] = [
  // Public (Comfortable density per Base 5.7)
  { key: 'landing', path: '/', role: 'PUBLIC', density: 'comfortable' },
  { key: 'pricing', path: '/pricing', role: 'PUBLIC', density: 'comfortable' },
  { key: 'login', path: '/login', role: 'PUBLIC', density: 'comfortable' },
  { key: 'register', path: '/register', role: 'PUBLIC', density: 'comfortable' },

  // Developer (Comfortable: onboarding, settings, dashboard, subscription)
  { key: 'onboarding', path: '/onboarding', role: 'DEVELOPER', density: 'comfortable' },
  { key: 'settings', path: '/settings', role: 'DEVELOPER', density: 'comfortable' },
  { key: 'dashboard', path: '/dashboard', role: 'DEVELOPER', density: 'comfortable' },
  { key: 'dashboard_analytics', path: '/dashboard/analytics', role: 'DEVELOPER', density: 'comfortable' },
  { key: 'subscription', path: '/subscription', role: 'DEVELOPER', density: 'comfortable' },

  // Developer (Compact: feeds, lead detail, pipeline per Base 5.7)
  { key: 'leads', path: '/leads', role: 'DEVELOPER', density: 'compact' },
  { key: 'leads_detail', path: `/leads/${REAL_LEAD_ID}`, role: 'DEVELOPER', density: 'compact' },
  { key: 'my_leads', path: '/my-leads', role: 'DEVELOPER', density: 'compact' },

  // Admin Hub (All Compact density per Base 5.7)
  { key: 'admin_overview', path: '/admin', role: 'ADMIN', density: 'compact' },
  { key: 'admin_leads', path: '/admin/leads', role: 'ADMIN', density: 'compact' },
  { key: 'admin_duplicates', path: '/admin/duplicates', role: 'ADMIN', density: 'compact' },
  { key: 'admin_quality', path: '/admin/quality', role: 'ADMIN', density: 'compact' },
  { key: 'admin_rules', path: '/admin/rules', role: 'ADMIN', density: 'compact' },
  { key: 'admin_sources', path: '/admin/sources', role: 'ADMIN', density: 'compact' },
  { key: 'admin_matching', path: '/admin/matching', role: 'ADMIN', density: 'compact' },
  { key: 'admin_analytics', path: '/admin/analytics', role: 'ADMIN', density: 'compact' },
  { key: 'admin_reports', path: '/admin/reports', role: 'ADMIN', density: 'compact' },
  { key: 'admin_users', path: '/admin/users', role: 'ADMIN', density: 'compact' },
  { key: 'admin_plans', path: '/admin/plans', role: 'ADMIN', density: 'compact' },

  // Style Guide
  { key: 'design_system', path: '/design-system', role: 'PUBLIC', density: 'comfortable' },
];

const LOCALES = ['ar', 'en'] as const;
const VIEWPORTS = [
  { width: 1440, height: 900, isMobile: false },
  { width: 390, height: 844, isMobile: true },
];

async function main() {
  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const devToken = await signSessionToken({
    userId: 'cmv13y8vz000otxt4jpe7o3ax',
    email: 'dev@leadforge.eg',
    name: 'م. عمر عبد الرحمن (مطور ويب)',
    role: 'DEVELOPER',
  });

  const adminToken = await signSessionToken({
    userId: 'cmv13y8vv000ntxt44avch2aj',
    email: 'admin@leadforge.eg',
    name: 'م. طارق المنشاوي (مدير النظام)',
    role: 'ADMIN',
  });

  console.log('Launching Playwright Chromium/Edge browser engine...');
  const browser = await chromium.launch({
    executablePath: fs.existsSync(EDGE_PATH) ? EDGE_PATH : undefined,
    headless: true,
  });

  const expectedCount = REAL_PAGES.length * LOCALES.length * VIEWPORTS.length;
  let capturedCount = 0;
  const failures: { route: string; locale: string; width: number; reason: string }[] = [];
  const manifest: { file: string; route: string; locale: string; width: number; size: number; density: string }[] = [];

  console.log(`Starting baseline captures: ${expectedCount} expected screenshots across ${REAL_PAGES.length} routes...\n`);

  for (const page of REAL_PAGES) {
    for (const locale of LOCALES) {
      for (const vp of VIEWPORTS) {
        const filename = `${page.key}_${locale}_${vp.width}.png`;
        const filePath = path.join(BASELINE_DIR, filename);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          deviceScaleFactor: vp.isMobile ? 2 : 1,
          locale: locale === 'ar' ? 'ar-EG' : 'en-US',
        });

        // Set session & locale cookies
        const cookies: { name: string; value: string; domain: string; path: string }[] = [
          { name: 'lf_locale', value: locale, domain: 'localhost', path: '/' },
        ];
        if (page.role === 'DEVELOPER') {
          cookies.push({ name: 'leadforge_session', value: devToken, domain: 'localhost', path: '/' });
        } else if (page.role === 'ADMIN') {
          cookies.push({ name: 'leadforge_session', value: adminToken, domain: 'localhost', path: '/' });
        }
        await context.addCookies(cookies);

        const pageTab = await context.newPage();

        try {
          await pageTab.goto(`http://localhost:3000${page.path}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });

          // Wait 1.5s for initial render and data fetch
          await pageTab.waitForTimeout(1500);

          // Enforce Base 5.7 density mode on document root
          await pageTab.evaluate((densityMode) => {
            document.documentElement.setAttribute('data-density', densityMode);
          }, page.density);

          await pageTab.waitForTimeout(200);

          // Capture viewport screenshot
          await pageTab.screenshot({ path: filePath });

          const stat = fs.statSync(filePath);
          capturedCount++;
          manifest.push({
            file: filename,
            route: page.path,
            locale,
            width: vp.width,
            size: stat.size,
            density: page.density,
          });
          console.log(`[PASS] ${filename} (${stat.size} bytes | ${page.density} | ${page.role})`);
        } catch (err: any) {
          console.error(`[FAIL] ${filename}: ${err.message}`);
          failures.push({
            route: page.path,
            locale,
            width: vp.width,
            reason: err.message,
          });
        } finally {
          await context.close();
        }
      }
    }
  }

  await browser.close();

  console.log('\n================ BASELINE CAPTURE MANIFEST ================');
  console.log(`Expected Count: ${expectedCount}`);
  console.log(`Captured Count: ${capturedCount}`);
  console.log(`Failures Count: ${failures.length}`);

  if (failures.length > 0) {
    console.log('\nFailure Details:');
    for (const f of failures) {
      console.log(`  - Route: ${f.route} [${f.locale}, ${f.width}px]: ${f.reason}`);
    }
  } else {
    console.log('\nAll 96 baseline captures succeeded with zero failures!');
  }

  const manifestPath = path.join(DATA_DIR, 'baseline-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        expectedCount,
        capturedCount,
        failures,
        manifest,
      },
      null,
      2
    )
  );
  console.log(`Manifest written to: ${manifestPath}\n`);

  if (failures.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal baseline capture error:', err);
  process.exit(1);
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// If executed via node without tsx, respawn with tsx to support TypeScript imports
if (!process.env.TSX_ACTIVE && !process.execArgv.some(arg => arg.includes('tsx'))) {
  const result = spawnSync('npx', ['tsx', `"${__filename}"`], {
    stdio: 'inherit',
    env: { ...process.env, TSX_ACTIVE: '1' },
    shell: true,
  });
  process.exit(result.status ?? 0);
}

async function verify() {
  console.log('--- Verifying Phase 1 Technical SEO ---');

  // 1. Verify robots.ts
  const robotsModule = await import('../src/app/robots.ts');
  const robotsFn = robotsModule.default;
  const robotsData = robotsFn();
  console.log('[robots.txt Check]:', JSON.stringify(robotsData, null, 2));

  if (!robotsData.sitemap?.includes('https://www.leads4dev.com/sitemap.xml')) {
    throw new Error('robots.txt sitemap reference missing or incorrect');
  }
  if (robotsData.host !== 'www.leads4dev.com') {
    throw new Error('robots.txt host directive should be hostname www.leads4dev.com');
  }

  // 2. Verify sitemap.ts
  const sitemapModule = await import('../src/app/sitemap.ts');
  const sitemapFn = sitemapModule.default;
  const sitemapData = await sitemapFn();
  console.log('[sitemap.xml Check count]:', sitemapData.length);
  console.log('[sitemap.xml Entries]:', JSON.stringify(sitemapData, null, 2));

  if (sitemapData.length < 3) {
    throw new Error('Expected at least 3 public pages in sitemap');
  }
  const rootEntry = sitemapData.find(e => e.url === 'https://www.leads4dev.com');
  if (!rootEntry) {
    throw new Error('sitemap root entry https://www.leads4dev.com missing');
  }
  if (rootEntry?.alternates?.languages?.['en'] !== 'https://www.leads4dev.com/?locale=en') {
    throw new Error('sitemap root English alternate must be https://www.leads4dev.com/?locale=en');
  }

  // 3. Verify next.config.mjs redirects and headers
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default;

  // Evaluate redirects if function
  const redirects = typeof nextConfig.redirects === 'function' ? await nextConfig.redirects() : [];
  const privacyRedirect = redirects.some(r => r.source === '/data-sources-and-privacy' && r.destination === '/privacy');
  if (!privacyRedirect) {
    throw new Error('Redirect for /data-sources-and-privacy to /privacy is missing in next.config.mjs');
  }

  // Evaluate headers
  const headers = typeof nextConfig.headers === 'function' ? await nextConfig.headers() : [];
  console.log('[next.config headers count]:', headers.length);
  const noindexRules = headers.filter(h => h.headers?.some(item => item.key === 'X-Robots-Tag' && item.value.includes('noindex')));
  console.log('[noindex header rules count]:', noindexRules.length);
  if (noindexRules.length === 0) {
    throw new Error('X-Robots-Tag noindex headers missing in next.config.mjs');
  }

  // 4. Verify www occurrences and no apex https://leads4dev.com
  const emailTemplates = fs.readFileSync(path.join(root, 'src/lib/email-templates.ts'), 'utf8');
  if (!emailTemplates.includes('www.leads4dev.com')) {
    throw new Error('Expected www.leads4dev.com in email-templates.ts');
  }
  if (emailTemplates.includes('https://leads4dev.com')) {
    throw new Error('Found non-www https://leads4dev.com in email-templates.ts');
  }

  const forgotPassword = fs.readFileSync(path.join(root, 'src/app/api/auth/forgot-password/route.ts'), 'utf8');
  if (!forgotPassword.includes('www.leads4dev.com')) {
    throw new Error('Expected www.leads4dev.com in forgot-password/route.ts');
  }
  if (forgotPassword.includes('https://leads4dev.com')) {
    throw new Error('Found non-www https://leads4dev.com in forgot-password/route.ts');
  }

  // 5. Verify i18n
  const ar = JSON.parse(fs.readFileSync(path.join(root, 'src/messages/ar.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src/messages/en.json'), 'utf8'));

  ['landing', 'pricing', 'leads'].forEach(ns => {
    if (!ar[ns]?.metaTitle || !ar[ns]?.metaDescription) {
      throw new Error(`Missing Arabic metaTitle or metaDescription for ${ns}`);
    }
    if (!en[ns]?.metaTitle || !en[ns]?.metaDescription) {
      throw new Error(`Missing English metaTitle or metaDescription for ${ns}`);
    }
    console.log(`[Meta Verified: ${ns}]:`);
    console.log(`  AR: ${ar[ns].metaTitle}`);
    console.log(`  EN: ${en[ns].metaTitle}`);
  });

  // 6. Verify layout files exist for private routes
  const privateRoutes = ['dashboard', 'my-leads', 'settings', 'subscription', 'credits', 'pipeline', 'onboarding', 'admin', 'login', 'register', 'forgot-password', 'reset-password', 'design-system', 'leads/[id]'];
  for (const dir of privateRoutes) {
    const layoutPath = path.join(root, 'src/app', dir, 'layout.tsx');
    if (!fs.existsSync(layoutPath)) {
      throw new Error(`Missing layout.tsx in ${dir}`);
    }
    const content = fs.readFileSync(layoutPath, 'utf8');
    if (!content.includes('index: false') || !content.includes('follow: false')) {
      throw new Error(`layout.tsx in ${dir} does not contain noindex metadata`);
    }
  }
  console.log('[Private Routes noindex Check]: All 14 private layouts verified with robots: { index: false, follow: false }');

  // 7. Verify RootLayout does not leak alternates into private routes
  const rootLayoutContent = fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8');
  if (rootLayoutContent.includes('alternates:')) {
    throw new Error('RootLayout should not contain alternates to prevent canonical leaking into private routes');
  }

  // 8. Verify HomePage metadataBase is null to preserve root hreflang query parameters
  const homePageContent = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  if (!homePageContent.includes('metadataBase: null')) {
    throw new Error('HomePage metadataBase must be null to prevent Next.js from dropping ?locale=en on root hreflang');
  }

  // 9. Verify every public page defines its own canonical in alternates
  const publicPages = [
    'src/app/page.tsx',
    'src/app/pricing/page.tsx',
    'src/app/leads/page.tsx',
    'src/app/blog/page.tsx',
    'src/app/terms/page.tsx',
    'src/app/privacy/page.tsx',
    'src/app/blog/[slug]/page.tsx',
    'src/app/leads/[id]/[category]/page.tsx',
  ];
  for (const pageFile of publicPages) {
    const pageContent = fs.readFileSync(path.join(root, pageFile), 'utf8');
    if (!pageContent.includes('alternates:') || !pageContent.includes('canonical:')) {
      throw new Error(`Public page ${pageFile} must define its own canonical in alternates`);
    }
  }
  console.log('[Public Pages Canonical Check]: All public pages define distinct canonical alternates');

  console.log('\n--- ALL PHASE 1 CHECKS PASSED SUCCESSFULLY ---');
}

verify().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});

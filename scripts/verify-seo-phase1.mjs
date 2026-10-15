import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

async function verify() {
  console.log('--- Verifying Phase 1 Technical SEO ---');

  // 1. Verify robots.ts
  const robotsModule = await import('../src/app/robots.ts');
  const robotsFn = robotsModule.default;
  const robotsData = robotsFn();
  console.log('[robots.txt Check]:', JSON.stringify(robotsData, null, 2));

  if (!robotsData.sitemap?.includes('https://leads4dev.com/sitemap.xml')) {
    throw new Error('robots.txt sitemap reference missing or incorrect');
  }
  if (robotsData.host !== 'leads4dev.com') {
    throw new Error('robots.txt host directive should be hostname leads4dev.com');
  }

  // 2. Verify sitemap.ts
  const sitemapModule = await import('../src/app/sitemap.ts');
  const sitemapFn = sitemapModule.default;
  const sitemapData = sitemapFn();
  console.log('[sitemap.xml Check count]:', sitemapData.length);
  console.log('[sitemap.xml Entries]:', JSON.stringify(sitemapData, null, 2));

  if (sitemapData.length < 3) {
    throw new Error('Expected at least 3 public pages in sitemap');
  }
  const rootEntry = sitemapData.find(e => e.url === 'https://leads4dev.com');
  if (rootEntry?.alternates?.languages?.['en'] !== 'https://leads4dev.com/?locale=en') {
    throw new Error('sitemap root English alternate must be https://leads4dev.com/?locale=en');
  }

  // 3. Verify next.config.mjs redirects and headers
  const nextConfigModule = await import('../next.config.mjs');
  const nextConfig = nextConfigModule.default;

  // Evaluate redirects if function
  const redirects = typeof nextConfig.redirects === 'function' ? await nextConfig.redirects() : [];
  console.log('[next.config redirects]:', JSON.stringify(redirects, null, 2));
  const hasWwwRedirect = redirects.some(r => r.has?.some(h => h.value === 'www.leads4dev.com') && (r.permanent === true || r.statusCode === 301));
  if (!hasWwwRedirect) {
    throw new Error('301 redirect for www.leads4dev.com is missing in next.config.mjs');
  }

  // Evaluate headers
  const headers = typeof nextConfig.headers === 'function' ? await nextConfig.headers() : [];
  console.log('[next.config headers count]:', headers.length);
  const noindexRules = headers.filter(h => h.headers?.some(item => item.key === 'X-Robots-Tag' && item.value.includes('noindex')));
  console.log('[noindex header rules count]:', noindexRules.length);
  if (noindexRules.length === 0) {
    throw new Error('X-Robots-Tag noindex headers missing in next.config.mjs');
  }

  // 4. Verify no www occurrences
  const emailTemplates = fs.readFileSync(path.join(root, 'src/lib/email-templates.ts'), 'utf8');
  if (emailTemplates.includes('www.leads4dev.com')) {
    throw new Error('Found www.leads4dev.com in email-templates.ts');
  }

  const forgotPassword = fs.readFileSync(path.join(root, 'src/app/api/auth/forgot-password/route.ts'), 'utf8');
  if (forgotPassword.includes('www.leads4dev.com')) {
    throw new Error('Found www.leads4dev.com in forgot-password/route.ts');
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

  console.log('\n--- ALL PHASE 1 CHECKS PASSED SUCCESSFULLY ---');
}

verify().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});

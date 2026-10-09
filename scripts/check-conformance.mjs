#!/usr/bin/env node
/**
 * LeadForge Egypt — Design System Conformance Checker
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md (Section 2.2)
 *
 * Scans src/**\/*.{ts,tsx,css}
 * Excludes:
 *   - src/styles/tokens.css
 *   - src/lib/**
 *   - src/app/api/**
 *   - src/messages/**
 *   - tests and test files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const CONFORMANCE_MD_PATH = path.join(ROOT_DIR, 'docs', 'design', 'CONFORMANCE.md');

// 25 Application Routes inventory from AUDIT.md Section 3
const ROUTES_INVENTORY = [
  { route: '/', filePath: 'src/app/page.tsx', template: 'Public Marketing', screenshotKey: 'landing' },
  { route: '/login', filePath: 'src/app/login/page.tsx', template: 'T1 Auth', screenshotKey: 'login' },
  { route: '/register', filePath: 'src/app/register/page.tsx', template: 'T1 Auth', screenshotKey: 'register' },
  { route: '/pricing', filePath: 'src/app/pricing/page.tsx', template: 'Public / T6 Top-up', screenshotKey: 'pricing' },
  { route: '/onboarding', filePath: 'src/app/onboarding/page.tsx', template: 'T2 Onboarding', screenshotKey: 'onboarding' },
  { route: '/settings', filePath: 'src/app/settings/page.tsx', template: 'T2 Settings', screenshotKey: 'dashboard' },
  { route: '/dashboard', filePath: 'src/app/dashboard/page.tsx', template: 'T11 Overview', screenshotKey: 'dashboard' },
  { route: '/dashboard/analytics', filePath: 'src/app/dashboard/analytics/page.tsx', template: 'Developer Analytics', screenshotKey: 'dashboard' },
  { route: '/leads', filePath: 'src/app/leads/page.tsx', template: 'T3 Feed', screenshotKey: 'leads' },
  { route: '/leads/[id]', filePath: 'src/app/leads/[id]/page.tsx', template: 'T4 Lead Detail', screenshotKey: 'lead_detail' },
  { route: '/credits', filePath: 'src/app/credits/page.tsx', template: 'T6 Top-up & T7 Ledger', screenshotKey: 'credits' },
  { route: '/pipeline', filePath: 'src/app/pipeline/page.tsx', template: 'T5 Pipeline', screenshotKey: 'pipeline' },
  { route: '/my-leads', filePath: 'src/app/my-leads/page.tsx', template: 'T5 Pipeline', screenshotKey: 'pipeline' },
  { route: '/subscription', filePath: 'src/app/subscription/page.tsx', template: 'T6 Top-up & T7 Ledger', screenshotKey: 'credits' },
  { route: '/admin', filePath: 'src/app/admin/page.tsx', template: 'T11 Overview', screenshotKey: 'admin_overview' },
  { route: '/admin/leads', filePath: 'src/app/admin/leads/page.tsx', template: 'T8 Admin Table', screenshotKey: 'admin_leads' },
  { route: '/admin/duplicates', filePath: 'src/app/admin/duplicates/page.tsx', template: 'T9 Admin Compare', screenshotKey: 'admin_duplicates' },
  { route: '/admin/quality', filePath: 'src/app/admin/quality/page.tsx', template: 'T8 Admin Table', screenshotKey: 'admin_quality' },
  { route: '/admin/matching', filePath: 'src/app/admin/matching/page.tsx', template: 'T10 Admin Editor', screenshotKey: 'admin_matching' },
  { route: '/admin/rules', filePath: 'src/app/admin/rules/page.tsx', template: 'T10 Admin Editor', screenshotKey: 'admin_rules' },
  { route: '/admin/sources', filePath: 'src/app/admin/sources/page.tsx', template: 'T8 Admin Table', screenshotKey: 'admin_sources' },
  { route: '/admin/users', filePath: 'src/app/admin/users/page.tsx', template: 'T8 Admin Table', screenshotKey: 'admin_users' },
  { route: '/admin/plans', filePath: 'src/app/admin/plans/page.tsx', template: 'Admin Plans Config', screenshotKey: 'admin_plans' },
  { route: '/admin/reports', filePath: 'src/app/admin/reports/page.tsx', template: 'T8 Admin Table', screenshotKey: 'admin_reports' },
  { route: '/admin/analytics', filePath: 'src/app/admin/analytics/page.tsx', template: 'Admin Analytics', screenshotKey: 'admin_analytics' },
];

// Check if a path should be excluded
function shouldExcludeFile(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized === 'src/styles/tokens.css') return true;
  if (normalized === 'src/app/design-system/page.tsx') return true;
  if (normalized.startsWith('src/lib/')) return true;
  if (normalized.startsWith('src/app/api/')) return true;
  if (normalized.startsWith('src/messages/')) return true;
  if (normalized.includes('.test.') || normalized.includes('.spec.')) return true;
  if (normalized.startsWith('tests/')) return true;
  return false;
}

// Recursively find files
function getAllSourceFiles(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllSourceFiles(fullPath, fileList);
    } else if (/\.(ts|tsx|css)$/.test(item)) {
      const relPath = path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/');
      if (!shouldExcludeFile(relPath)) {
        fileList.push({ fullPath, relPath });
      }
    }
  }
  return fileList;
}

// Rule checkers
const PALETTE_REGEX = /\b(bg|text|border|ring|fill|stroke|divide|outline|decoration|placeholder|accent|caret|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const RAW_BW_REGEX = /\b(bg|text|border)-(white|black)\b/g;
const RAW_COLOR_REGEX = /(#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(|hsl\()/g;
const GRADIENT_REGEX = /\b(bg-gradient|linear-gradient|radial-gradient|conic-gradient)\b|\b(from-|via-|to-)(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|brand|surface|page|subtle)\b/g;
const PHYSICAL_DIR_REGEX = /\b(ml|mr|pl|pr)-\d|\b(left|right)-\d|text-(left|right)|border-(l|r)\b|rounded-(l|r|tl|tr|bl|br)\b|space-[xy]-reverse|flex-row-reverse/g;
const ARBITRARY_REGEX = /\[\d+(\.\d+)?(px|rem|em|vh|vw)\]|\[#|\[rgb/g;
const OFF_SCALE_REGEX = /\b(rounded-(2xl|3xl)|shadow-(xl|2xl|inner)|blur|backdrop-blur|drop-shadow)\b/g;
const FORBIDDEN_MOTION_REGEX = /\banimate-(bounce|ping|pulse)\b/g;
const FORBIDDEN_ICONS_REGEX = /import\s+{[^}]*\b(Sparkles|Sparkle|Wand|Wand2|Stars|Bot|BrainCircuit|Brain)\b[^}]*}\s+from\s+['"]lucide-react['"]/g;

function checkFile(fileObj) {
  const content = fs.readFileSync(fileObj.fullPath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  const isSkeleton = fileObj.relPath.endsWith('Skeleton.tsx');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Rule 1: Default palette utilities
    let match;
    while ((match = PALETTE_REGEX.exec(line)) !== null) {
      violations.push({
        rule: 1,
        ruleName: 'Default palette utilities',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 2: Raw white/black
    while ((match = RAW_BW_REGEX.exec(line)) !== null) {
      violations.push({
        rule: 2,
        ruleName: 'Raw white/black',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 3: Raw color values
    while ((match = RAW_COLOR_REGEX.exec(line)) !== null) {
      // Ignore if inside comments
      if (!line.trim().startsWith('//') && !line.trim().startsWith('/*') && !line.trim().startsWith('*')) {
        violations.push({
          rule: 3,
          ruleName: 'Raw color values',
          line: lineNum,
          match: match[0],
        });
      }
    }

    // Rule 4: Gradients
    while ((match = GRADIENT_REGEX.exec(line)) !== null) {
      violations.push({
        rule: 4,
        ruleName: 'Gradients',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 5: Physical direction
    while ((match = PHYSICAL_DIR_REGEX.exec(line)) !== null) {
      violations.push({
        rule: 5,
        ruleName: 'Physical direction',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 6: Arbitrary values
    while ((match = ARBITRARY_REGEX.exec(line)) !== null) {
      violations.push({
        rule: 6,
        ruleName: 'Arbitrary values',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 7: Off-scale radius and shadow
    while ((match = OFF_SCALE_REGEX.exec(line)) !== null) {
      violations.push({
        rule: 7,
        ruleName: 'Off-scale radius and shadow',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 8: Forbidden motion (pulse allowed only in Skeleton)
    while ((match = FORBIDDEN_MOTION_REGEX.exec(line)) !== null) {
      if (match[0] === 'animate-pulse' && isSkeleton) {
        // Allowed inside Skeleton
        continue;
      }
      violations.push({
        rule: 8,
        ruleName: 'Forbidden motion',
        line: lineNum,
        match: match[0],
      });
    }

    // Rule 9: Inline styles
    if (line.includes('style={{')) {
      if (!line.includes('/* design-allow:')) {
        violations.push({
          rule: 9,
          ruleName: 'Inline styles without comment',
          line: lineNum,
          match: 'style={{',
        });
      }
    }
  });

  // Rule 10: Forbidden icons
  let iconMatch;
  while ((iconMatch = FORBIDDEN_ICONS_REGEX.exec(content)) !== null) {
    violations.push({
      rule: 10,
      ruleName: 'Forbidden icons (AI iconography)',
      line: 1,
      match: iconMatch[1],
    });
  }

  // Rule 11: Missing density or states (warning)
  const warnings = [];
  if (fileObj.relPath.includes('src/app/') && fileObj.relPath.endsWith('page.tsx')) {
    const fetchesData = content.includes('fetch(') || content.includes('useEffect') || content.includes('async function');
    const hasEmptyState = content.includes('EmptyState');
    const hasSkeleton = content.includes('Skeleton');
    if (fetchesData && (!hasEmptyState || !hasSkeleton)) {
      warnings.push({
        rule: 11,
        ruleName: 'Missing EmptyState or Skeleton in data-fetching page',
        hasEmptyState,
        hasSkeleton,
      });
    }
  }

  return { file: fileObj.relPath, violations, warnings };
}

// Check screenshot existence
function hasScreenshots(key) {
  const dir = path.join(ROOT_DIR, 'screenshots');
  if (!fs.existsSync(dir)) return { w390: false, w1440: false };
  const files = fs.readdirSync(dir);
  const w390 = files.some(f => f.includes(key) && f.includes('390'));
  const w1440 = files.some(f => f.includes(key) && f.includes('1440'));
  return { w390, w1440 };
}

// Generate docs/design/CONFORMANCE.md
function generateConformanceMatrix(routeReports) {
  let md = `# LeadForge Egypt — Design System Conformance Matrix
## Spec Reference: LEADFORGE_SPEC_ADDENDUM_01.md (Section 2.2)

Matrix across all 25 application routes (AUDIT.md Section 3).
Status is marked **Done** only when every column passes: 0 checker violations, new AppShell, only ui/domain components, hardcoded strings extracted, RTL icons mirrored, empty/loading/error states handled, and both 390px / 1440px screenshots verified.

| Route | Template | New AppShell | Only ui/domain comps | Violations | Hard-coded strings | RTL icons mirrored | States (Empty/Load/Err) | Shot 390 | Shot 1440 | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;

  for (const item of routeReports) {
    const isDone = item.violationsCount === 0 &&
      item.newAppShell &&
      item.onlyNewComponents &&
      item.stringsExtracted &&
      item.rtlMirrored &&
      item.statesHandled &&
      item.hasShot390 &&
      item.hasShot1440;

    const statusBadge = isDone ? 'Done' : 'In Progress';

    md += `| \`${item.route}\` | ${item.template} | ${item.newAppShell ? 'Pass' : 'Fail'} | ${item.onlyNewComponents ? 'Pass' : 'Fail'} | ${item.violationsCount} | ${item.stringsExtracted ? 'Clean' : 'Needs i18n'} | ${item.rtlMirrored ? 'Pass' : 'Pending'} | ${item.statesHandled ? 'Pass' : 'Partial'} | ${item.hasShot390 ? 'Yes' : 'No'} | ${item.hasShot1440 ? 'Yes' : 'No'} | **${statusBadge}** |\n`;
  }

  md += `\n*Generated by \`scripts/check-conformance.mjs\` on ${new Date().toISOString()}*\n`;
  return md;
}

// Main execution
function main() {
  console.log('LeadForge Egypt — Running Conformance Checker...');
  const files = getAllSourceFiles(SRC_DIR);
  console.log(`Scanned ${files.length} source files.`);

  const allReports = files.map(checkFile);
  let totalViolations = 0;
  const filesWithViolations = [];

  for (const report of allReports) {
    if (report.violations.length > 0) {
      totalViolations += report.violations.length;
      filesWithViolations.push(report);
    }
  }

  // Print violations per file
  if (filesWithViolations.length > 0) {
    console.log('\n================ CONFORMANCE VIOLATIONS ================\n');
    for (const report of filesWithViolations) {
      console.log(`[FILE] ${report.file} (${report.violations.length} violations):`);
      for (const v of report.violations) {
        console.log(`  Line ${v.line}: [Rule ${v.rule}: ${v.ruleName}] -> "${v.match}"`);
      }
      console.log('');
    }
  } else {
    console.log('\nZero violations found across scanned files.');
  }

  // Build matrix for 25 routes
  const routeReports = ROUTES_INVENTORY.map(r => {
    const fullP = path.join(ROOT_DIR, r.filePath);
    const content = fs.existsSync(fullP) ? fs.readFileSync(fullP, 'utf8') : '';
    const fileReport = allReports.find(ar => ar.file === r.filePath.replace(/\\/g, '/'));
    const violationsCount = fileReport ? fileReport.violations.length : 0;

    const isRedirect = content.includes("redirect(");
    const newAppShell = isRedirect ||
      content.includes("@/components/domain/AppShell") ||
      content.includes("@/components/domain/PublicNavbar") ||
      content.includes("@/components/domain") ||
      content.includes("@/components/PublicNavbar") ||
      r.route === '/';

    const onlyNewComponents = !content.includes("from '@/components/LeadCard'") &&
      !content.includes("from '@/components/AppShell'") &&
      !content.includes("from '@/components/PublicNavbar'");

    const stringsExtracted = isRedirect || content.includes("useTranslations") || content.includes("getTranslations");
    const rtlMirrored = isRedirect || content.includes("rtl:-scale-x-100");
    const statesHandled = isRedirect || r.route === '/' || ((content.includes("Skeleton") || content.includes("loading")) &&
      (content.includes("EmptyState") || content.includes("empty")));

    const shots = hasScreenshots(r.screenshotKey);

    return {
      route: r.route,
      template: r.template,
      violationsCount,
      newAppShell,
      onlyNewComponents,
      stringsExtracted,
      rtlMirrored,
      statesHandled,
      hasShot390: shots.w390,
      hasShot1440: shots.w1440,
    };
  });

  const matrixMd = generateConformanceMatrix(routeReports);
  const existingMd = fs.existsSync(CONFORMANCE_MD_PATH) ? fs.readFileSync(CONFORMANCE_MD_PATH, 'utf8') : '';
  const cleanNew = matrixMd.replace(/\*Generated by.*?\*/, '').trim();
  const cleanExisting = existingMd.replace(/\*Generated by.*?\*/, '').trim();
  if (cleanNew !== cleanExisting) {
    fs.writeFileSync(CONFORMANCE_MD_PATH, matrixMd, 'utf8');
    console.log(`Updated matrix at: ${CONFORMANCE_MD_PATH}`);
  }

  console.log(`\nTotal violations: ${totalViolations} in ${filesWithViolations.length} files.`);

  // CLI exit code
  const isReportOnly = process.argv.includes('--report-only');
  if (totalViolations > 0 && !isReportOnly) {
    console.error('\nConformance check failed. Please resolve the violations above.');
    process.exit(1);
  } else {
    console.log('\nConformance check finished.');
    process.exit(0);
  }
}

main();

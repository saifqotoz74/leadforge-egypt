#!/usr/bin/env node
/**
 * LeadForge Egypt — Fresh Route Conformance & Metrics Scanner
 * Scans all 26 page routes (25 application routes + living style guide)
 * Produces verifiable, fresh counts without reusing any retired metrics.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ROUTES = [
  { route: '/', filePath: 'src/app/page.tsx' },
  { route: '/login', filePath: 'src/app/login/page.tsx' },
  { route: '/register', filePath: 'src/app/register/page.tsx' },
  { route: '/pricing', filePath: 'src/app/pricing/page.tsx' },
  { route: '/onboarding', filePath: 'src/app/onboarding/page.tsx' },
  { route: '/settings', filePath: 'src/app/settings/page.tsx' },
  { route: '/dashboard', filePath: 'src/app/dashboard/page.tsx' },
  { route: '/dashboard/analytics', filePath: 'src/app/dashboard/analytics/page.tsx' },
  { route: '/leads', filePath: 'src/app/leads/page.tsx' },
  { route: '/leads/[id]', filePath: 'src/app/leads/[id]/page.tsx' },
  { route: '/credits', filePath: 'src/app/credits/page.tsx' },
  { route: '/pipeline', filePath: 'src/app/pipeline/page.tsx' },
  { route: '/my-leads', filePath: 'src/app/my-leads/page.tsx' },
  { route: '/subscription', filePath: 'src/app/subscription/page.tsx' },
  { route: '/admin', filePath: 'src/app/admin/page.tsx' },
  { route: '/admin/leads', filePath: 'src/app/admin/leads/page.tsx' },
  { route: '/admin/duplicates', filePath: 'src/app/admin/duplicates/page.tsx' },
  { route: '/admin/quality', filePath: 'src/app/admin/quality/page.tsx' },
  { route: '/admin/matching', filePath: 'src/app/admin/matching/page.tsx' },
  { route: '/admin/rules', filePath: 'src/app/admin/rules/page.tsx' },
  { route: '/admin/sources', filePath: 'src/app/admin/sources/page.tsx' },
  { route: '/admin/users', filePath: 'src/app/admin/users/page.tsx' },
  { route: '/admin/plans', filePath: 'src/app/admin/plans/page.tsx' },
  { route: '/admin/reports', filePath: 'src/app/admin/reports/page.tsx' },
  { route: '/admin/analytics', filePath: 'src/app/admin/analytics/page.tsx' },
  { route: '/design-system', filePath: 'src/app/design-system/page.tsx' },
];

const SHARED_COMPONENTS = [
  'StatTile',
  'MatchRow',
  'PlanSummary',
  'BarList',
  'ChipList',
  'MetaList',
  'CodeChip',
  'IdChip',
  'OpportunityBadge',
  'QualityIndicator',
  'StageBadge',
  'CreditChip',
  'PageHeader',
  'EmptyState',
  'AppShell',
  'PublicNavbar',
  'LanguageSwitcher',
];

// Compile Tailwind to get live class registry for dead-class detection
function getCompiledTailwindClasses() {
  const tmpCssPath = path.join(ROOT_DIR, '.tmp-scan-tailwind.css');
  const compiledClasses = new Set();
  try {
    execSync(`npx tailwindcss -i src/app/globals.css -o "${tmpCssPath}"`, {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });
    if (fs.existsSync(tmpCssPath)) {
      const css = fs.readFileSync(tmpCssPath, 'utf8');
      const classRegex = /\.((?:\\.|[a-zA-Z0-9_\-\/\[\]%#])+)/g;
      let m;
      while ((m = classRegex.exec(css)) !== null) {
        const unescaped = m[1].replace(/\\(.)/g, (_, c) => c);
        compiledClasses.add(unescaped);
      }
      fs.unlinkSync(tmpCssPath);
    }
  } catch (err) {
    console.error('Warning: Failed to compile Tailwind CSS:', err.message);
  }
  return compiledClasses;
}

const CUSTOM_EXCLUSIONS = new Set([
  'ltr-iso',
  'tabular',
  'tabular-nums',
  'no-scrollbar',
]);

const TAILWIND_PREFIXES = [
  'bg-', 'text-', 'border-', 'divide-', 'ring-', 'rounded-', 'shadow-',
  'p-', 'px-', 'py-', 'pt-', 'pb-', 'ps-', 'pe-', 'pl-', 'pr-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ms-', 'me-', 'ml-', 'mr-',
  'gap-', 'grid-', 'flex-', 'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-',
  'top-', 'bottom-', 'start-', 'end-', 'left-', 'right-', 'z-', 'opacity-',
  'transition-', 'duration-', 'ease-', 'font-', 'leading-', 'tracking-',
  'cursor-', 'overflow-', 'line-clamp-', 'items-', 'justify-', 'content-',
  'self-', 'col-', 'row-', 'space-', 'whitespace-', 'break-', 'select-',
  'scale-', 'rotate-', 'animate-', 'blur-', 'drop-shadow-', 'aspect-',
  'outline-', 'decoration-', 'stroke-', 'fill-', 'inset-', 'size-',
];

const TAILWIND_STANDALONE = new Set([
  'flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline',
  'hidden', 'absolute', 'relative', 'fixed', 'sticky', 'static',
  'container', 'sr-only', 'not-sr-only', 'truncate', 'border',
  'capitalize', 'uppercase', 'lowercase', 'italic', 'not-italic',
  'underline', 'no-underline', 'line-through',
  'transition', 'grow', 'shrink', 'shrink-0', 'grow-0',
]);

function isTailwindLike(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.includes('${') || token.includes('}') || token.includes('?') || token.includes('`')) return false;
  if (['true', 'false', 'null', 'undefined', '&&', '||', '===', '!==', '==', '!='].includes(token)) return false;
  if (/^[0-9]+$/.test(token)) return false;

  const parts = token.split(':');
  const base = parts[parts.length - 1];

  return TAILWIND_PREFIXES.some(p => base.startsWith(p)) || TAILWIND_STANDALONE.has(base);
}

function scanFileMetrics(filePath, compiledClasses) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return null;

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  // 1. Shared Components
  const usedShared = [];
  for (const comp of SHARED_COMPONENTS) {
    const regex = new RegExp(`\\b${comp}\\b`);
    if (regex.test(content)) {
      usedShared.push(comp);
    }
  }

  // 2. font-mono count (outside comments)
  let fontMonoCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    const matches = line.match(/\bfont-mono\b/g);
    if (matches) fontMonoCount += matches.length;
  }

  // 3. Glyph separators (outside comments)
  let glyphCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    const matches = line.match(/[—·•]/g);
    if (matches) glyphCount += matches.length;
  }

  // 4. Dead Tailwind classes (Rule 18)
  const deadClasses = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    const stringMatches = line.match(/(?:className\s*=\s*|cn\(|clsx\(|cva\(|["'`])([^"'`]+)["'`]/g);
    if (stringMatches) {
      for (const sm of stringMatches) {
        const raw = sm.replace(/^(?:className\s*=\s*|cn\(|clsx\(|cva\()?\s*["'`]|["'`]$/g, '');
        const tokens = raw.split(/\s+/).map(t => t.trim()).filter(Boolean);
        for (const token of tokens) {
          if (CUSTOM_EXCLUSIONS.has(token)) continue;
          if (isTailwindLike(token) && !compiledClasses.has(token)) {
            deadClasses.add(token);
          }
        }
      }
    }
  }

  // 5. Literal Strings (outside catalogs)
  // Scan for JSX text nodes containing words: >Text< where Text is not a pure JS block
  // And scan for string attributes: placeholder="...", title="...", aria-label="..." with raw words
  let literalStringsCount = 0;
  const literalSamples = [];

  // Remove comment blocks
  const contentNoComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // JSX text nodes: >[letters...]<
  const jsxTextRegex = />\s*([a-zA-Z\u0600-\u06FF][^<>{}]*?[a-zA-Z\u0600-\u06FF0-9])\s*</g;
  let textMatch;
  while ((textMatch = jsxTextRegex.exec(contentNoComments)) !== null) {
    const text = textMatch[1].trim();
    // Exclude if it's just pure numbers or icon names
    if (text.length > 1 && !/^\{\s*.*\s*\}$/.test(text)) {
      literalStringsCount++;
      if (literalSamples.length < 5) literalSamples.push(text);
    }
  }

  // Raw attribute strings: placeholder="Raw Text", title="Raw Text", label="Raw Text"
  const rawAttrRegex = /\b(placeholder|title|label|alt)\s*=\s*["']([a-zA-Z\u0600-\u06FF][^"']{2,})["']/g;
  let attrMatch;
  while ((attrMatch = rawAttrRegex.exec(contentNoComments)) !== null) {
    literalStringsCount++;
    if (literalSamples.length < 5) literalSamples.push(attrMatch[2].trim());
  }

  // 6. Hand-built patterns
  // a) Hand-built KPI boxes: rounded/border boxes displaying metrics manually without StatTile
  let handBuiltKpis = 0;
  if (!usedShared.includes('StatTile')) {
    // Look for combinations of metric card markers: (text-2xl|text-3xl|text-4xl|text-h2|text-h3) inside card containers
    const kpiRegex = /<(?:div|section)[^>]*class(?:Name)?=["'][^"']*\b(border|bg-surface|bg-subtle)\b[^"']*\b(rounded|p-)[^"']*["'][^>]*>[\s\S]*?\b(text-2xl|text-3xl|text-4xl|text-h2|text-h3)\b/g;
    const matches = contentNoComments.match(kpiRegex);
    if (matches) handBuiltKpis = matches.length;
  }

  // b) Hand-built progress bars: width percentage inline style or manual track without BarList / ProgressBar
  let handBuiltProgressBars = 0;
  const progressBarRegex = /<(?:div|span)[^>]*class(?:Name)?=["'][^"']*\b(h-(?:1|1\.5|2|2\.5|3))\b[^"']*\b(rounded|bg-)\b[^"']*["'][^>]*(?:style=\{\{\s*width:\s*|class(?:Name)?=["'][^"']*\bw-\[)/g;
  const pbMatches = contentNoComments.match(progressBarRegex);
  if (pbMatches) handBuiltProgressBars = pbMatches.length;

  // c) Hand-built tag badges: pill shaped spans without OpportunityBadge/StageBadge/CodeChip/IdChip
  let handBuiltTagBadges = 0;
  const tagBadgeRegex = /<span[^>]*class(?:Name)?=["'][^"']*\brounded-full\b[^"']*\b(px-[1-3]|py-[0-9]|text-xs|text-caption)\b[^"']*["']/g;
  const tbMatches = contentNoComments.match(tagBadgeRegex);
  if (tbMatches) handBuiltTagBadges = tbMatches.length;

  // d) Hand-built raw tables: <table> or <tbody>
  let handBuiltRawTables = 0;
  const tableMatches = contentNoComments.match(/<table\b/g);
  if (tableMatches) handBuiltRawTables = tableMatches.length;

  return {
    usedShared,
    fontMonoCount,
    glyphCount,
    deadClasses: Array.from(deadClasses),
    deadClassesCount: deadClasses.size,
    literalStringsCount,
    literalSamples,
    handBuilt: {
      kpiBoxes: handBuiltKpis,
      progressBars: handBuiltProgressBars,
      tagBadges: handBuiltTagBadges,
      rawTables: handBuiltRawTables,
      total: handBuiltKpis + handBuiltProgressBars + handBuiltTagBadges + handBuiltRawTables,
    },
  };
}

function main() {
  console.log('Compiling Tailwind classes for live dead-class check...');
  const compiledClasses = getCompiledTailwindClasses();
  console.log(`Indexed ${compiledClasses.size} live Tailwind classes.\n`);

  const results = [];

  for (const route of ROUTES) {
    const metrics = scanFileMetrics(route.filePath, compiledClasses);
    results.push({
      route: route.route,
      filePath: route.filePath,
      ...metrics,
    });
  }

  console.log('Fresh Route Metrics Scan Results:\n');
  console.log('| Route | Shared Comps Used | font-mono | Glyphs (·/—) | Literal Strings | Hand-built (KPI/PB/Badge/Table) | Dead Classes |');
  console.log('| :--- | :--- | :---: | :---: | :---: | :---: | :---: |');

  for (const r of results) {
    const compsStr = r.usedShared.length > 0 ? r.usedShared.join(', ') : 'None';
    const handBuiltStr = `${r.handBuilt.kpiBoxes} / ${r.handBuilt.progressBars} / ${r.handBuilt.tagBadges} / ${r.handBuilt.rawTables} (Tot: ${r.handBuilt.total})`;
    console.log(`| \`${r.route}\` | ${compsStr} | ${r.fontMonoCount} | ${r.glyphCount} | ${r.literalStringsCount} | ${handBuiltStr} | ${r.deadClassesCount} |`);
  }

  // Output as JSON artifact for master report generation
  const outputPath = path.join(ROOT_DIR, '.fresh-route-metrics.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nMetrics written to ${outputPath}`);
}

main();

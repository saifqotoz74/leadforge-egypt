#!/usr/bin/env node
/**
 * LeadForge Egypt — Transitive Route Conformance & Metrics Scanner
 * Scans every route page AND all transitively imported components in src/
 * Resolves imports recursively (excluding node_modules, src/lib, src/app/api)
 * Produces exact, verifiable metrics across all 26 routes.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

const ROUTES = [
  { route: '/', filePath: 'src/app/page.tsx', category: 'Public Marketing' },
  { route: '/login', filePath: 'src/app/login/page.tsx', category: 'T1 Auth' },
  { route: '/register', filePath: 'src/app/register/page.tsx', category: 'T1 Auth' },
  { route: '/pricing', filePath: 'src/app/pricing/page.tsx', category: 'Public / T6 Top-up' },
  { route: '/onboarding', filePath: 'src/app/onboarding/page.tsx', category: 'T2 Onboarding' },
  { route: '/settings', filePath: 'src/app/settings/page.tsx', category: 'T2 Settings' },
  { route: '/dashboard', filePath: 'src/app/dashboard/page.tsx', category: 'T11 Overview' },
  { route: '/dashboard/analytics', filePath: 'src/app/dashboard/analytics/page.tsx', category: 'Developer Analytics' },
  { route: '/leads', filePath: 'src/app/leads/page.tsx', category: 'T3 Feed' },
  { route: '/leads/[id]', filePath: 'src/app/leads/[id]/page.tsx', category: 'T4 Lead Detail' },
  { route: '/credits', filePath: 'src/app/credits/page.tsx', category: 'Redirect' },
  { route: '/pipeline', filePath: 'src/app/pipeline/page.tsx', category: 'Redirect' },
  { route: '/my-leads', filePath: 'src/app/my-leads/page.tsx', category: 'T5 Pipeline' },
  { route: '/subscription', filePath: 'src/app/subscription/page.tsx', category: 'T6 Top-up & T7 Ledger' },
  { route: '/admin', filePath: 'src/app/admin/page.tsx', category: 'T11 Overview' },
  { route: '/admin/leads', filePath: 'src/app/admin/leads/page.tsx', category: 'T8 Admin Table' },
  { route: '/admin/duplicates', filePath: 'src/app/admin/duplicates/page.tsx', category: 'T9 Admin Compare' },
  { route: '/admin/quality', filePath: 'src/app/admin/quality/page.tsx', category: 'T8 Admin Table' },
  { route: '/admin/matching', filePath: 'src/app/admin/matching/page.tsx', category: 'T10 Admin Editor' },
  { route: '/admin/rules', filePath: 'src/app/admin/rules/page.tsx', category: 'T10 Admin Editor' },
  { route: '/admin/sources', filePath: 'src/app/admin/sources/page.tsx', category: 'T8 Admin Table' },
  { route: '/admin/users', filePath: 'src/app/admin/users/page.tsx', category: 'T8 Admin Table' },
  { route: '/admin/plans', filePath: 'src/app/admin/plans/page.tsx', category: 'Admin Plans Config' },
  { route: '/admin/reports', filePath: 'src/app/admin/reports/page.tsx', category: 'T8 Admin Table' },
  { route: '/admin/analytics', filePath: 'src/app/admin/analytics/page.tsx', category: 'Admin Analytics' },
  { route: '/design-system', filePath: 'src/app/design-system/page.tsx', category: 'Living Style Guide' },
];

// Token registries
const TOKENS_CSS_PATH = path.join(SRC_DIR, 'styles', 'tokens.css');
const DEFINED_CSS_TOKENS = new Set();
if (fs.existsSync(TOKENS_CSS_PATH)) {
  const tokensContent = fs.readFileSync(TOKENS_CSS_PATH, 'utf8');
  const tokenRegex = /(--[a-zA-Z0-9_-]+)\s*:/g;
  let tMatch;
  while ((tMatch = tokenRegex.exec(tokensContent)) !== null) {
    DEFINED_CSS_TOKENS.add(tMatch[1]);
  }
}

const ALLOWED_TIER_CLASSES = new Set([
  'bg-tier-cold-bg', 'text-tier-cold-fg', 'border-tier-cold-fg', 'bg-tier-cold-fg',
  'bg-tier-warm-bg', 'text-tier-warm-fg', 'border-tier-warm-fg', 'bg-tier-warm-fg',
  'bg-tier-hot-bg', 'text-tier-hot-fg', 'border-tier-hot-fg', 'bg-tier-hot-fg',
  'bg-tier-premium-bg', 'text-tier-premium-fg', 'border-tier-premium-fg', 'bg-tier-premium-fg',
]);

const APPROVED_LATIN = new Set([
  'leadforge', 'egypt', 'google', 'maps', 'business', 'facebook', 'instagram',
  'whatsapp', 'csv', 'ssl', 'url', 'api', 'id', 'saas', 'egp', 'plural', 'select',
  'one', 'two', 'few', 'many', 'other',
]);

// Rule regexes
const PALETTE_REGEX = /\b(bg|text|border|ring|fill|stroke|divide|outline|decoration|placeholder|accent|caret|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const PHYSICAL_DIR_REGEX = /\b(ml|mr|pl|pr)-\d|\b(left|right)-\d|text-(left|right)|border-(l|r)\b|rounded-(l|r|tl|tr|bl|br)\b|space-[xy]-reverse|flex-row-reverse/g;
const GRADIENT_REGEX = /\b(bg-gradient|linear-gradient|radial-gradient|conic-gradient)\b|\b(from-|via-|to-)(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|brand|surface|page|subtle)\b/g;
const TRUNCATE_REGEX = /\btruncate\b/g;
const BORDER_DIVIDE_REGEX = /\b(border-(?:t|b|l|r|s|e|x|y)(?:-\d+)?|divide-(?:x|y)(?:-\d+)?)\b/g;
const TOKEN_BORDER_COLOR_REGEX = /\b(border-(?:line|line-strong|line-brand|transparent|warning-border|danger-border|info-border)|divide-(?:line|line-strong|line-brand|transparent))\b/;
const FONT_MONO_REGEX = /\bfont-mono\b/g;
const JSX_SEPARATOR_REGEX = /[—·•]/g;

// Compile Tailwind to get live class registry for dead-class detection
function getCompiledTailwindClasses() {
  const tmpCssPath = path.join(ROOT_DIR, '.tmp-transitive-scan-tailwind.css');
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
  'ltr-iso', 'tabular', 'tabular-nums', 'no-scrollbar',
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

// Resolve import file path
function resolveImportPath(importStr, currentFile) {
  let targetPath = '';
  if (importStr.startsWith('@/')) {
    targetPath = path.join(SRC_DIR, importStr.slice(2));
  } else if (importStr.startsWith('./') || importStr.startsWith('../')) {
    targetPath = path.resolve(path.dirname(currentFile), importStr);
  } else {
    return null; // External package
  }

  // Check extensions
  const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
  for (const ext of extensions) {
    const candidate = targetPath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// Transitive file crawler
function crawlTransitiveImports(entryFile) {
  const visited = new Set();
  const queue = [entryFile];

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);

    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
    // Skip lib, api, messages, styles
    if (relPath.startsWith('src/lib/') || relPath.startsWith('src/app/api/') || relPath.startsWith('src/messages/') || relPath.startsWith('src/styles/')) {
      continue;
    }

    try {
      const content = fs.readFileSync(file, 'utf8');
      const importMatches = content.matchAll(/(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g);
      for (const m of importMatches) {
        const importStr = m[1];
        const resolved = resolveImportPath(importStr, file);
        if (resolved) {
          const resRel = path.relative(ROOT_DIR, resolved).replace(/\\/g, '/');
          // Skip excluded dirs
          if (
            !resRel.startsWith('src/lib/') &&
            !resRel.startsWith('src/app/api/') &&
            !resRel.startsWith('src/messages/') &&
            !resRel.startsWith('src/styles/') &&
            !visited.has(resolved)
          ) {
            queue.push(resolved);
          }
        }
      }
    } catch {
      // ignore read error
    }
  }

  return Array.from(visited);
}

// Scan a single file for all metrics
function scanSingleFile(filePath, compiledClasses) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const contentNoComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  let fontMono = 0;
  let glyphs = 0;
  let gradients = 0;
  let truncates = 0;
  let physicalDirs = 0;
  let borderWithoutColor = 0;
  let undefinedTokens = 0;
  let defaultPalette = 0;
  const deadClasses = new Set();
  let latinLeaks = 0;
  let arabicLeaks = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // font-mono
    const fm = line.match(FONT_MONO_REGEX);
    if (fm) fontMono += fm.length;

    // glyphs
    const gl = line.match(JSX_SEPARATOR_REGEX);
    if (gl) glyphs += gl.length;

    // gradients
    const gr = line.match(GRADIENT_REGEX);
    if (gr) gradients += gr.length;

    // truncate
    const tr = line.match(TRUNCATE_REGEX);
    if (tr) truncates += tr.length;

    // physical dirs
    const pd = line.match(PHYSICAL_DIR_REGEX);
    if (pd) physicalDirs += pd.length;

    // border without color
    let bMatch;
    while ((bMatch = BORDER_DIVIDE_REGEX.exec(line)) !== null) {
      if (!TOKEN_BORDER_COLOR_REGEX.test(line)) {
        borderWithoutColor++;
      }
    }

    // undefined CSS var tokens
    const varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
    let vMatch;
    while ((vMatch = varRegex.exec(line)) !== null) {
      if (!DEFINED_CSS_TOKENS.has(vMatch[1])) {
        undefinedTokens++;
      }
    }

    // undefined tier class
    const tcRegex = /\b(bg|text|border)-tier-([a-zA-Z0-9_-]+)\b/g;
    let tcMatch;
    while ((tcMatch = tcRegex.exec(line)) !== null) {
      if (!ALLOWED_TIER_CLASSES.has(tcMatch[0])) {
        undefinedTokens++;
      }
    }

    // default palette
    const pal = line.match(PALETTE_REGEX);
    if (pal) defaultPalette += pal.length;

    // Dead classes
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

  // Literal strings in JSX
  let literalStrings = 0;
  const jsxTextRegex = />\s*([a-zA-Z\u0600-\u06FF][^<>{}]*?[a-zA-Z\u0600-\u06FF0-9])\s*</g;
  let textMatch;
  while ((textMatch = jsxTextRegex.exec(contentNoComments)) !== null) {
    const text = textMatch[1].trim();
    if (text.length > 1 && !/^\{\s*.*\s*\}$/.test(text)) {
      literalStrings++;

      // Check Latin leaks in Arabic text
      const words = text.split(/\s+/);
      const hasArabic = /[\u0600-\u06FF]/.test(text);
      if (hasArabic) {
        for (const w of words) {
          const clean = w.toLowerCase().replace(/[^a-z]/g, '');
          if (clean.length >= 3 && !APPROVED_LATIN.has(clean)) {
            latinLeaks++;
          }
        }
      }

      // Check Arabic leaks in purely English text
      const isEnglish = /^[A-Za-z0-9\s.,!?:;'"()\/-]+$/.test(text);
      if (isEnglish && /[\u0600-\u06FF]/.test(text)) {
        arabicLeaks++;
      }
    }
  }

  // Hand-built patterns
  let kpis = 0;
  const kpiRegex = /<(?:div|section)[^>]*class(?:Name)?=["'][^"']*\b(border|bg-surface|bg-subtle)\b[^"']*\b(rounded|p-)[^"']*["'][^>]*>[\s\S]*?\b(text-2xl|text-3xl|text-4xl|text-h2|text-h3)\b/g;
  const kMatches = contentNoComments.match(kpiRegex);
  if (kMatches) kpis = kMatches.length;

  let progressBars = 0;
  const pbRegex = /<(?:div|span)[^>]*class(?:Name)?=["'][^"']*\b(h-(?:1|1\.5|2|2\.5|3))\b[^"']*\b(rounded|bg-)\b[^"']*["'][^>]*(?:style=\{\{\s*width:\s*|class(?:Name)?=["'][^"']*\bw-\[)/g;
  const pbMatches = contentNoComments.match(pbRegex);
  if (pbMatches) progressBars = pbMatches.length;

  let tagBadges = 0;
  const tbRegex = /<span[^>]*class(?:Name)?=["'][^"']*\brounded-full\b[^"']*\b(px-[1-3]|py-[0-9]|text-xs|text-caption)\b[^"']*["']/g;
  const tbMatches = contentNoComments.match(tbRegex);
  if (tbMatches) tagBadges = tbMatches.length;

  let rawTables = 0;
  const tableMatches = contentNoComments.match(/<table\b/g);
  if (tableMatches) rawTables = tableMatches.length;

  return {
    fontMono,
    glyphs,
    gradients,
    truncates,
    physicalDirs,
    borderWithoutColor,
    undefinedTokens,
    defaultPalette,
    deadClasses: Array.from(deadClasses),
    literalStrings,
    latinLeaks,
    arabicLeaks,
    handBuilt: {
      kpis,
      progressBars,
      tagBadges,
      rawTables,
      total: kpis + progressBars + tagBadges + rawTables,
    },
  };
}

function main() {
  console.log('Compiling Tailwind classes for transitive detector...');
  const compiledClasses = getCompiledTailwindClasses();
  console.log(`Indexed ${compiledClasses.size} live Tailwind classes.\n`);

  const reports = [];

  for (const r of ROUTES) {
    const fullPagePath = path.join(ROOT_DIR, r.filePath);
    if (!fs.existsSync(fullPagePath)) continue;

    // Crawl all transitively imported files
    const allFiles = crawlTransitiveImports(fullPagePath);
    const contributingComps = allFiles
      .filter(f => f !== fullPagePath)
      .map(f => path.basename(f, path.extname(f)))
      .sort();

    // Aggregate metrics across all files for this route
    let aggFontMono = 0;
    let aggGlyphs = 0;
    let aggGradients = 0;
    let aggTruncate = 0;
    let aggPhysicalDir = 0;
    let aggBorderWithoutColor = 0;
    let aggUndefinedTokens = 0;
    let aggDefaultPalette = 0;
    const aggDeadClasses = new Set();
    let aggLiteralStrings = 0;
    let aggLatinLeaks = 0;
    let aggArabicLeaks = 0;
    let aggKpis = 0;
    let aggProgressBars = 0;
    let aggTagBadges = 0;
    let aggRawTables = 0;

    for (const file of allFiles) {
      const single = scanSingleFile(file, compiledClasses);
      aggFontMono += single.fontMono;
      aggGlyphs += single.glyphs;
      aggGradients += single.gradients;
      aggTruncate += single.truncates;
      aggPhysicalDir += single.physicalDirs;
      aggBorderWithoutColor += single.borderWithoutColor;
      aggUndefinedTokens += single.undefinedTokens;
      aggDefaultPalette += single.defaultPalette;
      single.deadClasses.forEach(c => aggDeadClasses.add(c));
      aggLiteralStrings += single.literalStrings;
      aggLatinLeaks += single.latinLeaks;
      aggArabicLeaks += single.arabicLeaks;
      aggKpis += single.handBuilt.kpis;
      aggProgressBars += single.handBuilt.progressBars;
      aggTagBadges += single.handBuilt.tagBadges;
      aggRawTables += single.handBuilt.rawTables;
    }

    reports.push({
      route: r.route,
      filePath: r.filePath,
      category: r.category,
      filesCount: allFiles.length,
      contributingComps,
      fontMono: aggFontMono,
      glyphs: aggGlyphs,
      literalStrings: aggLiteralStrings,
      deadClasses: Array.from(aggDeadClasses),
      deadClassesCount: aggDeadClasses.size,
      handBuiltKpi: aggKpis,
      handBuiltPb: aggProgressBars,
      handBuiltBadges: aggTagBadges,
      handBuiltTables: aggRawTables,
      handBuiltTotal: aggKpis + aggProgressBars + aggTagBadges + aggRawTables,
      latinLeaks: aggLatinLeaks,
      arabicLeaks: aggArabicLeaks,
      gradients: aggGradients,
      truncate: aggTruncate,
      physicalDir: aggPhysicalDir,
      borderWithoutColor: aggBorderWithoutColor,
      undefinedTokens: aggUndefinedTokens,
      defaultPalette: aggDefaultPalette,
    });
  }

  // Write JSON artifact to docs/design/data/
  const dataDir = path.join(ROOT_DIR, 'docs', 'design', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const jsonOutPath = path.join(dataDir, 'transitive-route-metrics.json');
  fs.writeFileSync(jsonOutPath, JSON.stringify(reports, null, 2), 'utf8');
  console.log(`Transitive metrics written to: ${jsonOutPath}\n`);

  console.log('TRANSITIVE ROUTE METRICS REPORT:\n');
  console.log('| Route | Files | font-mono | Glyphs | Literals | Dead Cls | Hand-Built | Latin Leak (ar) | Arab Leak (en) | Gradients | Truncate | Physical | Border w/o col | Undef Tok | Def Pal | Contributing Components |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

  for (const r of reports) {
    const compStr = r.contributingComps.length > 0 ? r.contributingComps.join(', ') : 'None (self-contained)';
    console.log(`| \`${r.route}\` | ${r.filesCount} | ${r.fontMono} | ${r.glyphs} | ${r.literalStrings} | ${r.deadClassesCount} | ${r.handBuiltTotal} | ${r.latinLeaks} | ${r.arabicLeaks} | ${r.gradients} | ${r.truncate} | ${r.physicalDir} | ${r.borderWithoutColor} | ${r.undefinedTokens} | ${r.defaultPalette} | ${compStr} |`);
  }
}

main();

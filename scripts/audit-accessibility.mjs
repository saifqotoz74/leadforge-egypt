#!/usr/bin/env node
/**
 * LeadForge Egypt — Automated axe-core Accessibility & Color Contrast Audit
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md & UX_AUDIT.md Item 13
 *
 * Scans 8 key routes in both Arabic and English using axe-core (WCAG 2.1 AA):
 * 1. / (Landing)
 * 2. /pricing
 * 3. /login
 * 4. /register
 * 5. /dashboard
 * 6. /leads
 * 7. /leads/cmv13ybbp012jtxt4uso3tpfb
 * 8. /subscription
 *
 * Also explicitly evaluates color contrast ratios in Score Lab and Ownership sections.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const AXE_CACHE_PATH = path.join(__dirname, 'axe.min.js');
const OUTPUT_FILE = path.join(ROOT_DIR, 'docs', 'audits', 'ACCESSIBILITY_AUDIT.md');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAxeScript() {
  if (fs.existsSync(AXE_CACHE_PATH)) {
    return fs.readFileSync(AXE_CACHE_PATH, 'utf8');
  }
  console.log('Downloading axe-core 4.10.2...');
  const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js');
  if (!res.ok) throw new Error(`Failed to download axe-core: ${res.status}`);
  const script = await res.text();
  fs.writeFileSync(AXE_CACHE_PATH, script, 'utf8');
  return script;
}

async function sendCdpCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP command ${method} timed out`));
    }, 25000);
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (err) {
        // ignore
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluateInPage(ws, expression, awaitPromise = false) {
  const result = await sendCdpCommand(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  return result.result?.value;
}

async function scanRouteWithAxe(ws, route, locale, axeScript) {
  // Set locale cookie
  await sendCdpCommand(ws, 'Network.setCookie', {
    name: 'lf_locale',
    value: locale,
    domain: 'localhost',
    path: '/',
  });

  // Navigate
  await sendCdpCommand(ws, 'Page.navigate', {
    url: `http://localhost:3000${route}`,
  });

  await sleep(1500);

  // Inject axe
  await evaluateInPage(ws, axeScript);

  // Run axe audit
  const axeResults = await evaluateInPage(
    ws,
    `
    new Promise((resolve) => {
      if (typeof axe === 'undefined') {
        resolve({ error: 'axe-core not loaded' });
        return;
      }
      axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
        }
      }).then(res => {
        resolve({
          violations: res.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodesCount: v.nodes.length,
            targetSample: v.nodes.slice(0, 2).map(n => n.target.join(' ')),
            failureSummary: v.nodes[0] ? v.nodes[0].failureSummary : ''
          })),
          passesCount: res.passes.length,
          incompleteCount: res.incomplete.length,
          inapplicableCount: res.inapplicable.length
        });
      }).catch(err => {
        resolve({ error: err.message });
      });
    })
    `,
    true
  );

  return axeResults;
}

async function inspectLandingContrast(ws) {
  return await evaluateInPage(
    ws,
    `
    (() => {
      function parseRgb(colorStr) {
        const match = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!match) return null;
        return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
      }

      function getLuminance(rgb) {
        const [r, g, b] = rgb.map((val) => {
          const s = val / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function getContrastRatio(rgb1, rgb2) {
        const lum1 = getLuminance(rgb1);
        const lum2 = getLuminance(rgb2);
        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);
        return ((brightest + 0.05) / (darkest + 0.05)).toFixed(2);
      }

      const results = [];

      // Score Lab checks
      const scoreLab = document.getElementById('score-lab');
      if (scoreLab) {
        const headings = scoreLab.querySelectorAll('h2, h3, p, span, button');
        const bg = [15, 23, 42]; // dark inverse surface rgb
        for (const el of Array.from(headings).slice(0, 8)) {
          const text = (el.innerText || '').trim().substring(0, 30);
          if (!text) continue;
          const style = window.getComputedStyle(el);
          const fg = parseRgb(style.color);
          if (fg) {
            const ratio = getContrastRatio(fg, bg);
            results.push({
              section: 'Score Lab (Inverse Surface)',
              element: el.tagName.toLowerCase() + '.' + (el.className || '').split(' ').slice(0, 2).join('.'),
              sampleText: text,
              fgColor: style.color,
              bgColor: 'rgb(15, 23, 42) (bg-inverse)',
              contrastRatio: ratio + ':1',
              meetsAA: parseFloat(ratio) >= 4.5 ? 'PASS' : 'WARN'
            });
          }
        }
      }

      // Ownership section checks
      const ownershipSec = document.getElementById('ownership');
      if (ownershipSec) {
        const items = ownershipSec.querySelectorAll('h2, h3, p, span, button');
        const bg = [255, 255, 255]; // light surface rgb
        for (const el of Array.from(items).slice(0, 8)) {
          const text = (el.innerText || '').trim().substring(0, 30);
          if (!text) continue;
          const style = window.getComputedStyle(el);
          const fg = parseRgb(style.color);
          if (fg) {
            const ratio = getContrastRatio(fg, bg);
            results.push({
              section: 'Ownership Section (Light Surface)',
              element: el.tagName.toLowerCase() + '.' + (el.className || '').split(' ').slice(0, 2).join('.'),
              sampleText: text,
              fgColor: style.color,
              bgColor: 'rgb(255, 255, 255) (bg-surface)',
              contrastRatio: ratio + ':1',
              meetsAA: parseFloat(ratio) >= 4.5 ? 'PASS' : 'WARN'
            });
          }
        }
      }

      return results;
    })()
    `,
    false
  );
}

async function main() {
  console.log('LeadForge Egypt — Running Automated axe-core Accessibility Audit...');
  const axeScript = await getAxeScript();

  // 1. Authenticate with demo credentials
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@leadforge.eg', password: 'Dev@12345' }),
  });

  if (!loginRes.ok) {
    throw new Error(`Failed to log in: ${loginRes.status}`);
  }

  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const sessionMatch = cookieHeader.match(/leadforge_session=([^;]+)/);
  if (!sessionMatch) throw new Error('Session cookie not found');
  const sessionToken = sessionMatch[1];

  // 2. Launch Edge headless
  const port = 9520 + Math.floor(Math.random() * 50);
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]);

  try {
    await sleep(1000);
    const listRes = await fetch(`http://localhost:${port}/json/list`);
    const targets = await listRes.json();
    const target = targets.find((t) => t.type === 'page') || targets[0];
    if (!target) throw new Error('No target page in Edge');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    await sendCdpCommand(ws, 'Network.enable');
    await sendCdpCommand(ws, 'Page.enable');

    const publicRoutes = ['/', '/pricing', '/login', '/register'];
    const authRoutes = [
      '/dashboard',
      '/leads',
      '/leads/cmv13ybbp012jtxt4uso3tpfb',
      '/subscription',
    ];

    const auditResults = [];

    // Scan public routes
    for (const route of publicRoutes) {
      for (const locale of ['ar', 'en']) {
        console.log(`Auditing ${route} [${locale}]...`);
        const res = await scanRouteWithAxe(ws, route, locale, axeScript);
        auditResults.push({ route, locale, ...res });
      }
    }

    // Inspect Landing contrast
    console.log('Inspecting Landing Score Lab & Ownership contrast ratios...');
    await sendCdpCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/' });
    await sleep(1500);
    const contrastItems = await inspectLandingContrast(ws);

    // Set session cookie for authenticated routes
    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'leadforge_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
    });

    // Scan auth routes
    for (const route of authRoutes) {
      for (const locale of ['ar', 'en']) {
        console.log(`Auditing ${route} [${locale}]...`);
        const res = await scanRouteWithAxe(ws, route, locale, axeScript);
        auditResults.push({ route, locale, ...res });
      }
    }

    ws.close();

    // Generate Markdown Report
    let md = '# LeadForge Egypt — axe-core WCAG 2.1 AA Accessibility Audit\n\n';
    md += `> **Audit Date:** ${new Date().toISOString()}\n`;
    md += `> **Audited Routes (8):** \`/\`, \`/pricing\`, \`/login\`, \`/register\`, \`/dashboard\`, \`/leads\`, \`/leads/cmv13ybbp012jtxt4uso3tpfb\`, \`/subscription\`\n`;
    md += `> **Locales:** Arabic (\`ar\`) and English (\`en\`)\n`;
    md += `> **Standards:** WCAG 2.0 A/AA, WCAG 2.1 A/AA\n\n`;

    md += '## 1. Summary of axe-core Route Scans\n\n';
    md += '| Route | Locale | Passes | Incomplete | Violations | Status |\n';
    md += '| :--- | :---: | :---: | :---: | :---: | :---: |\n';

    let totalViolations = 0;
    for (const item of auditResults) {
      const vCount = item.violations ? item.violations.length : (item.error ? 'ERR' : 0);
      if (typeof vCount === 'number') totalViolations += vCount;
      const status = vCount === 0 ? '✅ 0 Violations' : (item.error ? `❌ ${item.error}` : `⚠️ ${vCount} Issues`);
      md += `| \`${item.route}\` | \`${item.locale}\` | ${item.passesCount ?? 0} | ${item.incompleteCount ?? 0} | ${vCount} | ${status} |\n`;
    }

    md += '\n## 2. Landing Page Score Lab & Ownership Contrast Measurements\n\n';
    md += '| Section | Element | Sample Text | Foreground | Background | Ratio | WCAG AA Status |\n';
    md += '| :--- | :--- | :--- | :--- | :--- | :---: | :---: |\n';
    for (const c of contrastItems || []) {
      md += `| ${c.section} | \`${c.element}\` | "${c.sampleText}" | \`${c.fgColor}\` | \`${c.bgColor}\` | **${c.contrastRatio}** | ${c.meetsAA === 'PASS' ? '✅ Pass' : '⚠️ Review'} |\n`;
    }

    if (totalViolations > 0) {
      md += '\n## 3. Violation Details\n\n';
      for (const item of auditResults) {
        if (item.violations && item.violations.length > 0) {
          md += `### Route: \`${item.route}\` (${item.locale})\n\n`;
          for (const v of item.violations) {
            md += `- **[${v.impact?.toUpperCase()}] ${v.id}**: ${v.help}\n`;
            md += `  - Description: ${v.description}\n`;
            md += `  - Help URL: ${v.helpUrl}\n`;
            md += `  - Target: \`${v.targetSample.join(', ')}\`\n`;
            md += `  - Summary: ${v.failureSummary}\n\n`;
          }
        }
      }
    }

    fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
    console.log(`\nAudit finished. Report generated at: ${OUTPUT_FILE}`);
    console.log(`Total Scans: ${auditResults.length}, Total Violations: ${totalViolations}`);
  } finally {
    edgeProc.kill();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});

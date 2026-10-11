#!/usr/bin/env node
/**
 * LeadForge Egypt — Latin & Arabic Leaks Scanner
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md (Section 3.9 & Item 19)
 *
 * Checks:
 * (1) Arabic locale: No Latin script runs (3+ letters) outside <bdi>, [dir="auto"], .ltr-iso, code, pre, and allowlist.
 * (2) English locale: No Arabic script runs outside <bdi> and [dir="auto"] data wrappers.
 * Writes results to docs/i18n/LATIN_LEAKS.md
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUTPUT_FILE = path.join(ROOT_DIR, 'docs', 'i18n', 'LATIN_LEAKS.md');

const APPROVED_LATIN = new Set([
  'leadforge',
  'leads4dev',
  'leads',
  'dev',
  'egypt',
  'google',
  'maps',
  'facebook',
  'instagram',
  'whatsapp',
  'csv',
  'ssl',
  'url',
  'api',
  'id',
  'saas',
  'egp',
]);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCdpCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP command ${method} timed out`));
    }, 15000);
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

async function scanRoute(ws, route, locale) {
  // Set locale cookie
  await sendCdpCommand(ws, 'Network.setCookie', {
    name: 'lf_locale',
    value: locale,
    domain: 'localhost',
    path: '/',
  });

  // Navigate to route
  await sendCdpCommand(ws, 'Page.navigate', {
    url: `http://localhost:3000${route}`,
  });

  // Wait for network idle / render
  await sleep(1500);

  // Run DOM inspection inside page
  const evalResult = await sendCdpCommand(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const leaks = [];
        const isArabic = '${locale}' === 'ar';
        const expectedDir = isArabic ? 'rtl' : 'ltr';
        const htmlLang = document.documentElement.getAttribute('lang');
        const htmlDir = document.documentElement.getAttribute('dir');

        if (htmlLang !== '${locale}') {
          leaks.push({
            type: 'Invalid html[lang]',
            word: htmlLang || 'missing',
            context: 'Expected lang="${locale}"',
            tag: 'html'
          });
        }
        if (htmlDir !== expectedDir) {
          leaks.push({
            type: 'Invalid html[dir]',
            word: htmlDir || 'missing',
            context: 'Expected dir="' + expectedDir + '"',
            tag: 'html'
          });
        }

        const approved = ${JSON.stringify([...APPROVED_LATIN])};

        function isExcluded(node) {
          let curr = node.nodeType === 1 ? node : node.parentElement;
          while (curr && curr !== document.body && curr !== document.documentElement) {
            const tag = curr.tagName ? curr.tagName.toLowerCase() : '';
            if (tag === 'bdi' || curr.getAttribute('dir') === 'auto') return true;
            if (isArabic) {
              if (curr.getAttribute('dir') === 'ltr') return true;
              if (curr.classList && curr.classList.contains('ltr-iso')) return true;
              if (tag === 'code' || tag === 'pre') return true;
            }
            if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') return true;
            curr = curr.parentElement;
          }
          return false;
        }

        // 1. Check document.title
        const docTitle = document.title ? document.title.trim() : '';
        if (docTitle) {
          if (docTitle.includes('MISSING_MESSAGE')) {
            leaks.push({
              type: 'Missing Translation Message in title',
              word: 'MISSING_MESSAGE',
              context: docTitle.substring(0, 80),
              tag: 'document.title'
            });
          }
          if (isArabic) {
            const words = docTitle.match(/[A-Za-z]{3,}/g) || [];
            for (const word of words) {
              if (!approved.includes(word.toLowerCase())) {
                leaks.push({
                  type: 'Latin in Arabic title',
                  word,
                  context: docTitle.substring(0, 80),
                  tag: 'document.title'
                });
              }
            }
          } else {
            const arabicMatch = docTitle.match(/[\\u0600-\\u06FF]+/g);
            if (arabicMatch) {
              for (const match of arabicMatch) {
                leaks.push({
                  type: 'Arabic in English title',
                  word: match,
                  context: docTitle.substring(0, 80),
                  tag: 'document.title'
                });
              }
            }
          }
        }

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const rawText = node.textContent.trim();
          if (!rawText) continue;

          if (rawText.includes('MISSING_MESSAGE')) {
            leaks.push({
              type: 'Missing Translation Message',
              word: 'MISSING_MESSAGE',
              context: rawText.substring(0, 80),
              tag: node.parentElement ? node.parentElement.tagName.toLowerCase() : 'text'
            });
          }

          if (isExcluded(node)) continue;

          if (isArabic) {
            // Find Latin runs of 3+ letters
            const words = rawText.match(/[A-Za-z]{3,}/g) || [];
            for (const word of words) {
              if (!approved.includes(word.toLowerCase())) {
                leaks.push({
                  type: 'Latin in Arabic',
                  word,
                  context: rawText.substring(0, 80),
                  tag: node.parentElement ? node.parentElement.tagName.toLowerCase() : 'text'
                });
              }
            }
          } else {
            // In English, find Arabic characters outside <bdi>
            const arabicMatch = rawText.match(/[\\u0600-\\u06FF]+/g);
            if (arabicMatch) {
              for (const match of arabicMatch) {
                leaks.push({
                  type: 'Arabic in English',
                  word: match,
                  context: rawText.substring(0, 80),
                  tag: node.parentElement ? node.parentElement.tagName.toLowerCase() : 'text'
                });
              }
            }
        }

        // 3. Check element attributes: aria-label, title, placeholder, alt
        const targetAttrs = ['aria-label', 'title', 'placeholder', 'alt'];
        const elements = document.body.querySelectorAll('*');
        for (const el of elements) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg' || tag === 'code' || tag === 'pre') continue;
          if (isExcluded(el)) continue;

          for (const attr of targetAttrs) {
            const val = el.getAttribute(attr);
            if (!val) continue;
            const rawVal = val.trim();
            if (!rawVal) continue;

            if (rawVal.includes('MISSING_MESSAGE')) {
              leaks.push({
                type: 'Missing Translation Message in ' + attr,
                word: 'MISSING_MESSAGE',
                context: rawVal.substring(0, 80),
                tag: tag + '[' + attr + ']'
              });
            }

            if (isArabic) {
              const words = rawVal.match(/[A-Za-z]{3,}/g) || [];
              for (const word of words) {
                if (!approved.includes(word.toLowerCase())) {
                  leaks.push({
                    type: 'Latin in Arabic [' + attr + ']',
                    word,
                    context: rawVal.substring(0, 80),
                    tag: tag + '[' + attr + ']'
                  });
                }
              }
            } else {
              const arabicMatch = rawVal.match(/[\\u0600-\\u06FF]+/g);
              if (arabicMatch) {
                for (const match of arabicMatch) {
                  leaks.push({
                    type: 'Arabic in English [' + attr + ']',
                    word: match,
                    context: rawVal.substring(0, 80),
                    tag: tag + '[' + attr + ']'
                  });
                }
              }
            }
          }
        }
        return leaks;
      })()
    `,
  });

  return evalResult.result?.value || [];
}

async function main() {
  console.log('LeadForge Egypt — Scanning Latin & Arabic Leaks across all shipped routes...');

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
  if (!sessionMatch) {
    throw new Error('Session cookie not found');
  }
  const sessionToken = sessionMatch[1];

  // 2. Launch Edge headless on dynamic debug port
  const port = 9420 + Math.floor(Math.random() * 50);
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
      '/my-leads',
      '/subscription',
      '/settings',
      '/onboarding',
      '/dashboard/analytics',
    ];
    const allLeaks = [];

    // Scan public routes first (unauthenticated so /login and /register render their forms)
    for (const route of publicRoutes) {
      console.log(`Scanning public route ${route} in Arabic (ar)...`);
      const arLeaks = await scanRoute(ws, route, 'ar');
      arLeaks.forEach((l) => allLeaks.push({ route, locale: 'ar', ...l }));

      console.log(`Scanning public route ${route} in English (en)...`);
      const enLeaks = await scanRoute(ws, route, 'en');
      enLeaks.forEach((l) => allLeaks.push({ route, locale: 'en', ...l }));
    }

    // Set session cookie for authenticated routes
    await sendCdpCommand(ws, 'Network.setCookie', {
      name: 'leadforge_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
    });

    for (const route of authRoutes) {
      console.log(`Scanning authenticated route ${route} in Arabic (ar)...`);
      const arLeaks = await scanRoute(ws, route, 'ar');
      arLeaks.forEach((l) => allLeaks.push({ route, locale: 'ar', ...l }));

      console.log(`Scanning authenticated route ${route} in English (en)...`);
      const enLeaks = await scanRoute(ws, route, 'en');
      enLeaks.forEach((l) => allLeaks.push({ route, locale: 'en', ...l }));
    }

    ws.close();

    const allScannedRoutes = [...publicRoutes, ...authRoutes];

    // Generate docs/i18n/LATIN_LEAKS.md
    let md = '# LeadForge Egypt — Multi-Route Bilingual Script & Locale Audit\n\n';
    md += `> **Audit Date:** ${new Date().toISOString()}\n`;
    md += `> **Target Routes (${allScannedRoutes.length}):** ${allScannedRoutes.map((r) => `\`${r}\``).join(', ')}\n`;
    md += `> **Locales Verified:** Arabic (\`lang="ar" dir="rtl"\`) & English (\`lang="en" dir="ltr"\`)\n`;
    md += `> **Total Leaks Found:** ${allLeaks.length}\n\n`;

    if (allLeaks.length === 0) {
      md += '## Status: PASSED (Zero Leaks Across All Shipped Routes)\n\n';
      md += '- **HTML Attributes:** Verified `lang="ar" dir="rtl"` in Arabic and `lang="en" dir="ltr"` in English across all routes.\n';
      md += '- **Arabic UI Chrome:** 0 unauthorized Latin words outside `<bdi>`, `.ltr-iso`, `code`, or allowlist.\n';
      md += '- **English UI Chrome:** 0 Arabic character runs outside `<bdi>` / `[dir="auto"]` user data wrappers.\n';
    } else {
      md += '## Status: VIOLATIONS DETECTED\n\n';
      md += '| Route | Locale | Type | Leak | Context | Tag |\n';
      md += '|---|---|---|---|---|---|\n';
      for (const leak of allLeaks) {
        md += `| ${leak.route} | ${leak.locale} | ${leak.type} | \`${leak.word}\` | \`${leak.context}\` | \`<${leak.tag}>\` |\n`;
      }
    }

    fs.writeFileSync(OUTPUT_FILE, md);
    console.log(`Audit written to ${OUTPUT_FILE}`);
    console.log(`Total Leaks Found: ${allLeaks.length}`);

    if (allLeaks.length > 0) {
      process.exit(1);
    }
  } finally {
    edgeProc.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

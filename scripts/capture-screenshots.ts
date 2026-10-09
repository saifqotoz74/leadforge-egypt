import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { signSessionToken } from '../src/lib/auth';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-screenshots-' + Date.now());
const OUTPUT_DIR = path.join(process.cwd(), 'screenshots');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCdpCommand(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP command ${method} timed out after 10000ms`));
    }, 10000);
    const handler = (event: MessageEvent) => {
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
        // ignore other messages
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Prepare session and fetch target lead from local API
  let leadId = 'cmv0sxgyt003xtxgkibcel3eg';
  try {
    const leadsRes = await fetch('http://localhost:3000/api/leads');
    if (leadsRes.ok) {
      const data = await leadsRes.json();
      if (data.leads && data.leads.length > 0) {
        leadId = data.leads[0].id;
      }
    }
  } catch (err) {
    console.log('Using default leadId:', leadId);
  }

  const token = await signSessionToken({
    userId: 'dev_user_01',
    email: 'developer@leadforge.eg',
    name: 'أحمد محمود',
    role: 'DEVELOPER',
  });

  console.log(`Prepared session for developer@leadforge.eg`);
  console.log(`Target lead ID: ${leadId}`);

  // 2. Spawn headless Edge with remote debugging
  const port = 9222;
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  console.log('Spawned headless Edge on port', port);

  // Wait for Edge CDP to be ready
  let targetWsUrl = '';
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const data = await res.json();
        targetWsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // wait
    }
    await sleep(300);
  }

  if (!targetWsUrl) {
    edgeProc.kill();
    throw new Error('Failed to connect to Edge CDP');
  }

  console.log('Connected to browser CDP:', targetWsUrl);

  // Create a new target page
  const newTargetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const pageWsUrl = targetInfo.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  // Enable necessary CDP domains
  await sendCdpCommand(ws, 'Page.enable');
  await sendCdpCommand(ws, 'Network.enable');

  // Set auth cookie
  await sendCdpCommand(ws, 'Network.setCookie', {
    name: 'leadforge_session',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
  });

  console.log('Injected leadforge_session cookie.');

  const pages = [
    { name: 'leads', path: '/leads' },
    { name: 'lead_detail', path: `/leads/${leadId}` },
    { name: 'dashboard', path: '/dashboard' },
    { name: 'credits', path: '/subscription' },
    { name: 'pipeline', path: '/my-leads' },
  ];

  const viewports = [
    { label: 'desktop_1440', width: 1440, height: 900, isMobile: false },
    { label: 'laptop_1024', width: 1024, height: 768, isMobile: false },
    { label: 'tablet_768', width: 768, height: 1024, isMobile: false },
    { label: 'mobile_390', width: 390, height: 844, isMobile: true },
  ];

  const visualAuditResults: Record<string, { noHorizontalScroll: boolean; primaryButtonCount: number }> = {};

  for (const page of pages) {
    console.log(`Navigating to ${page.name} (${page.path})...`);
    await sendCdpCommand(ws, 'Page.navigate', { url: `http://localhost:3000${page.path}` });
    await sleep(2000);

    for (const vp of viewports) {
      console.log(`Capturing ${page.name} at ${vp.label}...`);

      // Set viewport
      await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });

      await sleep(400);

      // Evaluate visual invariants: horizontal scroll and primary buttons
      const evalRes = await sendCdpCommand(ws, 'Runtime.evaluate', {
        expression: `({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          primaryButtons: document.querySelectorAll('button[class*="bg-brand"]').length
        })`,
        returnByValue: true,
      });

      const metrics = evalRes.result?.value;
      const key = `${page.name}_${vp.label}`;
      visualAuditResults[key] = {
        noHorizontalScroll: !metrics?.hasHorizontalScroll,
        primaryButtonCount: metrics?.primaryButtons || 0,
      };

      console.log(`Audit for ${key}: scrollWidth=${metrics?.scrollWidth}, clientWidth=${metrics?.clientWidth}, hasScroll=${metrics?.hasHorizontalScroll}, primaryButtons=${metrics?.primaryButtons}`);

      // Capture screenshot
      const result = await sendCdpCommand(ws, 'Page.captureScreenshot', {
        format: 'png',
      });

      const filename = `${page.name}_${vp.label}.png`;
      const filePath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
      console.log(`Saved screenshot to ${filename} (${fs.statSync(filePath).size} bytes)`);
    }
  }

  // Save audit results json
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'visual-audit-results.json'),
    JSON.stringify(visualAuditResults, null, 2)
  );

  // Cleanup
  ws.close();
  edgeProc.kill();
  console.log('All screenshots and visual assertions captured successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});

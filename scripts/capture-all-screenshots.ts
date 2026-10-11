import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { signSessionToken } from '../src/lib/auth';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TEMP_PROFILE = path.join(process.env.TEMP || 'C:\\Temp', 'edge-cdp-screenshots-all-' + Date.now());
const OUTPUT_DIR = path.join(process.cwd(), 'screenshots');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendCdpCommand(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP command ${method} timed out after 45000ms`));
    }, 45000);
    const handler = (event: MessageEvent) => {
      try {
        let raw = '';
        if (typeof event.data === 'string') {
          raw = event.data;
        } else if (Buffer.isBuffer(event.data)) {
          raw = event.data.toString('utf8');
        } else if (event.data instanceof ArrayBuffer) {
          raw = Buffer.from(event.data).toString('utf8');
        } else {
          raw = Buffer.from(event.data as any).toString('utf8');
        }
        const msg = JSON.parse(raw);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // ignore
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

  const devToken = await signSessionToken({
    userId: 'dev_user_01',
    email: 'developer@leadforge.eg',
    name: 'أحمد محمود',
    role: 'DEVELOPER',
  });

  const adminToken = await signSessionToken({
    userId: 'admin_user_01',
    email: 'admin@leadforge.eg',
    name: 'مدير النظام',
    role: 'ADMIN',
  });

  console.log('Prepared session tokens.');

  const port = 9224;
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_PROFILE}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

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
      // retry
    }
    await sleep(300);
  }

  if (!targetWsUrl) {
    edgeProc.kill();
    throw new Error('Failed to connect to Edge CDP');
  }

  const newTargetRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const targetInfo = await newTargetRes.json();
  const pageWsUrl = targetInfo.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  await sendCdpCommand(ws, 'Page.enable');
  await sendCdpCommand(ws, 'Network.enable');

  const pages = [
    // Public & Auth
    { name: 'landing', path: '/', role: 'PUBLIC' },
    { name: 'pricing', path: '/pricing', role: 'PUBLIC' },
    { name: 'login', path: '/login', role: 'PUBLIC' },
    { name: 'register', path: '/register', role: 'PUBLIC' },
    { name: 'onboarding', path: '/onboarding', role: 'DEV' },
    // Developer Pages
    { name: 'dashboard', path: '/dashboard', role: 'DEV' },
    { name: 'dashboard_analytics', path: '/dashboard/analytics', role: 'DEV' },
    { name: 'leads', path: '/leads', role: 'DEV' },
    { name: 'my_leads', path: '/my-leads', role: 'DEV' },
    { name: 'subscription', path: '/subscription', role: 'DEV' },
    { name: 'settings', path: '/settings', role: 'DEV' },
    // Admin Hub
    { name: 'admin_overview', path: '/admin', role: 'ADMIN' },
    { name: 'admin_duplicates', path: '/admin/duplicates', role: 'ADMIN' },
    { name: 'admin_quality', path: '/admin/quality', role: 'ADMIN' },
    { name: 'admin_rules', path: '/admin/rules', role: 'ADMIN' },
    { name: 'admin_sources', path: '/admin/sources', role: 'ADMIN' },
    { name: 'admin_matching', path: '/admin/matching', role: 'ADMIN' },
    { name: 'admin_analytics', path: '/admin/analytics', role: 'ADMIN' },
    { name: 'admin_reports', path: '/admin/reports', role: 'ADMIN' },
    { name: 'admin_users', path: '/admin/users', role: 'ADMIN' },
    { name: 'admin_leads', path: '/admin/leads', role: 'ADMIN' },
    { name: 'admin_plans', path: '/admin/plans', role: 'ADMIN' },
    // Style Guide
    { name: 'design_system', path: '/design-system', role: 'PUBLIC' },
  ];

  const viewports = [
    { label: 'desktop_1440', width: 1440, height: 900, isMobile: false },
    { label: 'mobile_390', width: 390, height: 844, isMobile: true },
  ];

  const force = process.argv.includes('--force');
  let currentRole = '';

  for (const page of pages) {
    const desktopFile = path.join(OUTPUT_DIR, `${page.name}_desktop_1440.png`);
    const mobileFile = path.join(OUTPUT_DIR, `${page.name}_mobile_390.png`);
    if (!force && fs.existsSync(desktopFile) && fs.existsSync(mobileFile) && fs.statSync(desktopFile).size > 1000 && fs.statSync(mobileFile).size > 1000) {
      console.log(`Skipping ${page.name}, already captured.`);
      continue;
    }

    console.log(`Pre-warming ${page.name} (${page.role}) via HTTP...`);
    try {
      const cookieHeader = page.role === 'ADMIN' ? `leadforge_session=${adminToken}` : page.role === 'DEV' ? `leadforge_session=${devToken}` : '';
      await fetch(`http://localhost:3000${page.path}`, {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
      });
    } catch {
      // ignore
    }

    console.log(`Setting session for ${page.name} (${page.role})...`);
    if (page.role !== currentRole) {
      currentRole = page.role;
      if (page.role === 'ADMIN') {
        await sendCdpCommand(ws, 'Network.setCookie', {
          name: 'leadforge_session',
          value: adminToken,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
        });
      } else if (page.role === 'DEV') {
        await sendCdpCommand(ws, 'Network.setCookie', {
          name: 'leadforge_session',
          value: devToken,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
        });
      } else {
        await sendCdpCommand(ws, 'Network.deleteCookies', {
          name: 'leadforge_session',
          domain: 'localhost',
          path: '/',
        });
      }
    }

    console.log(`Navigating to http://localhost:3000${page.path}...`);
    await sendCdpCommand(ws, 'Page.navigate', { url: `http://localhost:3000${page.path}` });
    await sleep(3500);

    for (const vp of viewports) {
      console.log(`Capturing ${page.name} at ${vp.label}...`);
      await sendCdpCommand(ws, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });

      await sleep(500);

      const result = await sendCdpCommand(ws, 'Page.captureScreenshot', {
        format: 'png',
      });

      const filename = `${page.name}_${vp.label}.png`;
      const filePath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
      console.log(`Saved screenshot ${filename} (${fs.statSync(filePath).size} bytes)`);
    }
  }

  ws.close();
  edgeProc.kill();
  console.log('Finished capturing all screenshots successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Screenshot run failed:', err);
  process.exit(1);
});
